# PROJECTSTATUS

## Current goals
- 2026-10-18: лаг переноса карточек ИСПРАВЛЕН и ПРОВЕРЕН в живом Obsidian (a440e0b, ветка codex/drag-filter-wip-20261016). Перенос — нативный drag-and-drop Windows/HTML5 (по выбору пользователя; pointer-вариант 1bc2b3b откатан в f499f43).
- Слияние ветки в main и интеграция upstream не выполнялись: docs/upstream-update-assessment.md.

## Completed tasks still relevant to the current phase
- a440e0b, src/customizations.js: `rankWindow` даёт новый jotdrop_order только перенесённой карточке, соседям — лишь если они не оставляют места (нет номера, равные номера, исчерпана точность). Полная перенумерация группы — только при первом переносе после другой сортировки. `moveCard` применяет drop сразу (`applyCardMove`), запись файлов идёт отдельной цепочкой (`saveCardMove`); render откладывается, пока есть несохранённые переносы (`pendingMoves`).
- b1acced: render откладывается на весь dragstart → dragend (защита от отрыва перетаскиваемой карточки).
- 31178a7: поиск по кэшу, адресные обновления карточек; 98dd3dc: слот по верхнему краю; 2087dd4: анимация 80 мс.

## Ошибки, которые нельзя повторять
Продукт:
- d42e0d0: render во время нативного переноса очищал сетку, перетаскиваемый элемент отрывался, drop не приходил («зависание после отпускания»). Исправлено в b1acced. Любой код, меняющий DOM карточек в обход обёртки render, вернёт эту ошибку.
- С 7dbebb7 (01.10) до a440e0b: если в группе где угодно был пустой или повторяющийся jotdrop_order, перенос переписывал ВСЮ группу (до 112 заметок, 2,8 с), а следующий drop ждал в orderQueue (1,7 с в живой записи 18.10 00:35). Лаг зависел от данных, а не от сборки, поэтому «то есть, то нет». Запись файлов никогда не должна держать очередь применения переносов.
- Почему номер в памяти был испорчен в 00:35 — НЕ установлено (на диске до и после всё корректно). Исправление не зависит от причины.

Расследование (мои ошибки 17–18.10):
- Объявил «виноват системный цикл перетаскивания Windows» и «Obsidian не перезапустили, работал старый код» без проверки. Оба вывода неверны. Перед выводом о загруженной сборке смотреть %APPDATA%/obsidian/obsidian.log («Loaded updated app» — время каждого запуска, UTC) и проверять в памяти признак сборки (например, наличие метода).
- Записал в AGENTS.md правило по неверному выводу — пользователь отклонил, откачено (939cf12).
- Зелёные тесты в стенде с mock и десятки чистых переносов не доказывают отсутствие лага: он включается состоянием данных. Ловить в живом Obsidian через CDP с записью числа записей файлов на каждый перенос.
- Снимки «Восстановления файлов» (не чаще 1 раза в 5 минут на файл) отстают от диска и не годятся для восстановления точных номеров.
- Ловушки, поставленные через CDP, живут только в памяти: перезапуск Obsidian их стирает. plugin.refreshViews() (kind all) перечитывает все карточки и снимает подмены в памяти.
- Задавал пользователю вопросы, когда он просил действовать самостоятельно. Делать проверки самому, не просить пользователя.

Окружение этой машины:
- npm нет. Node: ~/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin. Шаги deploy:local выполнять вручную: verify-release-source.mjs deploy и base, tsc, esbuild.config.mjs production, копирование трёх файлов с бэкапом и сверкой SHA256.
- В Bash-инструменте heredoc (`python - <<EOF`) зависает — писать скрипт в файл.
- Хранилище: C:/Users/zhigu/Documents/Obsidian. Syncthing (это устройство — wertrar, ND4PG4H) синхронизирует заметки только с Pixel 9 Pro XL; .obsidian исключена. Путь C:/Users/zhigu/GitHub/Obsidian из прежних записей на этой машине отсутствует.
- Живая проверка: Obsidian с --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1, затем обычный перезапуск. Масштаб интерфейса Obsidian 0,913, системный 1,25 (devicePixelRatio 1,1411). Окно поднимать через require('@electron/remote').getCurrentWindow().setAlwaysOnTop. Липкая панель JotDrop закрывает верхние карточки — брать точки через elementFromPoint. Большую трассу CDP писать потоком, не JSON.stringify.
- Скрипты: work/live-drag-verify.cjs (переносы SendInput с восстановлением номеров и раскладки), work/obsidian-drag-record.cjs, work/os-mouse.ps1, work/os-drag-bench.cjs (каталог work игнорируется Git).

## Key technical decisions
- Установлено: a440e0b в C:/Users/zhigu/Documents/Obsidian/.obsidian/plugins/jotdrop (main.js SHA256 110ec15a…), manifest 0.20.5; Obsidian перезапущен 18.10 в 01:30 без отладочного порта. Бэкап предыдущей сборки: work/backups/jotdrop-before-rank-fix-2026-10-18-0115.
- Порядок карточек: jotdrop_order во frontmatter; при равных номерах — сортировка created-desc.
- Кэш данных на представление; cardsVersion защищает принятие результатов; обновления объединяются с задержкой 150 мс.

## Main files changed
- src/customizations.js: moveCard, rankWindow, applyCardMove, saveCardMove, finishCardMove.
- scripts/check-fork-browser.cjs: 10 новых проверок (одна запись при испорченных номерах в группе, равные соседи, переход за карточку без номера, второй drop применяется во время записи первого).

## Testing and verification results
- PASS живой Obsidian a440e0b: 4 переноса системной мышью при подставленном в памяти повторе номера (старое правило переписало бы 112 заметок) — по 1 записи, drop через 12–14 мс после отпускания, запись 63–186 мс; ещё 4 без подстановки — так же. Номера и раскладка восстановлены, расхождений 0 (work/logs/live-verify-*.json).
- RED на f499f43: 8 записей вместо одной (work/logs/rank-red.log); RED очереди при ожидании записей (work/logs/queue-red.log).
- PASS: tsc, esbuild, полный check:fork — 69 board, Markdown, 187 browser, 22 tag, 250 retention, 14+3 drag-refresh, 7 drag-window (work/logs/rank-check-fork.log).
- Живая запись лага f499f43 18.10 00:35: work/logs/peek-record.json. Android/touch NOT RUN.

## Known issues
- Источник испорченного номера в памяти не найден.
- В Grail есть файлы sync-conflict от Syncthing (17.10 14:55); они отображаются на доске.
- Первое открытие последовательно читает все заметки. Мобильный touch-перенос не реализован (FORK.md).

## Ordered next development steps
1. Решить слияние ветки codex/drag-filter-wip-20261016 в main.
2. Интеграция upstream: docs/upstream-update-assessment.md.
