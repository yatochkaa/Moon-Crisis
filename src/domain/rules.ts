/**
 * Pure eligibility rules: may this delivery be started?
 *
 * The reasons are returned as a stable, deterministic list so that both the
 * preview endpoint and the start endpoint report identical explanations.
 *
 * Game Design v2: capacity and battery checks run on the effective rover stats
 * (`computeRoverStats`). The two battery reasons are mutually exclusive:
 * ROUTE_EXCEEDS_CAPACITY means the route is impossible even fully charged,
 * INSUFFICIENT_CHARGE means only the current charge is too low.
 */

import { MAX_OPERATIONS_PER_DAY } from './constants'
import { computeRoverStats } from './roverStats'
import type {
  DeliveryBlockReason,
  DeliveryContext,
  DeliveryEligibility,
  DeliveryEstimate,
} from './types'

export type EligibilityFlags = {
  /** True when the supplied idempotency key was already processed. */
  readonly idempotencyKeyAlreadyUsed?: boolean
}

export function evaluateDeliveryEligibility(
  context: DeliveryContext,
  estimate: DeliveryEstimate,
  flags: EligibilityFlags = {},
): DeliveryEligibility {
  const { session, order, rover } = context
  const stats = computeRoverStats(rover)
  const reasons: DeliveryBlockReason[] = []

  if (session.status !== 'active') {
    reasons.push('SESSION_FINISHED')
  }

  if (order.status !== 'available') {
    reasons.push('ORDER_NOT_AVAILABLE')
  }

  if (rover.status !== 'idle') {
    reasons.push('ROVER_NOT_IDLE')
  }

  if (order.weight > stats.capacity) {
    reasons.push('CAPACITY_EXCEEDED')
  }

  if (estimate.batteryCost > stats.batteryCapacity) {
    reasons.push('ROUTE_EXCEEDS_CAPACITY')
  } else if (estimate.batteryCost > rover.batteryCharge) {
    reasons.push('INSUFFICIENT_CHARGE')
  }

  if (order.deadlineDay < session.currentDay) {
    reasons.push('DEADLINE_PASSED')
  }

  if (flags.idempotencyKeyAlreadyUsed === true) {
    reasons.push('DUPLICATE_REQUEST')
  }

  // A started delivery is one daily operation; failures count too, so the cap
  // is enforced at the moment a delivery is started.
  if (session.operationsToday >= MAX_OPERATIONS_PER_DAY) {
    reasons.push('OPERATION_LIMIT_REACHED')
  }

  return { canStart: reasons.length === 0, reasons }
}
