import { describe, expect, it } from 'vitest'
import {
  BATTERY_CAPACITY_PER_LEVEL,
  CARGO_CAPACITY_PER_LEVEL,
  MAX_UPGRADE_LEVEL,
  SAFETY_RISK_REDUCTION_PER_LEVEL,
} from '../../src/domain/constants'
import { computeRoverStats } from '../../src/domain/roverStats'
import { makeRover } from '../support/fixtures'

describe('computeRoverStats', () => {
  it('returns the base values for an un-upgraded rover', () => {
    const stats = computeRoverStats(
      makeRover({ capacity: 40, batteryCapacity: 100, efficiency: 1 }),
    )

    expect(stats.capacity).toBe(40)
    expect(stats.batteryCapacity).toBe(100)
    expect(stats.efficiency).toBe(1)
    expect(stats.safetyRiskReduction).toBe(0)
    expect(stats.speedMultiplier).toBe(1)
  })

  it('applies the per-attribute upgrade formulas', () => {
    const stats = computeRoverStats(
      makeRover({
        capacity: 40,
        batteryCapacity: 100,
        efficiency: 1,
        capacityLevel: 2,
        batteryLevel: 2,
        efficiencyLevel: 2,
        safetyLevel: 2,
        speedLevel: 2,
      }),
    )

    // 40 + 2 * 15 = 70
    expect(stats.capacity).toBe(40 + 2 * CARGO_CAPACITY_PER_LEVEL)
    // 100 + 2 * 25 = 150
    expect(stats.batteryCapacity).toBe(100 + 2 * BATTERY_CAPACITY_PER_LEVEL)
    // 1 * 1.12 ** 2 = 1.2544
    expect(stats.efficiency).toBeCloseTo(1.2544, 6)
    // 2 * 8 = 16
    expect(stats.safetyRiskReduction).toBe(2 * SAFETY_RISK_REDUCTION_PER_LEVEL)
    // 0.8 ** 2 = 0.64
    expect(stats.speedMultiplier).toBeCloseTo(0.64, 6)
  })

  it('clamps every level to the maximum', () => {
    const overMax = computeRoverStats(
      makeRover({
        capacity: 40,
        batteryCapacity: 100,
        efficiency: 1,
        capacityLevel: 5,
        batteryLevel: 5,
        efficiencyLevel: 5,
        safetyLevel: 5,
        speedLevel: 5,
      }),
    )
    const atMax = computeRoverStats(
      makeRover({
        capacity: 40,
        batteryCapacity: 100,
        efficiency: 1,
        capacityLevel: MAX_UPGRADE_LEVEL,
        batteryLevel: MAX_UPGRADE_LEVEL,
        efficiencyLevel: MAX_UPGRADE_LEVEL,
        safetyLevel: MAX_UPGRADE_LEVEL,
        speedLevel: MAX_UPGRADE_LEVEL,
      }),
    )

    expect(overMax).toEqual(atMax)
  })

  it('treats a negative level as level 0', () => {
    const stats = computeRoverStats(makeRover({ capacity: 40, capacityLevel: -3 }))

    expect(stats.capacity).toBe(40)
  })
})
