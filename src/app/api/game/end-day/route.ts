import { endDay } from '@/application/services/endDay'
import { endDayInputSchema, parseInput } from '@/application/schemas'
import { getServiceDeps } from '@/infrastructure/container'
import { jsonError, jsonOk } from '@/presentation/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/game/end-day — advances the day, expires orders, recharges rovers
 * and generates the next day's orders. The optional `confirmEarlyEnd` flag
 * acknowledges the rating penalty for ending the day early.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json().catch(() => ({}))
    const input = parseInput(endDayInputSchema, body ?? {})
    const result = await endDay(getServiceDeps(), input)
    return jsonOk(result)
  } catch (error) {
    return jsonError(error)
  }
}
