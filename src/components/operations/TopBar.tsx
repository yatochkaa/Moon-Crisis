'use client'

/**
 * Top panel + section tabs, ported from the v0 reference.
 *
 * Every value comes from the real `SessionDto`; every action is a callback
 * provided by `useGame`. No mock data.
 */

import type { SessionDto } from '@/application/dto'
import { ratingState } from '@/domain'
import { BASE_STATE_LABELS, SESSION_STATUS_LABELS } from '@/shared/messages'
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronRightIcon,
  GaugeIcon,
  MoonIcon,
  PlayIcon,
  RefreshIcon,
  ShoppingCartIcon,
  TargetIcon,
  TrendingUpIcon,
  WalletIcon,
} from '@/components/ui/icons'

export type OperationsTab = 'operations' | 'shop'

type Props = {
  session: SessionDto
  tab: OperationsTab
  onTabChange: (tab: OperationsTab) => void
  busy: boolean
  /** True while the session is won or lost. */
  isFinished: boolean
  /** True while at least one delivery is in transit. */
  deliveryInProgress: boolean
  onEndDay: () => void
  onReset: () => void
  onReload: () => void
}

function Stat({
  icon,
  label,
  value,
  testId,
  valueClass,
}: {
  icon: React.ReactNode
  label: string
  value: string
  testId?: string
  valueClass?: string
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2.5">
      <div className="text-muted-foreground">{icon}</div>
      <div className="leading-tight">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div
          data-testid={testId}
          className={`font-mono text-sm font-semibold ${valueClass ?? 'text-foreground'}`}
        >
          {value}
        </div>
      </div>
    </div>
  )
}

export function TopBar({
  session,
  tab,
  onTabChange,
  busy,
  isFinished,
  deliveryInProgress,
  onEndDay,
  onReset,
  onReload,
}: Props): React.JSX.Element {
  const tabBase = 'flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors'
  const tabActive = 'bg-primary text-primary-foreground'
  const tabIdle = 'text-muted-foreground hover:text-foreground'
  // UI band only; win/lose is driven by minimumRating on the server.
  const baseState = ratingState(session.rating, session.minimumRating)
  const baseStateLabel = BASE_STATE_LABELS[baseState]

  return (
    <header className="flex h-[68px] shrink-0 items-center gap-5 border-b border-border bg-panel px-5">
      {/* Brand */}
      <div className="flex items-center gap-3 pr-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/15 ring-1 ring-primary/30">
          <MoonIcon size={20} className="text-primary" />
        </div>
        <div className="leading-tight">
          <div className="text-base font-semibold tracking-tight text-foreground">
            Лунный курьер
          </div>
          <div className="font-mono text-xs text-muted-foreground" data-testid="day">
            День {session.currentDay} из {session.maxDays}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <nav
        aria-label="Разделы"
        className="flex items-center gap-1 rounded-md bg-secondary p-1"
      >
        <button
          type="button"
          data-testid="tab-operations"
          aria-pressed={tab === 'operations'}
          onClick={() => onTabChange('operations')}
          className={`${tabBase} ${tab === 'operations' ? tabActive : tabIdle}`}
        >
          Операции
        </button>
        <button
          type="button"
          data-testid="tab-engineering"
          aria-pressed={tab === 'shop'}
          onClick={() => onTabChange('shop')}
          className={`${tabBase} ${tab === 'shop' ? tabActive : tabIdle}`}
        >
          <ShoppingCartIcon size={14} />
          Магазин базы
        </button>
      </nav>

      <div className="ml-1 h-8 w-px bg-border" />

      {/* Stats */}
      <div className="flex items-center gap-6">
        <Stat
          icon={<WalletIcon />}
          label="Баланс"
          testId="credits"
          value={String(session.balanceCredits)}
        />
        <Stat
          icon={<TrendingUpIcon />}
          label="Заработано"
          testId="earned-credits"
          value={String(session.earnedCredits)}
          valueClass="text-success"
        />
        <Stat
          icon={<GaugeIcon />}
          label="Рейтинг базы"
          testId="rating"
          value={String(session.rating)}
          valueClass="text-primary"
        />
      </div>

      {/* Session status + goal + actions */}
      <div className="ml-auto flex items-center gap-3">
        <span className="sr-only" data-testid="session-status">
          {SESSION_STATUS_LABELS[session.status]}
        </span>

        {baseState === 'stable' ? (
          <div
            data-testid="base-state"
            data-state="stable"
            className="flex items-center gap-1.5 rounded-md border border-success/40 bg-success/10 px-2.5 py-1.5"
          >
            <CheckIcon size={14} className="text-success" />
            <span className="text-xs font-medium text-success">
              {baseStateLabel} (мин. {session.minimumRating})
            </span>
          </div>
        ) : (
          <div
            data-testid="base-state"
            data-state={baseState}
            className="flex items-center gap-1.5 rounded-md border border-danger/40 bg-danger/10 px-2.5 py-1.5"
          >
            <AlertTriangleIcon size={14} className="text-danger" />
            <span className="text-xs font-medium text-danger">
              {baseStateLabel} (мин. {session.minimumRating})
            </span>
          </div>
        )}

        <div className="flex flex-col items-end gap-0.5 border-r border-border pr-3 leading-none">
          <span className="font-mono text-xs text-muted-foreground">
            Операции сегодня
          </span>
          <span
            data-testid="operations-today"
            className="font-mono text-sm font-semibold text-foreground"
          >
            {session.operationsToday}/{session.maxOperationsPerDay}
          </span>
        </div>

        <div
          data-testid="session-goal"
          className="flex items-center gap-1.5 pr-1 text-xs text-muted-foreground"
        >
          <TargetIcon size={14} />
          <span>Продержаться {session.maxDays} дней</span>
        </div>

        <button
          type="button"
          data-testid="end-day"
          onClick={onEndDay}
          disabled={busy || isFinished || deliveryInProgress}
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Завершить день
          <ChevronRightIcon />
        </button>

        <button
          type="button"
          onClick={onReload}
          disabled={busy}
          title="Обновить состояние"
          aria-label="Обновить состояние"
          className="rounded-md border border-border p-2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <RefreshIcon />
        </button>

        <button
          type="button"
          data-testid="reset-game"
          onClick={onReset}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <PlayIcon size={14} />
          Новая игра
        </button>
      </div>
    </header>
  )
}
