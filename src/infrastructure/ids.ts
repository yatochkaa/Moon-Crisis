import 'server-only'

/** Centralised identifier generation (injectable for deterministic tests). */

import { randomUUID } from 'node:crypto'
import type { IdGenerator } from '@/application/ports'

export function createUuidGenerator(): IdGenerator {
  return {
    next(): string {
      return randomUUID()
    },
  }
}

/** Deterministic generator used by tests: `prefix-1`, `prefix-2`, ... */
export function createSequentialIdGenerator(prefix: string): IdGenerator {
  let counter = 0

  return {
    next(): string {
      counter += 1
      return `${prefix}-${counter}`
    },
  }
}
