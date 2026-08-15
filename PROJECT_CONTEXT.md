# PROJECT_CONTEXT

Файл для передачи проекта новой AI-сессии или новому разработчику. Читать первым.

## 1. Цель проекта

«Moon Courier Crisis» — основа тестового задания для вакансии Full-stack разработчика (Junior+/Middle). Небольшая стратегическая игра про доставку грузов на Луне. Цель кода — продемонстрировать архитектуру, безопасность серверной части, детерминированную игровую логику, качественные типы и тесты. Визуальный дизайн сознательно минимален и будет добавлен отдельным этапом.

## 2. Текущее состояние

Реализовано:

- Prisma schema (6 моделей) + SQL-миграция `prisma/migrations/20260813000000_init`.
- Idempotent seed: 6 локаций, 3 ровера, 9 заказов, сессия `session-local`.
- Domain layer: константы, типы и guard-функции, чистые формулы, правила допуска, разрешение результата, завершение дня.
- Application layer: порты, DTO, Zod-схемы, типизированные ошибки, 5 use cases.
- Infrastructure layer: Prisma-клиент (`server-only`), репозитории, транзакции, серверная случайность, генерация id, DI-контейнер.
- Presentation layer: 5 Route Handlers, минимальный доступный UI, SVG-плейсхолдер карты.
- Тесты: unit (16 обязательных правил), интеграционный тест use case на in-memory репозиториях, один Playwright-сценарий.
- Документация: README, docs/architecture, docs/game-rules, docs/security, docs/ai-usage, TASKS.

Не сделано: прогон Playwright, обновление зависимостей по результатам `pnpm audit`, финальный визуальный дизайн, CI.

## 3. Архитектурные границы

```
app/ components/ presentation/   (Presentation)
            ↓
   application/ (+ services/)     (Use cases, DTO, Zod, ошибки, порты)
            ↓                ↑ реализация портов
        domain/               infrastructure/
```

Правила направления импортов:

- `domain/` не импортирует ничего из проекта, кроме `domain/`. Никаких React, Prisma, Next.js, `Math.random`, `Date.now`.
- `application/` импортирует `domain/` и свои порты. Prisma здесь запрещена.
- `infrastructure/` реализует порты `application/ports.ts`. Только здесь есть `@prisma/client` (проверяется правилом ESLint).
- `app/`, `components/`, `presentation/` не содержат игровых правил: только ввод/вывод, валидация через готовые схемы и вызов сервисов.

## 4. Принятые решения (и почему)

1. **Enum-ы как TEXT.** SQLite не поддерживает enum в Prisma; значения хранятся строками и валидируются guard-функциями в `domain/types.ts` и Zod-схемами при чтении строк (`infrastructure/mappers.ts`).
2. **`Location` → `MoonLocation`.** Имя `Location` конфликтует с DOM-глобалью, поэтому доменный тип переименован.
3. **Повтор `idempotencyKey` = replay, а не ошибка.** Повторный запрос возвращает сохранённый результат с `replayed: true` и HTTP 200; награда не начисляется второй раз. Так двойной клик безопасен для клиента.
4. **Случайность за портом `RandomSource`.** Сервер использует `node:crypto.randomInt`, тесты — фиксированные значения. Domain-функция принимает `roll` числом.
5. **In-memory репозитории в интеграционном тесте.** Реальный SQLite-файл сделал бы тест хрупким (миграции, параллельные запуски). Транзакция эмулируется снимком состояния с откатом.
6. **Доставка завершается в тот же день.** `duration` информационный, ровер сразу `idle`. Так основной сценарий проверяем без симуляции времени.
7. **Один фиксированный `sessionId`** (`session-local`) — нет пользователей, значит нет и выбора сессии.
8. **`resetGame` под флагом `ALLOW_GAME_RESET`.** Деструктивное действие не должно быть доступно по умолчанию.
9. **Preview информационный.** Финальный запуск полностью пересчитывает всё внутри транзакции.

## 5. Неизменяемые игровые правила

Менять формулы можно только вместе с тестами и `docs/game-rules.md`:

```
batteryCost = ceil((distance * batteryModifier + weight * 0.25) / efficiency)
duration    = ceil(distance / (speed * speedModifier))
risk        = clamp(round(baseRisk + riskBonus + (weight / capacity) * 10), 0, 90)
```

- Награда начисляется только при `result === 'success'` и только один раз.
- Батарея всегда в диапазоне 0–100, риск — 0–90, рейтинг — 0–100.
- Доставка блокируется по семи причинам из `DELIVERY_BLOCK_REASONS`.
- Победа: `credits >= targetCredits`. Поражение: `rating < minimumRating` или `currentDay > maxDays`. Приоритет: рейтинг → победа → дни.
- Клиент присылает только `orderId`, `roverId`, `idempotencyKey`.

## 6. Команды

```bash
pnpm install
pnpm db:setup       # generate + migrate + seed
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e              # требует ALLOW_GAME_RESET=true
pnpm audit
```

## 7. Важные файлы

| Файл | Зачем |
| --- | --- |
| `src/domain/calculations.ts` | формулы расхода, длительности, риска |
| `src/domain/rules.ts` | причины блокировки запуска |
| `src/domain/outcome.ts` | результат доставки, эффекты, победа/поражение |
| `src/domain/endDay.ts` | завершение дня |
| `src/application/services/startDelivery.ts` | транзакция запуска (14 шагов) |
| `src/application/ports.ts` | контракт инфраструктуры |
| `src/application/errors.ts` | коды и HTTP-статусы публичных ошибок |
| `src/infrastructure/repositories.ts` | Prisma-репозитории |
| `src/infrastructure/container.ts` | сборка зависимостей для Route Handlers |
| `prisma/seedData.ts` | детерминированные начальные данные |
| `tests/support/inMemoryRepositories.ts` | фейковая инфраструктура для тестов |

## 8. Известные ограничения

- Проверки `typecheck`, `lint`, `test`, `build` пройдены локально 13.08.2026; `pnpm audit` — 41 уязвимость в зависимостях (см. `docs/security.md`); e2e ещё не прогонялся.
- SQLite: один писатель, параллельные запуски могут упасть с блокировкой.
- Нет аутентификации и авторизации, эндпоинт сброса защищён только переменной окружения.
- CSP использует `'unsafe-inline'` для стилей.
- Playwright-тест требует запущенного сервера с `ALLOW_GAME_RESET=true` (в `playwright.config.ts` настроен `webServer` на порт 3100).

## 9. Правила безопасного внесения изменений

1. Сначала тест, потом изменение правила. Формулы и правила меняются только в `domain/`.
2. Не переносить бизнес-логику в компоненты, Route Handlers или репозитории.
3. Не импортировать `@prisma/client` вне `src/infrastructure` и `prisma/`.
4. Любой новый вход — только через Zod-схему в `application/schemas.ts`.
5. Любая новая публичная ошибка — новый код в `APP_ERROR_CODES` с HTTP-статусом и русским сообщением.
6. Не возвращать клиенту исключения инфраструктуры; неизвестные ошибки → `INTERNAL_ERROR`.
7. Запрещены `any`, `@ts-ignore`, пустые `catch`, отключение ESLint ради зелёной сборки.
8. После изменения schema.prisma — новая миграция, а не правка существующей.
9. Обновлять `docs/` и `TASKS.md` вместе с кодом.

## 10. Следующие этапы

1. `pnpm install` → зафиксировать `pnpm-lock.yaml` → запустить все проверки и исправить найденное.
2. Визуальный дизайн (отдельный этап), реальная карта, состояния загрузки.
3. Многодневные доставки и статус `delivering` во времени.
4. Переход на PostgreSQL + оптимистичные блокировки.
5. CI-пайплайн и (при необходимости) аутентификация.


---

## Game Design v2 — Итерация 1

Первая итерация Game Design v2 меняет доменную модель: разделение
кредитов (`balanceCredits`/`earnedCredits`) и батареи
(`batteryCharge`/`batteryCapacity`), уровни улучшений роверов и `RoverStats`,
новые причины отказа `INSUFFICIENT_CHARGE` / `ROUTE_EXCEEDS_CAPACITY`,
срочность `normal | urgent | critical`, статусы доставки. API и UI
сохраняют временную обратную совместимость через DTO-слой.
Подробности — в `docs/game-rules.md` и `docs/architecture.md`.
