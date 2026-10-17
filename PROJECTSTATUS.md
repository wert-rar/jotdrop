# PROJECTSTATUS

## Current goals
- 2026-10-17 18:15: установлена 1bc2b3b — перенос карточек на pointer events вместо HTML5 drag-and-drop (системный цикл перетаскивания Windows держал окно Obsidian секундами; зависание воспроизвелось и на b1acced, то есть это не регрессия оптимизации). Пользователю: перезагрузить JotDrop и проверить перенос маленьких и больших (#Репетиторство) карточек, индикатор, позицию по верхнему краю, автопрокрутку, Esc.
- Включены 98dd3dc (слот по верхнему краю, индикатор стороны, отступ закреплённых +20 px) и 2087dd4 (анимация 80 мс). Временная трассировка 3baf80b откатана (e59498c); копия трассы: work/logs/drag-trace-3baf80b-2026-10-17.json.
- Latest session report: [2026-10-17-1705](work-reports/2026-10-17-1705.md).

## Completed tasks still relevant to the current phase
- Поиск использует кэш и сохраняет DOM; посторонние Markdown-события не обновляют доску; заметки и метаданные инвалидируются адресно.
- Обновление одной карточки сохраняет остальные DOM/Markdown-компоненты; удаление, rename и перемещение папок согласованы с кэшем.
- Сохранены фильтры, ручные колонки, сортировка, выделение и защита всего dragstart → dragend, включая незавершённое чтение и отмену без drop.
- Добавлены регрессии событий/двух представлений/асинхронных чтений и измерение порционной загрузки.
- Результаты и ограничения: [аудит производительности](docs/plugin-performance-audit.md).
- 2026-10-17: оптимизации закоммичены и установлены через deploy:local; SHA256 всех трёх установленных assets совпадают со сборкой.

## Key technical decisions
- Canonical AgentMemory scope: wert-rar/jotdrop. MCP повторно проверен и недоступен; recall/save не выполнялись.
- Кэш данных — на представление; общий cardsVersion защищает принятие результатов. Инвалидация передаётся сразу, обновления объединяются с задержкой 150 мс.
- Причины обновления: files, metadata, layout, assets, all. Формат настроек не изменён.
- Виртуализация и параллельное чтение отложены по выбору пользователя до реальных измерений.
- Установленный источник: 1bc2b3b на ветке codex/drag-filter-wip-20261016, на базе live origin/main b1accedbdde4e3916c0656326a56a5e577e7c048. Установка из чистого коммита через deploy:local, без push и релизного тега.
- Плагин: C:/Users/zhigu/GitHub/Obsidian/.obsidian/plugins/jotdrop, manifest 0.20.5. Бэкап перед 1bc2b3b (там стоял b1acced): work/backups/jotdrop-before-pointer-drag-2026-10-17-1815.
- Перенос карточек: pointer events (мышь/перо), порог 10 px = порог отмены долгого нажатия; touch по-прежнему прокручивает и выделяет долгим нажатием. Нативный draggable отключён, dragstart внутри карточки отменяется.

## Main files changed
- src/main.ts, src/view.ts, src/customizations.js: события, адресный кэш, DOM и жизненный цикл Markdown-компонентов.
- src/edit.ts, src/capture.ts, src/settings.ts: адресные причины обновлений.
- scripts/check-board-updates.cjs, scripts/check-fork-browser.cjs, scripts/probe-plugin-performance.cjs, package.json: регрессии и измерения.
- docs/plugin-performance-audit.md, PROJECTSTATUS.md, work-reports/2026-10-17-1542.md: итоговая документация. Предыдущие локальные отчёты 1457 и 1507 сохранены.
- work-reports/2026-10-17-1554.md: локальная установка и проверка файлов.

## Testing and verification results
- PASS 1bc2b3b: npm run build, полный check:fork (179 browser, 19 drag-refresh, 7 drag-window, реальные мышиные переносы Playwright), git diff --check. Стенд на реальных текстах Grail: 8 переносов, попадание в колонку, long tasks нет. Логи: work/logs/pointer-build.log, pointer-check.log. Установка: work/logs/install-pointer-drag-2026-10-17-1815.log, SHA256 совпадают, data.json не изменился. Живой Obsidian агентом NOT RUN.
- PASS 98dd3dc: npm run build, полный check:fork (drag-refresh 14 проверок, новая регрессия высокой карточки RED на старом коде: work/logs/slot-red.log). Логи: work/logs/slot-build.log, slot-check.log.
- PASS установка 3baf80b: deploy:local, SHA256 трёх assets совпадают, data.json не изменился. Бэкап: work/backups/jotdrop-before-slot-trace-2026-10-17-1742. Лог: work/logs/install-slot-trace-2026-10-17-1742.log. Трассировка в живом Obsidian не проверялась.
- PASS при установке 2087dd4: deploy:local (verify:deploy и gated build); SHA256 main.js/manifest.json/styles.css совпадают со сборкой; data.json не изменился. Бэкап: work/backups/jotdrop-before-anim80-2026-10-17-1724. Лог: work/logs/install-anim80-2026-10-17-1724.log.
- PASS (17:1x, анимация 80 мс): npm run build с source gate, полный npm run check:fork. Логи: work/logs/anim80-build.log, anim80-check.log. Живой Obsidian NOT RUN.
- PASS: финальная npm run build с source gate; полный npm run check:fork (69 новых, 177 общих browser checks, Markdown, 22 tag, 250 retention, 9 drag-refresh, 7 drag-window и native drag).
- PASS: 21 performance assertions. На 1000 заметках поиск: 0 cachedRead / 0 Markdown-рендеров; изменение одной видимой заметки: 1 / 1, сохранены 59 из 60 DOM; дозагрузка: 0 чтений.
- PASS: git diff --check перед итоговой документацией. Логи: work/logs/board-final-build.log, board-final-check.log, board-performance-final.json.
- PASS при установке: deploy:local (verify:deploy и gated build), SHA256 main.js/manifest.json/styles.css, корректный JSON настроек. Лог: work/logs/install-optimization-2026-10-17-1552.log.
- FAILED: проверка неизменности data.json — checksum изменился после контрольного замера; файл валиден, время изменения 15:53:35 Moscow. Установщик записывает только три assets, причина изменения настроек не установлена; настройки не восстанавливались и не перезаписывались агентом.
- NOT RUN: живой Obsidian, heap в байтах, Android и релиз. Полные тесты при установке не повторялись: production-код после успешного прогона не менялся. Значения производительности относятся к synthetic fixture.

## Known issues
- Бэкап work/backups/jotdrop-before-optimization-2026-10-17-1552 НЕ является сборкой b1acced (main.js и styles.css отличаются от чистой сборки b1acced); это сборка, установленная в 14:58.
- Зависание 3–4 с при переносе (и лаг больших карточек) воспроизводилось на нативном drag-and-drop, включая b1acced; устранение pointer-переносом ещё не подтверждено пользователем в Obsidian.
- В Grail есть файлы sync-conflict от Syncthing (14:55) — они тоже отображаются на доске.
- Причина жалобы на залипание/лаги drag в 31178a7 (до 17:00 2026-10-17) не установлена; симптом не воспроизводится в стенде и, по словам пользователя, пропал.
- Первое открытие по-прежнему последовательно читает все заметки; скрытые загруженные карточки удерживаются до перестройки/закрытия. Утечка не установлена.
- Вложения продолжают инициировать обновление представления без чтения текстов; адресное обновление отдельных зависимых вложений не реализовывалось.
- Новые файлы установлены, но агент не перезагружал плагин и не проверял поведение в настоящем Obsidian. data.json менялся параллельно подготовке/установке; точная причина не установлена.
- Мобильный touch-перенос не реализован (FORK.md). AgentMemory MCP недоступен.

## Approaches already tried but unsuccessful
- Поиск через render() повторно читал все заметки; заменён использованием актуального снимка.
- В тестовом адаптере TFile сначала создавался заново при каждом require и нарушал instanceof; исправлен стабильным классом.
- Первый полный прогон остановился на старом глобальном счётчике refresh; проверка ограничена интервалом drag. Последующие полные проверки прошли.
- При введении кэша найдено сохранение pin/rank после удаления frontmatter; закреплено падающим тестом и исправлено.
- Ранние исправления переноса защищали только период после drop; действующая защита покрывает весь drag.

## Ordered next development steps
1. Перезагрузить JotDrop в Obsidian; убедиться, что настройки соответствуют ожидаемым.
2. Проверить поиск, checkbox, архивирование, сортировку и перенос в Obsidian.
3. Измерить реальное открытие, прокрутку и память; затем решать о виртуализации/параллельном чтении.
