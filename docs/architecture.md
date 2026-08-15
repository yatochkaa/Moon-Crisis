# Архитектура

## Слои

### 1. Domain (`src/domain`)

Чистая игровая логика без зависимостей от фреймворков.

| Файл | Содержимое |
| --- | --- |
| `constants.ts` | все игровые числа (никаких magic numbers в логике) |
| `types.ts` | сущности, enum-массивы и guard-функции |
| `math.ts` | `clamp`, `ceilToInt`, `roundToInt` |
| `errors.ts` | `DomainInvariantError`, проверки инвариантов |
| `calculations.ts` | расход батареи, длительность, риск, полный estimate |
| `rules.ts` | причины, по которым доставка невозможна |
| `outcome.ts` | результат по `roll`, эффекты доставки, победа/поражение |
| `endDay.ts` | завершение дня: просрочки, штрафы рейтинга, подзарядка |

Запрещено: React, Prisma, Next.js, `fetch`, `Math.random`, `Date.now`, чтение окружения. Функции детерминированы: одинаковый вход → одинаковый выход.

### 2. Application (`src/application`)

Сценарии использования и координация.

| Файл | Содержимое |
| --- | --- |
| `ports.ts` | интерфейсы `GameRepositories`, `UnitOfWork`, `RandomSource`, `IdGenerator` |
| `schemas.ts` | Zod-схемы входных данных (`strict`) |
| `dto.ts` | DTO и мапперы domain → DTO |
| `errors.ts` | `AppError`, коды, HTTP-статусы, русские сообщения |
| `gameDefaults.ts` | детерминированная стартовая конфигурация |
| `services/getGameState.ts` | состояние игры для UI |
| `services/previewDelivery.ts` | информационный расчёт |
| `services/startDelivery.ts` | транзакционный запуск доставки |
| `services/endDay.ts` | завершение дня |
| `services/resetGame.ts` | сброс тестовой сессии (под флагом) |

Слой не знает про Prisma, HTTP и React: он работает с портами и получает зависимости параметром `ServiceDeps`.

### 3. Infrastructure (`src/infrastructure`)

Реализация портов.

| Файл | Содержимое |
| --- | --- |
| `prisma.ts` | singleton Prisma Client, `import 'server-only'` |
| `mappers.ts` | Zod-разбор строк БД в доменные типы (TEXT → enum) |
| `repositories.ts` | репозиторий-функции поверх Prisma |
| `unitOfWork.ts` | транзакция через `prisma.$transaction` |
| `random.ts` | серверная случайность (`node:crypto.randomInt`) + фиксированный источник |
| `ids.ts` | генерация идентификаторов |
| `container.ts` | сборка `ServiceDeps`, флаг разрешения сброса |

### 4. Presentation (`src/app`, `src/components`, `src/presentation`)

| Файл | Содержимое |
| --- | --- |
| `app/api/**/route.ts` | Route Handlers |
| `presentation/http.ts` | чтение JSON, ответы, преобразование ошибок |
| `presentation/apiClient.ts` | типизированный клиентский fetch |
| `components/*` | минимальный доступный UI |
| `components/useGame.ts` | клиентское состояние (обычный React state) |
| `shared/messages.ts` | русские подписи и сообщения |

## Направление зависимостей

```
Presentation ──▶ Application ──▶ Domain
                     ▲
                     │ (реализует порты)
               Infrastructure
```

Внутренние слои ничего не знают о внешних. Инфраструктура подставляется в сервисы через `ServiceDeps`, поэтому тесты заменяют её in-memory реализацией без моков модулей.

Контроль соблюдения:

- ESLint-правило `no-restricted-imports` запрещает `@prisma/client` вне `src/infrastructure/**` и `prisma/**`;
- `import 'server-only'` в `infrastructure/prisma.ts` ломает сборку при попытке импортировать Prisma в client-компонент;
- `domain/` физически не содержит импортов вне себя.

## Схема запроса: запуск доставки

```
Браузер (кнопка «Запустить доставку», disabled при busy)
  │  POST /api/deliveries { orderId, roverId, idempotencyKey }
  ▼
Route Handler src/app/api/deliveries/route.ts
  │ 1. readJsonBody
  │ 2. startDeliverySchema.parse (Zod, strict)
  │ 3. getServiceDeps()
  │ 4. startDelivery(deps, input)
  ▼
Application service startDelivery (внутри uow.transaction)
  │ перезагрузка session/order/rover/location
  │ проверка idempotencyKey (replay → сохранённый результат)
  │ calculateDeliveryEstimate  ─────▶ Domain
  │ evaluateDeliveryEligibility ────▶ Domain
  │ random.nextFloat() → resolveDeliveryResult ─▶ Domain
  │ applyDeliveryEffects ───────────▶ Domain
  │ createDelivery / updateRover / updateOrderStatus /
  │ updateSession / createEvent ────▶ Infrastructure (Prisma)
  ▼
DTO (DeliveryResultDto)
  │  HTTP 201 (новая доставка) или 200 (replay)
  ▼
Браузер: показывает результат и перезапрашивает GET /api/game
```

Ошибка на любом шаге → `AppError` → единый JSON `{ error: { code, message, details } }` и откат транзакции.

## Почему такая архитектура

- **Проверяемость.** Все правила — чистые функции; тесты не поднимают базу и не мокают модули.
- **Безопасность.** Клиент присылает три идентификатора; всё остальное сервер берёт из базы. Prisma не может попасть в клиентский бандл.
- **Заменяемость хранилища.** Переход на PostgreSQL затрагивает `infrastructure/` и `schema.prisma`, но не domain и application.
- **Читаемость для ревью.** По имени файла видно, где искать формулу, правило, запрос или разметку.
- **Соразмерность.** Никаких лишних абстракций: репозитории — простые функции, состояние клиента — обычный React state, транзакция — `prisma.$transaction`.


---

## Game Design v2 — Итерация 1 (заметки по архитектуре)

### Новый порт: Clock
- В `ServiceDeps` добавлен порт `clock: Clock` (`now(): Date`).
- Прод-реализация — `createSystemClock` в `src/infrastructure/clock.ts`.
- Тесты используют `createFixedClock` из
  `tests/support/inMemoryRepositories.ts`, поэтому `startedAt`/`completesAt`
  детерминированы.
- Доменный слой остаётся чистым: время приходит только из приложения.

### Слой DTO как граница совместимости
- Доменная модель переименована (`balanceCredits`/`earnedCredits`,
  `batteryCharge`/`batteryCapacity`, новая срочность), но контракты API/UI
  пока не меняются.
- `src/application/dto.ts` отображает старые имена на новые:
  - `SessionDto.credits = balanceCredits` (+ новые `balanceCredits`,
    `earnedCredits`);
  - `RoverDto.battery = batteryCharge` (+ `batteryCharge`, `batteryCapacity`,
    уровни улучшений и `stats: RoverStats`);
  - `OrderDto.urgency` — легаси-значения через `URGENCY_TO_DTO`.
- Презентационные компоненты (`StatusBar`, `RoverList`, `OrderList`) не
  меняются и продолжают читать `credits`, `battery`, `urgency`.

### Инфраструктура
- `mappers.ts` и `repositories.ts` работают с новыми колонками; строки
  по-прежнему валидируются Zod-схемами перед превращением в доменные
  объекты.
- Изменение `prisma/schema.prisma` требует ручной генерации миграции
  (`pnpm db:migrate`) — миграция намеренно не входит в патч.
