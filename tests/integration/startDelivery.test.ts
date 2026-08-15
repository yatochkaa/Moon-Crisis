/**
 * Integration test for the delivery lifecycle (Game Design v2 vertical slice).
 *
 * It runs the real application services against in-memory repositories with a
 * transaction boundary, an injected random source, injected ids and an injected
 * clock. No Prisma, no HTTP, no timers: fully deterministic. A delivery is now
 * started as "in_transit" and later resolved once by completeDelivery.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { AppError } from '../../src/application/errors'
import { completeDelivery } from '../../src/application/services/completeDelivery'
import { endDay } from '../../src/application/services/endDay'
import { previewDelivery } from '../../src/application/services/previewDelivery'
import { startDelivery } from '../../src/application/services/startDelivery'
import type {
  GameRepositories,
  ServiceDeps,
  UnitOfWork,
} from '../../src/application/ports'
import {
  createFixedClock,
  createFixedRolls,
  createSequentialIds,
  createTestStore,
  type StoreState,
  type TestStore,
} from '../support/inMemoryRepositories'
import {
  makeOrder,
  makePlain,
  makeRover,
  makeSession,
} from '../support/fixtures'

function initialState(): StoreState {
  return {
    session: makeSession({ balanceCredits: 500, earnedCredits: 0 }),
    orders: [
      makeOrder({ id: 'order-light', weight: 10, reward: 300 }),
      makeOrder({ id: 'order-heavy', weight: 90, reward: 1200 }),
      makeOrder({ id: 'order-expiring', deadlineDay: 1, reward: 200 }),
    ],
    rovers: [
      makeRover({ id: 'rover-a', name: 'Rover-A', capacity: 40, batteryCharge: 100 }),
      makeRover({ id: 'rover-b', name: 'Rover-B', capacity: 40, batteryCharge: 100 }),
    ],
    locations: [makePlain()],
    deliveries: [],
    events: [],
  }
}

function makeDeps(store: TestStore, rolls: readonly number[]): ServiceDeps {
  return {
    uow: store.uow,
    random: createFixedRolls(rolls),
    ids: createSequentialIds(),
    clock: createFixedClock(),
  }
}

/**
 * Wraps the store transaction so that updateOrderStatus fails after the battery
 * and rover-status writes already happened. This is the closest deterministic
 * equivalent of an infrastructure error in the middle of the real transaction.
 */
function makeFailingStartDeps(store: TestStore): ServiceDeps {
  const failingUow: UnitOfWork = {
    repositories: store.uow.repositories,
    transaction<T>(
      run: (repositories: GameRepositories) => Promise<T>,
    ): Promise<T> {
      return store.uow.transaction((repositories) =>
        run({
          ...repositories,
          async updateOrderStatus(): Promise<never> {
            throw new Error('infrastructure failure inside the transaction')
          },
        }),
      )
    },
  }

  return {
    uow: failingUow,
    random: createFixedRolls([0.99]),
    ids: createSequentialIds(),
    clock: createFixedClock(),
  }
}

let store: TestStore

beforeEach(() => {
  store = createTestStore(initialState())
})

describe('startDelivery', () => {
  it('requirements 1 and 8: starts an in-transit delivery, charges battery once, pays nothing yet', async () => {
    const deps = makeDeps(store, [0.99])

    const active = await startDelivery(deps, {
      orderId: 'order-light',
      roverId: 'rover-a',
      idempotencyKey: 'key-1',
    })

    expect(store.state.deliveries).toHaveLength(1)
    expect(store.state.deliveries[0]?.status).toBe('in_transit')
    expect(store.state.deliveries[0]?.result).toBeNull()
    expect(store.state.rovers[0]?.status).toBe('delivering')
    expect(store.state.rovers[0]?.batteryCharge).toBeLessThan(100)
    expect(store.state.orders[0]?.status).toBe('in_progress')
    // No reward is granted at departure.
    expect(store.state.session.balanceCredits).toBe(500)
    expect(store.state.session.earnedCredits).toBe(0)
    // The round-trip window is derived from the calculated duration and the
    // rover speed level, not a fixed constant: order-light on the plain zone is
    // ceil(20 / (5 * 1)) = 4 h, so simulationSeconds =
    // clamp(ceil(4 * 4 * 0.8 ** 0), 8, 40) = 16 s (base -> station -> base).
    const started = Date.parse(active.startedAt)
    const completes = Date.parse(active.completesAt)
    expect(completes - started).toBe(16_000)
  })

  it('requirement 8: two idle rovers run deliveries in parallel', async () => {
    const deps = makeDeps(store, [0.99])

    const first = await startDelivery(deps, {
      orderId: 'order-light',
      roverId: 'rover-a',
      idempotencyKey: 'key-parallel-a',
    })
    const second = await startDelivery(deps, {
      orderId: 'order-expiring',
      roverId: 'rover-b',
      idempotencyKey: 'key-parallel-b',
    })

    expect(first.deliveryId).not.toBe(second.deliveryId)

    const active = await store.uow.repositories.listActiveDeliveries()
    expect(active).toHaveLength(2)
    expect(active.map((delivery) => delivery.roverId).sort()).toEqual([
      'rover-a',
      'rover-b',
    ])
    expect(
      store.state.rovers.every((rover) => rover.status === 'delivering'),
    ).toBe(true)
  })

  it('requirement 2: a busy rover cannot start a second delivery', async () => {
    const deps = makeDeps(store, [0.99])

    await startDelivery(deps, {
      orderId: 'order-light',
      roverId: 'rover-a',
      idempotencyKey: 'key-1',
    })

    await expect(
      startDelivery(deps, {
        orderId: 'order-expiring',
        roverId: 'rover-a',
        idempotencyKey: 'key-2',
      }),
    ).rejects.toBeInstanceOf(AppError)

    expect(store.state.deliveries).toHaveLength(1)
  })

  it('replaying an idempotencyKey does not start a second delivery or charge battery twice', async () => {
    const deps = makeDeps(store, [0.99])
    const input = {
      orderId: 'order-light',
      roverId: 'rover-a',
      idempotencyKey: 'key-repeat',
    }

    const first = await startDelivery(deps, input)
    const chargeAfterFirst = store.state.rovers[0]?.batteryCharge

    const second = await startDelivery(deps, input)

    expect(second.deliveryId).toBe(first.deliveryId)
    expect(store.state.deliveries).toHaveLength(1)
    expect(store.state.rovers[0]?.batteryCharge).toBe(chargeAfterFirst)
  })

  it('rejects an order heavier than the rover and keeps the state untouched', async () => {
    const deps = makeDeps(store, [0.99])

    await expect(
      startDelivery(deps, {
        orderId: 'order-heavy',
        roverId: 'rover-a',
        idempotencyKey: 'key-heavy',
      }),
    ).rejects.toBeInstanceOf(AppError)

    expect(store.state.deliveries).toHaveLength(0)
    expect(store.state.rovers[0]?.batteryCharge).toBe(100)
    expect(store.state.rovers[0]?.status).toBe('idle')
  })

  it('rolls back every write when a step fails inside the transaction', async () => {
    const deps = makeFailingStartDeps(store)

    await expect(
      startDelivery(deps, {
        orderId: 'order-light',
        roverId: 'rover-a',
        idempotencyKey: 'key-rollback',
      }),
    ).rejects.toThrow('infrastructure failure inside the transaction')

    expect(store.state.deliveries).toHaveLength(0)
    expect(store.state.rovers[0]?.batteryCharge).toBe(100)
    expect(store.state.rovers[0]?.status).toBe('idle')
    expect(store.state.orders[0]?.status).toBe('available')
  })

  it('reports the same numbers in preview and in the started delivery', async () => {
    const deps = makeDeps(store, [0.99])

    const preview = await previewDelivery(deps, {
      orderId: 'order-light',
      roverId: 'rover-a',
    })
    const active = await startDelivery(deps, {
      orderId: 'order-light',
      roverId: 'rover-a',
      idempotencyKey: 'key-preview',
    })

    expect(preview.canStart).toBe(true)
    expect(active.batteryCost).toBe(preview.batteryCost)
    expect(active.risk).toBe(preview.risk)
    expect(active.reward).toBe(preview.reward)
  })
})

describe('completeDelivery', () => {
  async function startActive(
    deps: ServiceDeps,
    idempotencyKey = 'key-1',
  ): ReturnType<typeof startDelivery> {
    return startDelivery(deps, {
      orderId: 'order-light',
      roverId: 'rover-a',
      idempotencyKey,
    })
  }

  it('requirements 5, 6, 8 and 9: resolves a success once and pays the reward once', async () => {
    // roll 0.99 is far above the risk threshold -> success (consumed at completion)
    const deps = makeDeps(store, [0.99])
    const active = await startActive(deps)
    const chargeAfterStart = store.state.rovers[0]?.batteryCharge

    const result = await completeDelivery(deps, { deliveryId: active.deliveryId })

    expect(result.result).toBe('success')
    expect(result.creditsAwarded).toBe(300)
    expect(result.previousBalance).toBe(500)
    expect(result.newBalance).toBe(800)
    expect(result.replayed).toBe(false)
    expect(store.state.session.balanceCredits).toBe(800)
    expect(store.state.session.earnedCredits).toBe(300)
    expect(store.state.orders[0]?.status).toBe('completed')
    expect(store.state.rovers[0]?.status).toBe('idle')
    // Battery is not charged a second time at completion.
    expect(store.state.rovers[0]?.batteryCharge).toBe(chargeAfterStart)
    expect(store.state.deliveries[0]?.status).toBe('completed')
    expect(store.state.deliveries[0]?.result).toBe('success')
    expect(store.state.events.map((event) => event.type)).toContain(
      'delivery_success',
    )

    // Completing again (e.g. after a refresh) must not pay a second time.
    const replay = await completeDelivery(deps, {
      deliveryId: active.deliveryId,
    })
    expect(replay.replayed).toBe(true)
    expect(replay.creditsAwarded).toBe(0)
    expect(store.state.session.balanceCredits).toBe(800)
    expect(store.state.deliveries).toHaveLength(1)
  })

  it('requirement 7: resolves a failure without paying', async () => {
    // roll 0.0 is always below the risk threshold -> failure
    const deps = makeDeps(store, [0])
    const active = await startActive(deps)

    const result = await completeDelivery(deps, { deliveryId: active.deliveryId })

    expect(result.result).toBe('failed')
    expect(result.creditsAwarded).toBe(0)
    expect(store.state.session.balanceCredits).toBe(500)
    expect(store.state.session.rating).toBeLessThan(100)
    expect(store.state.orders[0]?.status).toBe('failed')
    expect(store.state.rovers[0]?.status).toBe('idle')
    expect(store.state.deliveries[0]?.status).toBe('failed')
  })
})

describe('parallel deliveries', () => {
  function parallelState(): StoreState {
    return {
      session: makeSession({
        balanceCredits: 500,
        earnedCredits: 0,
        rating: 80,
      }),
      orders: [
        makeOrder({
          id: 'order-a',
          title: 'Order A',
          weight: 10,
          reward: 300,
          baseRisk: 5,
          urgency: 'normal',
        }),
        makeOrder({
          id: 'order-b',
          title: 'Order B',
          weight: 10,
          reward: 600,
          baseRisk: 15,
          urgency: 'urgent',
        }),
        makeOrder({
          id: 'order-c',
          title: 'Order C',
          weight: 10,
          reward: 900,
          baseRisk: 25,
          urgency: 'critical',
        }),
      ],
      rovers: [
        makeRover({ id: 'rover-a', name: 'Rover-A', capacity: 40, batteryCharge: 100 }),
        makeRover({ id: 'rover-b', name: 'Rover-B', capacity: 40, batteryCharge: 100 }),
        makeRover({ id: 'rover-c', name: 'Rover-C', capacity: 40, batteryCharge: 100 }),
      ],
      locations: [makePlain()],
      deliveries: [],
      events: [],
    }
  }

  it('three simultaneous deliveries return three distinct results keyed by deliveryId', async () => {
    const parallelStore = createTestStore(parallelState())
    const deps = makeDeps(parallelStore, [0.99])

    const startedA = await startDelivery(deps, {
      orderId: 'order-a',
      roverId: 'rover-a',
      idempotencyKey: 'p-a',
    })
    const startedB = await startDelivery(deps, {
      orderId: 'order-b',
      roverId: 'rover-b',
      idempotencyKey: 'p-b',
    })
    const startedC = await startDelivery(deps, {
      orderId: 'order-c',
      roverId: 'rover-c',
      idempotencyKey: 'p-c',
    })

    // Complete them one after another, as the client does when several
    // countdowns finish at once.
    const resultA = await completeDelivery(deps, {
      deliveryId: startedA.deliveryId,
    })
    const resultB = await completeDelivery(deps, {
      deliveryId: startedB.deliveryId,
    })
    const resultC = await completeDelivery(deps, {
      deliveryId: startedC.deliveryId,
    })

    const results = [resultA, resultB, resultC]
    const byId = new Map(results.map((result) => [result.deliveryId, result]))

    // Three deliveries => three separate results, none overwriting another.
    expect(byId.size).toBe(3)

    // Each result carries its OWN rover, order, risk and reward (no mixing).
    expect(byId.get(startedA.deliveryId)?.roverName).toBe('Rover-A')
    expect(byId.get(startedA.deliveryId)?.orderTitle).toBe('Order A')
    expect(byId.get(startedA.deliveryId)?.risk).toBe(startedA.risk)
    expect(byId.get(startedA.deliveryId)?.reward).toBe(startedA.reward)

    expect(byId.get(startedB.deliveryId)?.roverName).toBe('Rover-B')
    expect(byId.get(startedB.deliveryId)?.orderTitle).toBe('Order B')
    expect(byId.get(startedB.deliveryId)?.risk).toBe(startedB.risk)
    expect(byId.get(startedB.deliveryId)?.reward).toBe(startedB.reward)

    expect(byId.get(startedC.deliveryId)?.roverName).toBe('Rover-C')
    expect(byId.get(startedC.deliveryId)?.orderTitle).toBe('Order C')
    expect(byId.get(startedC.deliveryId)?.risk).toBe(startedC.risk)
    expect(byId.get(startedC.deliveryId)?.reward).toBe(startedC.reward)

    // Risk and reward sets are all distinct: the results did not blend.
    expect(new Set(results.map((result) => result.risk)).size).toBe(3)
    expect(new Set(results.map((result) => result.reward)).size).toBe(3)

    // Rating deltas are applied exactly once, per urgency (roll 0.99 => success).
    expect(byId.get(startedA.deliveryId)?.ratingDelta).toBe(1) // normal
    expect(byId.get(startedB.deliveryId)?.ratingDelta).toBe(2) // urgent
    expect(byId.get(startedC.deliveryId)?.ratingDelta).toBe(3) // critical
  })
})

describe('endDay', () => {
  it('requirement 13: expires overdue orders and advances the day', async () => {
    const deps = makeDeps(store, [0.99])

    // Fewer than the required operations were run today, so ending the day is
    // an early end and needs explicit confirmation (it costs rating).
    const result = await endDay(deps, { confirmEarlyEnd: true })

    expect(result.session.currentDay).toBe(2)
    expect(result.expiredOrderIds).toContain('order-expiring')
    expect(
      store.state.orders.find((order) => order.id === 'order-expiring')?.status,
    ).toBe('expired')
    expect(store.state.events.map((event) => event.type)).toContain('day_ended')
  })

  it('emits one order_expired event per expiring order; two critical cost 20, challenge costs nothing', async () => {
    const expiryStore = createTestStore({
      session: makeSession({ rating: 100, operationsToday: 3 }),
      orders: [
        makeOrder({ id: 'crit-1', title: 'Crit 1', urgency: 'critical', deadlineDay: 1 }),
        makeOrder({ id: 'crit-2', title: 'Crit 2', urgency: 'critical', deadlineDay: 1 }),
        makeOrder({
          id: 'chal',
          title: 'Chal',
          urgency: 'normal',
          deadlineDay: 1,
          isChallenge: true,
        }),
      ],
      rovers: [makeRover({ id: 'rover-a', name: 'Rover-A' })],
      locations: [makePlain()],
      deliveries: [],
      events: [],
    })
    const deps = makeDeps(expiryStore, [0.99])

    // operationsToday === MAX (3) => a normal end, no early-end penalty.
    const result = await endDay(deps, {})

    // Two critical => -20; the challenge order never lowers the rating.
    expect(result.session.rating).toBe(80)

    // Exactly two separate order_expired GameEvents (one per critical order);
    // the challenge order produces none.
    const expiredEvents = expiryStore.state.events.filter(
      (event) => event.type === 'order_expired',
    )
    expect(expiredEvents).toHaveLength(2)

    // The challenge simply expires (not failed) without a penalty event.
    expect(
      expiryStore.state.orders.find((order) => order.id === 'chal')?.status,
    ).toBe('expired')
  })
})
