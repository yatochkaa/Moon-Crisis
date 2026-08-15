import 'server-only'

/**
 * Database row -> domain object mapping.
 *
 * SQLite stores enum-like columns as TEXT, so every row is validated with Zod
 * before it becomes a domain object. A failure here means corrupted data, not
 * bad user input, therefore it throws a generic Error that the route handlers
 * translate into INTERNAL_ERROR.
 */

import { z } from 'zod'
import {
  DELIVERY_RESULTS,
  DELIVERY_STATUSES,
  GAME_EVENT_TYPES,
  ORDER_STATUSES,
  ORDER_URGENCIES,
  ROVER_STATUSES,
  SESSION_STATUSES,
  ZONE_TYPES,
} from '@/domain/types'
import type { GameSession, MoonLocation, Order, Rover } from '@/domain/types'
import type { DeliveryRecord, GameEventRecord } from '@/application/ports'

const sessionRowSchema = z.object({
  id: z.string(),
  currentDay: z.number().int(),
  maxDays: z.number().int(),
  balanceCredits: z.number().int(),
  earnedCredits: z.number().int(),
  targetCredits: z.number().int(),
  rating: z.number().int(),
  minimumRating: z.number().int(),
  operationsToday: z.number().int(),
  status: z.enum(SESSION_STATUSES),
})

const locationRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  x: z.number(),
  y: z.number(),
  distance: z.number(),
  zoneType: z.enum(ZONE_TYPES),
  batteryModifier: z.number(),
  speedModifier: z.number(),
  riskBonus: z.number().int(),
})

const roverRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  batteryCharge: z.number().int(),
  batteryCapacity: z.number().int(),
  capacity: z.number().int(),
  speed: z.number(),
  efficiency: z.number(),
  capacityLevel: z.number().int(),
  speedLevel: z.number().int(),
  efficiencyLevel: z.number().int(),
  batteryLevel: z.number().int(),
  safetyLevel: z.number().int(),
  status: z.enum(ROVER_STATUSES),
})

const orderRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  locationId: z.string(),
  weight: z.number().int(),
  reward: z.number().int(),
  urgency: z.enum(ORDER_URGENCIES),
  baseRisk: z.number().int(),
  deadlineDay: z.number().int(),
  isChallenge: z.boolean(),
  status: z.enum(ORDER_STATUSES),
})

const deliveryRowSchema = z.object({
  id: z.string(),
  gameSessionId: z.string(),
  orderId: z.string(),
  roverId: z.string(),
  calculatedBatteryCost: z.number().int(),
  calculatedRisk: z.number().int(),
  calculatedDuration: z.number().int(),
  reward: z.number().int(),
  status: z.enum(DELIVERY_STATUSES),
  startedAt: z.date(),
  completesAt: z.date(),
  result: z.enum(DELIVERY_RESULTS).nullable(),
  idempotencyKey: z.string(),
  createdAt: z.date(),
})

const eventRowSchema = z.object({
  id: z.string(),
  gameSessionId: z.string(),
  deliveryId: z.string().nullable(),
  type: z.enum(GAME_EVENT_TYPES),
  title: z.string(),
  description: z.string(),
  metadata: z.string().nullable(),
  day: z.number().int(),
  createdAt: z.date(),
})

function parseRow<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  row: unknown,
  label: string,
): z.infer<TSchema> {
  const result = schema.safeParse(row)
  if (!result.success) {
    throw new Error(`Corrupted ${label} row in database`)
  }
  return result.data
}

/** Parses the optional metadata TEXT column into a plain object. */
function parseMetadata(raw: string | null): Record<string, unknown> | null {
  if (raw === null || raw.length === 0) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, unknown>
    }
    return null
  } catch {
    // Corrupted metadata must never break the event log.
    return null
  }
}

export function toGameSession(row: unknown): GameSession {
  return parseRow(sessionRowSchema, row, 'GameSession')
}

export function toMoonLocation(row: unknown): MoonLocation {
  return parseRow(locationRowSchema, row, 'Location')
}

export function toRover(row: unknown): Rover {
  return parseRow(roverRowSchema, row, 'Rover')
}

export function toOrder(row: unknown): Order {
  return parseRow(orderRowSchema, row, 'Order')
}

export function toDeliveryRecord(row: unknown): DeliveryRecord {
  return parseRow(deliveryRowSchema, row, 'Delivery')
}

export function toGameEventRecord(row: unknown): GameEventRecord {
  const parsed = parseRow(eventRowSchema, row, 'GameEvent')

  return {
    id: parsed.id,
    gameSessionId: parsed.gameSessionId,
    deliveryId: parsed.deliveryId,
    type: parsed.type,
    title: parsed.title,
    description: parsed.description,
    metadata: parseMetadata(parsed.metadata),
    day: parsed.day,
    createdAt: parsed.createdAt,
  }
}
