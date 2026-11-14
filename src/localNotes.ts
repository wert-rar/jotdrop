import { TFile, normalizePath } from "obsidian";
import type JotDropPlugin from "./main";
import { conflictOriginal, isTrashed, restorePath, trashRoot, under } from "./noteFiles";

export interface ConflictSnapshot {
  originalPath: string;
  copyPath: string;
  original: string | null;
  copy: string;
}

/** Local operations keep both inputs recoverable. No cloud account or sync service is involved. */
export class LocalNotes {
  private resolving = new Set<string>();
  constructor(private plugin: JotDropPlugin) {}

  private get vault() { return this.plugin.app.vault; }

  manages(path: string): boolean {
    return under(path, normalizePath(this.plugin.settings.notesFolder)) ||
      under(path, normalizePath(this.plugin.settings.archiveFolder));
  }

  files(includeArchive = true): TFile[] {
    return this.vault.getMarkdownFiles().filter(file => this.manages(file.path) &&
      !isTrashed(file.path, this.plugin.settings.notesFolder) && !conflictOriginal(file.path) &&
      !/\.excalidraw\.md$/i.test(file.path) &&
      (includeArchive || !under(file.path, normalizePath(this.plugin.settings.archiveFolder))));
  }

  conflicts(): TFile[] {
    return this.vault.getMarkdownFiles().filter(file => this.manages(file.path) &&
      !isTrashed(file.path, this.plugin.settings.notesFolder) && conflictOriginal(file.path) !== null);
  }

  async snapshot(copy: TFile): Promise<ConflictSnapshot> {
    const originalPath = conflictOriginal(copy.path);
    if (!originalPath || !this.manages(copy.path)) throw new Error("Not a JotDrop Syncthing conflict");
    const original = this.vault.getAbstractFileByPath(originalPath);
    if (original && !(original instanceof TFile)) throw new Error("The original path is a folder");
    return {
      originalPath, copyPath: copy.path,
      original: original ? await this.vault.read(original) : null,
      copy: await this.vault.read(copy),
    };
  }

  async ensureFolder(path: string): Promise<void> {
    let part = "";
    for (const segment of path.split("/")) {
      part = part ? `${part}/${segment}` : segment;
      if (await this.vault.adapter.exists(part)) continue;
      try { await this.vault.createFolder(part); }
      catch (error) { if (!(await this.vault.adapter.exists(part))) throw error; }
    }
  }

  private async unused(path: string): Promise<string> {
    const dot = path.lastIndexOf(".");
    const stem = dot > path.lastIndexOf("/") ? path.slice(0, dot) : path;
    const ext = stem === path ? "" : path.slice(dot);
    let candidate = path;
    for (let n = 2; await this.vault.adapter.exists(candidate); n++) candidate = `${stem} (${n})${ext}`;
    return candidate;
  }

  private async recoveryPath(original: string): Promise<string> {
    const batch = `${Date.now()}-${crypto.randomUUID()}`;
    const target = `${trashRoot(this.plugin.settings.notesFolder)}/${batch}/${original}`;
    await this.ensureFolder(target.slice(0, target.lastIndexOf("/")));
    return target;
  }

  /** Moves only the note. Its attachments must stay available for Restore and shared notes. */
  async trash(file: TFile, expected?: string): Promise<void> {
    if (!this.manages(file.path) || isTrashed(file.path, this.plugin.settings.notesFolder)) throw new Error("Not an active JotDrop note");
    if (expected !== undefined && await this.vault.read(file) !== expected) throw new Error("The note changed. Compare it again before moving it to Trash.");
    const before = file.path;
    const target = await this.recoveryPath(before);
    await this.vault.rename(file, target);
    this.plugin.refreshViews({ kind: "files", paths: [before, target] });
  }

  async restore(file: TFile): Promise<void> {
    const original = restorePath(file.path, this.plugin.settings.notesFolder);
    if (!original) throw new Error("Not a JotDrop trash entry");
    const before = file.path;
    await this.ensureFolder(original.slice(0, original.lastIndexOf("/")));
    const target = await this.unused(original);
    await this.vault.rename(file, target);
    this.plugin.refreshViews({ kind: "files", paths: [before, target] });
  }

  /** Saves a full-file result, retaining the old main file and the conflict copy in Trash. */
  async resolve(snapshot: ConflictSnapshot, result: string): Promise<void> {
    if (this.resolving.has(snapshot.originalPath)) throw new Error("This conflict is already being saved");
    this.resolving.add(snapshot.originalPath);
    try {
      const copy = this.vault.getAbstractFileByPath(snapshot.copyPath);
      const original = this.vault.getAbstractFileByPath(snapshot.originalPath);
      if (!(copy instanceof TFile) || (original && !(original instanceof TFile)) ||
        (original ? await this.vault.read(original) : null) !== snapshot.original ||
        await this.vault.read(copy) !== snapshot.copy) {
        throw new Error("A file changed during comparison. Reopen this conflict to see the latest versions.");
      }
      if (original instanceof TFile) {
        // A separate byte-for-byte Markdown copy is recoverable even if a later rename fails.
        await this.vault.create(await this.recoveryPath(snapshot.originalPath), snapshot.original!);
        await this.vault.process(original, current => {
          if (current !== snapshot.original) throw new Error("The main file changed. Reopen the comparison.");
          return result;
        });
      } else {
        await this.ensureFolder(snapshot.originalPath.slice(0, snapshot.originalPath.lastIndexOf("/")));
        await this.vault.create(snapshot.originalPath, result);
      }
      // If sync delivered a new conflict while saving, keep it visible for another comparison.
      if (await this.vault.read(copy) !== snapshot.copy) throw new Error("The result was saved, but a newer conflict arrived. Its copy has been kept.");
      await this.trash(copy, snapshot.copy);
      this.plugin.refreshViews({ kind: "files", paths: [snapshot.originalPath, snapshot.copyPath] });
    } finally { this.resolving.delete(snapshot.originalPath); }
  }

  async saveAttachment(name: string, bytes: ArrayBuffer): Promise<string> {
    const folder = this.plugin.resolveAssetsFolder();
    await this.ensureFolder(folder);
    const safeName = name.replace(/[\\/:*?"<>|\[\]#^\u0000-\u001f]/g, "_");
    const dot = safeName.lastIndexOf(".");
    const uniqueName = dot > 0 ? `${safeName.slice(0, dot)}-${crypto.randomUUID()}${safeName.slice(dot)}` : `${safeName}-${crypto.randomUUID()}`;
    const target = await this.unused(`${folder}/${uniqueName}`);
    await this.vault.adapter.writeBinary(target, bytes);
    return target;
  }
}
