import { purchaseUpgrade } from '@/application/services/purchaseUpgrade'
import { parseInput, purchaseUpgradeInputSchema } from '@/application/schemas'
import { getServiceDeps } from '@/infrastructure/container'
import { jsonError, jsonOk, readJsonBody } from '@/presentation/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/rovers/upgrade — purchase a single rover upgrade.
 *
 * The body only carries { roverId, upgradeType }; the day, balance, level and
 * cost are all re-checked and charged server-side inside one transaction.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonBody(request)
    const input = parseInput(purchaseUpgradeInputSchema, body)
    const result = await purchaseUpgrade(getServiceDeps(), input)
    return jsonOk(result)
  } catch (error) {
    return jsonError(error)
  }
}
