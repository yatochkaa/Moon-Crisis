import { describe, expect, it } from 'vitest'
import { calculateDeliveryEstimate } from '../../src/domain/calculations'
import { MIN_BATTERY, RATING_DELTAS } from '../../src/domain/constants'
import { DomainInvariantError } from '../../src/domain/errors'
import {
  applyDeliveryEffects,
  computeFinalRank,
  evaluateSessionStatus,
  resolveDeliveryResult,
} from '../../src/domain/outcome'
import type { DeliveryContext } from '../../src/domain/types'
import {
  makeOrder,
  makePlain,
  makeRover,
  makeSession,
} from '../support/fixtures'

function context(overrides: Partial<DeliveryContext> = {}): DeliveryContext {
  return {
    session: makeSession(),
    order: makeOrder(),
    rover: makeRover(),
    location: makePlain(),
    ...overrides,
  }
}

describe('resolveDeliveryResult', () => {
  it('requirement 16: the outcome is deterministic for a fixed roll', () => {
    // risk 30% -> rolls below 0.30 fail, everything else succeeds
    expect(resolveDeliveryResult(30, 0.0)).toBe('failed')
    expect(resolveDeliveryResult(30, 0.2999)).toBe('failed')
    expect(resolveDeliveryResult(30, 0.3)).toBe('success')
    expect(resolveDeliveryResult(30, 0.99)).toBe('success')
  })

  it('never fails at 0% risk and respects the 90% cap', () => {
    expect(resolveDeliveryResult(0, 0)).toBe('success')
    expect(resolveDeliveryResult(120, 0.95)).toBe('success')
    expect(resolveDeliveryResult(120, 0.5)).toBe('failed')
  })

  it('rejects a roll outside [0, 1)', () => {
    expect(() => resolveDeliveryResult(30, 1)).toThrow(DomainInvariantError)
    expect(() => resolveDeliveryResult(30, -0.1)).toThrow(DomainInvariantError)
    expect(() => resolveDeliveryResult(30, Number.NaN)).toThrow(
      DomainInvariantError,
    )
  })
})

describe('applyDeliveryEffects', () => {
  it('requirement 10: a success adds the reward exactly once', () => {
    const current = context({ order: makeOrder({ reward: 400 }) })
    const estimate = calculateDeliveryEstimate(current)

    const effects = applyDeliveryEffects(current, estimate, 'success')

    expect(effects.creditsAwarded).toBe(400)
    expect(effects.balanceCreditsAfter).toBe(
      current.session.balanceCredits + 400,
    )
    expect(effects.earnedCreditsAfter).toBe(current.session.earnedCredits + 400)
    expect(effects.orderStatus).toBe('completed')

    // Re-applying the same pure function does not accumulate a second reward:
    // the calculation always starts from the reloaded session state.
    const repeated = applyDeliveryEffects(current, estimate, 'success')
    expect(repeated.balanceCreditsAfter).toBe(effects.balanceCreditsAfter)
    expect(repeated.earnedCreditsAfter).toBe(effects.earnedCreditsAfter)
  })

  it('requirement 11: a failure adds no reward and lowers the rating', () => {
    const current = context({ order: makeOrder({ reward: 400 }) })
    const estimate = calculateDeliveryEstimate(current)

    const effects = applyDeliveryEffects(current, estimate, 'failed')

    expect(effects.creditsAwarded).toBe(0)
    expect(effects.balanceCreditsAfter).toBe(current.session.balanceCredits)
    expect(effects.earnedCreditsAfter).toBe(current.session.earnedCredits)
    expect(effects.orderStatus).toBe('failed')
    expect(effects.ratingAfter).toBeLessThan(current.session.rating)
  })

  it('applies urgency-specific rating deltas (success + / failure -)', () => {
    for (const urgency of ['normal', 'urgent', 'critical'] as const) {
      const base = context({
        order: makeOrder({ urgency }),
        session: makeSession({ rating: 50 }),
      })
      const estimate = calculateDeliveryEstimate(base)

      const won = applyDeliveryEffects(base, estimate, 'success')
      const lost = applyDeliveryEffects(base, estimate, 'failed')

      expect(won.ratingAfter).toBe(50 + RATING_DELTAS[urgency].success)
      expect(lost.ratingAfter).toBe(50 - RATING_DELTAS[urgency].failure)
    }
  })

  it('requirement 9: the battery never becomes negative', () => {
    const current = context({
      rover: makeRover({ batteryCharge: 3 }),
      location: makePlain({ distance: 88, batteryModifier: 1.7 }),
    })
    const estimate = calculateDeliveryEstimate(current)

    const effects = applyDeliveryEffects(current, estimate, 'success')

    expect(estimate.batteryCost).toBeGreaterThan(current.rover.batteryCharge)
    expect(effects.batteryAfter).toBe(MIN_BATTERY)
  })

  it('returns the rover to idle so it can be used again', () => {
    const current = context()
    const effects = applyDeliveryEffects(
      current,
      calculateDeliveryEstimate(current),
      'success',
    )

    expect(effects.roverStatus).toBe('idle')
  })
})

describe('evaluateSessionStatus (campaign of 12 days)', () => {
  const base = {
    rating: 100,
    minimumRating: 60,
    currentDay: 1,
    maxDays: 12,
  }

  it('keeps the session active while the campaign is running', () => {
    expect(evaluateSessionStatus(base)).toBe('active')
  })

  it('has no early win: high progress mid-campaign stays active', () => {
    expect(evaluateSessionStatus({ ...base, currentDay: 6 })).toBe('active')
    expect(evaluateSessionStatus({ ...base, currentDay: 12 })).toBe('active')
  })

  it('wins only after the final day is completed', () => {
    expect(evaluateSessionStatus({ ...base, currentDay: 13 })).toBe('won')
  })

  it('loses immediately when the rating drops below the minimum', () => {
    expect(evaluateSessionStatus({ ...base, rating: 59 })).toBe('lost')
  })

  it('gives the rating collapse precedence over campaign completion', () => {
    expect(
      evaluateSessionStatus({ ...base, rating: 10, currentDay: 13 }),
    ).toBe('lost')
  })
})

describe('computeFinalRank', () => {
  it('maps lifetime earned credits to the four ranks', () => {
    expect(computeFinalRank(0)).toBe('Bronze')
    expect(computeFinalRank(8999)).toBe('Bronze')
    expect(computeFinalRank(9000)).toBe('Silver')
    expect(computeFinalRank(12999)).toBe('Silver')
    expect(computeFinalRank(13000)).toBe('Gold')
    expect(computeFinalRank(16999)).toBe('Gold')
    expect(computeFinalRank(17000)).toBe('Platinum')
  })
})
