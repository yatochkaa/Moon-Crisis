/**
 * Unit test for the engine (speed) upgrade example.
 *
 * Regression for the "8 → 8 секунд" bug (and the example vanishing entirely):
 * the example used to be computed on the cheapest feasible order, which is a
 * short route that floors at MIN_SIMULATION_SECONDS, and it disappeared when no
 * cheap order was available. It is now computed on a representative (far)
 * route, so the bonus is always visible, non-empty and strictly decreasing.
 */

import { describe, expect, it } from 'vitest'
import { toRoverDto } from '../../src/application/dto'
import { makeSession } from '../support/fixtures'
import { SEED_LOCATIONS, SEED_ROVERS } from '../../prisma/seedData'

const SCOUT = SEED_ROVERS[0]!

function speedExample(speedLevel: number): string | null {
  const rover = { ...SCOUT, speedLevel }
  const session = makeSession({ balanceCredits: 100_000, currentDay: 5 })
  // An empty order list on purpose: the example must not depend on any order
  // being available — that dependency is exactly what made it disappear.
  const dto = toRoverDto(rover, session, {
    orders: [],
    locations: SEED_LOCATIONS,
    rovers: SEED_ROVERS,
  })
  const speed = dto.upgrades.find((upgrade) => upgrade.type === 'speed')
  expect(speed, 'speed upgrade present').toBeDefined()
  return speed?.exampleSummary ?? null
}

function parseSeconds(summary: string): { before: number; after: number } {
  const match = summary.match(/(\d+)\s*→\s*(\d+)/)
  expect(match, `parsable example: ${summary}`).not.toBeNull()
  return { before: Number(match![1]), after: Number(match![2]) }
}

describe('engine (speed) upgrade example', () => {
  it('is present and non-trivial even with no available orders', () => {
    for (const level of [0, 1]) {
      const summary = speedExample(level)
      expect(summary, `example at level ${level}`).not.toBeNull()
      const { before, after } = parseSeconds(summary!)
      // Not the floored "8 → 8": a real, visible reduction on every level.
      expect(before).toBeGreaterThan(after)
    }
  })

  it('decreases monotonically across levels', () => {
    const level0 = parseSeconds(speedExample(0)!)
    const level1 = parseSeconds(speedExample(1)!)

    // The "before" of the next level equals the "after" of the previous one:
    // buying the level lands exactly where the preview promised.
    expect(level1.before).toBe(level0.after)
    // Each purchasable level is strictly faster than the one before it.
    expect(level1.after).toBeLessThan(level0.after)
    expect(level1.before).toBeLessThan(level0.before)
  })

  it('offers no example once the upgrade is maxed out', () => {
    // At the maximum level there is no next level to preview.
    const maxed = speedExample(SCOUT.speedLevel + 99)
    expect(maxed).toBeNull()
  })
})
