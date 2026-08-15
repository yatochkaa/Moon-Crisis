/**
 * Use case: end the current game day.
 *
 * Pure resolution happens in the domain layer (`resolveEndOfDay`); this service
 * coordinates persistence inside one transaction and enforces the day-level
 * rules that need repository access:
 * - the day cannot end while a delivery is still in transit;
 * - ending the day with fewer than the required operations needs an explicit
 *   confirmation and costs rating;
 * - a new day resets the operation counter and adds fresh generated orders,
 *   capped by the maximum number of simultaneously active orders.
 */

import {
  EARLY_END_RATING_PENALTY,
  MAX_ACTIVE_ORDERS,
  MAX_OPERATIONS_PER_DAY,
  ORDERS_PER_DAY,
  RATING_DELTAS,
  clamp,
  generateDailyOrders,
  resolveEndOfDay,
} from '@/domain'
import { toSessionDto, type EndDayDto } from '../dto'
import { AppError } from '../errors'
import type { EndDayInput } from '../schemas'
import type { ServiceDeps } from '../ports'

export async function endDay(
  deps: ServiceDeps,
  input: EndDayInput = {},
): Promise<EndDayDto> {
  return deps.uow.transaction(async (repositories) => {
    const session = await repositories.findActiveSession()
    if (session === null) {
      throw new AppError('GAME_NOT_FOUND')
    }

    if (session.status !== 'active') {
      throw new AppError('SESSION_FINISHED')
    }

    // Requirement: the day cannot be closed while a delivery is in transit.
    const activeDeliveries = await repositories.listActiveDeliveries()
    if (activeDeliveries.length > 0) {
      throw new AppError('DELIVERY_IN_PROGRESS')
    }

    // Requirement: fewer than the required operations => confirmation + penalty.
    const isEarlyEnd = session.operationsToday < MAX_OPERATIONS_PER_DAY
    if (isEarlyEnd && input.confirmEarlyEnd !== true) {
      throw new AppError('CONFIRMATION_REQUIRED')
    }
    const earlyEndPenalty = isEarlyEnd ? EARLY_END_RATING_PENALTY : 0

    const [orders, rovers] = await Promise.all([
      repositories.listOrders(),
      repositories.listRovers(),
    ])

    const outcome = resolveEndOfDay({
      session,
      orders,
      rovers,
      earlyEndPenalty,
    })

    await repositories.markOrdersExpired(outcome.expiredOrderIds)

    for (const update of outcome.batteryUpdates) {
      await repositories.updateRover(update.roverId, {
        batteryCharge: update.batteryAfter,
      })
    }

    const updatedSession = await repositories.updateSession(session.id, {
      currentDay: outcome.nextDay,
      rating: outcome.ratingAfter,
      status: outcome.sessionStatus,
      // Each new day starts with a clean operation counter.
      operationsToday: 0,
    })

    // Requirement: a new day adds fresh orders, capped so that no more than
    // MAX_ACTIVE_ORDERS stay active. Generation is deterministic by session
    // seed + day, so a refresh recomputes the same orders.
    if (outcome.sessionStatus === 'active') {
      const expiredIds = new Set(outcome.expiredOrderIds)
      const activeCount = orders.filter(
        (order) =>
          (order.status === 'available' || order.status === 'in_progress') &&
          !expiredIds.has(order.id),
      ).length
      const capacity = clamp(MAX_ACTIVE_ORDERS - activeCount, 0, ORDERS_PER_DAY)

      if (capacity > 0) {
        const locations = await repositories.listLocations()
        const newOrders = generateDailyOrders({
          seed: session.id,
          day: outcome.nextDay,
          count: capacity,
          locations,
          rovers,
        })
        await repositories.createOrders(newOrders)
      }
    }

    await repositories.createEvent({
      id: deps.ids.next(),
      gameSessionId: session.id,
      type: 'day_ended',
      title: `День ${session.currentDay} завершён`,
      description:
        `Наступил день ${outcome.nextDay} из ${session.maxDays}. ` +
        `Просрочено заказов: ${outcome.expiredOrderIds.length}. ` +
        `Роверы подзаряжены: ${outcome.batteryUpdates.length}.`,
      metadata: { expiredOrderIds: outcome.expiredOrderIds },
      day: outcome.nextDay,
    })

    // One GameEvent per expired order that actually costs rating. Challenge
    // orders never fail nor reduce rating on a plain expiry, so they emit no
    // penalty event. Two expired critical orders therefore produce two
    // separate events (−10 each, −20 total). The penalty itself is applied
    // once in the domain (resolveEndOfDay) and never re-applied on a repeated
    // end-day or GET, because expired orders leave the 'available' status.
    const expiredOrders = orders.filter((order) =>
      outcome.expiredOrderIds.includes(order.id),
    )
    for (const order of expiredOrders) {
      if (order.isChallenge) continue
      const ratingPenalty = RATING_DELTAS[order.urgency].failure
      await repositories.createEvent({
        id: deps.ids.next(),
        gameSessionId: session.id,
        type: 'order_expired',
        title: 'Заказ просрочен',
        description: `Заказ «${order.title}» просрочен, рейтинг снижен на ${ratingPenalty}.`,
        metadata: { orderId: order.id, ratingPenalty },
        day: outcome.nextDay,
      })
    }

    if (outcome.sessionStatus !== 'active') {
      await repositories.createEvent({
        id: deps.ids.next(),
        gameSessionId: session.id,
        type: outcome.sessionStatus === 'won' ? 'game_won' : 'game_lost',
        title:
          outcome.sessionStatus === 'won'
            ? 'Лунная база спасена'
            : 'Эвакуация базы',
        description:
          outcome.sessionStatus === 'won'
            ? `Кампания пройдена: все ${session.maxDays} дней позади, рейтинг ${outcome.ratingAfter}.`
            : `Рейтинг опустился ниже минимума (${session.minimumRating}). База эвакуирована.`,
        day: outcome.nextDay,
      })
    }

    return {
      session: toSessionDto(updatedSession),
      expiredOrderIds: outcome.expiredOrderIds,
      rechargedRoverIds: outcome.batteryUpdates.map((update) => update.roverId),
    }
  })
}
