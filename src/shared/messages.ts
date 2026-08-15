/**
 * User-facing Russian labels.
 *
 * This module is intentionally dependency-free so that it can be imported both
 * by server code (error payloads) and by client components (rendering).
 */

import type {
  DeliveryBlockReason,
  DeliveryStatus,
  OrderStatus,
  RoverStatus,
  SessionStatus,
  ZoneType,
} from '@/domain/types'
import type { RatingState } from '@/domain/outcome'
import type { UpgradeType } from '@/domain/constants'
import type { UpgradeBlockReason } from '@/domain/upgrades'
import type { ChargeBlockReason, ChargeMode } from '@/domain/charging'

export const BLOCK_REASON_MESSAGES: Record<DeliveryBlockReason, string> = {
  SESSION_FINISHED: 'Игра уже завершена',
  ORDER_NOT_AVAILABLE: 'Заказ недоступен для доставки',
  ROVER_NOT_IDLE: 'Ровер сейчас не готов к выезду',
  CAPACITY_EXCEEDED: 'Вес груза превышает грузоподъёмность ровера',
  ROUTE_EXCEEDS_CAPACITY:
    'Маршрут требует больше заряда, чем вмещает батарея ровера',
  INSUFFICIENT_CHARGE: 'Недостаточно текущего заряда для этого маршрута',
  DEADLINE_PASSED: 'Срок доставки уже истёк',
  DUPLICATE_REQUEST: 'Эта доставка уже была запущена',
  OPERATION_LIMIT_REACHED: 'Достигнут дневной лимит операций (3 за день)',
}

export const UPGRADE_LABELS: Record<UpgradeType, string> = {
  battery: 'Усиленная батарея',
  cargo: 'Грузовая платформа',
  efficiency: 'Энергоэффективный привод',
  safety: 'Система безопасности',
  speed: 'Улучшенный двигатель',
}

/** Label of the effective characteristic each upgrade changes. */
export const UPGRADE_STAT_LABELS: Record<UpgradeType, string> = {
  battery: 'Ёмкость',
  cargo: 'Грузоподъёмность',
  efficiency: 'Эффективность',
  safety: 'Снижение риска',
  speed: 'Множитель времени',
}

/** Unit suffix shown after each upgrade's characteristic value. */
export const UPGRADE_STAT_UNITS: Record<UpgradeType, string> = {
  battery: 'ед.',
  cargo: 'кг',
  efficiency: '',
  safety: 'п.п.',
  speed: '×',
}

export const UPGRADE_BLOCK_REASON_MESSAGES: Record<UpgradeBlockReason, string> = {
  SESSION_FINISHED: 'Игра уже завершена',
  BAY_LOCKED: 'Магазин базы откроется на втором дне',
  ROVER_BUSY: 'Нельзя улучшать ровер во время доставки',
  MAX_LEVEL: 'Достигнут максимальный уровень улучшения',
  INSUFFICIENT_FUNDS: 'Недостаточно кредитов для покупки',
}

/** Names of the two charging services offered by the base shop. */
export const CHARGE_MODE_LABELS: Record<ChargeMode, string> = {
  quick: 'Быстрая зарядка',
  full: 'Полная зарядка',
}

export const CHARGE_BLOCK_REASON_MESSAGES: Record<ChargeBlockReason, string> = {
  SESSION_FINISHED: 'Игра уже завершена',
  ROVER_BUSY: 'Заряжать можно только ровер на базе',
  BATTERY_FULL: 'Батарея заряжена полностью',
  INSUFFICIENT_FUNDS: 'Недостаточно кредитов для зарядки',
}

export const ZONE_LABELS: Record<ZoneType, string> = {
  plain: 'Равнина',
  crater: 'Кратер',
  dark: 'Темная зона',
}

// Game Design v2 renamed the internal urgency values, but the DTO layer still
// exposes the legacy values (low | medium | critical) for backward
// compatibility, so these labels stay keyed by the legacy DTO values.
export const DTO_ORDER_URGENCIES = ['low', 'medium', 'critical'] as const
export type DtoOrderUrgency = (typeof DTO_ORDER_URGENCIES)[number]

export const URGENCY_LABELS: Record<DtoOrderUrgency, string> = {
  low: 'Обычный',
  medium: 'Средний',
  critical: 'Критичный',
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  available: 'Доступен',
  in_progress: 'В работе',
  completed: 'Выполнен',
  failed: 'Провален',
  expired: 'Просрочен',
}

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  in_transit: 'В пути',
  completed: 'Выполнена',
  failed: 'Провалена',
}

export const ROVER_STATUS_LABELS: Record<RoverStatus, string> = {
  idle: 'Готов',
  delivering: 'В рейсе',
  charging: 'На зарядке',
  damaged: 'Повреждён',
}

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  active: 'Игра идёт',
  won: 'Победа',
  lost: 'Поражение',
}

/**
 * UI band of the base rating (see `ratingState` in the domain):
 * - stable: 70–100;
 * - at_risk: minimumRating–69;
 * - lost: below minimumRating.
 */
export const BASE_STATE_LABELS: Record<RatingState, string> = {
  stable: 'База стабильна',
  at_risk: 'База под угрозой',
  lost: 'Эвакуация базы',
}
