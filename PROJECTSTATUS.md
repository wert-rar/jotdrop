# PROJECTSTATUS

## Current goals
- Устранена задержка переключения тегов; перезагрузить JotDrop и проверить отзывчивость в живом Obsidian.
- Latest session report: [2026-10-14-1439](work-reports/2026-10-14-1439.md).

## Completed tasks still relevant to the current phase
- Сохранены временные исключения тегов, Show all / Hide all, Untagged и окно остальных тегов.
- Переключение видимости использует уже загруженные карточки без повторного чтения всех заметок.
- Изменения файлов/настроек, включая чекбоксы без перерисовки, делают сохранённые данные неактуальными; следующее обновление перечитывает их.
- Перерисовка выполняется после получения данных; быстрые клики и фоновое чтение не дублируют карточки.
- Исправленная сборка установлена из `fb471f7fcc13d58cbc33c9bfc8234a6c5acbff85` штатным deploy:local. Резервная копия: `C:\Users\zhigu\GitHub\jotdrop\work\backups\jotdrop-before-tag-performance-2026-10-14-1439`. Данные пользователя не изменены.

## Key technical decisions
- Ветка `codex/tag-visibility`, проверенная база `origin/main` c634354dfaa51bf07cd4c38f57532cb67888cce7; Android не изменён.
- Достаточно одного исключённого тега, чтобы скрыть заметку. Состояние фильтра живёт в текущем view.
- `cardsVersion` меняется при событиях хранилища и настройках, включая подавленные события modify после локальных правок.
- Обычный `render()` обновляет данные; `render(true)` повторно использует только актуальный снимок.
- Canonical AgentMemory scope: `wert-rar/jotdrop`. MCP недоступен; recall/save не выполнены.

## Main files changed
- `src/view.ts`: повторное использование данных и отдельная синхронная перерисовка.
- `src/main.ts`: версия данных для инвалидирования сохранённого снимка.
- `src/customizations.js`: сохранение scroll/Markdown/masonry при новом порядке обновления.
- `scripts/check-fork-browser.cjs`: режим `--tag-performance`, задержанные чтения и проверки актуальности.
- `docs/tag-filter-exclusions.md`, `PROJECTSTATUS.md`, отчёт сессии.

## Testing and verification results
- PASSED: `npm run build` (verify:base, TypeScript, esbuild); `git diff --check`.
- PASSED: `node scripts/check-fork-browser.cjs --tag-performance` — 18 проверок; 160 искусственных заметок, переключение 9–16 мс, 0 повторных чтений при неизменных данных.
- До исправления тот же тест: 796 мс и 160 повторных чтений на один тег.
- PASSED: `npm run check:fork` — Markdown, 154 браузерные проверки и реальное перетаскивание мышью в стенде.
- PASSED: verify:deploy, повторная сборка, совпадение проверенного bundle, 3/3 установленных файлов и неизменность data.json.
- NOT RUN: проверка исправления в живом Obsidian; автоматическая перезагрузка недоступна в этой сессии.
- Логи: `work/logs/tag-performance-before.log`, `tag-performance-after.log`, `tag-performance-build.log`, `tag-performance-full.log`.

## Known issues
- Требуется перезапуск Obsidian или выключение/включение JotDrop для загрузки новой сборки.
- AgentMemory недоступен.

## Approaches already tried but unsuccessful
- Регрессионный тест до исправления воспроизвёл медленное повторное чтение; после исправления прошёл.

## Ordered next development steps
1. Перезагрузить JotDrop в Obsidian.
2. Проверить один тег, быстрые клики, обе кнопки глаза, Untagged и окно остальных тегов на реальных заметках.
3. При восстановлении AgentMemory сохранить результат в scope `wert-rar/jotdrop`.
