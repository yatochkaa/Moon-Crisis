/**
 * Effective rover characteristics.
 *
 * Game Design v2 (iteration 1) uses independent per-attribute upgrade levels,
 * each capped at MAX_UPGRADE_LEVEL. Every attribute has its own formula:
 *
 *   batteryCapacity     = base + batteryLevel * 25
 *   capacity (cargo)    = base + capacityLevel * 15
 *   efficiency          = base * 1.12 ** efficiencyLevel
 *   safetyRiskReduction = safetyLevel * 8
 *   speedMultiplier     = 0.8 ** speedLevel
 *
 * At level 0 every effective value equals the base value (safetyRiskReduction
 * is 0 and speedMultiplier is 1), so an un-upgraded rover behaves exactly like
 * it did before v2. This module is pure: no React, Prisma, randomness or time.
 */

import {
  BATTERY_CAPACITY_PER_LEVEL,
  CARGO_CAPACITY_BY_ROVER,
  CARGO_CAPACITY_PER_LEVEL,
  EFFICIENCY_UPGRADE_BASE,
  MAX_UPGRADE_LEVEL,
  SAFETY_RISK_REDUCTION_PER_LEVEL,
  SPEED_MULTIPLIER_BASE,
} from './constants'
import { assertFinite } from './errors'
import { clamp, roundToInt } from './math'
import type { Rover, RoverStats } from './types'

/** Clamps an upgrade level into the valid [0, MAX_UPGRADE_LEVEL] range. */
function safeLevel(level: number): number {
  assertFinite(level, 'rover upgrade level')
  return clamp(level, 0, MAX_UPGRADE_LEVEL)
}

/**
 * Effective cargo capacity for a rover at the given level.
 *
 * Per-rover cargo tables win when present (their growth is non-linear); every
 * other rover keeps the generic base + level * per-level fallback so existing
 * behaviour and tests are unchanged.
 */
function effectiveCargoCapacity(rover: Rover, level: number): number {
  const table = CARGO_CAPACITY_BY_ROVER[rover.id]
  if (table !== undefined) {
    return table[level] ?? table[table.length - 1]!
  }
  return rover.capacity + level * CARGO_CAPACITY_PER_LEVEL
}

/** Computes the effective rover characteristics from its base stats + levels. */
export function computeRoverStats(rover: Rover): RoverStats {
  return {
    capacity: roundToInt(
      effectiveCargoCapacity(rover, safeLevel(rover.capacityLevel)),
    ),
    batteryCapacity: roundToInt(
      rover.batteryCapacity +
        safeLevel(rover.batteryLevel) * BATTERY_CAPACITY_PER_LEVEL,
    ),
    efficiency:
      rover.efficiency *
      EFFICIENCY_UPGRADE_BASE ** safeLevel(rover.efficiencyLevel),
    safetyRiskReduction:
      safeLevel(rover.safetyLevel) * SAFETY_RISK_REDUCTION_PER_LEVEL,
    speedMultiplier: SPEED_MULTIPLIER_BASE ** safeLevel(rover.speedLevel),
  }
}
