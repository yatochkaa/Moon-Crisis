import type { LocationDto, OrderDto } from '@/application/dto'
import { ORDER_STATUS_LABELS, URGENCY_LABELS } from '@/shared/messages'

type Props = {
  orders: readonly OrderDto[]
  locations: readonly LocationDto[]
  selectedOrderId: string | null
  onSelect: (orderId: string) => void
  disabled: boolean
}

export function OrderList({
  orders,
  locations,
  selectedOrderId,
  onSelect,
  disabled,
}: Props): React.JSX.Element {
  const locationNameById = new Map(
    locations.map((location) => [location.id, location.name]),
  )

  if (orders.length === 0) {
    return (
      <section aria-label="Заказы" className="rounded border border-slate-700 p-3">
        <h2 className="mb-2 font-semibold">Заказы</h2>
        <p className="text-sm text-slate-400">Сейчас заказов нет.</p>
      </section>
    )
  }

  return (
    <section aria-label="Заказы" className="rounded border border-slate-700 p-3">
      <h2 className="mb-2 font-semibold">Заказы</h2>
      <ul className="flex flex-col gap-2">
        {orders.map((order) => {
          const isSelected = order.id === selectedOrderId
          const isAvailable = order.status === 'available'

          return (
            <li key={order.id}>
              <button
                type="button"
                data-testid={`order-${order.id}`}
                aria-pressed={isSelected}
                disabled={disabled || !isAvailable}
                onClick={() => onSelect(order.id)}
                className={[
                  'w-full rounded border p-2 text-left text-sm',
                  isSelected
                    ? 'border-sky-400 bg-sky-950'
                    : 'border-slate-700 bg-slate-900',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                ].join(' ')}
              >
                <span className="block font-semibold">
                  {isSelected ? '▸ ' : ''}
                  {order.title}
                </span>
                <span className="block text-slate-300">
                  {locationNameById.get(order.locationId) ?? order.locationId} •{' '}
                  {order.weight} кг • {order.reward} кр. • риск {order.baseRisk}% •
                  дедлайн: день {order.deadlineDay}
                </span>
                <span className="block text-slate-400">
                  Срочность: {URGENCY_LABELS[order.urgency]} • Статус:{' '}
                  {ORDER_STATUS_LABELS[order.status]}
                </span>
                {order.isChallenge ? (
                  // Challenge contract: locked, never uses the critical (red)
                  // visual state. Shows the lock, the concrete reason and the
                  // upgrade required to unlock it.
                  <span
                    data-testid={`challenge-${order.id}`}
                    className="mt-1 block rounded bg-amber-950 p-1 text-amber-200"
                  >
                    <span className="block font-semibold">
                      🔒 {order.challengeLabel ?? 'Контракт-вызов'}
                    </span>
                    <span className="block uppercase">КОНТРАКТ-ВЫЗОВ</span>
                    <span className="block">Сейчас недоступен</span>
                    {order.challengeReason !== null ? (
                      <span className="block">{order.challengeReason}</span>
                    ) : null}
                    {order.challengeHint !== null ? (
                      <span className="block">{order.challengeHint}</span>
                    ) : null}
                  </span>
                ) : order.urgency === 'critical' ? (
                  // Critical order: red visual state and the fixed rating stakes.
                  <span
                    data-testid={`critical-${order.id}`}
                    className="mt-1 block rounded bg-red-950 p-1 text-red-200"
                  >
                    <span className="block font-semibold">КРИТИЧЕСКИЙ</span>
                    <span className="block">Истекает сегодня</span>
                    <span className="block">Успех: +3 рейтинга</span>
                    <span className="block">Провал или просрочка: −10 рейтинга</span>
                  </span>
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
