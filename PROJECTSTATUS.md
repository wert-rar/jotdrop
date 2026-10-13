# PROJECTSTATUS

## Current goals
- Загрузить установленную сборку через перезапуск Obsidian и проверить новую панель тегов.
- Latest session report: [2026-10-13-2151](work-reports/2026-10-13-2151.md).

## Completed tasks still relevant to the current phase
- Реализованы включённые по умолчанию теги, скрытие по клику, перечёркивание и кнопки глаза.
- Hide all скрывает все заметки; Untagged позволяет отдельно вернуть заметки без тегов.
- Проверенная сборка установлена в .obsidian/plugins/jotdrop хранилища Obsidian; настройки сохранены.
- Предыдущая сборка сохранена: C:/Users/zhigu/GitHub/jotdrop/work/backups/jotdrop-before-tags-2026-10-13-214911.

## Key technical decisions
- Ветка codex/tag-visibility; установлен код коммита 4210a4c3243c57ce013f842a004a0d27badaa611, основанный на origin/main c634354.
- Любой выключенный тег скрывает заметку; временное состояние живёт в текущем view.
- Show all сбрасывает видимость, сохраняя поиск; полный сброс очищает поиск.
- Android не изменён. Deploy выполнен штатным скриптом из чистого коммита.
- Canonical AgentMemory scope: `wert-rar/jotdrop`. MCP недоступен, recall/save не выполнены.

## Main files changed
- Исходники функции: src/view.ts, src/tagPicker.ts, src/i18n.ts, styles.css, scripts/check-fork-browser.cjs.
- Установлены main.js, manifest.json и styles.css в плагин Obsidian.
- docs/tag-filter-exclusions.md, PROJECTSTATUS.md, work-reports/2026-10-13-2151.md.

## Testing and verification results
- PASSED ранее: 154 браузерные проверки, реальное перетаскивание, Markdown check, визуальный просмотр стенда.
- PASSED при установке: fetch/SHA, совпадение с тестовой копией, verify:deploy, build/verify:base/TypeScript, три hash-сравнения, неизменность data.json.
- Тесты повторно не запускались: bundle и исходники совпали с проверенными.
- NOT RUN: проверка новой версии в живом Obsidian после перезапуска.
- Логи: work/logs/tag-visibility-deploy.log и tag-visibility-deployment.json.

## Known issues
- Новые файлы на месте; работающий Obsidian ещё требует перезапуска/переключения плагина.
- CLI отключён; Computer Use не получил разрешение управлять Obsidian.
- AgentMemory недоступен.

## Approaches already tried but unsuccessful
- CLI не перезагружает плагин при выключенном интерфейсе командной строки.
- Computer Use: окно найдено, но доступ к его состоянию отклонён; ввод не выполнялся.

## Ordered next development steps
1. Перезапустить Obsidian или выключить/включить JotDrop.
2. Проверить переключатели тегов, обе кнопки глаза, Untagged и поиск в текущей теме.
3. При необходимости продолжить разработку на актуальной базе с соблюдением AGENTS.md/FORK.md.
