import { describe, expect, it } from 'vitest'
import {
  NIGHT_RECHARGE_RATIO,
  MAX_BATTERY,
  RATING_DELTAS,
} from '../../src/domain/constants'
import { ceilToInt } from '../../src/domain/math'
import { resolveEndOfDay } from '../../src/domain/endDay'
import { CHALLENGE_DEADLINE_DAY } from '../../src/domain/orderGeneration'
import { makeOrder, makeRover, makeSession } from '../support/fixtures'

describe('resolveEndOfDay', () => {
  it('requirement 13: marks orders whose deadline is now in the past', () => {
    const outcome = resolveEndOfDay({
      session: makeSession({ currentDay: 2 }),
      orders: [
        makeOrder({ id: 'expiring', deadlineDay: 2 }),
        makeOrder({ id: 'still-open', deadlineDay: 3 }),
        makeOrder({
          id: 'already-done',
          deadlineDay: 1,
          status: 'completed',
        }),
      ],
      rovers: [],
    })

    expect(outcome.nextDay).toBe(3)
    expect(outcome.expiredOrderIds).toEqual(['expiring'])
  })

  it('charges the critical failure for any order left to expire', () => {
    // An order can only ever expire on the day it is already "due today", so
    // its live urgency (and its card) is always critical at that point. The
    // penalty ignores the urgency the order was stored with at creation and
    // always costs the critical failure (-10), matching what the player sees.
    const session = makeSession({ currentDay: 2, rating: 100 })

    const storedNormal = resolveEndOfDay({
      session,
      orders: [makeOrder({ id: 'a', deadlineDay: 2, urgency: 'normal' })],
      rovers: [],
    })
    const storedCritical = resolveEndOfDay({
      session,
      orders: [makeOrder({ id: 'b', deadlineDay: 2, urgency: 'critical' })],
      rovers: [],
    })

    expect(storedNormal.ratingAfter).toBe(100 - RATING_DELTAS.critical.failure)
    expect(storedCritical.ratingAfter).toBe(100 - RATING_DELTAS.critical.failure)
  })

  it('keeps the permanent contract alive on the very last day', () => {
    // The permanent contract carries the "delivery is impossible" scenario, so
    // it must still be on the board whenever someone opens the game.
    const outcome = resolveEndOfDay({
      session: makeSession({ currentDay: 11, rating: 100 }),
      orders: [
        makeOrder({
          id: 'challenge',
          deadlineDay: CHALLENGE_DEADLINE_DAY,
          urgency: 'normal',
          isChallenge: true,
        }),
        makeOrder({ id: 'regular', deadlineDay: 11, urgency: 'normal' }),
      ],
      rovers: [],
    })

    // Only the regular order expires; the contract survives to the last day.
    // It lapses on its own deadline day, so it is charged the critical penalty.
    expect(outcome.expiredOrderIds).toEqual(['regular'])
    expect(outcome.ratingAfter).toBe(100 - RATING_DELTAS.critical.failure)
  })

  it('lets a periodic contract expire, but never charges rating for it', () => {
    // The recurring contract DOES leave the board - that is what keeps the
    // number of impossible orders varying from day to day. Letting it lapse
    // must still be free: the player had no way to deliver it.
    const outcome = resolveEndOfDay({
      session: makeSession({ currentDay: 3, rating: 100 }),
      orders: [
        makeOrder({
          id: 'challenge',
          deadlineDay: 3,
          urgency: 'normal',
          isChallenge: true,
        }),
      ],
      rovers: [],
    })

    expect(outcome.expiredOrderIds).toEqual(['challenge'])
    expect(outcome.ratingAfter).toBe(100)
  })

  it('two expired critical orders reduce the rating by 20 in total', () => {
    const outcome = resolveEndOfDay({
      session: makeSession({ currentDay: 2, rating: 100 }),
      orders: [
        makeOrder({ id: 'crit-1', deadlineDay: 2, urgency: 'critical' }),
        makeOrder({ id: 'crit-2', deadlineDay: 2, urgency: 'critical' }),
      ],
      rovers: [],
    })

    expect(outcome.expiredOrderIds).toEqual(['crit-1', 'crit-2'])
    expect(outcome.ratingAfter).toBe(100 - 2 * RATING_DELTAS.critical.failure)
    expect(outcome.ratingAfter).toBe(80)
  })

  it('does not re-penalize orders that already expired (idempotent re-processing)', () => {
    const outcome = resolveEndOfDay({
      session: makeSession({ currentDay: 3, rating: 80 }),
      orders: [
        makeOrder({
          id: 'crit-1',
          deadlineDay: 1,
          urgency: 'critical',
          status: 'expired',
        }),
        makeOrder({
          id: 'crit-2',
          deadlineDay: 1,
          urgency: 'critical',
          status: 'expired',
        }),
      ],
      rovers: [],
    })

    // Already-expired orders leave the 'available' status, so a repeated
    // end-day (or a GET that re-resolves) never deducts the penalty twice.
    expect(outcome.expiredOrderIds).toEqual([])
    expect(outcome.ratingAfter).toBe(80)
  })

  it('recharges parked rovers without exceeding the maximum', () => {
    const outcome = resolveEndOfDay({
      session: makeSession({ currentDay: 1 }),
      orders: [],
      rovers: [
        makeRover({ id: 'low', batteryCharge: 10, status: 'idle' }),
        makeRover({ id: 'full', batteryCharge: MAX_BATTERY, status: 'idle' }),
        makeRover({ id: 'busy', batteryCharge: 20, status: 'delivering' }),
      ],
    })

    expect(outcome.batteryUpdates).toEqual([
      { roverId: 'low', batteryAfter: 10 + ceilToInt(100 * NIGHT_RECHARGE_RATIO) },
    ])
  })

  it('does not win before the final day of the campaign', () => {
    const outcome = resolveEndOfDay({
      session: makeSession({ currentDay: 5, maxDays: 12, rating: 80 }),
      orders: [],
      rovers: [],
    })

    expect(outcome.nextDay).toBe(6)
    expect(outcome.sessionStatus).toBe('active')
  })

  it('finale after day 12: completing the last day wins with rating >= 60', () => {
    const outcome = resolveEndOfDay({
      session: makeSession({ currentDay: 12, maxDays: 12, rating: 80 }),
      orders: [],
      rovers: [],
    })

    expect(outcome.nextDay).toBe(13)
    expect(outcome.sessionStatus).toBe('won')
  })

  it('loses immediately once expiry drops the rating below the minimum', () => {
    const outcome = resolveEndOfDay({
      session: makeSession({ currentDay: 2, rating: 61, minimumRating: 60 }),
      orders: [makeOrder({ id: 'x', deadlineDay: 2, urgency: 'normal' })],
      rovers: [],
    })

    expect(outcome.ratingAfter).toBe(51)
    expect(outcome.sessionStatus).toBe('lost')
  })
})
