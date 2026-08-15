import 'server-only'

/** Centralised server-side clock (injectable for deterministic tests). */

import type { Clock } from '@/application/ports'

export function createSystemClock(): Clock {
  return {
    now(): Date {
      return new Date()
    },
  }
}
