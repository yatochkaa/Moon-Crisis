import { describe, expect, it } from 'vitest'
import { calculateDeliveryEstimate } from '../../src/domain/calculations'
import { evaluateDeliveryEligibility } from '../../src/domain/rules'
import type { DeliveryContext } from '../../src/domain/types'
import {
  makeOrder,
  makePlain,
  makeRover,
  makeSession,
} from '../support/fixtures'

function evaluate(
  context: DeliveryContext,
  flags: { idempotencyKeyAlreadyUsed?: boolean } = {},
) {
  return evaluateDeliveryEligibility(
    context,
    calculateDeliveryEstimate(context),
    flags,
  )
}

function baseContext(overrides: Partial<DeliveryContext> = {}): DeliveryContext {
  return {
    session: makeSession(),
    order: makeOrder(),
    rover: makeRover(),
    location: makePlain(),
    ...overrides,
  }
}

describe('evaluateDeliveryEligibility', () => {
  it('allows a valid delivery', () => {
    const eligibility = evaluate(baseContext())

    expect(eligibility.canStart).toBe(true)
    expect(eligibility.reasons).toEqual([])
  })

  it('requirement 2: rejects an order heavier than the rover capacity', () => {
    const eligibility = evaluate(
      baseContext({
        order: makeOrder({ weight: 80 }),
        rover: makeRover({ capacity: 60 }),
      }),
    )

    expect(eligibility.canStart).toBe(false)
    expect(eligibility.reasons).toContain('CAPACITY_EXCEEDED')
  })

  it('requirement 3: rejects a route that exceeds the battery capacity', () => {
    // cost = ceil((88 * 1.7 + 10 * 0.25) / 1) = 153 > capacity 100
    const eligibility = evaluate(
      baseContext({
        rover: makeRover({ batteryCharge: 5 }),
        location: makePlain({ distance: 88, batteryModifier: 1.7 }),
      }),
    )

    expect(eligibility.canStart).toBe(false)
    expect(eligibility.reasons).toContain('ROUTE_EXCEEDS_CAPACITY')
    expect(eligibility.reasons).not.toContain('INSUFFICIENT_CHARGE')
  })

  it('requirement 3b: rejects a route the current charge cannot cover', () => {
    // cost = ceil((20 * 1 + 10 * 0.25) / 1) = 23, below capacity 100 but above 5
    const eligibility = evaluate(
      baseContext({
        rover: makeRover({ batteryCharge: 5 }),
        location: makePlain({ distance: 20, batteryModifier: 1 }),
      }),
    )

    expect(eligibility.canStart).toBe(false)
    expect(eligibility.reasons).toContain('INSUFFICIENT_CHARGE')
    expect(eligibility.reasons).not.toContain('ROUTE_EXCEEDS_CAPACITY')
  })

  it('requirement 4: rejects a rover that is not idle', () => {
    for (const status of ['delivering', 'charging', 'damaged'] as const) {
      const eligibility = evaluate(baseContext({ rover: makeRover({ status }) }))

      expect(eligibility.canStart).toBe(false)
      expect(eligibility.reasons).toContain('ROVER_NOT_IDLE')
    }
  })

  it('requirement 5: rejects an order that is not available', () => {
    for (const status of [
      'in_progress',
      'completed',
      'failed',
      'expired',
    ] as const) {
      const eligibility = evaluate(baseContext({ order: makeOrder({ status }) }))

      expect(eligibility.canStart).toBe(false)
      expect(eligibility.reasons).toContain('ORDER_NOT_AVAILABLE')
    }
  })

  it('requirement 6: rejects an order whose deadline has passed', () => {
    const eligibility = evaluate(
      baseContext({
        session: makeSession({ currentDay: 4 }),
        order: makeOrder({ deadlineDay: 3 }),
      }),
    )

    expect(eligibility.canStart).toBe(false)
    expect(eligibility.reasons).toContain('DEADLINE_PASSED')
  })

  it('accepts a delivery on the deadline day itself', () => {
    const eligibility = evaluate(
      baseContext({
        session: makeSession({ currentDay: 3 }),
        order: makeOrder({ deadlineDay: 3 }),
      }),
    )

    expect(eligibility.canStart).toBe(true)
  })

  it('rejects a delivery when the session is finished', () => {
    for (const status of ['won', 'lost'] as const) {
      const eligibility = evaluate(
        baseContext({ session: makeSession({ status }) }),
      )

      expect(eligibility.canStart).toBe(false)
      expect(eligibility.reasons).toContain('SESSION_FINISHED')
    }
  })

  it('rejects a replayed idempotency key', () => {
    const eligibility = evaluate(baseContext(), {
      idempotencyKeyAlreadyUsed: true,
    })

    expect(eligibility.canStart).toBe(false)
    expect(eligibility.reasons).toContain('DUPLICATE_REQUEST')
  })

  it('reports every blocker at once', () => {
    // cost = ceil((20 * 1 + 90 * 0.25) / 1) = 43, below capacity 100 but above 1
    const eligibility = evaluate(
      baseContext({
        session: makeSession({ status: 'lost', currentDay: 6 }),
        order: makeOrder({ status: 'expired', weight: 90, deadlineDay: 2 }),
        rover: makeRover({ status: 'damaged', capacity: 20, batteryCharge: 1 }),
      }),
    )

    expect(eligibility.reasons).toEqual([
      'SESSION_FINISHED',
      'ORDER_NOT_AVAILABLE',
      'ROVER_NOT_IDLE',
      'CAPACITY_EXCEEDED',
      'INSUFFICIENT_CHARGE',
      'DEADLINE_PASSED',
    ])
  })
})
