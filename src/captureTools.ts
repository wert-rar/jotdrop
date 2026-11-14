import { App, Modal, Notice, TFile } from "obsidian";
import type JotDropPlugin from "./main";
import { createNoteInFolder } from "./capture";
import { createDrawingEditor } from "./shared/drawing-editor.mjs";
import { drawingFileName, isDrawingName, read as readDrawing } from "./shared/drawing.mjs";
import { ConfirmModal } from "./confirmModal";
import { LocalOcr } from "./ocr";
import { localText as l } from "./i18n";
import { runLocal } from "./noteTools";

function ask(app: App, message: string): Promise<boolean> {
  return new Promise(resolve => {
    let yes = false;
    const modal = new ConfirmModal(app, { title: message, message: "", confirmLabel: l("Discard", "Отбросить"), destructive: true }, () => { yes = true; });
    const close = modal.onClose.bind(modal);
    modal.onClose = () => { close(); window.setTimeout(() => resolve(yes), 0); };
    modal.open();
  });
}

interface Drawing { width: number; height: number; strokes: { color: string; size: number; points: number[] }[] }

export class DrawingModal extends Modal {
  private editor: ReturnType<typeof createDrawingEditor> | null = null;
  private leaving = false;
  constructor(app: App, private initial: Drawing | null, private save: (png: Uint8Array) => Promise<void>) { super(app); }
  onOpen(): void {
    this.modalEl.addClass("jotdrop-drawing-modal");
    this.titleEl.setText(l("Drawing", "Рисунок"));
    this.editor = createDrawingEditor({ initial: this.initial,
      labels: {
        title: l("Drawing", "Рисунок"), save: l("Save", "Сохранить"), cancel: l("Cancel", "Отмена"),
        canvas: l("Drawing area", "Область рисования"), colors: l("Color", "Цвет"), widths: l("Width", "Толщина"),
        black: l("Black", "Чёрный"), blue: l("Blue", "Синий"), red: l("Red", "Красный"),
        green: l("Green", "Зелёный"), orange: l("Orange", "Оранжевый"), purple: l("Purple", "Фиолетовый"),
        thin: l("Thin", "Тонкая"), medium: l("Medium", "Средняя"), thick: l("Thick", "Толстая"),
        eraser: l("Eraser", "Ластик"), undo: l("Undo", "Отменить"), redo: l("Redo", "Повторить"),
        clear: l("Clear", "Очистить"), clearAsk: l("Clear the drawing?", "Очистить рисунок?"),
        discardAsk: l("Discard unsaved changes?", "Отбросить несохранённые изменения?"), saving: l("Saving…", "Сохраняю…"),
      },
      confirm: (message: string) => ask(this.app, message),
      onSave: async ({ png }: { png: Uint8Array }) => { await this.save(png); this.leaving = true; this.close(); },
      onCancel: () => { this.leaving = true; this.close(); },
    });
    this.contentEl.append(this.editor.element);
  }
  close(): void {
    if (this.editor && !this.leaving) { void this.editor.close(); return; }
    super.close();
  }
  onClose(): void { this.editor = null; this.contentEl.empty(); }
}

export class PhotoModal extends Modal {
  private url: string;
  private closed = false;
  private busy = false;
  private ocr: LocalOcr | null = null;
  constructor(app: App, private plugin: JotDropPlugin, private image: File, private note?: TFile) {
    super(app);
    this.url = URL.createObjectURL(image);
  }
  async onOpen(): Promise<void> {
    this.titleEl.setText(l("Photo and text recognition", "Фото и распознавание текста"));
    this.modalEl.addClass("jotdrop-photo-modal");
    this.contentEl.createEl("img", { cls: "jotdrop-photo-preview", attr: { src: this.url, alt: this.image.name } });
    const text = this.contentEl.createEl("textarea", { cls: "jotdrop-photo-text", attr: { "aria-label": l("Recognized text", "Распознанный текст"), placeholder: l("Optional text for this photo", "Текст к фотографии (необязательно)") } });
    const status = this.contentEl.createEl("p", { attr: { role: "status" } });
    const actions = this.contentEl.createDiv({ cls: "jotdrop-local-actions" });
    const ocr = new LocalOcr(this.app, this.plugin.manifest.dir!);
    this.ocr = ocr;
    const recognize = actions.createEl("button", { text: l("Recognize Russian + English", "Распознать русский и английский") });
    const ready = await ocr.hasData();
    let needsDownload = !ready;
    if (this.closed) return;
    this.contentEl.createEl("p", { text: ready ? l("Recognition is local. The photo stays on this device.", "Распознавание выполняется локально. Фотография остаётся на устройстве.") : l("The first recognition downloads about 8 MB of Russian and English language data. The photo is never uploaded.", "При первом распознавании загрузятся около 8 МБ языковых данных. Фотография никуда не отправляется.") });
    if (!ready) recognize.setText(l("Download languages and recognize", "Скачать языки и распознать"));
    recognize.addEventListener("click", () => runLocal(async () => {
      if (this.busy) return;
      this.busy = true;
      recognize.disabled = true;
      try {
        if (needsDownload || !(await ocr.hasData())) {
          status.setText(l("Downloading language data…", "Загружаю языковые данные…"));
          await ocr.download();
          needsDownload = false;
        }
        if (this.closed) return;
        status.setText(l("Recognizing…", "Распознаю…"));
        const result = await ocr.recognize(this.image, progress => {
          if (!this.closed) status.setText(l(`Recognizing: ${Math.round(progress * 100)}%`, `Распознаю: ${Math.round(progress * 100)}%`));
        });
        if (!this.closed) { text.value = result; status.setText(l("Done. Review the text before saving.", "Готово. Проверь текст перед сохранением.")); }
      } catch (error) {
        if (!this.closed) {
          if (error instanceof Error && error.message === "data-missing") {
            needsDownload = true;
            recognize.setText(l("Download languages and recognize", "Скачать языки и распознать"));
            status.setText(l("Language data is damaged. Click again to download a verified copy.", "Языковые данные повреждены. Нажми ещё раз, чтобы загрузить проверенную копию."));
          } else if (error instanceof Error && error.message === "no-simd") {
            status.setText(l("Local recognition is unavailable on this device.", "На этом устройстве локальное распознавание недоступно."));
          } else status.setText(String(error));
        }
      }
      finally { this.busy = false; recognize.disabled = false; }
    }));
    const save = actions.createEl("button", { text: l("Save photo and text", "Сохранить фото и текст"), cls: "mod-cta" });
    save.addEventListener("click", () => runLocal(async () => {
      if (this.busy) return;
      this.busy = true;
      save.disabled = true;
      try {
        await this.plugin.captureTools.savePhoto(this.image.name, await this.image.arrayBuffer(), text.value, this.note);
        this.close();
      } finally { this.busy = false; save.disabled = false; }
    }));
  }
  onClose(): void { this.closed = true; this.ocr?.cancel(); URL.revokeObjectURL(this.url); this.contentEl.empty(); }
}

export class CaptureTools {
  constructor(private plugin: JotDropPlugin) {}

  pickPhoto(note?: TFile): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/bmp,image/gif";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) new PhotoModal(this.plugin.app, this.plugin, file, note).open();
    }, { once: true });
    input.click();
  }

  async savePhoto(name: string, data: ArrayBuffer, text: string, note?: TFile): Promise<TFile> {
    const path = await this.plugin.localNotes.saveAttachment(name, data);
    const title = name.replace(/\.[^.]+$/, "").replace(/[\r\n]/g, " ");
    const body = `![[${path}]]\n\n${text.trim()}\n`;
    const file = note ?? await createNoteInFolder(this.plugin.app, this.plugin.settings.notesFolder, `# ${title}\n\n${body}`);
    if (note) await this.plugin.app.vault.process(note, content => `${content.trimEnd()}\n\n${body}`);
    this.plugin.refreshViews({ kind: "files", paths: [file.path] });
    return file;
  }

  draw(note?: TFile): void {
    new DrawingModal(this.plugin.app, null, async png => {
      await this.savePhoto(drawingFileName(), png.slice().buffer as ArrayBuffer, "", note);
    }).open();
  }

  canEditDrawing(path: string): boolean { return isDrawingName(path.split("/").pop() ?? ""); }

  async editDrawing(note: TFile, path: string): Promise<void> {
    const bytes = await this.plugin.app.vault.adapter.readBinary(path);
    const initial = readDrawing(new Uint8Array(bytes)) as Drawing | null;
    if (!initial) { new Notice(l("This image has no editable JotDrop drawing data.", "В изображении нет редактируемых линий JotDrop.")); return; }
    new DrawingModal(this.plugin.app, initial, async png => {
      const target = await this.plugin.localNotes.saveAttachment(drawingFileName(), png.slice().buffer as ArrayBuffer);
      await this.plugin.app.vault.process(note, content => {
        let replaced = false;
        const next = content.replace(/!\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, (embed, link: string, size: string) => {
          if (link !== path && link !== path.split("/").pop()) return embed;
          replaced = true;
          return `![[${target}${size ?? ""}]]`;
        });
        if (!replaced) throw new Error("The drawing was removed from this note. Reopen the note before saving.");
        return next;
      });
      this.plugin.refreshViews({ kind: "files", paths: [note.path] });
    }).open();
  }
}
