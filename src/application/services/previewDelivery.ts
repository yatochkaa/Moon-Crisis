/**
 * Use case: informational preview of a delivery.
 *
 * The preview never mutates anything and never decides the outcome. The start
 * use case recalculates everything from the database inside a transaction.
 */

import {
  calculateDeliveryEstimate,
  evaluateDeliveryEligibility,
} from '@/domain'
import type { DeliveryContext } from '@/domain/types'
import { toPreviewDto, type DeliveryPreviewDto } from '../dto'
import { AppError } from '../errors'
import type { ServiceDeps } from '../ports'
import type { DeliveryPreviewInput } from '../schemas'

export async function previewDelivery(
  deps: Pick<ServiceDeps, 'uow'>,
  input: DeliveryPreviewInput,
): Promise<DeliveryPreviewDto> {
  const repositories = deps.uow.repositories

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

  return toPreviewDto(
    order.id,
    rover.id,
    estimate,
    eligibility.canStart,
    eligibility.reasons,
  )
}
