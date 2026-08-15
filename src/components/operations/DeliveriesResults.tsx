'use client'

/**
 * «Активные доставки» + «Последние результаты» row, ported from the v0 reference.
 *
 * The countdown is derived from the server `startedAt`/`completesAt` of every
 * active delivery and the shared client clock, so a refresh resumes the same
 * countdown. Results are the real `DeliveryResultDto` values.
 */

import type { ActiveDeliveryDto, DeliveryResultDto } from '@/application/dto'
import {
  CheckIcon,
  CrossIcon,
  NavigationIcon,
  TruckIcon,
} from '@/components/ui/icons'

type Props = {
  activeDeliveries: readonly ActiveDeliveryDto[]
  results: readonly DeliveryResultDto[]
  roverNameById: ReadonlyMap<string, string>
  orderTitleById: ReadonlyMap<string, string>
  locationNameById: ReadonlyMap<string, string>
  /** Shared client clock in ms. */
  now: number
}

function progressOf(delivery: ActiveDeliveryDto, now: number): number {
  const started = Date.parse(delivery.startedAt)
  const completes = Date.parse(delivery.completesAt)
  const total = Math.max(completes - started, 1)
  const elapsed = Math.min(Math.max(now - started, 0), total)
  return elapsed / total
}

function formatCountdown(delivery: ActiveDeliveryDto, now: number): string {
  const seconds = Math.max(
    0,
    Math.ceil((Date.parse(delivery.completesAt) - now) / 1000),
  )
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export function DeliveriesResults({
  activeDeliveries,
  results,
  roverNameById,
  orderTitleById,
  locationNameById,
  now,
}: Props): React.JSX.Element {
  const latest = results.slice(-3).reverse()

  return (
    <div className="flex h-full gap-3">
      {/* Active deliveries */}
      <section
        aria-label="Активные доставки"
        data-testid="active-delivery"
        className="flex flex-1 flex-col overflow-y-auto rounded-lg border border-border bg-panel p-3"
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Активные доставки</h2>
          <span className="rounded bg-route/15 px-1.5 py-0.5 font-mono text-xs font-medium text-route">
            {activeDeliveries.length}
          </span>
        </div>

        {activeDeliveries.length === 0 ? (
          <p className="text-xs text-muted-foreground">Сейчас доставок в пути нет.</p>
        ) : (
          <div className="space-y-2">
            {activeDeliveries.map((delivery) => {
              const outbound = progressOf(delivery, now) < 0.5
              const roverName =
                roverNameById.get(delivery.roverId) ?? delivery.roverId
              const targetName = outbound
                ? (locationNameById.get(delivery.locationId) ??
                  orderTitleById.get(delivery.orderId) ??
                  delivery.locationId)
                : 'База'

              return (
                <article
                  key={delivery.deliveryId}
                  data-testid={`active-delivery-${delivery.roverId}`}
                  className="flex items-center gap-2.5 rounded-md border border-border bg-card px-3 py-2"
                >
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded ${
                      outbound
                        ? 'bg-primary/15 text-primary'
                        : 'bg-route/15 text-route'
                    }`}
                  >
                    {outbound ? <NavigationIcon size={14} /> : <TruckIcon size={14} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {roverName} → {targetName}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {orderTitleById.get(delivery.orderId) ?? delivery.orderId} ·{' '}
                      {outbound ? 'летит к станции' : 'возвращается на базу'}
                    </div>
                  </div>
                  <span
                    data-testid="delivery-countdown"
                    className="font-mono text-sm font-semibold tabular-nums text-foreground/90"
                  >
                    {formatCountdown(delivery, now)}
                  </span>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {/* Recent results */}
      <section
        aria-label="Последние результаты"
        data-testid="recent-results"
        className="flex flex-1 flex-col overflow-y-auto rounded-lg border border-border bg-panel p-3"
      >
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Последние результаты
        </h2>

        {latest.length === 0 ? (
          <p className="text-xs text-muted-foreground">Результатов пока нет.</p>
        ) : (
          <div className="space-y-2">
            {latest.map((result) => {
              const success = result.result === 'success'
              // A capped success must never be shown as a bare +0.
              const capped =
                success && result.ratingDelta === 0 && result.ratingReward > 0
              const ratingText = capped
                ? `бонус +${result.ratingReward}, рейтинг остался 100 — максимум`
                : `${result.ratingDelta >= 0 ? '+' : ''}${result.ratingDelta}`

              return (
                <details
                  key={result.deliveryId}
                  data-testid={`delivery-result-${result.deliveryId}`}
                  className={[
                    'rounded-md border px-3 py-2',
                    success
                      ? 'border-success/30 bg-success/5'
                      : 'border-danger/30 bg-danger/5',
                  ].join(' ')}
                >
                  <summary className="flex cursor-pointer items-center gap-2.5">
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded-full ${
                        success
                          ? 'bg-success/15 text-success'
                          : 'bg-danger/15 text-danger'
                      }`}
                    >
                      {success ? <CheckIcon /> : <CrossIcon />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">
                        {result.roverName} · {result.orderTitle} ·{' '}
                        <span data-testid="delivery-result-status">
                          {success ? 'успех' : 'провал'}
                        </span>
                      </div>
                      <div className="text-xs">
                        {success ? (
                          <span className="text-success">
                            +{result.creditsAwarded} кредитов
                          </span>
                        ) : (
                          <span className="text-muted-foreground">без оплаты</span>
                        )}
                        <span className="text-muted-foreground"> · рейтинг </span>
                        <span
                          className={
                            capped
                              ? 'text-contract'
                              : success
                                ? 'text-success'
                                : 'text-danger'
                          }
                        >
                          {ratingText}
                        </span>
                      </div>
                    </div>
                  </summary>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    риск {result.risk}% · награда {result.reward} кр. · баланс{' '}
                    {result.previousBalance} → {result.newBalance} кр.
                  </p>
                </details>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
