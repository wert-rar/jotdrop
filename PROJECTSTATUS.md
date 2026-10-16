# PROJECTSTATUS

## Current goals
- По просьбе пользователя отладка остановлена, работа сохранена в отдельную ветку codex/drag-filter-wip-20261016.
- Перенос после работы над фильтрами остаётся нерешённым: [DRAG_FILTER_PROBLEM.md](DRAG_FILTER_PROBLEM.md).
- Latest session report: [2026-10-16-1622](work-reports/2026-10-16-1622.md).

## Completed tasks still relevant to the current phase
- Есть меню ручного порядка/создания/изменения и фильтры тегов с сохранением DOM; совпадающие чтения объединяются.
- Предыдущие защиты от refresh и обработка drop в зазорах пользовательский симптом не устранили.
- Новый тест воспроизвёл исчезновение карточки из окна 60/121 после переноса в пустую колонку и фильтрации, а также игнорирование ручных колонок при дозагрузке. Кандидат проходит обе проверки.

## Key technical decisions
- Canonical AgentMemory scope: wert-rar/jotdrop. MCP недоступен; recall/save невозможны.
- Проверенный origin/main: c634354dfaa51bf07cd4c38f57532cb67888cce7. Исходный HEAD сессии: 84c6196066871ac4dad5dccb1557b2162ad27916.
- Пустая колонка сохраняет позицию в своей группе; смена закрепления использует загруженную часть целевой группы. Дозагрузка сразу учитывает сохранённые колонки.
- Кандидат не устанавливался. В хранилище остаётся 91adfdf; заметки и data.json не изменялись.
- Интеграция main/upstream отложена. Обоснование порядка: docs/upstream-update-assessment.md.

## Main files changed
- src/customizations.js: положение при переносе в пустую колонку.
- src/view.ts: сохранённая ручная колонка при добавлении карточки.
- scripts/check-fork-browser.cjs, package.json: --drag-window, 7 проверок, включён в check:fork.
- DRAG_FILTER_PROBLEM.md, PROJECTSTATUS.md, work-reports/2026-10-16-1622.md: нерешённая проблема и продолжение.

## Testing and verification results
- PASSED: gated npm run build; полный npm run check:fork (Markdown, 177 browser integration, native mouse, 22 tag, 250 retention, 9 drag/refresh, 7 drag/window); git diff --check.
- RED перед правками: исчезновение после фильтра и неверные колонки дозагрузки. Логи work/logs/drag-window-before.log и drag-window-columns-before.log.
- NOT RUN: новый кандидат в Obsidian, deploy:local, Android. Mock-тесты не подтверждают исправление пользовательского зависания.

## Known issues
- Пользователь подтверждает зависание переноса после работы над фильтрами; полная причина ещё не установлена.
- UI/отладчик Obsidian недоступны; CLI выключен, пользователь не хочет его настраивать.
- AgentMemory недоступен.

## Approaches already tried but unsuccessful
- Исправления гонки refresh и зон drop не устранили пользовательский симптом.
- Проверка всех 121 карточек сразу и успешной записи пропускала отображение в окне из 60.

## Ordered next development steps
1. Продолжить в codex/drag-filter-wip-20261016 с DRAG_FILTER_PROBLEM.md; воспроизвести оставшееся зависание на уровне видимого положения карточки.
2. После доказанного исправления отдельно установить чистый коммит через deploy:local и проверить в Obsidian.
3. Затем решать интеграцию main и upstream; при восстановлении AgentMemory сохранить результаты.
