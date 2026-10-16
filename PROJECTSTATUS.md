# PROJECTSTATUS

## Current goals
- Ветка codex/drag-filter-wip-20261016: фильтры тегов, ручной порядок и исправления переноса. В main не слита.
- 2026-10-16: добавлена защита всего интервала dragstart → dragend от обновления доски; установлена в Obsidian для проверки пользователем.
- Подробная история проблемы: [DRAG_FILTER_PROBLEM.md](DRAG_FILTER_PROBLEM.md), [docs/drag-filter-regression-research.md](docs/drag-filter-regression-research.md).

## Completed tasks still relevant to the current phase
- Есть меню ручного порядка/создания/изменения и фильтры тегов с сохранением DOM; совпадающие чтения объединяются.
- Перенос в пустую колонку сохраняет позицию в своей группе; дозагрузка учитывает сохранённые ручные колонки (d42e0d0).
- Обновление доски во время переноса больше не удаляет перетаскиваемую карточку: render откладывается, пока задан draggedPath; чтение, начатое до dragstart, отбрасывается; отложенное обновление выполняет performCardMove после drop или обработчик dragend при отмене.

## Key technical decisions
- Проверенный origin/main: c634354dfaa51bf07cd4c38f57532cb67888cce7.
- Механизм зависания: render во время native drag очищает gridEl, исходный элемент отсоединяется, браузер не доставляет drop/dragend. Срабатывает только при совпадении обновления (изменение файла, refreshViews) с переносом, поэтому симптом нерегулярный.
- Профиль настоящего Obsidian 1.14.4 (через --remote-debugging-port=9222) без такого обновления: 4 переноса, 4 drop, длинных задач нет, кадры ≤ 50 мс. Лог: work/logs/obsidian-drag-summary.txt.
- Интеграция main/upstream отложена: docs/upstream-update-assessment.md.

## Main files changed
- src/customizations.js: guard render по draggedPath, сброс начатого чтения в dragstart, отложенный render в dragend.
- scripts/check-fork-browser.cjs: --drag-refresh дополнен 3 native-переносами (refresh после dragstart, чтение, завершившееся во время drag, отмена без drop) с таймаутом зависания 10 с.

## Testing and verification results
- RED без исправления: `node scripts/check-fork-browser.cjs --drag-refresh` → «native drag stalled: refresh» (work/logs/claude-drag-refresh-before.log).
- PASSED с исправлением: tsc; полный набор check:fork — Markdown, 177 browser integration, native mouse/gap/background, 22 tag, 250 retention, 9 drag/refresh + 3 native, 7 drag/window (work/logs/claude-check-fork.log).
- probe-drag-filter refresh-during-drag: trusted dragstart/drop/dragend, колонка 1.
- Android NOT RUN (не затронут).

## Known issues
- Подтверждение пользователя в Obsidian после установки защиты ожидается.
- Мобильный touch-перенос не реализован (FORK.md).

## Approaches already tried but unsuccessful
- Ранние исправления гонки refresh и зон drop защищали только период после drop.

## Ordered next development steps
1. Получить подтверждение пользователя, что перенос больше не зависает.
2. Решить слияние ветки в main и интеграцию upstream.
