# Local tools in fork plugin 0.22.1

Use the six icon buttons beside the sort/label controls in the board toolbar, or the corresponding JotDrop command. These features use local Markdown files and need no JotDrop Cloud account or AI key. The Syncthing icon shows the number of unresolved conflicts.

## Syncthing conflicts

The conflict list finds Markdown copies named `name.sync-conflict-YYYYMMDD-HHMMSS-DEVICE.md` under the notes/archive folders. Compare shows the entire copy and main file, including frontmatter, with line numbers and added/removed lines. Choose either version or edit the complete result before saving. This is a two-file comparison: no common ancestor is available, so there is no automatic three-way merge.

Saving checks the files against the comparison snapshots. A changed file requires a new comparison. Before changing the main file, its original contents are copied to Trash; the conflict copy is then moved there too. If the main file is missing, the result defaults to the surviving copy. A newer conflict received during saving is retained for another comparison. No Syncthing settings are changed.

## Trash

Deleting a card moves its Markdown file to `<notesFolder>/Trash/<unique batch>/<original vault path>`. The file's bytes are preserved and its attachments remain available. Trash shows original paths; Restore returns a note to its old path, using a numbered filename if that path is occupied. Removing a Trash entry asks first and then uses Obsidian's configured trash mechanism. Attachments are retained, including shared attachments.

Trash and unresolved conflict copies are excluded from normal cards, duplicates, the week overview, reminders, label edits and background preview rescue. Trash has no automatic expiry.

## Photos, OCR and drawings

- **Photo and text recognition** selects an image, previews it, and lets you save a photo note with optional text. A card's menu can add a photo to an existing note. Cancelling writes no photo or note.
- **Recognize Russian + English** processes the image on the device. The first use asks to download about 8 MB of pinned, checksum-verified language data. The OCR worker/core are bundled, not downloaded. Models are stored under the plugin's `ocr-data/`; the photo is not uploaded. Recognition workers stop when the photo window is closed, after initialization if initialization is still running.
- **Draw a note** supports mouse, pen and touch, six named colors, three widths, eraser, undo and redo. PNGs retain their editable strokes and are compatible with the upstream drawing format. A card's menu can add a drawing; the image lightbox offers **Edit drawing**. Editing saves a new PNG and preserves the previous image file.
- Excalidraw cards use an exported PNG/SVG or the installed Excalidraw plugin's renderer. Without either, they show a drawing label. Clicking a standalone drawing opens its file in Obsidian; JotDrop does not rewrite its drawing data.

## Duplicates and week overview

Duplicate search runs only when opened, in a disposable worker, with a four-second search budget and a maximum of 500 pairs. It finds equal/near text and notes contained in others; notes shorter than 40 characters are skipped. Compare never changes a note. Moving a suggested duplicate to Trash requires confirmation and rejects a changed note. **Skip this pair** hides it for the current search only. No AI is used.

Week overview shows four statistics: notes created and changed in the last seven days, all open tasks, and reminders due over the next seven days including overdue reminders. Below them are at most ten notes created within the last seven days, ordered by creation time. Archived notes are excluded. There is no background index, timer or stored summary.

## Cards and verification

Flat checklist cards show ten open tasks and fold completed items. Their original source order and checkbox indexes are preserved. Mixed Markdown and nested lists keep full Obsidian rendering. Unrelated vault files no longer trigger board refreshes.

Run `npm run check:integration`, `npm run check:fork` and `npm run check:local`. `npm run check:ocr` additionally exercises the real bundled OCR engine with Russian and English models; it downloads the pinned test data to ignored `work/ocr-models/` if absent. Browser checks need installed Microsoft Edge. Tests use disposable data, not a real user vault.
