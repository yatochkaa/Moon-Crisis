/** Pure numeric helpers shared by the domain layer. */

import { DomainInvariantError } from './errors'

/** Clamps `value` into the inclusive range [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  if (min > max) {
    throw new DomainInvariantError('clamp() received min greater than max')
  }
  if (value < min) return min
  if (value > max) return max
  return value
}

/** Rounds up to a whole number (used for battery cost and duration). */
export function ceilToInt(value: number): number {
  return Math.ceil(value)
}

/** Rounds to the nearest whole number (used for risk percent points). */
export function roundToInt(value: number): number {
  return Math.round(value)
}
