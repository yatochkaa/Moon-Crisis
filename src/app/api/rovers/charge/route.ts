import { chargeRover } from '@/application/services/chargeRover'
import { chargeRoverInputSchema, parseInput } from '@/application/schemas'
import { getServiceDeps } from '@/infrastructure/container'
import { jsonError, jsonOk, readJsonBody } from '@/presentation/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/rovers/charge — buy energy for one rover.
 *
 * The body only carries { roverId, mode }; the units added, the exact price and
 * the balance check are all recalculated and charged server-side inside one
 * transaction, so a double submit can never pay twice.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonBody(request)
    const input = parseInput(chargeRoverInputSchema, body)
    const result = await chargeRover(getServiceDeps(), input)
    return jsonOk(result)
  } catch (error) {
    return jsonError(error)
  }
}
