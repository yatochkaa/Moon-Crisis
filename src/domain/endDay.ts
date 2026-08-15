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
import { CHALLENGE_DEADLINE_DAY, deriveUrgency } from './orderGeneration'
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

  // The PERMANENT challenge contract carries the "delivery is impossible"
  // scenario and must stay visible on every day of the run, so it never
  // expires. Periodic challenge contracts have a real deadline and do leave the
  // board, which is what keeps the number of impossible orders varying.
  const expiredOrders = orders.filter(
    (order) =>
      order.status === 'available' &&
      order.deadlineDay !== CHALLENGE_DEADLINE_DAY &&
      order.deadlineDay < nextDay,
  )

  // An impossible contract must never cost rating: the player had no way to
  // deliver it, so letting it lapse is not a failure.
  // An expired order is, by definition, at or past its deadline on the day it
  // lapses, so the live urgency shown on its card is always "critical" (due
  // today). The penalty is therefore derived from that live urgency instead of
  // the urgency the order was stored with at creation, so "what you see on the
  // card is what you pay": every regular order left to expire costs the
  // critical failure penalty (-10), never the smaller stored-normal one.
  const ratingPenalty = expiredOrders.reduce(
    (total, order) =>
      order.isChallenge
        ? total
        : total +
          RATING_DELTAS[deriveUrgency(order.deadlineDay, session.currentDay)]
            .failure,
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
