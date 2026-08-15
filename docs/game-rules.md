# Игровые правила

Все правила реализованы чистыми функциями в `src/domain` и покрыты unit-тестами в `tests/unit`.

## Единицы измерения

| Величина | Единица | Диапазон |
| --- | --- | --- |
| `distance` | километры | > 0 |
| `weight`, `capacity` | килограммы | ≥ 0 / > 0 |
| `battery` | проценты заряда | 0–100 (целое) |
| `batteryCost` | проценты заряда | целое, ≥ 0 |
| `duration` | часы | целое, ≥ 1 |
| `risk`, `baseRisk`, `riskBonus` | процентные пункты | итоговый риск 0–90 (целое) |
| `reward`, `credits` | кредиты | целое |
| `rating` | пункты | 0–100 |
| `currentDay`, `deadlineDay` | номер игрового дня | 1..`maxDays` |

Модификаторы (`batteryModifier`, `speedModifier`, `efficiency`) — безразмерные множители.

## Формулы и округление

```
baseDistanceCost = distance * location.batteryModifier          // дробное
cargoCost        = order.weight * CARGO_BATTERY_COST_PER_KG     // 0.25 за кг
batteryCost      = ceil((baseDistanceCost + cargoCost) / rover.efficiency)

duration         = ceil(distance / (rover.speed * location.speedModifier))

loadRatio        = order.weight / rover.capacity
risk             = clamp(round(order.baseRisk + location.riskBonus
                              + loadRatio * LOAD_RATIO_RISK_WEIGHT), 0, 90)
```

Округление:

- `batteryCost` — **ceil** (вверх): расход не должен быть недооценён;
- `duration` — **ceil** (вверх): неполный час считается полным;
- `risk` — **round** (к ближайшему целому), затем **clamp** в 0–90.

Константы (`src/domain/constants.ts`):

| Константа | Значение | Смысл |
| --- | --- | --- |
| `CARGO_BATTERY_COST_PER_KG` | 0.25 | расход батареи на килограмм |
| `LOAD_RATIO_RISK_WEIGHT` | 10 | вклад загрузки в риск |
| `MIN_RISK_PERCENT` / `MAX_RISK_PERCENT` | 0 / 90 | границы риска |
| `MIN_BATTERY` / `MAX_BATTERY` | 0 / 100 | границы заряда |
| `MIN_RATING` / `MAX_RATING` | 0 / 100 | границы рейтинга |
| `RATING_GAIN_ON_SUCCESS` | +2 | рейтинг за успех |
| `RATING_LOSS_ON_FAILURE` | −12 | рейтинг за провал |
| `RATING_LOSS_ON_EXPIRED_ORDER` | −5 | за просроченный заказ |
| `RATING_LOSS_ON_EXPIRED_CRITICAL_ORDER` | −10 | за просроченный критический заказ |
| `BATTERY_RECHARGE_PER_DAY` | +40 | подзарядка за ночь |
| `RECENT_EVENTS_LIMIT` | 12 | сколько событий показывает UI |

## Когда доставка невозможна

`evaluateDeliveryEligibility` возвращает все причины сразу, в стабильном порядке:

| Код | Условие |
| --- | --- |
| `SESSION_FINISHED` | `session.status !== 'active'` |
| `ORDER_NOT_AVAILABLE` | `order.status !== 'available'` |
| `ROVER_NOT_IDLE` | `rover.status !== 'idle'` |
| `CAPACITY_EXCEEDED` | `order.weight > rover.capacity` |
| `INSUFFICIENT_BATTERY` | `batteryCost > rover.battery` |
| `DEADLINE_PASSED` | `order.deadlineDay < session.currentDay` |
| `DUPLICATE_REQUEST` | `idempotencyKey` уже использован |

Отсутствующие сущности — отдельные ошибки `ORDER_NOT_FOUND`, `ROVER_NOT_FOUND`, `LOCATION_NOT_FOUND`, `GAME_NOT_FOUND`.

В день дедлайна доставка ещё возможна: `deadlineDay == currentDay` допустимо.

## Результат доставки

```
resolveDeliveryResult(risk, roll):
  threshold = clamp(risk, 0, 90) / 100
  return roll < threshold ? 'failed' : 'success'
```

`roll` — число в `[0, 1)`, которое передаёт вызывающий код. Сервер получает его из `RandomSource` (`node:crypto.randomInt`), тесты подставляют фиксированные значения. Domain-функция не обращается к `Math.random`, поэтому логика полностью детерминирована и проверяема.

Эффекты (`applyDeliveryEffects`):

- `battery = clamp(battery - batteryCost, 0, 100)` — отрицательный заряд невозможен;
- при успехе: `credits += reward` (**один раз**), заказ → `completed`, рейтинг +2;
- при неудаче: кредиты не меняются, заказ → `failed`, рейтинг −12;
- ровер возвращается в `idle` (доставка укладывается в тот же игровой день; `duration` информационный).

## Завершение дня

1. `currentDay + 1`.
2. Заказы со статусом `available` и `deadlineDay < nextDay` получают статус `expired`.
3. Рейтинг снижается: −5 за обычный просроченный заказ, −10 за критический.
4. Роверы в статусе `idle` или `charging` получают +40 заряда (не выше 100).
5. Пересчитывается статус сессии.

## Победа и поражение

```
evaluateSessionStatus:
  rating  < minimumRating   → 'lost'
  credits >= targetCredits  → 'won'
  currentDay > maxDays      → 'lost'
  иначе                     → 'active'
```

Приоритет намеренный: обвал рейтинга сильнее достигнутой цели. Стартовые значения новой кампании: рейтинг 100, минимум 40.

Состояния рейтинга (UI-полоса, логику победы/поражения определяет только `minimumRating`):

- 70–100 — «База стабильна»;
- 40–69 — «База под угрозой»;
- 0–39 — поражение, «Эвакуация базы».

Граничные условия: `rating = 40` — сессия остаётся `active`; `rating = 39` — сессия становится `lost`. Новое значение `minimumRating` применяется только к новой игре («Новая игра» / seed); уже сохранённая сессия сохраняет свой `minimumRating`.

## Хранение enum-значений

SQLite (через Prisma) не поддерживает нативные enum, поэтому `status`, `zoneType`, `urgency`, `result` и `type` хранятся как TEXT. Допустимые значения задаются массивами в `src/domain/types.ts`, проверяются guard-функциями и Zod-схемами при чтении строк из базы (`src/infrastructure/mappers.ts`). Некорректное значение в базе приводит к контролируемой ошибке, а не к «тихому» неверному поведению.


---

## Game Design v2 — Итерация 1 (обратная совместимость DTO)

Эта итерация меняет доменную модель. API и UI временно сохраняют старые
имена полей через DTO-слой (см. `docs/architecture.md`).

### Кредиты
- `credits` разделены на два поля сессии:
  - `balanceCredits` — текущий баланс (старт 500), тратится на улучшения;
  - `earnedCredits` — суммарно заработано за игру (старт 0), только растёт
    при успешной доставке.
- Победа теперь определяется по `earnedCredits >= targetCredits` (4000).

### Батарея
- `battery` разделена на:
  - `batteryCharge` — текущий заряд;
  - `batteryCapacity` — базовая максимальная ёмкость.
- Ограничения расхода считаются по эффективной ёмкости из `RoverStats`.

### Улучшения ровера и RoverStats
- У ровера появились целочисленные уровни `capacityLevel`, `speedLevel`,
  `efficiencyLevel`, `batteryLevel` (по умолчанию 0).
- Эффективные характеристики считает `computeRoverStats`:
  `эффективное = базовое * (1 + max(0, уровень) * ROVER_UPGRADE_STEP)`,
  где `ROVER_UPGRADE_STEP = 0.25`. При уровне 0 эффективное равно базовому.
- Все расчёты доставки (расход, длительность, риск, вместимость) используют
  `RoverStats`, а не «сырые» поля ровера.

### Причины отказа
- `INSUFFICIENT_BATTERY` заменена на `INSUFFICIENT_CHARGE`
  (`стоимость > batteryCharge`).
- Добавлена `ROUTE_EXCEEDS_CAPACITY` (`стоимость > batteryCapacity`).
- `CAPACITY_EXCEEDED` по-прежнему про вес груза (`вес > capacity`).
- Причины взаимоисключающие в порядке: вес → ёмкость батареи → текущий заряд.

### Срочность заказов
- Внутренняя шкала теперь `normal | urgent | critical`.
- DTO отдаёт легаси-значения `low | medium | critical` для совместимости UI.

### Жизненный цикл доставки
- У доставки появились `status` (`in_transit | completed | failed`),
  `startedAt`, `completesAt` и `result` (nullable).
- В этой итерации доставка сразу переходит в терминальный статус
  (`completed`/`failed`), `result` заполняется, `startedAt = clock.now()`,
  `completesAt = startedAt + длительность_в_часах`.

### Полный жизненный цикл доставки (симуляция полёта)

Теперь доставка действительно длится во времени: `startDelivery` создаёт запись
со статусом `in_transit`, списывает батарею один раз и **не** начисляет награду;
результат резолвится ровно один раз в `completeDelivery` после возвращения.

- Окно симуляции (в секундах) считает доменная функция
  `calculateSimulationSeconds` и покрывает **полный рейс туда-обратно**
  (база → станция → база):
  ```
  simulationSeconds = clamp(ceil(calculatedDurationHours * 4 * 0.8 ** speedLevel), 8, 40)
  ```
  где `SIMULATION_SECONDS_PER_HOUR = 4`, `SPEED_MULTIPLIER_BASE = 0.8`,
  `MIN_SIMULATION_SECONDS = 8`, `MAX_SIMULATION_SECONDS = 40`. Прокачка скорости
  (`speedLevel`) сокращает окно.
- `completesAt = startedAt + simulationSeconds` (в мс). Таймер и положение
  маркера — производные только от серверных `startedAt`/`completesAt`; `setTimeout`
  не является источником истины и переживает перезагрузку страницы.
- Первая половина окна — движение база → станция, вторая половина — возвращение
  станция → база. Результат показывается и ровер возвращается в `idle` только
  после возвращения.
- Разные свободные роверы выполняют доставки параллельно; один ровер не может
  вести две доставки одновременно. Награда и расход батареи применяются один раз.

---

## Ежедневная генерация заказов и лимит операций

Вся логика генерации живёт в чистом модуле `src/domain/orderGeneration.ts`
и покрыта `tests/unit/orderGeneration.test.ts`. Сервисы
(`resetGame`, `endDay`, `startDelivery`) только вызывают эти функции.

### Создание заказов
- При `reset` создаётся `ORDERS_PER_DAY = 4` заказа первого дня.
- В начале каждого нового дня (`endDay`) создаётся ещё 4 заказа, но
  не больше, чем позволяет потолок `MAX_ACTIVE_ORDERS = 6` активных
  заказов (`available` или `in_progress`) одновременно.
- Генерация детерминирована по `sessionSeed + day + slot`
  (`createSlotRng`): после обновления страницы заказы не меняются.
  ID заказа — `order-d{day}-s{slot}`.
- Каждый день гарантирует минимум 2 выполнимых заказа и не более 1
  заказа, требующего улучшения (`isOrderFeasible` проверяет текущий
  парк роверов той же математикой батареи/грузоподъёмности).
- Сложность и награды растут с номером дня (дальние зоны, больший
  вес и риск).

### Срок жизни заказа (`ORDER_LIFETIME_DAYS`)
| Срочность | Живёт дней | `deadlineDay` |
| --- | --- | --- |
| `critical` | 1 | `day` |
| `urgent` | 2 | `day + 1` |
| `normal` | 3 | `day + 2` |

Просроченные заказы получают статус `expired` при завершении дня и
уходят из активного списка.

### Формула награды (`calculateOrderReward`)
Награда выводится из `distance`, `weight`, `urgency` и `risk`, а не
выбирается независимым случайным числом:

```
base        = distance * REWARD_PER_KM + weight * REWARD_PER_KG   // 9 / км, 7 / кг
urgencyMult = REWARD_URGENCY_MULTIPLIER[urgency]                  // 1 / 1.25 / 1.6
riskMult    = 1 + (risk / 100) * REWARD_RISK_WEIGHT              // REWARD_RISK_WEIGHT = 1
dayMult     = 1 + (day - 1) * REWARD_DAY_GROWTH                  // REWARD_DAY_GROWTH = 0.15
reward      = round(base * urgencyMult * riskMult * dayMult)
```

Здесь `risk` — базовый риск маршрута (`baseRisk + location.riskBonus`,
clamp 0..90). Фактический риск доставки зависит ещё и от ровера.

### Лимит операций и завершение дня
- За день можно запустить максимум `MAX_OPERATIONS_PER_DAY = 3`
  доставки. Счётчик `session.operationsToday` растёт при старте
  доставки; провальная доставка тоже считается операцией
  (счётчик увеличивается на старте, до известного результата).
  При попытке превысить лимит старт блокируется причиной
  `OPERATION_LIMIT_REACHED`.
- Пока активна хотя бы одна доставка (`in_transit`), день завершить
  нельзя: `endDay` отклоняется ошибкой `DELIVERY_IN_PROGRESS`.
- Если за день выполнено меньше 3 операций, завершение дня
  возможно только с явным подтверждением. Без подтверждения
  `endDay` возвращает `CONFIRMATION_REQUIRED`; с `confirmEarlyEnd = true`
  день завершается со штрафом рейтинга
  `EARLY_END_RATING_PENALTY = 10`.
- `operationsToday` сбрасывается в 0 в начале каждого нового дня.

### Минимальный UI
Показываются только: «Операции сегодня: N/3»; срок заказа (дедлайн);
подтверждение досрочного завершения; активные заказы без
`completed/failed/expired`. Визуальный редизайн, покупка улучшений и
события дня в этой итерации не реализуются.
