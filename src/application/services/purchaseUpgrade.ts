/**
 * Use case: purchase a single rover upgrade.
 *
 * The whole operation is server-side and transactional (requirement 5): the
 * client only names the rover and the attribute; the server re-checks the day,
 * balance and level, charges the balance exactly once, raises only the chosen
 * level, records a GameEvent and returns the recomputed state. Because it runs
 * inside one transaction and re-reads the session, a single request can never
 * charge twice (requirement 6). earnedCredits is never touched (requirement 1).
 */

import { applyUpgrade, evaluateUpgrade, upgradeStatValue } from '@/domain'
import { AppError } from '../errors'
import type { PurchaseUpgradeResultDto } from '../dto'
import {
  UPGRADE_BLOCK_REASON_MESSAGES,
  UPGRADE_LABELS,
  UPGRADE_STAT_LABELS,
  UPGRADE_STAT_UNITS,
} from '@/shared/messages'
import type { ServiceDeps } from '../ports'
import type { PurchaseUpgradeInput } from '../schemas'
import { getGameState } from './getGameState'

const LEVEL_FIELD_BY_TYPE = {
  battery: 'batteryLevel',
  cargo: 'capacityLevel',
  efficiency: 'efficiencyLevel',
  safety: 'safetyLevel',
  speed: 'speedLevel',
} as const

export async function purchaseUpgrade(
  deps: ServiceDeps,
  input: PurchaseUpgradeInput,
): Promise<PurchaseUpgradeResultDto> {
  const summary = await deps.uow.transaction(async (repositories) => {
    const session = await repositories.findActiveSession()
    if (session === null) {
      throw new AppError('GAME_NOT_FOUND')
    }

    const rover = await repositories.findRoverById(input.roverId)
    if (rover === null) {
      throw new AppError('ROVER_NOT_FOUND')
    }

    const evaluation = evaluateUpgrade(session, rover, input.upgradeType)
    if (!evaluation.canPurchase || evaluation.cost === null) {
      // Upgrade block reasons are their own vocabulary (BAY_LOCKED, MAX_LEVEL,
      // ...), not delivery reasons, so we build the public error here. Every
      // blocker is exposed in `details` with its Russian message; the code stays
      // the generic ACTION_NOT_ALLOWED so no internals leak.
      throw new AppError('ACTION_NOT_ALLOWED', {
        details: {
          reasons: evaluation.reasons.map((reason) => ({
            code: reason,
            message: UPGRADE_BLOCK_REASON_MESSAGES[reason],
          })),
        },
      })
    }

    const cost = evaluation.cost
    const previousStatValue = upgradeStatValue(rover, input.upgradeType)
    const upgradedRover = applyUpgrade(rover, input.upgradeType)
    const newStatValue = upgradeStatValue(upgradedRover, input.upgradeType)

    // Raise only the chosen level; never touch any other attribute.
    const levelField = LEVEL_FIELD_BY_TYPE[input.upgradeType]
    await repositories.updateRover(rover.id, {
      [levelField]: upgradedRover[levelField],
    })

    // Charge the spendable balance once; earnedCredits stays untouched.
    await repositories.updateSession(session.id, {
      balanceCredits: session.balanceCredits - cost,
    })

    const label = UPGRADE_LABELS[input.upgradeType]
    const statLabel = UPGRADE_STAT_LABELS[input.upgradeType]
    const statUnit = UPGRADE_STAT_UNITS[input.upgradeType]
    const unitSuffix = statUnit === '' ? '' : ` ${statUnit}`

    await repositories.createEvent({
      id: deps.ids.next(),
      gameSessionId: session.id,
      type: 'rover_upgraded',
      title: `${label} ${rover.name} улучшена`,
      description: `${statLabel}: ${previousStatValue} → ${newStatValue}${unitSuffix}. Списано: ${cost} кредитов.`,
      metadata: {
        roverId: rover.id,
        upgradeType: input.upgradeType,
        fromLevel: evaluation.currentLevel,
        toLevel: evaluation.nextLevel,
        cost,
      },
      day: session.currentDay,
    })

    return {
      roverId: rover.id,
      roverName: rover.name,
      upgradeType: input.upgradeType,
      upgradeLabel: label,
      fromLevel: evaluation.currentLevel,
      toLevel: evaluation.nextLevel,
      cost,
      statLabel,
      statUnit,
      previousStatValue,
      newStatValue,
    }
  })

  // Recompute the full state outside the write so challenge availability and
  // every rover's upgrade panel reflect the purchase (requirement 8).
  const state = await getGameState(deps)

  return { ...summary, state }
}
