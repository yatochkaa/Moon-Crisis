import type { SessionDto } from '@/application/dto'
import { SESSION_STATUS_LABELS } from '@/shared/messages'

type Props = {
  session: SessionDto
}

export function StatusBar({ session }: Props): React.JSX.Element {
  return (
    <section
      aria-label="Состояние игры"
      className="grid grid-cols-2 gap-3 rounded border border-slate-700 bg-slate-900 p-3 text-sm sm:grid-cols-6"
    >
      <p>
        День:{' '}
        <span className="font-semibold" data-testid="day">
          {session.currentDay} / {session.maxDays}
        </span>
      </p>
      <p>
        Баланс:{' '}
        <span className="font-semibold" data-testid="credits">
          {session.balanceCredits}
        </span>
      </p>
      <p>
        Заработано:{' '}
        <span className="font-semibold" data-testid="earned-credits">
          {session.earnedCredits}
        </span>
      </p>
      <p>
        Рейтинг:{' '}
        <span className="font-semibold" data-testid="rating">
          {session.rating}
        </span>{' '}
        (мин. {session.minimumRating})
      </p>
      <p>
        Статус:{' '}
        <span className="font-semibold" data-testid="session-status">
          {SESSION_STATUS_LABELS[session.status]}
        </span>
      </p>
      <p className="text-slate-400" data-testid="session-goal">
        Цель: продержаться {session.maxDays} дней
      </p>
    </section>
  )
}
