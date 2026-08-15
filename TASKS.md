# TASKS

## Выполнено

- [x] Структура проекта и конфиги: TypeScript (strict + `noUncheckedIndexedAccess`), ESLint, Prettier, Tailwind, Vitest, Playwright, Next.js (security headers).
- [x] Prisma schema: `GameSession`, `Location`, `Rover`, `Order`, `Delivery`, `GameEvent`; unique `Delivery.idempotencyKey`, индексы, cascade.
- [x] Ручная SQL-миграция `prisma/migrations/20260813000000_init`.
- [x] Idempotent seed: 6 локаций (plain/crater/dark), 3 ровера, 9 заказов, сессия 1/7, 500→4000 кредитов.
- [x] Domain layer: константы, типы + guard-функции, формулы, правила допуска, результат, завершение дня.
- [x] Application layer: порты, Zod-схемы, DTO, типизированные ошибки, use cases `getGameState`, `previewDelivery`, `startDelivery`, `endDay`, `resetGame`.
- [x] Infrastructure layer: Prisma-клиент (`server-only`), репозитории, `UnitOfWork`, серверная случайность, генерация id, DI-контейнер.
- [x] API: `GET /api/game`, `POST /api/deliveries/preview`, `POST /api/deliveries`, `POST /api/game/end-day`, `POST /api/game/reset` с единым форматом ошибок.
- [x] Минимальный доступный UI: строка состояния, списки заказов и роверов, блок миссии с авто-preview, причины блокировки, журнал событий, завершение дня, сброс, состояния loading/empty/error.
- [x] SVG-плейсхолдер карты: база, точки, подписи, выбранная точка и маршрут.
- [x] Unit-тесты на все 16 обязательных пунктов + интеграционный тест use case + Playwright-сценарий.
- [x] Документация: README, PROJECT_CONTEXT, docs/architecture, docs/game-rules, docs/security, docs/ai-usage, TASKS.

## Следующий этап

1. [x] `pnpm install` → зафиксировать `pnpm-lock.yaml` в репозитории.
2. [x] `pnpm prisma:generate` и `pnpm db:migrate` — убедиться, что ручная миграция соответствует schema.
3. [x] `pnpm db:seed` и повторный запуск — проверить отсутствие дубликатов.
4. [x] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` — исправить найденное.
5. [ ] `ALLOW_GAME_RESET=true pnpm e2e` (Playwright поднимает сервер на порту 3100; при первом запуске нужно `pnpm exec playwright install chromium`).
6. [x] `pnpm audit` — зафиксировать существенные результаты в `docs/security.md`.

## Технический долг

- [ ] Обновить зависимости по результатам audit: `next@15.5.21`, `eslint-config-next@15.5.21`, `vitest@3.2.6`, `@playwright/test@1.55.1`, `postcss@8.5.23`; после обновления перезапустить все проверки.
- [ ] Уязвимость `effect` тянется из CLI Prisma 6.13 и закрывается только переходом на Prisma 7 (мажор, breaking changes) — решение отложено осознанно.
- [ ] Перенести конфигурацию seed из `package.json#prisma` в `prisma.config.ts` (deprecated в Prisma 7).
- [ ] Скрипт `db:setup` переименован из `setup`, потому что `pnpm setup` — встроенная команда pnpm; проверить, что документация не расходится.

- [ ] CSP без `'unsafe-inline'`: nonce через middleware.
- [ ] Нет retry на `SQLITE_BUSY`: при конкурентном запуске клиент получит `INTERNAL_ERROR`.
- [ ] Статусы `delivering`, `charging`, `damaged` у роверов и `in_progress` у заказов поддержаны типами и правилами, но пока не используются сценарием (доставка завершается в тот же день).
- [ ] `Delivery.calculatedDuration` сохраняется, но не влияет на игровое время.
- [ ] Ошибки логируются через `console.error`; нужен структурный логгер.
- [ ] Нет тестов React-компонентов (покрытие UI — только e2e).
- [ ] Интеграционный тест использует in-memory репозитории; полезно добавить вариант на временном SQLite-файле.
- [ ] Нет CI-конфига.

## Визуальные задачи (отдельный этап)

- [ ] Финальный визуальный дизайн и типографика.
- [ ] Реальная карта Луны: рельеф зон, легенда, hover/focus состояния точек.
- [ ] Анимация движения ровера и результата доставки.
- [ ] Скелетоны вместо текстового «Загрузка…», toast-уведомления вместо баннера ошибок.
- [ ] Мобильная раскладка и проверка контрастности (WCAG AA).

## Финальная проверка перед сдачей

- [ ] `pnpm lint` — без ошибок.
- [ ] `pnpm typecheck` — без ошибок.
- [ ] `pnpm test` — все тесты зелёные.
- [ ] `pnpm build` — сборка проходит.
- [ ] `ALLOW_GAME_RESET=true pnpm e2e` — сценарий проходит.
- [ ] `pnpm audit` — результаты задокументированы.
- [ ] В репозитории нет `.env` и `*.db`.
- [ ] Демонстрационный сценарий из README пройдён вручную.


---

## Game Design v2 — Итерация 1 (выполнено в этом патче)

- [x] Разделить `credits` на `balanceCredits` и `earnedCredits`; победа по
      `earnedCredits`.
- [x] Разделить `battery` на `batteryCharge` и `batteryCapacity`.
- [x] Добавить уровни улучшений ровера и `computeRoverStats` (RoverStats).
- [x] Перевести расчёты доставки на `RoverStats`.
- [x] Добавить причины `INSUFFICIENT_CHARGE` и `ROUTE_EXCEEDS_CAPACITY`.
- [x] Сменить срочность на `normal | urgent | critical` (DTO — легаси).
- [x] Добавить доставке `status`, `startedAt`, `completesAt`, nullable `result`.
- [x] Сохранить обратную совместимость API/UI через DTO.
- [ ] Сгенерировать миграцию Prisma локально (`pnpm db:migrate`).
- [ ] Реализовать UI улучшений роверов и переход `in_transit -> completed`
      (следующие итерации).
