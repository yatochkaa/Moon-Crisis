/**
 * Integration test for the full 1 → 12 day cycle.
 *
 * Regression for the P2002 crash on day rollover: the periodic "energy" guest
 * used to reuse one fixed id, so its second appearance collided with the
 * expired row it had left behind (`Unique constraint failed on Order.id`).
 *
 * It runs the real `endDay` application service against in-memory repositories
 * whose `createOrders` now rejects duplicate ids (mirroring the SQLite unique
 * constraint), so an id collision would surface here as a thrown error.
 *
 * It also proves the assignment's core rule: an impossible contract is present
 * on every day, and the energy guest appears from day 4 (whenever the seeded
 * count is 2) and leaves the board the next day — regardless of board fullness.
 */

import { describe, expect, it } from 'vitest'
import { endDay } from '../../src/application/services/endDay'
import { ORDERS_PER_DAY, REQUIRED_OPERATIONS_PER_DAY } from '../../src/domain/constants'
import {
  CHALLENGE_ENERGY_ID,
  IMPOSSIBLE_RANDOM_START_DAY,
  challengeEnergyId,
  challengeOverloadId,
  generateDailyOrders,
  impossibleChallengeCount,
} from '../../src/domain/orderGeneration'
import type { OrderStatus } from '../../src/domain/types'
import type { ServiceDeps } from '../../src/application/ports'
import {
  createFixedClock,
  createFixedRolls,
  createSequentialIds,
  createTestStore,
  type StoreState,
  type TestStore,
} from '../support/inMemoryRepositories'
import { makeSession } from '../support/fixtures'
import { SEED_LOCATIONS, SEED_ROVERS } from '../../prisma/seedData'

const SEED = 'session-cycle'
const MAX_DAYS = 12

type OrderSnapshot = { id: string; status: OrderStatus; isChallenge: boolean }

function snapshot(store: TestStore): OrderSnapshot[] {
  return store.state.orders.map((order) => ({
    id: order.id,
    status: order.status,
    isChallenge: order.isChallenge,
  }))
}

function initialState(): StoreState {
  const session = makeSession({
    id: SEED,
    currentDay: 1,
    maxDays: MAX_DAYS,
    // A minimum rating of 0 can never be breached (rating is clamped to >= 0),
    // so the run survives every day and we exercise all 12 generations.
    minimumRating: 0,
    rating: 100,
  })
  const day1Orders = generateDailyOrders({
    seed: session.id,
    day: 1,
    count: ORDERS_PER_DAY,
    locations: SEED_LOCATIONS,
    rovers: SEED_ROVERS,
  })
  return {
    session,
    orders: day1Orders,
    rovers: SEED_ROVERS.map((rover) => ({ ...rover })),
    locations: SEED_LOCATIONS.map((location) => ({ ...location })),
    deliveries: [],
    events: [],
  }
}

function makeDeps(store: TestStore): ServiceDeps {
  return {
    uow: store.uow,
    random: createFixedRolls([0.99]),
    ids: createSequentialIds('event'),
    clock: createFixedClock(),
  }
}

describe('full 1 → 12 day cycle', () => {
  it('never collides on order ids and cycles the energy guest daily', async () => {
    const store = createTestStore(initialState())
    const deps = makeDeps(store)

    const boards = new Map<number, OrderSnapshot[]>()
    boards.set(1, snapshot(store))

    // Advancing day by day would throw inside createOrders on any id collision,
    // so completing the loop is itself the regression assertion for P2002.
    while (store.state.session.currentDay < MAX_DAYS) {
      // Meet the required operations so the day is not an early end: no
      // confirmation prompt and no rating penalty, keeping the session alive.
      store.state.session = {
        ...store.state.session,
        operationsToday: REQUIRED_OPERATIONS_PER_DAY,
      }
      await endDay(deps)
      boards.set(store.state.session.currentDay, snapshot(store))
    }

    expect(store.state.session.currentDay).toBe(MAX_DAYS)
    expect(store.state.session.status).toBe('active')

    // Every id is unique across the whole run.
    const ids = store.state.orders.map((order) => order.id)
    expect(new Set(ids).size).toBe(ids.length)

    // The overload contract carries the impossible scenario and stays available
    // on every single day — the board is never empty of it. Its id is day-scoped.
    for (let day = 1; day <= MAX_DAYS; day += 1) {
      const overload = boards
        .get(day)
        ?.find((o) => o.id === challengeOverloadId(day))
      expect(overload, `overload contract on day ${day}`).toBeDefined()
      expect(overload?.status).toBe('available')
    }

    // The energy guest appears from day 4 whenever the seeded count is 2. On the
    // days it appears it is available; the following day it has expired. Its id
    // is day-scoped, so a re-appearance never collides with an expired row.
    const expectedEnergyDays: number[] = []
    for (let day = IMPOSSIBLE_RANDOM_START_DAY; day <= MAX_DAYS; day += 1) {
      const id = challengeEnergyId(day)
      const onDay = boards.get(day)?.find((o) => o.id === id)
      if (impossibleChallengeCount(SEED, day) !== 2) {
        expect(onDay, `no energy guest on day ${day}`).toBeUndefined()
        continue
      }
      expectedEnergyDays.push(day)
      expect(onDay, `energy guest present on day ${day}`).toBeDefined()
      expect(onDay?.status).toBe('available')
      expect(onDay?.isChallenge).toBe(true)

      const nextDay = day + 1
      if (nextDay <= MAX_DAYS) {
        const afterwards = boards.get(nextDay)?.find((o) => o.id === id)
        expect(afterwards, `energy guest recorded on day ${nextDay}`).toBeDefined()
        expect(afterwards?.status).toBe('expired')
      }
    }

    // Exactly one energy row per appearance — the day-scoped id is never reused.
    const energyIds = ids.filter((id) => id.startsWith(CHALLENGE_ENERGY_ID))
    expect([...energyIds].sort()).toEqual(
      expectedEnergyDays.map((day) => challengeEnergyId(day)).sort(),
    )
  })
})
