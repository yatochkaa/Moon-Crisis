import { parseInput, startDeliveryInputSchema } from '@/application/schemas'
import { startDelivery } from '@/application/services/startDelivery'
import { getServiceDeps } from '@/infrastructure/container'
import { jsonError, jsonOk, readJsonBody } from '@/presentation/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/deliveries — starts a delivery inside one transaction.
 * The client only sends orderId, roverId and idempotencyKey.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonBody(request)
    const input = parseInput(startDeliveryInputSchema, body)
    const active = await startDelivery(getServiceDeps(), input)
    return jsonOk(active, 201)
  } catch (error) {
    return jsonError(error)
  }
}
