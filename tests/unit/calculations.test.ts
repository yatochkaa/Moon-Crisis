import { describe, expect, it } from 'vitest'
import {
  calculateBatteryCost,
  calculateDeliveryEstimate,
  calculateDuration,
  calculateRisk,
  calculateSimulationSeconds,
} from '../../src/domain/calculations'
import {
  MAX_RISK_PERCENT,
  MIN_RISK_PERCENT,
  MIN_SIMULATION_SECONDS,
} from '../../src/domain/constants'
import {
  makeCrater,
  makeDark,
  makeOrder,
  makePlain,
  makeRover,
  makeSession,
} from '../support/fixtures'

describe('calculateBatteryCost', () => {
  it('follows the documented formula with ceil rounding', () => {
    // (20 * 1 + 10 * 0.25) / 1 = 22.5 -> 23
    const cost = calculateBatteryCost({
      order: makeOrder({ weight: 10 }),
      rover: makeRover({ efficiency: 1 }),
      location: makePlain({ distance: 20, batteryModifier: 1 }),
    })

    expect(cost).toBe(23)
  })

  it('requirement 1: a heavier order increases the battery cost', () => {
    const location = makePlain()
    const rover = makeRover()

    const light = calculateBatteryCost({
      order: makeOrder({ weight: 4 }),
      rover,
      location,
    })
    const heavy = calculateBatteryCost({
      order: makeOrder({ weight: 36 }),
      rover,
      location,
    })

    expect(heavy).toBeGreaterThan(light)
  })

  it('a better efficiency lowers the battery cost', () => {
    const order = makeOrder({ weight: 20 })
    const location = makePlain()

    const efficient = calculateBatteryCost({
      order,
      rover: makeRover({ efficiency: 1.4 }),
      location,
    })
    const wasteful = calculateBatteryCost({
      order,
      rover: makeRover({ efficiency: 0.9 }),
      location,
    })

    expect(efficient).toBeLessThan(wasteful)
  })
})

describe('calculateDuration', () => {
  it('rounds hours up and accounts for the zone speed modifier', () => {
    // 20 / (5 * 1) = 4
    expect(
      calculateDuration({
        rover: makeRover({ speed: 5 }),
        location: makePlain({ distance: 20, speedModifier: 1 }),
      }),
    ).toBe(4)

    // 20 / (5 * 0.6) = 6.67 -> 7
    expect(
      calculateDuration({
        rover: makeRover({ speed: 5 }),
        location: makeDark({ distance: 20 }),
      }),
    ).toBe(7)
  })
})

describe('calculateRisk', () => {
  it('requirement 7: risk depends on the zone', () => {
    const order = makeOrder({ weight: 10, baseRisk: 10 })
    const rover = makeRover({ capacity: 40 })

    const plainRisk = calculateRisk({ order, rover, location: makePlain() })
    const craterRisk = calculateRisk({ order, rover, location: makeCrater() })
    const darkRisk = calculateRisk({ order, rover, location: makeDark() })

    // 10 + 0 + (10/40)*10 = 12.5 -> 13
    expect(plainRisk).toBe(13)
    expect(craterRisk).toBe(21)
    expect(darkRisk).toBe(33)
    expect(plainRisk).toBeLessThan(craterRisk)
    expect(craterRisk).toBeLessThan(darkRisk)
  })

  it('requirement 8: risk is clamped to the 0-90 range', () => {
    const tooHigh = calculateRisk({
      order: makeOrder({ weight: 40, baseRisk: 85 }),
      rover: makeRover({ capacity: 40 }),
      location: makeDark(),
    })
    expect(tooHigh).toBe(MAX_RISK_PERCENT)

    const tooLow = calculateRisk({
      order: makeOrder({ weight: 0, baseRisk: -50 }),
      rover: makeRover({ capacity: 40 }),
      location: makePlain({ riskBonus: 0 }),
    })
    expect(tooLow).toBe(MIN_RISK_PERCENT)
  })

  it('a safety upgrade lowers route risk and cannot lower it below zero', () => {
    const order = makeOrder({ weight: 10, baseRisk: 20 })
    const location = makePlain({ riskBonus: 0 })

    const withoutSafety = calculateRisk({
      order,
      rover: { ...makeRover({ capacity: 40 }), safetyRiskReduction: 0 },
      location,
    })
    const withSafety = calculateRisk({
      order,
      rover: { ...makeRover({ capacity: 40 }), safetyRiskReduction: 8 },
      location,
    })

    expect(withoutSafety).toBe(23)
    expect(withSafety).toBe(15)
    expect(
      calculateRisk({
        order: makeOrder({ weight: 0, baseRisk: 1 }),
        rover: { ...makeRover({ capacity: 40 }), safetyRiskReduction: 8 },
        location,
      }),
    ).toBe(MIN_RISK_PERCENT)
  })

  it('a fuller rover is riskier', () => {
    const order = makeOrder({ weight: 30, baseRisk: 10 })
    const location = makePlain()

    const small = calculateRisk({
      order,
      rover: makeRover({ capacity: 35 }),
      location,
    })
    const large = calculateRisk({
      order,
      rover: makeRover({ capacity: 60 }),
      location,
    })

    expect(small).toBeGreaterThan(large)
  })
})

describe('calculateDeliveryEstimate', () => {
  it('takes the reward from the order and never from the client', () => {
    const estimate = calculateDeliveryEstimate({
      session: makeSession(),
      order: makeOrder({ reward: 777 }),
      rover: makeRover(),
      location: makePlain(),
    })

    expect(estimate.reward).toBe(777)
    expect(estimate.batteryCost).toBeGreaterThan(0)
    expect(estimate.duration).toBeGreaterThan(0)
    expect(estimate.risk).toBeGreaterThanOrEqual(MIN_RISK_PERCENT)
    expect(estimate.risk).toBeLessThanOrEqual(MAX_RISK_PERCENT)
  })
})

describe('calculateSimulationSeconds', () => {
  it('follows ceil(hours * 4 * 0.8 ** speedLevel)', () => {
    // 3 * 4 * 0.8 ** 0 = 12
    expect(calculateSimulationSeconds(3, 0)).toBe(12)
    // 3 * 4 * 0.8 ** 1 = 9.6 -> 10
    expect(calculateSimulationSeconds(3, 1)).toBe(10)
    // 5 * 4 * 0.8 ** 2 = 12.8 -> 13
    expect(calculateSimulationSeconds(5, 2)).toBe(13)
  })

  it('clamps the result into the [8, 40] window', () => {
    // 1 * 4 * 1 = 4 -> clamped up to 8
    expect(calculateSimulationSeconds(1, 0)).toBe(8)
    // 20 * 4 * 1 = 80 -> clamped down to 40
    expect(calculateSimulationSeconds(20, 0)).toBe(40)
    expect(calculateSimulationSeconds(100, 0)).toBe(40)
  })

  it('still speeds up a route that hits the duration cap', () => {
    // A very long route caps at 40s. The speed upgrade must keep cutting that
    // capped wait, otherwise the shop sells "-20%" that renders as 40 -> 40.
    expect(calculateSimulationSeconds(20, 0)).toBe(40)
    expect(calculateSimulationSeconds(20, 1)).toBe(32)
    expect(calculateSimulationSeconds(20, 2)).toBe(26)

    // Every level is strictly faster than the previous one, at any distance.
    for (const hours of [1, 3, 7, 12, 20, 100]) {
      const level0 = calculateSimulationSeconds(hours, 0)
      const level1 = calculateSimulationSeconds(hours, 1)
      const level2 = calculateSimulationSeconds(hours, 2)
      expect(level1).toBeLessThanOrEqual(level0)
      expect(level2).toBeLessThanOrEqual(level1)
      if (level0 > MIN_SIMULATION_SECONDS) expect(level1).toBeLessThan(level0)
    }
  })
})
