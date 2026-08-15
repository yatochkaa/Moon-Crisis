/**
 * Unit tests for night recharge formula.
 *
 * Verifies:
 * - Night recharge = ceil(batteryCapacity × NIGHT_RECHARGE_RATIO)
 * - Formula scales correctly with upgraded batteries (125, 150)
 */

import { describe, expect, it } from 'vitest'
import { NIGHT_RECHARGE_RATIO } from '../../src/domain/constants'
import { ceilToInt } from '../../src/domain/math'
import { resolveEndOfDay } from '../../src/domain/endDay'
import { makeRover, makeSession } from '../support/fixtures'

function nightRecharge(batteryCapacity: number): number {
  return ceilToInt(batteryCapacity * NIGHT_RECHARGE_RATIO)
}

describe('night recharge formula', () => {
  it('NIGHT_RECHARGE_RATIO is 0.5', () => {
    expect(NIGHT_RECHARGE_RATIO).toBe(0.5)
  })

  it('returns 50 for capacity 100', () => {
    expect(nightRecharge(100)).toBe(50)
  })

  it('returns 63 for capacity 125 (ceil(62.5))', () => {
    expect(nightRecharge(125)).toBe(63)
  })

  it('returns 75 for capacity 150', () => {
    expect(nightRecharge(150)).toBe(75)
  })

  it('resolveEndOfDay recharges an idle rover by ceil(capacity * 0.5)', () => {
    const rover = makeRover({ batteryCharge: 10, batteryCapacity: 100, status: 'idle' })
    const outcome = resolveEndOfDay({
      session: makeSession({ currentDay: 1 }),
      orders: [],
      rovers: [rover],
    })

    const update = outcome.batteryUpdates.find((u) => u.roverId === rover.id)
    expect(update).toBeDefined()
    expect(update?.batteryAfter).toBe(10 + nightRecharge(100))
    expect(update?.batteryAfter).toBe(60)
  })

  it('upgraded battery (level 1 = 125 cap) recharges by 63 overnight', () => {
    // batteryLevel=1 → effective capacity = 100 + 25 = 125
    const rover = makeRover({ batteryCharge: 10, batteryCapacity: 100, batteryLevel: 1, status: 'idle' })
    const outcome = resolveEndOfDay({
      session: makeSession({ currentDay: 1 }),
      orders: [],
      rovers: [rover],
    })

    const update = outcome.batteryUpdates.find((u) => u.roverId === rover.id)
    expect(update?.batteryAfter).toBe(10 + nightRecharge(125))
    expect(update?.batteryAfter).toBe(73)
  })

  it('final charge is clamped to capacity', () => {
    const rover = makeRover({ batteryCharge: 90, batteryCapacity: 100, status: 'idle' })
    const outcome = resolveEndOfDay({
      session: makeSession({ currentDay: 1 }),
      orders: [],
      rovers: [rover],
    })

    const update = outcome.batteryUpdates.find((u) => u.roverId === rover.id)
    expect(update?.batteryAfter).toBeLessThanOrEqual(100)
    expect(update?.batteryAfter).toBe(100)
  })

  it('delivering rover is not recharged', () => {
    const rover = makeRover({ batteryCharge: 10, batteryCapacity: 100, status: 'delivering' })
    const outcome = resolveEndOfDay({
      session: makeSession({ currentDay: 1 }),
      orders: [],
      rovers: [rover],
    })

    const update = outcome.batteryUpdates.find((u) => u.roverId === rover.id)
    expect(update).toBeUndefined()
  })
})
