import { describe, expect, it } from 'vitest'
import { DEFAULT_SESSION } from '../../src/application/gameDefaults'
import { toSessionDto } from '../../src/application/dto'
import { resolveEndOfDay } from '../../src/domain/endDay'
import { evaluateSessionStatus, ratingState } from '../../src/domain/outcome'
import { makeSession } from '../support/fixtures'

/**
 * Final balancing: a new campaign loses only once the rating drops BELOW 40.
 * The loss threshold lives in `minimumRating`; these tests pin the boundary
 * (40 stays active, 39 is lost) and that the real value is reported to the UI.
 */
describe('minimumRating = 40 loss threshold', () => {
  it('rating 40 keeps the session active (boundary, not a loss)', () => {
    const status = evaluateSessionStatus({
      rating: 40,
      minimumRating: 40,
      currentDay: 3,
      maxDays: 12,
    })
    expect(status).toBe('active')
    expect(ratingState(40, 40)).toBe('at_risk')
  })

  it('rating 39 loses the session', () => {
    const status = evaluateSessionStatus({
      rating: 39,
      minimumRating: 40,
      currentDay: 3,
      maxDays: 12,
    })
    expect(status).toBe('lost')
    expect(ratingState(39, 40)).toBe('lost')
  })

  it('classifies the UI rating bands (70+ stable, 40-69 at risk)', () => {
    expect(ratingState(70, 40)).toBe('stable')
    expect(ratingState(100, 40)).toBe('stable')
    expect(ratingState(69, 40)).toBe('at_risk')
  })

  it('winning after the final day requires rating >= 40', () => {
    const won = resolveEndOfDay({
      session: makeSession({
        currentDay: 12,
        maxDays: 12,
        rating: 40,
        minimumRating: 40,
      }),
      orders: [],
      rovers: [],
    })
    expect(won.nextDay).toBe(13)
    expect(won.sessionStatus).toBe('won')

    const lost = resolveEndOfDay({
      session: makeSession({
        currentDay: 12,
        maxDays: 12,
        rating: 39,
        minimumRating: 40,
      }),
      orders: [],
      rovers: [],
    })
    expect(lost.sessionStatus).toBe('lost')
  })

  it('a new game defaults to minimumRating 40 and the DTO reports it', () => {
    expect(DEFAULT_SESSION.minimumRating).toBe(40)

    const dto = toSessionDto(
      makeSession({ minimumRating: DEFAULT_SESSION.minimumRating }),
    )
    expect(dto.minimumRating).toBe(40)
  })
})
