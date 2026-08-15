import { describe, expect, it } from 'vitest'
import {
  CARGO_CAPACITY_PER_LEVEL,
  MAX_OPERATIONS_PER_DAY,
  MAX_RISK_PERCENT,
  MAX_UPGRADE_LEVEL,
  MIN_ORDERS_PER_DAY,
  ORDERS_PER_DAY,
  ORDER_MAX_LIFETIME_DAYS,
  REQUIRED_OPERATIONS_PER_DAY,
} from '../../src/domain/constants'
import { calculateBatteryCost } from '../../src/domain/calculations'
import {
  CHALLENGE_ENERGY_ID,
  CHALLENGE_OVERLOAD_ID,
  IMPOSSIBLE_RANDOM_START_DAY,
  assignSlotLocations,
  challengeEnergyId,
  challengeOverloadId,
  calculateOrderReward,
  createSlotRng,
  deriveUrgency,
  generateDailyOrders,
  impossibleChallengeCount,
  isOrderFeasible,
  planDayLifetimes,
  unlockedLocationCount,
} from '../../src/domain/orderGeneration'
import { computeRoverStats } from '../../src/domain/roverStats'
import { clamp } from '../../src/domain/math'
import type { Order, Rover } from '../../src/domain/types'
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

/**
 * The strongest fleet the game can ever reach: every cargo, battery and
 * efficiency upgrade bought. Used to prove the challenge contracts stay
 * impossible forever and are not just "expensive right now".
 */
const MAXED_FLEET: readonly Rover[] = SEED_ROVERS.map((rover) => ({
  ...rover,
  capacityLevel: MAX_UPGRADE_LEVEL,
  batteryLevel: MAX_UPGRADE_LEVEL,
  efficiencyLevel: MAX_UPGRADE_LEVEL,
}))

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
    // Day 3 is a challenge day, so the board is regular orders + one impossible
    // contract. Regular orders carry the stable `order-d<day>-s<slot>` id; the
    // challenge has its own dedicated id (covered by the feasibility tests).
    const daily = generate(3).filter((order) => !order.isChallenge)
    expect(daily.length).toBeGreaterThanOrEqual(MIN_ORDERS_PER_DAY)
    expect(daily.map((order) => order.id)).toEqual(
      daily.map((_order, slot) => `order-d3-s${slot}`),
    )
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
  it('offers only feasible daily orders and drip-feeds the impossible ones', () => {
    for (let day = 1; day <= 12; day += 1) {
      const orders = generate(day)
      const daily = orders.filter((order) => !order.isChallenge)
      const challenges = orders.filter((order) => order.isChallenge)

      const feasible = daily.filter((order) =>
        isOrderFeasible(order, locationById(order.locationId), SEED_ROVERS),
      )

      // Every regular order of the day must be doable by the starting fleet.
      expect(feasible).toHaveLength(daily.length)
      expect(feasible.length).toBeGreaterThanOrEqual(MIN_ORDERS_PER_DAY)

      // Days 1..3 carry one impossible contract; from day 4 a seeded coin flip
      // makes it one or two, so the count breathes without a fixed schedule.
      expect(challenges).toHaveLength(impossibleChallengeCount(SEED, day))
    }
  })

  it('shows exactly one impossible (overload) contract on days 1-3', () => {
    for (const day of [1, 2, 3]) {
      const challenges = generate(day).filter((order) => order.isChallenge)
      // A single, day-scoped overload contract: the id carries the day so a
      // fresh one never collides with yesterday's expired row (Prisma P2002).
      expect(challenges.map((order) => order.id)).toEqual([
        challengeOverloadId(day),
      ])
      expect(challenges[0]!.id.startsWith(CHALLENGE_OVERLOAD_ID)).toBe(true)
      // Day-scoped: it leaves the board tomorrow and regenerates elsewhere.
      expect(challenges[0]!.deadlineDay).toBe(day)
      expect(
        isOrderFeasible(
          challenges[0]!,
          locationById(challenges[0]!.locationId),
          SEED_ROVERS,
        ),
      ).toBe(false)
    }
  })

  it('adds the energy contract only from day 4, as the random second one', () => {
    // Before day 4 there is never a second (energy) contract.
    for (const day of [1, 2, 3]) {
      const challenges = generate(day).filter((order) => order.isChallenge)
      expect(challenges).toHaveLength(1)
      expect(challenges[0]!.id).toBe(challengeOverloadId(day))
    }

    // From day 4 the count is a seeded 1-or-2. When it is 2 the extra contract
    // is the energy guest: routed to a dark zone and expiring the same day.
    let sawOne = false
    let sawTwo = false
    for (let day = IMPOSSIBLE_RANDOM_START_DAY; day <= 40; day += 1) {
      const challenges = generate(day).filter((order) => order.isChallenge)
      expect(challenges).toHaveLength(impossibleChallengeCount(SEED, day))
      if (challenges.length === 2) {
        sawTwo = true
        const energy = challenges.find(
          (order) => order.id === challengeEnergyId(day),
        )
        expect(energy, `energy contract on day ${day}`).toBeDefined()
        expect(energy!.id.startsWith(CHALLENGE_ENERGY_ID)).toBe(true)
        expect(energy!.deadlineDay).toBe(day)
        expect(locationById(energy!.locationId).zoneType).toBe('dark')
      } else {
        sawOne = true
        expect(challenges[0]!.id).toBe(challengeOverloadId(day))
      }
    }
    // The coin flip must produce both outcomes across the long window.
    expect(sawOne).toBe(true)
    expect(sawTwo).toBe(true)
  })

  it('keeps every impossible contract impossible even for a fully upgraded fleet', () => {
    const challenges: Order[] = []
    for (let day = 1; day <= 40; day += 1) {
      for (const order of generate(day, ORDERS_PER_DAY, MAXED_FLEET)) {
        if (order.isChallenge) challenges.push(order)
      }
    }
    // The window must have produced both kinds of impossible contract.
    expect(
      challenges.some((order) => order.id.startsWith(CHALLENGE_OVERLOAD_ID)),
    ).toBe(true)
    expect(
      challenges.some((order) => order.id.startsWith(CHALLENGE_ENERGY_ID)),
    ).toBe(true)

    for (const order of challenges) {
      const location = locationById(order.locationId)
      expect(isOrderFeasible(order, location, MAXED_FLEET)).toBe(false)

      // Not a single rover of the maxed fleet can take it, ever.
      const feasibleCount = MAXED_FLEET.filter((rover) =>
        isOrderFeasible(order, location, [rover]),
      ).length
      expect(feasibleCount).toBe(0)
    }
  })

  it('blocks one contract by cargo weight and the other by battery', () => {
    const orders: Order[] = []
    for (let day = 1; day <= 40; day += 1) {
      orders.push(...generate(day, ORDERS_PER_DAY, MAXED_FLEET))
    }
    const overload = orders.find((order) =>
      order.id.startsWith(CHALLENGE_OVERLOAD_ID),
    )
    const energy = orders.find((order) =>
      order.id.startsWith(CHALLENGE_ENERGY_ID),
    )
    expect(overload).toBeDefined()
    expect(energy).toBeDefined()
    if (overload === undefined || energy === undefined) return

    const maxCapacity = Math.max(
      ...MAXED_FLEET.map((rover) => computeRoverStats(rover).capacity),
    )

    // Overload contract: heavier than anything the fleet will ever lift.
    expect(overload.weight).toBeGreaterThan(maxCapacity)

    // Energy contract: light enough to load, blocked purely by the route.
    expect(energy.weight).toBeLessThanOrEqual(maxCapacity)
    const location = locationById(energy.locationId)
    expect(location.zoneType).toBe('dark')
    for (const rover of MAXED_FLEET) {
      const stats = computeRoverStats(rover)
      const cost = calculateBatteryCost({
        order: { weight: energy.weight, isChallenge: energy.isChallenge },
        rover: stats,
        location,
      })
      expect(cost).toBeGreaterThan(stats.batteryCapacity)
    }
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

describe('order lifetime and derived urgency (req 8)', () => {
  it('gives every regular order a 1..ORDER_MAX_LIFETIME_DAYS delivery window', () => {
    for (let day = 1; day <= 8; day += 1) {
      for (const order of generate(day).filter(
        (candidate) => !candidate.isChallenge,
      )) {
        const lifetime = order.deadlineDay - day + 1
        expect(lifetime).toBeGreaterThanOrEqual(1)
        expect(lifetime).toBeLessThanOrEqual(ORDER_MAX_LIFETIME_DAYS)
      }
    }
  })

  it('stores an urgency that matches the days left at creation', () => {
    for (let day = 1; day <= 8; day += 1) {
      for (const order of generate(day).filter(
        (candidate) => !candidate.isChallenge,
      )) {
        expect(order.urgency).toBe(deriveUrgency(order.deadlineDay, day))
      }
    }
  })

  it('derives urgency from the days left (critical today, urgent tomorrow)', () => {
    expect(deriveUrgency(5, 5)).toBe('critical')
    expect(deriveUrgency(5, 6)).toBe('critical')
    expect(deriveUrgency(6, 5)).toBe('urgent')
    expect(deriveUrgency(7, 5)).toBe('normal')
    expect(deriveUrgency(10, 5)).toBe('normal')
  })
})

describe('batch size', () => {
  it('never generates more than the daily quota', () => {
    // Day 1: a small opening batch plus the permanent challenge contract.
    expect(
      generate(1).filter((order) => !order.isChallenge),
    ).toHaveLength(MIN_ORDERS_PER_DAY)
    expect(generate(1)).toHaveLength(MIN_ORDERS_PER_DAY + 1)
    // Day 2 now also carries the day-scoped overload contract.
    expect(
      generate(2).filter((order) => !order.isChallenge),
    ).toHaveLength(MIN_ORDERS_PER_DAY)
    expect(generate(2)).toHaveLength(MIN_ORDERS_PER_DAY + 1)

    // The daily quota and the per-day operation cap are independent knobs.
    expect(ORDERS_PER_DAY).toBeGreaterThan(MAX_OPERATIONS_PER_DAY - 1)
    // The player must complete every allowed operation to end a day cleanly.
    expect(REQUIRED_OPERATIONS_PER_DAY).toBeLessThanOrEqual(MAX_OPERATIONS_PER_DAY)
    expect(REQUIRED_OPERATIONS_PER_DAY).toBe(MAX_OPERATIONS_PER_DAY)
    expect(CARGO_CAPACITY_PER_LEVEL).toBeGreaterThan(0)
  })

  it('never exceeds the free capacity it is given', () => {
    for (const capacity of [0, 1, 2, 3]) {
      const daily = generate(5, capacity).filter((order) => !order.isChallenge)
      expect(daily.length).toBeLessThanOrEqual(capacity)
    }
  })
})

describe('daily lifetime plan', () => {
  it('keeps every delivery window between 1 and ORDER_MAX_LIFETIME_DAYS', () => {
    for (let day = 1; day <= 12; day += 1) {
      for (const lifetime of planDayLifetimes(SEED, day, ORDERS_PER_DAY)) {
        expect(lifetime).toBeGreaterThanOrEqual(1)
        expect(lifetime).toBeLessThanOrEqual(ORDER_MAX_LIFETIME_DAYS)
      }
    }
  })

  it('keeps the batch between the minimum and the daily quota', () => {
    for (let day = 1; day <= 12; day += 1) {
      const plan = planDayLifetimes(SEED, day, ORDERS_PER_DAY)
      expect(plan.length).toBeGreaterThanOrEqual(MIN_ORDERS_PER_DAY)
      expect(plan.length).toBeLessThanOrEqual(ORDERS_PER_DAY)
    }
  })

  it('varies the delivery windows across the run', () => {
    const windows = new Set<number>()
    for (let day = 1; day <= 12; day += 1) {
      for (const lifetime of planDayLifetimes(SEED, day, ORDERS_PER_DAY)) {
        windows.add(lifetime)
      }
    }
    expect(windows.size).toBeGreaterThan(1)
  })

  it('is deterministic for a given seed and day', () => {
    expect(planDayLifetimes(SEED, 4, ORDERS_PER_DAY)).toEqual(
      planDayLifetimes(SEED, 4, ORDERS_PER_DAY),
    )
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

/** Daily orders only: the fixed challenge contracts are not part of the mix. */
function dailyOrders(day: number) {
  return generate(day, ORDERS_PER_DAY, STRONG_FLEET).filter(
    (order) => !order.isChallenge,
  )
}

function distinctLocationCount(day: number): number {
  const ids = dailyOrders(day).map((order) => order.locationId)
  return new Set(ids).size
}

function maxShare(day: number): number {
  const counts = new Map<string, number>()
  for (const order of dailyOrders(day)) {
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
      const first = dailyOrders(day).map((order) => order.locationId)
      const second = dailyOrders(day).map((order) => order.locationId)
      expect(first).toEqual(second)
    }
  })
})
