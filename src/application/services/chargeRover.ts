/**
 * Use case: charge a rover (quick or full).
 *
 * The whole operation is server-side and transactional: the client only names
 * the rover and the charge mode; the server re-checks the balance, the rover
 * status and the battery level, charges the balance exactly once based on the
 * actual units added, updates the rover charge, records a GameEvent and returns
 * the recomputed state. Because it runs inside one transaction and re-reads the
 * session, a single request can never charge twice.
 */

import { evaluateCharge, type ChargeMode } from '@/domain/charging'
import {
  CHARGE_BLOCK_REASON_MESSAGES,
  CHARGE_MODE_LABELS,
} from '@/shared/messages'
import { AppError } from '../errors'
import type { ServiceDeps } from '../ports'

export type ChargeRoverInput = {
  readonly roverId: string
  readonly mode: ChargeMode
}

export type ChargeRoverResult = {
  readonly roverId: string
  readonly roverName: string
  readonly mode: ChargeMode
  readonly chargeBefore: number
  readonly chargeAfter: number
  readonly capacity: number
  readonly unitsAdded: number
  readonly cost: number
}

export async function chargeRover(
  deps: ServiceDeps,
  input: ChargeRoverInput,
): Promise<ChargeRoverResult> {
  const summary = await deps.uow.transaction(async (repositories) => {
    const session = await repositories.findActiveSession()
    if (session === null) {
      throw new AppError('GAME_NOT_FOUND')
    }

    const rover = await repositories.findRoverById(input.roverId)
    if (rover === null) {
      throw new AppError('ROVER_NOT_FOUND')
    }

    const evaluation = evaluateCharge(session, rover, input.mode)
    if (!evaluation.canCharge) {
      // Charge block reasons are their own vocabulary (ROVER_BUSY, BATTERY_FULL,
      // ...), not delivery reasons, so we build the public error here. The code
      // stays the generic ACTION_NOT_ALLOWED so no internals leak; every blocker
      // is exposed in `details` with its shared Russian message.
      throw new AppError('ACTION_NOT_ALLOWED', {
        details: {
          reasons: evaluation.reasons.map((reason) => ({
            code: reason,
            message: CHARGE_BLOCK_REASON_MESSAGES[reason],
          })),
        },
      })
    }

    const { cost, unitsAdded, chargeAfter } = evaluation

    // Update the rover battery once.
    await repositories.updateRover(rover.id, {
      batteryCharge: chargeAfter,
    })

    // Charge the spendable balance once.
    await repositories.updateSession(session.id, {
      balanceCredits: session.balanceCredits - cost,
    })

    // The event type vocabulary is unchanged on purpose (no schema migration):
    // a charge is a shop operation, so it reuses `rover_upgraded` and is
    // distinguished by its title and its metadata.mode.
    await repositories.createEvent({
      id: deps.ids.next(),
      gameSessionId: session.id,
      type: 'rover_upgraded',
      title: `${CHARGE_MODE_LABELS[input.mode]} ${rover.name}`,
      description: `Энергия: ${evaluation.chargeBefore} → ${chargeAfter} ед. Списано: ${cost} кредитов.`,
      metadata: {
        roverId: rover.id,
        mode: input.mode,
        unitsAdded,
        cost,
      },
      day: session.currentDay,
    })

    return {
      roverId: rover.id,
      roverName: rover.name,
      mode: input.mode,
      chargeBefore: evaluation.chargeBefore,
      chargeAfter,
      capacity: evaluation.capacity,
      unitsAdded,
      cost,
    }
  })

  return summary
}
