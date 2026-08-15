/**
 * Deterministic starting configuration.
 *
 * Shared by the seed script (prisma/seed.ts) and by the reset use case so both
 * always produce the same initial game.
 */

import { DEFAULT_MINIMUM_RATING } from '@/domain'
import type { SessionDefaults } from './ports'

/** The local test project runs exactly one game session with a fixed id. */
export const LOCAL_SESSION_ID = 'session-local'

export const DEFAULT_SESSION: SessionDefaults = {
  id: LOCAL_SESSION_ID,
  currentDay: 1,
  maxDays: 12,
  // A new session starts with an empty wallet; credits are earned by delivering.
  balanceCredits: 0,
  earnedCredits: 0,
  targetCredits: 5000,
  rating: 100,
  minimumRating: DEFAULT_MINIMUM_RATING,
  operationsToday: 0,
}

/** Battery charge every rover starts with when the game is reset. */
export const DEFAULT_ROVER_BATTERY_CHARGE = 100

/** Base coordinates for the SVG placeholder map (viewBox units). */
export const BASE_POSITION = { x: 40, y: 40 } as const
