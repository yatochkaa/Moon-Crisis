import { describe, expect, it } from 'vitest'
import {
  applyUpgrade,
  evaluateUpgrade,
  getUpgradeLevel,
  nextUpgradeCost,
} from '../../src/domain/upgrades'
import { computeRoverStats } from '../../src/domain/roverStats'
import { UPGRADE_COSTS } from '../../src/domain/constants'
import { makeRover, makeSession } from '../support/fixtures'

describe('per-rover cargo capacity recompute (req 3)', () => {
  const cases: Array<[string, number, [number, number, number]]> = [
    ['rover-scout-01', 20, [20, 25, 30]],
    ['rover-sprint-03', 35, [35, 43, 50]],
    ['rover-cargo-02', 60, [60, 75, 90]],
  ]

  for (const [id, base, expected] of cases) {
    it(`${id}: ${expected.join(' -> ')}`, () => {
      for (let level = 0; level <= 2; level += 1) {
        const stats = computeRoverStats(
          makeRover({ id, capacity: base, capacityLevel: level }),
        )
        expect(stats.capacity).toBe(expected[level])
      }
    })
  }
})

describe('upgrade stat formulas recompute (req 3)', () => {
  it('battery +25 per level, efficiency *1.12**level, safety 8/level, speed 0.8**level', () => {
    const l2 = computeRoverStats(
      makeRover({
        id: 'rover-cargo-02',
        batteryCapacity: 100,
        efficiency: 1,
        batteryLevel: 2,
        efficiencyLevel: 2,
        safetyLevel: 2,
        speedLevel: 2,
      }),
    )
    expect(l2.batteryCapacity).toBe(150)
    expect(l2.efficiency).toBeCloseTo(1.2544, 6)
    expect(l2.safetyRiskReduction).toBe(16)
    expect(l2.speedMultiplier).toBeCloseTo(0.64, 6)
  })
})

describe('evaluateUpgrade (reqs 2, 6)', () => {
  const rover = makeRover({ id: 'rover-cargo-02', capacity: 60, status: 'idle' })

  it('blocks a purchase on day 1 with BAY_LOCKED', () => {
    const result = evaluateUpgrade(
      makeSession({ currentDay: 1, balanceCredits: 5000 }),
      rover,
      'cargo',
    )
    expect(result.canPurchase).toBe(false)
    expect(result.reasons).toContain('BAY_LOCKED')
  })

  it('allows a purchase from day 2 with enough funds', () => {
    const result = evaluateUpgrade(
      makeSession({ currentDay: 2, balanceCredits: 5000 }),
      rover,
      'cargo',
    )
    expect(result.canPurchase).toBe(true)
    expect(result.reasons).toHaveLength(0)
    expect(result.cost).toBe(UPGRADE_COSTS.cargo[0])
    expect(result.nextLevel).toBe(1)
  })

  it('blocks a purchase above level 2 with MAX_LEVEL', () => {
    const maxed = makeRover({ id: 'rover-cargo-02', capacityLevel: 2 })
    const result = evaluateUpgrade(
      makeSession({ currentDay: 2, balanceCredits: 5000 }),
      maxed,
      'cargo',
    )
    expect(result.canPurchase).toBe(false)
    expect(result.reasons).toContain('MAX_LEVEL')
    expect(result.cost).toBeNull()
    expect(nextUpgradeCost(maxed, 'cargo')).toBeNull()
  })

  it('blocks a purchase with INSUFFICIENT_FUNDS', () => {
    const result = evaluateUpgrade(
      makeSession({ currentDay: 2, balanceCredits: 100 }),
      rover,
      'cargo',
    )
    expect(result.canPurchase).toBe(false)
    expect(result.reasons).toContain('INSUFFICIENT_FUNDS')
  })

  it('blocks upgrading a delivering rover with ROVER_BUSY', () => {
    const busy = makeRover({ id: 'rover-cargo-02', status: 'delivering' })
    const result = evaluateUpgrade(
      makeSession({ currentDay: 2, balanceCredits: 5000 }),
      busy,
      'cargo',
    )
    expect(result.canPurchase).toBe(false)
    expect(result.reasons).toContain('ROVER_BUSY')
  })
})

describe('applyUpgrade (req 5)', () => {
  it('raises only the chosen level and never mutates the input', () => {
    const rover = makeRover({ id: 'rover-cargo-02' })
    const upgraded = applyUpgrade(rover, 'cargo')

    expect(getUpgradeLevel(upgraded, 'cargo')).toBe(1)
    expect(getUpgradeLevel(upgraded, 'battery')).toBe(0)
    expect(getUpgradeLevel(upgraded, 'speed')).toBe(0)
    // Input is untouched.
    expect(getUpgradeLevel(rover, 'cargo')).toBe(0)
  })
})
