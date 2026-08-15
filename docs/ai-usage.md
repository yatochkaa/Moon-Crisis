# Применение AI

## Что сгенерировано с помощью AI

Практически вся кодовая база создана AI по детальному техническому заданию:

- `prisma/schema.prisma`, ручная SQL-миграция `20260813000000_init`, seed и seed-данные;
- весь `src/domain` (формулы, правила, результат, завершение дня);
- весь `src/application` (порты, DTO, Zod-схемы, ошибки, 5 use cases);
- весь `src/infrastructure` (Prisma-клиент, репозитории, транзакции, случайность, id);
- Route Handlers, минимальный UI и SVG-плейсхолдер карты;
- unit- и интеграционные тесты, Playwright-сценарий;
- конфиги (TypeScript, ESLint, Prettier, Tailwind, Vitest, Playwright, Next.js) и вся документация.

Архитектурные решения (границы слоёв, решение с replay для `idempotencyKey`, порт `RandomSource`, in-memory репозитории вместо тестовой БД) принимались осознанно и зафиксированы в `PROJECT_CONTEXT.md`.

## Что проверено вручную (чтением кода, без запуска)

- Направление импортов: в `src/domain` нет React/Prisma/Next.js; `@prisma/client` встречается только в `src/infrastructure` и `prisma/`.
- Формулы сличены с техзаданием посимвольно (включая `0.25`, `* 10`, `clamp(0, 90)` и `ceil`).
- Цепочка запуска доставки: все 14 шагов находятся внутри `uow.transaction`.
- Клиентские запросы: в `apiClient.ts` отправляются только три разрешённых поля.
- Формат ошибок: единственный путь формирования ответа — `toErrorResponse`, неизвестные ошибки → `INTERNAL_ERROR`.
- Нет `any`, `@ts-ignore`, пустых `catch`, `dangerouslySetInnerHTML`, raw SQL.
- Доступность UI: все интерактивные элементы — нативные `button` с `aria-pressed`/`disabled`; статусы дублируются текстом, а не только цветом.

## Что НЕ было проверено запуском

Проект генерировался без доступа к реестру npm, поэтому все проверки выполнял пользователь локально 13.08.2026 (Node 24.18.0, pnpm 10.13.1). **Пройдено**: `prisma generate`, `prisma migrate deploy`, seed, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm audit`, `pnpm test` (после исправления теста откáта транзакции). **Не запускалось**: `pnpm exec playwright test`.

Значит, следующее требует первоочередной проверки человеком:

1. Совместимость закреплённых версий пакетов друг с другом и с вашей версией Node.js.
2. Соответствие ручной SQL-миграции и `schema.prisma` (проверяется командой `pnpm db:migrate`).
3. Результаты `pnpm typecheck` и `pnpm lint` (возможны мелкие правки типов/импортов).
4. Зелёные тесты `pnpm test` и e2e-сценарий.
5. Фактические результаты `pnpm audit`.

## Какие тесты подтверждают логику

| Требование | Где проверяется |
| --- | --- |
| 1. Тяжёлый заказ увеличивает расход батареи | `tests/unit/calculations.test.ts` |
| 2. Вес > capacity → отказ | `tests/unit/rules.test.ts`, `tests/integration/startDelivery.test.ts` |
| 3. Недостаточная батарея → отказ | `tests/unit/rules.test.ts` |
| 4. Занятый ровер → отказ | `tests/unit/rules.test.ts` |
| 5. Недоступный заказ → отказ | `tests/unit/rules.test.ts` |
| 6. Просроченный заказ → отказ | `tests/unit/rules.test.ts` |
| 7. Риск зависит от зоны | `tests/unit/calculations.test.ts` |
| 8. Риск в диапазоне 0–90 | `tests/unit/calculations.test.ts` |
| 9. Батарея не отрицательная | `tests/unit/outcome.test.ts` |
| 10. Награда начисляется ровно один раз | `tests/unit/outcome.test.ts`, `tests/integration/startDelivery.test.ts` |
| 11. Неудача не начисляет награду | `tests/unit/outcome.test.ts`, `tests/integration/startDelivery.test.ts` |
| 12. Повтор `idempotencyKey` не создаёт вторую доставку | `tests/unit/rules.test.ts`, `tests/integration/startDelivery.test.ts` |
| 13. Завершение дня помечает просроченные заказы | `tests/unit/endDay.test.ts`, `tests/integration/startDelivery.test.ts` |
| 14. Условие победы | `tests/unit/outcome.test.ts`, `tests/unit/endDay.test.ts` |
| 15. Условие поражения | `tests/unit/outcome.test.ts`, `tests/unit/endDay.test.ts` |
| 16. Случайный результат детерминирован | `tests/unit/outcome.test.ts` |
| Откат транзакции | `tests/integration/startDelivery.test.ts` |
| Основной сценарий в браузере | `e2e/game.spec.ts` |

## Какие решения нельзя принимать без проверки человеком

1. Изменение игровых формул и баланса (константы рейтинга, подзарядки, цели) — это продуктовое решение, не техническое.
2. Ослабление проверок идемпотентности или вынос шагов из транзакции.
3. Любое расширение входного контракта API (особенно поля, совпадающие с серверными расчётами).
4. Включение `ALLOW_GAME_RESET=true` в любой общедоступной среде.
5. Обновление мажорных версий зависимостей или `pnpm audit --fix` без проверки совместимости.
6. Смена субъекта безопасности (добавление аутентификации и прав) — требует ревью требований, а не автогенерации.
