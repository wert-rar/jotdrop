# PROJECTSTATUS

## Current goals
- Опубликован [JotDrop 0.28.24](https://github.com/wert-rar/jotdrop/releases/tag/0.21.2): plugin 0.21.2 и Android upstream 0.28.24 как есть. Tag совпадает с manifest плагина; title следует Android.
- Все итоговые проверки опубликованных файлов прошли.
- Latest session report: [2026-10-24-0050](work-reports/2026-10-24-0050.md).

## Completed tasks still relevant to the current phase
- PR #2 слит в main; release source/tag 0.21.2: 288e7d72ae90f2c6e8c1cf7d9c223c03244c24b5.
- Compact recurring reminders и labels; Keep/Markdown/ENEX import; typed hashtags, archive collisions, OG previews, mobile keyboard fixes.
- Сохранены MarkdownRenderer, native Live Preview, cached tag exclusions, DOM/scroll, локальные колонки и быстрый drag с отдельной записью.
- Android tree полностью совпадает с e8afaa1 / v0.28.24, code 78. В релиз включён оригинальный upstream APK с неизменными байтами, подписью, updater и интерфейсом. Рабочее хранилище Obsidian не обновлялось.
- Changelog и опубликованное описание релиза приведены к формату пользователя; README ведёт на 0.21.2 и changelog.

## Key technical decisions
- Канонический источник origin/main wert-rar/jotdrop; upstream Diexar-Labs. Plugin changes selectively integrated; Android unchanged.
- Историческая ветка origin/jotdrop-fork (964f747) полностью включена в main squash-коммитом 7dbebb7 (PR #1): деревья файлов идентичны. Повторное слияние не требуется; ветка оставлена без изменений.
- Шесть assets: main.js, manifest.json, styles.css, jotdrop.apk, BUILD-INFO.txt и ANDROID-BUILD-INFO.txt. APK SHA256 c3a6f1e57c8a5a2114d1aca009dc16cfe9c2ef5fc419e4f3c3604f7e37128109 совпадает с upstream; отдельные BUILD-INFO сохраняют обе provenance.
- Plugin хранит jotdrop_order и локальные колонки; Android — order. Миграция не выполнялась.
- Changelog: Added / Changed / Fixed. Описания новых возможностей следуют шаблону Update пользователя; для исправлений применяется Patch. Номера плагина и Android указываются раздельно.

## Main files changed
- src/, styles.css, android/, scripts/check-* и mocks; manifest/package/lock; .github/workflows/android-build.yml; FORK.md; docs/releases/0.21.2.md; статус и отчёты.
- Документация релиза: CHANGELOG.md, README.md, docs/releases/0.21.2.md; статус и отчёты 2026-10-24-0049/0050. Код и сборки при оформлении описания не менялись.

## Testing and verification results
- PASS в сессии 00:49: fetch и live ls-remote; HEAD == origin/main == c6a9388. git diff --quiet origin/jotdrop-fork 7dbebb7 и проверка наличия 7dbebb7 в main завершились с кодом 0. Сборка и тесты приложения в этой сессии NOT RUN: изменений исходников нет.
- PASS оформление релиза: обязательные разделы changelog/Update, совпадение опубликованного текста с docs/releases/0.21.2.md; все шесть assets, title, tag и дата публикации сохранены. Снимки до/после: work/logs/release-notes-*-20261024.json. Сборка и тесты повторно NOT RUN: изменён только текст.
- PASS gated build, 10 integration groups и полный check:fork: 70 board, Markdown, 195 browser, real native mouse, 22 tag, 250 retention, 14+3 drag-refresh и 7 window checks.
- PASS настоящий Obsidian в отдельном work/verification/live-vault: native editor/display/save/cancel, Markdown/checkbox, reminders/labels, light/dark themes, tooltips, archive collision и native drag. Логи live-release-result.json, live-release.log и live-editor-visibility.log; снимки live-*.png.
- PASS CI R8 android:test-release и plugin checks: run 40026096195. Локально Java/SDK отсутствуют.
- PASS clean release source gate HEAD == live origin/main, verify:release, production build, verify:tag; publication run 40027052834 success, шесть assets, APK package/version/signature и upstream digest проверены.
- Итог опубликованного bundle/CSS/provenance: Все итоговые проверки опубликованных файлов прошли. Компиляторы: local esbuild=0.28.2; lock/CI esbuild=0.28.2; первоначальные hashes различались. Вместо утверждения о побайтовом равенстве опубликованный bundle напрямую проверен полным check:fork (exit 0). Подробности release-final-receipt.json и published-bundle-check-fork.log.
- NOT RUN Android device/emulator и установка в рабочий vault.

## Known issues
- Manual order Android/plugin различается; mobile touch drag форка отсутствует; первое открытие последовательно читает заметки.
- Побайтовая воспроизводимость local/CI bundle не заявляется; проверка опубликованного файла выполнена напрямую.

## Approaches already tried but unsuccessful
- Filesystem mock занимал все имена и зависал на archive collision loop; исправлен. VM test context дополнен TextDecoder/TextEncoder; board test учитывает metadata reminders.
- Новый test vault требовал trust prompt; подтверждено только для созданного нами test vault. Рабочее хранилище не затронуто.
- Первое сравнение local/CI JS hash не совпало; данные компилятора и прямая проверка опубликованного bundle сохранены. PowerShell JSON lockfile требовал -AsHashtable из-за пустого ключа packages.

## Ordered next development steps
1. При запросе пользователя установить проверенный plugin 0.21.2 в рабочий vault; в этой сессии установка туда не выполнялась.
2. Новую разработку начинать с fetch live main; Android и миграцию порядка менять только отдельной задачей.
