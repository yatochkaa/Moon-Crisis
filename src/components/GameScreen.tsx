'use client'

/**
 * Game screen: presentation only.
 *
 * All rules live on the server; this component renders the server snapshot,
 * keeps the current selection and triggers the API calls.
 *
 * The «Операции» tab now uses the v0 visual composition (fixed 1440x900 desktop
 * frame: top bar, tabs, orders panel, SVG map, fleet panel, mission planner,
 * active deliveries, recent results). The Engineering bay is intentionally left
 * on its previous markup — it is a separate migration step.
 */

import { useState } from 'react'
import { ENGINEERING_BAY_UNLOCK_DAY } from '@/domain'
import { BaseShop } from './BaseShop'
import { OperationsScreen } from './operations/OperationsScreen'
import { TopBar } from './operations/TopBar'
import type { OperationsTab } from './operations/TopBar'
import { useGame } from './useGame'

export function GameScreen(): React.JSX.Element {
  const game = useGame()
  const [tab, setTab] = useState<OperationsTab>('operations')
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  if (game.loading && game.state === null) {
    return (
      <p
        role="status"
        data-testid="loading"
        className="p-6 text-sm text-muted-foreground"
      >
        Загрузка игры…
      </p>
    )
  }

  if (game.state === null) {
    return (
      <div className="flex flex-col gap-3 p-6">
        <p
          role="alert"
          data-testid="error"
          className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {game.error ?? 'Игра не найдена. Выполните seed или сбросьте игру.'}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void game.reload()}
            disabled={game.busy}
            className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground disabled:opacity-50"
          >
            Обновить
          </button>
          <button
            type="button"
            data-testid="reset-game"
            onClick={() => setShowResetConfirm(true)}
            disabled={game.busy}
            className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            Новая игра
          </button>
        </div>
      </div>
    )
  }

  if (showResetConfirm) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="w-full max-w-md space-y-6 rounded-lg border border-border bg-panel p-8 text-center shadow-lg">
          <h2 className="text-2xl font-semibold text-foreground">Начать новую игру?</h2>
          <p className="text-sm text-muted-foreground">
            Текущий прогресс, улучшения и история доставок будут удалены.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowResetConfirm(false)}
              className="flex-1 rounded-md border border-border bg-secondary px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={() => {
                setShowResetConfirm(false)
                void game.reset()
              }}
              className="flex-1 rounded-md bg-danger px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-danger/90"
            >
              Начать новую игру
            </button>
          </div>
        </div>
      </div>
    )
  }

  const { state } = game
  const isFinished = state.session.status !== 'active'
  const deliveryInProgress = state.activeDeliveries.length > 0

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background">
      <TopBar
        session={state.session}
        tab={tab}
        onTabChange={setTab}
        busy={game.busy}
        isFinished={isFinished}
        deliveryInProgress={deliveryInProgress}
        onEndDay={() => void game.endDay()}
        onReset={() => setShowResetConfirm(true)}
        onReload={() => void game.reload()}
      />

      {tab === 'operations' ? (
        <OperationsScreen state={state} game={game} />
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          <BaseShop
            rovers={state.rovers}
            currentDay={state.session.currentDay}
            unlockDay={ENGINEERING_BAY_UNLOCK_DAY}
            balanceCredits={state.session.balanceCredits}
            earnedCredits={state.session.earnedCredits}
            busy={game.busy}
            lastPurchase={game.lastPurchase}
            recentPurchases={game.recentPurchases}
            lastCharge={game.lastCharge}
            onPurchase={(roverId, upgradeType) =>
              void game.purchaseUpgrade(roverId, upgradeType)
            }
            onDismissPurchase={game.clearPurchaseNotice}
            onCharge={(roverId, mode) => void game.chargeRover(roverId, mode)}
            onDismissCharge={game.clearChargeNotice}
          />
        </div>
      )}
    </div>
  )
}
