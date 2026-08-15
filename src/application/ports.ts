/**
 * Ports (interfaces) the application layer depends on.
 *
 * The infrastructure layer implements them with Prisma/SQLite, the tests
 * implement them in memory. No Prisma or Next.js type ever leaks in here.
 */

import type {
  DeliveryResult,
  DeliveryStatus,
  GameEventType,
  GameSession,
  MoonLocation,
  Order,
  OrderStatus,
  Rover,
  RoverStatus,
  SessionStatus,
} from '@/domain/types'

/** Server-side randomness, injectable for deterministic tests. */
export type RandomSource = {
  /** Uniform float in [0, 1). */
  nextFloat(): number
}

/** Identifier generation, injectable for deterministic tests. */
export type IdGenerator = {
  next(): string
}

/** Server-side clock, injectable for deterministic tests. */
export type Clock = {
  now(): Date
}

export type DeliveryRecord = {
  readonly id: string
  readonly gameSessionId: string
  readonly orderId: string
  readonly roverId: string
  readonly calculatedBatteryCost: number
  readonly calculatedRisk: number
  readonly calculatedDuration: number
  readonly reward: number
  readonly status: DeliveryStatus
  readonly startedAt: Date
  readonly completesAt: Date
  /** Null while a delivery is in transit; set only after completion. */
  readonly result: DeliveryResult | null
  readonly idempotencyKey: string
  readonly createdAt: Date
}

export type GameEventRecord = {
  readonly id: string
  readonly gameSessionId: string
  readonly deliveryId: string | null
  readonly type: GameEventType
  readonly title: string
  readonly description: string
  readonly metadata: Record<string, unknown> | null
  readonly day: number
  readonly createdAt: Date
}

export type CreateDeliveryInput = {
  readonly id: string
  readonly gameSessionId: string
  readonly orderId: string
  readonly roverId: string
  readonly calculatedBatteryCost: number
  readonly calculatedRisk: number
  readonly calculatedDuration: number
  readonly reward: number
  readonly status: DeliveryStatus
  readonly startedAt: Date
  readonly completesAt: Date
  /** Null at departure; set by completeDelivery after the server deadline. */
  readonly result: DeliveryResult | null
  readonly idempotencyKey: string
}

export type CreateEventInput = {
  readonly id: string
  readonly gameSessionId: string
  readonly deliveryId?: string | null
  readonly type: GameEventType
  readonly title: string
  readonly description: string
  readonly metadata?: Record<string, unknown> | null
  readonly day: number
}

export type SessionPatch = {
  readonly currentDay?: number
  readonly balanceCredits?: number
  readonly earnedCredits?: number
  readonly rating?: number
  readonly operationsToday?: number
  readonly status?: SessionStatus
}

export type RoverPatch = {
  readonly batteryCharge?: number
  readonly status?: RoverStatus
  readonly capacityLevel?: number
  readonly speedLevel?: number
  readonly efficiencyLevel?: number
  readonly batteryLevel?: number
  readonly safetyLevel?: number
}

export type DeliveryPatch = {
  readonly status?: DeliveryStatus
  readonly result?: DeliveryResult | null
}

export type SessionDefaults = {
  readonly id: string
  readonly currentDay: number
  readonly maxDays: number
  readonly balanceCredits: number
  readonly earnedCredits: number
  readonly targetCredits: number
  readonly rating: number
  readonly minimumRating: number
  readonly operationsToday: number
}

export type GameRepositories = {
  findActiveSession(): Promise<GameSession | null>
  updateSession(id: string, patch: SessionPatch): Promise<GameSession>

  listOrders(): Promise<Order[]>
  /** Inserts freshly generated orders for a day (used at reset and day start). */
  createOrders(orders: readonly Order[]): Promise<void>
  findOrderById(id: string): Promise<Order | null>
  updateOrderStatus(id: string, status: OrderStatus): Promise<void>
  markOrdersExpired(ids: readonly string[]): Promise<void>

  listRovers(): Promise<Rover[]>
  findRoverById(id: string): Promise<Rover | null>
  updateRover(id: string, patch: RoverPatch): Promise<void>

  listLocations(): Promise<MoonLocation[]>
  findLocationById(id: string): Promise<MoonLocation | null>

  findDeliveryByIdempotencyKey(key: string): Promise<DeliveryRecord | null>
  findDeliveryById(id: string): Promise<DeliveryRecord | null>
  findActiveDelivery(): Promise<DeliveryRecord | null>
  /** Every in-transit delivery, so parallel missions can all be resumed. */
  listActiveDeliveries(): Promise<DeliveryRecord[]>
  createDelivery(input: CreateDeliveryInput): Promise<DeliveryRecord>
  updateDelivery(id: string, patch: DeliveryPatch): Promise<DeliveryRecord>

  createEvent(input: CreateEventInput): Promise<GameEventRecord>
  listRecentEvents(
    sessionId: string,
    limit: number,
  ): Promise<GameEventRecord[]>

  /**
   * Restores the deterministic starting state (local test project only).
   * Deletes deliveries and events, resets orders, rovers and the session.
   */
  restartGame(input: {
    readonly session: SessionDefaults
    readonly roverBatteryCharge: number
  }): Promise<GameSession>
}

/**
 * Transaction boundary. `transaction()` must roll back every write when the
 * callback throws.
 */
export type UnitOfWork = {
  readonly repositories: GameRepositories
  transaction<T>(run: (repositories: GameRepositories) => Promise<T>): Promise<T>
}

export type ServiceDeps = {
  readonly uow: UnitOfWork
  readonly random: RandomSource
  readonly ids: IdGenerator
  readonly clock: Clock
}
