import type { RoverDto } from '@/application/dto'
import { ROVER_STATUS_LABELS } from '@/shared/messages'

type Props = {
  rovers: readonly RoverDto[]
  selectedRoverId: string | null
  onSelect: (roverId: string) => void
  disabled: boolean
}

export function RoverList({
  rovers,
  selectedRoverId,
  onSelect,
  disabled,
}: Props): React.JSX.Element {
  if (rovers.length === 0) {
    return (
      <section aria-label="Роверы" className="rounded border border-slate-700 p-3">
        <h2 className="mb-2 font-semibold">Роверы</h2>
        <p className="text-sm text-slate-400">Роверы не найдены.</p>
      </section>
    )
  }

  return (
    <section aria-label="Роверы" className="rounded border border-slate-700 p-3">
      <h2 className="mb-2 font-semibold">Роверы</h2>
      <ul className="flex flex-col gap-2">
        {rovers.map((rover) => {
          const isSelected = rover.id === selectedRoverId

          return (
            <li key={rover.id}>
              <button
                type="button"
                data-testid={`rover-${rover.id}`}
                aria-pressed={isSelected}
                disabled={disabled || rover.status !== 'idle'}
                onClick={() => onSelect(rover.id)}
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
                  {rover.name}
                </span>
                <span className="block text-slate-300">
                  Заряд: {rover.batteryCharge} / {rover.batteryCapacity} ед. (
                  {Math.round(
                    (rover.batteryCharge / rover.batteryCapacity) * 100,
                  )}
                  %) • грузоподъёмность {rover.stats.capacity} кг • скорость{' '}
                  {rover.speed} км/ч • кпд {rover.stats.efficiency.toFixed(2)}
                </span>
                <span className="block text-slate-400">
                  Статус: {ROVER_STATUS_LABELS[rover.status]}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
