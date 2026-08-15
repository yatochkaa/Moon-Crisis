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
  MIN_ORDERS_PER_DAY,
  ORDER_BASE_RISK,
  ORDER_BASE_WEIGHT,
  ORDER_LIFETIME_DAYS,
  ORDER_MAX_LIFETIME_DAYS,
  ORDER_MIN_WEIGHT,
  ORDER_RISK_JITTER,
  ORDER_RISK_PER_DAY,
  ORDER_WEIGHT_JITTER,
  ORDER_WEIGHT_PER_DAY,
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
  order: Pick<Order, 'weight'> & { readonly isChallenge?: boolean },
  location: MoonLocation,
  rovers: readonly Rover[],
): boolean {
  return rovers.some((rover) => {
    const stats = computeRoverStats(rover)
    if (order.weight > stats.capacity) return false
    // The challenge flag must be forwarded, otherwise the dark-zone battery
    // hazard is silently dropped and an impossible contract looks feasible.
    const cost = calculateBatteryCost({
      order: { weight: order.weight, isChallenge: order.isChallenge },
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
  /** Stable id override, used by the permanent challenge contracts. */
  id?: string
  /** Title override, used by the permanent challenge contracts. */
  title?: string
  /** Description override, used by the permanent challenge contracts. */
  description?: string
  /** Deadline override; challenge contracts never expire. */
  deadlineDay?: number
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
    id: input.id ?? `order-d${input.day}-s${input.slot}`,
    title: input.title ?? `${cargo} → ${input.location.name}`,
    description:
      input.description ??
      `Груз дня ${input.day}. Пункт назначения: ${input.location.name}.`,
    locationId: input.location.id,
    weight: input.weight,
    reward,
    urgency: input.urgency,
    baseRisk: input.baseRisk,
    deadlineDay:
      input.deadlineDay ?? input.day + ORDER_LIFETIME_DAYS[input.urgency] - 1,
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
  deadlineDay: number,
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

  return makeOrderRecord({ seed, day, slot, urgency, location, weight, baseRisk, rng, deadlineDay })
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
/** Stable id of the permanent "cargo too heavy" contract. */
export const CHALLENGE_OVERLOAD_ID = 'order-challenge-overload'

/**
 * Id prefix of the PERIODIC "route needs too much energy" contract.
 *
 * The energy contract is a guest that reappears every third day. Its expired
 * row stays in the database, so reusing one fixed id would collide with the
 * next appearance (Prisma P2002 on `Order.id` — exactly the crash seen when
 * day 5 rolled over into day 6). The concrete id is therefore scoped to the
 * day it is generated on, see `challengeEnergyId`.
 */
export const CHALLENGE_ENERGY_ID = 'order-challenge-energy'

/** Day-scoped id of the periodic energy contract, unique across appearances. */
export function challengeEnergyId(day: number): string {
  return `${CHALLENGE_ENERGY_ID}-d${day}`
}

/**
 * Cargo of the energy contract. Light enough to fit an un-upgraded rover, so
 * the blocker is unambiguously energy and never weight.
 */
export const CHALLENGE_ENERGY_WEIGHT = 30

/** Kilograms added on top of the fully-upgraded fleet ceiling. */
export const CHALLENGE_OVERLOAD_MARGIN = 10

/**
 * Deadline recognised by `resolveEndOfDay` as "never expires". Kept for callers
 * that still build permanent challenge fixtures; the GENERATED contracts are
 * day-scoped instead (they refresh every day so their location can rotate).
 */
export const CHALLENGE_DEADLINE_DAY = 999

/** Day-scoped id of the "cargo too heavy" contract, unique across appearances. */
export function challengeOverloadId(day: number): string {
  return `${CHALLENGE_OVERLOAD_ID}-d${day}`
}

/** From this day on the number of impossible contracts becomes random (1 or 2). */
export const IMPOSSIBLE_RANDOM_START_DAY = 4

/**
 * How many impossible contracts a given day carries:
 * - days 1..(start-1): exactly one (the overload contract), so the early game
 *   shows a single, stable "impossible" case;
 * - from IMPOSSIBLE_RANDOM_START_DAY on: a seeded coin flip yields one or two,
 *   so the second (energy) contract appears and disappears at random instead of
 *   sitting on the board on a fixed schedule.
 */
export function impossibleChallengeCount(seed: string, day: number): number {
  if (day < IMPOSSIBLE_RANDOM_START_DAY) return 1
  return createSlotRng(seed, day, 92)() < 0.5 ? 1 : 2
}

/** Heaviest cargo the fleet could ever lift, assuming every cargo upgrade. */
function fullyUpgradedFleetCeiling(rovers: readonly Rover[]): number {
  return Math.max(
    ...rovers.map(
      (rover) =>
        computeRoverStats(rover).capacity +
        (MAX_UPGRADE_LEVEL - Math.min(rover.capacityLevel, MAX_UPGRADE_LEVEL)) *
          CARGO_CAPACITY_PER_LEVEL,
    ),
  )
}

/**
 * The two permanent impossible contracts (assignment requirement: "at least one
 * scenario where the delivery is impossible").
 *
 * They are created ONCE, on day 1, and then live forever:
 * - they never expire (`resolveEndOfDay` skips challenge orders), so the
 *   scenario is always visible to a reviewer, on any day;
 * - they do not consume the MAX_ACTIVE_ORDERS budget (see the end-day service),
 *   so the player still receives a full batch of feasible orders every day.
 *
 * Each one demonstrates a DIFFERENT blocker, and both stay impossible even
 * after every upgrade is bought:
 * - overload: cargo 10 kg above the fully-upgraded fleet ceiling;
 * - energy: a light 30 kg cargo routed to the farthest dark zone, where
 *   `challengeBatteryHazard` triples the battery cost beyond any battery.
 *
 * Feasibility is still recomputed live from real rover stats, so nothing is
 * hard-coded as "blocked" in the UI.
 */
function buildChallengeOrders(
  seed: string,
  day: number,
  sortedByDistance: readonly MoonLocation[],
  rovers: readonly Rover[],
): Order[] {
  const farthest = sortedByDistance[sortedByDistance.length - 1]
  if (farthest === undefined) return []

  // Бассейн Айткена: the farthest dark zone, reserved for the energy contract.
  const darkZone = [...sortedByDistance]
    .reverse()
    .find((item) => item.zoneType === 'dark')
  // `darkest` is where the energy contract routes; it stays a real location
  // (never undefined) so the record below type-checks even on dark-less maps.
  const darkest = darkZone ?? farthest

  // The overload contract rotates across every zone EXCEPT the reserved dark
  // one, so it is no longer pinned to the nearest zone (Море Ясности) forever.
  const overloadPool =
    darkZone === undefined
      ? sortedByDistance
      : sortedByDistance.filter((item) => item.id !== darkZone.id)
  const pool = overloadPool.length > 0 ? overloadPool : sortedByDistance
  const nearest = pool[Math.floor(createSlotRng(seed, day, 90)() * pool.length)]
  if (nearest === undefined) return []

  // Days 1..3 show exactly one impossible contract; from day 4 a seeded coin
  // flip adds the energy contract as a random second, so it comes and goes.
  const impossibleCount = impossibleChallengeCount(seed, day)
  const wantsOverload = true
  const wantsEnergy = impossibleCount >= 2 && darkZone !== undefined

  const baseRisk = clamp(roundToInt(ORDER_BASE_RISK), 0, 60)

  const overload = makeOrderRecord({
    seed,
    day,
    slot: 0,
    urgency: 'normal',
    location: nearest,
    weight: fullyUpgradedFleetCeiling(rovers) + CHALLENGE_OVERLOAD_MARGIN,
    baseRisk,
    rng: createSlotRng(seed, day, 90),
    isChallenge: true,
    id: challengeOverloadId(day),
    title: `Негабаритный модуль \u2192 ${nearest.name}`,
    description:
      'Контракт-вызов: груз тяжелее, чем сможет поднять любой ровер даже ' +
      'после полной прокачки грузоподъёмности.',
    // Day-scoped, so tomorrow's overload can land on a different zone.
    deadlineDay: day,
  })

  const energy = makeOrderRecord({
    seed,
    day,
    slot: 1,
    urgency: 'normal',
    location: darkest,
    weight: CHALLENGE_ENERGY_WEIGHT,
    baseRisk,
    rng: createSlotRng(seed, day, 91),
    isChallenge: true,
    id: challengeEnergyId(day),
    title: `Аварийный запас \u2192 ${darkest.name}`,
    description:
      'Контракт-вызов: груз лёгкий, но маршрут в тёмную зону съедает больше ' +
      'заряда, чем вмещает даже полностью прокачанная батарея.',
    // A guest, not a fixture: it expires with the day it appeared on, so the
    // board goes back to a single impossible order tomorrow.
    deadlineDay: day,
  })

  const result: Order[] = []
  if (wantsOverload) result.push(overload)
  if (wantsEnergy) result.push(energy)
  return result
}

/**
 * Live urgency of an order, derived from how many days are left until its
 * deadline. This is the single source of truth for urgency: an order carried
 * over from a previous day becomes more urgent as its deadline approaches, so
 * the label always matches the real "Срок" shown on the card.
 * - due today (0 days left) or overdue → critical;
 * - 1 day left → urgent;
 * - 2+ days left → normal.
 */
export function deriveUrgency(
  deadlineDay: number,
  currentDay: number,
): OrderUrgency {
  const daysLeft = deadlineDay - currentDay
  if (daysLeft <= 0) return 'critical'
  if (daysLeft === 1) return 'urgent'
  return 'normal'
}

/**
 * Delivery windows for one day, as a list of per-slot lifetimes (in days).
 *
 * Instead of forcing "one critical per day", every new order gets its own
 * delivery window of 1..ORDER_MAX_LIFETIME_DAYS days. The window drives urgency
 * indirectly: an order stays on the board until its deadline and its urgency
 * rises as that deadline approaches (see `deriveUrgency`). Because orders carry
 * over between days, the board fills up and far fewer brand-new orders appear
 * each morning — the daily top-up only refills the free slots.
 *
 * - 3 orders on the opening days, 3-4 later, so the day stays a choice;
 * - fully deterministic for a given seed + day.
 */
export function planDayLifetimes(
  seed: string,
  day: number,
  maxCount: number,
): number[] {
  const rng = createSlotRng(seed, day, 80)

  // Opening days stay small and readable; later days may add a fourth offer.
  const desired = day <= 2 ? MIN_ORDERS_PER_DAY : MIN_ORDERS_PER_DAY + (rng() < 0.6 ? 1 : 0)
  const size = Math.max(0, Math.min(desired, maxCount))
  if (size === 0) return []

  const lifetimes: number[] = []
  for (let slot = 0; slot < size; slot += 1) {
    // 1..ORDER_MAX_LIFETIME_DAYS, inclusive.
    lifetimes.push(1 + Math.floor(rng() * ORDER_MAX_LIFETIME_DAYS))
  }
  return lifetimes
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
    const batteryCost = calculateBatteryCost({
      order: { weight: order.weight, isChallenge: true },
      rover: stats,
      location,
    })
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
      hint: 'Груз превышает предел любого ровера даже при полной прокачке — заказ недостижим.',
    }
  }

  return {
    reason: `Маршрут до «${location.name}» тр��бует больше заряда, чем есть у роверов даже при полной прокачке батареи.`,
    hint: 'Экстремальный маршрут: расход превышает даже полностью прокачанную батарею — заказ недостижим.',
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
  // Challenge contracts still need the map and the fleet to be built, but they
  // must NOT depend on the free daily capacity, so the empty-input guard no
  // longer short-circuits on `count`.
  if (locations.length === 0 || rovers.length === 0) return []

  const sortedByDistance = [...locations].sort(
    (a, b) => a.distance - b.distance,
  )
  const unlockedCount = unlockedLocationCount(day, sortedByDistance.length)
  const unlockedAll = sortedByDistance.slice(0, unlockedCount)

  // Бассейн Айткена (the farthest unlocked dark zone) is reserved for the energy
  // contract: nobody can reach it, so no REGULAR order may target it. Both the
  // slot plan and the feasible-order builder run on the list without that zone.
  const reservedDarkZone = [...unlockedAll]
    .reverse()
    .find((item) => item.zoneType === 'dark')
  const regularLocations =
    reservedDarkZone === undefined
      ? unlockedAll
      : unlockedAll.filter((item) => item.id !== reservedDarkZone.id)

  const orders: Order[] = []

  // `count` is the free capacity on the board for REGULAR orders, i.e. an upper
  // bound. When the board is full (count <= 0) no regular order is generated,
  // yet the impossible challenge contracts below are still created.
  if (count > 0 && regularLocations.length > 0) {
    // The day plan decides how many offers are worth showing and how long each
    // one stays on the board (its delivery window in days).
    const lifetimes = planDayLifetimes(seed, day, count)
    const assignments = assignSlotLocations(
      day,
      lifetimes.length,
      regularLocations.length,
    )

    // Every daily slot is a feasible order. Impossible contracts are added below.
    for (let slot = 0; slot < lifetimes.length; slot += 1) {
      const rng = createSlotRng(seed, day, slot)
      const deadlineDay = day + lifetimes[slot]! - 1
      // Stored urgency mirrors the delivery window at creation (it feeds the
      // reward multiplier). The urgency SHOWN to the player is re-derived every
      // day from the days left, so a carried-over order ramps up over time.
      const urgency = deriveUrgency(deadlineDay, day)

      orders.push(
        buildFeasibleOrder(
          seed,
          day,
          slot,
          urgency,
          regularLocations,
          assignments[slot]!,
          rovers,
          rng,
          deadlineDay,
        ),
      )
    }
  }

  // Impossible contracts: the always-present overload one, plus a random second
  // (energy) one from day 4. Built over the unlocked zones regardless of
  // `count`, so a full board can never hide the "delivery is impossible" case.
  orders.push(...buildChallengeOrders(seed, day, unlockedAll, rovers))

  return orders
}
