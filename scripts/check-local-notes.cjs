// Exercises local conflict/trash operations against an isolated in-memory vault.
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const esbuild = require('esbuild');

(async () => {
  const build = await esbuild.build({
    stdin: { contents: 'export * from "./src/localNotes.ts"; export * from "./src/noteFiles.ts"; export {PreviewRescue} from "./src/previewRescue.ts"; export {discoverLabels,renameLabel,deleteLabel} from "./src/labelManager.ts"; export {searchDuplicates} from "./src/shared/similar.mjs"; export * from "./src/shared/diff.mjs"; export * from "./src/shared/drawing.mjs"; export {TFile} from "obsidian";', resolveDir: process.cwd() },
    bundle: true, format: 'cjs', write: false,
    plugins: [{ name: 'local-vault', setup(build) {
      build.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'mock' }));
      build.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export class TFile {} export class Notice {} export const normalizePath=p=>p; export const getLanguage=()=>"en"; export const requestUrl=()=>{throw new Error("Unexpected network access")};' }));
    } }],
  });
  const module = { exports: {} };
  new Function('module', 'exports', 'crypto', build.outputFiles[0].text)(module, module.exports, webcrypto);
  const { LocalNotes, TFile, conflictOriginal, restorePath, isTrashed, weekOverview, diffLines, searchDuplicates, withDrawing, read } = module.exports;

  const originalPath = 'Notes/folder/a.b.md';
  const conflictPath = 'Notes/folder/a.b.sync-conflict-20261115-123456-ABCDEFG.md';
  assert.equal(conflictOriginal(conflictPath), originalPath);
  assert.equal(conflictOriginal('Notes/a.sync-conflict-20261115-123456-ABC.sync-conflict-20261115-223456-DEF.md'), 'Notes/a.md');
  assert.equal(conflictOriginal('Notes/a.sync-conflict-not-a-timestamp.md'), null);
  assert.equal(conflictOriginal('Notes/ordinary.md'), null);
  const before = '---\r\ncolor: red\r\n---\r\n# A\r\nFirst\r\n![[shared.png]]\r\n';
  const after = '---\ncolor: blue\n---\n# A\nSecond\n![[shared.png]]\n';
  const files = new Map(), folders = new Set(['Notes', 'Notes/folder', 'Notes/Archive']);
  const make = (path, content) => {
    if (files.has(path)) throw new Error('Refuse overwrite');
    const name = path.split('/').at(-1);
    const file = Object.assign(new TFile(), { path, name, basename: name.slice(0, -3), extension: 'md', content });
    files.set(path, file); return file;
  };
  let writes = 0, binaryWrites = 0, injectRace;
  const vault = {
    getMarkdownFiles: () => [...files.values()],
    getAbstractFileByPath: path => files.get(path) ?? (folders.has(path) ? {} : null),
    read: async file => { if (!files.has(file.path)) throw new Error('Missing file'); return file.content; },
    createFolder: async path => folders.add(path),
    create: async (path, content) => { writes++; return make(path, content); },
    process: async (file, callback) => { if (injectRace) injectRace(file); file.content = callback(file.content); writes++; },
    rename: async (file, path) => { assert(!files.has(path)); files.delete(file.path); file.path = path; files.set(path, file); writes++; },
    adapter: { exists: async path => files.has(path) || folders.has(path), writeBinary: async () => { binaryWrites++; } },
  };
  const plugin = { app: { vault }, settings: { notesFolder: 'Notes', archiveFolder: 'Notes/Archive' }, resolveAssetsFolder: () => 'Notes/.attachments', refreshViews() {} };
  const notes = new LocalNotes(plugin);
  let original = make(originalPath, before), copy = make(conflictPath, after);
  make('Notes/sketch.excalidraw.md', 'drawing data');
  assert.equal(notes.conflicts().length, 1);
  assert.deepEqual(notes.files().map(file => file.path), [originalPath]);
  const snapshot = await notes.snapshot(copy);
  assert.equal(snapshot.original, before, 'Compare includes all frontmatter and CRLF bytes');
  await notes.resolve(snapshot, after);
  assert.equal(files.get(originalPath).content, after);
  assert(!files.has(conflictPath));
  let trash = [...files.values()].filter(file => isTrashed(file.path, 'Notes'));
  assert.equal(trash.length, 2, 'Both original input versions are recoverable');
  assert(trash.some(file => file.content === before));
  assert(trash.some(file => file.content === after));
  assert.equal(binaryWrites, 0, 'Resolving never deletes or rewrites attachments');
  const oldMain = trash.find(file => file.content === before);
  assert.equal(restorePath(oldMain.path, 'Notes'), originalPath);
  await notes.restore(oldMain);
  assert.equal(files.get(originalPath).content, after, 'Restore never overwrites the current main');
  assert.equal(files.get('Notes/folder/a.b (2).md').content, before);

  copy = make(conflictPath, after);
  let stale = await notes.snapshot(copy);
  original.content = 'new edit from sync';
  const count = writes;
  await assert.rejects(notes.resolve(stale, 'overwrite'), /changed/);
  assert.equal(writes, count, 'Stale main rejects without writes');
  assert.equal(original.content, 'new edit from sync');
  stale = await notes.snapshot(copy);
  copy.content += 'another conflict edit';
  await assert.rejects(notes.resolve(stale, 'overwrite'), /changed/);
  assert.equal(writes, count, 'Stale conflict rejects without writes');
  stale = await notes.snapshot(copy);
  injectRace = file => { file.content = 'arrived during save'; };
  await assert.rejects(notes.resolve(stale, 'overwrite'), /changed/);
  injectRace = null;
  assert.equal(original.content, 'arrived during save', 'Atomic process guard preserves a concurrent main edit');
  assert(files.has(conflictPath));

  const orphan = make('Notes/gone.sync-conflict-20261115-123456-ABC.md', 'last surviving content');
  const orphanSnapshot = await notes.snapshot(orphan);
  assert.equal(orphanSnapshot.original, null);
  await notes.resolve(orphanSnapshot, orphanSnapshot.copy);
  assert.equal(files.get('Notes/gone.md').content, 'last surviving content');
  const active = files.get('Notes/gone.md');
  await assert.rejects(notes.trash(active, 'stale contents'), /changed/);
  await notes.trash(active, 'last surviving content');
  assert(isTrashed(active.path, 'Notes'));
  assert(!notes.files().includes(active));
  await notes.restore(active);
  assert.equal(active.path, 'Notes/gone.md');
  assert.equal(active.content, 'last surviving content');

  // Background helpers and label edits must never rewrite recovery versions.
  const recoveryFiles = [...files.values()].filter(file => isTrashed(file.path, 'Notes') || conflictOriginal(file.path));
  const getFiles = vault.getMarkdownFiles, readFile = vault.read;
  vault.getMarkdownFiles = () => recoveryFiles;
  let backgroundReads = 0, metadataWrites = 0;
  vault.read = async file => { backgroundReads++; return readFile(file); };
  plugin.app.metadataCache = { getFileCache: () => ({ frontmatter: { jotdrop_labels: ['Recoverable'] } }) };
  plugin.app.fileManager = { processFrontMatter: async () => { metadataWrites++; } };
  const { PreviewRescue, discoverLabels, renameLabel, deleteLabel } = module.exports;
  assert.equal(await new PreviewRescue(plugin).rescueAllNow(), 0);
  assert.equal(backgroundReads, 0, 'Preview rescue skips conflicts and Trash before reading');
  assert.deepEqual(await discoverLabels(plugin.app, 'Notes', 'Notes/Archive'), []);
  await renameLabel(plugin.app, 'Recoverable', 'Changed', 'Notes', 'Notes/Archive');
  await deleteLabel(plugin.app, 'Recoverable', 'Notes', 'Notes/Archive');
  assert.equal(metadataWrites, 0, 'Label operations cannot modify recovery versions');
  vault.getMarkdownFiles = getFiles; vault.read = readFile;

  const diff = diffLines('<script>alert(1)</script>\r\nold', '<script>alert(1)</script>\nnew');
  assert.deepEqual(diff.map(line => line.type), ['same', 'removed', 'added']);
  assert.equal(diffLines('a\n'.repeat(2500), 'b\n'.repeat(2500)), null, 'Huge changes are bounded');
  const same = 'A sufficiently long note with words that are repeated to compare safely and locally.';
  const duplicates = searchDuplicates([{ id: 'a', text: same, updatedAt: '1' }, { id: 'b', text: same, updatedAt: '2' }]);
  assert.equal(duplicates.pairs[0].kind, 'same');
  assert.equal(duplicates.pairs[0].drop, 'a');
  const many = searchDuplicates(Array.from({ length: 3000 }, (_, i) => ({ id: String(i), text: same })));
  assert.equal(many.pairs.length, 500);
  assert.equal(many.complete, false, 'Exact duplicate groups respect the limit too');
  // Worker serialization must retain every dependency, including after the normal production minifier.
  const serialized = new Function('return (' + searchDuplicates.toString() + ')')();
  assert.equal(serialized([{ id: 'a', text: same }, { id: 'b', text: same }]).pairs.length, 1);

  const now = Date.parse('2026-11-15T12:00:00Z');
  const overview = weekOverview([
    { path: 'a', title: 'A', created: now - 1000, modified: now, content: '- [ ] task\n```md\n- [ ] example\n```\n- [x] done', reminder: now - 1000 },
    { path: 'b', title: 'B', created: now - 200, modified: now - 100, content: '', reminder: now + 8 * 86400000 },
    { path: 'old', title: 'Old but edited', created: now - 8 * 86400000, modified: now, content: '', reminder: null },
  ], now);
  assert.equal(overview.created, 2);
  assert.equal(overview.changed, 3);
  assert.equal(overview.openTasks, 1, 'Code examples and checked tasks are not open tasks');
  assert.equal(overview.reminders, 1);
  assert.deepEqual(overview.newest.map(note => note.path), ['b', 'a'], 'New notes are sorted by creation, not modification');

  const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC2kAAAAASUVORK5CYII=', 'base64'));
  const drawing = { width: 1080, height: 1440, strokes: [{ color: '#2563eb', size: 14, points: [1, 2, 30, 40] }] };
  assert.deepEqual(read(withDrawing(png, drawing)), drawing, 'PNG drawing lines survive round trip');
  console.log('PASS: local conflicts, stale-write guards, recoverable trash, duplicate limits, weekly overview and drawing format.');
})().catch(error => { console.error(error); process.exitCode = 1; });
