/**
 * In-memory implementation of the application ports.
 *
 * Used by the integration test instead of a real SQLite file: it exercises the
 * real application service (transaction boundary included) without fragile
 * infrastructure. `transaction()` snapshots the state and restores it when the
 * callback throws, mirroring a rollback.
 */

import type {
  Clock,
  CreateDeliveryInput,
  CreateEventInput,
  DeliveryPatch,
  DeliveryRecord,
  GameEventRecord,
  GameRepositories,
  IdGenerator,
  RandomSource,
  RoverPatch,
  SessionDefaults,
  SessionPatch,
  UnitOfWork,
} from '../../src/application/ports'
import type {
  GameSession,
  MoonLocation,
  Order,
  OrderStatus,
  Rover,
} from '../../src/domain/types'

export type StoreState = {
  session: GameSession
  orders: Order[]
  rovers: Rover[]
  locations: MoonLocation[]
  deliveries: DeliveryRecord[]
  events: GameEventRecord[]
}

export type TestStore = {
  state: StoreState
  uow: UnitOfWork
}

function cloneState(state: StoreState): StoreState {
  return {
    session: { ...state.session },
    orders: state.orders.map((order) => ({ ...order })),
    rovers: state.rovers.map((rover) => ({ ...rover })),
    locations: state.locations.map((location) => ({ ...location })),
    deliveries: state.deliveries.map((delivery) => ({ ...delivery })),
    events: state.events.map((event) => ({ ...event })),
  }
}

const FIXED_DATE = new Date('2026-01-01T00:00:00.000Z')

function createRepositories(store: { state: StoreState }): GameRepositories {
  return {
    async findActiveSession(): Promise<GameSession | null> {
      return { ...store.state.session }
    },

    async updateSession(id: string, patch: SessionPatch): Promise<GameSession> {
      if (store.state.session.id !== id) {
        throw new Error(`Unknown session ${id}`)
      }
      store.state.session = { ...store.state.session, ...patch }
      return { ...store.state.session }
    },

    async listOrders(): Promise<Order[]> {
      return store.state.orders.map((order) => ({ ...order }))
    },

    async createOrders(orders: readonly Order[]): Promise<void> {
      store.state.orders = [
        ...store.state.orders,
        ...orders.map((order) => ({ ...order })),
      ]
    },

    async findOrderById(id: string): Promise<Order | null> {
      const found = store.state.orders.find((order) => order.id === id)
      return found === undefined ? null : { ...found }
    },

    async updateOrderStatus(id: string, status: OrderStatus): Promise<void> {
      store.state.orders = store.state.orders.map((order) =>
        order.id === id ? { ...order, status } : order,
      )
    },

    async markOrdersExpired(ids: readonly string[]): Promise<void> {
      const idSet = new Set(ids)
      store.state.orders = store.state.orders.map((order) =>
        idSet.has(order.id) ? { ...order, status: 'expired' } : order,
      )
    },

    async listRovers(): Promise<Rover[]> {
      return store.state.rovers.map((rover) => ({ ...rover }))
    },

    async findRoverById(id: string): Promise<Rover | null> {
      const found = store.state.rovers.find((rover) => rover.id === id)
      return found === undefined ? null : { ...found }
    },

    async updateRover(id: string, patch: RoverPatch): Promise<void> {
      store.state.rovers = store.state.rovers.map((rover) =>
        rover.id === id ? { ...rover, ...patch } : rover,
      )
    },

    async listLocations(): Promise<MoonLocation[]> {
      return store.state.locations.map((location) => ({ ...location }))
    },

    async findLocationById(id: string): Promise<MoonLocation | null> {
      const found = store.state.locations.find((location) => location.id === id)
      return found === undefined ? null : { ...found }
    },

    async findDeliveryByIdempotencyKey(
      key: string,
    ): Promise<DeliveryRecord | null> {
      const found = store.state.deliveries.find(
        (delivery) => delivery.idempotencyKey === key,
      )
      return found === undefined ? null : { ...found }
    },

    async createDelivery(input: CreateDeliveryInput): Promise<DeliveryRecord> {
      const duplicate = store.state.deliveries.some(
        (delivery) => delivery.idempotencyKey === input.idempotencyKey,
      )
      if (duplicate) {
        // Mirrors the unique constraint on Delivery.idempotencyKey.
        throw new Error('UNIQUE constraint failed: Delivery.idempotencyKey')
      }

      const record: DeliveryRecord = { ...input, createdAt: FIXED_DATE }
      store.state.deliveries = [...store.state.deliveries, record]
      return { ...record }
    },

    async findDeliveryById(id: string): Promise<DeliveryRecord | null> {
      const found = store.state.deliveries.find(
        (delivery) => delivery.id === id,
      )
      return found === undefined ? null : { ...found }
    },

    async findActiveDelivery(): Promise<DeliveryRecord | null> {
      const active = [...store.state.deliveries]
        .reverse()
        .find((delivery) => delivery.status === 'in_transit')
      return active === undefined ? null : { ...active }
    },

    async listActiveDeliveries(): Promise<DeliveryRecord[]> {
      return store.state.deliveries
        .filter((delivery) => delivery.status === 'in_transit')
        .map((delivery) => ({ ...delivery }))
    },

    async updateDelivery(
      id: string,
      patch: DeliveryPatch,
    ): Promise<DeliveryRecord> {
      const existing = store.state.deliveries.find(
        (delivery) => delivery.id === id,
      )
      if (existing === undefined) {
        throw new Error(`Unknown delivery ${id}`)
      }
      const updated: DeliveryRecord = { ...existing, ...patch }
      store.state.deliveries = store.state.deliveries.map((delivery) =>
        delivery.id === id ? updated : delivery,
      )
      return { ...updated }
    },

    async createEvent(input: CreateEventInput): Promise<GameEventRecord> {
      const record: GameEventRecord = {
        id: input.id,
        gameSessionId: input.gameSessionId,
        deliveryId: input.deliveryId ?? null,
        type: input.type,
        title: input.title,
        description: input.description,
        metadata: input.metadata ?? null,
        day: input.day,
        createdAt: FIXED_DATE,
      }
      store.state.events = [...store.state.events, record]
      return { ...record }
    },

    async listRecentEvents(
      sessionId: string,
      limit: number,
    ): Promise<GameEventRecord[]> {
      return store.state.events
        .filter((event) => event.gameSessionId === sessionId)
        .slice(-limit)
        .reverse()
        .map((event) => ({ ...event }))
    },

    async restartGame(input: {
      session: SessionDefaults
      roverBatteryCharge: number
    }): Promise<GameSession> {
      store.state.deliveries = []
      store.state.events = []
      // Orders are generated per day now; the reset use case regenerates them.
      store.state.orders = []
      store.state.rovers = store.state.rovers.map((rover) => ({
        ...rover,
        batteryCharge: input.roverBatteryCharge,
        capacityLevel: 0,
        speedLevel: 0,
        efficiencyLevel: 0,
        batteryLevel: 0,
        safetyLevel: 0,
        status: 'idle',
      }))
      store.state.session = { ...input.session, status: 'active' }
      return { ...store.state.session }
    },
  }
}

export function createTestStore(initial: StoreState): TestStore {
  const store = { state: cloneState(initial) }
  const repositories = createRepositories(store)

  const uow: UnitOfWork = {
    repositories,
    async transaction<T>(
      run: (repositories: GameRepositories) => Promise<T>,
    ): Promise<T> {
      const snapshot = cloneState(store.state)
      try {
        return await run(repositories)
      } catch (error) {
        store.state = snapshot
        throw error
      }
    },
  }

  return {
    get state(): StoreState {
      return store.state
    },
    uow,
  }
}

/** Random source returning a fixed sequence of rolls. */
export function createFixedRolls(rolls: readonly number[]): RandomSource {
  let index = 0
  return {
    nextFloat(): number {
      const roll = rolls[Math.min(index, rolls.length - 1)]
      index += 1
      return roll ?? 0.5
    },
  }
}

/** Predictable ids: id-1, id-2, ... */
export function createSequentialIds(prefix = 'id'): IdGenerator {
  let counter = 0
  return {
    next(): string {
      counter += 1
      return `${prefix}-${counter}`
    },
  }
}

/** Clock returning a fixed instant, so durations are deterministic in tests. */
export function createFixedClock(iso = '2026-01-01T00:00:00.000Z'): Clock {
  const fixed = new Date(iso)
  return {
    now(): Date {
      return new Date(fixed.getTime())
    },
  }
}
