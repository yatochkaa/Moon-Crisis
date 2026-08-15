import 'server-only'

/**
 * HTTP helpers for route handlers.
 *
 * Route handlers stay thin: read input -> validate with Zod -> call an
 * application service -> convert known errors into the unified error response.
 */

import { NextResponse } from 'next/server'
import { AppError, isAppError, toErrorResponse } from '@/application/errors'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const

/** Reads and parses a JSON body without leaking parser internals. */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw AppError.validation({ body: 'expected a JSON object' })
  }
}

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: NO_STORE_HEADERS })
}

/**
 * Converts any thrown value into the unified error response.
 * Unexpected errors are logged server-side and reported as INTERNAL_ERROR.
 */
export function jsonError(error: unknown): NextResponse {
  if (!isAppError(error)) {
    console.error('[api] unexpected error', error)
  }

  const { status, body } = toErrorResponse(error)
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS })
}
