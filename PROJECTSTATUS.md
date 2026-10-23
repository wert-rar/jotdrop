# PROJECTSTATUS

## Current goals
- 2026-10-23: сравнение собственного main с upstream завершено; план переноса: [оценка upstream](docs/upstream-update-assessment.md). Код не переносился, релиз не готовился.
- origin/main cc48eb3 уже содержит codex/drag-filter-wip-20261016 fc74005; разница — один коммит только в PROJECTSTATUS.md. Локальная main 7220247 устарела.
- Latest session report: [2026-10-23-2335](work-reports/2026-10-23-2335.md).

## Completed tasks still relevant to the current phase
- Исправления drag/filter вошли в собственный main. a440e0b отделяет применение drop от записи файлов и перенумеровывает минимальное окно карточек.
- b1acced откладывает render на весь HTML5 dragstart → dragend. Pointer-вариант откатан в f499f43 по выбору пользователя.
- Поиск по кэшу, адресное обновление карточек, сохранение DOM/колонок; маркер drop по верхнему краю и анимация 80 мс.
- Выполнен pull рабочей ветки 304d8d0 → fc74005; сравнены source refs, опубликованные релизы и конфликты слияния с upstream.

## Key technical decisions
- Canonical AgentMemory scope: wert-rar/jotdrop. MCP недоступен; recall/save в сессии 23.10 не выполнены.
- Канонический источник — origin/main https://github.com/wert-rar/jotdrop.git. Upstream — Diexar-Labs; теги upstream при исследовании не импортировать поверх тегов форка.
- Сохранить MarkdownRenderer, Live Preview, кэш, фильтры, колонки и разделение применения/сохранения переносов при интеграции.
- Форк пишет jotdrop_order, upstream plugin/Android — order. Выбор единого контракта и миграция не согласованы; не вводить их молча.
- Сравнение закреплено за origin/main cc48eb39fae75882a9ad0f3c308c9a97f1dc0ccf и upstream/main e8afaa1f0b2e8466c040d1085c0d91052cf50a17. Перед реализацией обновить refs.

## Main files changed
- В сессии 23.10 локально изменена только документация: docs/upstream-update-assessment.md, PROJECTSTATUS.md, work-reports/2026-10-23-2329.md, work-reports/2026-10-23-2335.md. Изменения не закоммичены.
- Основной код форка: src/customizations.js, src/view.ts, src/main.ts; проверки — scripts/check-board-updates.cjs, scripts/check-fork-browser.cjs, scripts/check-fork-markdown.cjs.

## Testing and verification results
- PASS 23.10: source fetch/live SHA; pull fast-forward; сравнение merge-base, истории и файлов; реальные версии и assets через GitHub Releases API.
- EXPECTED CONFLICTS 23.10: git merge-tree --write-tree --name-only origin/main upstream/main, exit 1, семь конфликтных файлов; индекс и checkout не изменены. Лог: work/logs/upstream-merge-tree-2026-10-23.log.
- PASS в сессии pull: git diff --check ORIG_HEAD HEAD и git diff --check. Проверки приложения 23.10 NOT RUN; объединённой сборки пока нет.
- Исторический PASS 18.10 для a440e0b: 8 живых переносов в Obsidian, по одной записи; 4 с повтором ранга в памяти, drop 12–14 мс, запись 63–186 мс; состояние восстановлено без расхождений. tsc, esbuild, полный check:fork прошли тогда, не повторялись 23.10. Android/touch NOT RUN.

## Known issues
- Upstream plugin 0.21.1 и Android 0.28.24 не интегрированы. Форк manifest/main 0.20.5; эта версия уже опубликована и не может быть повторно использована для нового релиза.
- Нужна адаптация: hashtags и фильтры/кэш; архив из компактного редактора; мобильная клавиатура и Live Preview; порядок между plugin/Android. Подробности в оценке upstream.
- Android форка остаётся 0.28.2, code 56; его updater указывает на Diexar-Labs. Ключ подписи и установленная сборка в этой сессии не проверялись.
- Источник испорченного ранга в памяти, пойманного 18.10, не установлен; a440e0b устраняет массовую запись независимо от этой причины.
- Первое открытие последовательно читает заметки; mobile touch-перенос форка не реализован. AgentMemory MCP недоступен.

## Approaches already tried but unsuccessful
- Render во время drag отрывал элемент и срывал drop; сохранять защиту на весь перенос.
- Полная перенумерация группы из-за любого пустого/повторного ранга и ожидание файлов в orderQueue давали лаг до 2,8 с; заменены минимальным окном рангов и отдельной очередью записи.
- Объяснения лага системным циклом Windows и старой загруженной сборкой не подтвердились. Проверять живой процесс, момент загрузки и записи файлов; зелёный mock-стенд не доказывает отсутствие проблемы, зависящей от данных.
- В сессии 23.10 сеть/.git недоступны из песочницы; разрешённые повторные вызовы с повышенным доступом прошли.

## Ordered next development steps
1. Согласовать объём релиза по docs/upstream-update-assessment.md; рекомендуемый первый блок — сохранение hashtags и согласование с фильтрами форка.
2. После согласования сохранить документальные изменения, обновить refs и создать feature branch от актуального origin/main.
3. Перенести archive collision и OG preview fixes; mobile keyboard адаптировать под Live Preview. Imports/labels/recurring reminders добавлять отдельными блоками выбранного объёма.
4. Выполнить gated build, check:fork и проверки перенесённых функций, затем живую проверку Obsidian. Android готовить отдельно с решением по порядку, updater и подписи.
5. Новая версия, merge в собственный main, чистый источник HEAD == live origin/main, verify:release/verify:tag, затем публикация.
