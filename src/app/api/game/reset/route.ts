import { resetGame } from '@/application/services/resetGame'
import { getServiceDeps, isGameResetAllowed } from '@/infrastructure/container'
import { jsonError, jsonOk } from '@/presentation/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/game/reset — recreates the deterministic demo session.
 *
 * LIMITATION: destructive and unauthenticated. Allowed only outside production
 * or when ALLOW_GAME_RESET="true". Documented in docs/security.md.
 */
export async function POST(): Promise<Response> {
  try {
    const session = await resetGame(getServiceDeps(), {
      allowed: isGameResetAllowed(),
    })
    return jsonOk({ session })
  } catch (error) {
    return jsonError(error)
  }
}
