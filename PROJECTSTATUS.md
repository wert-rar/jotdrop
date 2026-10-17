# PROJECTSTATUS

## Current goals
- 2026-10-18: ИСПРАВЛЕНО и ПРОВЕРЕНО в живом Obsidian (a440e0b установлен, Obsidian перезапущен в 01:30 без отладочного порта): перенос больше не перенумеровывает всю группу и не держит очередь. src/customizations.js: rankWindow даёт новый номер только перенесённой карточке, а соседям — лишь когда они не оставляют места (нет номера, равные номера, исчерпана точность); полная перенумерация осталась только для первого переноса после другой сортировки. moveCard применяет drop сразу (applyCardMove), запись идёт отдельной цепочкой (saveCardMove); render откладывается, пока есть несохранённые переносы (pendingMoves).
- 2026-10-18 00:35: ПОЙМАН лаг в живом Obsidian на f499f43 (запись CDP, work/logs/peek-record.json). Причина лага — очередь переносов: один drop выполнил полную перенумерацию группы (src/customizations.js: ranksValid → changed = group) и записал 98 заметок за 2,8 с; следующий drop ждал в orderQueue (moveCard) 1,7 с. Ветка существует с 7dbebb7 (01.10), есть в d42e0d0, b1acced и f499f43; срабатывает, только когда номера jotdrop_order в группе в памяти не строго возрастают или пусты. Какая заметка была испорчена и откуда — НЕ установлено: на диске номера в 23:3x и после перезаписи корректны, обычный разреженный перенос их испортить не может. Кандидат — Syncthing (заметки синхронизируются с ПК wertrar ND4PG4H и Pixel; конфликты 17.10 14:55), не проверен. Следующий шаг: прочитать снимки File Recovery (включён) до 00:35 через отладочный порт.
- 2026-10-17 23:10: по просьбе пользователя перенос возвращён на системный (Windows/HTML5) drag-and-drop — f499f43 откатывает 1bc2b3b, остальные улучшения ветки сохранены. Установлено во второй машине. Ранее пользователь подтвердил, что pointer-перенос 1bc2b3b не зависал; на нативном переносе возможен возврат зависаний (модальный цикл ОС). Ветка не запушена в main.
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
- Установленный источник: f499f43 на ветке codex/drag-filter-wip-20261016, на базе live origin/main b1accedbdde4e3916c0656326a56a5e577e7c048. На этой машине npm нет: шаги deploy:local (verify:deploy, verify:base, tsc, esbuild, копирование) выполнены вручную через node из ~/.cache/codex-runtimes; без push и релизного тега.
- Плагин: C:/Users/zhigu/Documents/Obsidian/.obsidian/plugins/jotdrop (вторая машина; первая — C:/Users/zhigu/GitHub/Obsidian, там стоит 1bc2b3b), manifest 0.20.5. Бэкап перед f499f43 (там стоял b1acced): work/backups/jotdrop-before-native-drag-2026-10-17-2310. Лог: work/logs/install-native-drag.log; SHA256 совпадают, data.json не изменился.
- Перенос карточек: нативный HTML5 drag-and-drop (draggable вне режима выделения); render откладывается на весь dragstart → dragend. Pointer-вариант остаётся в истории (1bc2b3b).

## Main files changed
- src/main.ts, src/view.ts, src/customizations.js: события, адресный кэш, DOM и жизненный цикл Markdown-компонентов.
- src/edit.ts, src/capture.ts, src/settings.ts: адресные причины обновлений.
- scripts/check-board-updates.cjs, scripts/check-fork-browser.cjs, scripts/probe-plugin-performance.cjs, package.json: регрессии и измерения.
- docs/plugin-performance-audit.md, PROJECTSTATUS.md, work-reports/2026-10-17-1542.md: итоговая документация. Предыдущие локальные отчёты 1457 и 1507 сохранены.
- work-reports/2026-10-17-1554.md: локальная установка и проверка файлов.

## Testing and verification results
- PASS живой Obsidian a440e0b (work/live-drag-verify.cjs: настоящие перетаскивания системной мышью через SendInput, CDP): 4 переноса при подставленном в памяти повторе номера (старое правило переписало бы все 112 незакреплённых) — по 1 записи, drop через 12–14 мс после отпускания, применение 15–22 мс, запись 63–186 мс; ещё 4 переноса без подстановки — так же. Исходные jotdrop_order/pinned и раскладка восстановлены, расхождений 0 (work/logs/live-verify-*.json).
- RED на f499f43: «a move between free neighbours writes only the dragged note…» — 8 записей (work/logs/rank-red.log). RED очереди (временно возвращённое ожидание записей): второй drop не применён (work/logs/queue-red.log).
- PASS с исправлением: tsc, esbuild, полный check:fork — 69 board, Markdown, 187 browser (10 новых), 22 tag, 250 retention, 14+3 drag-refresh, 7 drag-window (work/logs/rank-check-fork.log).
- Журнал запусков %APPDATA%/obsidian/obsidian.log: Obsidian перезапускался 17.10 в 23:29 (после установки f499f43 в 23:10), поэтому жалоба «лаги сохранились» относилась к f499f43, а не к старому коду в памяти.
- Живые записи без лага: f499f43 55 переносов (max dragend 56 мс), b1acced 50 переносов (max 128 мс); performCardMove max 200 мс, полных перезаписей не было.
- PASS живой Obsidian f499f43: work/obsidian-drag-record.cjs (CDP 127.0.0.1:9222 + опрос физической кнопки мыши), логи work/logs/obsidian-record-2026-10-17T20-56-30-001Z.json, trace-window-472.txt. Четыре нажатия без dragstart в 472–475 с — обычные click (render 228/74 мс), не перенос. Один перенос отменён: отпущен над view-content вне сетки, drop не принят.
- PASS Edge с настоящим системным циклом (SendInput, work/os-drag-bench.cjs): маленькие/высокие карточки и маленький drag image — drop через 5–8 мс.
- PASS f499f43: verify:deploy + verify:base, tsc, esbuild production; --drag-refresh (14 + 3 native), --drag-window (7). Логи: work/logs/native-drag-build.log, native-drag-refresh.log, native-drag-window.log. Полный check:fork и живой Obsidian NOT RUN.
- PASS 1bc2b3b: npm run build, полный check:fork (179 browser, 19 drag-refresh, 7 drag-window, реальные мышиные переносы Playwright), git diff --check. Стенд на реальных текстах Grail: 8 переносов, попадание в колонку, long tasks нет. Логи: work/logs/pointer-build.log, pointer-check.log. Установка: work/logs/install-pointer-drag-2026-10-17-1815.log, SHA256 совпадают, data.json не изменился. Пользователь подтвердил в живом Obsidian: перенос быстрый, зависаний нет. Touch/Android NOT RUN.
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
