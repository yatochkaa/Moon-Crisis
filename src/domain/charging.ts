/**
 * Pure rover-charging rules.
 *
 * The player buys energy for credits in the base shop. Two operations exist:
 * - quick: adds at most QUICK_CHARGE_AMOUNT units;
 * - full:  tops the rover up to its effective battery capacity.
 *
 * The price is always CHARGE_COST_PER_UNIT credits per unit that is ACTUALLY
 * added, so a rover that is 8 units short of full pays for 8 units only. Every
 * price and every amount lives in `constants.ts`; this module only evaluates a
 * request and never touches money, React, Prisma, randomness or time.
 */

import {
  CHARGE_COST_PER_UNIT,
  QUICK_CHARGE_AMOUNT,
} from './constants'
import { computeRoverStats } from './roverStats'
import type { GameSession, Rover } from './types'

/** The two charging operations offered by the base shop. */
export const CHARGE_MODES = ['quick', 'full'] as const
export type ChargeMode = (typeof CHARGE_MODES)[number]

/** Why a charge cannot be purchased right now. */
export const CHARGE_BLOCK_REASONS = [
  'SESSION_FINISHED',
  'ROVER_BUSY',
  'BATTERY_FULL',
  'INSUFFICIENT_FUNDS',
] as const
export type ChargeBlockReason = (typeof CHARGE_BLOCK_REASONS)[number]

export type ChargeEvaluation = {
  readonly canCharge: boolean
  readonly reasons: readonly ChargeBlockReason[]
  /** Charge before the operation. */
  readonly chargeBefore: number
  /** Charge after the operation (never above the effective capacity). */
  readonly chargeAfter: number
  /** Effective battery capacity used as the ceiling. */
  readonly capacity: number
  /** Energy units that would actually be added. */
  readonly unitsAdded: number
  /** Credits charged for exactly `unitsAdded` units. */
  readonly cost: number
}

/**
 * Units a mode would add, before the funds check.
 *
 * `quick` is capped both by QUICK_CHARGE_AMOUNT and by the remaining headroom,
 * so a rover 8 units short of full gains 8 units and pays for 8 units.
 */
function unitsForMode(missing: number, mode: ChargeMode): number {
  const headroom = Math.max(missing, 0)
  return mode === 'quick' ? Math.min(QUICK_CHARGE_AMOUNT, headroom) : headroom
}

/**
 * Deterministic evaluation of one charge request. The reason order (session,
 * rover, battery, funds) keeps the server and the client explanations identical.
 */
export function evaluateCharge(
  session: GameSession,
  rover: Rover,
  mode: ChargeMode,
): ChargeEvaluation {
  const reasons: ChargeBlockReason[] = []
  const stats = computeRoverStats(rover)
  const capacity = stats.batteryCapacity
  const chargeBefore = rover.batteryCharge
  const missing = capacity - chargeBefore
  const unitsAdded = unitsForMode(missing, mode)
  const cost = unitsAdded * CHARGE_COST_PER_UNIT

  if (session.status !== 'active') {
    reasons.push('SESSION_FINISHED')
  }

  // Only a parked rover can be charged; a delivering rover is on the surface.
  if (rover.status !== 'idle') {
    reasons.push('ROVER_BUSY')
  }

  if (unitsAdded <= 0) {
    reasons.push('BATTERY_FULL')
  } else if (session.balanceCredits < cost) {
    reasons.push('INSUFFICIENT_FUNDS')
  }

  return {
    canCharge: reasons.length === 0,
    reasons,
    chargeBefore,
    chargeAfter: chargeBefore + unitsAdded,
    capacity,
    unitsAdded,
    cost,
  }
}

/**
 * Highest price a quick charge can ever cost, used by the UI to describe the
 * offer ("up to N units, at most M credits") without duplicating the numbers.
 */
export const QUICK_CHARGE_MAX_COST = QUICK_CHARGE_AMOUNT * CHARGE_COST_PER_UNIT
