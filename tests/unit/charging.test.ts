/**
 * Unit tests for the rover charging domain (pure logic).
 *
 * Covers:
 * 1. Quick charge adds maximum 25 units.
 * 2. Price depends on actually added energy.
 * 3. Full charge restores to capacity.
 * 4. Charge never exceeds capacity.
 * 5. Delivering rover cannot be charged.
 * 6. Insufficient credits → rejected without state change.
 */

import { describe, expect, it } from 'vitest'
import {
  CHARGE_COST_PER_UNIT,
  QUICK_CHARGE_AMOUNT,
} from '../../src/domain/constants'
import { evaluateCharge } from '../../src/domain/charging'
import { makeRover, makeSession } from '../support/fixtures'

describe('evaluateCharge', () => {
  it('quick charge adds at most QUICK_CHARGE_AMOUNT units', () => {
    const rover = makeRover({ batteryCharge: 10, batteryCapacity: 100 })
    const session = makeSession({ balanceCredits: 10000 })

    const result = evaluateCharge(session, rover, 'quick')

    expect(result.canCharge).toBe(true)
    expect(result.unitsAdded).toBe(QUICK_CHARGE_AMOUNT)
    expect(result.chargeAfter).toBe(10 + QUICK_CHARGE_AMOUNT)
  })

  it('quick charge price equals unitsAdded × CHARGE_COST_PER_UNIT', () => {
    const rover = makeRover({ batteryCharge: 10, batteryCapacity: 100 })
    const session = makeSession({ balanceCredits: 10000 })

    const result = evaluateCharge(session, rover, 'quick')

    expect(result.cost).toBe(result.unitsAdded * CHARGE_COST_PER_UNIT)
    expect(result.cost).toBe(QUICK_CHARGE_AMOUNT * CHARGE_COST_PER_UNIT)
  })

  it('quick charge adds only the remaining headroom when near full', () => {
    const rover = makeRover({ batteryCharge: 92, batteryCapacity: 100 })
    const session = makeSession({ balanceCredits: 10000 })

    const result = evaluateCharge(session, rover, 'quick')

    expect(result.unitsAdded).toBe(8) // only 8 units missing
    expect(result.cost).toBe(8 * CHARGE_COST_PER_UNIT)
    expect(result.chargeAfter).toBe(100)
  })

  it('full charge restores to effective batteryCapacity', () => {
    const rover = makeRover({ batteryCharge: 30, batteryCapacity: 100 })
    const session = makeSession({ balanceCredits: 10000 })

    const result = evaluateCharge(session, rover, 'full')

    expect(result.canCharge).toBe(true)
    expect(result.unitsAdded).toBe(70)
    expect(result.chargeAfter).toBe(100)
    expect(result.cost).toBe(70 * CHARGE_COST_PER_UNIT)
  })

  it('charge never results in chargeAfter exceeding capacity', () => {
    const rover = makeRover({ batteryCharge: 99, batteryCapacity: 100 })
    const session = makeSession({ balanceCredits: 10000 })

    const quick = evaluateCharge(session, rover, 'quick')
    const full = evaluateCharge(session, rover, 'full')

    expect(quick.chargeAfter).toBeLessThanOrEqual(100)
    expect(full.chargeAfter).toBeLessThanOrEqual(100)
  })

  it('returns BATTERY_FULL when rover is already at full capacity', () => {
    const rover = makeRover({ batteryCharge: 100, batteryCapacity: 100 })
    const session = makeSession({ balanceCredits: 10000 })

    const quick = evaluateCharge(session, rover, 'quick')
    const full = evaluateCharge(session, rover, 'full')

    expect(quick.canCharge).toBe(false)
    expect(quick.reasons).toContain('BATTERY_FULL')
    expect(full.canCharge).toBe(false)
    expect(full.reasons).toContain('BATTERY_FULL')
  })

  it('returns ROVER_BUSY for a delivering rover', () => {
    const rover = makeRover({ batteryCharge: 30, batteryCapacity: 100, status: 'delivering' })
    const session = makeSession({ balanceCredits: 10000 })

    const result = evaluateCharge(session, rover, 'quick')

    expect(result.canCharge).toBe(false)
    expect(result.reasons).toContain('ROVER_BUSY')
  })

  it('returns INSUFFICIENT_FUNDS when balance is too low', () => {
    const rover = makeRover({ batteryCharge: 10, batteryCapacity: 100 })
    // quick charge of 25 units = 100 credits; give only 50
    const session = makeSession({ balanceCredits: 50 })

    const result = evaluateCharge(session, rover, 'quick')

    expect(result.canCharge).toBe(false)
    expect(result.reasons).toContain('INSUFFICIENT_FUNDS')
    // Rover charge stays unchanged — evaluateCharge is pure, never mutates
    expect(result.chargeBefore).toBe(10)
    expect(result.chargeAfter).toBe(10 + QUICK_CHARGE_AMOUNT) // hypothetical; blocked by funds
  })

  it('SESSION_FINISHED prevents charging', () => {
    const rover = makeRover({ batteryCharge: 10, batteryCapacity: 100 })
    const session = makeSession({ balanceCredits: 10000, status: 'won' })

    const result = evaluateCharge(session, rover, 'full')

    expect(result.canCharge).toBe(false)
    expect(result.reasons).toContain('SESSION_FINISHED')
  })
})
