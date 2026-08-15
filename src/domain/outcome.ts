/**
 * Pure outcome resolution.
 *
 * Randomness is injected as a plain number (`roll`), never generated here, so
 * every outcome is deterministically testable. The server generates the roll
 * (see src/infrastructure/random.ts).
 */

import {
  MAX_RATING,
  MAX_RISK_PERCENT,
  MIN_BATTERY,
  MIN_RATING,
  MIN_RISK_PERCENT,
  PERCENT_SCALE,
  RANK_GOLD_THRESHOLD,
  RANK_PLATINUM_THRESHOLD,
  RANK_SILVER_THRESHOLD,
  RATING_DELTAS,
  RATING_STABLE_THRESHOLD,
} from './constants'
import { DomainInvariantError } from './errors'
import { clamp } from './math'
import { computeRoverStats } from './roverStats'
import type {
  DeliveryContext,
  DeliveryEffects,
  DeliveryEstimate,
  DeliveryResult,
  SessionStatus,
} from './types'

/**
 * Resolves a delivery result.
 *
 * @param risk Risk in percent points (0-90).
 * @param roll Uniform random number in [0, 1) provided by the caller.
 *   The delivery fails when `roll` lands below the risk threshold.
 */
export function resolveDeliveryResult(
  risk: number,
  roll: number,
): DeliveryResult {
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) {
    throw new DomainInvariantError('roll must be a number in [0, 1)')
  }

  const threshold =
    clamp(risk, MIN_RISK_PERCENT, MAX_RISK_PERCENT) / PERCENT_SCALE

  return roll < threshold ? 'failed' : 'success'
}

export type SessionOutcomeInput = {
  readonly rating: number
  readonly minimumRating: number
  readonly currentDay: number
  readonly maxDays: number
}

/**
 * Win / lose evaluation (Game Design v3).
 *
 * There is no early credits win any more: the campaign is won only by
 * surviving every `maxDays` day with the rating still at or above the minimum.
 * A rating below the minimum loses immediately, at any point.
 *
 * Precedence: rating collapse -> campaign completed -> still running.
 */
export function evaluateSessionStatus(
  input: SessionOutcomeInput,
): SessionStatus {
  if (input.rating < input.minimumRating) return 'lost'
  if (input.currentDay > input.maxDays) return 'won'
  return 'active'
}

/** UI-facing rating band of the base. */
export type RatingState = 'stable' | 'at_risk' | 'lost'

/**
 * Classifies a rating into a UI band. This mirrors the loss threshold
 * (`minimumRating`) but adds the informational «stable» / «at risk» split at
 * RATING_STABLE_THRESHOLD. It never drives win/lose logic.
 *
 * - rating >= RATING_STABLE_THRESHOLD  -> 'stable'  («База стабильна»)
 * - minimumRating <= rating < stable   -> 'at_risk' («База под угрозой»)
 * - rating < minimumRating             -> 'lost'    («Эвакуация базы»)
 */
export function ratingState(
  rating: number,
  minimumRating: number,
): RatingState {
  if (rating < minimumRating) return 'lost'
  if (rating < RATING_STABLE_THRESHOLD) return 'at_risk'
  return 'stable'
}

/** Final ranks awarded on a win, ordered from lowest to highest. */
export const FINAL_RANKS = ['Bronze', 'Silver', 'Gold', 'Platinum'] as const
export type FinalRank = (typeof FINAL_RANKS)[number]

/** Maps lifetime earned credits to a final rank. */
export function computeFinalRank(earnedCredits: number): FinalRank {
  if (earnedCredits >= RANK_PLATINUM_THRESHOLD) return 'Platinum'
  if (earnedCredits >= RANK_GOLD_THRESHOLD) return 'Gold'
  if (earnedCredits >= RANK_SILVER_THRESHOLD) return 'Silver'
  return 'Bronze'
}

/**
 * Battery charge a rover has after a delivery. The cost is result-independent
 * (a failed run still drains the battery) and is applied exactly once, at
 * departure. Extracted so the start and the resolution stay consistent.
 */
export function computeBatteryAfterDelivery(
  context: DeliveryContext,
  estimate: DeliveryEstimate,
): number {
  const stats = computeRoverStats(context.rover)
  return clamp(
    context.rover.batteryCharge - estimate.batteryCost,
    MIN_BATTERY,
    stats.batteryCapacity,
  )
}

/**
 * Applies one delivery result to the current state.
 *
 * A delivery is resolved immediately inside the same game day: the duration is
 * informational, the rover returns to `idle` and only its battery is charged.
 * The reward is added exactly once and only on success, to both the spendable
 * balance and the lifetime earned total.
 */
export function applyDeliveryEffects(
  context: DeliveryContext,
  estimate: DeliveryEstimate,
  result: DeliveryResult,
): DeliveryEffects {
  const { session } = context

  const batteryAfter = computeBatteryAfterDelivery(context, estimate)

  const isSuccess = result === 'success'
  const creditsAwarded = isSuccess ? estimate.reward : 0
  const balanceCreditsAfter = session.balanceCredits + creditsAwarded
  const earnedCreditsAfter = session.earnedCredits + creditsAwarded
  const ratingDelta = RATING_DELTAS[context.order.urgency]
  const ratingAfter = clamp(
    session.rating + (isSuccess ? ratingDelta.success : -ratingDelta.failure),
    MIN_RATING,
    MAX_RATING,
  )

  const sessionStatus = evaluateSessionStatus({
    rating: ratingAfter,
    minimumRating: session.minimumRating,
    currentDay: session.currentDay,
    maxDays: session.maxDays,
  })

  return {
    result,
    batteryAfter,
    creditsAwarded,
    balanceCreditsAfter,
    earnedCreditsAfter,
    ratingAfter,
    orderStatus: isSuccess ? 'completed' : 'failed',
    roverStatus: 'idle',
    sessionStatus,
  }
}
