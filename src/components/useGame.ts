'use client'

/**
 * Client state for the game screen.
 *
 * Deliberately plain React state (no Redux): the client keeps only the current
 * server snapshot plus UI selection. After every mutation the state is re-synced
 * from the server, so the client never becomes a second database.
 *
 * Game Design v2 vertical slice: an in-transit delivery drives a live countdown.
 * The client ticks a clock, and when the delivery's completion time is reached
 * it asks the server to resolve the outcome exactly once. Because the server is
 * idempotent, a refresh resumes the same countdown and never pays twice.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ActiveDeliveryDto,
  DeliveryPreviewDto,
  DeliveryResultDto,
  GameStateDto,
  PurchaseUpgradeResultDto,
} from '@/application/dto'
import type { UpgradeType } from '@/domain'
import {
  ApiError,
  chargeRoverRequest,
  completeDeliveryRequest,
  endDayRequest,
  fetchDeliveryPreview,
  fetchGameState,
  purchaseUpgradeRequest,
  resetGameRequest,
  startDeliveryRequest,
  type ChargeRoverResult,
} from '@/presentation/apiClient'

/** Stable empty reference so the countdown effect does not loop every tick. */
const EMPTY_ACTIVE_DELIVERIES: readonly ActiveDeliveryDto[] = []

function toMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return 'Неизвестная ошибка. Повторите попытку.'
}

function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `key-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
}

export type GameScreenState = {
  state: GameStateDto | null
  loading: boolean
  error: string | null
  selectedOrderId: string | null
  selectedRoverId: string | null
  preview: DeliveryPreviewDto | null
  previewLoading: boolean
  /**
   * One result per completed Delivery, keyed by deliveryId so simultaneously
   * finishing missions never overwrite each other. Newest last.
   */
  deliveryResults: readonly DeliveryResultDto[]
  busy: boolean
  earlyEndPending: boolean
  activeDeliveries: readonly ActiveDeliveryDto[]
  now: number
  /** Last successful upgrade purchase, for the confirmation banner. */
  lastPurchase: PurchaseUpgradeResultDto | null
  /** Up to three most recent purchases (newest first) for the bay history. */
  recentPurchases: readonly PurchaseUpgradeResultDto[]
  /** Last charge result, for the confirmation banner. */
  lastCharge: ChargeRoverResult | null
  selectOrder: (orderId: string) => void
  selectRover: (roverId: string) => void
  start: () => Promise<void>
  endDay: (confirmEarlyEnd?: boolean) => Promise<void>
  cancelEarlyEnd: () => void
  purchaseUpgrade: (roverId: string, upgradeType: UpgradeType) => Promise<void>
  clearPurchaseNotice: () => void
  chargeRover: (roverId: string, mode: 'quick' | 'full') => Promise<void>
  clearChargeNotice: () => void
  reset: () => Promise<void>
  reload: () => Promise<void>
}

export function useGame(): GameScreenState {
  const [state, setState] = useState<GameStateDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [selectedRoverId, setSelectedRoverId] = useState<string | null>(null)
  const [preview, setPreview] = useState<DeliveryPreviewDto | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  // Results keyed by deliveryId. A global lastResult would let one delivery's
  // outcome clobber another when several complete at once, so we keep them all.
  const [results, setResults] = useState<readonly DeliveryResultDto[]>([])
  const [busy, setBusy] = useState(false)
  const [earlyEndPending, setEarlyEndPending] = useState(false)
  const [now, setNow] = useState<number>(() => Date.now())
  const [lastPurchase, setLastPurchase] =
    useState<PurchaseUpgradeResultDto | null>(null)
  const [recentPurchases, setRecentPurchases] = useState<
    readonly PurchaseUpgradeResultDto[]
  >([])
  const [lastCharge, setLastCharge] = useState<ChargeRoverResult | null>(null)

  /** One key per delivery attempt; protects against double submits. */
  const idempotencyKeyRef = useRef<string>(createIdempotencyKey())
  /** Delivery ids whose completion has already been requested by this client. */
  const completingRef = useRef<Set<string>>(new Set())

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const next = await fetchGameState()
      setState(next)
      setError(null)
    } catch (caught) {
      setError(toMessage(caught))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  // Signature of the currently selected rover's live stats. When the player
  // charges or upgrades a rover the server state changes but the selection does
  // not, so the preview must also re-run whenever these numbers move — otherwise
  // a stale preview lingers until the rover is reselected.
  //
  // It must be built from the EFFECTIVE stats (`rover.stats`), not the base
  // fields: `capacity`, `speed` and `efficiency` on the DTO are the seeded base
  // values and never change, so a cargo/speed/efficiency upgrade left the
  // signature untouched and the preview kept showing the pre-upgrade
  // "Вес груза превышает грузоподъёмность" until the rover was reselected.
  const selectedRover =
    state?.rovers.find((rover) => rover.id === selectedRoverId) ?? null
  const selectedRoverSignature =
    selectedRover === null
      ? null
      : [
          selectedRover.batteryCharge,
          selectedRover.stats.batteryCapacity,
          selectedRover.stats.capacity,
          selectedRover.stats.efficiency,
          selectedRover.stats.speedMultiplier,
          selectedRover.stats.safetyRiskReduction,
          selectedRover.status,
        ].join('/')

  useEffect(() => {
    if (selectedOrderId === null || selectedRoverId === null) {
      setPreview(null)
      return
    }

    let cancelled = false
    setPreviewLoading(true)

    fetchDeliveryPreview({
      orderId: selectedOrderId,
      roverId: selectedRoverId,
    })
      .then((next) => {
        if (!cancelled) {
          setPreview(next)
          setError(null)
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setPreview(null)
          setError(toMessage(caught))
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })

    return () => {
      cancelled = true
    }
    // selectedRoverSignature re-runs the preview after a charge/upgrade.
  }, [selectedOrderId, selectedRoverId, selectedRoverSignature])

  const completeActive = useCallback(
    async (deliveryId: string): Promise<void> => {
      if (completingRef.current.has(deliveryId)) return
      completingRef.current.add(deliveryId)
      try {
        const result = await completeDeliveryRequest({ deliveryId })
        // Upsert by deliveryId: replace only this delivery's entry, keep the
        // rest, so parallel results stay side by side without mixing.
        setResults((prev) => [
          ...prev.filter((entry) => entry.deliveryId !== result.deliveryId),
          result,
        ])
        setError(null)
      } catch (caught) {
        setError(toMessage(caught))
      } finally {
        await reload()
      }
    },
    [reload],
  )

  const activeDeliveries = state?.activeDeliveries ?? EMPTY_ACTIVE_DELIVERIES

  // One shared clock drives the countdown and the marker for EVERY parallel
  // in-transit delivery. When a delivery reaches its server completesAt the
  // outcome is resolved on the server exactly once (requirements 4, 5, 8, 10).
  // A refresh rebuilds all of this from the persisted startedAt/completesAt, so
  // setTimeout is never the source of truth (requirements 6, 11, 12).
  //
  // The clock ticks on requestAnimationFrame rather than a 250 ms interval: the
  // marker position is interpolated from the server timestamps on every frame,
  // so the rover glides instead of jumping between polls. No request is sent per
  // frame — only the local clock advances. When the user prefers reduced motion
  // we fall back to a coarse interval, which keeps the countdown correct while
  // removing the continuous movement.
  useEffect(() => {
    if (activeDeliveries.length === 0) return

    const schedule = activeDeliveries.map((delivery) => ({
      deliveryId: delivery.deliveryId,
      completesAtMs: Date.parse(delivery.completesAt),
    }))

    const tick = (): void => {
      const current = Date.now()
      setNow(current)
      for (const { deliveryId, completesAtMs } of schedule) {
        if (current >= completesAtMs) {
          void completeActive(deliveryId)
        }
      }
    }

    const reduceMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    tick()

    if (reduceMotion) {
      const timer = window.setInterval(tick, 500)
      return () => {
        window.clearInterval(timer)
      }
    }

    let frame = 0
    const loop = (): void => {
      tick()
      frame = window.requestAnimationFrame(loop)
    }
    frame = window.requestAnimationFrame(loop)
    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [activeDeliveries, completeActive])

  const selectOrder = useCallback((orderId: string): void => {
    setSelectedOrderId((current) => (current === orderId ? null : orderId))
  }, [])

  const selectRover = useCallback((roverId: string): void => {
    setSelectedRoverId((current) => (current === roverId ? null : roverId))
  }, [])

  const start = useCallback(async (): Promise<void> => {
    if (selectedOrderId === null || selectedRoverId === null) return
    if (busy) return

    setBusy(true)
    try {
      await startDeliveryRequest({
        orderId: selectedOrderId,
        roverId: selectedRoverId,
        idempotencyKey: idempotencyKeyRef.current,
      })
      idempotencyKeyRef.current = createIdempotencyKey()
      setPreview(null)
      setSelectedOrderId(null)
      setSelectedRoverId(null)
      setError(null)
      await reload()
    } catch (caught) {
      setError(toMessage(caught))
    } finally {
      setBusy(false)
    }
  }, [busy, reload, selectedOrderId, selectedRoverId])

  const endDay = useCallback(
    async (confirmEarlyEnd = false): Promise<void> => {
      if (busy) return
      setBusy(true)
      try {
        await endDayRequest({ confirmEarlyEnd })
        setEarlyEndPending(false)
        setPreview(null)
        // A new day starts clean: previous deliveries' result cards are gone.
        setResults([])
        setError(null)
        await reload()
      } catch (caught) {
        // Requirement: ending the day early needs an explicit confirmation.
        // The server signals this with CONFIRMATION_REQUIRED; surface a prompt
        // instead of a plain error so the user can confirm the rating penalty.
        if (
          caught instanceof ApiError &&
          caught.code === 'CONFIRMATION_REQUIRED'
        ) {
          setEarlyEndPending(true)
        } else {
          setError(toMessage(caught))
        }
      } finally {
        setBusy(false)
      }
    },
    [busy, reload],
  )

  const cancelEarlyEnd = useCallback((): void => {
    setEarlyEndPending(false)
  }, [])

  const purchaseUpgrade = useCallback(
    async (roverId: string, upgradeType: UpgradeType): Promise<void> => {
      if (busy) return
      setBusy(true)
      try {
        const result = await purchaseUpgradeRequest({ roverId, upgradeType })
        // The server returns the recomputed state, so challenge availability and
        // every upgrade panel update without a second round-trip.
        setState(result.state)
        setLastPurchase(result)
        setRecentPurchases((prev) => [result, ...prev].slice(0, 3))
        setError(null)
      } catch (caught) {
        setError(toMessage(caught))
      } finally {
        setBusy(false)
      }
    },
    [busy],
  )

  const clearPurchaseNotice = useCallback((): void => {
    setLastPurchase(null)
  }, [])

  const chargeRover = useCallback(
    async (roverId: string, mode: 'quick' | 'full'): Promise<void> => {
      if (busy) return
      setBusy(true)
      try {
        const result = await chargeRoverRequest({ roverId, mode })
        setLastCharge(result)
        setError(null)
        await reload()
      } catch (caught) {
        setError(toMessage(caught))
      } finally {
        setBusy(false)
      }
    },
    [busy, reload],
  )

  const clearChargeNotice = useCallback((): void => {
    setLastCharge(null)
  }, [])

  const reset = useCallback(async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await resetGameRequest()
      idempotencyKeyRef.current = createIdempotencyKey()
      completingRef.current.clear()
      setSelectedOrderId(null)
      setSelectedRoverId(null)
      setPreview(null)
      setResults([])
      setEarlyEndPending(false)
      setLastPurchase(null)
      setRecentPurchases([])
      setLastCharge(null)
      setError(null)
      await reload()
    } catch (caught) {
      setError(toMessage(caught))
    } finally {
      setBusy(false)
    }
  }, [busy, reload])

  return {
    state,
    loading,
    error,
    selectedOrderId,
    selectedRoverId,
    preview,
    previewLoading,
    deliveryResults: results,
    busy,
    earlyEndPending,
    activeDeliveries,
    now,
    lastPurchase,
    recentPurchases,
    lastCharge,
    selectOrder,
    selectRover,
    start,
    endDay,
    cancelEarlyEnd,
    purchaseUpgrade,
    clearPurchaseNotice,
    chargeRover,
    clearChargeNotice,
    reset,
    reload,
  }
}
