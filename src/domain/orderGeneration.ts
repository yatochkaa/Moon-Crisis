/**
 * Deterministic daily order generation (pure domain logic).
 *
 * Requirements covered here:
 * - generation is a pure function of `sessionSeed + day + slot`, so it never
 *   changes after a page refresh and can be recomputed identically (req 10);
 * - urgency controls the lifetime: critical 1 day, urgent 2, normal 3 (req 8);
 * - difficulty and rewards grow with the day number (req 12);
 * - the reward is DERIVED from distance, weight, urgency and risk, never from an
 *   independent random draw;
 * - every generated day guarantees at least two feasible orders and at most one
 *   order that requires a future upgrade (req 11). Feasibility is judged against
 *   the current rover fleet using the same battery/capacity math as the rules.
 *
 * This module is pure: no React, Prisma, Next.js, `Date`, `Math.random` or I/O.
 */

import { calculateBatteryCost } from './calculations'
import {
  CARGO_BATTERY_COST_PER_KG,
  CARGO_CAPACITY_PER_LEVEL,
  MAX_RISK_PERCENT,
  MAX_UPGRADE_LEVEL,
  ORDER_BASE_RISK,
  ORDER_BASE_WEIGHT,
  ORDER_LIFETIME_DAYS,
  ORDER_MIN_WEIGHT,
  ORDER_RISK_JITTER,
  ORDER_RISK_PER_DAY,
  ORDER_WEIGHT_JITTER,
  ORDER_WEIGHT_PER_DAY,
  ORDERS_PER_DAY,
  PERCENT_SCALE,
  REWARD_DAY_GROWTH,
  REWARD_PER_KG,
  REWARD_PER_KM,
  REWARD_RISK_WEIGHT,
  REWARD_URGENCY_MULTIPLIER,
} from './constants'
import { clamp, roundToInt } from './math'
import { computeRoverStats } from './roverStats'
import type { MoonLocation, Order, OrderUrgency, Rover } from './types'

/** Deterministic cargo names; the pick is seeded, so it never varies on reload. */
const CARGO_NAMES = [
  'Медикаменты',
  'Запчасти',
  'Продовольствие',
  'Кислородные баллоны',
  'Солнечные панели',
  'Научный груз',
  'Топливные ячейки',
  'Инструменты',
  'Питьевая вода',
  'Комплектующие',
] as const

/** Urgency cycle per slot; guarantees a mix of deadlines every day. */
const URGENCY_BY_SLOT: readonly OrderUrgency[] = [
  'normal',
  'urgent',
  'critical',
  'normal',
]

// --- Deterministic PRNG (xmur3 seed + mulberry32 stream) --------------------

function xmur3(input: string): () => number {
  let h = 1779033703 ^ input.length
  for (let i = 0; i < input.length; i += 1) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return h >>> 0
  }
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A reproducible random stream keyed by session seed, day and slot (req 10). */
export function createSlotRng(
  seed: string,
  day: number,
  slot: number,
): () => number {
  return mulberry32(xmur3(`${seed}:${day}:${slot}`)())
}

// --- Reward + feasibility ---------------------------------------------------

/** Reward derived from distance, weight, urgency, route risk and the day. */
export function calculateOrderReward(input: {
  distance: number
  weight: number
  urgency: OrderUrgency
  risk: number
  day: number
}): number {
  const base = input.distance * REWARD_PER_KM + input.weight * REWARD_PER_KG
  const urgencyMultiplier = REWARD_URGENCY_MULTIPLIER[input.urgency]
  const riskMultiplier = 1 + (input.risk / PERCENT_SCALE) * REWARD_RISK_WEIGHT
  const dayMultiplier = 1 + (input.day - 1) * REWARD_DAY_GROWTH
  return roundToInt(base * urgencyMultiplier * riskMultiplier * dayMultiplier)
}

/** True when at least one rover in the fleet can currently perform the order. */
export function isOrderFeasible(
  order: Pick<Order, 'weight'>,
  location: MoonLocation,
  rovers: readonly Rover[],
): boolean {
  return rovers.some((rover) => {
    const stats = computeRoverStats(rover)
    if (order.weight > stats.capacity) return false
    const cost = calculateBatteryCost({
      order: { weight: order.weight },
      rover: { efficiency: stats.efficiency },
      location,
    })
    return cost <= stats.batteryCapacity
  })
}

/** Heaviest cargo the fleet could still carry to `location` (0 = impossible). */
function maxFeasibleWeight(
  location: MoonLocation,
  rovers: readonly Rover[],
): number {
  let best = 0
  for (const rover of rovers) {
    const stats = computeRoverStats(rover)
    const byBattery = Math.floor(
      (stats.batteryCapacity * stats.efficiency -
        location.distance * location.batteryModifier) /
        CARGO_BATTERY_COST_PER_KG,
    )
    const usable = Math.min(stats.capacity, byBattery)
    if (usable > best) best = usable
  }
  return best
}

// --- Order construction -----------------------------------------------------

type BuildInput = {
  seed: string
  day: number
  slot: number
  urgency: OrderUrgency
  location: MoonLocation
  weight: number
  baseRisk: number
  rng: () => number
  isChallenge?: boolean
}

function makeOrderRecord(input: BuildInput): Order {
  const cargo = CARGO_NAMES[Math.floor(input.rng() * CARGO_NAMES.length)]!
  const routeRisk = clamp(
    input.baseRisk + input.location.riskBonus,
    0,
    MAX_RISK_PERCENT,
  )
  const reward = calculateOrderReward({
    distance: input.location.distance,
    weight: input.weight,
    urgency: input.urgency,
    risk: routeRisk,
    day: input.day,
  })

  return {
    id: `order-d${input.day}-s${input.slot}`,
    title: `${cargo} → ${input.location.name}`,
    description: `Груз дня ${input.day}. Пункт назначения: ${input.location.name}.`,
    locationId: input.location.id,
    weight: input.weight,
    reward,
    urgency: input.urgency,
    baseRisk: input.baseRisk,
    deadlineDay: input.day + ORDER_LIFETIME_DAYS[input.urgency] - 1,
    isChallenge: input.isChallenge ?? false,
    status: 'available',
  }
}

/**
 * How many distance-sorted zones are unlocked on a given day. Days 1–3 expose
 * at least the four nearest zones; from day 4 every zone is available. This is
 * a variety knob only — it never touches the economy, upgrade prices or map.
 */
export function unlockedLocationCount(day: number, total: number): number {
  const earlyUnlock = Math.min(total, 4)
  return day >= 4 ? total : earlyUnlock
}

/**
 * Deterministically maps each order slot to a zone index inside the unlocked,
 * distance-sorted list, guaranteeing location variety without any randomness:
 * - the nearest zone always fills the last (challenge-eligible) slot;
 * - the remaining slots rotate through the other unlocked zones with a per-day
 *   offset, so every day uses at least two distinct zones, no zone takes more
 *   than half of the daily orders, and any three consecutive days expose every
 *   unlocked zone.
 */
export function assignSlotLocations(
  day: number,
  count: number,
  unlockedCount: number,
): number[] {
  if (unlockedCount <= 1) return Array.from({ length: count }, () => 0)
  const rotating = unlockedCount - 1 // non-nearest zones: indices 1..unlockedCount-1
  const step = ((day - 1) * Math.max(count - 1, 1)) % rotating
  const indices: number[] = []
  for (let slot = 0; slot < count; slot += 1) {
    if (slot === count - 1) {
      indices.push(0) // nearest zone; also the challenge slot
    } else {
      indices.push(1 + ((step + slot) % rotating))
    }
  }
  return indices
}

function buildFeasibleOrder(
  seed: string,
  day: number,
  slot: number,
  urgency: OrderUrgency,
  unlocked: readonly MoonLocation[],
  assignedIndex: number,
  rovers: readonly Rover[],
  rng: () => number,
): Order {
  // Keep the assigned zone; only fall back toward the base when even a minimum
  // cargo cannot reach it with the current fleet (feasibility safety net).
  let index = Math.min(Math.max(assignedIndex, 0), unlocked.length - 1)
  let location = unlocked[index]!
  while (index > 0 && maxFeasibleWeight(location, rovers) < ORDER_MIN_WEIGHT) {
    index -= 1
    location = unlocked[index]!
  }

  const ceiling = Math.max(ORDER_MIN_WEIGHT, maxFeasibleWeight(location, rovers))
  const desired =
    ORDER_BASE_WEIGHT +
    day * ORDER_WEIGHT_PER_DAY +
    Math.floor(rng() * ORDER_WEIGHT_JITTER)
  let weight = clamp(desired, ORDER_MIN_WEIGHT, ceiling)
  // Exact guard against ceil rounding in the battery formula.
  while (weight > ORDER_MIN_WEIGHT && !isOrderFeasible({ weight }, location, rovers)) {
    weight -= 1
  }

  const baseRisk = clamp(
    roundToInt(
      ORDER_BASE_RISK + day * ORDER_RISK_PER_DAY + rng() * ORDER_RISK_JITTER,
    ),
    0,
    60,
  )

  return makeOrderRecord({ seed, day, slot, urgency, location, weight, baseRisk, rng })
}

/**
 * Builds the single daily "challenge" contract, or null when no fair challenge
 * exists for the current fleet (req 11).
 *
 * The challenge always targets the NEAREST location so battery is never the
 * blocker; the only obstacle is cargo capacity, which one upgrade removes.
 *
 * - While the fleet still has cargo upgrades available: the weight is set just
 *   above every current capacity but exactly at the best single-upgrade
 *   capacity, so it is impossible now, feasible after ONE cargo upgrade, and
 *   never heavier than the fully-upgraded fleet maximum.
 * - When every useful cargo upgrade is maxed: fall back to a role-specific
 *   weight only the single strongest rover can carry (impossible for >= 2
 *   rovers, feasible for >= 1). If two rovers share the top capacity no fair
 *   challenge exists, so it returns null.
 */
function buildChallengeOrder(
  seed: string,
  day: number,
  slot: number,
  sortedByDistance: readonly MoonLocation[],
  rovers: readonly Rover[],
  rng: () => number,
): Order | null {
  const nearest = sortedByDistance[0]!
  const caps = rovers.map((rover) => computeRoverStats(rover).capacity)
  const maxCurrentCap = Math.max(...caps)

  // Capacity each rover would reach after exactly one more cargo upgrade.
  const cargoUpgradeCaps = rovers
    .filter((rover) => rover.capacityLevel < MAX_UPGRADE_LEVEL)
    .map((rover) => computeRoverStats(rover).capacity + CARGO_CAPACITY_PER_LEVEL)
  const bestUpgradeCap =
    cargoUpgradeCaps.length > 0 ? Math.max(...cargoUpgradeCaps) : 0

  let weight: number
  if (bestUpgradeCap > maxCurrentCap) {
    weight = bestUpgradeCap
  } else {
    const sorted = [...caps].sort((a, b) => b - a)
    const top = sorted[0]!
    const second = sorted[1] ?? 0
    if (top <= second) return null
    weight = second + 1
  }

  const baseRisk = clamp(
    roundToInt(ORDER_BASE_RISK + day * ORDER_RISK_PER_DAY),
    0,
    60,
  )

  return makeOrderRecord({
    seed,
    day,
    slot,
    urgency: 'normal',
    location: nearest,
    weight,
    baseRisk,
    rng,
    isChallenge: true,
  })
}

/**
 * Whether at least one rover in the fleet can currently carry the challenge
 * order to its destination: it must fit the effective cargo capacity and the
 * route must be possible on a full charge (batteryCost <= batteryCapacity).
 * Recomputed live from rover stats, so a purchased upgrade unlocks it at once.
 */
export function isChallengeFeasible(
  order: Pick<Order, 'weight'>,
  location: MoonLocation,
  rovers: readonly Rover[],
): boolean {
  return rovers.some((rover) => {
    const stats = computeRoverStats(rover)
    if (order.weight > stats.capacity) return false
    const batteryCost = calculateBatteryCost({ order, rover: stats, location })
    return batteryCost <= stats.batteryCapacity
  })
}

/**
 * Human-readable explanation of why a challenge order cannot be started now,
 * plus a hint about the upgrade that unlocks it. Never leaks internal codes.
 */
export function describeChallenge(
  order: Pick<Order, 'weight'>,
  location: MoonLocation,
  rovers: readonly Rover[],
): { reason: string; hint: string } {
  const allTooHeavy = rovers.every(
    (rover) => order.weight > computeRoverStats(rover).capacity,
  )

  if (allTooHeavy) {
    return {
      reason: `Груз ${order.weight} кг тяжелее грузоподъёмности всех доступных роверов.`,
      hint: 'Нужно улучшить грузоподъёмность одного из роверов.',
    }
  }

  return {
    reason: `Маршрут до «${location.name}» требует больше заряда, чем есть у роверов с подходящей грузоподъёмностью.`,
    hint: 'Улучшите ёмкость или эффективность батареи либо дождитесь полной зарядки ровера.',
  }
}

/**
 * Generates up to `count` orders for one day.
 *
 * Slots 0..2 are always feasible; only the fourth slot of a full four-order
 * batch may become an "upgrade required" order (more likely on later days),
 * which keeps "at least two feasible, at most one requiring an upgrade" true.
 */
export function generateDailyOrders(input: {
  seed: string
  day: number
  count: number
  locations: readonly MoonLocation[]
  rovers: readonly Rover[]
}): Order[] {
  const { seed, day, count, locations, rovers } = input
  if (count <= 0 || locations.length === 0 || rovers.length === 0) return []

  const sortedByDistance = [...locations].sort(
    (a, b) => a.distance - b.distance,
  )
  const unlockedCount = unlockedLocationCount(day, sortedByDistance.length)
  const unlocked = sortedByDistance.slice(0, unlockedCount)
  const assignments = assignSlotLocations(day, count, unlocked.length)
  const orders: Order[] = []

  for (let slot = 0; slot < count; slot += 1) {
    const rng = createSlotRng(seed, day, slot)
    const urgency = URGENCY_BY_SLOT[slot % URGENCY_BY_SLOT.length]!
    const isChallengeSlot =
      slot === ORDERS_PER_DAY - 1 && count === ORDERS_PER_DAY
    // Day 1 always guarantees the challenge; later days roll for it. At most one
    // challenge per day because only the final full-batch slot is eligible.
    const wantsChallenge =
      isChallengeSlot && (day === 1 || rng() < Math.min(0.3 + day * 0.1, 0.85))
    const challenge = wantsChallenge
      ? buildChallengeOrder(seed, day, slot, unlocked, rovers, rng)
      : null

    const order =
      challenge ??
      buildFeasibleOrder(
        seed,
        day,
        slot,
        urgency,
        unlocked,
        assignments[slot]!,
        rovers,
        rng,
      )
    orders.push(order)
  }

  return orders
}
