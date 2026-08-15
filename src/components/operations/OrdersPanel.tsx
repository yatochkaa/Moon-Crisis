'use client'

/**
 * Orders panel in the v0 visual style, bound to the real `OrderDto` list.
 *
 * Selection, disabled state and the challenge/critical states all come from the
 * server DTO. `data-testid` values match the previous `OrderList` so the e2e
 * suite keeps working.
 */

import type { LocationDto, OrderDto } from '@/application/dto'
import { ORDER_STATUS_LABELS, URGENCY_LABELS } from '@/shared/messages'
import {
  AlertTriangleIcon,
  BoxIcon,
  ClockIcon,
  CoinsIcon,
  LockIcon,
  WeightIcon,
} from '@/components/ui/icons'

type Props = {
  orders: readonly OrderDto[]
  locations: readonly LocationDto[]
  selectedOrderId: string | null
  onSelect: (orderId: string) => void
  disabled: boolean
}

function MetaRow({
  icon,
  children,
  testId,
}: {
  icon: React.ReactNode
  children: React.ReactNode
  testId?: string
}): React.JSX.Element {
  return (
    <div
      data-testid={testId}
      className="flex items-center gap-1.5 text-muted-foreground"
    >
      <span className="text-muted-foreground/70">{icon}</span>
      <span className="text-foreground/90">{children}</span>
    </div>
  )
}

export function OrdersPanel({
  orders,
  locations,
  selectedOrderId,
  onSelect,
  disabled,
}: Props): React.JSX.Element {
  const locationNameById = new Map(
    locations.map((location) => [location.id, location.name]),
  )

  return (
    <aside
      aria-label="Заказы"
      className="flex h-full w-[288px] shrink-0 flex-col rounded-lg border border-border bg-panel"
    >
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">
          Доступные заказы
        </h2>
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
        {orders.length === 0 ? (
          <p className="text-xs text-muted-foreground">Сейчас заказов нет.</p>
        ) : null}

        {orders.map((order) => {
          const isSelected = order.id === selectedOrderId
          const isAvailable = order.status === 'available'
          const isCritical = order.urgency === 'critical'
          const isChallenge = order.isChallenge

          const frame = isChallenge
            ? 'border-contract/40 bg-contract/5'
            : isCritical
              ? 'border-danger/50 bg-danger/5'
              : isSelected
                ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/30'
                : 'border-border bg-card'

          const badge = isChallenge
            ? 'bg-contract/15 text-contract'
            : isCritical
              ? 'bg-danger/15 text-danger'
              : 'bg-secondary text-muted-foreground'

          return (
            <button
              key={order.id}
              type="button"
              data-testid={`order-${order.id}`}
              aria-pressed={isSelected}
              disabled={disabled || !isAvailable}
              onClick={() => onSelect(order.id)}
              className={[
                'block w-full rounded-md border p-3 text-left transition-colors',
                frame,
                isSelected ? 'ring-1 ring-primary/30' : '',
                'disabled:cursor-not-allowed disabled:opacity-60',
              ].join(' ')}
            >
              <div className="flex items-start gap-2.5">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded ${badge}`}
                >
                  {isChallenge ? <LockIcon /> : <BoxIcon />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="truncate text-sm font-semibold text-foreground">
                      {order.title}
                    </h3>
                    {isSelected ? (
                      <span className="rounded bg-primary px-1.5 py-0.5 text-[11px] font-medium text-primary-foreground">
                        Выбран
                      </span>
                    ) : isCritical ? (
                      <span className="flex items-center gap-1 rounded bg-danger/20 px-1.5 py-0.5 text-[11px] font-medium text-danger">
                        <AlertTriangleIcon size={12} /> Критично
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {locationNameById.get(order.locationId) ?? order.locationId}
                  </p>
                </div>
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <MetaRow icon={<WeightIcon size={14} />}>
                  {order.weight} кг
                </MetaRow>
                <MetaRow icon={<CoinsIcon size={14} />}>
                  {order.reward} кред.
                </MetaRow>
                <MetaRow icon={<AlertTriangleIcon size={14} />}>
                  Риск {order.baseRisk}%
                </MetaRow>
                <MetaRow icon={<ClockIcon size={14} />}>
                  Срок: день {order.deadlineDay}
                </MetaRow>
              </div>

              <div className="mt-2 flex items-center justify-between border-t border-border/70 pt-2 text-[11px] text-muted-foreground">
                <span>Срочность: {URGENCY_LABELS[order.urgency]}</span>
                <span>{ORDER_STATUS_LABELS[order.status]}</span>
              </div>

              {isChallenge ? (
                // Challenge contract: locked, never uses the critical (red)
                // visual state. Shows the lock, the concrete reason and the
                // upgrade required to unlock it.
                <div
                  data-testid={`challenge-${order.id}`}
                  className="mt-2 space-y-1 border-t border-contract/25 pt-2 text-xs text-muted-foreground"
                >
                  <p className="flex items-center gap-1.5 font-medium text-contract">
                    <LockIcon size={14} />
                    {order.challengeLabel ?? 'Контракт-вызов'}
                  </p>
                  <p className="uppercase text-contract/80">КОНТРАКТ-ВЫЗОВ</p>
                  <p>Сейчас недоступен</p>
                  {order.challengeReason !== null ? (
                    <p>{order.challengeReason}</p>
                  ) : null}
                  {order.challengeHint !== null ? (
                    <p className="text-contract">{order.challengeHint}</p>
                  ) : null}
                </div>
              ) : isCritical ? (
                // Critical order: red visual state and the fixed rating stakes.
                <div
                  data-testid={`critical-${order.id}`}
                  className="mt-2 space-y-1 border-t border-danger/25 pt-2 text-xs"
                >
                  <p className="font-semibold text-danger">КРИТИЧЕСКИЙ</p>
                  <p className="text-muted-foreground">Истекает сегодня</p>
                  <div className="flex items-center justify-between">
                    <span className="text-success">Успех: +3 рейтинга</span>
                    <span className="text-danger">
                      Провал или просрочка: −10 рейтинга
                    </span>
                  </div>
                </div>
              ) : null}
            </button>
          )
        })}
      </div>
    </aside>
  )
}
