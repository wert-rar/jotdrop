# Changelog

## [Unreleased] — plugin 0.22.1

### Changed

- All six local tools are direct icon buttons beside the board's sort/label controls; Syncthing conflict counts appear on their own icon.
- Week overview shows four statistics and at most ten notes created in the last seven days, newest first, instead of unbounded lists of changed notes, tasks and reminders.

### Fixed

- Image/drawing cards no longer show their cover twice: the first matching rendered image is omitted from the Markdown preview, preserving other images and source content.

## [Unreleased] — plugin 0.22.0

### Added

- Local comparison of Syncthing `.sync-conflict` files with a split line diff, editable result, stale-file guards and recoverable copies of both original versions.
- JotDrop Trash with restore and collision-safe filenames; deleted notes retain their attachments.
- Photo notes and local Russian/English OCR. The recognition engine is bundled; verified language data is downloaded only after the user chooses recognition.
- Editable PNG drawings and read-only Excalidraw card previews, plus adding photos/drawings to an existing note.
- Local duplicate search in a disposable worker, and a lightweight week overview opened only on request.

### Changed

- Flat checklist cards display up to ten open tasks and fold completed tasks without changing the source order. Mixed Markdown and nested lists retain the fork's full rendering.

### Fixed

- Unrelated binary files and folders no longer refresh the board.
- Repeated captures with the same title no longer collide within a timestamp second; photo attachment names are unique across simultaneous captures.
- Background preview rescue, reminder scheduling and label operations leave conflict/recovery versions untouched.

## [0.21.2] - 2026-10-24

Общий релиз **JotDrop 0.28.24**: плагин Obsidian **0.21.2** и Android **0.28.24**.

### Added

- Повторяющиеся напоминания с настройкой расписания.
- Управление labels: создание, выбор меток и фильтрация карточек.
- Импорт из Google Keep, Markdown, включая экспорты Apple Notes, и Evernote ENEX с вложениями.
- Оригинальный APK Android 0.28.24 из upstream в составе общего релиза.

### Changed

- Элементы напоминаний и labels адаптированы под компактный стиль плагина и светлую/тёмную темы Obsidian.
- Сохранены Markdown-карточки, нативный Live Preview, расположение по колонкам и быстрый drag-and-drop форка.
- Android обновлён до upstream 0.28.24 без собственных доработок интерфейса, поведения, подписи и канала обновлений.

### Fixed

- Введённые хештеги сохраняются как теги Obsidian и учитываются в поиске и фильтрах.
- Архивирование и восстановление сохраняют обе заметки при совпадении имён файлов.
- Исправлены получение превью ссылок и расположение элементов при открытой мобильной клавиатуре.

[0.21.2]: https://github.com/wert-rar/jotdrop/releases/tag/0.21.2
