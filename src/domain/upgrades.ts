/**
 * Pure rover-upgrade rules.
 *
 * Every price and effect lives in `constants.ts`; this module only maps upgrade
 * types to rover level fields, evaluates whether a purchase is allowed and
 * applies a single level increment. It never touches React, Prisma, randomness
 * or time, and it never charges money (the service layer does that inside a
 * transaction).
 */

import {
  ENGINEERING_BAY_UNLOCK_DAY,
  MAX_UPGRADE_LEVEL,
  UPGRADE_COSTS,
  type UpgradeType,
} from './constants'
import { computeRoverStats } from './roverStats'
import type { GameSession, Rover } from './types'

/** Why a rover upgrade cannot be purchased right now. */
export const UPGRADE_BLOCK_REASONS = [
  'SESSION_FINISHED',
  'BAY_LOCKED',
  'ROVER_BUSY',
  'MAX_LEVEL',
  'INSUFFICIENT_FUNDS',
] as const
export type UpgradeBlockReason = (typeof UPGRADE_BLOCK_REASONS)[number]

/** Maps each upgrade type to the rover level field it raises. */
const LEVEL_FIELD_BY_TYPE: Record<
  UpgradeType,
  'batteryLevel' | 'capacityLevel' | 'efficiencyLevel' | 'safetyLevel' | 'speedLevel'
> = {
  battery: 'batteryLevel',
  cargo: 'capacityLevel',
  efficiency: 'efficiencyLevel',
  safety: 'safetyLevel',
  speed: 'speedLevel',
}

/** Current level of the given upgrade on a rover. */
export function getUpgradeLevel(rover: Rover, type: UpgradeType): number {
  return rover[LEVEL_FIELD_BY_TYPE[type]]
}

/**
 * Credit cost to raise the upgrade one level, or `null` when it is already at
 * the maximum level.
 */
export function nextUpgradeCost(rover: Rover, type: UpgradeType): number | null {
  const level = getUpgradeLevel(rover, type)
  if (level >= MAX_UPGRADE_LEVEL) return null
  return UPGRADE_COSTS[type][level] ?? null
}

export type UpgradeEvaluation = {
  readonly canPurchase: boolean
  readonly reasons: readonly UpgradeBlockReason[]
  /** Cost of the next level, or null when already maxed. */
  readonly cost: number | null
  readonly currentLevel: number
  /** Level after a successful purchase (unchanged when maxed). */
  readonly nextLevel: number
}

/**
 * Deterministic list of reasons a purchase is blocked. The order (session,
 * bay, rover, level, funds) keeps server and client explanations identical.
 */
export function evaluateUpgrade(
  session: GameSession,
  rover: Rover,
  type: UpgradeType,
): UpgradeEvaluation {
  const reasons: UpgradeBlockReason[] = []
  const currentLevel = getUpgradeLevel(rover, type)
  const cost = nextUpgradeCost(rover, type)

  if (session.status !== 'active') {
    reasons.push('SESSION_FINISHED')
  }

  if (session.currentDay < ENGINEERING_BAY_UNLOCK_DAY) {
    reasons.push('BAY_LOCKED')
  }

  if (rover.status !== 'idle') {
    reasons.push('ROVER_BUSY')
  }

  if (cost === null) {
    reasons.push('MAX_LEVEL')
  } else if (session.balanceCredits < cost) {
    reasons.push('INSUFFICIENT_FUNDS')
  }

  return {
    canPurchase: reasons.length === 0,
    reasons,
    cost,
    currentLevel,
    nextLevel: cost === null ? currentLevel : currentLevel + 1,
  }
}

/**
 * Returns a copy of the rover with only the selected upgrade raised by one
 * level. Never mutates the input and never touches any other level.
 */
export function applyUpgrade(rover: Rover, type: UpgradeType): Rover {
  const field = LEVEL_FIELD_BY_TYPE[type]
  return { ...rover, [field]: getUpgradeLevel(rover, type) + 1 }
}

/**
 * The single effective stat value affected by an upgrade type, read from the
 * computed rover stats. Used to show "current -> next" characteristics and the
 * purchase confirmation.
 */
export function upgradeStatValue(rover: Rover, type: UpgradeType): number {
  const stats = computeRoverStats(rover)
  switch (type) {
    case 'battery':
      return stats.batteryCapacity
    case 'cargo':
      return stats.capacity
    case 'efficiency':
      return stats.efficiency
    case 'safety':
      return stats.safetyRiskReduction
    case 'speed':
      return stats.speedMultiplier
  }
}
