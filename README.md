# JotDrop — My Fork

A fork of [JotDrop by Diexar Labs](https://github.com/Diexar-Labs/jotdrop), based on version 0.20.4.

I made this fork to bring Google Keep-style card placement to Obsidian, simplify note editing, and improve Markdown rendering.

## What Changed

### 1. Drag and Drop

Arrange note cards manually, like in Google Keep. Card order and column placement persist when reopening the board with the same column count. Dragging preserves scroll position and supports moving cards between pinned and unpinned sections.

Mouse dragging is supported; mobile touch reordering is not yet implemented.

### 2. Simpler Note Editor

A compact layout with smaller margins, fewer buttons, inline tags, and a reminder popup. Native Markdown Live Preview replaces the plain text field.

Save commits your edits; Archive saves before moving the note; Cancel discards unsaved changes.

### 3. Better Markdown Rendering

Cards preserve paragraphs, nested lists, links, code blocks, and embeds using Obsidian’s Markdown renderer. Checkboxes update the note without rebuilding the board.

## Build

Requires Node.js and npm. Browser checks require Microsoft Edge.

```powershell
npm ci
npm run build
npm run check:fork
```

Plugin files: `main.js`, `manifest.json`, and `styles.css`.

See [FORK.md](FORK.md) for deployment and release rules. This fork retains the `jotdrop` plugin ID and replaces the original when installed in the same vault.

## Credits

Original project by Diexar Labs. See the [upstream README](https://github.com/Diexar-Labs/jotdrop/blob/main/README.md) for the Android app and browser extension.

[MIT License](LICENSE) · [Third-party attribution](THIRD_PARTY.md)
