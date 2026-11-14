/** Syncthing conflict copies are ordinary synced files, not a separate extension. */
export function conflictOriginal(path: string): string | null {
  let original = path;
  const suffix = /\.sync-conflict-\d{8}-\d{6}-[^/.]+(?=\.[^/.]+$)/i;
  while (suffix.test(original)) original = original.replace(suffix, "");
  return original === path ? null : original;
}

export function under(path: string, folder: string): boolean {
  return path === folder || path.startsWith(folder.replace(/\/$/, "") + "/");
}

export function trashRoot(notesFolder: string): string {
  return notesFolder.replace(/\/$/, "") + "/Trash";
}

export function isTrashed(path: string, notesFolder: string): boolean {
  return under(path, trashRoot(notesFolder));
}

/** A trash entry keeps its full original vault path after a unique batch directory. */
export function restorePath(path: string, notesFolder: string): string | null {
  const root = trashRoot(notesFolder) + "/";
  if (!path.startsWith(root)) return null;
  const relative = path.slice(root.length);
  const slash = relative.indexOf("/");
  return slash > 0 && slash < relative.length - 1 ? relative.slice(slash + 1) : null;
}

export interface WeekNote {
  path: string;
  title: string;
  created: number;
  modified: number;
  content: string;
  reminder: number | null;
}

/** Called only when the overview is opened; it owns no timer, index or persisted state. */
export function weekOverview(notes: WeekNote[], now: number) {
  const since = now - 7 * 86400000;
  const until = now + 7 * 86400000;
  const created = notes.filter(note => note.created >= since && note.created <= now)
    .sort((a, b) => b.created - a.created || a.path.localeCompare(b.path));
  let openTasks = 0;
  for (const note of notes) {
    let fence = "";
    for (const line of note.content.split(/\r?\n/)) {
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = "";
      } else if (!fence && /^\s*(?:[-+*]|\d+[.)])\s+\[ \]\s+\S/.test(line)) openTasks++;
    }
  }
  return {
    created: created.length,
    changed: notes.filter(note => note.modified >= since && note.modified <= now).length,
    openTasks,
    reminders: notes.filter(note => note.reminder !== null && note.reminder <= until).length,
    newest: created.slice(0, 10),
  };
}
