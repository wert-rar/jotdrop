# PROJECTSTATUS

## Current goals
- Проверить и установить готовую механику видимости тегов Obsidian-плагина.
- Latest session report: [2026-10-13-2134](work-reports/2026-10-13-2134.md).

## Completed tasks still relevant to the current phase
- По клику тег выключается/включается; выключенный тег перечёркнут.
- Show all / Hide all и Untagged управляют всей выдачей, включая заметки без тегов.
- Окно остальных тегов, поиск, пустая выдача и повторная отрисовка используют ту же модель.
- Зависимости восстановлены; сборка и браузерная проверка прошли.

## Key technical decisions
- Ветка codex/tag-visibility, база origin/main c634354dfaa51bf07cd4c38f57532cb67888cce7. AGENTS.md/FORK.md остаются обязательными.
- Любой исключённый тег скрывает заметку; прежний положительный OR-фильтр заменён по запросу пользователя.
- Состояние временное, в текущем view. Show all сохраняет поисковый запрос; полный сброс очищает его.
- Hide all выключает все текущие теги и заметки без тегов; Android не входил в эту реализацию.
- Canonical AgentMemory scope: `wert-rar/jotdrop`. MCP недоступен; recall/save не выполнены.

## Main files changed
- src/view.ts, src/tagPicker.ts, src/i18n.ts, styles.css, scripts/check-fork-browser.cjs.
- docs/tag-filter-exclusions.md, PROJECTSTATUS.md, work-reports/2026-10-13-2134.md.

## Testing and verification results
- PASSED: npm ci, verify:base, build/TypeScript/source gate.
- PASSED: 154 браузерные проверки, реальное перетаскивание, Markdown check; проверена копия актуальной сборки внутри sandbox.
- PASSED: совпадение SHA256 проверенных файлов с репозиторием, git diff --check, визуальный просмотр панели.
- NOT RUN: реальный Obsidian, Android, deploy/release. Логи и снимок: work/logs/ и work/verification/.

## Known issues
- Сборка ещё не установлена; совместимость с реальной темой Obsidian требует проверки.
- Рабочее дерево содержит незакоммиченные изменения; не подходит для deploy/release по правилам проекта.
- AgentMemory недоступен.

## Approaches already tried but unsuccessful
- Первый тест поиска совпадал с YAML-свойством pinned; исправлен на уникальный текст тела, повтор прошёл.

## Ordered next development steps
1. Просмотреть и закоммитить изменение.
2. Проверить актуальность main и verify:deploy на чистой feature branch перед установкой.
3. Установить по правилам проекта и проверить интерфейс/поиск в реальном Obsidian.
