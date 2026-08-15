'use client'

/**
 * «Центр активности» — a single right-column panel that replaces the old bottom
 * dock. Three tabs share one frame:
 *
 *   • «В пути»    — active deliveries (rover, direction, destination, timer)
 *   • «Результаты» — up to 10 latest results (success/failed, reward, ratingDelta)
 *   • «Журнал»    — the existing GameEvent log
 *
 * Presentation only. Every value comes from the server DTOs. The e2e
 * `data-testid` hooks that used to live in the dock (`active-delivery`,
 * `active-delivery-<roverId>`, `delivery-countdown`, `recent-results`,
 * `delivery-result-<id>`, `delivery-result-status`, `event-log`) are preserved
 * here on the matching tab content.
 */

import { useState } from 'react'
import type {
  ActiveDeliveryDto,
  DeliveryResultDto,
  GameEventDto,
} from '@/application/dto'
import {
  CheckIcon,
  CrossIcon,
  NavigationIcon,
  TruckIcon,
} from '@/components/ui/icons'

type Tab = 'transit' | 'results' | 'journal'

type Props = {
  activeDeliveries: readonly ActiveDeliveryDto[]
  results: readonly DeliveryResultDto[]
  events: readonly GameEventDto[]
  roverNameById: ReadonlyMap<string, string>
  orderTitleById: ReadonlyMap<string, string>
  locationNameById: ReadonlyMap<string, string>
  /** Shared client clock in ms. */
  now: number
  /** When provided, renders a close button (used by the floating popup). */
  onClose?: () => void
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

export function ActivityCenter({
  activeDeliveries,
  results,
  events,
  roverNameById,
  orderTitleById,
  locationNameById,
  now,
  onClose,
}: Props): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('transit')
  const latestResults = results.slice(-10).reverse()

  const tabs: ReadonlyArray<{ id: Tab; label: string; count: number | null }> = [
    { id: 'transit', label: 'В пути', count: activeDeliveries.length },
    { id: 'results', label: 'Результаты', count: results.length },
    { id: 'journal', label: 'Журнал', count: null },
  ]

  return (
    <section
      aria-label="Центр активности"
      className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-panel"
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold text-foreground">Центр активности</h2>
        {onClose ? (
          <button
            type="button"
            aria-label="Закрыть центр активности"
            data-testid="activity-close"
            onClick={onClose}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <CrossIcon size={14} />
          </button>
        ) : null}
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Разделы центра активности"
        className="flex gap-1 border-b border-border px-2 pt-2"
      >
        {tabs.map((entry) => {
          const isActive = tab === entry.id
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={`activity-tab-${entry.id}`}
              onClick={() => setTab(entry.id)}
              className={[
                'flex items-center gap-1.5 rounded-t-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                isActive
                  ? 'bg-card text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {entry.label}
              {entry.count !== null ? (
                <span
                  className={[
                    'rounded px-1 py-0.5 font-mono text-[10px]',
                    isActive ? 'bg-route/15 text-route' : 'bg-border/60 text-muted-foreground',
                  ].join(' ')}
                >
                  {entry.count}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      {/* ===== В пути ===== */}
      {tab === 'transit' ? (
        <div
          role="tabpanel"
          aria-label="Активные доставки"
          data-testid="active-delivery"
          className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3"
        >
          {activeDeliveries.length === 0 ? (
            <p className="text-xs text-muted-foreground">Сейчас доставок в пути нет.</p>
          ) : (
            activeDeliveries.map((delivery) => {
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
            })
          )}
        </div>
      ) : null}

      {/* ===== Результаты (максимум 10) ===== */}
      {tab === 'results' ? (
        <div
          role="tabpanel"
          aria-label="Последние результаты"
          data-testid="recent-results"
          className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3"
        >
          {latestResults.length === 0 ? (
            <p className="text-xs text-muted-foreground">Результатов пока нет.</p>
          ) : (
            latestResults.map((result) => {
              const success = result.result === 'success'
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
            })
          )}
        </div>
      ) : null}

      {/* ===== Журнал ===== */}
      {tab === 'journal' ? (
        events.length === 0 ? (
          <div
            role="tabpanel"
            aria-label="Журнал событий"
            className="min-h-0 flex-1 p-3"
          >
            <p className="text-xs text-muted-foreground">Событий пока нет.</p>
          </div>
        ) : (
          <ol
            role="tabpanel"
            aria-label="Журнал событий"
            data-testid="event-log"
            className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3 text-xs"
          >
            {events.map((event) => (
              <li
                key={event.id}
                className="border-l-2 border-border pl-2 leading-tight"
              >
                <span className="font-medium text-foreground">
                  День {event.day}: {event.title}
                </span>
                <span className="block text-muted-foreground">{event.description}</span>
              </li>
            ))}
          </ol>
        )
      ) : null}
    </section>
  )
}
