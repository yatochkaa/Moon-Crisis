import 'server-only'

/**
 * Centralised server-side randomness.
 *
 * The domain layer never calls this module: it receives a plain `roll` number,
 * which keeps the rules deterministic and unit-testable. Cryptographic quality
 * is not required for the game, but the source stays on the server and in one
 * place.
 */

import { randomInt } from 'node:crypto'
import type { RandomSource } from '@/application/ports'

const RESOLUTION = 1_000_000

export function createServerRandomSource(): RandomSource {
  return {
    nextFloat(): number {
      // randomInt(max) returns an integer in [0, max), so the result is [0, 1).
      return randomInt(RESOLUTION) / RESOLUTION
    },
  }
}

/** Deterministic source used by tests and reproducible scenarios. */
export function createFixedRandomSource(values: readonly number[]): RandomSource {
  let index = 0

  return {
    nextFloat(): number {
      const value = values[index % values.length]
      index += 1
      return value ?? 0
    },
  }
}
