/**
 * Use case: start a delivery (Game Design v2 vertical slice).
 *
 * The delivery now has a real lifecycle. Starting it:
 * 1. reloads session, order, rover and location inside one transaction;
 * 2. checks the idempotency key (a replay returns the same active delivery);
 * 3. recalculates the estimate on the server (from effective RoverStats);
 * 4. checks the eligibility rules;
 * 5. charges the battery exactly once (requirement 8);
 * 6. persists an `in_transit` delivery with a fixed completion time, marks the
 *    rover "delivering" and the order "in_progress".
 *
 * The result is NOT decided here: the outcome, the reward and the rating are
 * resolved later, exactly once, by completeDelivery (requirements 5, 6, 7, 9).
 */

import {
  calculateDeliveryEstimate,
  calculateSimulationSeconds,
  computeBatteryAfterDelivery,
  evaluateDeliveryEligibility,
} from '@/domain'
import type { DeliveryContext } from '@/domain/types'
import { toActiveDeliveryDto, type ActiveDeliveryDto } from '../dto'
import { AppError } from '../errors'
import type { GameRepositories, ServiceDeps } from '../ports'
import type { StartDeliveryInput } from '../schemas'

const MILLISECONDS_PER_SECOND = 1000

async function buildReplayDto(
  repositories: GameRepositories,
  idempotencyKey: string,
): Promise<ActiveDeliveryDto | null> {
  const existing =
    await repositories.findDeliveryByIdempotencyKey(idempotencyKey)
  if (existing === null) return null

  const order = await repositories.findOrderById(existing.orderId)
  return toActiveDeliveryDto(existing, order?.locationId ?? '')
}

export async function startDelivery(
  deps: ServiceDeps,
  input: StartDeliveryInput,
): Promise<ActiveDeliveryDto> {
  return deps.uow.transaction(async (repositories) => {
    const replay = await buildReplayDto(repositories, input.idempotencyKey)
    if (replay !== null) {
      return replay
    }

    const session = await repositories.findActiveSession()
    if (session === null) {
      throw new AppError('GAME_NOT_FOUND')
    }

    const order = await repositories.findOrderById(input.orderId)
    if (order === null) {
      throw new AppError('ORDER_NOT_FOUND')
    }

    const rover = await repositories.findRoverById(input.roverId)
    if (rover === null) {
      throw new AppError('ROVER_NOT_FOUND')
    }

    const location = await repositories.findLocationById(order.locationId)
    if (location === null) {
      throw new AppError('LOCATION_NOT_FOUND')
    }

    const context: DeliveryContext = { session, order, rover, location }
    const estimate = calculateDeliveryEstimate(context)
    const eligibility = evaluateDeliveryEligibility(context, estimate)

    if (!eligibility.canStart) {
      throw AppError.fromBlockReasons(eligibility.reasons)
    }

    // Requirement 1: the round-trip window is derived from the calculated
    // duration and the rover speed-upgrade level, then clamped to [8, 40] s.
    // It covers BOTH legs (base -> station -> base); the marker animation splits
    // it in half in the UI. Persisted startedAt/completesAt are the only source
    // of truth for the timer and the movement (requirements 11 and 12).
    const startedAt = deps.clock.now()
    const simulationSeconds = calculateSimulationSeconds(
      estimate.duration,
      rover.speedLevel,
    )
    const completesAt = new Date(
      startedAt.getTime() + simulationSeconds * MILLISECONDS_PER_SECOND,
    )
    const batteryAfter = computeBatteryAfterDelivery(context, estimate)

    const delivery = await repositories.createDelivery({
      id: deps.ids.next(),
      gameSessionId: session.id,
      orderId: order.id,
      roverId: rover.id,
      calculatedBatteryCost: estimate.batteryCost,
      calculatedRisk: estimate.risk,
      calculatedDuration: estimate.duration,
      reward: estimate.reward,
      status: 'in_transit',
      startedAt,
      completesAt,
      result: null,
      idempotencyKey: input.idempotencyKey,
    })

    // Battery is charged once, at departure (requirement 8).
    await repositories.updateRover(rover.id, {
      batteryCharge: batteryAfter,
      status: 'delivering',
    })
    await repositories.updateOrderStatus(order.id, 'in_progress')

    // Requirement: starting a delivery consumes one of the day's operations.
    // The counter increases at departure, so a later failure still counts.
    await repositories.updateSession(session.id, {
      operationsToday: session.operationsToday + 1,
    })

    return toActiveDeliveryDto(delivery, order.locationId)
  })
}
