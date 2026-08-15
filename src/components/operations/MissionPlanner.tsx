'use client'

/**
 * Mission planner in the v0 visual style, bound to the real `DeliveryPreviewDto`.
 *
 * Every number shown here is the server-side preview (battery, duration, risk,
 * reward) — the client never recomputes game formulas. Blocking reasons use the
 * human-readable server messages; the launch button calls the real start action.
 */

import type {
  DeliveryPreviewDto,
  LocationDto,
  OrderDto,
  RoverDto,
} from '@/application/dto'
import {
  AlertTriangleIcon,
  BoxIcon,
  MapPinIcon,
  RocketIcon,
  SendIcon,
} from '@/components/ui/icons'

type Props = {
  order: OrderDto | null
  rover: RoverDto | null
  location: LocationDto | null
  preview: DeliveryPreviewDto | null
  previewLoading: boolean
  busy: boolean
  onStart: () => void
}

function CalcRow({
  label,
  value,
  tone,
  testId,
}: {
  label: string
  value: string
  tone?: string
  testId?: string
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span
        data-testid={testId}
        className={`font-mono ${tone ?? 'text-foreground/90'}`}
      >
        {value}
      </span>
    </div>
  )
}

function SelectedChip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-secondary px-2.5 py-1">
      <span className="text-primary">{icon}</span>
      <div className="min-w-0 leading-tight">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="truncate text-xs font-medium text-foreground">{value}</div>
      </div>
    </div>
  )
}

function riskTone(risk: number): string {
  if (risk >= 30) return 'text-danger'
  if (risk >= 15) return 'text-contract'
  return 'text-success'
}

export function MissionPlanner({
  order,
  rover,
  location,
  preview,
  previewLoading,
  busy,
  onStart,
}: Props): React.JSX.Element {
  const isSelectionComplete = order !== null && rover !== null
  const canStart = preview !== null && preview.canStart && !busy

  return (
    <section
      aria-label="Выбранная миссия"
      className="rounded-lg border border-border bg-panel p-3"
    >
      <h2 className="mb-2.5 text-sm font-semibold text-foreground">Новая миссия</h2>

      {/*
        A blocked challenge contract can now be selected on the board, so the
        planner must explain WHY it is impossible even before a rover is picked.
      */}
      {order !== null && order.isChallenge && order.challengeReason !== null ? (
        <div
          data-testid="challenge-block"
          className="mb-2.5 space-y-1 rounded-md border border-contract/40 bg-contract/10 p-2.5"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-contract">
            <AlertTriangleIcon size={14} className="shrink-0" />
            Недостижимый контракт
          </div>
          <p className="text-xs text-contract/90">{order.challengeReason}</p>
          {order.challengeHint !== null ? (
            <p className="text-xs text-muted-foreground">{order.challengeHint}</p>
          ) : null}
        </div>
      ) : null}

      {!isSelectionComplete ? (
        <p className="text-xs text-muted-foreground">
          Выберите заказ и ровер, чтобы увидеть расчёт.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2">
            <SelectedChip icon={<BoxIcon />} label="Заказ" value={order.title} />
            <div className="grid grid-cols-2 gap-2">
              <SelectedChip
                icon={<MapPinIcon />}
                label="Назначение"
                value={location?.name ?? order.locationId}
              />
              <SelectedChip icon={<RocketIcon />} label="Ровер" value={rover.name} />
            </div>
          </div>

          {previewLoading ? (
            <p role="status" className="mt-2.5 text-xs text-muted-foreground">
              Расчёт…
            </p>
          ) : null}

          {preview !== null ? (
            <div
              data-testid="preview"
              className="mt-2.5 space-y-1 rounded-md border border-border bg-card p-2.5"
            >
              <CalcRow label="Груз" value={`${order.weight} кг`} />
              <CalcRow
                label="Расход энергии"
                value={`${preview.batteryCost} ед.`}
                testId="preview-battery"
              />
              <CalcRow
                label="Время"
                value={`${preview.duration} ч`}
                testId="preview-duration"
              />
              <CalcRow
                label="Риск"
                value={`${preview.risk}%`}
                tone={riskTone(preview.risk)}
                testId="preview-risk"
              />
              <div className="my-1 h-px bg-border" />
              <CalcRow
                label="Награда"
                value={`${preview.reward} кредитов`}
                tone="text-primary"
                testId="preview-reward"
              />
            </div>
          ) : null}

          {preview !== null && preview.reasons.length > 0 ? (
            <ul data-testid="preview-reasons" className="mt-2 space-y-1.5">
              {preview.reasons.map((reason) => (
                // UI shows only the human-readable message; the internal code
                // (e.g. CAPACITY_EXCEEDED) stays in the API payload, not here.
                <li
                  key={reason.code}
                  className="flex items-center gap-2 rounded-md border border-danger/40 bg-danger/10 px-2.5 py-1.5"
                >
                  <AlertTriangleIcon className="shrink-0 text-danger" />
                  <span className="text-xs text-danger">{reason.message}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <button
            type="button"
            data-testid="start-delivery"
            onClick={onStart}
            disabled={!canStart}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <SendIcon />
            {busy ? 'Запуск…' : 'Запустить доставку'}
          </button>
        </>
      )}
    </section>
  )
}
