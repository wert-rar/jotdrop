# Сравнение форка JotDrop с upstream

Проверено 2026-10-23, Europe/Moscow. Сравнение исходников и опубликованных релизов; перенос кода, смена веток, сборка, установка и публикация не выполнялись. Рекомендации ниже ещё не являются согласованным объёмом реализации. Предыдущее сравнение от 16.10 устарело; его можно найти в истории этого файла.

## Зафиксированные источники

| Источник | Commit | Версия плагина | Android |
| --- | --- | --- | --- |
| Рабочая codex/drag-filter-wip-20261016 | fc7400581a1fd717a62b166ac5c06811c0cd91f2 | 0.20.5 | 0.28.2, code 56 |
| Собственный origin/main | cc48eb39fae75882a9ad0f3c308c9a97f1dc0ccf | 0.20.5 | 0.28.2, code 56 |
| Diexar-Labs upstream/main | e8afaa1f0b2e8466c040d1085c0d91052cf50a17 | 0.21.1 | 0.28.24, code 78 |
| Общая база | 722024792bad2176ea757b06c905404eb63ff5a6 | 0.20.4 | 0.28.2 |

`origin/main` уже содержит рабочую ветку. Рабочая ветка отстаёт всего на один документальный коммит cc48eb3; `git diff HEAD origin/main` показывает только PROJECTSTATUS.md. Повторное слияние исправлений drag/filter не требуется. Локальная ветка с именем `main` всё ещё указывает на общую базу 7220247; она не использовалась как актуальный main.

От общей базы у main форка 43 собственных коммита, у upstream — 44. Изменены соответственно 55 и 81 файл; совпадают 11 изменённых путей. Это расхождение историй, а не отставание форка на 44 готовых к применению патча. Перед записью отчёта live SHA обоих main повторно проверены и не изменились.

Источники: [main форка](https://github.com/wert-rar/jotdrop/commit/cc48eb39fae75882a9ad0f3c308c9a97f1dc0ccf), [upstream](https://github.com/Diexar-Labs/jotdrop/commit/e8afaa1f0b2e8466c040d1085c0d91052cf50a17), [manifest форка](https://github.com/wert-rar/jotdrop/blob/cc48eb39fae75882a9ad0f3c308c9a97f1dc0ccf/manifest.json), [manifest upstream](https://github.com/Diexar-Labs/jotdrop/blob/e8afaa1f0b2e8466c040d1085c0d91052cf50a17/manifest.json), локальные `merge-base`, `rev-list`, `diff`, `log`.

## Что сохранить из форка

| Область | Отличие форка | Решение для интеграции |
| --- | --- | --- |
| Карточки | Настоящий Obsidian MarkdownRenderer, ссылки, вложенные списки, код, embeds, интерактивные checkbox | Сохранить; plain-text карточки upstream не заменяют это поведение |
| Редактор | Нативный Live Preview, компактные иконки, Save/Archive/Cancel, черновик | Сохранить; upstream дорабатывает textarea |
| Перенос | HTML5 drag-and-drop, попадание в нужную колонку, маркер по верхнему краю, быстрый reflow | Сохранить реализацию и регрессии форка |
| Запись порядка | a440e0b: минимальное окно перенумерации; применение drop отделено от записи файлов | Сохранить; не вернуть ожидание предыдущей записи или перенумерацию всей группы |
| Производительность | Поиск по кэшу, адресная инвалидация, сохранение DOM и scroll, отложенный render на всём drag | Сохранить при добавлении новых метаданных и фильтров |
| Фильтры | Исключение тегов, скрытие untagged, сохранение колонок | Сохранить интерфейс и согласовать его с inlineTags и labels upstream |

Основание: [customizations.js](https://github.com/wert-rar/jotdrop/blob/cc48eb39fae75882a9ad0f3c308c9a97f1dc0ccf/src/customizations.js), [view.ts](https://github.com/wert-rar/jotdrop/blob/cc48eb39fae75882a9ad0f3c308c9a97f1dc0ccf/src/view.ts), [исправление очереди и рангов a440e0b](https://github.com/wert-rar/jotdrop/commit/a440e0b), [аудит производительности](plugin-performance-audit.md), [фильтры](tag-filter-exclusions.md). Старые результаты живых проверок не повторялись в этой сессии.

## Что нового в upstream и что забирать

| Изменение | Польза и отличие | Рекомендация |
| --- | --- | --- |
| Введённые пользователем #теги | Сейчас persist редактора форка и quick capture экранируют #теги. Upstream сохраняет их и показывает inline-теги в chips, поиске и фильтрах. Экранируется только внешний текст | Высокий приоритет: перенести весь контракт save/read/filter, сохранив исключения тегов форка |
| Коллизии имён при архивировании | Сейчас операция может завершиться ошибкой или пропуском. Upstream подбирает свободное имя с суффиксом для архива и восстановления | Высокий приоритет; адаптировать кнопку архива в компактном редакторе |
| Превью ссылок | Если TikTok oEmbed не дал картинки, upstream пробует HTML-превью и сохраняет доступные метаданные | Перенести с check:preview-fallback |
| Мобильная клавиатура и границы прокрутки | Модальное окно учитывает visualViewport и --keyboard-height; поправлены настройки и toolbar | Перенести с проверкой нативного редактора и CSS форка |
| Повторяющиеся напоминания | daily/weekly/monthly/yearly, интервалы, ограничения по дате и числу срабатываний; пересчёт после синхронизации | Полезный отдельный блок: metadata, repeat UI, scheduler и проверки; адаптировать компактный popup |
| Управление labels | Отдельные jotdrop_labels: создание, переименование, удаление и назначение; labels не смешиваются с Obsidian tags | Добавлять отдельным блоком с сохранением существующего интерфейса фильтров |
| Импорт Keep / Markdown / Evernote | Google Takeout ZIP, Markdown/ZIP/папка, ENEX; вложения и метаданные, пропуск уже импортированных файлов | Полезное расширение; подключать изолированные модули, настройки, команды и их тесты |
| Plain-text карточки | Upstream убирает Markdown-разметку из preview | Не заменять MarkdownRenderer форка; это другой выбор отображения |
| Продолжение списков в textarea | Enter продолжает bullets/checklists, добавлен визуальный слой | Не переносить поверх нативного Live Preview без отдельной необходимости |
| Ручной порядок upstream | Разреженные ранги, совместимые с Android через order | Не включать как второй независимый механизм: сначала выбрать единый контракт порядка |
| Удаление набора Play-тестеров | В upstream 0.21.1 убраны объявления и приглашения | Не импортировать промежуточные объявления из старых upstream-коммитов |

Основные первичные источники: [теги и сохранение af8b0b9](https://github.com/Diexar-Labs/jotdrop/commit/af8b0b9), [архив e223c7b](https://github.com/Diexar-Labs/jotdrop/commit/e223c7b), [ogfetch.ts](https://github.com/Diexar-Labs/jotdrop/blob/e8afaa1f0b2e8466c040d1085c0d91052cf50a17/src/ogfetch.ts), [mobileKeyboard.ts](https://github.com/Diexar-Labs/jotdrop/blob/e8afaa1f0b2e8466c040d1085c0d91052cf50a17/src/mobileKeyboard.ts), [scheduler](https://github.com/Diexar-Labs/jotdrop/blob/e8afaa1f0b2e8466c040d1085c0d91052cf50a17/src/reminderScheduler.ts), [labels](https://github.com/Diexar-Labs/jotdrop/blob/e8afaa1f0b2e8466c040d1085c0d91052cf50a17/src/labelManager.ts), [импорт a765f2b](https://github.com/Diexar-Labs/jotdrop/commit/a765f2b), [релиз 0.21.0](https://github.com/Diexar-Labs/jotdrop/releases/tag/0.21.0), [релиз 0.21.1](https://github.com/Diexar-Labs/jotdrop/releases/tag/0.21.1).

### Конкретные места, где нужен ручной перенос

1. **Порядок не совместим автоматически.** Форк читает/пишет jotdrop_order; upstream plugin/Android используют order. Колонки форка хранятся в plugin.settings.cardLayout, а не синхронизируются через frontmatter. Обновление Android само по себе не даст одинаковую раскладку и порядок. Не добавлять молчаливую миграцию или два параллельных источника порядка; перед реализацией общего порядка нужен отдельный выбор контракта.
2. **Архив из редактора.** customizations.js вызывает View.prototype.toggleArchive.call с объектом, содержащим только app и plugin. Upstream toggleArchive вызывает this.moveArchivedFile. Прямое копирование метода без адаптации вызовет ошибку на кнопке архива редактора. Это вывод из исходников; исполнением он не проверялся.
3. **Теги и кэш.** Upstream разделяет frontmatter tags и inlineTags. В форке поиск, исключения, untagged и частоты читают meta.tags. Перенос только исправления save оставит inline-теги за пределами этих функций. Нужно сохранить разделение записываемых tags и отображаемого объединения, а также адресную инвалидацию кэша.
4. **Нативный редактор и textarea.** customizations.js заменяет bodyEl/textArea на Live Preview. Upstream listEditor рассчитан на textarea; mobileKeyboard учитывает геометрию modal, но его scrollIntoView выбирает input/textarea. Автослияние не доказывает правильную работу Live Preview на мобильном устройстве.
5. **Checkbox в цитатах.** Исправление 0e6ed0e относится к plainPreviewText upstream. Форк использует MarkdownIt source maps, учитывает quoted/nested задачи и уже содержит такие регрессии. Не заменять эту реализацию plain-text обработчиком.

Основание: [manualOrder.ts](https://github.com/Diexar-Labs/jotdrop/blob/e8afaa1f0b2e8466c040d1085c0d91052cf50a17/src/manualOrder.ts), [metadata.ts upstream](https://github.com/Diexar-Labs/jotdrop/blob/e8afaa1f0b2e8466c040d1085c0d91052cf50a17/src/metadata.ts), [customizations.js форка](https://github.com/wert-rar/jotdrop/blob/cc48eb39fae75882a9ad0f3c308c9a97f1dc0ccf/src/customizations.js), [browser-регрессии](https://github.com/wert-rar/jotdrop/blob/cc48eb39fae75882a9ad0f3c308c9a97f1dc0ccf/scripts/check-fork-browser.cjs), [checkbox fix upstream](https://github.com/Diexar-Labs/jotdrop/commit/0e6ed0e).

## Android: отдельный объём

Android форка не изменялся относительно общей базы 0.28.2. Upstream дошёл до 0.28.24, code 78. Значимые группы:

- Защита незавершённых сохранений: журнал, AtomicFile, синхронизация записи на диск и CRC, восстановление после остановки процесса, недоступного vault и обрезанного журнала; зависшая заметка не блокирует остальные, есть сохранение копии или отказ от изменения. Это серия 0.28.16–0.28.22; её следует оценивать целиком, а не переносить только первый патч.
- Ручное перемещение с обратной связью и auto-scroll, исправления прокрутки и случайных тапов.
- Повторяющиеся напоминания, настройка звука будильника, labels, запись голосовых заметок и открытие ссылок.
- Сохранение настоящих #тегов, поиск по ним, чистые текстовые карточки; корректное экранирование hashtags внешнего shared text.

Источники: [Storage.kt](https://github.com/Diexar-Labs/jotdrop/blob/e8afaa1f0b2e8466c040d1085c0d91052cf50a17/android/app/src/main/kotlin/com/diexar/keepcapture/Storage.kt), [релиз 0.28.22](https://github.com/Diexar-Labs/jotdrop/releases/tag/v0.28.22), [релиз 0.28.24](https://github.com/Diexar-Labs/jotdrop/releases/tag/v0.28.24).

Для своего Android-релиза дополнительно нужен явный выбор канала обновлений и существующего ключа подписи. Сейчас UpdateChecker форка по-прежнему обращается к GitHub Releases Diexar-Labs. Наличие нужного ключа в этой сессии не проверялось. Нельзя поднимать versionCode ради установки старых исходников, удалять приложение или смешивать APK разных каналов. [UpdateChecker форка](https://github.com/wert-rar/jotdrop/blob/cc48eb39fae75882a9ad0f3c308c9a97f1dc0ccf/android/app/src/main/kotlin/com/diexar/keepcapture/UpdateChecker.kt), [требования проекта](../AGENTS.md).

## Фактические конфликты слияния

Выполнен `git merge-tree --write-tree --name-only origin/main upstream/main`. Ожидаемый exit code 1: текстовые конфликты в семи файлах:

- README.md
- manifest.json
- package-lock.json
- package.json
- src/main.ts
- src/settings.ts
- src/view.ts

src/capture.ts, src/edit.ts, src/i18n.ts и styles.css текстово сошлись автоматически, но примеры выше показывают необходимость проверки поведения. Ветки, индекс и рабочие исходники не менялись. Merge-tree записал только Git objects; диагностический вывод: work/logs/upstream-merge-tree-2026-10-23.log (локальный игнорируемый файл).

## Рекомендация для релиза

1. Брать за основу актуальный origin/main cc48eb3: все исправления рабочей ветки там уже есть. Сохранить собственные Markdown-карточки, Live Preview, фильтры, колонки, кэш и очередь переносов.
2. Для первого кандидата перенести исправления hashtags, коллизий архива и превью ссылок; адаптировать mobile keyboard/scroll. Каждый блок проверять своими upstream-проверками плюс соответствующими регрессиями форка.
3. Если цель — более крупный выпуск, добавить imports, labels и recurring reminders отдельными проверяемыми блоками. Не переносить целиком view.ts/edit.ts/styles.css. Согласование order и jotdrop_order — отдельная задача, особенно если нужен одинаковый порядок с Android.
4. Android готовить отдельным кандидатом с полной серией защиты сохранений и решением по updater/подписи. Web clipper в сравниваемых ветках после общей базы не менялся.
5. Выбрать новую версию: опубликованная 0.20.5 уже занята, хотя manifest main всё ещё содержит этот номер. На GitHub проверены реальные assets: у форка 0.20.5 есть ZIP и main.js/manifest.json/styles.css; у upstream 0.21.1 — три plugin assets; у v0.28.24 есть APK и BUILD-INFO.txt.
6. После реализации: чистый feature branch от live main, verify:base, gated build, check:fork и тесты перенесённых функций, живая проверка Obsidian. Для Android до merge — android:test-release. Затем merge в свой main, чистое HEAD == live origin/main, verify:release, verify:tag с точным номером и только потом публикация. Источники проверять повторно перед реализацией; этот документ закреплён за SHA выше.

Первый шаг реализации — отдельная ветка от актуального origin/main и перенос исправления hashtags с сохранением фильтров форка. Это рекомендация, реализация пока не начата. [Существующий релиз форка](https://github.com/wert-rar/jotdrop/releases/tag/0.20.5).

## Проверки и ограничения исследования

PASS: свежие fetch origin main --tags --prune и fetch --no-tags upstream main; сравнение с live refs дважды; анализ обоих diff относительно merge-base; версии из исходников; GitHub Releases API с опубликованными assets; пробное слияние без изменения checkout. Конфликтный merge-tree — ожидаемый диагностический результат, а не выполненное слияние.

Сборки, автоматические тесты приложения, Android и живой Obsidian в этой сессии не запускались. Это оценка различий и плана переноса, а не подтверждение готовности объединённой сборки. AgentMemory MCP недоступен: recall/save не выполнены, канонический scope остаётся wert-rar/jotdrop.
