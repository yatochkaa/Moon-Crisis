/**
 * Pure end-of-day resolution.
 *
 * Steps (all pure, no I/O):
 * 1. the day counter moves to `currentDay + 1`;
 * 2. every still available order whose deadline is now in the past expires;
 * 3. expired orders reduce the rating (critical orders cost more);
 * 4. every parked rover (idle or charging) recharges by
 *    ceil(batteryCapacity * NIGHT_RECHARGE_RATIO), capped at its effective
 *    battery capacity, so the free recharge scales with battery upgrades;
 * 5. the session status is re-evaluated.
 */

import {
  MAX_RATING,
  MIN_BATTERY,
  MIN_RATING,
  NIGHT_RECHARGE_RATIO,
  RATING_DELTAS,
} from './constants'
import { ceilToInt, clamp } from './math'
import { evaluateSessionStatus } from './outcome'
import { computeRoverStats } from './roverStats'
import type { EndOfDayResult, GameSession, Order, Rover } from './types'

export type EndOfDayInput = {
  readonly session: GameSession
  readonly orders: readonly Order[]
  readonly rovers: readonly Rover[]
  /**
   * Extra rating penalty applied when the day is ended early (the player ran
   * fewer than the required number of operations). Defaults to 0.
   */
  readonly earlyEndPenalty?: number
}

export function resolveEndOfDay({
  session,
  orders,
  rovers,
  earlyEndPenalty = 0,
}: EndOfDayInput): EndOfDayResult {
  const nextDay = session.currentDay + 1

  const expiredOrders = orders.filter(
    (order) => order.status === 'available' && order.deadlineDay < nextDay,
  )

  // Challenge contracts never lower the rating when they simply expire (req 9).
  const ratingPenalty = expiredOrders.reduce(
    (total, order) =>
      order.isChallenge ? total : total + RATING_DELTAS[order.urgency].failure,
    0,
  )

  const ratingAfter = clamp(
    session.rating - ratingPenalty - earlyEndPenalty,
    MIN_RATING,
    MAX_RATING,
  )

  const batteryUpdates = rovers
    .filter((rover) => rover.status === 'idle' || rover.status === 'charging')
    .map((rover) => {
      const stats = computeRoverStats(rover)
      const rechargeAmount = ceilToInt(stats.batteryCapacity * NIGHT_RECHARGE_RATIO)
      return {
        roverId: rover.id,
        batteryAfter: clamp(
          rover.batteryCharge + rechargeAmount,
          MIN_BATTERY,
          stats.batteryCapacity,
        ),
      }
    })
    .filter((update) => {
      const rover = rovers.find((item) => item.id === update.roverId)
      return rover !== undefined && rover.batteryCharge !== update.batteryAfter
    })

  const sessionStatus = evaluateSessionStatus({
    rating: ratingAfter,
    minimumRating: session.minimumRating,
    currentDay: nextDay,
    maxDays: session.maxDays,
  })

  return {
    nextDay,
    expiredOrderIds: expiredOrders.map((order) => order.id),
    ratingAfter,
    batteryUpdates,
    sessionStatus,
  }
}
