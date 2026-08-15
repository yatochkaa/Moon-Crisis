import 'server-only'

import { PrismaClient } from '@prisma/client'

/**
 * Prisma client singleton.
 *
 * `import 'server-only'` makes the build fail if this module is ever pulled
 * into a client bundle. In development the instance is cached on `globalThis`
 * so hot reload does not open a new SQLite connection on every change.
 */

declare global {
  // eslint-disable-next-line no-var
  var __moonCourierPrisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}

export const prisma: PrismaClient =
  globalThis.__moonCourierPrisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalThis.__moonCourierPrisma = prisma
}

/**
 * Prisma client or transaction client.
 *
 * Declared structurally (instead of importing `Prisma.TransactionClient`) so
 * repositories accept both the root client and a transaction client.
 */
export type PrismaClientLike = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$use' | '$transaction' | '$extends'
>
