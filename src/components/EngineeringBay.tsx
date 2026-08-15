'use client'

/**
 * Engineering bay: presentation only.
 *
 * Renders one card per rover with its five upgrades (current -> next values,
 * level x/2 or MAX, next cost, disabled reason) and asks the server to buy the
 * selected upgrade. All rules (day, balance, level, rover status) are enforced
 * server-side; this component only reflects the DTO and confirms the purchase.
 */

import { useState } from 'react'
import type { PurchaseUpgradeResultDto, RoverDto } from '@/application/dto'
import type { UpgradeType } from '@/domain'

type Props = {
  rovers: readonly RoverDto[]
  currentDay: number
  unlockDay: number
  balanceCredits: number
  earnedCredits: number
  busy: boolean
  lastPurchase: PurchaseUpgradeResultDto | null
  recentPurchases: readonly PurchaseUpgradeResultDto[]
  onPurchase: (roverId: string, upgradeType: UpgradeType) => void
  onDismissPurchase: () => void
}

/** Trims noisy trailing zeros so 1.2544 -> 1.25 and 30 -> 30. */
function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

function withUnit(value: number, unit: string): string {
  const text = formatValue(value)
  return unit === '' ? text : `${text} ${unit}`
}

function levelLabel(currentLevel: number, maxLevel: number): string {
  return currentLevel >= maxLevel ? 'MAX' : `${currentLevel}/${maxLevel}`
}

export function EngineeringBay({
  rovers,
  currentDay,
  unlockDay,
  balanceCredits,
  earnedCredits,
  busy,
  lastPurchase,
  recentPurchases,
  onPurchase,
  onDismissPurchase,
}: Props): React.JSX.Element {
  const [confirming, setConfirming] = useState<{
    roverId: string
    type: UpgradeType
  } | null>(null)

  const locked = currentDay < unlockDay

  if (locked) {
    return (
      <section
        aria-label="Инженерный отсек"
        data-testid="engineering-bay-locked"
        className="rounded border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300"
      >
        <h2 className="mb-2 font-semibold text-slate-100">Инженерный отсек</h2>
        <p>Инженерный отсек откроется на втором дне.</p>
      </section>
    )
  }

  return (
    <section
      aria-label="Инженерный отсек"
      data-testid="engineering-bay"
      className="flex flex-col gap-4"
    >
      <div
        data-testid="engineering-summary"
        className="flex flex-wrap gap-6 rounded border border-slate-700 bg-slate-900 p-3 text-sm"
      >
        <span>
          Баланс:{' '}
          <span className="font-semibold" data-testid="engineering-balance">
            {balanceCredits}
          </span>{' '}
          кр.
        </span>
        <span>
          Заработано:{' '}
          <span className="font-semibold" data-testid="engineering-earned">
            {earnedCredits}
          </span>{' '}
          кр.
        </span>
      </div>

      {lastPurchase !== null ? (
        <div
          role="status"
          data-testid="upgrade-notification"
          className="flex flex-col gap-1 rounded border border-emerald-400 bg-emerald-950 p-3 text-sm"
        >
          <p className="font-semibold">
            {lastPurchase.upgradeLabel} {lastPurchase.roverName} улучшена
          </p>
          <p>
            {lastPurchase.statLabel}:{' '}
            {formatValue(lastPurchase.previousStatValue)} →{' '}
            {withUnit(lastPurchase.newStatValue, lastPurchase.statUnit)}
          </p>
          <p>Списано: {lastPurchase.cost} кредитов</p>
          <button
            type="button"
            onClick={onDismissPurchase}
            className="self-start text-slate-300 underline"
          >
            Скрыть
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {rovers.map((rover) => (
          <div
            key={rover.id}
            data-testid={`engineering-rover-${rover.id}`}
            className="flex flex-col gap-3 rounded border border-slate-700 bg-slate-900 p-3"
          >
            <h3 className="font-semibold">{rover.name}</h3>
            <ul className="flex flex-col gap-3">
              {rover.upgrades.map((upgrade) => {
                const isConfirming =
                  confirming?.roverId === rover.id &&
                  confirming.type === upgrade.type
                const maxed = upgrade.currentLevel >= upgrade.maxLevel
                const blockReason = upgrade.reasons[0]?.message ?? null

                return (
                  <li
                    key={upgrade.type}
                    data-testid={`upgrade-${rover.id}-${upgrade.type}`}
                    className="flex flex-col gap-1 border-t border-slate-800 pt-2 first:border-t-0 first:pt-0"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{upgrade.label}</span>
                      <span
                        data-testid={`upgrade-level-${rover.id}-${upgrade.type}`}
                        className="text-slate-300"
                      >
                        {levelLabel(upgrade.currentLevel, upgrade.maxLevel)}
                      </span>
                    </div>
                    <span className="text-slate-300">
                      {upgrade.statLabel}:{' '}
                      {withUnit(upgrade.currentValue, upgrade.unit)}
                      {upgrade.nextValue !== null ? (
                        <> → {withUnit(upgrade.nextValue, upgrade.unit)}</>
                      ) : null}
                    </span>
                    {maxed ? (
                      <span className="text-emerald-300">Максимальный уровень</span>
                    ) : (
                      <span className="text-slate-400">
                        Следующий уровень: {upgrade.nextCost} кредитов
                      </span>
                    )}

                    {!maxed && isConfirming ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          data-testid={`upgrade-confirm-${rover.id}-${upgrade.type}`}
                          disabled={busy || !upgrade.canPurchase}
                          onClick={() => {
                            onPurchase(rover.id, upgrade.type)
                            setConfirming(null)
                          }}
                          className="rounded border border-emerald-400 bg-emerald-900 px-3 py-1 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Подтвердить покупку
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(null)}
                          className="rounded border border-slate-500 px-3 py-1 text-sm"
                        >
                          Отмена
                        </button>
                      </div>
                    ) : !maxed ? (
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          data-testid={`upgrade-buy-${rover.id}-${upgrade.type}`}
                          disabled={busy || !upgrade.canPurchase}
                          onClick={() =>
                            setConfirming({ roverId: rover.id, type: upgrade.type })
                          }
                          className="self-start rounded border border-sky-400 bg-sky-950 px-3 py-1 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Улучшить
                        </button>
                        {!upgrade.canPurchase && blockReason !== null ? (
                          <span
                            data-testid={`upgrade-reason-${rover.id}-${upgrade.type}`}
                            className="text-amber-300"
                          >
                            {blockReason}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      {recentPurchases.length > 0 ? (
        <div
          data-testid="recent-purchases"
          className="rounded border border-slate-700 bg-slate-900 p-3 text-sm"
        >
          <h3 className="mb-1 font-semibold">Последние покупки</h3>
          <ul className="flex flex-col gap-1">
            {recentPurchases.map((purchase, index) => (
              <li
                key={`${purchase.roverId}-${purchase.upgradeType}-${index}`}
                className="text-slate-300"
              >
                {purchase.upgradeLabel} {purchase.roverName} — списано{' '}
                {purchase.cost} кр.
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
