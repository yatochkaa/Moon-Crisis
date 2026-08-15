import { getGameState } from '@/application/services/getGameState'
import { getServiceDeps } from '@/infrastructure/container'
import { jsonError, jsonOk } from '@/presentation/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/game — current game state (session, orders, rovers, locations, events). */
export async function GET(): Promise<Response> {
  try {
    const state = await getGameState(getServiceDeps())
    return jsonOk(state)
  } catch (error) {
    return jsonError(error)
  }
}
