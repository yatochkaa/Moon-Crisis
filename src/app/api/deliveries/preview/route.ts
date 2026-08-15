import { parseInput, deliveryPreviewInputSchema } from '@/application/schemas'
import { previewDelivery } from '@/application/services/previewDelivery'
import { getServiceDeps } from '@/infrastructure/container'
import { jsonError, jsonOk, readJsonBody } from '@/presentation/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/deliveries/preview — informational estimate.
 * The final start endpoint recalculates everything again.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonBody(request)
    const input = parseInput(deliveryPreviewInputSchema, body)
    const preview = await previewDelivery(getServiceDeps(), input)
    return jsonOk(preview)
  } catch (error) {
    return jsonError(error)
  }
}
