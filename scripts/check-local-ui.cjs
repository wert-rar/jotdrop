// Reproduces duplicated drawing covers and checks the compact local-tools UI.
const fs = require('node:fs');
const assert = require('node:assert/strict');
let harness = fs.readFileSync('scripts/check-fork-browser.cjs', 'utf8').replaceAll('\r\n', '\n');
function replace(from, to) { assert(harness.includes(from), 'Fixture seam changed: ' + from); harness = harness.replace(from, to); }
async function checks({app,plugin,metadata,text,makeView,assert,tick}) {
  window.activeDocument = document;
  window.IntersectionObserver = class {observe(){} disconnect(){}};
  window.ResizeObserver = class {observe(){} unobserve(){} disconnect(){}};
  const failures=[];
  const check=(ok,message)=>{ if(!ok)failures.push(message); };
  const classes=window.module.exports;
  const TFile=window.require('obsidian').TFile;
  const files=[];
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC2kAAAAASUVORK5CYII=';
  function note(name,body,index=0) {
    const time=Date.now()-index*1000;
    const file=Object.assign(new TFile(),{path:'Grail/'+name+'.md',name:name+'.md',basename:name,extension:'md',stat:{ctime:time,mtime:time}});
    files.push(file);text.set(file,body);metadata.set(file,{});return file;
  }
  const drawing=note('Drawing','# Drawing\n\n![[drawing.png]]');
  const multiple=note('Multiple','# Multiple\n\n![[drawing.png]]\n\n**Caption**\n\n![[other.png]]');
  const unresolved=note('Hidden attachment','# Hidden attachment\n\n![[Grail/.attachments/unresolved.png]]\n\nCaption');
  plugin.app=app;
  plugin.localNotes=new classes.LocalNotes(plugin);
  plugin.captureTools=new classes.CaptureTools(plugin);
  plugin.resolveAssetCandidates=(_,name)=>[{vaultPath:'Grail/.attachments/'+name,file:null}];
  app.vault.getResourcePath=file=>png+'#'+file.name;
  app.vault.adapter={getResourcePath:name=>png+'#'+name.split('/').at(-1)};
  app.vault.getMarkdownFiles=()=>files;
  const board=makeView();board.registerDomEvent=()=>{};
  await board.onOpen();await tick();
  const card=board.gridEl.querySelector('[data-path="'+drawing.path+'"]');
  check(card.querySelectorAll('img').length===1,'drawing must appear once, not as both cover and Markdown embed');
  const multi=board.gridEl.querySelector('[data-path="'+multiple.path+'"]');
  check(multi.querySelectorAll('img').length===2,'only the repeated cover is removed; other images stay');
  check(multi.querySelector('strong')?.textContent==='Caption','image deduplication preserves rich Markdown text');
  const hidden=board.gridEl.querySelector('[data-path="'+unresolved.path+'"]');
  check(!hidden.querySelector('.mod-empty-attachment'),'a hidden-folder cover must not repeat as a missing-file placeholder');
  const toolButtons=board.normalToolbarEl.querySelectorAll('[data-local-tool]');
  check(toolButtons.length===6,'all six local tools must be direct toolbar icon buttons');
  check(board.normalToolbarEl.querySelectorAll('[data-icon="ellipsis"]').length===0,'the tools overflow menu is removed');
  for(let index=0;index<120;index++)note('New '+index,'# New '+index+'\n\n- [ ] task '+index,index);
  const week=new classes.WeekModal(app,plugin);await week.onOpen();
  check(week.contentEl.querySelectorAll('.jotdrop-week-stat').length===4,'week overview must show four numerical statistics');
  check(week.contentEl.querySelectorAll('.jotdrop-week-note').length===10,'week overview must show only ten newest notes');
  check(week.contentEl.querySelectorAll('a').length<=10,'week overview must not mount hundreds of note/task links');
  check(!/background indexing|фоновой индексации/.test(week.contentEl.textContent),'technical implementation text is not displayed');
  week.close();
  await board.onClose();
  assert(failures.length===0,failures.join(' | '));
}
replace("const dragWindowOnly = process.argv.includes('--drag-window');",'const dragWindowOnly = true;');
replace('class Component {','class TFile {}\n      class Component {');
replace('Plugin: Component, PluginSettingTab:','TFile, Plugin: Component, PluginSettingTab:');
replace('target.innerHTML = fixtureMarkdown.render(md);',String.raw`target.innerHTML = fixtureMarkdown.render(md.replace(/!\[\[([^\]]+)\]\]/g, ''));
  for(const match of md.matchAll(/!\[\[([^\]]+)\]\]/g)) {
    if(match[1].endsWith('unresolved.png')) {
      target.createSpan({cls:'internal-embed file-embed mod-empty-attachment',text:'File cannot be found',attr:{src:match[1]}});continue;
    }
    const embed=target.createSpan({cls:'internal-embed image-embed'});
    embed.createEl('img',{attr:{src:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC2kAAAAASUVORK5CYII=#'+match[1].split('/').at(-1)}});
  }`);
replace('      if (dragWindowOnly) {',`      if (dragWindowOnly) {
  await (${checks.toString()})({app,plugin,metadata,text,makeView,assert,tick});return {checks};
}
if (dragWindowOnly) {`);
replace('    if (dragWindowOnly) {\n      console.log',`    if (dragWindowOnly) {
  console.log('PASS: drawing deduplication, six toolbar icons and compact week overview');return;
}
if (dragWindowOnly) {\n      console.log`);
fs.mkdirSync('work/verification',{recursive:true});
new Function('require',harness)(require);
