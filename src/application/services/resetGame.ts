/**
 * Use case: reset the local demo game.
 *
 * LIMITATION: this endpoint is destructive and unauthenticated. It exists only
 * because the project is a local test assignment without authentication. It is
 * disabled unless NODE_ENV !== 'production' or ALLOW_GAME_RESET === 'true'.
 * See docs/security.md.
 */

import { generateDailyOrders, ORDERS_PER_DAY } from '@/domain'
import { toSessionDto, type SessionDto } from '../dto'
import { AppError } from '../errors'
import { DEFAULT_ROVER_BATTERY_CHARGE, DEFAULT_SESSION } from '../gameDefaults'
import type { ServiceDeps } from '../ports'

export type ResetGameOptions = {
  /** Whether the caller is allowed to reset the game. */
  readonly allowed: boolean
}

export async function resetGame(
  deps: ServiceDeps,
  options: ResetGameOptions,
): Promise<SessionDto> {
  if (!options.allowed) {
    throw new AppError('ACTION_NOT_ALLOWED', {
      message: 'Сброс игры доступен только в локальной тестовой среде',
    })
  }

  return deps.uow.transaction(async (repositories) => {
    const session = await repositories.restartGame({
      session: DEFAULT_SESSION,
      roverBatteryCharge: DEFAULT_ROVER_BATTERY_CHARGE,
    })

    // Requirement 1: reset generates the four orders of the first day. The
    // session id is the deterministic seed, so a refresh always recomputes the
    // same orders (requirement 10).
    const [locations, rovers] = await Promise.all([
      repositories.listLocations(),
      repositories.listRovers(),
    ])
    const firstDayOrders = generateDailyOrders({
      seed: session.id,
      day: session.currentDay,
      count: ORDERS_PER_DAY,
      locations,
      rovers,
    })
    await repositories.createOrders(firstDayOrders)

    await repositories.createEvent({
      id: deps.ids.next(),
      gameSessionId: session.id,
      type: 'game_reset',
      title: 'Игра сброшена',
      description: 'Создано новое тестовое состояние игры.',
      day: session.currentDay,
    })

    return toSessionDto(session)
  })
}
