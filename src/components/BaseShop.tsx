'use client'

/**
 * Магазин базы (переименован из "Инженерный отсек").
 *
 * Новая компоновка по образцу Операций:
 * - слева: вертикальный выбор ровера (как FleetPanel)
 * - в центре: улучшения выбранного ровера сеткой 2 колонки
 * - справа: операции зарядки и сравнение характеристик
 */

import { useState } from 'react'
import type { PurchaseUpgradeResultDto, RoverDto } from '@/application/dto'
import type { UpgradeType } from '@/domain'
import type { ChargeRoverResult } from '@/presentation/apiClient'
import {
  BatteryIcon,
  CheckIcon,
  CoinsIcon,
  PackageIcon,
  RocketIcon,
  ShoppingCartIcon,
} from '@/components/ui/icons'

type Props = {
  rovers: readonly RoverDto[]
  currentDay: number
  unlockDay: number
  balanceCredits: number
  earnedCredits: number
  busy: boolean
  lastPurchase: PurchaseUpgradeResultDto | null
  recentPurchases: readonly PurchaseUpgradeResultDto[]
  lastCharge: ChargeRoverResult | null
  onPurchase: (roverId: string, upgradeType: UpgradeType) => void
  onDismissPurchase: () => void
  onCharge: (roverId: string, mode: 'quick' | 'full') => void
  onDismissCharge: () => void
}

function levelLabel(currentLevel: number, maxLevel: number): string {
  return currentLevel >= maxLevel ? 'MAX' : `Уровень ${currentLevel} из ${maxLevel}`
}

export function BaseShop({
  rovers,
  currentDay,
  unlockDay,
  balanceCredits,
  earnedCredits,
  busy,
  lastPurchase,
  recentPurchases,
  lastCharge,
  onPurchase,
  onDismissPurchase,
  onCharge,
  onDismissCharge,
}: Props): React.JSX.Element {
  const [selectedRoverId, setSelectedRoverId] = useState<string | null>(
    rovers[0]?.id ?? null,
  )
  const [confirmingUpgrade, setConfirmingUpgrade] = useState<{
    roverId: string
    type: UpgradeType
  } | null>(null)
  const [confirmingCharge, setConfirmingCharge] = useState<{
    roverId: string
    mode: 'quick' | 'full'
  } | null>(null)

  const locked = currentDay < unlockDay
  const selectedRover = rovers.find((r) => r.id === selectedRoverId) ?? null

  if (locked) {
    return (
      <section
        aria-label="Магазин базы"
        data-testid="engineering-bay-locked"
        className="flex h-full items-center justify-center rounded-lg border border-border bg-panel p-6 text-sm text-muted-foreground"
      >
        <div className="text-center">
          <ShoppingCartIcon size={32} className="mx-auto mb-3 text-muted-foreground" />
          <p>Магазин базы откроется на втором дне.</p>
        </div>
      </section>
    )
  }

  return (
    <section aria-label="Магазин базы" data-testid="engineering-bay" className="flex h-full gap-3 overflow-hidden">
      {/* Левая панель: выбор ровера */}
      <aside className="w-[280px] shrink-0 space-y-2">
        <h2 className="px-1 text-sm font-semibold text-foreground">Выбор ровера</h2>
        {rovers.map((rover) => {
          const isSelected = rover.id === selectedRoverId
          const pct = rover.chargePercent
          const low = pct < 40

          return (
            <button
              key={rover.id}
              type="button"
              data-testid={`shop-rover-${rover.id}`}
              aria-pressed={isSelected}
              onClick={() => setSelectedRoverId(rover.id)}
              className={[
                'block w-full rounded-md border px-3 py-2.5 text-left transition-colors',
                isSelected
                  ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/30'
                  : 'border-border bg-card hover:border-primary/30',
              ].join(' ')}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RocketIcon className="text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">{rover.name}</h3>
                </div>
              </div>

              <div className="mt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <BatteryIcon size={14} /> Заряд
                  </span>
                  <span className="font-mono text-foreground/90">
                    {rover.batteryCharge} / {rover.stats.batteryCapacity} · {pct}%
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full rounded-full ${low ? 'bg-danger' : 'bg-success'}`}
                    style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                  />
                </div>
              </div>

              <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <PackageIcon size={14} /> Грузоподъёмность
                </span>
                <span className="font-mono text-foreground/90">{rover.stats.capacity} кг</span>
              </div>
            </button>
          )
        })}
      </aside>

      {/* Центр: улучшения выбранного ровера */}
      <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto">
        {/* Шапка с балансом и уведомлениями */}
        <div className="shrink-0 space-y-2">
          <div className="flex flex-wrap gap-4 rounded-lg border border-border bg-card px-3 py-2 text-sm">
            <span className="flex items-center gap-2">
              <CoinsIcon size={16} className="text-primary" />
              <span className="text-muted-foreground">Баланс:</span>
              <span className="font-mono font-semibold text-foreground" data-testid="engineering-balance">
                {balanceCredits} кр.
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span className="text-muted-foreground">Заработано:</span>
              <span className="font-mono font-semibold text-success" data-testid="engineering-earned">
                {earnedCredits} кр.
              </span>
            </span>
          </div>

          {lastPurchase !== null ? (
            <div
              role="status"
              data-testid="upgrade-notification"
              className="flex items-center justify-between gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <CheckIcon className="text-success" />
                <span className="text-foreground">
                  {lastPurchase.upgradeLabel} {lastPurchase.roverName} улучшена • Списано: {lastPurchase.cost} кр.
                </span>
              </div>
              <button
                type="button"
                onClick={onDismissPurchase}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
          ) : null}

          {lastCharge !== null ? (
            <div
              role="status"
              data-testid="charge-notification"
              className="flex items-center justify-between gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <BatteryIcon className="text-success" />
                <span className="text-foreground">
                  {lastCharge.roverName} заряжен: {lastCharge.chargeBefore} → {lastCharge.chargeAfter} ед. • Списано: {lastCharge.cost} кр.
                </span>
              </div>
              <button
                type="button"
                onClick={onDismissCharge}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
          ) : null}
        </div>

        {!selectedRover ? (
          <p className="text-sm text-muted-foreground">Выберите ровер для просмотра улучшений.</p>
        ) : (
          <>
            <h3 className="text-base font-semibold text-foreground">
              Улучшения: {selectedRover.name}
            </h3>

            <div className="grid grid-cols-2 gap-3">
              {selectedRover.upgrades.map((upgrade) => {
                const isConfirming =
                  confirmingUpgrade?.roverId === selectedRover.id &&
                  confirmingUpgrade.type === upgrade.type
                const maxed = upgrade.currentLevel >= upgrade.maxLevel
                const blockReason = upgrade.reasons[0]?.message ?? null

                return (
                  <div
                    key={upgrade.type}
                    data-testid={`upgrade-${selectedRover.id}-${upgrade.type}`}
                    className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-foreground">{upgrade.label}</h4>
                        <p className="text-xs text-muted-foreground">{levelLabel(upgrade.currentLevel, upgrade.maxLevel)}</p>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground">{upgrade.description}</p>
                    <p className="text-xs text-muted-foreground italic">{upgrade.benefit}</p>

                    {upgrade.changeSummary !== null ? (
                      <p className="font-mono text-xs text-foreground">{upgrade.changeSummary}</p>
                    ) : null}

                    {upgrade.effectSummary !== null ? (
                      <p className="font-mono text-xs text-primary">{upgrade.effectSummary}</p>
                    ) : null}

                    {upgrade.exampleSummary !== null ? (
                      <p className="font-mono text-xs text-muted-foreground">{upgrade.exampleSummary}</p>
                    ) : null}

                    {upgrade.unlocksOrderTitle !== null ? (
                      <p className="text-xs text-contract">
                        Откроет: «{upgrade.unlocksOrderTitle}»
                      </p>
                    ) : null}

                    {maxed ? (
                      <span className="text-xs font-medium text-success">Максимальный уровень</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Цена: {upgrade.nextCost} кредитов</span>
                    )}

                    {!maxed && isConfirming ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          data-testid={`upgrade-confirm-${selectedRover.id}-${upgrade.type}`}
                          disabled={busy || !upgrade.canPurchase}
                          onClick={() => {
                            onPurchase(selectedRover.id, upgrade.type)
                            setConfirmingUpgrade(null)
                          }}
                          className="flex-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Подтвердить
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingUpgrade(null)}
                          className="rounded-md border border-border px-3 py-1.5 text-xs"
                        >
                          Отмена
                        </button>
                      </div>
                    ) : !maxed ? (
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          data-testid={`upgrade-buy-${selectedRover.id}-${upgrade.type}`}
                          disabled={busy || !upgrade.canPurchase}
                          onClick={() =>
                            setConfirmingUpgrade({ roverId: selectedRover.id, type: upgrade.type })
                          }
                          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Улучшить
                        </button>
                        {!upgrade.canPurchase && blockReason !== null ? (
                          <span
                            data-testid={`upgrade-reason-${selectedRover.id}-${upgrade.type}`}
                            className="text-xs text-danger"
                          >
                            {blockReason}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Справа: зарядка и характеристики */}
      <aside className="w-[300px] shrink-0 space-y-3 overflow-y-auto">
        {selectedRover !== null ? (
          <>
            <div className="rounded-lg border border-border bg-panel p-3">
              <h3 className="mb-2 text-sm font-semibold text-foreground">Обслуживание ровера</h3>

              <div className="mb-3 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Заряд</span>
                <span className="font-mono text-foreground">
                  {selectedRover.batteryCharge} / {selectedRover.stats.batteryCapacity} ед. — {selectedRover.chargePercent}%
                </span>
              </div>

              <div className="space-y-2">
                {selectedRover.chargeOffers.map((offer) => {
                  const isConfirming =
                    confirmingCharge?.roverId === selectedRover.id &&
                    confirmingCharge.mode === offer.mode
                  const blockReason = offer.reasons[0]?.message ?? null

                  return (
                    <div
                      key={offer.mode}
                      className="rounded-md border border-border bg-card p-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">{offer.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {offer.cost} кр.
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{offer.description}</p>

                      {offer.unitsAdded > 0 ? (
                        <p className="mt-1 font-mono text-xs text-foreground">
                          {offer.chargeBefore} → {offer.chargeAfter} ед.
                        </p>
                      ) : null}

                      {isConfirming ? (
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            disabled={busy || !offer.canCharge}
                            onClick={() => {
                              onCharge(selectedRover.id, offer.mode)
                              setConfirmingCharge(null)
                            }}
                            className="flex-1 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Подтвердить
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmingCharge(null)}
                            className="rounded-md border border-border px-2 py-1 text-xs"
                          >
                            Отмена
                          </button>
                        </div>
                      ) : (
                        <div className="mt-2 flex flex-col gap-1">
                          <button
                            type="button"
                            disabled={busy || !offer.canCharge}
                            onClick={() =>
                              setConfirmingCharge({ roverId: selectedRover.id, mode: offer.mode })
                            }
                            className="w-full rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Зарядить
                          </button>
                          {!offer.canCharge && blockReason !== null ? (
                            <span className="text-xs text-danger">{blockReason}</span>
                          ) : null}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-panel p-3">
              <h3 className="mb-2 text-sm font-semibold text-foreground">Характеристики</h3>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ёмкость батареи</span>
                  <span className="font-mono text-foreground">{selectedRover.stats.batteryCapacity} ед.</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Грузоподъёмность</span>
                  <span className="font-mono text-foreground">{selectedRover.stats.capacity} кг</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Скорость</span>
                  <span className="font-mono text-foreground">{selectedRover.speed} км/ч</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Эффективность</span>
                  <span className="font-mono text-foreground">{selectedRover.stats.efficiency.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Снижение риска</span>
                  <span className="font-mono text-foreground">{selectedRover.stats.safetyRiskReduction} п.п.</span>
                </div>
              </div>
            </div>

            {recentPurchases.length > 0 ? (
              <div className="rounded-lg border border-border bg-panel p-3">
                <h3 className="mb-2 text-sm font-semibold text-foreground">Последние покупки</h3>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {recentPurchases.map((purchase, index) => (
                    <li key={`${purchase.roverId}-${purchase.upgradeType}-${index}`}>
                      {purchase.upgradeLabel} {purchase.roverName} — {purchase.cost} кр.
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : null}
      </aside>
    </section>
  )
}
