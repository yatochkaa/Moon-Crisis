/**
 * Game types and runtime type guards.
 *
 * SQLite stores enum-like values as TEXT, so the guards below are the single
 * source of truth for allowed values inside the application.
 */

export const SESSION_STATUSES = ['active', 'won', 'lost'] as const
export type SessionStatus = (typeof SESSION_STATUSES)[number]

export const ZONE_TYPES = ['plain', 'crater', 'dark'] as const
export type ZoneType = (typeof ZONE_TYPES)[number]

export const ROVER_STATUSES = [
  'idle',
  'delivering',
  'charging',
  'damaged',
] as const
export type RoverStatus = (typeof ROVER_STATUSES)[number]

// Game Design v2: urgency values were renamed from low | medium | critical.
// The DTO layer still exposes the legacy values for temporary compatibility.
export const ORDER_URGENCIES = ['normal', 'urgent', 'critical'] as const
export type OrderUrgency = (typeof ORDER_URGENCIES)[number]

export const ORDER_STATUSES = [
  'available',
  'in_progress',
  'completed',
  'failed',
  'expired',
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const DELIVERY_RESULTS = ['success', 'failed'] as const
export type DeliveryResult = (typeof DELIVERY_RESULTS)[number]

// Game Design v2: a delivery now has a lifecycle. In this first iteration the
// delivery is still resolved immediately, so a persisted delivery is always
// "completed" or "failed"; "in_transit" is reserved for the next iteration.
export const DELIVERY_STATUSES = ['in_transit', 'completed', 'failed'] as const
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]

export const GAME_EVENT_TYPES = [
  'delivery_success',
  'delivery_failed',
  'day_ended',
  'order_expired',
  'rover_upgraded',
  'game_won',
  'game_lost',
  'game_reset',
] as const
export type GameEventType = (typeof GAME_EVENT_TYPES)[number]

function createGuard<T extends string>(
  allowed: readonly T[],
): (value: unknown) => value is T {
  const set = new Set<string>(allowed)
  return (value: unknown): value is T =>
    typeof value === 'string' && set.has(value)
}

export const isSessionStatus = createGuard(SESSION_STATUSES)
export const isZoneType = createGuard(ZONE_TYPES)
export const isRoverStatus = createGuard(ROVER_STATUSES)
export const isOrderUrgency = createGuard(ORDER_URGENCIES)
export const isOrderStatus = createGuard(ORDER_STATUSES)
export const isDeliveryResult = createGuard(DELIVERY_RESULTS)
export const isDeliveryStatus = createGuard(DELIVERY_STATUSES)
export const isGameEventType = createGuard(GAME_EVENT_TYPES)

/** Active game run. */
export type GameSession = {
  readonly id: string
  readonly currentDay: number
  readonly maxDays: number
  /** Spendable wallet. Rewards are added here; upgrades will be paid from here. */
  readonly balanceCredits: number
  /** Lifetime credits earned. Never decreases; the win condition checks this. */
  readonly earnedCredits: number
  readonly targetCredits: number
  readonly rating: number
  readonly minimumRating: number
  /** Deliveries started on the current day so far (failures included). */
  readonly operationsToday: number
  readonly status: SessionStatus
}

/**
 * Delivery destination.
 *
 * Named `MoonLocation` on purpose: `Location` collides with the DOM global.
 */
export type MoonLocation = {
  readonly id: string
  readonly name: string
  readonly x: number
  readonly y: number
  /** Distance from the base in kilometres. */
  readonly distance: number
  readonly zoneType: ZoneType
  readonly batteryModifier: number
  readonly speedModifier: number
  /** Additional risk in percent points. */
  readonly riskBonus: number
}

/**
 * A rover.
 *
 * Game Design v2 split `battery` into `batteryCharge` (current) and
 * `batteryCapacity` (maximum before upgrades). `capacity`, `speed`,
 * `efficiency` and `batteryCapacity` are BASE values; the effective values used
 * by every calculation come from `computeRoverStats` applied on top of the
 * per-attribute upgrade levels.
 */
export type Rover = {
  readonly id: string
  readonly name: string
  /** Current battery charge in percent points. */
  readonly batteryCharge: number
  /** Base maximum battery charge in percent points (before the battery upgrade). */
  readonly batteryCapacity: number
  /** Base cargo capacity in kilograms. */
  readonly capacity: number
  /** Base speed in km/h. */
  readonly speed: number
  /** Base efficiency multiplier, higher means less battery per km. */
  readonly efficiency: number
  /** Cargo-capacity upgrade level (0 = no upgrade). */
  readonly capacityLevel: number
  /** Speed upgrade level (0 = no upgrade). */
  readonly speedLevel: number
  /** Efficiency upgrade level (0 = no upgrade). */
  readonly efficiencyLevel: number
  /** Battery-capacity upgrade level (0 = no upgrade). */
  readonly batteryLevel: number
  /** Safety upgrade level (0 = no upgrade). Reduces delivery risk. */
  readonly safetyLevel: number
  readonly status: RoverStatus
}

/**
 * Effective rover characteristics after upgrades.
 *
 * Every delivery calculation (battery cost, duration, risk) and every
 * eligibility rule uses these effective values instead of the raw base ones.
 */
export type RoverStats = {
  /** Effective cargo capacity in kilograms. */
  readonly capacity: number
  /** Effective maximum battery charge in percent points. */
  readonly batteryCapacity: number
  /** Effective battery efficiency multiplier. */
  readonly efficiency: number
  /** Risk points removed from a delivery by safety upgrades. */
  readonly safetyRiskReduction: number
  /** Simulation-time multiplier from speed upgrades (0 < value <= 1). */
  readonly speedMultiplier: number
}

export type Order = {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly locationId: string
  /** Cargo weight in kilograms. */
  readonly weight: number
  /** Reward in credits. */
  readonly reward: number
  readonly urgency: OrderUrgency
  /** Base risk in percent points. */
  readonly baseRisk: number
  /** Last game day on which the order can be delivered. */
  readonly deadlineDay: number
  /** Whether the order is a challenge contract (special feasibility & scoring). */
  readonly isChallenge: boolean
  readonly status: OrderStatus
}

/** Everything the pure rules need to judge one delivery attempt. */
export type DeliveryContext = {
  readonly session: GameSession
  readonly order: Order
  readonly rover: Rover
  readonly location: MoonLocation
}

/** Server-calculated numbers for one delivery attempt. */
export type DeliveryEstimate = {
  /** Battery points that will be charged. */
  readonly batteryCost: number
  /** Duration in whole hours. */
  readonly duration: number
  /** Risk in percent points (0-90). */
  readonly risk: number
  /** Reward in credits, taken from the order. */
  readonly reward: number
}

// Game Design v2 split the single battery reason into two:
// - CAPACITY_EXCEEDED: the cargo weight is heavier than the effective capacity;
// - ROUTE_EXCEEDS_CAPACITY: the route needs more charge than the battery can
//   ever hold (impossible even fully charged);
// - INSUFFICIENT_CHARGE: the current charge is too low right now.
export const DELIVERY_BLOCK_REASONS = [
  'SESSION_FINISHED',
  'ORDER_NOT_AVAILABLE',
  'ROVER_NOT_IDLE',
  'CAPACITY_EXCEEDED',
  'ROUTE_EXCEEDS_CAPACITY',
  'INSUFFICIENT_CHARGE',
  'DEADLINE_PASSED',
  'DUPLICATE_REQUEST',
  // The player has already started the maximum number of deliveries today.
  'OPERATION_LIMIT_REACHED',
] as const
export type DeliveryBlockReason = (typeof DELIVERY_BLOCK_REASONS)[number]

export type DeliveryEligibility = {
  readonly canStart: boolean
  readonly reasons: readonly DeliveryBlockReason[]
}

/** State changes produced by one resolved delivery. */
export type DeliveryEffects = {
  readonly result: DeliveryResult
  /** Rover battery charge after the delivery. */
  readonly batteryAfter: number
  readonly creditsAwarded: number
  /** Spendable balance after the reward was applied. */
  readonly balanceCreditsAfter: number
  /** Lifetime earned credits after the reward was applied. */
  readonly earnedCreditsAfter: number
  readonly ratingAfter: number
  readonly orderStatus: OrderStatus
  readonly roverStatus: RoverStatus
  readonly sessionStatus: SessionStatus
}

/** Result of ending a game day. */
export type EndOfDayResult = {
  readonly nextDay: number
  readonly expiredOrderIds: readonly string[]
  readonly ratingAfter: number
  readonly batteryUpdates: readonly {
    readonly roverId: string
    readonly batteryAfter: number
  }[]
  readonly sessionStatus: SessionStatus
}
