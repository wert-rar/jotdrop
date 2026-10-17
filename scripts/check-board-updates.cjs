// Real production bundle and browser; disposable notes and mocked Obsidian APIs.
const fs = require('node:fs');
const assert = require('node:assert/strict');
let harness = fs.readFileSync('scripts/check-fork-browser.cjs', 'utf8').replaceAll('\r\n', '\n');
function replace(from, to) {
  assert(harness.includes(from), 'Browser fixture seam changed: ' + from);
  harness = harness.replace(from, to);
}
async function checks({app, plugin, metadata, text, makeView, assert, tick}) {
  window.activeDocument = document;
  window.IntersectionObserver = class { observe() {} disconnect() {} };
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  const notes = Array.from({length:121}, (_,i) => ({path:'Grail/Search'+i+'.md',name:'Search'+i+'.md',basename:'Search'+i,stat:{ctime:121-i,mtime:121-i}}));
  for (const [i,file] of notes.entries()) {
    metadata.set(file,{tags:['shared'],color:'default'});
    text.set(file,'# Shared '+i+'\n\n'+(i%2 ? 'odd' : 'even'));
  }
  app.vault.getMarkdownFiles = () => notes;
  const originalRead = app.vault.cachedRead;
  let reads = 0;
  app.vault.cachedRead = async file => { reads++; return originalRead(file); };
  const board = makeView();
  board.registerDomEvent = () => {};
  await board.onOpen();
  const initial = new Map([...board.gridEl.querySelectorAll('.jotdrop-card')].map(el=>[el.dataset.path,el]));
  const render = board.render.bind(board);
  let pending;
  board.render = (...args) => pending = render(...args);
  const search = async query => {
    reads = 0;
    board.searchEl.value = query;
    board.searchEl.dispatchEvent(new Event('input'));
    await new Promise(resolve=>setTimeout(resolve,150));
    await pending;
    assert(reads===0, 'search must reuse note contents: '+reads+' reads');
    assert(board.renderLimit===60, 'search resets the loaded window');
  };
  await search('even');
  assert(board.lastFiltered.length===61, 'search selects matching bodies');
  for (const el of board.gridEl.querySelectorAll('.jotdrop-card')) {
    if (initial.has(el.dataset.path)) assert(initial.get(el.dataset.path)===el, 'search retains common DOM');
  }
  await search('no-such-body');
  assert(board.gridEl.querySelectorAll('.jotdrop-card').length===0, 'empty search results');
  await search('');
  assert(board.lastFiltered.length===121, 'cleared search restores all notes');
  assert([...initial].every(([path,el])=>board.gridEl.contains(el)), 'clear search restores original DOM');
  board.searchEl.value='odd'; board.searchEl.dispatchEvent(new Event('input'));
  await search('even');
  assert(board.lastFiltered.length===61, 'rapid searches use final query');
  await board.onClose(); board.contentEl.remove();
  assert(board.children.size===0, 'search components released on close');

  const realPlugin = new module.exports.default();
  Object.assign(realPlugin,{app,settings:plugin.settings});
  const events = {};
  app.vault.on=(name,callback)=>{events['vault:'+name]=callback;};
  app.metadataCache.on=(name,callback)=>{events['metadata:'+name]=callback;};
  realPlugin.registerEvent=()=>{};
  let reminders=0;
  realPlugin.reminderScheduler={scheduleFile(){reminders++;},cancelFile(){reminders++;}};
  realPlugin.registerBoardEvents();
  for(const file of notes){Object.setPrototypeOf(file,window.require('obsidian').TFile.prototype);file.extension='md';}
  const views = [makeView(realPlugin),makeView(realPlugin)];
  app.workspace.getLeavesOfType = () => views.map(view=>({view}));
  const node = (view,path) => [...view.gridEl.querySelectorAll('.jotdrop-card')].find(el=>el.dataset.path===path);
  const invalidate = (kind,paths) => realPlugin.refreshViews(paths ? {kind,paths} : {kind},false);
  const flush = async () => { window.clearTimeout(realPlugin.refreshTimer);realPlugin.refreshTimer=null;await Promise.all(views.map(view=>view.render())); };
  await flush();
  const changed = notes[0], unchanged = notes[1];
  const keep = views.map(view=>node(view,unchanged.path));
  const oldComponents = views.map(view=>view.markdownComponents.filter(entry=>node(view,changed.path).contains(entry.target)).map(entry=>entry.component));
  const beforeRenders=rendered.length;
  reads=0; text.set(changed,'# Shared changed\n\nnew content');
  events['vault:modify'](changed); await flush();
  assert(reads===2 && rendered.length-beforeRenders===2, 'one changed file is read/rendered once per open view');
  views.forEach((view,i)=>{
    assert(node(view,unchanged.path)===keep[i], 'external update retains other DOM');
    assert(oldComponents[i].every(component=>!view.children.has(component)), 'replaced card unloads its components');
  });
  reads=0;metadata.get(changed).tags=['changed-tag'];
  events['metadata:changed'](changed); await flush();
  assert(reads===0 && views.every(view=>view.lastFiltered.find(card=>card.file===changed).meta.tags.includes('changed-tag')), 'metadata refresh updates tags without content reads');
  const yamlRead=app.vault.cachedRead;
  metadata.get(changed).pinned=true;
  app.vault.cachedRead=async file=>file===changed?text.get(file):yamlRead(file);
  invalidate('files',[changed.path]);await flush();
  assert(views.every(view=>!view.cardCache.get(changed.path).meta.pinned && view.cardCache.get(changed.path).order===Infinity),'removed frontmatter overrides stale cached pin and rank');
  metadata.get(changed).pinned=false;app.vault.cachedRead=yamlRead;
  invalidate('files',[changed.path]);await flush();
  assert(reminders===1,'vault modification still updates reminders');
  const beforeSuppression=rendered.length;
  realPlugin.suppressModifyOnce(changed.path);
  text.set(changed,'# Checkbox\n\n- [x] task');
  events['vault:modify'](changed);events['metadata:changed'](changed);
  assert(realPlugin.refreshTimer===null && rendered.length===beforeSuppression,'own writes invalidate without an immediate board refresh');
  reads=0;await Promise.all(views.map(view=>view.render(true)));
  assert(reads===2 && views.every(view=>node(view,changed.path).querySelector('.task-list-item-checkbox').checked),'next filter uses saved checkbox state');
  const beforeLayout=views.map(view=>node(view,unchanged.path));
  reads=0;realPlugin.settings.sortMode='title-asc';invalidate('layout');await flush();
  assert(reads===0 && views.every((view,i)=>node(view,unchanged.path)===beforeLayout[i]),'sorting moves existing cards without reads or Markdown work');
  realPlugin.settings.sortMode='modified-desc';invalidate('layout');await flush();
  reads=0;const beforeAssets=rendered.length;
  invalidate('assets');await flush();
  assert(reads===0 && rendered.length>beforeAssets, 'assets redraw without rereading notes');
  const version=realPlugin.cardsVersion;
  const outside=Object.assign(new (window.require('obsidian').TFile)(),{path:'Elsewhere/Unrelated.md',extension:'md'});
  realPlugin.handleVaultChange(outside);
  assert(realPlugin.cardsVersion===version && realPlugin.refreshTimer===null,'unrelated Markdown causes no refresh');
  const oldCache=app.metadataCache.getFileCache;
  app.metadataCache.getFileCache=file=>({...oldCache(file),embeds:file===changed?[{link:'Unrelated'}]:[]});
  app.metadataCache.getFirstLinkpathDest=()=>outside;
  realPlugin.handleVaultChange(outside);await flush();
  assert(realPlugin.cardsVersion>version,'external embedded Markdown triggers refresh');
  app.metadataCache.getFileCache=oldCache;
  app.metadataCache.getFirstLinkpathDest=()=>null;

  const added={path:'Grail/New.md',name:'New.md',basename:'New',stat:{ctime:500,mtime:500}};
  notes.unshift(added);metadata.set(added,{tags:['shared']});text.set(added,'New note');
  reads=0;invalidate('files',[added.path]);await flush();
  assert(reads===2 && views.every(view=>node(view,added.path)), 'new note loads once in each view');
  const oldPath=added.path;added.path='Grail/Sub/Renamed.md';added.name='Renamed.md';added.basename='Renamed';
  reads=0;invalidate('files',[oldPath,added.path]);await flush();
  assert(reads===2 && views.every(view=>!view.cardCache.has(oldPath)&&node(view,added.path)), 'rename discards old key and loads new path');
  reads=0;added.path='Grail/Moved/Renamed.md';events['vault:rename']({path:'Grail/Moved'},'Grail/Sub');await flush();
  assert(reads===2 && views.every(view=>!view.cardCache.has('Grail/Sub/Renamed.md')&&node(view,added.path)),'folder rename updates descendant paths');
  added.path='Grail/Archive/Renamed.md';invalidate('files',['Grail/Moved/Renamed.md',added.path]);await flush();
  assert(views.every(view=>!view.lastFiltered.some(card=>card.file===added)), 'archived note disappears');
  notes.splice(notes.indexOf(added),1);invalidate('files',[added.path]);await flush();
  assert(views.every(view=>!view.cardCache.has(added.path)), 'deleted note is evicted');

  // A stale read must not consume a newer invalidation or replace the grid.
  const readNow=app.vault.cachedRead;
  let release, entered;
  const gate=new Promise(resolve=>{release=resolve;});
  const started=new Promise(resolve=>{entered=resolve;});
  let pause=true;
  app.vault.cachedRead=async file=>{const value=await readNow(file);if(pause){pause=false;entered();await gate;}return value;};
  text.set(changed,'Older result');invalidate('files',[changed.path]);
  const stale=views[0].render();await started;
  text.set(changed,'Newest result');invalidate('files',[changed.path]);
  await flush();release();await stale;
  assert(views.every(view=>view.cardCache.get(changed.path).content.includes('Newest result')), 'newer invalidation wins over pending read');
  app.vault.cachedRead=readNow;
  invalidate('files',[changed.path]);
  app.vault.cachedRead=async()=>{throw new Error('fixture read failure');};
  let failed=false;try{await views[0].render();}catch(error){failed=error.message==='fixture read failure';}
  assert(failed && views[0].dirtyContents.has(changed.path),'failed reads retain invalidation');
  app.vault.cachedRead=readNow;await flush();
  assert(!views[0].dirtyContents.has(changed.path),'successful retry consumes invalidation');
  let releaseClosing,enterClosing;
  const closingGate=new Promise(resolve=>{releaseClosing=resolve;});
  const closingStarted=new Promise(resolve=>{enterClosing=resolve;});
  app.vault.cachedRead=async file=>{const value=await readNow(file);enterClosing();await closingGate;return value;};
  invalidate('files',[changed.path]);const closing=views[0].render();await closingStarted;
  await views[0].onClose();const countAtClose=rendered.length;releaseClosing();await closing;
  assert(rendered.length===countAtClose && views[0].cardCache.size===0 && views[0].children.size===0,'closing discards pending data and components');
  app.vault.cachedRead=readNow;
  for(const view of views){await view.onClose();view.contentEl.remove();assert(view.children.size===0,'all card components released on close');}
}
replace("const dragWindowOnly = process.argv.includes('--drag-window');", 'const dragWindowOnly = true;');
replace('class Component {', 'class TFile {}\n      class Component {');
replace('Plugin: Component, PluginSettingTab:', 'TFile, Plugin: Component, PluginSettingTab:');
replace('      if (dragWindowOnly) {', `      if (dragWindowOnly) {
        await (${checks.toString()})({app,plugin,metadata,text,makeView,assert,tick});
        return {checks};
      }
      if (dragWindowOnly) {`);
replace('    if (dragWindowOnly) {\n      console.log', `    if (dragWindowOnly) {
      console.log('PASS: '+result.checks+' board update checks'); return;
    }
    if (dragWindowOnly) {
      console.log`);
new Function('require', harness)(require);
