/**
 * Zod schemas for untrusted input.
 *
 * The client may only send identifiers and an idempotency key. Everything else
 * (reward, battery cost, risk, result, statuses) is recalculated on the server.
 */

import { z } from 'zod'
import { AppError } from './errors'

const identifier = z
  .string()
  .trim()
  .min(1, 'identifier is required')
  .max(64, 'identifier is too long')
  .regex(/^[A-Za-z0-9_-]+$/, 'identifier contains unsupported characters')

export const deliveryPreviewInputSchema = z
  .object({
    orderId: identifier,
    roverId: identifier,
  })
  .strict()

export const startDeliveryInputSchema = z
  .object({
    orderId: identifier,
    roverId: identifier,
    idempotencyKey: z
      .string()
      .trim()
      .min(8, 'idempotencyKey is too short')
      .max(128, 'idempotencyKey is too long')
      .regex(/^[A-Za-z0-9_:-]+$/, 'idempotencyKey contains unsupported characters'),
  })
  .strict()

export const completeDeliveryInputSchema = z
  .object({
    deliveryId: identifier,
  })
  .strict()

// End-of-day input. `confirmEarlyEnd` acknowledges the rating penalty for
// ending the day before the required number of operations was reached.
export const endDayInputSchema = z
  .object({
    confirmEarlyEnd: z.boolean().optional(),
  })
  .strict()

// Rover upgrade purchase. The client only names the rover and the attribute;
// the day, balance, level and cost are all re-checked and charged server-side.
export const purchaseUpgradeInputSchema = z
  .object({
    roverId: identifier,
    upgradeType: z.enum(['battery', 'cargo', 'efficiency', 'safety', 'speed']),
  })
  .strict()

// Rover charging. The client only names the rover and the mode; every amount
// and cost is recalculated and charged server-side.
export const chargeRoverInputSchema = z
  .object({
    roverId: identifier,
    mode: z.enum(['quick', 'full']),
  })
  .strict()

export type ChargeRoverInput = z.infer<typeof chargeRoverInputSchema>

export type PurchaseUpgradeInput = z.infer<typeof purchaseUpgradeInputSchema>

export type DeliveryPreviewInput = z.infer<typeof deliveryPreviewInputSchema>
export type StartDeliveryInput = z.infer<typeof startDeliveryInputSchema>
export type CompleteDeliveryInput = z.infer<typeof completeDeliveryInputSchema>
export type EndDayInput = z.infer<typeof endDayInputSchema>

/**
 * Parses an unknown value with a Zod schema and converts failures into a
 * typed VALIDATION_ERROR without leaking internal details.
 */
export function parseInput<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
): z.infer<TSchema> {
  const result = schema.safeParse(value)

  if (!result.success) {
    throw AppError.validation({
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    })
  }

  return result.data
}
