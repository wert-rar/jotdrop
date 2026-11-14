// Production bundle, actual DOM/canvas/Workers and optional real Russian+English OCR; no real vault.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
let harness = fs.readFileSync('scripts/check-fork-browser.cjs', 'utf8').replaceAll('\r\n', '\n');
const runOcr = process.argv.includes('--ocr');
function replace(from, to) { assert(harness.includes(from), 'Fixture seam changed: ' + from); harness = harness.replace(from, to); }

async function checks({ app, plugin, metadata, text, makeView, assert, tick, runOcr }) {
  const classes = window.module.exports;
  window.activeDocument = document;
  window.IntersectionObserver = class { observe() {} disconnect() {} };
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  const TFile = window.require('obsidian').TFile;
  const files = [];
  function note(name, body, meta = {}) {
    const file = Object.assign(new TFile(), { path: 'Grail/' + name + '.md', name: name + '.md', basename: name, extension: 'md', stat: { ctime: Date.now(), mtime: Date.now() } });
    files.push(file); text.set(file, body); metadata.set(file, meta); return file;
  }
  plugin.app = app;
  plugin.localNotes = new classes.LocalNotes(plugin);
  plugin.captureTools = new classes.CaptureTools(plugin);
  plugin.resolveAssetsFolder = () => 'Grail/.attachments';
  app.vault.getMarkdownFiles = () => files;
  app.metadataCache.getFirstLinkpathDest = () => null;
  app.vault.adapter = {
    exists: async () => true,
    readBinary: async name => (await fetch('https://jotdrop.test/ocr/' + name.split('/').at(-1))).arrayBuffer(),
  };

  const taskNote = note('Tasks', '# Tasks\n\n- [x] previously done\n' + Array.from({ length: 12 }, (_, i) => '- [ ] task' + i).join('\n'));
  const board = makeView();
  board.registerDomEvent = () => {};
  await board.onOpen(); await tick();
  const card = board.gridEl.querySelector('[data-path="' + taskNote.path + '"]');
  const preview = card.querySelector('.jotdrop-card-preview');
  const list = [...preview.children].find(el => el.matches('ul,ol'));
  assert(list.children.length === 10, 'only ten open tasks are mounted');
  assert(preview.querySelector('.jotdrop-checked-tasks li').textContent.includes('previously done'), 'checked tasks are folded separately');
  assert(preview.querySelector('.jotdrop-more-tasks').textContent.includes('2'), 'remaining task count is visible');
  list.children[0].querySelector('input').click(); await tick();
  assert(text.get(taskNote).includes('- [x] task0'), 'display reorder writes the original task index');
  assert(text.get(taskNote).startsWith('# Tasks\n\n- [x] previously done'), 'ticking never reorders the source file');
  assert(preview.querySelectorAll('details li').length === 2, 'a newly completed task moves to the collapsed list');
  const done = [...preview.querySelectorAll('details li')].find(el => el.textContent.includes('task0'));
  done.querySelector('input').click(); await tick();
  assert(text.get(taskNote).includes('- [ ] task0'), 'clearing a folded task preserves its source mapping');
  const mixed = note('Mixed', '# Mixed\n\n**A paragraph**\n\n- [x] done\n- [ ] open');
  plugin.refreshViews(); await board.render(); await tick();
  assert(!board.gridEl.querySelector('[data-path="' + mixed.path + '"] .jotdrop-checked-tasks'), 'mixed Markdown retains native rendering');
  const conflict = note('Conflict.sync-conflict-20261115-120000-ABC', '# conflict');
  const trashed = note('Trash/123/Grail/Old', '# removed');
  plugin.refreshViews(); await board.render();
  assert(!board.lastFiltered.some(card => card.file === conflict || card.file === trashed), 'conflict copies and Trash are not normal board cards');
  assert(board.localToolsButton.dataset.conflicts === '1', 'the toolbar signals unresolved Syncthing conflicts');

  const real = new classes.default();
  Object.assign(real, { app, settings: plugin.settings });
  let refreshes = 0;
  real.refreshViews = () => { refreshes++; };
  real.handleVaultChange(Object.assign(new TFile(), { path: 'Elsewhere/picture.png', extension: 'png' }));
  real.handleVaultChange(Object.assign(new TFile(), { path: 'Elsewhere/log.txt', extension: 'txt' }));
  real.handleVaultChange({ path: 'Elsewhere/new-folder' });
  assert(refreshes === 0, 'unrelated images, logs and folders cause no refresh');
  real.handleVaultChange(Object.assign(new TFile(), { path: 'Grail/.attachments/picture.png', extension: 'png' }));
  assert(refreshes === 1, 'managed attachments still refresh');

  const drawingNote = note('Sketch.excalidraw', '---\nexcalidraw-plugin: parsed\n---\ncompressed-json: private drawing data');
  const exported = { path: 'Grail/Sketch.excalidraw.png', stat: { mtime: Date.now() } };
  app.vault.getFileByPath = name => name === exported.path ? exported : null;
  app.vault.getResourcePath = () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC2kAAAAASUVORK5CYII=';
  let opened;
  app.workspace.getLeaf = () => ({ openFile: async file => { opened = file; } });
  plugin.refreshViews(); await board.render(); await tick();
  const drawingCard = board.gridEl.querySelector('[data-path="' + drawingNote.path + '"]');
  assert(!!drawingCard.querySelector('img'), 'Excalidraw uses its exported image');
  assert(!drawingCard.textContent.includes('compressed-json'), 'Excalidraw JSON is never a card preview');
  drawingCard.querySelector('.jotdrop-card-body').click(); await tick();
  assert(opened === drawingNote, 'drawing cards open the drawing file without the JotDrop editor');

  const same = 'A sufficiently long duplicate note with exactly the same meaningful words and content.';
  note('Duplicate A', '# First title\n\n' + same);
  note('Duplicate B', '# Another title\n\n' + same);
  const duplicates = new classes.DuplicatesModal(app, plugin);
  await duplicates.onOpen();
  for (let i = 0; i < 100 && !duplicates.contentEl.querySelector('h4'); i++) await new Promise(resolve => setTimeout(resolve, 20));
  assert(duplicates.contentEl.querySelector('h4')?.textContent.includes('First title'), 'real production Worker finds duplicates despite different titles');
  duplicates.close();
  assert(duplicates.worker === null, 'closing duplicate search releases the Worker');

  let saved;
  const drawing = new classes.DrawingModal(app, null, async png => { saved = png; });
  drawing.onOpen();
  const canvas = drawing.contentEl.querySelector('canvas');
  const rect = canvas.getBoundingClientRect();
  for (const [type, x, y] of [['pointerdown', 20, 20], ['pointermove', 80, 60], ['pointerup', 80, 60]]) {
    canvas.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: rect.left + x, clientY: rect.top + y, bubbles: true }));
  }
  assert(drawing.contentEl.querySelector('.jd-draw').dataset.strokes === '1', 'drawing accepts a mouse stroke');
  drawing.contentEl.querySelector('.jd-draw-undo').click();
  assert(drawing.contentEl.querySelector('.jd-draw').dataset.strokes === '0', 'drawing undo works');
  drawing.contentEl.querySelector('.jd-draw-redo').click();
  drawing.contentEl.querySelector('.jd-draw-save').click();
  for (let i = 0; i < 100 && !saved; i++) await new Promise(resolve => setTimeout(resolve, 20));
  assert(saved?.length > 100, 'canvas saves a PNG with drawing data');
  assert(new TextDecoder().decode(saved).includes('jotdrop-drawing'), 'the PNG contains reeditable lines');

  const binaries = new Map();
  const folders = new Set(['Grail', 'Grail/.attachments']);
  app.vault.adapter.exists = async path => folders.has(path) || binaries.has(path) || files.some(file => file.path === path);
  app.vault.adapter.writeBinary = async (path, bytes) => { assert(!binaries.has(path), 'never overwrite another photo'); binaries.set(path, bytes); };
  app.vault.getAbstractFileByPath = path => files.find(file => file.path === path) ?? (folders.has(path) ? {} : null);
  app.vault.createFolder = async path => folders.add(path);
  app.vault.create = async (path, content) => {
    assert(!files.some(file => file.path === path), 'never overwrite another note');
    const file = note(path.slice('Grail/'.length, -3), content);
    return file;
  };
  const firstPhoto = await plugin.captureTools.savePhoto('same.png', saved.slice().buffer, 'recognized text');
  const secondPhoto = await plugin.captureTools.savePhoto('same.png', saved.slice().buffer, 'other text');
  assert(firstPhoto.path !== secondPhoto.path && binaries.size === 2, 'same-name photos get separate notes and attachment files');
  const originalText = text.get(mixed);
  await plugin.captureTools.savePhoto('attached.png', saved.slice().buffer, 'additional text', mixed);
  assert(text.get(mixed).startsWith(originalText) && text.get(mixed).includes('additional text'), 'adding a photo preserves the existing note');
  plugin.manifest = { dir: '.obsidian/plugins/jotdrop' };
  const savedCount = files.length;
  const photo = new classes.PhotoModal(app, plugin, new File([saved], 'cancelled.png', { type: 'image/png' }));
  await photo.onOpen(); photo.close();
  assert(files.length === savedCount && binaries.size === 3, 'cancelling a photo creates no note or attachment');

  if (runOcr) {
    const canvas = document.createElement('canvas');
    canvas.width = 1000; canvas.height = 230;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 1000, 230);
    ctx.fillStyle = 'black'; ctx.font = '52px Arial'; ctx.fillText('Привет мир', 30, 80); ctx.fillText('Hello world', 30, 170);
    const image = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const ocr = new classes.LocalOcr(app, '.obsidian/plugins/jotdrop');
    const result = await ocr.recognize(image, () => {});
    assert(/привет/i.test(result) && /hello/i.test(result), 'real offline OCR recognizes Russian and English');
    const readBinary = app.vault.adapter.readBinary;
    app.vault.adapter.readBinary = async () => new Uint8Array([1, 2, 3]).buffer;
    let corrupt = false;
    try { await ocr.recognize(image, () => {}); } catch (error) { corrupt = String(error).includes('data-missing'); }
    assert(corrupt, 'damaged model data is rejected before recognition');
    app.vault.adapter.readBinary = readBinary;
  }
  await board.onClose();
  // Leave a real comparison visible for a visual check.
  new classes.CompareNotesModal(app, '---\ncolor: red\n---\n# Shopping\n\n- [ ] Milk\n- [ ] Bread\n<script>not executable</script>', '---\ncolor: blue\n---\n# Shopping\n\n- [x] Milk\n- [ ] Coffee\n<script>not executable</script>', ['Shopping.md', 'Shopping.sync-conflict-20261115-120000-ABC.md'], async () => {}).open();
  assert(!document.querySelector('.jotdrop-diff script'), 'comparison treats HTML as plain text');
}

replace("const dragWindowOnly = process.argv.includes('--drag-window');", 'const dragWindowOnly = true;');
replace('class Component {', 'class TFile {}\n      class Component {');
replace('Plugin: Component, PluginSettingTab:', 'TFile, Plugin: Component, PluginSettingTab:');
replace("await page.route('**/*', route => route.abort());", `await page.route('**/*', route => {
  const url = route.request().url();
  if (url === 'https://jotdrop.test/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head></head><body></body></html>' });
  const model = url.match(/^https:\\/\\/jotdrop\\.test\\/ocr\\/(eng|rus)\\.traineddata$/);
  if (model) return route.fulfill({ contentType: 'application/octet-stream', body: fs.readFileSync(path.join('work/ocr-models', model[1] + '.traineddata')) });
  throw new Error('Unexpected network access: ' + url);
});`);
replace("await page.setContent('<!doctype html><html><head></head><body></body></html>');", "await page.goto('https://jotdrop.test/');");
replace('      if (dragWindowOnly) {', `      if (dragWindowOnly) {
  await (${checks.toString()})({app,plugin,metadata,text,makeView,assert,tick,runOcr:${runOcr}});
  return {checks};
}
if (dragWindowOnly) {`);
replace('    if (dragWindowOnly) {\n      console.log', `    if (dragWindowOnly) {
  await page.screenshot({path:'work/verification/local-tools-preview.png',fullPage:true});
  console.log('PASS: '+result.checks+' local tools browser checks${runOcr ? ' including real Russian+English OCR' : ''}'); return;
}
if (dragWindowOnly) {
      console.log`);
async function prepare() {
  if (runOcr) {
    const { createHash } = require('node:crypto');
    const models = { eng: '7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2', rus: 'e16e5e036cce1d9ec2b00063cf8b54472625b9e14d893a169e2b0dedeb4df225' };
    fs.mkdirSync('work/ocr-models', { recursive: true });
    for (const [language, hash] of Object.entries(models)) {
      const file = path.join('work/ocr-models', language + '.traineddata');
      if (!fs.existsSync(file)) {
        const response = await fetch('https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/87416418657359cb625c412a48b6e1d6d41c29bd/' + language + '.traineddata');
        if (!response.ok) throw new Error('OCR model download: ' + response.status);
        const data = Buffer.from(await response.arrayBuffer());
        assert.equal(createHash('sha256').update(data).digest('hex'), hash);
        fs.writeFileSync(file, data);
      }
      assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'), hash);
    }
  }
  new Function('require', harness)(require);
}
prepare().catch(error => { console.error(error); process.exitCode = 1; });
