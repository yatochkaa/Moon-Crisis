/**
 * Data transfer objects returned to the client.
 *
 * DTOs are explicit and free of internal fields (no timestamps of internal
 * rows, no idempotency keys, no database metadata beyond what the UI needs).
 *
 * Game Design v2 keeps the wire shape backward compatible on purpose: the
 * legacy fields `credits`, `battery` and the legacy `urgency` values are still
 * emitted so the current UI and e2e keep working, while the new fields are
 * added alongside them.
 */

import {
  applyUpgrade,
  calculateBatteryCost,
  calculateDuration,
  calculateSimulationSeconds,
  CHARGE_MODES,
  computeFinalRank,
  computeRoverStats,
  EFFICIENCY_UPGRADE_BASE,
  evaluateCharge,
  evaluateUpgrade,
  getUpgradeLevel,
  isOrderFeasible,
  MAX_OPERATIONS_PER_DAY,
  MAX_UPGRADE_LEVEL,
  nextUpgradeCost,
  QUICK_CHARGE_AMOUNT,
  SPEED_MULTIPLIER_BASE,
  UPGRADE_TYPES,
  upgradeStatValue,
} from '@/domain'
import type { ChargeBlockReason, ChargeMode, FinalRank, UpgradeType } from '@/domain'
import type { UpgradeBlockReason } from '@/domain/upgrades'
import {
  BLOCK_REASON_MESSAGES,
  CHARGE_BLOCK_REASON_MESSAGES,
  CHARGE_MODE_LABELS,
  UPGRADE_BLOCK_REASON_MESSAGES,
  UPGRADE_LABELS,
  UPGRADE_STAT_LABELS,
  UPGRADE_STAT_UNITS,
} from '@/shared/messages'
import type { DtoOrderUrgency } from '@/shared/messages'
import type {
  DeliveryBlockReason,
  DeliveryEstimate,
  DeliveryResult,
  GameEventType,
  GameSession,
  MoonLocation,
  Order,
  OrderStatus,
  OrderUrgency,
  Rover,
  RoverStats,
  RoverStatus,
  SessionStatus,
  ZoneType,
} from '@/domain/types'
import type { DeliveryRecord, GameEventRecord } from './ports'

/** Maps the new internal urgency values back to the legacy wire values. */
const URGENCY_TO_DTO: Record<OrderUrgency, DtoOrderUrgency> = {
  normal: 'low',
  urgent: 'medium',
  critical: 'critical',
}

export type BlockReasonDto = {
  readonly code: DeliveryBlockReason
  readonly message: string
}

export type SessionDto = {
  readonly id: string
  readonly currentDay: number
  readonly maxDays: number
  /** Spendable balance, kept as `credits` for backward compatibility. */
  readonly credits: number
  readonly balanceCredits: number
  readonly earnedCredits: number
  readonly targetCredits: number
  readonly rating: number
  readonly minimumRating: number
  /** Deliveries started today so far (failures included). */
  readonly operationsToday: number
  /** Maximum deliveries allowed per day. */
  readonly maxOperationsPerDay: number
  readonly status: SessionStatus
}

export type LocationDto = {
  readonly id: string
  readonly name: string
  readonly x: number
  readonly y: number
  readonly distance: number
  readonly zoneType: ZoneType
  readonly batteryModifier: number
  readonly speedModifier: number
  readonly riskBonus: number
}

export type RoverDto = {
  readonly id: string
  readonly name: string
  /** Current charge, kept as `battery` for backward compatibility. */
  readonly battery: number
  /** Base cargo capacity, kept for backward compatibility. */
  readonly capacity: number
  readonly speed: number
  readonly efficiency: number
  readonly status: RoverStatus
  readonly batteryCharge: number
  readonly batteryCapacity: number
  readonly capacityLevel: number
  readonly speedLevel: number
  readonly efficiencyLevel: number
  readonly batteryLevel: number
  readonly safetyLevel: number
  /** Effective characteristics after upgrades. */
  readonly stats: RoverStats
  /** Per-attribute upgrade state for the Engineering bay. */
  readonly upgrades: readonly RoverUpgradeDto[]
  /** Charging services offered for this rover, priced by the server. */
  readonly chargeOffers: readonly ChargeOfferDto[]
  /** Current charge as whole percent of the effective capacity. */
  readonly chargePercent: number
}

export type UpgradeBlockReasonDto = {
  readonly code: UpgradeBlockReason
  readonly message: string
}

export type RoverUpgradeDto = {
  readonly type: UpgradeType
  readonly label: string
  readonly statLabel: string
  readonly unit: string
  readonly currentLevel: number
  readonly maxLevel: number
  /** Effective characteristic at the current level. */
  readonly currentValue: number
  /** Effective characteristic after the next level, or null when maxed. */
  readonly nextValue: number | null
  /** Cost of the next level, or null when maxed. */
  readonly nextCost: number | null
  readonly canPurchase: boolean
  readonly reasons: readonly UpgradeBlockReasonDto[]
  /** Plain-language sentence describing what the next level changes. */
  readonly description: string
  /** Plain-language sentence describing why it matters for the game. */
  readonly benefit: string
  /**
   * Compact "characteristic: current → next unit" line, or null when the raw
   * numbers are meaningless to the player (efficiency) or the level is maxed.
   */
  readonly changeSummary: string | null
  /**
   * Understandable effect derived from the real formula, used where the raw
   * characteristic is not self-explanatory. Null when changeSummary is enough.
   */
  readonly effectSummary: string | null
  /** Concrete example computed from a real available order, when one exists. */
  readonly exampleSummary: string | null
  /** Title of a currently blocked contract this upgrade would unlock. */
  readonly unlocksOrderTitle: string | null
}

export type ChargeBlockReasonDto = {
  readonly code: ChargeBlockReason
  readonly message: string
}

/** One purchasable charging service for a rover. */
export type ChargeOfferDto = {
  readonly mode: ChargeMode
  readonly label: string
  readonly description: string
  /** Energy units that would actually be added right now. */
  readonly unitsAdded: number
  /** Exact price for those units, calculated by the server. */
  readonly cost: number
  readonly chargeBefore: number
  readonly chargeAfter: number
  readonly capacity: number
  readonly canCharge: boolean
  readonly reasons: readonly ChargeBlockReasonDto[]
}

export type OrderDto = {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly locationId: string
  readonly weight: number
  readonly reward: number
  /** Legacy urgency value kept for backward compatibility. */
  readonly urgency: DtoOrderUrgency
  readonly baseRisk: number
  readonly deadlineDay: number
  /** True when the order is a challenge contract. */
  readonly isChallenge: boolean
  /** UI label shown for challenge contracts, e.g. «Контракт-вызов». */
  readonly challengeLabel: string | null
  /** Why the challenge cannot be started now (challenge orders only). */
  readonly challengeReason: string | null
  /** Which upgrade unlocks the challenge (challenge orders only). */
  readonly challengeHint: string | null
  readonly status: OrderStatus
}

export type GameEventDto = {
  readonly id: string
  readonly type: GameEventType
  readonly title: string
  readonly description: string
  readonly day: number
  readonly createdAt: string
}

export type ActiveDeliveryDto = {
  readonly deliveryId: string
  readonly orderId: string
  readonly roverId: string
  readonly locationId: string
  /** ISO timestamp when the delivery started. */
  readonly startedAt: string
  /** ISO timestamp when the delivery completes (drives the countdown). */
  readonly completesAt: string
  readonly batteryCost: number
  readonly risk: number
  readonly reward: number
}

export type GameStateDto = {
  readonly session: SessionDto
  /**
   * Every in-transit delivery. Lets the client resume the countdown and the
   * marker position for all parallel missions after a page refresh.
   */
  readonly activeDeliveries: readonly ActiveDeliveryDto[]
  readonly base: { readonly x: number; readonly y: number }
  readonly locations: readonly LocationDto[]
  readonly rovers: readonly RoverDto[]
  readonly orders: readonly OrderDto[]
  readonly events: readonly GameEventDto[]
  /** Differentiated end-of-campaign panel; null while the game is active. */
  readonly finalResult: FinalResultDto | null
}

/** Differentiated final screen shown once the session is won or lost. */
export type FinalResultDto = {
  readonly outcome: 'won' | 'lost'
  readonly title: string
  readonly rating: number
  readonly earnedCredits: number
  readonly completedCount: number
  readonly failedCount: number
  readonly finalRank: FinalRank
  readonly summary: string
  readonly lossDay: number | null
  readonly lastRatingLossReason: string | null
}

export type DeliveryPreviewDto = {
  readonly orderId: string
  readonly roverId: string
  readonly canStart: boolean
  readonly batteryCost: number
  readonly duration: number
  readonly risk: number
  readonly reward: number
  readonly reasons: readonly BlockReasonDto[]
}

export type DeliveryResultDto = {
  readonly deliveryId: string
  readonly orderId: string
  readonly roverId: string
  /** Human-readable rover name, so parallel results stay self-describing. */
  readonly roverName: string
  /** Human-readable order title, so parallel results stay self-describing. */
  readonly orderTitle: string
  readonly result: DeliveryResult
  readonly batteryCost: number
  readonly duration: number
  /** Calculated risk used to resolve this delivery. */
  readonly risk: number
  readonly reward: number
  readonly creditsAwarded: number
  /** Rating change applied by this delivery (positive success, negative fail). */
  readonly ratingDelta: number
  /**
   * Intended rating bonus for a successful delivery (normal +1, urgent +2,
   * critical +3), before the 100-point cap. 0 for failed deliveries. Lets the
   * UI explain a capped bonus instead of showing a bare +0.
   */
  readonly ratingReward: number
  /** Spendable balance before this completion was applied. */
  readonly previousBalance: number
  /** Spendable balance after this completion was applied. */
  readonly newBalance: number
  /** True when an already-resolved delivery was completed again (no re-award). */
  readonly replayed: boolean
  readonly session: SessionDto
}

/** Result of a rover upgrade purchase, plus the recomputed game state. */
export type PurchaseUpgradeResultDto = {
  readonly roverId: string
  readonly roverName: string
  readonly upgradeType: UpgradeType
  readonly upgradeLabel: string
  readonly fromLevel: number
  readonly toLevel: number
  readonly cost: number
  readonly statLabel: string
  readonly statUnit: string
  readonly previousStatValue: number
  readonly newStatValue: number
  /** Full state after the purchase, so the challenge availability recomputes. */
  readonly state: GameStateDto
}

export type EndDayDto = {
  readonly session: SessionDto
  readonly expiredOrderIds: readonly string[]
  readonly rechargedRoverIds: readonly string[]
}

export function toSessionDto(session: GameSession): SessionDto {
  return {
    id: session.id,
    currentDay: session.currentDay,
    maxDays: session.maxDays,
    credits: session.balanceCredits,
    balanceCredits: session.balanceCredits,
    earnedCredits: session.earnedCredits,
    targetCredits: session.targetCredits,
    rating: session.rating,
    minimumRating: session.minimumRating,
    operationsToday: session.operationsToday,
    maxOperationsPerDay: MAX_OPERATIONS_PER_DAY,
    status: session.status,
  }
}

export function toLocationDto(location: MoonLocation): LocationDto {
  return {
    id: location.id,
    name: location.name,
    x: location.x,
    y: location.y,
    distance: location.distance,
    zoneType: location.zoneType,
    batteryModifier: location.batteryModifier,
    speedModifier: location.speedModifier,
    riskBonus: location.riskBonus,
  }
}

/** Formats a number without noisy trailing zeros: 1.2544 -> 1.25, 30 -> 30. */
function formatStat(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

/**
 * Extra context used to turn raw characteristics into sentences a player can
 * act on: a real available order gives concrete "before → after" examples and
 * shows which blocked contract an upgrade would unlock.
 */
export type UpgradeExplainContext = {
  readonly orders: readonly Order[]
  readonly locations: readonly MoonLocation[]
  /** The whole fleet, needed to tell "nobody can do this" from "this rover cannot". */
  readonly rovers: readonly Rover[]
}

/**
 * The cheapest available order this rover can actually perform, used as the
 * reference route for the energy and time examples. Null when none fits.
 */
function findReferenceRoute(
  rover: Rover,
  context: UpgradeExplainContext | undefined,
): { order: Order; location: MoonLocation } | null {
  if (context === undefined) return null
  const stats = computeRoverStats(rover)

  for (const order of context.orders) {
    if (order.status !== 'available') continue
    if (order.weight > stats.capacity) continue
    const location = context.locations.find((item) => item.id === order.locationId)
    if (location === undefined) continue
    const cost = calculateBatteryCost({ order, rover: stats, location })
    if (cost > stats.batteryCapacity) continue
    return { order, location }
  }
  return null
}

/**
 * Title of an available order that no rover can perform now but this rover
 * could after the upgrade. Uses the same feasibility math as the rules, so the
 * promise shown in the shop always matches what the server will allow.
 */
function findUnlockedOrderTitle(
  rover: Rover,
  type: UpgradeType,
  context: UpgradeExplainContext | undefined,
): string | null {
  if (context === undefined) return null
  const upgraded = applyUpgrade(rover, type)

  for (const order of context.orders) {
    if (order.status !== 'available') continue
    const location = context.locations.find((item) => item.id === order.locationId)
    if (location === undefined) continue
    if (isOrderFeasible(order, location, context.rovers)) continue
    if (isOrderFeasible(order, location, [upgraded])) return order.title
  }
  return null
}

type UpgradeExplanation = {
  readonly description: string
  readonly benefit: string
  readonly changeSummary: string | null
  readonly effectSummary: string | null
  readonly exampleSummary: string | null
}

/**
 * Turns one upgrade into player-facing sentences.
 *
 * Every number is derived from the domain constants and the real formulas:
 * - battery / cargo / safety / speed show the characteristic itself, because it
 *   is directly meaningful;
 * - efficiency deliberately hides the raw multiplier (a "КПД 0.90 → 1.01" line
 *   means nothing to a player) and shows the resulting energy saving instead,
 *   computed as 1 - 1 / EFFICIENCY_UPGRADE_BASE from the battery formula.
 */
function explainUpgrade(
  rover: Rover,
  type: UpgradeType,
  currentValue: number,
  nextValue: number | null,
  context: UpgradeExplainContext | undefined,
): UpgradeExplanation {
  const statLabel = UPGRADE_STAT_LABELS[type]
  const unit = UPGRADE_STAT_UNITS[type]
  const route = findReferenceRoute(rover, context)

  const change =
    nextValue === null
      ? null
      : `${statLabel}: ${formatStat(currentValue)} → ${formatStat(nextValue)}${
          unit === '' ? '' : ` ${unit}`
        }`

  switch (type) {
    case 'battery': {
      const delta = nextValue === null ? 0 : nextValue - currentValue
      return {
        description: `Максимальный запас энергии увеличится на ${delta} ед.`,
        benefit: 'Позволяет выполнять более дальние маршруты без подзарядки.',
        changeSummary: change,
        effectSummary: null,
        exampleSummary: null,
      }
    }

    case 'cargo': {
      return {
        description: 'Увеличивает максимальный вес груза.',
        benefit: 'Открывает более тяжёлые контракты.',
        changeSummary: change,
        effectSummary: null,
        exampleSummary: null,
      }
    }

    case 'efficiency': {
      // Battery cost is (distance * modifier + cargo) / efficiency, so raising
      // efficiency by the upgrade base cuts the cost to 1 / base of its value.
      const savingPercent = Math.round(
        (1 - 1 / EFFICIENCY_UPGRADE_BASE) * PERCENT_SCALE_FOR_TEXT,
      )
      let example: string | null = null
      if (route !== null && nextValue !== null) {
        const before = calculateBatteryCost({
          order: route.order,
          rover: { efficiency: currentValue },
          location: route.location,
        })
        const after = calculateBatteryCost({
          order: route.order,
          rover: { efficiency: nextValue },
          location: route.location,
        })
        example = `${route.location.name}: ${before} → ${after} ед. энергии`
      }
      return {
        description: `Расход энергии уменьшится примерно на ${savingPercent}%.`,
        benefit: 'Тот же маршрут обходится дешевле по заряду.',
        // The raw multiplier is intentionally not shown to the player.
        changeSummary: null,
        effectSummary:
          nextValue === null
            ? null
            : `Расход энергии: −${savingPercent}% на каждом маршруте`,
        exampleSummary: example,
      }
    }

    case 'safety': {
      const delta = nextValue === null ? 0 : nextValue - currentValue
      return {
        description: `Снижает риск каждой доставки на ${delta} процентных пунктов.`,
        benefit: 'Меньше проваленных доставок и потерь рейтинга.',
        changeSummary: change,
        effectSummary: null,
        exampleSummary: null,
      }
    }

    case 'speed': {
      const reductionPercent = Math.round(
        (1 - SPEED_MULTIPLIER_BASE) * PERCENT_SCALE_FOR_TEXT,
      )
      let example: string | null = null
      if (route !== null && nextValue !== null) {
        const duration = calculateDuration({
          rover: { speed: rover.speed },
          location: route.location,
        })
        const before = calculateSimulationSeconds(duration, rover.speedLevel)
        const after = calculateSimulationSeconds(duration, rover.speedLevel + 1)
        example = `Пример: ${before} → ${after} секунд`
      }
      return {
        description: `Сокращает время доставки на ${reductionPercent}%.`,
        benefit: 'Ровер быстрее возвращается на базу и успевает к дедлайнам.',
        changeSummary: change,
        effectSummary: null,
        exampleSummary: example,
      }
    }
  }
}

/** Percent scale used only to render percentages in explanation texts. */
const PERCENT_SCALE_FOR_TEXT = 100

function toRoverUpgradeDto(
  session: GameSession,
  rover: Rover,
  type: UpgradeType,
  context: UpgradeExplainContext | undefined,
): RoverUpgradeDto {
  const evaluation = evaluateUpgrade(session, rover, type)
  const currentValue = upgradeStatValue(rover, type)
  const nextValue =
    evaluation.cost === null ? null : upgradeStatValue(applyUpgrade(rover, type), type)
  const explanation = explainUpgrade(rover, type, currentValue, nextValue, context)

  return {
    type,
    label: UPGRADE_LABELS[type],
    statLabel: UPGRADE_STAT_LABELS[type],
    unit: UPGRADE_STAT_UNITS[type],
    currentLevel: getUpgradeLevel(rover, type),
    maxLevel: MAX_UPGRADE_LEVEL,
    currentValue,
    nextValue,
    nextCost: nextUpgradeCost(rover, type),
    canPurchase: evaluation.canPurchase,
    reasons: evaluation.reasons.map((reason) => ({
      code: reason,
      message: UPGRADE_BLOCK_REASON_MESSAGES[reason],
    })),
    description: explanation.description,
    benefit: explanation.benefit,
    changeSummary: explanation.changeSummary,
    effectSummary: explanation.effectSummary,
    exampleSummary: explanation.exampleSummary,
    unlocksOrderTitle:
      nextValue === null ? null : findUnlockedOrderTitle(rover, type, context),
  }
}

function toChargeOfferDto(
  session: GameSession,
  rover: Rover,
  mode: ChargeMode,
): ChargeOfferDto {
  const evaluation = evaluateCharge(session, rover, mode)
  return {
    mode,
    label: CHARGE_MODE_LABELS[mode],
    description:
      mode === 'quick'
        ? `Добавляет до ${QUICK_CHARGE_AMOUNT} ед. энергии.`
        : 'Восстанавливает заряд до максимальной ёмкости.',
    unitsAdded: evaluation.unitsAdded,
    cost: evaluation.cost,
    chargeBefore: evaluation.chargeBefore,
    chargeAfter: evaluation.chargeAfter,
    capacity: evaluation.capacity,
    canCharge: evaluation.canCharge,
    reasons: evaluation.reasons.map((reason) => ({
      code: reason,
      message: CHARGE_BLOCK_REASON_MESSAGES[reason],
    })),
  }
}

/**
 * Builds a rover DTO. When a session is supplied the per-upgrade purchasability
 * (day, balance, level, rover status) and the charging offers are evaluated for
 * the base shop. `context` adds the concrete examples and unlock hints.
 */
export function toRoverDto(
  rover: Rover,
  session?: GameSession,
  context?: UpgradeExplainContext,
): RoverDto {
  const stats = computeRoverStats(rover)
  return {
    id: rover.id,
    name: rover.name,
    battery: rover.batteryCharge,
    capacity: rover.capacity,
    speed: rover.speed,
    efficiency: rover.efficiency,
    status: rover.status,
    batteryCharge: rover.batteryCharge,
    batteryCapacity: stats.batteryCapacity,
    capacityLevel: rover.capacityLevel,
    speedLevel: rover.speedLevel,
    efficiencyLevel: rover.efficiencyLevel,
    batteryLevel: rover.batteryLevel,
    safetyLevel: rover.safetyLevel,
    stats,
    upgrades:
      session === undefined
        ? []
        : UPGRADE_TYPES.map((type) =>
            toRoverUpgradeDto(session, rover, type, context),
          ),
    chargeOffers:
      session === undefined
        ? []
        : CHARGE_MODES.map((mode) => toChargeOfferDto(session, rover, mode)),
    chargePercent:
      stats.batteryCapacity === 0
        ? 0
        : Math.round((rover.batteryCharge / stats.batteryCapacity) * 100),
  }
}

export function toOrderDto(
  order: Order,
  challenge: { reason: string; hint: string } | null = null,
): OrderDto {
  return {
    id: order.id,
    title: order.title,
    description: order.description,
    locationId: order.locationId,
    weight: order.weight,
    reward: order.reward,
    urgency: URGENCY_TO_DTO[order.urgency],
    baseRisk: order.baseRisk,
    deadlineDay: order.deadlineDay,
    isChallenge: order.isChallenge,
    challengeLabel: order.isChallenge ? 'Контракт-вызов' : null,
    challengeReason: challenge?.reason ?? null,
    challengeHint: challenge?.hint ?? null,
    status: order.status,
  }
}

/**
 * Builds the differentiated final screen. Returns null while the session is
 * still active. `events` must be newest-first (as listRecentEvents returns).
 */
export function toFinalResultDto(
  session: GameSession,
  orders: readonly Order[],
  events: readonly GameEventRecord[],
): FinalResultDto | null {
  if (session.status === 'active') return null

  const completedCount = orders.filter(
    (order) => order.status === 'completed',
  ).length
  const failedCount = orders.filter(
    (order) => order.status === 'failed',
  ).length
  const finalRank = computeFinalRank(session.earnedCredits)

  if (session.status === 'won') {
    return {
      outcome: 'won',
      title: 'Лунная база спасена',
      rating: session.rating,
      earnedCredits: session.earnedCredits,
      completedCount,
      failedCount,
      finalRank,
      summary: `Кампания пройдена: все ${session.maxDays} дней позади, рейтинг ${session.rating}.`,
      lossDay: null,
      lastRatingLossReason: null,
    }
  }

  const lastRatingLossReason =
    events.find(
      (event) =>
        event.type === 'delivery_failed' || event.type === 'order_expired',
    )?.description ?? null

  return {
    outcome: 'lost',
    title: 'Эвакуация базы',
    rating: session.rating,
    earnedCredits: session.earnedCredits,
    completedCount,
    failedCount,
    finalRank,
    summary: `Рейтинг опустился ниже минимума (${session.minimumRating}). База эвакуирована.`,
    lossDay: session.currentDay,
    lastRatingLossReason,
  }
}

export function toEventDto(event: GameEventRecord): GameEventDto {
  return {
    id: event.id,
    type: event.type,
    title: event.title,
    description: event.description,
    day: event.day,
    createdAt: event.createdAt.toISOString(),
  }
}

export function toActiveDeliveryDto(
  delivery: DeliveryRecord,
  locationId: string,
): ActiveDeliveryDto {
  return {
    deliveryId: delivery.id,
    orderId: delivery.orderId,
    roverId: delivery.roverId,
    locationId,
    startedAt: delivery.startedAt.toISOString(),
    completesAt: delivery.completesAt.toISOString(),
    batteryCost: delivery.calculatedBatteryCost,
    risk: delivery.calculatedRisk,
    reward: delivery.reward,
  }
}

export function toBlockReasonDtos(
  reasons: readonly DeliveryBlockReason[],
): BlockReasonDto[] {
  return reasons.map((reason) => ({
    code: reason,
    message: BLOCK_REASON_MESSAGES[reason],
  }))
}

export function toPreviewDto(
  orderId: string,
  roverId: string,
  estimate: DeliveryEstimate,
  canStart: boolean,
  reasons: readonly DeliveryBlockReason[],
): DeliveryPreviewDto {
  return {
    orderId,
    roverId,
    canStart,
    batteryCost: estimate.batteryCost,
    duration: estimate.duration,
    risk: estimate.risk,
    reward: estimate.reward,
    reasons: toBlockReasonDtos(reasons),
  }
}
