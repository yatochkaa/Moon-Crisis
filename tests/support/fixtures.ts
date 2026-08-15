/**
 * Deterministic fixtures for unit and integration tests.
 *
 * Every value is fixed on purpose: no randomness, no current time, no database.
 */

import type {
  GameSession,
  MoonLocation,
  Order,
  Rover,
} from '../../src/domain/types'

export function makeSession(overrides: Partial<GameSession> = {}): GameSession {
  return {
    id: 'session-test',
    currentDay: 1,
    maxDays: 7,
    balanceCredits: 500,
    earnedCredits: 0,
    targetCredits: 5000,
    rating: 100,
    minimumRating: 40,
    operationsToday: 0,
    status: 'active',
    ...overrides,
  }
}

/** Flat plain zone: no modifiers, easy to reason about. */
export function makePlain(overrides: Partial<MoonLocation> = {}): MoonLocation {
  return {
    id: 'loc-plain',
    name: 'Plain',
    x: 100,
    y: 100,
    distance: 20,
    zoneType: 'plain',
    batteryModifier: 1,
    speedModifier: 1,
    riskBonus: 0,
    ...overrides,
  }
}

export function makeCrater(overrides: Partial<MoonLocation> = {}): MoonLocation {
  return makePlain({
    id: 'loc-crater',
    name: 'Crater',
    zoneType: 'crater',
    batteryModifier: 1.3,
    speedModifier: 0.8,
    riskBonus: 8,
    ...overrides,
  })
}

export function makeDark(overrides: Partial<MoonLocation> = {}): MoonLocation {
  return makePlain({
    id: 'loc-dark',
    name: 'Dark',
    zoneType: 'dark',
    batteryModifier: 1.6,
    speedModifier: 0.6,
    riskBonus: 20,
    ...overrides,
  })
}

export function makeRover(overrides: Partial<Rover> = {}): Rover {
  return {
    id: 'rover-test',
    name: 'Test-01',
    batteryCharge: 100,
    batteryCapacity: 100,
    capacity: 40,
    speed: 5,
    efficiency: 1,
    capacityLevel: 0,
    speedLevel: 0,
    efficiencyLevel: 0,
    batteryLevel: 0,
    safetyLevel: 0,
    status: 'idle',
    ...overrides,
  }
}

export function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-test',
    title: 'Test order',
    description: 'Test order description',
    locationId: 'loc-plain',
    weight: 10,
    reward: 300,
    urgency: 'urgent',
    baseRisk: 10,
    deadlineDay: 5,
    isChallenge: false,
    status: 'available',
    ...overrides,
  }
}
