import 'server-only'

/**
 * Composition root.
 *
 * Route handlers get their dependencies from here; they never construct Prisma
 * clients or random sources themselves.
 */

import type { ServiceDeps } from '@/application/ports'
import { createSystemClock } from './clock'
import { createUuidGenerator } from './ids'
import { createServerRandomSource } from './random'
import { createUnitOfWork } from './unitOfWork'

let cached: ServiceDeps | null = null

export function getServiceDeps(): ServiceDeps {
  if (cached === null) {
    cached = {
      uow: createUnitOfWork(),
      random: createServerRandomSource(),
      ids: createUuidGenerator(),
      clock: createSystemClock(),
    }
  }

  return cached
}

/**
 * Whether POST /api/game/reset may run.
 * Destructive and unauthenticated, therefore off in production by default.
 */
export function isGameResetAllowed(): boolean {
  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.ALLOW_GAME_RESET === 'true'
  )
}
