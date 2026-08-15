/**
 * Game constants.
 *
 * Units used across the domain layer:
 * - distance: kilometres (km)
 * - weight / capacity: kilograms (kg)
 * - speed: km per hour (km/h)
 * - battery: integer percent points (0-capacity)
 * - duration: whole hours, rounded up
 * - risk: integer percent points (0-90)
 * - credits / reward: whole credits
 * - rating: integer points (0-100)
 */

/** Lowest possible battery charge. Battery must never go below this value. */
export const MIN_BATTERY = 0

/** Default battery capacity a rover has before any battery upgrade. */
export const MAX_BATTERY = 100

/** Battery points spent per kilogram of cargo, before rover efficiency. */
export const CARGO_BATTERY_COST_PER_KG = 0.25

/** Risk points added when the rover is loaded to 100% of its capacity. */
export const LOAD_RATIO_RISK_WEIGHT = 10

/** Lowest possible risk value in percent points. */
export const MIN_RISK_PERCENT = 0

/** Highest possible risk value in percent points. */
export const MAX_RISK_PERCENT = 90

/** Percent scale used to convert a risk value into a probability. */
export const PERCENT_SCALE = 100

/** Lowest possible rating. */
export const MIN_RATING = 0

/** Highest possible rating. */
export const MAX_RATING = 100

/**
 * Loss threshold for a new campaign. The session is lost the moment the rating
 * drops below this value. Applied to a new game (reset / seed); an already
 * saved session keeps the minimumRating it was created with.
 */
export const DEFAULT_MINIMUM_RATING = 40

/**
 * Rating at or above which the base is considered stable. Below it (but at or
 * above the minimum) the base is «под угрозой». This is a UI-facing band only
 * and never changes win/lose logic, which is driven by minimumRating.
 */
export const RATING_STABLE_THRESHOLD = 70

/** Rating points gained after a successful delivery. */
export const RATING_GAIN_ON_SUCCESS = 2

/** Rating points lost after a failed delivery. */
export const RATING_LOSS_ON_FAILURE = 12

/** Rating points lost for every order that expires at the end of a day. */
export const RATING_LOSS_ON_EXPIRED_ORDER = 5

/** Extra rating points lost when the expired order was critical. */
export const RATING_LOSS_ON_EXPIRED_CRITICAL_ORDER = 10

/**
 * Rating change per delivery outcome, keyed by urgency (Game Design v3).
 * A success raises the rating by `success`; a failure or an expiry lowers it
 * by `failure`. These replace the flat RATING_GAIN/LOSS constants above.
 */
export const RATING_DELTAS: Record<
  'normal' | 'urgent' | 'critical',
  { readonly success: number; readonly failure: number }
> = {
  normal: { success: 1, failure: 2 },
  urgent: { success: 2, failure: 5 },
  critical: { success: 3, failure: 10 },
}

/** earnedCredits needed to reach the Silver final rank. */
export const RANK_SILVER_THRESHOLD = 9000
/** earnedCredits needed to reach the Gold final rank. */
export const RANK_GOLD_THRESHOLD = 13000
/** earnedCredits needed to reach the Platinum final rank. */
export const RANK_PLATINUM_THRESHOLD = 17000

/**
 * Fraction of batteryCapacity restored to every parked rover when a day ends.
 * Night recharge = ceil(batteryCapacity * NIGHT_RECHARGE_RATIO).
 */
export const NIGHT_RECHARGE_RATIO = 0.5

/** @deprecated Use NIGHT_RECHARGE_RATIO with batteryCapacity instead. */
export const BATTERY_RECHARGE_PER_DAY = 40

/** Number of most recent events exposed through the game state DTO. */
export const RECENT_EVENTS_LIMIT = 12

/** Maximum level for every independent rover upgrade attribute. */
export const MAX_UPGRADE_LEVEL = 2

/** Battery-capacity points added per battery upgrade level. */
export const BATTERY_CAPACITY_PER_LEVEL = 25

/** Cargo-capacity kilograms added per capacity upgrade level. */
export const CARGO_CAPACITY_PER_LEVEL = 15

/** Multiplicative efficiency base applied per efficiency upgrade level. */
export const EFFICIENCY_UPGRADE_BASE = 1.12

/** Risk points removed per safety upgrade level. */
export const SAFETY_RISK_REDUCTION_PER_LEVEL = 8

/** Multiplicative simulation-speed base applied per speed upgrade level. */
export const SPEED_MULTIPLIER_BASE = 0.8

// --- Engineering bay & rover upgrades ---------------------------------------

/** First day on which the Engineering bay (upgrades) becomes available. */
export const ENGINEERING_BAY_UNLOCK_DAY = 2

/** The five independent rover upgrade attributes. */
export const UPGRADE_TYPES = [
  'battery',
  'cargo',
  'efficiency',
  'safety',
  'speed',
] as const
export type UpgradeType = (typeof UPGRADE_TYPES)[number]

/**
 * Credit cost per upgrade type, indexed by the level being purchased minus one
 * (index 0 = cost to reach level 1, index 1 = cost to reach level 2). Every
 * price and effect of an upgrade lives here in the domain layer.
 */
export const UPGRADE_COSTS: Record<UpgradeType, readonly [number, number]> = {
  battery: [900, 1900],
  cargo: [800, 1700],
  efficiency: [1100, 2300],
  safety: [950, 2000],
  speed: [750, 1600],
}

/**
 * Absolute effective cargo capacity (kg) per rover, indexed by upgrade level
 * (0, 1, 2). Cargo growth is per-rover and non-linear, so it cannot be a single
 * per-level delta; index 0 always equals the rover's seeded base capacity.
 * Rovers absent from this table fall back to CARGO_CAPACITY_PER_LEVEL.
 */
export const CARGO_CAPACITY_BY_ROVER: Record<
  string,
  readonly [number, number, number]
> = {
  'rover-scout-01': [20, 25, 30],
  'rover-sprint-03': [35, 43, 50],
  'rover-cargo-02': [60, 75, 90],
}

/** Real simulation seconds represented by one in-game duration hour. */
export const SIMULATION_SECONDS_PER_HOUR = 4

/** Lowest possible delivery simulation length in seconds. */
export const MIN_SIMULATION_SECONDS = 8

/** Highest possible delivery simulation length in seconds. */
export const MAX_SIMULATION_SECONDS = 40

// --- Rover charging service ------------------------------------------------

/** Maximum energy units added by quick charge operation. */
export const QUICK_CHARGE_AMOUNT = 25

/** Credit cost per energy unit when charging a rover. */
export const CHARGE_COST_PER_UNIT = 4

// --- Daily order generation & operation limits ------------------------------

/** Orders created at reset and at the start of every new day. */
export const ORDERS_PER_DAY = 4

/** Hard cap on simultaneously active (available or in-progress) orders. */
export const MAX_ACTIVE_ORDERS = 6

/** Deliveries a player may start per day. Failed deliveries also count. */
export const MAX_OPERATIONS_PER_DAY = 3

/** Rating lost when a day is ended early (fewer than the required operations). */
export const EARLY_END_RATING_PENALTY = 10

/** How many days an order stays available, keyed by urgency. */
export const ORDER_LIFETIME_DAYS: Record<'normal' | 'urgent' | 'critical', number> = {
  critical: 1,
  urgent: 2,
  normal: 3,
}

// Reward model: reward is DERIVED from distance, weight, urgency and risk and
// grows with the day number; it is never an independent random draw.
/** Reward credits earned per kilometre of distance. */
export const REWARD_PER_KM = 9
/** Reward credits earned per kilogram of cargo. */
export const REWARD_PER_KG = 7
/** Multiplier applied to the reward per urgency level. */
export const REWARD_URGENCY_MULTIPLIER: Record<'normal' | 'urgent' | 'critical', number> = {
  normal: 1,
  urgent: 1.15,
  critical: 1.3,
}
/** Weight of the route risk in the reward (reward *= 1 + risk/100 * weight). */
export const REWARD_RISK_WEIGHT = 1
/** Reward growth per day (reward *= 1 + (day - 1) * growth). */
export const REWARD_DAY_GROWTH = 0.15

// Difficulty scaling for generated cargo weight and base risk.
/** Minimum cargo weight of any generated order in kilograms. */
export const ORDER_MIN_WEIGHT = 3
/** Base cargo weight in kilograms before day scaling. */
export const ORDER_BASE_WEIGHT = 8
/** Extra cargo weight in kilograms added per day. */
export const ORDER_WEIGHT_PER_DAY = 3
/** Deterministic cargo-weight jitter range in kilograms. */
export const ORDER_WEIGHT_JITTER = 8
/** Base order risk in percent points before day scaling. */
export const ORDER_BASE_RISK = 4
/** Extra order risk in percent points added per day. */
export const ORDER_RISK_PER_DAY = 2
/** Deterministic order-risk jitter range in percent points. */
export const ORDER_RISK_JITTER = 6
