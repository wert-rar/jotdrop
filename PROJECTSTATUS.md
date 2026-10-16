# PROJECTSTATUS

## Current goals
- По просьбе пользователя кандидат d42e0d0 установлен для проверки; исследование сохранено в codex/drag-filter-wip-20261016.
- Перенос после работы над фильтрами остаётся нерешённым: [DRAG_FILTER_PROBLEM.md](DRAG_FILTER_PROBLEM.md).
- Ветка codex/drag-filter-wip-20261016 опубликована в origin для продолжения на другом устройстве; tracking настроен. Начать с docs/drag-filter-regression-research.md.
- Latest session report: [2026-10-16-1639](work-reports/2026-10-16-1639.md).

## Completed tasks still relevant to the current phase
- Есть меню ручного порядка/создания/изменения и фильтры тегов с сохранением DOM; совпадающие чтения объединяются.
- Предыдущие защиты от refresh и обработка drop в зазорах пользовательский симптом не устранили.
- Новый тест воспроизвёл исчезновение карточки из окна 60/121 после переноса в пустую колонку и фильтрации, а также игнорирование ручных колонок при дозагрузке. Кандидат проходит обе проверки.
- Native probe воспроизвёл зависание при render после dragstart: DOM источника удалён, drop отсутствует. Отсрочка refresh до dragend только в стенде позволяет завершить перенос.

## Key technical decisions
- Canonical AgentMemory scope: wert-rar/jotdrop. MCP недоступен; recall/save невозможны.
- Проверенный origin/main: c634354dfaa51bf07cd4c38f57532cb67888cce7. Исходный HEAD сессии: 84c6196066871ac4dad5dccb1557b2162ad27916.
- Пустая колонка сохраняет позицию в своей группе; смена закрепления использует загруженную часть целевой группы. Дозагрузка сразу учитывает сохранённые колонки.
- Установлен чистый коммит d42e0d0d3450db3819eccfd6a5eb8ed565cdba4c через deploy:local. 3/3 assets совпадают; data.json при установке неизменён. Backup: work/backups/jotdrop-before-window-fix-2026-10-16.
- Runtime после установки не изменялся. Новая защита до drop существует только как причинный эксперимент в probe; кандидат d42e0d0 её не содержит.
- Интеграция main/upstream отложена. Обоснование порядка: docs/upstream-update-assessment.md.

## Main files changed
- src/customizations.js: положение при переносе в пустую колонку.
- src/view.ts: сохранённая ручная колонка при добавлении карточки.
- scripts/check-fork-browser.cjs, package.json: --drag-window, 7 проверок, включён в check:fork.
- DRAG_FILTER_PROBLEM.md, PROJECTSTATUS.md, work-reports/2026-10-16-1622.md: нерешённая проблема и продолжение.
- scripts/probe-drag-filter.cjs, docs/drag-filter-regression-research.md: наблюдаемые native-сценарии, история изменений, доказательства и ограничения.

## Testing and verification results
- PASSED: gated npm run build; полный npm run check:fork (Markdown, 177 browser integration, native mouse, 22 tag, 250 retention, 9 drag/refresh, 7 drag/window); git diff --check.
- RED перед правками: исчезновение после фильтра и неверные колонки дозагрузки. Логи work/logs/drag-window-before.log и drag-window-columns-before.log.
- PASSED в текущей сессии: verify:deploy/gated build, 3/3 hashes до/после установки, неизменность data.json при установке; node --check, git diff --check.
- Native control/deferred: trusted start/drop/end, колонка 1, состояние очищено. Active refresh: sourceConnected=false, только trusted start, зависание до таймлимита 12 с. Sort/load: 120 уникальных карточек, 0 нарушений порядка.
- Полный check:fork повторно NOT RUN: runtime не изменялся после успешного набора предыдущей сессии. Подтверждение пользователя в Obsidian ожидается; Android NOT RUN.
- PASSED при передаче: git push -u origin codex/drag-filter-wip-20261016; удалённый HEAD исходников 355472e16ceac6127c628a6893bc42d18c705739 совпал с локальным. В этой сессии меняются только документы; тесты повторно NOT RUN.

## Known issues
- Пользователь подтверждает зависание переноса после работы над фильтрами; полная причина ещё не установлена.
- Подтверждён механизм refresh во время drag; его срабатывание в пользовательском Obsidian ещё не зафиксировано. Guard по reordering закрывает только период после drop.
- UI/отладчик Obsidian недоступны; CLI выключен, пользователь не хочет его настраивать.
- AgentMemory недоступен.

## Approaches already tried but unsuccessful
- Исправления гонки refresh и зон drop не устранили пользовательский симптом.
- Проверка всех 121 карточек сразу и успешной записи пропускала отображение в окне из 60.

## Ordered next development steps
1. Получить результат проверки установленного d42e0d0. Читать docs/drag-filter-regression-research.md.
2. Если симптом остаётся, защитить весь dragstart → dragend, включая завершение ранее начатого чтения и отмену без drop; подтвердить native-регрессиями до следующей установки.
3. Затем решать интеграцию main и upstream; при восстановлении AgentMemory сохранить результаты.
