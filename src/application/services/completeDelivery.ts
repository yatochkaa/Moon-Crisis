/**
 * Use case: complete an in-transit delivery.
 *
 * This is where the server decides the outcome exactly once (requirement 5).
 * It is idempotent: once a delivery is terminal, calling it again returns the
 * stored result and pays nothing, so a page refresh never awards twice
 * (requirement 9). The battery was already charged at departure, so only the
 * rover status changes here (requirement 8).
 */

import {
  applyDeliveryEffects,
  RATING_DELTAS,
  resolveDeliveryResult,
} from '@/domain'
import type {
  DeliveryContext,
  DeliveryEstimate,
  GameEventType,
} from '@/domain/types'
import { toSessionDto, type DeliveryResultDto } from '../dto'
import { AppError } from '../errors'
import type { ServiceDeps } from '../ports'
import type { CompleteDeliveryInput } from '../schemas'

function buildEventDescription(
  orderTitle: string,
  locationName: string,
  reward: number,
  isSuccess: boolean,
): string {
  return isSuccess
    ? `Заказ «${orderTitle}» доставлен в ${locationName}. Начислено ${reward} кредитов.`
    : `Доставка «${orderTitle}» в ${locationName} завершилась неудачей. Награда не начислена.`
}

export async function completeDelivery(
  deps: ServiceDeps,
  input: CompleteDeliveryInput,
): Promise<DeliveryResultDto> {
  return deps.uow.transaction(async (repositories) => {
    const delivery = await repositories.findDeliveryById(input.deliveryId)
    if (delivery === null) {
      throw new AppError('DELIVERY_NOT_FOUND')
    }

    const session = await repositories.findActiveSession()
    if (session === null) {
      throw new AppError('GAME_NOT_FOUND')
    }

    // Load the order and rover up front so that every result (including the
    // idempotent replay below) can carry the human-readable roverName and
    // orderTitle. This keeps parallel results self-describing and unambiguous.
    const order = await repositories.findOrderById(delivery.orderId)
    if (order === null) {
      throw new AppError('ORDER_NOT_FOUND')
    }

    const rover = await repositories.findRoverById(delivery.roverId)
    if (rover === null) {
      throw new AppError('ROVER_NOT_FOUND')
    }

    // Idempotent: resolve a delivery exactly once (requirements 5 and 9).
    if (delivery.status !== 'in_transit' || delivery.result !== null) {
      return {
        deliveryId: delivery.id,
        orderId: delivery.orderId,
        roverId: delivery.roverId,
        roverName: rover.name,
        orderTitle: order.title,
        result: delivery.result ?? 'failed',
        batteryCost: delivery.calculatedBatteryCost,
        duration: delivery.calculatedDuration,
        risk: delivery.calculatedRisk,
        reward: delivery.reward,
        creditsAwarded: 0,
        ratingDelta: 0,
        ratingReward: 0,
        previousBalance: session.balanceCredits,
        newBalance: session.balanceCredits,
        replayed: true,
        session: toSessionDto(session),
      }
    }

    const location = await repositories.findLocationById(order.locationId)
    if (location === null) {
      throw new AppError('LOCATION_NOT_FOUND')
    }

    const estimate: DeliveryEstimate = {
      batteryCost: delivery.calculatedBatteryCost,
      duration: delivery.calculatedDuration,
      risk: delivery.calculatedRisk,
      reward: delivery.reward,
    }
    const context: DeliveryContext = { session, order, rover, location }

    const roll = deps.random.nextFloat()
    const result = resolveDeliveryResult(estimate.risk, roll)
    const effects = applyDeliveryEffects(context, estimate, result)
    const isSuccess = result === 'success'

    // Battery was already charged at departure; only the status returns to idle.
    await repositories.updateRover(rover.id, { status: 'idle' })
    await repositories.updateOrderStatus(order.id, effects.orderStatus)
    await repositories.updateDelivery(delivery.id, {
      status: isSuccess ? 'completed' : 'failed',
      result,
    })

    const updatedSession = await repositories.updateSession(session.id, {
      balanceCredits: effects.balanceCreditsAfter,
      earnedCredits: effects.earnedCreditsAfter,
      rating: effects.ratingAfter,
      status: effects.sessionStatus,
    })

    const eventType: GameEventType = isSuccess
      ? 'delivery_success'
      : 'delivery_failed'

    await repositories.createEvent({
      id: deps.ids.next(),
      gameSessionId: session.id,
      deliveryId: delivery.id,
      type: eventType,
      title: isSuccess ? 'Доставка выполнена' : 'Доставка провалена',
      description: buildEventDescription(
        order.title,
        location.name,
        effects.creditsAwarded,
        isSuccess,
      ),
      metadata: {
        risk: estimate.risk,
        batteryCost: estimate.batteryCost,
        duration: estimate.duration,
      },
      day: session.currentDay,
    })

    if (effects.sessionStatus !== 'active') {
      await repositories.createEvent({
        id: deps.ids.next(),
        gameSessionId: session.id,
        deliveryId: delivery.id,
        type: effects.sessionStatus === 'won' ? 'game_won' : 'game_lost',
        title:
          effects.sessionStatus === 'won'
            ? 'Лунная база спасена'
            : 'Эвакуация базы',
        description:
          effects.sessionStatus === 'won'
            ? `Кампания пройдена. Итоговый заработок: ${effects.earnedCreditsAfter} кредитов.`
            : `Рейтинг опустился до ${effects.ratingAfter} при минимуме ${session.minimumRating}. База эвакуирована.`,
        day: session.currentDay,
      })
    }

    return {
      deliveryId: delivery.id,
      orderId: order.id,
      roverId: rover.id,
      roverName: rover.name,
      orderTitle: order.title,
      result,
      batteryCost: estimate.batteryCost,
      duration: estimate.duration,
      risk: estimate.risk,
      reward: estimate.reward,
      creditsAwarded: effects.creditsAwarded,
      // Actual applied rating change for this delivery, computed once here.
      ratingDelta: effects.ratingAfter - session.rating,
      // Intended success bonus before the 100-point cap, so the UI can explain
      // a capped +0 («itogovyj rejting ostalsja 100») instead of hiding it.
      ratingReward: isSuccess ? RATING_DELTAS[order.urgency].success : 0,
      previousBalance: session.balanceCredits,
      newBalance: updatedSession.balanceCredits,
      replayed: false,
      session: toSessionDto(updatedSession),
    }
  })
}
