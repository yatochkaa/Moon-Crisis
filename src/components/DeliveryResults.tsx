import type { DeliveryResultDto } from '@/application/dto'

type Props = {
  results: readonly DeliveryResultDto[]
}

/**
 * Compact «Последние результаты» block shown in the right column under the
 * mission panel. Presentation only: it renders at most the three newest
 * delivery results (newest first) and lets the player expand the details.
 *
 * Rating messaging keeps the promise that a bonus is never shown as a bare +0:
 * when a successful delivery hit the 100-point cap (ratingDelta === 0 while the
 * intended ratingReward is positive) it explains that the rating stayed at 100.
 */
export function DeliveryResults({ results }: Props): React.JSX.Element | null {
  if (results.length === 0) return null

  const latest = results.slice(-3).reverse()

  return (
    <section
      aria-label="Последние результаты"
      data-testid="recent-results"
      className="rounded border border-slate-700 p-3"
    >
      <h2 className="mb-2 font-semibold">Последние результаты</h2>
      <ul className="flex flex-col gap-2">
        {latest.map((result) => {
          const success = result.result === 'success'
          const capped =
            success && result.ratingDelta === 0 && result.ratingReward > 0
          const ratingText = capped
            ? `Бонус рейтинга +${result.ratingReward}, итоговый рейтинг остался 100 — достигнут максимум`
            : `Рейтинг: ${result.ratingDelta >= 0 ? '+' : ''}${result.ratingDelta}`

          return (
            <li
              key={result.deliveryId}
              data-testid={`delivery-result-${result.deliveryId}`}
              className={[
                'rounded border p-2 text-sm',
                success
                  ? 'border-emerald-500 bg-emerald-950'
                  : 'border-red-500 bg-red-950',
              ].join(' ')}
            >
              <details>
                <summary className="cursor-pointer">
                  <span className="font-semibold">
                    {result.roverName} → {result.orderTitle}
                  </span>{' '}
                  <span data-testid="delivery-result-status">
                    {success ? 'успех' : 'провал'}
                  </span>
                </summary>
                <p className="mt-1 text-slate-200">
                  риск {result.risk}% • награда {result.reward} кр.
                </p>
                <p
                  className={
                    capped
                      ? 'text-amber-200'
                      : success
                        ? 'text-emerald-200'
                        : 'text-red-200'
                  }
                >
                  {ratingText}
                </p>
              </details>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
