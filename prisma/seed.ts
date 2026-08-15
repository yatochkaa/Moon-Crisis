/**
 * Idempotent seed.
 *
 * Locations, rovers and the local session are upserted by a fixed id, so
 * running `pnpm db:seed` twice yields the same deterministic base data.
 *
 * Orders are no longer static: they are generated deterministically from the
 * session seed + day (requirement 10). The seed therefore clears progress
 * (events, deliveries, orders) and regenerates the four first-day orders, which
 * matches exactly what a reset produces at runtime (requirement 1).
 */

import { PrismaClient } from '@prisma/client'
import {
  DEFAULT_SESSION,
  LOCAL_SESSION_ID,
} from '../src/application/gameDefaults'
import { ORDERS_PER_DAY, generateDailyOrders } from '../src/domain'
import { SEED_LOCATIONS, SEED_ROVERS } from './seedData'

const prisma = new PrismaClient()

async function main(): Promise<void> {
  for (const location of SEED_LOCATIONS) {
    await prisma.location.upsert({
      where: { id: location.id },
      update: { ...location },
      create: { ...location },
    })
  }

  for (const rover of SEED_ROVERS) {
    await prisma.rover.upsert({
      where: { id: rover.id },
      update: { ...rover },
      create: { ...rover },
    })
  }

  await prisma.gameSession.upsert({
    where: { id: LOCAL_SESSION_ID },
    update: {
      currentDay: DEFAULT_SESSION.currentDay,
      maxDays: DEFAULT_SESSION.maxDays,
      balanceCredits: DEFAULT_SESSION.balanceCredits,
      earnedCredits: DEFAULT_SESSION.earnedCredits,
      targetCredits: DEFAULT_SESSION.targetCredits,
      rating: DEFAULT_SESSION.rating,
      minimumRating: DEFAULT_SESSION.minimumRating,
      operationsToday: DEFAULT_SESSION.operationsToday,
      status: 'active',
    },
    create: {
      id: LOCAL_SESSION_ID,
      currentDay: DEFAULT_SESSION.currentDay,
      maxDays: DEFAULT_SESSION.maxDays,
      balanceCredits: DEFAULT_SESSION.balanceCredits,
      earnedCredits: DEFAULT_SESSION.earnedCredits,
      targetCredits: DEFAULT_SESSION.targetCredits,
      rating: DEFAULT_SESSION.rating,
      minimumRating: DEFAULT_SESSION.minimumRating,
      operationsToday: DEFAULT_SESSION.operationsToday,
      status: 'active',
    },
  })

  // Orders are generated per day; regenerate the first-day batch deterministically.
  await prisma.gameEvent.deleteMany({})
  await prisma.delivery.deleteMany({})
  await prisma.order.deleteMany({})

  const firstDayOrders = generateDailyOrders({
    seed: LOCAL_SESSION_ID,
    day: DEFAULT_SESSION.currentDay,
    count: ORDERS_PER_DAY,
    locations: SEED_LOCATIONS,
    rovers: SEED_ROVERS,
  })

  await prisma.order.createMany({
    data: firstDayOrders.map((order) => ({
      id: order.id,
      title: order.title,
      description: order.description,
      locationId: order.locationId,
      weight: order.weight,
      reward: order.reward,
      urgency: order.urgency,
      baseRisk: order.baseRisk,
      deadlineDay: order.deadlineDay,
      isChallenge: order.isChallenge,
      status: order.status,
    })),
  })

  console.info(
    `Seed ready: ${SEED_LOCATIONS.length} locations, ${SEED_ROVERS.length} rovers, ${firstDayOrders.length} orders.`,
  )
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed', error)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
