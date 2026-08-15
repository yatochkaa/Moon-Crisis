import 'server-only'

/**
 * Prisma implementation of the application repository port.
 *
 * The same factory is used for the root client and for a transaction client,
 * which keeps the transactional use cases free of Prisma details.
 */

import type {
  CreateDeliveryInput,
  CreateEventInput,
  DeliveryPatch,
  DeliveryRecord,
  GameEventRecord,
  GameRepositories,
  RoverPatch,
  SessionPatch,
} from '@/application/ports'
import type {
  GameSession,
  MoonLocation,
  Order,
  OrderStatus,
  Rover,
} from '@/domain/types'
import type { PrismaClientLike } from './prisma'
import {
  toDeliveryRecord,
  toGameEventRecord,
  toGameSession,
  toMoonLocation,
  toOrder,
  toRover,
} from './mappers'

export function createRepositories(client: PrismaClientLike): GameRepositories {
  return {
    async findActiveSession(): Promise<GameSession | null> {
      const row = await client.gameSession.findFirst({
        orderBy: { createdAt: 'desc' },
      })
      return row === null ? null : toGameSession(row)
    },

    async updateSession(id: string, patch: SessionPatch): Promise<GameSession> {
      const row = await client.gameSession.update({
        where: { id },
        data: {
          currentDay: patch.currentDay,
          balanceCredits: patch.balanceCredits,
          earnedCredits: patch.earnedCredits,
          rating: patch.rating,
          operationsToday: patch.operationsToday,
          status: patch.status,
        },
      })
      return toGameSession(row)
    },

    async listOrders(): Promise<Order[]> {
      const rows = await client.order.findMany({
        orderBy: [{ deadlineDay: 'asc' }, { reward: 'desc' }],
      })
      return rows.map(toOrder)
    },

    async createOrders(orders: readonly Order[]): Promise<void> {
      if (orders.length === 0) return
      await client.order.createMany({
        data: orders.map((order) => ({
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
    },

    async findOrderById(id: string): Promise<Order | null> {
      const row = await client.order.findUnique({ where: { id } })
      return row === null ? null : toOrder(row)
    },

    async updateOrderStatus(id: string, status: OrderStatus): Promise<void> {
      await client.order.update({ where: { id }, data: { status } })
    },

    async markOrdersExpired(ids: readonly string[]): Promise<void> {
      if (ids.length === 0) return
      await client.order.updateMany({
        where: { id: { in: [...ids] }, status: 'available' },
        data: { status: 'expired' },
      })
    },

    async listRovers(): Promise<Rover[]> {
      const rows = await client.rover.findMany({ orderBy: { name: 'asc' } })
      return rows.map(toRover)
    },

    async findRoverById(id: string): Promise<Rover | null> {
      const row = await client.rover.findUnique({ where: { id } })
      return row === null ? null : toRover(row)
    },

    async updateRover(id: string, patch: RoverPatch): Promise<void> {
      await client.rover.update({
        where: { id },
        data: {
          batteryCharge: patch.batteryCharge,
          status: patch.status,
          capacityLevel: patch.capacityLevel,
          speedLevel: patch.speedLevel,
          efficiencyLevel: patch.efficiencyLevel,
          batteryLevel: patch.batteryLevel,
          safetyLevel: patch.safetyLevel,
        },
      })
    },

    async listLocations(): Promise<MoonLocation[]> {
      const rows = await client.location.findMany({
        orderBy: { distance: 'asc' },
      })
      return rows.map(toMoonLocation)
    },

    async findLocationById(id: string): Promise<MoonLocation | null> {
      const row = await client.location.findUnique({ where: { id } })
      return row === null ? null : toMoonLocation(row)
    },

    async findDeliveryByIdempotencyKey(
      key: string,
    ): Promise<DeliveryRecord | null> {
      const row = await client.delivery.findUnique({
        where: { idempotencyKey: key },
      })
      return row === null ? null : toDeliveryRecord(row)
    },

    async createDelivery(input: CreateDeliveryInput): Promise<DeliveryRecord> {
      const row = await client.delivery.create({
        data: {
          id: input.id,
          gameSessionId: input.gameSessionId,
          orderId: input.orderId,
          roverId: input.roverId,
          calculatedBatteryCost: input.calculatedBatteryCost,
          calculatedRisk: input.calculatedRisk,
          calculatedDuration: input.calculatedDuration,
          reward: input.reward,
          status: input.status,
          startedAt: input.startedAt,
          completesAt: input.completesAt,
          result: input.result,
          idempotencyKey: input.idempotencyKey,
        },
      })
      return toDeliveryRecord(row)
    },

    async findDeliveryById(id: string): Promise<DeliveryRecord | null> {
      const row = await client.delivery.findUnique({ where: { id } })
      return row === null ? null : toDeliveryRecord(row)
    },

    async findActiveDelivery(): Promise<DeliveryRecord | null> {
      const row = await client.delivery.findFirst({
        where: { status: 'in_transit' },
        orderBy: { startedAt: 'desc' },
      })
      return row === null ? null : toDeliveryRecord(row)
    },

    async listActiveDeliveries(): Promise<DeliveryRecord[]> {
      const rows = await client.delivery.findMany({
        where: { status: 'in_transit' },
        orderBy: { startedAt: 'asc' },
      })
      return rows.map(toDeliveryRecord)
    },

    async updateDelivery(
      id: string,
      patch: DeliveryPatch,
    ): Promise<DeliveryRecord> {
      const row = await client.delivery.update({
        where: { id },
        data: { status: patch.status, result: patch.result },
      })
      return toDeliveryRecord(row)
    },

    async createEvent(input: CreateEventInput): Promise<GameEventRecord> {
      const row = await client.gameEvent.create({
        data: {
          id: input.id,
          gameSessionId: input.gameSessionId,
          deliveryId: input.deliveryId ?? null,
          type: input.type,
          title: input.title,
          description: input.description,
          metadata:
            input.metadata === undefined || input.metadata === null
              ? null
              : JSON.stringify(input.metadata),
          day: input.day,
        },
      })
      return toGameEventRecord(row)
    },

    async listRecentEvents(
      sessionId: string,
      limit: number,
    ): Promise<GameEventRecord[]> {
      const rows = await client.gameEvent.findMany({
        where: { gameSessionId: sessionId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })
      return rows.map(toGameEventRecord)
    },

    async restartGame(input): Promise<GameSession> {
      // Local test project only: wipes progress and restores the seeded state.
      await client.gameEvent.deleteMany({})
      await client.delivery.deleteMany({})
      // Orders are generated per day now; the reset use case regenerates them.
      await client.order.deleteMany({})
      await client.rover.updateMany({
        data: {
          status: 'idle',
          batteryCharge: input.roverBatteryCharge,
          capacityLevel: 0,
          speedLevel: 0,
          efficiencyLevel: 0,
          batteryLevel: 0,
          safetyLevel: 0,
        },
      })

      const row = await client.gameSession.upsert({
        where: { id: input.session.id },
        update: {
          currentDay: input.session.currentDay,
          maxDays: input.session.maxDays,
          balanceCredits: input.session.balanceCredits,
          earnedCredits: input.session.earnedCredits,
          targetCredits: input.session.targetCredits,
          rating: input.session.rating,
          minimumRating: input.session.minimumRating,
          operationsToday: input.session.operationsToday,
          status: 'active',
        },
        create: {
          id: input.session.id,
          currentDay: input.session.currentDay,
          maxDays: input.session.maxDays,
          balanceCredits: input.session.balanceCredits,
          earnedCredits: input.session.earnedCredits,
          targetCredits: input.session.targetCredits,
          rating: input.session.rating,
          minimumRating: input.session.minimumRating,
          operationsToday: input.session.operationsToday,
          status: 'active',
        },
      })

      return toGameSession(row)
    },
  }
}
