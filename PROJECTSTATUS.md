# PROJECTSTATUS

## Current goals
- Выпустить JotDrop 0.28.24: плагин форка 0.21.2 и неизменённый официальный Android 0.28.24, по прямому разрешению пользователя. Публикация ещё не выполнена.
- Кандидат: codex/upstream-plugin-20261023 от origin/main cc48eb3. Latest session report: [2026-10-24-0018](work-reports/2026-10-24-0018.md).

## Completed tasks still relevant to the current phase
- Сохранены Markdown-карточки, Live Preview, компактный редактор, кэш, фильтры исключения тегов, колонки и быстрый drag a440e0b.
- Перенесены plugin fixes e8afaa1: hashtags, archive collisions, OG previews, mobile keyboard; добавлены recurring reminders, labels и Keep/Markdown/ENEX import. Напоминания и labels адаптированы под компактные панели.
- Android tree полностью совпадает с upstream e8afaa1 / v0.28.24 (code 78), без доработок. Workflow проверяет официальный APK и прикладывает исходный бинарник к plugin tag 0.21.2 с названием JotDrop 0.28.24.

## Key technical decisions
- Origin/main wert-rar/jotdrop — канонический релизный источник. Upstream e8afaa1f0b2e8466c040d1085c0d91052cf50a17 закреплён для этой интеграции; его v0.28.24 указывает на тот же SHA.
- Android APK SHA256: c3a6f1e57c8a5a2114d1aca009dc16cfe9c2ef5fc419e4f3c3604f7e37128109. Подпись и updater upstream сохраняются; отдельные BUILD-INFO для плагина и Android.
- Плагин хранит jotdrop_order и локальные колонки, Android — order. Миграции и одинаковый порядок между платформами не входят в релиз.
- Обновлённые пользовательские инструкции 24.10 отменили прежние инструкции AGENTS.md; обязательного AgentMemory больше нет. Исторический scope wert-rar/jotdrop не менялся.

## Main files changed
- src/{main,view,edit,capture,customizations,metadata,i18n,settings,ogfetch,reminderScheduler} и новые import/label/recurrence/mobile modules; styles.css.
- android/ — точная копия upstream. scripts/check-* и mocks; .github/workflows/android-build.yml; manifest/package/lock 0.21.2; FORK.md; docs/releases/0.21.2.md; отчёты.

## Testing and verification results
- PASS: gated npm run build; npm run check:integration (10 групп); полный npm run check:fork: 70 board, Markdown, 195 browser, реальные мышиные переносы, 22 tag, 250 retention, 14 drag-refresh + 3 real drags, 7 window checks.
- PASS: git diff --check; Android tree совпадает с upstream через индекс Git; опубликованный APK и SHA256 проверены по GitHub API.
- Логи: work/logs/release-build.log, release-check-fork.log, integration-checks.log. UI снимки: work/verification/upstream-*-preview.png.
- NOT RUN: живая проверка кандидата в Obsidian, R8 Android test-release в CI, release gates. На этой машине Java/Android SDK отсутствуют; R8 проверяется в GitHub Actions.

## Known issues
- Релиз не опубликован: обязательны CI и живая проверка по FORK.md.
- Различный порядок Android/plugin и отсутствие mobile touch drag в форке сохраняются.
- Первое открытие последовательно читает заметки; причина старого испорченного ранга в памяти не найдена, a440e0b ограничивает запись независимо от причины.

## Approaches already tried but unsuccessful
- Старый browser mock объявлял занятыми все пути: новый archive collision loop зависал. Заглушка теперь возвращает только реальные fixture files/folders; default browser прошёл.
- VM-стенду добавлены обязательные TextDecoder/TextEncoder; board check обновлён на reschedule по metadata. Изолированный hashtag check проверяет plugin; Android берётся из upstream отдельно.
- Первый запуск в прежний log не состоялся из-за блокировки старым процессом; используется новый release-browser-default.log. Проверки после этого прошли.

## Ordered next development steps
1. Дождаться CI R8 test-release и проверить кандидат в отдельном work/verification/live-vault (рабочее хранилище не изменять).
2. При успешной проверке merge PR в origin/main; получить новый live SHA и clean HEAD == origin/main.
3. verify:release, gated release build и verify:tag -- 0.21.2; push tag, проверить workflow публикации и шесть assets, включая исходный Android APK.
4. Обновить финальный статус и отчёт с URL релиза и фактическими проверками. Повторное разрешение на выпуск не требуется.
