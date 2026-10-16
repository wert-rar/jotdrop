# PROJECTSTATUS

## Current goals
- Реализовано согласованное поведение фильтров: сохранять колонки и сдвигать вверх только карточки под скрытой. Проверить новую установленную сборку в живом Obsidian.
- Latest session report: [2026-10-16-1117](work-reports/2026-10-16-1117.md).

## Completed tasks still relevant to the current phase
- Видимость тегов, Show all / Hide all, Untagged и окно остальных тегов сохраняются.
- Фильтрация сохраняет DOM, Markdown-компоненты и колонки; скрытые карточки возвращаются на прежнее место.
- Отключена повторная балансировка при фильтрации; дозагруженные карточки и прокрутка при неприменимом теге сохраняются.
- При изменении файлов/настроек сохранённые данные инвалидируются; при обычном обновлении/закрытии компоненты очищаются.
- Установлена проверенная сборка из `a4bfb22b4475d5b456b4f1669da7acc102958597` штатным deploy:local. Резервная копия: `C:\Users\zhigu\GitHub\jotdrop\work\backups\jotdrop-before-stable-columns-2026-10-16-1117`; настройки не изменены.

## Key technical decisions
- Ветка `codex/tag-visibility`, база `origin/main` `c634354dfaa51bf07cd4c38f57532cb67888cce7`; Android не изменён.
- Любой исключённый тег скрывает заметку. Фильтры временные, в пределах view.
- Повторное использование снимка требует совпадения cardsVersion; сохранение колонок — также прежнего количества колонок.
- Отсоединённые карточки сохраняются до обновления данных/закрытия; повторно создавать Markdown при возврате тега не требуется.
- Canonical AgentMemory scope: `wert-rar/jotdrop`. MCP недоступен; recall/save не выполнены.

## Main files changed
- `src/view.ts`: сохранённые карточки/колонки, отдельный путь видимости, общее окно дозагрузки, очистка при закрытии.
- `src/customizations.js`: сохранение Markdown-компонентов и запрет балансировки при фильтрации.
- `scripts/check-fork-browser.cjs`, `package.json`: регрессионные проверки встроены в общий набор; необязательная read-only проверка локальных заметок без сети.
- `docs/tag-filter-exclusions.md`, `PROJECTSTATUS.md`, отчёт сессии.

## Testing and verification results
- PASSED: verify:base (fetch/SHA), npm run build (TypeScript/esbuild), git diff --check.
- PASSED: npm run check:fork — Markdown, 154 общие браузерные проверки, drag/drop, 18 проверок чтения, 250 проверок сохранения карточек/колонок/дозагрузки/очистки.
- PASSED: отдельная read-only проверка на 121 заметке Grail — 250 проверок, сохранены 59/59 прежних видимых карточек, создана 1 новая, 118 мс до отрисованного результата в стенде.
- До исправления: 0/59 сохранённых карточек, 60 повторных рендеров Markdown в искусственном наборе.
- PASSED: verify:deploy, gated-сборка, совпадение с проверенным bundle и 3/3 установленных файлов, data.json byte-for-byte не изменён.
- NOT RUN: новая сборка в живом Obsidian; стенд использует mock API, измерения не гарантируют скорость хост-приложения.
- Логи: work/logs/stable-columns-base.log, stable-columns-before.log, stable-columns-build.log, stable-columns-after.log, stable-columns-vault.log, stable-columns-full.log, stable-columns-deploy.log.

## Known issues
- Требуется перезагрузить JotDrop для загрузки новых файлов; отзывчивость в живом Obsidian пока не подтверждена.
- AgentMemory недоступен.

## Approaches already tried but unsuccessful
- Оптимизация только повторных чтений (2026-10-14) прошла короткий искусственный тест, но не устранила пользовательскую задержку после перезагрузки: карточки и сетка продолжали пересоздаваться.

## Ordered next development steps
1. Выключить и включить JotDrop в Obsidian; проверить один тег и возврат: колонки должны сохраняться, нижние карточки сдвигаться вверх.
2. Проверить переключение после прокрутки вниз и Hide all / Show all в реальной теме.
3. Если задержка сохранится, собрать профиль живого Obsidian; не объявлять её устранённой по одному стендовому времени.
4. Когда AgentMemory восстановится, сохранить решение в scope `wert-rar/jotdrop`.
