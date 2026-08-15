'use client'

/**
 * «Операции» screen composition.
 *
 * Presentation only. Every value comes from `GameStateDto` and every action is a
 * callback from `useGame` — no game rules and no mock data live here.
 *
 * Desktop layout: the screen fills its frame (100vw x 100dvh). Orders sit on the
 * left (fixed width), the fleet + mission planner + «Центр активности» on the
 * right (fixed width), and the SVG map fills all the remaining space. There is
 * no permanent dock over the map anymore: active deliveries, results and the
 * event log live in the right-column «Центр активности» tabs. A finished
 * delivery briefly raises a compact toast in the top-right of the map. Nothing
 * scrolls at the page level; every list scrolls inside its own panel.
 */

import { useEffect, useRef, useState } from 'react'
import type { DeliveryResultDto, GameStateDto } from '@/application/dto'
import type { GameScreenState } from '@/components/useGame'
import { ActivityCenter } from './ActivityCenter'
import { FleetPanel } from './FleetPanel'
import { MissionPlanner } from './MissionPlanner'
import { MoonMapView } from './MoonMapView'
import { OrdersPanel } from './OrdersPanel'
import {
  AlertTriangleIcon,
  CheckIcon,
  CrossIcon,
  TruckIcon,
} from '@/components/ui/icons'

type Props = {
  state: GameStateDto
  game: GameScreenState
}

/** Compact, auto-dismissing toast shown when a delivery finishes. */
function DeliveryToast({
  result,
}: {
  result: DeliveryResultDto
}): React.JSX.Element {
  const success = result.result === 'success'
  const ratingText = `${result.ratingDelta >= 0 ? '+' : ''}${result.ratingDelta}`
  return (
    <div
      role="status"
      data-testid="delivery-toast"
      className={[
        'mcc-toast pointer-events-none absolute right-3 top-3 z-30 flex max-w-[360px] items-start gap-2 rounded-lg border p-2.5 shadow-lg backdrop-blur-md',
        success
          ? 'border-success/40 bg-success/15'
          : 'border-danger/40 bg-danger/15',
      ].join(' ')}
    >
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
          success ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'
        }`}
      >
        {success ? <CheckIcon size={14} /> : <CrossIcon size={14} />}
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold text-foreground">
          {success ? 'Доставка выполнена' : 'Доставка провалена'}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {result.roverName} · {result.orderTitle}
        </div>
        <div className="text-xs">
          <span className={success ? 'text-success' : 'text-muted-foreground'}>
            {success ? `+${result.creditsAwarded} кр.` : 'без оплаты'}
          </span>
          <span className="text-muted-foreground"> · рейтинг </span>
          <span className={success ? 'text-success' : 'text-danger'}>{ratingText}</span>
        </div>
      </div>
    </div>
  )
}

export function OperationsScreen({ state, game }: Props): React.JSX.Element {
  const isFinished = state.session.status !== 'active'

  const lowBatteryWarning =
    !isFinished &&
    state.rovers.some(
      (rover) =>
        rover.status === 'idle' && rover.batteryCharge < rover.batteryCapacity * 0.25,
    )
  const activeDeliveries = state.activeDeliveries
  const results = game.deliveryResults
  const [activityOpen, setActivityOpen] = useState(false)

  // Delivery-finished toast. OperationsScreen only mounts once the game state is
  // loaded, so the first effect run simply records the ids already present
  // (post-F5 restore) without flashing a toast; only genuinely new results after
  // that raise one. The result itself always stays in the «Результаты» tab.
  const [toast, setToast] = useState<DeliveryResultDto | null>(null)
  const seenIds = useRef<Set<string>>(new Set())
  const initialised = useRef(false)
  useEffect(() => {
    if (!initialised.current) {
      initialised.current = true
      for (const result of results) seenIds.current.add(result.deliveryId)
      return
    }
    const fresh = results.filter((result) => !seenIds.current.has(result.deliveryId))
    if (fresh.length === 0) return
    for (const result of fresh) seenIds.current.add(result.deliveryId)
    setToast(fresh[fresh.length - 1] ?? null)
    const timer = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(timer)
  }, [results])

  const selectedOrder =
    state.orders.find((order) => order.id === game.selectedOrderId) ?? null
  const selectedRover =
    state.rovers.find((rover) => rover.id === game.selectedRoverId) ?? null
  const selectedLocation =
    selectedOrder === null
      ? null
      : (state.locations.find(
          (location) => location.id === selectedOrder.locationId,
        ) ?? null)

  const activeOrders = state.orders.filter(
    (order) => order.status === 'available' || order.status === 'in_progress',
  )

  const roverNameById = new Map(
    state.rovers.map((rover) => [rover.id, rover.name]),
  )
  const orderTitleById = new Map(
    state.orders.map((order) => [order.id, order.title]),
  )
  const locationNameById = new Map(
    state.locations.map((location) => [location.id, location.name]),
  )

  return (
    <div className="flex h-full min-h-0 w-full gap-2 overflow-hidden p-2">
      {/* Left — orders (panel owns its width + scroll) */}
      <OrdersPanel
        orders={activeOrders}
        locations={state.locations}
        selectedOrderId={game.selectedOrderId}
        onSelect={game.selectOrder}
        disabled={game.busy || isFinished}
      />

      {/* Center — map is the primary element and fills the remaining space */}
      <div className="relative min-h-0 min-w-0 flex-1">
        <MoonMapView
          base={state.base}
          locations={state.locations}
          rovers={state.rovers}
          selectedLocation={selectedLocation}
          activeDeliveries={activeDeliveries}
          now={game.now}
        />

        {/* Delivery-finished toast (top-right, auto-dismisses) */}
        {toast !== null ? <DeliveryToast result={toast} /> : null}

        {/* Floating notices, top-centre, never steal map height */}
        <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex flex-col items-center gap-2 px-24">
          {game.error !== null ? (
            <p
              role="alert"
              data-testid="error"
              className="pointer-events-auto flex max-w-lg items-center gap-2 rounded-md border border-danger/40 bg-danger/15 px-3 py-2 text-xs text-danger backdrop-blur-sm"
            >
              <AlertTriangleIcon size={14} className="shrink-0" />
              {game.error}
            </p>
          ) : null}

          {isFinished ? (
            state.finalResult !== null ? (
              <section
                role="status"
                data-testid="final-result"
                className={[
                  'pointer-events-auto max-w-lg space-y-1 rounded-lg border p-3 text-xs backdrop-blur-sm',
                  state.finalResult.outcome === 'won'
                    ? 'border-success/40 bg-success/15'
                    : 'border-danger/40 bg-danger/15',
                ].join(' ')}
              >
                <h2
                  data-testid="final-title"
                  className="text-base font-semibold text-foreground"
                >
                  {state.finalResult.title}
                </h2>
                <p className="text-muted-foreground">{state.finalResult.summary}</p>
                <p className="font-mono text-foreground/90">
                  Рейтинг: {state.finalResult.rating} · Заработано:{' '}
                  {state.finalResult.earnedCredits} кр. · Ранг:{' '}
                  {state.finalResult.finalRank}
                </p>
                <p className="font-mono text-foreground/90">
                  Выполнено: {state.finalResult.completedCount} · Провалено:{' '}
                  {state.finalResult.failedCount}
                </p>
                {state.finalResult.lossDay !== null ? (
                  <p className="text-muted-foreground">
                    День поражения: {state.finalResult.lossDay}
                  </p>
                ) : null}
                {state.finalResult.lastRatingLossReason !== null ? (
                  <div className="space-y-1 pt-1">
                    <p className="font-medium text-foreground/90">
                      Что привело к поражению:
                    </p>
                    <p className="text-muted-foreground">
                      {state.finalResult.lastRatingLossReason}
                    </p>
                    {state.finalResult.lastRatingLossReason.includes('энерги') ? (
                      <p className="pt-0.5 text-xs italic text-muted-foreground/80">
                        Используйте зарядку в Магазине базы или улучшайте батарею и
                        энергоэффективность.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <p className="pt-1 text-muted-foreground">
                  Нажмите «Новая игра», чтобы начать заново.
                </p>
              </section>
            ) : (
              <p
                role="status"
                className="pointer-events-auto max-w-lg rounded-md border border-contract/40 bg-contract/15 px-3 py-2 text-xs text-contract backdrop-blur-sm"
              >
                Игра завершена. Нажмите «Новая игра», чтобы начать заново.
              </p>
            )
          ) : null}

          {lowBatteryWarning ? (
            <div
              data-testid="low-battery-warning"
              className="pointer-events-auto flex max-w-lg items-center gap-2 rounded-md border border-contract/40 bg-contract/15 px-3 py-2 text-xs text-contract backdrop-blur-sm"
            >
              <AlertTriangleIcon size={14} className="shrink-0" />
              <span>
                Низкий заряд. Перед следующей миссией посетите Магазин базы.
              </span>
            </div>
          ) : null}

          {game.earlyEndPending ? (
            <section
              data-testid="early-end-confirm"
              className="pointer-events-auto max-w-lg space-y-2 rounded-md border border-contract/40 bg-contract/15 p-3 text-xs backdrop-blur-sm"
            >
              <p className="text-contract">
                Сегодня выполнено меньше 3 операций. Досрочное завершение дня
                снизит рейтинг на 10. Продолжить?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  data-testid="confirm-early-end"
                  onClick={() => void game.endDay(true)}
                  disabled={game.busy}
                  className="rounded-md bg-contract px-3 py-1.5 font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Завершить со штрафом
                </button>
                <button
                  type="button"
                  data-testid="cancel-early-end"
                  onClick={() => game.cancelEarlyEnd()}
                  disabled={game.busy}
                  className="rounded-md border border-border px-3 py-1.5 text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Отмена
                </button>
              </div>
            </section>
          ) : null}
        </div>

        {/* «Центр активности»: a launcher pinned bottom-left that opens a floating
            popup, so it never blocks the right-column launch button. */}
        {!activityOpen ? (
          <button
            type="button"
            data-testid="activity-open"
            onClick={() => setActivityOpen(true)}
            className="absolute bottom-3 left-3 z-20 flex items-center gap-2 rounded-lg border border-border bg-panel/85 px-3 py-2 text-xs font-medium text-foreground shadow-lg backdrop-blur-md transition-colors hover:bg-panel"
          >
            <TruckIcon size={14} className="text-route" />
            Центр активности
            <span className="rounded bg-route/15 px-1.5 py-0.5 font-mono text-[11px] text-route">
              {activeDeliveries.length}
            </span>
          </button>
        ) : (
          <div className="absolute bottom-3 left-3 z-30 flex h-[70%] w-[360px] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-lg shadow-2xl">
            <ActivityCenter
              activeDeliveries={activeDeliveries}
              results={results}
              events={state.events}
              roverNameById={roverNameById}
              orderTitleById={orderTitleById}
              locationNameById={locationNameById}
              now={game.now}
              onClose={() => setActivityOpen(false)}
            />
          </div>
        )}
      </div>

      {/* Right — fleet (scrolls) with the mission planner pinned at the bottom so
          «Запустить доставку» stays reachable at all times. */}
      <aside className="flex w-[320px] shrink-0 flex-col gap-2 overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
          <FleetPanel
            rovers={state.rovers}
            activeDeliveries={activeDeliveries}
            selectedRoverId={game.selectedRoverId}
            onSelect={game.selectRover}
            disabled={game.busy || isFinished}
            now={game.now}
          />
        </div>
        <div className="shrink-0">
          <MissionPlanner
            order={selectedOrder}
            rover={selectedRover}
            location={selectedLocation}
            preview={game.preview}
            previewLoading={game.previewLoading}
            busy={game.busy}
            onStart={() => void game.start()}
          />
        </div>
      </aside>
    </div>
  )
}
