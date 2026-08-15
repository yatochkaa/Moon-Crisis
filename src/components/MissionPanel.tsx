import type {
  DeliveryPreviewDto,
  OrderDto,
  RoverDto,
} from '@/application/dto'

type Props = {
  order: OrderDto | null
  rover: RoverDto | null
  preview: DeliveryPreviewDto | null
  previewLoading: boolean
  busy: boolean
  onStart: () => void
}

export function MissionPanel({
  order,
  rover,
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
      className="rounded border border-slate-700 p-3"
    >
      <h2 className="mb-2 font-semibold">Миссия</h2>

      {!isSelectionComplete ? (
        <p className="text-sm text-slate-400">
          Выберите заказ и ровер, чтобы увидеть расчёт.
        </p>
      ) : (
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-slate-300">
            {order.title} → {rover.name}
          </p>

          {previewLoading ? (
            <p role="status" className="text-slate-400">
              Расчёт…
            </p>
          ) : null}

          {preview !== null ? (
            <dl
              data-testid="preview"
              className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4"
            >
              <div>
                <dt className="text-slate-400">Заряд</dt>
                <dd data-testid="preview-battery">{preview.batteryCost}%</dd>
              </div>
              <div>
                <dt className="text-slate-400">Время</dt>
                <dd data-testid="preview-duration">{preview.duration} ч</dd>
              </div>
              <div>
                <dt className="text-slate-400">Риск</dt>
                <dd data-testid="preview-risk">{preview.risk}%</dd>
              </div>
              <div>
                <dt className="text-slate-400">Награда</dt>
                <dd data-testid="preview-reward">{preview.reward} кр.</dd>
              </div>
            </dl>
          ) : null}

          {preview !== null && preview.reasons.length > 0 ? (
            <ul
              data-testid="preview-reasons"
              className="list-disc pl-5 text-amber-300"
            >
              {preview.reasons.map((reason) => (
                // UI shows only the human-readable message; the internal code
                // (e.g. CAPACITY_EXCEEDED) stays in the API payload, not here.
                <li key={reason.code}>{reason.message}</li>
              ))}
            </ul>
          ) : null}

          <button
            type="button"
            data-testid="start-delivery"
            onClick={onStart}
            disabled={!canStart}
            className="w-fit rounded border border-emerald-400 bg-emerald-900 px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Запуск…' : 'Запустить доставку'}
          </button>
        </div>
      )}
    </section>
  )
}
