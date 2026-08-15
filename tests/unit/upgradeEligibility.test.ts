import { describe, expect, it } from 'vitest'
import { calculateDeliveryEstimate } from '../../src/domain/calculations'
import { evaluateDeliveryEligibility } from '../../src/domain/rules'
import { applyUpgrade } from '../../src/domain/upgrades'
import type { DeliveryContext } from '../../src/domain/types'
import { makeOrder, makePlain, makeRover, makeSession } from '../support/fixtures'

/**
 * Regression guard for the “I upgraded cargo in the shop but the order still
 * says too heavy” bug. The purchased upgrade must change delivery eligibility
 * through the same effective-stats math the preview relies on, so a cargo
 * upgrade turns a CAPACITY_EXCEEDED order into a startable one.
 */
function evaluate(context: DeliveryContext) {
  return evaluateDeliveryEligibility(context, calculateDeliveryEstimate(context))
}

describe('cargo upgrade unlocks a previously too-heavy order', () => {
  const session = makeSession({ currentDay: 3 })
  const location = makePlain()
  // 50 kg is above the base 40 kg capacity but within one cargo upgrade (55 kg).
  const order = makeOrder({ weight: 50, deadlineDay: 5 })
  const baseRover = makeRover({ capacity: 40, capacityLevel: 0 })

  it('is blocked by CAPACITY_EXCEEDED before the upgrade', () => {
    const eligibility = evaluate({ session, order, location, rover: baseRover })

    expect(eligibility.canStart).toBe(false)
    expect(eligibility.reasons).toContain('CAPACITY_EXCEEDED')
  })

  it('becomes startable after a single cargo upgrade', () => {
    const upgraded = applyUpgrade(baseRover, 'cargo')
    const eligibility = evaluate({ session, order, location, rover: upgraded })

    expect(upgraded.capacityLevel).toBe(1)
    expect(eligibility.reasons).not.toContain('CAPACITY_EXCEEDED')
    expect(eligibility.canStart).toBe(true)
  })
})
