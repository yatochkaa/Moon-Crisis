'use client'

/**
 * Rover fleet panel in the v0 visual style, bound to the real `RoverDto`.
 *
 * Charge, capacity and status come from the server snapshot; the remaining time
 * of a rover currently on a mission comes from the matching active delivery.
 * `data-testid` values match the previous `RoverList`.
 */

import type { ActiveDeliveryDto, RoverDto } from '@/application/dto'
import { ROVER_STATUS_LABELS } from '@/shared/messages'
import { roverColor } from '@/shared/roverColors'
import { BatteryIcon, PackageIcon, RocketIcon } from '@/components/ui/icons'

type Props = {
  rovers: readonly RoverDto[]
  activeDeliveries: readonly ActiveDeliveryDto[]
  selectedRoverId: string | null
  onSelect: (roverId: string) => void
  disabled: boolean
  /** Shared client clock in ms. */
  now: number
}

const STATUS_STYLES: Record<RoverDto['status'], string> = {
  idle: 'bg-success/15 text-success',
  delivering: 'bg-primary/15 text-primary',
  charging: 'bg-route/15 text-route',
  damaged: 'bg-danger/15 text-danger',
}

function formatRemaining(completesAt: string, now: number): string {
  const seconds = Math.max(0, Math.ceil((Date.parse(completesAt) - now) / 1000))
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export function FleetPanel({
  rovers,
  activeDeliveries,
  selectedRoverId,
  onSelect,
  disabled,
  now,
}: Props): React.JSX.Element {
  const deliveryByRoverId = new Map(
    activeDeliveries.map((delivery) => [delivery.roverId, delivery]),
  )

  return (
    <section aria-label="Роверы" className="space-y-2">
      <h2 className="px-1 text-sm font-semibold text-foreground">Флот роверов</h2>

      {rovers.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">Роверы не найдены.</p>
      ) : null}

      {rovers.map((rover) => {
        const isSelected = rover.id === selectedRoverId
        const pct =
          rover.batteryCapacity === 0
            ? 0
            : Math.round((rover.batteryCharge / rover.batteryCapacity) * 100)
        const low = pct < 40
        const delivery = deliveryByRoverId.get(rover.id) ?? null

        return (
          <button
            key={rover.id}
            type="button"
            data-testid={`rover-${rover.id}`}
            aria-pressed={isSelected}
            disabled={disabled || rover.status !== 'idle'}
            onClick={() => onSelect(rover.id)}
            className={[
              'block w-full rounded-md border px-3 py-2.5 text-left transition-colors',
              isSelected
                ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/30'
                : 'border-border bg-card',
              'disabled:cursor-not-allowed disabled:opacity-60',
            ].join(' ')}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* stable identity dot, matching the rover's colour on the map;
                    the name next to it is the real, non-colour-only label */}
                <span
                  aria-hidden="true"
                  data-testid={`rover-color-${rover.id}`}
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/25"
                  style={{ backgroundColor: roverColor(rover.id) }}
                />
                <RocketIcon className="text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">{rover.name}</h3>
              </div>
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_STYLES[rover.status]}`}
              >
                {ROVER_STATUS_LABELS[rover.status]}
              </span>
            </div>

            {/* battery */}
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <BatteryIcon size={14} /> Заряд
                </span>
                <span className="font-mono text-foreground/90">
                  {rover.batteryCharge} / {rover.batteryCapacity} ед. · {pct}%
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className={`h-full rounded-full ${low ? 'bg-danger' : 'bg-success'}`}
                  style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                />
              </div>
            </div>

            <div className="mt-1.5 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <PackageIcon size={14} /> Грузоподъёмность
              </span>
              <span className="font-mono text-foreground/90">
                {rover.stats.capacity} кг
              </span>
            </div>

            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Скорость · КПД</span>
              <span className="font-mono text-foreground/90">
                {rover.speed} км/ч · {rover.stats.efficiency.toFixed(2)}
              </span>
            </div>

            {delivery !== null ? (
              <div className="mt-1.5 flex items-center justify-between border-t border-border/70 pt-1 text-xs">
                <span className="text-muted-foreground">Осталось</span>
                <span className="font-mono text-foreground/90">
                  {formatRemaining(delivery.completesAt, now)}
                </span>
              </div>
            ) : null}
          </button>
        )
      })}
    </section>
  )
}
