import { App, Modal, Notice, TFile, setIcon } from "obsidian";
import type JotDropPlugin from "./main";
import type { ConflictSnapshot } from "./localNotes";
import { diffLines, foldUnchanged } from "./shared/diff.mjs";
import { searchDuplicates } from "./shared/similar.mjs";
import { isTrashed, restorePath, weekOverview } from "./noteFiles";
import { extractTitle, extractPreview } from "./view";
import { parseReminderMs, readMeta, stripFrontmatter } from "./metadata";
import { localText as l } from "./i18n";
import { ConfirmModal } from "./confirmModal";

export function runLocal(action: () => Promise<unknown>): void {
  void action().catch(error => new Notice(`JotDrop: ${error instanceof Error ? error.message : String(error)}`, 10000));
}

function button(parent: HTMLElement, label: string, action: () => void): HTMLButtonElement {
  const el = parent.createEl("button", { text: label });
  el.addEventListener("click", action);
  return el;
}

/** Plain text only: Markdown, HTML and frontmatter in a comparison are never executed. */
export function renderComparison(parent: HTMLElement, before: string, after: string): void {
  const lines = diffLines(before, after);
  if (!lines) {
    parent.createEl("p", { text: l("Too many changed lines to highlight. Both complete files are shown below.", "Слишком много изменений для подсветки. Ниже показаны оба файла целиком.") });
    const columns = parent.createDiv({ cls: "jotdrop-compare-columns" });
    for (const value of [before, after]) {
      const area = columns.createEl("textarea", { cls: "jotdrop-compare-raw" });
      area.value = value;
      area.readOnly = true;
    }
    return;
  }
  const grid = parent.createDiv({ cls: "jotdrop-diff", attr: { role: "table", "aria-label": l("File comparison", "Сравнение файлов") } });
  let left = 0, right = 0;
  // Diff lines carry source numbers before unchanged regions are folded.
  const numbered = lines.map((line: { type: string; text: string }) => ({ ...line,
    left: line.type !== "added" ? ++left : null,
    right: line.type !== "removed" ? ++right : null,
  }));
  const folded = foldUnchanged(numbered, 3) as Array<{ type: string; text?: string; count?: number; left?: number | null; right?: number | null }>;
  const cell = (line: typeof numbered[number] | undefined, side: "left" | "right") => {
    const el = grid.createDiv({ cls: `jotdrop-diff-cell ${line?.type ?? "is-empty"}`, attr: { role: "cell" } });
    if (!line) return;
    el.createSpan({ cls: "jotdrop-diff-number", text: String(line[side]) });
    el.createSpan({ cls: "jotdrop-diff-code", text: `${line.type === "added" ? "+" : line.type === "removed" ? "−" : " "} ${line.text}` });
  };
  for (let index = 0; index < Math.min(folded.length, 5000); index++) {
    const line = folded[index];
    if (line.type === "gap") {
      grid.createDiv({ cls: "jotdrop-diff-gap", text: l(`${line.count} unchanged lines`, `${line.count} строк без изменений`) });
      continue;
    }
    if (line.type === "same") { cell(line as typeof numbered[number], "left"); cell(line as typeof numbered[number], "right"); continue; }
    const removed: typeof numbered = [], added: typeof numbered = [];
    while (index < Math.min(folded.length, 5000) && ["removed", "added"].includes(folded[index].type)) {
      const changed = folded[index++] as typeof numbered[number];
      (changed.type === "removed" ? removed : added).push(changed);
    }
    index--;
    for (let row = 0; row < Math.max(removed.length, added.length); row++) { cell(removed[row], "left"); cell(added[row], "right"); }
  }
  if (folded.length > 5000) parent.createEl("p", { text: l("Highlighting is limited to 5,000 lines. The editable result below contains the full file.", "Подсветка ограничена 5000 строками. В поле результата ниже файл показан целиком.") });
}

export class CompareNotesModal extends Modal {
  constructor(app: App, private before: string, private after: string,
    private labels: [string, string], private save?: (result: string) => Promise<void>, private initialResult?: string) { super(app); }

  onOpen(): void {
    this.modalEl.addClass("jotdrop-compare-modal");
    this.titleEl.setText(l("Compare notes", "Сравнение заметок"));
    const headers = this.contentEl.createDiv({ cls: "jotdrop-compare-columns" });
    for (const label of this.labels) headers.createEl("strong", { text: label });
    renderComparison(this.contentEl, this.before, this.after);
    if (!this.save) return;
    this.contentEl.createEl("p", { text: l("Choose either full version or edit the result. Both source versions remain recoverable in Trash after saving.", "Выбери версию целиком или отредактируй результат. После сохранения обе исходные версии останутся в корзине.") });
    const actions = this.contentEl.createDiv({ cls: "jotdrop-local-actions" });
    const area = this.contentEl.createEl("textarea", { cls: "jotdrop-merge-result", attr: { "aria-label": l("Result (the complete Markdown file)", "Результат (полный Markdown-файл)") } });
    area.value = this.initialResult ?? this.before;
    button(actions, l("Use left", "Взять слева"), () => { area.value = this.before; });
    button(actions, l("Use right", "Взять справа"), () => { area.value = this.after; });
    const save = button(actions, l("Save result and resolve", "Сохранить результат и завершить"), () => runLocal(async () => {
      save.disabled = true;
      try { await this.save!(area.value); this.close(); }
      finally { save.disabled = false; }
    }));
    save.addClass("mod-cta");
  }
  onClose(): void { this.contentEl.empty(); }
}

export class ConflictsModal extends Modal {
  private closed = false;
  constructor(app: App, private plugin: JotDropPlugin) { super(app); }
  onOpen(): void {
    this.titleEl.setText(l("Syncthing conflicts", "Конфликты Syncthing"));
    this.contentEl.createEl("p", { text: l("Compare the main file with its .sync-conflict copy. No common ancestor is available, so no automatic merge is attempted.", "Сравни основной файл с копией .sync-conflict. Общего исходного файла нет, поэтому автоматического слияния здесь нет.") });
    const list = this.contentEl.createDiv();
    const render = () => {
      if (this.closed) return;
      list.empty();
      const files = this.plugin.localNotes.conflicts();
      if (!files.length) list.createEl("p", { text: l("No conflicts found.", "Конфликтов не найдено.") });
      for (const file of files) {
        const row = list.createDiv({ cls: "jotdrop-local-row" });
        row.createSpan({ text: file.path });
        button(row, l("Compare", "Сравнить"), () => runLocal(async () => {
          const snapshot: ConflictSnapshot = await this.plugin.localNotes.snapshot(file);
          if (snapshot.original === null) new Notice(l("The main file is missing. You can restore it from this copy.", "Основной файл отсутствует. Можно восстановить его из этой копии."));
          new CompareNotesModal(this.app, snapshot.original ?? "", snapshot.copy,
            [snapshot.originalPath, snapshot.copyPath], async result => {
              await this.plugin.localNotes.resolve(snapshot, result);
              new Notice(l("Conflict resolved. Both originals are in Trash.", "Конфликт разрешён. Исходные версии сохранены в корзине."));
              render();
            }, snapshot.original ?? snapshot.copy).open();
        }));
      }
    };
    render();
    button(this.contentEl, l("Refresh", "Обновить"), render);
  }
  onClose(): void { this.closed = true; this.contentEl.empty(); }
}

export class TrashModal extends Modal {
  constructor(app: App, private plugin: JotDropPlugin) { super(app); }
  onOpen(): void {
    this.titleEl.setText(l("JotDrop Trash", "Корзина JotDrop"));
    this.contentEl.createEl("p", { text: l("Deleted notes and resolved conflict originals stay here until you remove them. Attachments are preserved.", "Удалённые заметки и исходные версии разрешённых конфликтов хранятся здесь до удаления. Вложения сохраняются.") });
    const list = this.contentEl.createDiv();
    const render = () => {
      list.empty();
      const files = this.app.vault.getMarkdownFiles().filter(file => isTrashed(file.path, this.plugin.settings.notesFolder));
      if (!files.length) list.createEl("p", { text: l("Trash is empty.", "Корзина пуста.") });
      for (const file of files) {
        const row = list.createDiv({ cls: "jotdrop-local-row" });
        row.createSpan({ text: restorePath(file.path, this.plugin.settings.notesFolder) ?? file.name });
        button(row, l("View", "Посмотреть"), () => runLocal(async () => { await this.app.workspace.getLeaf("tab").openFile(file); }));
        button(row, l("Restore", "Восстановить"), () => runLocal(async () => { await this.plugin.localNotes.restore(file); render(); }));
        button(row, l("Remove", "Удалить"), () => {
          new ConfirmModal(this.app, {
            title: l("Remove this trash entry?", "Удалить эту запись из корзины?"),
            message: file.path,
            confirmLabel: l("Remove", "Удалить"), destructive: true,
          }, () => runLocal(async () => { await this.app.fileManager.trashFile(file); render(); })).open();
        });
      }
    };
    render();
  }
  onClose(): void { this.contentEl.empty(); }
}

interface LocalNote { id: string; title: string; text: string; updatedAt: string }
interface DuplicatePair { a: string; b: string; kind: string; score: number; drop: string }

/** On-demand CPU work runs in a disposable worker, never in the board's render path. */
export class DuplicatesModal extends Modal {
  private worker: Worker | null = null;
  private closed = false;
  constructor(app: App, private plugin: JotDropPlugin) { super(app); }
  async onOpen(): Promise<void> {
    this.titleEl.setText(l("Find duplicate notes", "Поиск дубликатов"));
    this.contentEl.createEl("p", { text: l("Local search without AI. Trash, conflict copies and Excalidraw files are excluded. Notes shorter than 40 characters are skipped.", "Локальный поиск без ИИ. Корзина, конфликтные копии и файлы Excalidraw исключены. Заметки короче 40 символов пропускаются.") });
    const status = this.contentEl.createEl("p", { text: l("Reading notes…", "Читаю заметки…"), attr: { role: "status" } });
    try {
      const texts = new Map<string, string>();
      const notes: LocalNote[] = [];
      for (const file of this.plugin.localNotes.files()) {
        if (this.closed) return;
        const content = await this.app.vault.read(file);
        texts.set(file.path, content);
        notes.push({ id: file.path, title: extractTitle(content, file.basename), text: extractPreview(content), updatedAt: new Date(file.stat.mtime).toISOString() });
      }
      if (this.closed) return;
      status.setText(l("Comparing on this device…", "Сравниваю на этом устройстве…"));
      const url = URL.createObjectURL(new Blob([
        `self.onmessage=e=>{try{self.postMessage({result:(${searchDuplicates.toString()})(e.data)})}catch(error){self.postMessage({error:String(error)})}};`,
      ], { type: "text/javascript" }));
      try { this.worker = new Worker(url); } finally { URL.revokeObjectURL(url); }
      this.worker.onerror = () => { status.setText(l("Search failed. Close and try again.", "Не удалось выполнить поиск. Закрой окно и попробуй снова.")); this.stop(); };
      this.worker.onmessage = event => {
        if (this.closed) return;
        this.stop();
        const { result, error } = event.data;
        if (error) { status.setText(String(error)); return; }
        status.setText(l(`${result.pairs.length} pairs found.${result.complete ? "" : " Search limit reached; results may be incomplete."}`, `Найдено пар: ${result.pairs.length}.${result.complete ? "" : " Достигнут лимит поиска; показаны не все результаты."}`));
        const byId = new Map(notes.map(note => [note.id, note]));
        for (const pair of result.pairs as DuplicatePair[]) {
          const a = byId.get(pair.a)!, b = byId.get(pair.b)!;
          const row = this.contentEl.createDiv({ cls: "jotdrop-local-entry" });
          row.createEl("h4", { text: `${a.title} ↔ ${b.title}` });
          row.createEl("p", { text: pair.kind === "same" ? l("Same text", "Одинаковый текст") : pair.kind === "inside" ? l("One note is inside the other", "Одна заметка содержится в другой") : l(`Similar text (${Math.round(pair.score * 100)}%)`, `Похожий текст (${Math.round(pair.score * 100)}%)`) });
          button(row, l("Compare", "Сравнить"), () => new CompareNotesModal(this.app, texts.get(a.id)!, texts.get(b.id)!, [a.id, b.id]).open());
          button(row, l("Skip this pair", "Пропустить эту пару"), () => row.remove());
          const drop = byId.get(pair.drop)!;
          button(row, l(`Move “${drop.title}” to Trash`, `В корзину: «${drop.title}»`), () => {
            new ConfirmModal(this.app, { title: l("Move this note to Trash?", "Переместить эту заметку в корзину?"), message: drop.id, confirmLabel: l("Move to Trash", "В корзину") }, () => runLocal(async () => {
              const file = this.app.vault.getAbstractFileByPath(drop.id);
              if (!(file instanceof TFile)) throw new Error("The note no longer exists");
              await this.plugin.localNotes.trash(file, texts.get(drop.id));
              row.remove();
            })).open();
          });
        }
      };
      this.worker.postMessage(notes);
    } catch (error) { status.setText(String(error)); this.stop(); }
  }
  private stop(): void { this.worker?.terminate(); this.worker = null; }
  onClose(): void { this.closed = true; this.stop(); this.contentEl.empty(); }
}

export class WeekModal extends Modal {
  private closed = false;
  constructor(app: App, private plugin: JotDropPlugin) { super(app); }
  async onOpen(): Promise<void> {
    this.titleEl.setText(l("Week overview", "Обзор недели"));
    this.modalEl.addClass("jotdrop-week-modal");
    const status = this.contentEl.createEl("p", { text: l("Collecting notes…", "Собираю заметки…") });
    try {
      const notes = [];
      for (const file of this.plugin.localNotes.files(false)) {
        if (this.closed) return;
        const content = await this.app.vault.cachedRead(file);
        const reminder = parseReminderMs(readMeta(this.app, file).reminder);
        notes.push({ path: file.path, title: extractTitle(content, file.basename), created: file.stat.ctime, modified: file.stat.mtime,
          content: stripFrontmatter(content), reminder: Number.isFinite(reminder) ? reminder : null });
      }
      if (this.closed) return;
      const now = Date.now();
      const overview = weekOverview(notes, now);
      const date = new Intl.DateTimeFormat(l("en", "ru"), { day: "numeric", month: "short" });
      this.contentEl.createEl("p", { cls: "jotdrop-week-period", text: `${date.format(now - 7 * 86400000)} — ${date.format(now)}` });
      const stats = this.contentEl.createDiv({ cls: "jotdrop-week-stats" });
      for (const [key, value, label, icon] of [
        ["created", overview.created, l("Created", "Создано"), "file-plus"],
        ["changed", overview.changed, l("Changed", "Изменено"), "pencil"],
        ["tasks", overview.openTasks, l("Open tasks", "Открытых задач"), "list-todo"],
        ["reminders", overview.reminders, l("Reminders", "Напоминаний"), "bell"],
      ] as const) {
        const stat = stats.createDiv({ cls: "jotdrop-week-stat" });
        stat.dataset.weekStat = key;
        setIcon(stat.createSpan({ cls: "jotdrop-week-stat-icon" }), icon);
        stat.createEl("strong", { text: String(value) });
        stat.createSpan({ text: label });
      }
      this.contentEl.createEl("p", { cls: "jotdrop-week-hint", text: l("Reminders: next 7 days, including overdue.", "Напоминания — на ближайшие 7 дней, включая просроченные.") });
      const heading = this.contentEl.createDiv({ cls: "jotdrop-week-heading" });
      heading.createEl("h3", { text: l("New notes", "Новые заметки") });
      if (overview.created > 10) heading.createSpan({ text: l(`10 of ${overview.created}`, `10 из ${overview.created}`) });
      const list = this.contentEl.createEl("ol", { cls: "jotdrop-week-notes" });
      for (const note of overview.newest) {
        const row = list.createEl("li");
        const link = row.createEl("a", { cls: "jotdrop-week-note", attr: { href: "#", title: note.title } });
        setIcon(link.createSpan({ cls: "jotdrop-week-note-icon" }), "file-text");
        link.createSpan({ cls: "jotdrop-week-note-title", text: note.title });
        link.createEl("time", { text: date.format(note.created), attr: { datetime: new Date(note.created).toISOString() } });
        setIcon(link.createSpan({ cls: "jotdrop-week-note-open" }), "arrow-up-right");
        link.addEventListener("click", event => {
          event.preventDefault();
          runLocal(async () => { await this.app.workspace.openLinkText(note.path, "", true); });
        });
      }
      if (!overview.newest.length) this.contentEl.createEl("p", { cls: "jotdrop-week-empty", text: l("No notes created in the last 7 days.", "За последние 7 дней новых заметок нет.") });
      status.remove();
    } catch (error) { status.setText(String(error)); }
  }
  onClose(): void { this.closed = true; this.contentEl.empty(); }
}

export function localToolButton(parent: HTMLElement, icon: string, label: string, action: () => void): HTMLButtonElement {
  const el = parent.createEl("button", { cls: "jotdrop-mic-btn", attr: { "aria-label": label, title: label } });
  setIcon(el, icon);
  el.addEventListener("click", action);
  return el;
}
