/**
 * Use case: load the whole visible game state.
 *
 * Read-only, therefore no transaction is required. It also exposes the single
 * in-transit delivery (if any) so the client can resume the countdown after a
 * page refresh (requirement 10).
 */

import { RECENT_EVENTS_LIMIT } from '@/domain/constants'
import { describeChallenge, isChallengeFeasible } from '@/domain'
import { BASE_POSITION } from '../gameDefaults'
import {
  toActiveDeliveryDto,
  toEventDto,
  toFinalResultDto,
  toLocationDto,
  toOrderDto,
  toRoverDto,
  toSessionDto,
  type ActiveDeliveryDto,
  type GameStateDto,
} from '../dto'
import { AppError } from '../errors'
import type { ServiceDeps } from '../ports'

export async function getGameState(
  deps: Pick<ServiceDeps, 'uow'>,
): Promise<GameStateDto> {
  const repositories = deps.uow.repositories

  const session = await repositories.findActiveSession()
  if (session === null) {
    throw new AppError('GAME_NOT_FOUND')
  }

  const [orders, rovers, locations, events, activeDeliveryRecords] =
    await Promise.all([
      repositories.listOrders(),
      repositories.listRovers(),
      repositories.listLocations(),
      repositories.listRecentEvents(session.id, RECENT_EVENTS_LIMIT),
      repositories.listActiveDeliveries(),
    ])

  // Every in-transit delivery is exposed so the client can resume the countdown
  // and the marker position for all parallel missions after a refresh
  // (requirements 6, 8, 9). Server startedAt/completesAt stay the source of truth.
  const activeDeliveries: ActiveDeliveryDto[] = []
  for (const record of activeDeliveryRecords) {
    const order = orders.find((item) => item.id === record.orderId)
    if (order !== undefined) {
      activeDeliveries.push(toActiveDeliveryDto(record, order.locationId))
    }
  }

  const locationById = new Map(
    locations.map((location) => [location.id, location]),
  )

  // Context for detailed upgrade explanations and concrete examples.
  const explainContext = { orders, locations, rovers }

  return {
    session: toSessionDto(session),
    activeDeliveries,
    base: { x: BASE_POSITION.x, y: BASE_POSITION.y },
    locations: locations.map(toLocationDto),
    rovers: rovers.map((rover) => toRoverDto(rover, session, explainContext)),
    orders: orders.map((order) => {
      const day = session.currentDay
      if (!order.isChallenge) return toOrderDto(order, day)
      const location = locationById.get(order.locationId)
      if (location === undefined) return toOrderDto(order, day)
      // A feasible challenge carries no blocking reason/hint, so the UI shows it
      // as available. Recomputed live, so a purchased upgrade unlocks it at once.
      if (isChallengeFeasible(order, location, rovers)) return toOrderDto(order, day)
      return toOrderDto(order, day, describeChallenge(order, location, rovers))
    }),
    events: events.map(toEventDto),
    finalResult: toFinalResultDto(session, orders, events),
  }
}
