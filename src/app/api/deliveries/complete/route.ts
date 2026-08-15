import { completeDeliveryInputSchema, parseInput } from '@/application/schemas'
import { completeDelivery } from '@/application/services/completeDelivery'
import { getServiceDeps } from '@/infrastructure/container'
import { jsonError, jsonOk, readJsonBody } from '@/presentation/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/deliveries/complete — resolves an in-transit delivery exactly once.
 * Idempotent: replays return the stored result without paying again.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonBody(request)
    const input = parseInput(completeDeliveryInputSchema, body)
    const result = await completeDelivery(getServiceDeps(), input)
    return jsonOk(result, result.replayed ? 200 : 201)
  } catch (error) {
    return jsonError(error)
  }
}
