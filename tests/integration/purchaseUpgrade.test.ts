/**
 * Integration test for the rover-upgrade purchase (Engineering Bay slice).
 *
 * Runs the real purchaseUpgrade + getGameState services against in-memory
 * repositories with the real transaction boundary and injected ids/clock/random.
 * Verifies the money is charged once from balanceCredits (never earnedCredits),
 * only the chosen level is raised, a rover_upgraded event is written, and the
 * challenge order becomes available once the purchase makes it feasible.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { AppError } from '../../src/application/errors'
import { purchaseUpgrade } from '../../src/application/services/purchaseUpgrade'
import type { ServiceDeps } from '../../src/application/ports'
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
    session: makeSession({
      currentDay: 2,
      balanceCredits: 2000,
      earnedCredits: 300,
    }),
    orders: [
      makeOrder({
        id: 'order-challenge',
        weight: 70,
        reward: 1500,
        isChallenge: true,
        locationId: 'loc-plain',
      }),
    ],
    rovers: [
      makeRover({ id: 'rover-scout-01', name: 'Scout-01', capacity: 20 }),
      makeRover({ id: 'rover-sprint-03', name: 'Sprint-03', capacity: 35 }),
      makeRover({ id: 'rover-cargo-02', name: 'Карго-02', capacity: 60 }),
    ],
    locations: [makePlain()],
    deliveries: [],
    events: [],
  }
}

function makeDeps(store: TestStore): ServiceDeps {
  return {
    uow: store.uow,
    random: createFixedRolls([0.5]),
    ids: createSequentialIds(),
    clock: createFixedClock(),
  }
}

describe('purchaseUpgrade', () => {
  let store: TestStore
  let deps: ServiceDeps

  beforeEach(() => {
    store = createTestStore(initialState())
    deps = makeDeps(store)
  })

  it('charges balance once, keeps earnedCredits, raises only the chosen level, logs an event', async () => {
    const result = await purchaseUpgrade(deps, {
      roverId: 'rover-cargo-02',
      upgradeType: 'cargo',
    })

    // Spendable balance drops by exactly the L1 cost; earnings are untouched.
    expect(store.state.session.balanceCredits).toBe(1200)
    expect(store.state.session.earnedCredits).toBe(300)

    const cargo = store.state.rovers.find((r) => r.id === 'rover-cargo-02')
    expect(cargo?.capacityLevel).toBe(1)
    // No other level moved.
    expect(cargo?.batteryLevel).toBe(0)
    expect(cargo?.speedLevel).toBe(0)
    expect(cargo?.efficiencyLevel).toBe(0)
    expect(cargo?.safetyLevel).toBe(0)

    const events = store.state.events.filter((e) => e.type === 'rover_upgraded')
    expect(events).toHaveLength(1)

    // Returned DTO summary reflects the purchase.
    expect(result.cost).toBe(800)
    expect(result.previousStatValue).toBe(60)
    expect(result.newStatValue).toBe(75)
    expect(result.statUnit).toBe('кг')
    expect(result.state.session.balanceCredits).toBe(1200)
  })

  it('rejects a purchase with insufficient funds without charging', async () => {
    store.state.session = { ...store.state.session, balanceCredits: 100 }

    await expect(
      purchaseUpgrade(deps, { roverId: 'rover-cargo-02', upgradeType: 'cargo' }),
    ).rejects.toBeInstanceOf(AppError)

    expect(store.state.session.balanceCredits).toBe(100)
    expect(
      store.state.rovers.find((r) => r.id === 'rover-cargo-02')?.capacityLevel,
    ).toBe(0)
    expect(store.state.events).toHaveLength(0)
  })

  it('rejects upgrading a delivering rover', async () => {
    store.state.rovers = store.state.rovers.map((r) =>
      r.id === 'rover-cargo-02' ? { ...r, status: 'delivering' } : r,
    )

    await expect(
      purchaseUpgrade(deps, { roverId: 'rover-cargo-02', upgradeType: 'cargo' }),
    ).rejects.toBeInstanceOf(AppError)

    expect(store.state.session.balanceCredits).toBe(2000)
  })

  it('recomputes the challenge order to available once the purchase makes it feasible', async () => {
    const state = await purchaseUpgrade(deps, {
      roverId: 'rover-cargo-02',
      upgradeType: 'cargo',
    }).then((r) => r.state)

    const challenge = state.orders.find((o) => o.id === 'order-challenge')
    expect(challenge?.isChallenge).toBe(true)
    // Cargo-02 now carries 75 kg >= 70 kg, so the blocker clears.
    expect(challenge?.challengeReason).toBeNull()
  })
})
