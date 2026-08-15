import { describe, expect, it } from 'vitest'
import {
  CARGO_CAPACITY_PER_LEVEL,
  MAX_OPERATIONS_PER_DAY,
  MAX_RISK_PERCENT,
  MAX_UPGRADE_LEVEL,
  ORDERS_PER_DAY,
  ORDER_LIFETIME_DAYS,
} from '../../src/domain/constants'
import {
  assignSlotLocations,
  calculateOrderReward,
  createSlotRng,
  generateDailyOrders,
  isOrderFeasible,
  unlockedLocationCount,
} from '../../src/domain/orderGeneration'
import { computeRoverStats } from '../../src/domain/roverStats'
import { clamp } from '../../src/domain/math'
import type { Rover } from '../../src/domain/types'
import { SEED_LOCATIONS, SEED_ROVERS } from '../../prisma/seedData'

const SEED = 'session-seed'

function generate(day: number, count = ORDERS_PER_DAY, rovers = SEED_ROVERS) {
  return generateDailyOrders({
    seed: SEED,
    day,
    count,
    locations: SEED_LOCATIONS,
    rovers,
  })
}

function locationById(id: string) {
  const found = SEED_LOCATIONS.find((location) => location.id === id)
  if (found === undefined) throw new Error(`Unknown location ${id}`)
  return found
}

describe('createSlotRng', () => {
  it('is deterministic for the same seed + day + slot and varies otherwise', () => {
    const a = createSlotRng(SEED, 1, 0)
    const b = createSlotRng(SEED, 1, 0)
    const c = createSlotRng(SEED, 1, 1)

    const seqA = [a(), a(), a()]
    const seqB = [b(), b(), b()]
    const seqC = [c(), c(), c()]

    expect(seqA).toEqual(seqB)
    expect(seqA).not.toEqual(seqC)
    for (const value of [...seqA, ...seqC]) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})

describe('generateDailyOrders determinism (req 10)', () => {
  it('produces identical orders when regenerated with the same inputs', () => {
    expect(generate(1)).toEqual(generate(1))
    expect(generate(4)).toEqual(generate(4))
  })

  it('produces different orders for a different day', () => {
    expect(generate(1)).not.toEqual(generate(2))
  })

  it('uses stable ids keyed by day and slot', () => {
    const orders = generate(3)
    expect(orders.map((order) => order.id)).toEqual([
      'order-d3-s0',
      'order-d3-s1',
      'order-d3-s2',
      'order-d3-s3',
    ])
  })

  it('returns nothing without locations or rovers', () => {
    expect(
      generateDailyOrders({
        seed: SEED,
        day: 1,
        count: ORDERS_PER_DAY,
        locations: [],
        rovers: SEED_ROVERS,
      }),
    ).toEqual([])
  })
})

describe('feasibility guarantees (req 11)', () => {
  it('every day has at least two feasible and at most one challenge (infeasible) order', () => {
    for (let day = 1; day <= 12; day += 1) {
      const orders = generate(day)
      const feasible = orders.filter((order) =>
        isOrderFeasible(order, locationById(order.locationId), SEED_ROVERS),
      )
      const infeasible = orders.length - feasible.length
      const challenges = orders.filter((order) => order.isChallenge).length

      expect(feasible.length).toBeGreaterThanOrEqual(2)
      expect(infeasible).toBeLessThanOrEqual(1)
      expect(challenges).toBeLessThanOrEqual(1)
    }
  })

  it('guarantees a day-1 challenge, infeasible now but unlocked by ONE cargo upgrade', () => {
    const challenge = generate(1).find((order) => order.isChallenge)
    expect(challenge).toBeDefined()
    if (challenge === undefined) return

    const location = locationById(challenge.locationId)
    // Infeasible for the starting fleet (heavier than every current capacity).
    expect(isOrderFeasible(challenge, location, SEED_ROVERS)).toBe(false)

    // One cargo upgrade on the cargo rover makes it feasible.
    const upgraded: Rover[] = SEED_ROVERS.map((rover) =>
      rover.id === 'rover-cargo-02'
        ? { ...rover, capacityLevel: 1 }
        : { ...rover },
    )
    expect(isOrderFeasible(challenge, location, upgraded)).toBe(true)
  })

  it('never sets a challenge above the fully-upgraded fleet maximum', () => {
    const challenge = generate(1).find((order) => order.isChallenge)
    expect(challenge).toBeDefined()
    if (challenge === undefined) return

    const maxedFleet: Rover[] = SEED_ROVERS.map((rover) => ({
      ...rover,
      capacityLevel: MAX_UPGRADE_LEVEL,
    }))
    const absoluteMax = Math.max(
      ...maxedFleet.map((rover) => computeRoverStats(rover).capacity),
    )
    expect(challenge.weight).toBeLessThanOrEqual(absoluteMax)
  })

  it('gives a fully-maxed fleet a role-specific challenge only one rover can take', () => {
    const maxedFleet: Rover[] = SEED_ROVERS.map((rover) => ({
      ...rover,
      capacityLevel: MAX_UPGRADE_LEVEL,
    }))
    const challenge = generate(1, ORDERS_PER_DAY, maxedFleet).find(
      (order) => order.isChallenge,
    )
    expect(challenge).toBeDefined()
    if (challenge === undefined) return

    const location = locationById(challenge.locationId)
    const feasibleCount = maxedFleet.filter((rover) =>
      isOrderFeasible(challenge, location, [rover]),
    ).length

    // Feasible for exactly one specialised rover => impossible for >= 2 rovers.
    expect(feasibleCount).toBe(1)
  })
})

describe('challenge urgency (req 9)', () => {
  it('challenge orders are always normal urgency and never critical', () => {
    let sawChallenge = false
    for (let day = 1; day <= 12; day += 1) {
      for (const order of generate(day)) {
        if (!order.isChallenge) continue
        sawChallenge = true
        expect(order.urgency).toBe('normal')
        expect(order.urgency).not.toBe('critical')
      }
    }
    // Day 1 is guaranteed to contain a challenge, so the loop must have run.
    expect(sawChallenge).toBe(true)
  })
})

describe('reward is derived, not random (req 12)', () => {
  it('matches the reward formula for every generated order', () => {
    for (let day = 1; day <= 5; day += 1) {
      for (const order of generate(day)) {
        const location = locationById(order.locationId)
        const routeRisk = clamp(
          order.baseRisk + location.riskBonus,
          0,
          MAX_RISK_PERCENT,
        )
        const expected = calculateOrderReward({
          distance: location.distance,
          weight: order.weight,
          urgency: order.urgency,
          risk: routeRisk,
          day,
        })
        expect(order.reward).toBe(expected)
      }
    }
  })

  it('grows the reward with the day for the same route inputs', () => {
    const day1 = calculateOrderReward({
      distance: 30,
      weight: 12,
      urgency: 'urgent',
      risk: 10,
      day: 1,
    })
    const day5 = calculateOrderReward({
      distance: 30,
      weight: 12,
      urgency: 'urgent',
      risk: 10,
      day: 5,
    })
    expect(day5).toBeGreaterThan(day1)
  })
})

describe('order lifetime by urgency (req 8)', () => {
  it('sets the deadline from the urgency lifetime', () => {
    for (let day = 1; day <= 4; day += 1) {
      for (const order of generate(day)) {
        expect(order.deadlineDay).toBe(
          day + ORDER_LIFETIME_DAYS[order.urgency] - 1,
        )
      }
      // Critical orders live a single day: they expire the same day.
      for (const order of generate(day).filter(
        (candidate) => candidate.urgency === 'critical',
      )) {
        expect(order.deadlineDay).toBe(day)
      }
    }
  })
})

describe('batch size', () => {
  it('never generates more than the daily quota', () => {
    expect(generate(1)).toHaveLength(ORDERS_PER_DAY)
    // The daily quota and the per-day operation cap are independent knobs.
    expect(ORDERS_PER_DAY).toBeGreaterThan(MAX_OPERATIONS_PER_DAY - 1)
    expect(CARGO_CAPACITY_PER_LEVEL).toBeGreaterThan(0)
  })
})

/**
 * A fully-upgraded fleet so every unlocked zone is reachable. This isolates the
 * location-variety logic from the feasibility safety net, letting us assert on
 * the zones the generator actually chose (req 8). It changes no economy numbers.
 */
const STRONG_FLEET: readonly Rover[] = SEED_ROVERS.map((rover) => ({
  ...rover,
  capacityLevel: MAX_UPGRADE_LEVEL,
  batteryLevel: MAX_UPGRADE_LEVEL,
  efficiencyLevel: MAX_UPGRADE_LEVEL,
}))

function distinctLocationCount(day: number): number {
  const ids = generate(day, ORDERS_PER_DAY, STRONG_FLEET).map(
    (order) => order.locationId,
  )
  return new Set(ids).size
}

function maxShare(day: number): number {
  const counts = new Map<string, number>()
  for (const order of generate(day, ORDERS_PER_DAY, STRONG_FLEET)) {
    counts.set(order.locationId, (counts.get(order.locationId) ?? 0) + 1)
  }
  return Math.max(...counts.values())
}

describe('location distribution (req 8)', () => {
  const total = SEED_LOCATIONS.length

  it('unlocks at least 4 zones on days 1-3 and all zones from day 4', () => {
    for (const day of [1, 2, 3]) {
      expect(unlockedLocationCount(day, total)).toBeGreaterThanOrEqual(4)
      expect(unlockedLocationCount(day, total)).toBeLessThan(total)
    }
    for (const day of [4, 5, 6, 12]) {
      expect(unlockedLocationCount(day, total)).toBe(total)
    }
  })

  it('assigns at least two distinct zones and never more than half to one zone', () => {
    for (let day = 1; day <= 12; day += 1) {
      const unlocked = unlockedLocationCount(day, total)
      const indices = assignSlotLocations(day, ORDERS_PER_DAY, unlocked)
      // Every index stays inside the unlocked, distance-sorted range.
      for (const index of indices) {
        expect(index).toBeGreaterThanOrEqual(0)
        expect(index).toBeLessThan(unlocked)
      }
      expect(new Set(indices).size).toBeGreaterThanOrEqual(2)
      const counts = new Map<number, number>()
      for (const index of indices) {
        counts.set(index, (counts.get(index) ?? 0) + 1)
      }
      expect(Math.max(...counts.values())).toBeLessThanOrEqual(
        Math.floor(ORDERS_PER_DAY / 2),
      )
    }
  })

  it('exposes every unlocked zone across any three consecutive days', () => {
    for (const startDay of [1, 4, 5, 6, 7, 8]) {
      const unlocked = unlockedLocationCount(startDay, total)
      // Same unlock tier for the whole window (days 1-3 = 4 zones, 4+ = all).
      const seen = new Set<number>()
      for (const day of [startDay, startDay + 1, startDay + 2]) {
        for (const index of assignSlotLocations(day, ORDERS_PER_DAY, unlocked)) {
          seen.add(index)
        }
      }
      expect(seen.size).toBe(unlocked)
    }
  })

  it('produces at least two real zones per day with no zone over half (strong fleet)', () => {
    for (let day = 1; day <= 8; day += 1) {
      expect(distinctLocationCount(day)).toBeGreaterThanOrEqual(2)
      expect(maxShare(day)).toBeLessThanOrEqual(Math.floor(ORDERS_PER_DAY / 2))
    }
  })

  it('remains fully deterministic for the same seed and day', () => {
    for (const day of [1, 4, 7]) {
      const first = generate(day, ORDERS_PER_DAY, STRONG_FLEET).map(
        (order) => order.locationId,
      )
      const second = generate(day, ORDERS_PER_DAY, STRONG_FLEET).map(
        (order) => order.locationId,
      )
      expect(first).toEqual(second)
    }
  })
})
