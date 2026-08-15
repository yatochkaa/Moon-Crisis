/**
 * Typed public application errors.
 *
 * Every known failure is expressed as an `AppError` with a stable machine code
 * and a Russian user-facing message. Unknown failures are converted into a
 * generic INTERNAL_ERROR so that stack traces, Prisma messages or SQL details
 * never reach the client.
 */

import { BLOCK_REASON_MESSAGES } from '@/shared/messages'
import type { DeliveryBlockReason } from '@/domain/types'

export const APP_ERROR_CODES = [
  'VALIDATION_ERROR',
  'GAME_NOT_FOUND',
  'ORDER_NOT_FOUND',
  'ROVER_NOT_FOUND',
  'LOCATION_NOT_FOUND',
  'DELIVERY_NOT_FOUND',
  'SESSION_FINISHED',
  'ORDER_NOT_AVAILABLE',
  'ROVER_NOT_IDLE',
  'CAPACITY_EXCEEDED',
  'ROUTE_EXCEEDS_CAPACITY',
  'INSUFFICIENT_CHARGE',
  'DEADLINE_PASSED',
  'DUPLICATE_REQUEST',
  'OPERATION_LIMIT_REACHED',
  'DELIVERY_IN_PROGRESS',
  'CONFIRMATION_REQUIRED',
  'ACTION_NOT_ALLOWED',
  'INTERNAL_ERROR',
] as const

export type AppErrorCode = (typeof APP_ERROR_CODES)[number]

export type AppErrorBody = {
  readonly error: {
    readonly code: AppErrorCode
    readonly message: string
    readonly details: Record<string, unknown>
  }
}

const HTTP_STATUS_BY_CODE: Record<AppErrorCode, number> = {
  VALIDATION_ERROR: 400,
  GAME_NOT_FOUND: 404,
  ORDER_NOT_FOUND: 404,
  ROVER_NOT_FOUND: 404,
  LOCATION_NOT_FOUND: 404,
  DELIVERY_NOT_FOUND: 404,
  SESSION_FINISHED: 409,
  ORDER_NOT_AVAILABLE: 409,
  ROVER_NOT_IDLE: 409,
  CAPACITY_EXCEEDED: 422,
  ROUTE_EXCEEDS_CAPACITY: 422,
  INSUFFICIENT_CHARGE: 422,
  DEADLINE_PASSED: 409,
  DUPLICATE_REQUEST: 409,
  OPERATION_LIMIT_REACHED: 409,
  DELIVERY_IN_PROGRESS: 409,
  CONFIRMATION_REQUIRED: 409,
  ACTION_NOT_ALLOWED: 403,
  INTERNAL_ERROR: 500,
}

const MESSAGE_BY_CODE: Record<AppErrorCode, string> = {
  VALIDATION_ERROR: 'Некорректные данные запроса',
  GAME_NOT_FOUND: 'Активная игровая сессия не найдена',
  ORDER_NOT_FOUND: 'Заказ не найден',
  ROVER_NOT_FOUND: 'Ровер не найден',
  LOCATION_NOT_FOUND: 'Локация не найдена',
  DELIVERY_NOT_FOUND: 'Доставка не найдена',
  SESSION_FINISHED: BLOCK_REASON_MESSAGES.SESSION_FINISHED,
  ORDER_NOT_AVAILABLE: BLOCK_REASON_MESSAGES.ORDER_NOT_AVAILABLE,
  ROVER_NOT_IDLE: BLOCK_REASON_MESSAGES.ROVER_NOT_IDLE,
  CAPACITY_EXCEEDED: BLOCK_REASON_MESSAGES.CAPACITY_EXCEEDED,
  ROUTE_EXCEEDS_CAPACITY: BLOCK_REASON_MESSAGES.ROUTE_EXCEEDS_CAPACITY,
  INSUFFICIENT_CHARGE: BLOCK_REASON_MESSAGES.INSUFFICIENT_CHARGE,
  DEADLINE_PASSED: BLOCK_REASON_MESSAGES.DEADLINE_PASSED,
  DUPLICATE_REQUEST: BLOCK_REASON_MESSAGES.DUPLICATE_REQUEST,
  OPERATION_LIMIT_REACHED: BLOCK_REASON_MESSAGES.OPERATION_LIMIT_REACHED,
  DELIVERY_IN_PROGRESS: 'Нельзя завершить день, пока идёт доставка',
  CONFIRMATION_REQUIRED: 'Требуется подтверждение досрочного завершения дня',
  ACTION_NOT_ALLOWED: 'Действие запрещено в текущей конфигурации',
  INTERNAL_ERROR: 'Внутренняя ошибка сервера',
}

export class AppError extends Error {
  readonly code: AppErrorCode
  readonly httpStatus: number
  readonly details: Record<string, unknown>

  constructor(
    code: AppErrorCode,
    options: { message?: string; details?: Record<string, unknown> } = {},
  ) {
    const message = options.message ?? MESSAGE_BY_CODE[code]
    super(message)
    this.name = 'AppError'
    this.code = code
    this.httpStatus = HTTP_STATUS_BY_CODE[code]
    this.details = options.details ?? {}
  }

  toBody(): AppErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    }
  }

  static validation(details: Record<string, unknown>): AppError {
    return new AppError('VALIDATION_ERROR', { details })
  }

  /**
   * Converts the domain block reasons into a single public error. The first
   * reason defines the error code, the full list is exposed in `details` so the
   * UI can explain every blocker.
   */
  static fromBlockReasons(reasons: readonly DeliveryBlockReason[]): AppError {
    const [primary] = reasons
    const code: AppErrorCode = primary ?? 'ACTION_NOT_ALLOWED'

    return new AppError(code, {
      details: {
        reasons: reasons.map((reason) => ({
          code: reason,
          message: BLOCK_REASON_MESSAGES[reason],
        })),
      },
    })
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

/** Maps any thrown value to a safe HTTP status and response body. */
export function toErrorResponse(error: unknown): {
  status: number
  body: AppErrorBody
} {
  if (isAppError(error)) {
    return { status: error.httpStatus, body: error.toBody() }
  }

  const internal = new AppError('INTERNAL_ERROR')
  return { status: internal.httpStatus, body: internal.toBody() }
}
