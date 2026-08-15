/**
 * Thin typed fetch wrapper used by the client components.
 *
 * It only transports data: no game rules live here. Every error response is
 * converted into an `ApiError` carrying the server-provided code and message.
 */

import type {
  ActiveDeliveryDto,
  DeliveryPreviewDto,
  DeliveryResultDto,
  EndDayDto,
  GameStateDto,
  PurchaseUpgradeResultDto,
  SessionDto,
} from '@/application/dto'
import type { UpgradeType } from '@/domain'
import type { AppErrorBody } from '@/application/errors'

export class ApiError extends Error {
  readonly code: string
  readonly details: Record<string, unknown>

  constructor(code: string, message: string, details: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.details = details
  }
}

function isErrorBody(value: unknown): value is AppErrorBody {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { error?: { code?: unknown; message?: unknown } }
  return (
    typeof candidate.error === 'object' &&
    candidate.error !== null &&
    typeof candidate.error.code === 'string' &&
    typeof candidate.error.message === 'string'
  )
}

async function request<TResponse>(
  url: string,
  init?: RequestInit,
): Promise<TResponse> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  })

  const payload: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    if (isErrorBody(payload)) {
      throw new ApiError(
        payload.error.code,
        payload.error.message,
        payload.error.details,
      )
    }
    throw new ApiError(
      'INTERNAL_ERROR',
      'Сервер недоступен или ответил некорректно',
      {},
    )
  }

  return payload as TResponse
}

export function fetchGameState(): Promise<GameStateDto> {
  return request<GameStateDto>('/api/game')
}

export function fetchDeliveryPreview(input: {
  orderId: string
  roverId: string
}): Promise<DeliveryPreviewDto> {
  return request<DeliveryPreviewDto>('/api/deliveries/preview', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function startDeliveryRequest(input: {
  orderId: string
  roverId: string
  idempotencyKey: string
}): Promise<ActiveDeliveryDto> {
  return request<ActiveDeliveryDto>('/api/deliveries', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function completeDeliveryRequest(input: {
  deliveryId: string
}): Promise<DeliveryResultDto> {
  return request<DeliveryResultDto>('/api/deliveries/complete', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function endDayRequest(
  input: { confirmEarlyEnd?: boolean } = {},
): Promise<EndDayDto> {
  return request<EndDayDto>('/api/game/end-day', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function purchaseUpgradeRequest(input: {
  roverId: string
  upgradeType: UpgradeType
}): Promise<PurchaseUpgradeResultDto> {
  return request<PurchaseUpgradeResultDto>('/api/rovers/upgrade', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function resetGameRequest(): Promise<{ session: SessionDto }> {
  return request<{ session: SessionDto }>('/api/game/reset', {
    method: 'POST',
  })
}

export type ChargeRoverResult = {
  readonly roverId: string
  readonly roverName: string
  readonly mode: 'quick' | 'full'
  readonly chargeBefore: number
  readonly chargeAfter: number
  readonly capacity: number
  readonly unitsAdded: number
  readonly cost: number
}

export function chargeRoverRequest(input: {
  roverId: string
  mode: 'quick' | 'full'
}): Promise<ChargeRoverResult> {
  return request<ChargeRoverResult>('/api/rovers/charge', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
