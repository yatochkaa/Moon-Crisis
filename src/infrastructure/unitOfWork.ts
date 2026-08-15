import 'server-only'

/**
 * Prisma-backed transaction boundary.
 *
 * `$transaction` rolls back every write when the callback throws, which is what
 * the delivery use case relies on for atomicity.
 *
 * SQLite runs writes serially (single writer). Under real concurrency the
 * transaction may fail with a busy/locked error instead of waiting, see
 * docs/security.md for the PostgreSQL comparison.
 */

import type { GameRepositories, UnitOfWork } from '@/application/ports'
import { prisma } from './prisma'
import { createRepositories } from './repositories'

export function createUnitOfWork(): UnitOfWork {
  const repositories: GameRepositories = createRepositories(prisma)

  return {
    repositories,
    async transaction<T>(
      run: (transactionalRepositories: GameRepositories) => Promise<T>,
    ): Promise<T> {
      return prisma.$transaction(async (tx) => run(createRepositories(tx)))
    },
  }
}
