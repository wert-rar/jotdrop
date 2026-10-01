// Isolated browser integration test: actual installed bundle + mocked Obsidian services.
// Never opens the real vault or writes user notes. MarkdownRenderer is an API-contract stub.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 760, height: 780 } });
    await page.setContent('<!doctype html><html><head></head><body></body></html>');
    await page.addScriptTag({ path: path.join(path.dirname(require.resolve('markdown-it')), 'browser/markdown-it.umd.min.js') });
    await page.addStyleTag({ content: `body {font:14px Arial;background:#eee;color:#222} :root {--background-primary:white;--background-secondary:#f7f7f7;--background-modifier-border:#ddd;--text-normal:#222;--text-muted:#777;--interactive-accent:#9270ff;--background-modifier-hover:#eee} .modal {width:530px;margin:20px auto;background:white;border:1px solid #ccc;border-radius:12px} .modal-title {font-size:20px;font-weight:600} button,input,textarea {font:inherit;box-sizing:border-box} button,input {border:1px solid #ddd;border-radius:5px;background:white} button {cursor:pointer} .mod-cta {background:#9270ff;color:white} [hidden]{display:none!important}` });
    await page.addStyleTag({ content: fs.readFileSync('styles.css', 'utf8') });
    await page.evaluate(() => {
      window.module = { exports: {} };
      window.notices = [];
      window.rendered = [];
      const fixtureMarkdown = window.markdownit({ html: true });
      fixtureMarkdown.core.ruler.after('inline', 'fixture-task-checkboxes', state => {
        state.tokens.forEach((token, index) => {
          if (token.type !== 'inline' || state.tokens[index - 2]?.type !== 'list_item_open' || !/^\[[ xX]\] /.test(token.content)) return;
          const checked = /^\[[xX]\]/.test(token.content);
          token.children[0].content = token.children[0].content.slice(4);
          const checkbox = new token.constructor('html_inline', '', 0);
          checkbox.content = `<input class="task-list-item-checkbox" type="checkbox"${checked ? ' checked' : ''}>`;
          token.children.unshift(checkbox);
          state.tokens[index - 2].attrSet('class', 'task-list-item');
        });
      });
      HTMLElement.prototype.createEl = function (tag, options = {}) {
        const el = document.createElement(tag);
        if (options.cls) el.className = options.cls;
        if (options.text) el.textContent = options.text;
        for (const [key, value] of Object.entries(options.attr || {})) el.setAttribute(key, value);
        this.appendChild(el); return el;
      };
      HTMLElement.prototype.createDiv = function (options) { return this.createEl('div', options); };
      HTMLElement.prototype.createSpan = function (options) { return this.createEl('span', options); };
      HTMLElement.prototype.empty = function () { this.replaceChildren(); };
      HTMLElement.prototype.setText = function (text) { this.textContent = text; };
      HTMLElement.prototype.appendText = function (text) { this.append(document.createTextNode(text)); };
      HTMLElement.prototype.addClass = function (...names) { this.classList.add(...names); };
      HTMLElement.prototype.toggleClass = function (name, value) { this.classList.toggle(name, value); };
      class Component {
        constructor() { this.children = new Set(); }
        addChild(child) { this.children.add(child); child.load(); return child; }
        removeChild(child) { this.children.delete(child); child.unload(); }
        load() {}
        onunload() {}
        unload() { this.onunload(); for (const child of this.children) child.unload(); this.children.clear(); }
      }
      class Modal {
        constructor(app) {
          this.app = app; this.modalEl = document.body.createDiv({cls:'modal'});
          this.titleEl = this.modalEl.createDiv({cls:'modal-title'});
          this.contentEl = this.modalEl.createDiv({cls:'modal-content'});
          this.scope = { register() {} };
        }
        close() { this.onClose(); this.modalEl.remove(); }
      }
      class NativeEditor extends Component {
        constructor(app, container, owner) {
          super(); this.app=app; this.owner=owner; this.value=''; this.sourceMode=true;
          this.editorEl=container.createDiv({cls:'markdown-source-view mod-cm6'});
          this.content=this.editorEl.createDiv({attr:{contenteditable:'true'},cls:'cm-content'});
          this.content.addEventListener('input',()=>this.set(this.content.textContent));
          this.editor={
            getValue:()=>this.value,setValue:value=>this.set(value),
            getCursor:()=>({line:0,ch:0}),getLine:line=>this.value.split('\n')[line],
            replaceSelection:value=>this.set(value+this.value),focus:()=>this.content.focus(),
            replaceRange:(value,from,to)=>{const lines=this.value.split('\n');lines.splice(from.line,to.line-from.line+1,value);this.set(lines.join('\n'));}
          };
        }
        onUpdate() {}
        set(value) {this.value=value;this.content.textContent=value;this.editorEl.classList.toggle('is-live-preview',!this.sourceMode);this.onUpdate({docChanged:true},true);}
        get(){return this.value;}
        destroy(){this.destroyed=true;this.editorEl.remove();}
      }
      class WidgetEditor extends NativeEditor {}
      window.editorProbe = (context,file) => {
        if(file!==null)throw new Error('Probe must not attach a real file');
        return {load(){},showEditor(){this.editMode=new WidgetEditor(context.app,context.containerEl,{});},unload(){this.editMode?.destroy();}};
      };
      window.require = name => {
        if (name !== 'obsidian') throw new Error('Unexpected dependency: ' + name);
        return {
          Plugin: Component, PluginSettingTab: Component, ItemView: Component, Component, Modal,
          SuggestModal: Modal, Notice: class { constructor(message) { notices.push(message); } },
          normalizePath: p => p.replace(/\\/g, '/'), getLanguage: () => 'en',
          parseYaml:JSON.parse,
          setIcon: (el, name) => { el.dataset.icon = name; el.textContent = ({pin:'♧','pin-off':'♧',link:'↗','list-todo':'☑',archive:'▣',bell:'♧',pencil:'✎',eye:'◉'})[name] || name; },
          MarkdownRenderer: { render: async (app, md, target, sourcePath, component) => {
            rendered.push({ md, sourcePath, component });
            target.innerHTML = fixtureMarkdown.render(md);
          } }
        };
      };
    });
    const installed = fs.readFileSync('main.js', 'utf8');
    await page.addScriptTag({ content: installed + '\nwindow.fixtureClasses={EditModal:module.exports.EditNoteModal,View:module.exports.JotDropView};' });
    const result = await page.evaluate(async () => {
      let checks = 0;
      const assert = (value, message) => { if (!value) throw new Error(message); checks++; };
      const tick = () => new Promise(resolve => setTimeout(resolve, 0));
      const files = ['A','B','C','Pinned'].map((name, i) => ({ path:`Grail/${name}.md`, name:`${name}.md`, basename:name, stat:{ctime:100-i,mtime:100-i} }));
      const metadata = new Map(files.map(file => [file, { pinned:file.basename === 'Pinned', tags:['reading'], color:'default' }]));
      const text = new Map(files.map(file => [file, '# ' + file.basename + '\n\n**bold**\n\n- [ ] task']));
      const writes = [];
      const app = {
        metadataCache: {getFileCache: file => ({frontmatter: metadata.get(file)}),getTags:()=>({})},
        vault: {
          getMarkdownFiles:()=>files, cachedRead:async file=>'---\n'+JSON.stringify(metadata.get(file))+'\n---\n'+text.get(file), read:async file=>text.get(file),
          getAbstractFileByPath:()=>({}), createFolder:async()=>{},
          modify:async(file,value)=>text.set(file,value), process:async(file,callback)=>{const value=callback(text.get(file));text.set(file,value);if(plugin.suppressedPaths.has(file.path))plugin.suppressedPaths.delete(file.path);else plugin.refreshViews();return value;}
        },
        fileManager: {
          processFrontMatter:async(file,callback)=>{writes.push(file.path); callback(metadata.get(file));if(plugin.suppressedPaths.has(file.path))plugin.suppressedPaths.delete(file.path);else plugin.refreshViews();},
          renameFile:async(file,newPath)=>{file.path=newPath;}
        }, workspace:{openLinkText:async()=>{}},embedRegistry:{embedByExtension:{md:editorProbe}}
      };
      let refreshes = 0;
      const plugin = {settings:{notesFolder:'Grail',archiveFolder:'Grail/Archive',sortMode:'modified-desc',showArchived:false},saveSettings:async()=>{},refreshViews:()=>{refreshes++;},resolveAssetCandidates:()=>[],suppressedPaths:new Set(),suppressModifyOnce(path){this.suppressedPaths.add(path);}};
      const makeView = (viewPlugin=plugin) => {
        const contentEl=document.body.createDiv({cls:'fixture-board'});
        Object.assign(contentEl.style,{height:'160px',width:'300px',overflow:'auto'});
        return Object.assign(new fixtureClasses.View({},viewPlugin), {app,plugin:viewPlugin,contentEl,gridEl:contentEl.createDiv(),selectedPaths:new Set(),selectionMode:false,markdownComponents:[]});
      };
      const view = makeView();
      const ordinary = async () => (await view.collectCards()).filter(card=>!card.meta.pinned).map(card=>card.file.basename).join(',');
      assert(await ordinary()==='A,B,C','initial date order');
      const cachedReadBeforeMalformed = app.vault.cachedRead;
      app.vault.cachedRead = async file => file === files[0]
        ? '---\ntags: [unfinished\n---\n# A\nBody'
        : cachedReadBeforeMalformed(file);
      const malformedCards = await view.collectCards();
      assert(malformedCards.length === files.length, 'malformed YAML does not prevent collection of other notes');
      assert(malformedCards.find(card => card.file === files[3]).meta.pinned, 'valid YAML still supplies pinned state');
      assert(malformedCards.find(card => card.file === files[0]).order === Infinity, 'malformed YAML has a safe default rank');
      const malformedBoard = makeView();
      await malformedBoard.render(); await tick();
      assert(malformedBoard.gridEl.querySelectorAll('.jotdrop-card').length === files.length, 'malformed YAML does not blank the rendered board');
      assert(writes.length === 0 && text.get(files[0]).includes('**bold**'), 'malformed YAML fallback does not rewrite notes');
      await malformedBoard.onClose();
      malformedBoard.contentEl.remove();
      metadata.get(files[0]).jotdrop_order = 4096;
      metadata.get(files[0]).pinned = true;
      const cachedFallback = (await view.collectCards()).find(card => card.file === files[0]);
      assert(cachedFallback.order === 4096 && cachedFallback.meta.pinned, 'malformed YAML retains cached rank and pin when available');
      delete metadata.get(files[0]).jotdrop_order;
      metadata.get(files[0]).pinned = false;
      app.vault.cachedRead = cachedReadBeforeMalformed;
      await view.collectCards();
      await view.moveCard(files[2].path,files[0].path,false);
      assert(plugin.settings.sortMode==='manual','drop enables manual mode');
      assert(await ordinary()==='C,A,B','move before');
      assert(refreshes===0,'drag/drop must not rebuild the board and reset its scroll');
      files[0].stat.mtime = 999999;
      assert((await makeView().collectCards()).filter(card=>!card.meta.pinned).map(card=>card.file.basename).join(',')==='C,A,B','order survives view recreation and edits');
      const writesBeforeMove=writes.length;
      await view.moveCard(files[2].path,files[1].path,true);
      assert(writes.length-writesBeforeMove===1,'ordinary reorder writes only the dragged note');
      assert(await ordinary()==='A,B,C','move after');
      view.query='A';
      await view.moveCard(files[2].path,files[0].path,false);
      assert(await ordinary()==='C,A,B','hidden cards keep their relative order');
      await view.moveCard(files[2].path,files[3].path,true);
      assert(metadata.get(files[2]).pinned===true,'cross-section drop updates pin');
      const before = writes.length;
      await view.moveCard(files[0].path,files[0].path,true);
      assert(writes.length===before,'self drop writes nothing');
      const originalWrite = app.fileManager.processFrontMatter;
      app.fileManager.processFrontMatter = async()=>{throw new Error('fixture write failure');};
      let failed = false;
      try { await view.moveCard(files[1].path,files[0].path,false); } catch { failed=true; }
      assert(failed&&!view.reordering,'failure propagates and releases reorder lock');
      app.fileManager.processFrontMatter = originalWrite;
      assert(plugin.suppressedPaths.size===0,'write failures clear modification suppression');
      view.query='';

      const grid = view.contentEl.createDiv();
      view.gridEl = grid;
      const inner=grid.createDiv({cls:'jotdrop-grid-inner'});
      const column=inner.createDiv({cls:'jotdrop-grid-col'});
      const cards = await view.collectCards();
      view.lastFiltered=cards;
      view.renderCard(column,cards.find(card=>card.file===files[0]));
      view.renderCard(column,cards.find(card=>card.file===files[1]));
      const [cardA,cardB] = column.children;
      await tick();
      text.set(files[0],text.get(files[0])+' with literal [x] label');
      const checkbox=cardA.querySelector('input.task-list-item-checkbox');
      const refreshBeforeTask=refreshes;
      const renderBeforeTask=rendered.length;
      checkbox.click(); await tick();
      assert(text.get(files[0]).includes('- [x] task')&&checkbox.checked,'checkbox persists and updates in place');
      assert(refreshes===refreshBeforeTask&&rendered.length===renderBeforeTask&&cardA===column.firstElementChild,'checkbox retains card DOM and avoids grid refresh');
      checkbox.click(); await tick();
      assert(text.get(files[0]).includes('- [ ] task')&&!checkbox.checked,'checkbox can be cleared in place');
      const processBeforeFailure=app.vault.process;
      app.vault.process=async()=>{throw new Error('fixture task write failure');};
      checkbox.click(); await tick();
      assert(!checkbox.checked&&text.get(files[0]).includes('- [ ] task')&&plugin.suppressedPaths.size===0,'failed checkbox write retains state and clears suppression');
      assert(notices.pop().includes('fixture task write failure'),'failed checkbox write reports the error');
      app.vault.process=processBeforeFailure;
      text.set(files[0],text.get(files[0]).replace(' with literal [x] label',''));
      cardA.style.height='280px';cardB.style.height='280px';
      view.contentEl.scrollTop=180;
      const scrollBefore=view.contentEl.scrollTop;
      const renderCallsBefore=rendered.length;
      const transfer = new DataTransfer();
      cardB.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));
      cardA.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:transfer,clientY:0}));
      assert(cardA.classList.contains('jotdrop-drop-before'),'drag insertion marker');
      cardA.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));
      await tick(); await tick();
      cardB.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:transfer}));
      assert(await ordinary()==='B,A','real DOM drag/drop handlers persist order');
      assert(view.contentEl.scrollTop===scrollBefore,'drop preserves scroll position');
      assert(column.firstElementChild===cardB&&column.lastElementChild===cardA,'drop reuses and reorders existing DOM nodes');
      assert(rendered.length===renderCallsBefore,'drop does not rerender Markdown');
      const beforeNoOp=writes.length;
      await view.moveCard(files[1].path,files[0].path,false);
      assert(writes.length===beforeNoOp,'dropping into the existing position does not write files');
      await Promise.all([view.moveCard(files[0].path,files[1].path,false),view.moveCard(files[1].path,files[0].path,false)]);
      assert(await ordinary()==='B,A','rapid consecutive drops are queued without losing order');
      assert(view.contentEl.scrollTop===scrollBefore,'rapid consecutive drops preserve scroll');
      assert(!view.draggedPath&&!cardA.classList.contains('jotdrop-drop-before'),'drag cleanup');
      grid.remove();
      const columnFiles=Array.from({length:9},(_,index)=>({path:`ColumnFixture/${index}.md`,name:`${index}.md`,basename:String(index),stat:{ctime:100-index,mtime:100-index}}));
      files.push(...columnFiles);
      columnFiles.forEach((file,index)=>{metadata.set(file,{pinned:false,tags:[],jotdrop_order:index*1024});text.set(file,`# ${index}\n\nCard ${index}`);});
      let savedColumnSettings,layoutSaves=0;
      const columnPlugin={...plugin,settings:{...plugin.settings,notesFolder:'ColumnFixture',archiveFolder:'ColumnFixture/Archive',sortMode:'manual',cardWidth:240},saveSettings:async function(){layoutSaves++;savedColumnSettings=JSON.parse(JSON.stringify(this.settings));}};
      const columnView=makeView(columnPlugin);
      columnView.contentEl.style.width='900px';columnView.contentEl.style.height='500px';
      await columnView.render();await tick();
      const columns=[...columnView.gridEl.querySelectorAll('.jotdrop-grid-col')];
      assert(columns.length===3,'regression fixture has three columns');
      const cardNodes=new Map([...columnView.gridEl.querySelectorAll('.jotdrop-card')].map(node=>[node.dataset.path,node]));
      const sizes=[300,100,180,100,100,100,100,100,100];
      columnFiles.forEach((file,index)=>Object.assign(cardNodes.get(file.path).style,{height:sizes[index]+'px',boxSizing:'border-box',overflow:'hidden'}));
      columnView.reflowCards();
      assert(cardNodes.get(columnFiles[3].path).parentElement===columns[1],'fourth card must enter the shortest column, not the next cyclic column');
      const names=column=>[...column.children].map(node=>node.jotdropData.file.basename).join(',');
      assert(columns.map(names).join('|')==='0,7|1,3,5,8|2,4,6','unequal cards pack into the expected compact layout');
      const cyclicHeight=Math.max(...[0,1,2].map(column=>sizes.filter((_,index)=>index%3===column).reduce((sum,size)=>sum+size,0)+24));
      assert(columnView.gridEl.getBoundingClientRect().height<cyclicHeight,'dense layout is shorter than cyclic placement for this fixture');
      const settleLayout=async()=>{for(let frame=0;frame<5;frame++)await new Promise(resolve=>requestAnimationFrame(resolve));};
      const renderedBeforeResize=rendered.length,writesBeforeResize=writes.length;
      cardNodes.get(columnFiles[0].path).style.height='120px';sizes[0]=120;
      await settleLayout();
      assert(columns.map(names).join('|')==='0,4,7|1,3,6|2,5,8','card height changes automatically repack the board');
      assert(rendered.length===renderedBeforeResize&&writes.length===writesBeforeResize,'height reflow neither rerenders Markdown nor writes notes');
      columnView.draggedPath=columnFiles[0].path;
      cardNodes.get(columnFiles[0].path).style.height='300px';
      await settleLayout();
      assert(columns.map(names).join('|')==='0,4,7|1,3,6|2,5,8','late height changes do not move targets during a drag');
      cardNodes.get(columnFiles[0].path).dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:new DataTransfer()}));
      await settleLayout();
      assert(columns.map(names).join('|')==='0,7|1,3,5,8|2,4,6','deferred compaction runs after the drag ends');
      cardNodes.get(columnFiles[0].path).style.height='120px';await settleLayout();
      columnView.contentEl.style.height='260px';columnView.contentEl.scrollTop=90;
      const masonryScroll=columnView.contentEl.scrollTop;
      const beforeDenseDropWrites=writes.length;
      const untouchedBefore=[...columns[2].children].map(node=>({node,top:node.getBoundingClientRect().top,left:node.getBoundingClientRect().left}));
      const dropTransfer=new DataTransfer();
      const dragged=cardNodes.get(columnFiles[0].path),dropTarget=cardNodes.get(columnFiles[3].path);
      dragged.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:dropTransfer}));
      dropTarget.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dropTransfer,clientY:dropTarget.getBoundingClientRect().bottom-1}));
      dropTarget.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dropTransfer}));
      await columnView.orderQueue;
      dragged.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:dropTransfer}));
      await settleLayout();
      assert(cardNodes.get(columnFiles[0].path).previousElementSibling===cardNodes.get(columnFiles[3].path),'dropped card stays immediately after the chosen target in its column');
      assert(columns.map(names).join('|')==='4,7|1,3,0,6|2,5,8','drop changes only source and target stacks; unrelated cards retain columns');
      assert(columnView.contentEl.scrollTop===masonryScroll,'masonry drop retains scroll after layout frames');
      assert(writes.length===beforeDenseDropWrites+1,'masonry drop still writes only the moved note');
      assert([...cardNodes].every(([path,node])=>columnView.gridEl.querySelector(`[data-path="${path}"]`)===node),'masonry drop retains every existing card node');
      assert(rendered.length===renderedBeforeResize,'masonry drop does not rerender Markdown');
      assert(untouchedBefore.every(({node,top,left})=>node.getBoundingClientRect().top===top&&node.getBoundingClientRect().left===left),'unrelated column retains exact positions after the drop');
      assert(layoutSaves===1&&savedColumnSettings.cardLayout.columns[columnFiles[0].path]===1,'one settings write persists the chosen column');
      const beforeAdjacent=writes.length,beforeAdjacentSettings=layoutSaves;
      await columnView.moveCard(columnFiles[4].path,columnFiles[7].path,false);
      assert(writes.length===beforeAdjacent&&layoutSaves===beforeAdjacentSettings,'visually adjacent no-op writes neither notes nor settings');
      await columnView.moveCard(columnFiles[4].path,columnFiles[0].path,true);
      assert(columns.map(names).join('|')==='7|1,3,0,4,6|2,5,8','globally adjacent cards still move when the target column differs');
      assert(writes.length===beforeAdjacent+1,'cross-column move writes only the moved note');
      await columnView.moveCard(columnFiles[4].path,columnFiles[7].path,false);
      assert(columns.map(names).join('|')==='4,7|1,3,0,6|2,5,8','insert-before places the card in the selected column');
      await columnView.moveCard(columnFiles[0].path,columnFiles[1].path,false);
      assert(columns.map(names).join('|')==='4,7|0,1,3,6|2,5,8','same-column move only reorders that stack');
      await columnView.moveCard(columnFiles[0].path,columnFiles[3].path,true);
      await settleLayout();
      cardNodes.get(columnFiles[0].path).style.height='170px';sizes[0]=170;
      await settleLayout();
      assert(columns.map(names).join('|')==='4,7|1,3,0,6|2,5,8','late height changes preserve the dropped card and other columns');
      const denseOrder=columnView.lastFiltered.map(card=>card.file.basename).join(',');
      const reopened=makeView({...columnPlugin,settings:JSON.parse(JSON.stringify(savedColumnSettings))});reopened.contentEl.style.width='900px';
      await reopened.render();
      columnFiles.forEach((file,index)=>Object.assign(reopened.gridEl.querySelector(`[data-path="${file.path}"]`).style,{height:sizes[index]+'px',boxSizing:'border-box',overflow:'hidden'}));
      await settleLayout();
      assert(reopened.lastFiltered.map(card=>card.file.basename).join(',')===denseOrder,'saved order survives reopening the dense board');
      assert([...reopened.gridEl.querySelectorAll('.jotdrop-grid-col')].map(names).join('|')==='4,7|1,3,0,6|2,5,8','saved placement reproduces the selected target column on reopen');
      reopened.query='card 0';await reopened.render();
      assert(reopened.gridEl.querySelectorAll('.jotdrop-card').length===1&&reopened.gridEl.querySelectorAll('.jotdrop-grid-col')[1].firstElementChild.dataset.path===columnFiles[0].path,'filtering preserves the manually chosen column');
      reopened.query='';reopened.contentEl.style.width='600px';await reopened.render();await settleLayout();
      assert(reopened.gridEl.querySelectorAll('.jotdrop-grid-col').length===2&&reopened.gridEl.querySelectorAll('.jotdrop-card').length===9,'narrower layout preserves every card in two columns');
      reopened.contentEl.style.width='900px';await reopened.render();await settleLayout();
      assert([...reopened.gridEl.querySelectorAll('.jotdrop-grid-col')].map(names).join('|')==='4,7|1,3,0,6|2,5,8','returning to the saved width restores manual placement');
      metadata.get(columnFiles[8]).pinned=true;
      await reopened.render();await settleLayout();
      await reopened.moveCard(columnFiles[0].path,columnFiles[8].path,false);
      const pinnedSource=reopened.gridEl.querySelector(`[data-path="${columnFiles[0].path}"]`);
      const pinnedTarget=reopened.gridEl.querySelector(`[data-path="${columnFiles[8].path}"]`);
      assert(pinnedSource.nextElementSibling===pinnedTarget&&metadata.get(columnFiles[0]).pinned===true,'cross-section drop retains the target column and pinned state');
      const layoutBeforeFailure=reopened.plugin.settings.cardLayout;
      reopened.plugin.saveSettings=async()=>{throw new Error('fixture settings failure');};
      let placementFailure=false;
      try {await reopened.moveCard(columnFiles[0].path,columnFiles[7].path,true);}catch {placementFailure=true;}
      assert(placementFailure&&!reopened.reordering&&reopened.plugin.settings.cardLayout===layoutBeforeFailure,'settings failure restores the previous placement and releases the reorder lock');
      columnView.contentEl.style.height='auto';columnView.contentEl.scrollTop=0;
      window.masonryFixtureHTML=columnView.contentEl.outerHTML;
      await columnView.onClose();await reopened.onClose();
      assert(columnView.masonryObserver===null&&columnView.masonryFrame===null,'closing a board releases its size observer and scheduled layout');
      document.querySelectorAll('.fixture-board').forEach(el=>el.remove());

      const note = new fixtureClasses.EditModal(app,plugin,files[0],{files,index:0});
      await note.onOpen(); await tick();
      assert(!note.contentEl.querySelector('.jotdrop-edit-nav'),'navigation removed');
      assert(note.liveEditor.sourceMode===false&&note.liveEditorEl.querySelector('[contenteditable]'),'native editor is editable Live Preview');
      assert(note.liveEditor.get()==='**bold**\n\n- [ ] task','native editor receives intact Markdown');
      const actions = note.contentEl.querySelector('.jotdrop-compact-actions');
      assert(actions.querySelector('.jotdrop-edit-tagrow'),'tags inline');
      assert(actions.querySelector('details .jotdrop-reminder-row'),'reminder inside popup');
      const archive = actions.querySelector('[data-icon="archive"]');
      assert(archive?.getAttribute('aria-label')==='Archive','accessible archive icon');
      assert(!note.contentEl.querySelector('[aria-label][title]'),'only Obsidian tooltips, no duplicate browser title');
      assert(parseFloat(getComputedStyle(note.titleInputEl).fontSize)>=20,'prominent title');
      assert(parseFloat(getComputedStyle(note.contentEl.querySelector('.jotdrop-edit-controls')).marginBottom)>=16,'menu separated from note content');
      assert(getComputedStyle(note.contentEl.querySelector('.jotdrop-edit-footer button')).padding==='4px 8px','footer padding ratio');
      const initial = text.get(files[0]);
      note.liveEditor.editor.setValue('## Heading\n\n**changed**\n\n- [ ] task');
      await note.liveEditor.owner.saveImmediately();
      assert(note.state.body.includes('**changed**')&&text.get(files[0])===initial,'live editing changes draft only');
      note.insertLinkAtCursor('Another note');
      assert(note.state.body.startsWith('[[Another note]]'),'link inserts into native editor');
      const region = document.body.createDiv();
      const md = '```md\n- [ ] example\n```\n\n- [ ] task';
      text.set(files[1], '# B\n' + md);
      view.renderCardMarkdown(region,md,files[1]); await tick();
      region.querySelector('input').click(); await tick();
      assert(text.get(files[1]).includes('- [ ] example')&&text.get(files[1]).endsWith('- [x] task'),'card checkbox ignores fenced examples');
      region.remove();
      const taskExamples = [
        '    - [ ] example\n\n- [ ] task',
        '> ```md\n> - [ ] example\n> ```\n\n- [ ] task',
        '~~~md\n- [ ] example\n~~~\n\n- [ ] task',
        '<!--\n- [ ] example\n-->\n\n- [ ] task',
        '- parent\n\n      - [ ] example\n\n- [ ] task',
        '- parent\n  - [ ] nested\n\n- [ ] task',
        '> - [ ] quoted\n\n- [ ] task',
        '1. [ ] numbered\n\n- [ ] task',
        '\t- [ ] example\n\n- [ ] task',
        '````md\n```\n- [ ] example\n````\n\n- [ ] task',
        '> > ~~~md\n> > - [ ] example\n> > ~~~\n\n- [ ] task',
        '    - [ ] example\r\n\r\n- [ ] task'
      ];
      for (const example of taskExamples) {
        const target = document.body.createDiv();
        text.set(files[1], '# B\n' + example);
        view.renderCardMarkdown(target, example, files[1]); await tick();
        const boxes = [...target.querySelectorAll('input.task-list-item-checkbox')];
        boxes.at(-1).click(); await tick();
        assert(text.get(files[1]) === '# B\n' + example.replace(/- \[ \] task$/, '- [x] task'), 'only the selected rendered task is written: ' + example);
        if (boxes.length > 1) {
          boxes[0].click(); await tick();
          assert(text.get(files[1]).includes('[x] nested') || text.get(files[1]).includes('[x] quoted') || text.get(files[1]).includes('[x] numbered'), 'nested, quoted and numbered tasks remain editable');
        }
        target.remove();
      }
      const editor = note.liveEditor;
      await note.persist();
      assert(text.get(files[0]).includes('**changed**'),'saving preserves changed Markdown');
      archive.click(); await tick(); await tick();
      assert(files[0].path==='Grail/Archive/A.md','archive saves then moves note');
      assert(editor.destroyed,'native editor destroyed on close');
      const preview = new fixtureClasses.EditModal(app,plugin,files[1]);
      const richBody = 'Text before\n\n![[files/picture.png]]\n\n```text\nfirst\n\n\nlast\n```\n\nText after';
      text.set(files[1], '# B\n\n' + richBody);
      await preview.onOpen(); await tick();
      assert(preview.state.body===richBody,'modal preserves embed placement and blank lines inside code');
      preview.liveEditor.editor.setValue(preview.state.body+'\nExtra text');
      await preview.persist();
      assert(text.get(files[1]).includes(richBody),'saving retains embed placement and code spacing');
      const saved=text.get(files[1]);
      preview.liveEditor.editor.setValue('Discard me');preview.close();
      assert(text.get(files[1])===saved,'Cancel/close discards native draft');
      const display=new fixtureClasses.EditModal(app,plugin,files[1]);await display.onOpen();
      return { checks, notices, writes:writes.length };
    });
    fs.mkdirSync('work/verification', { recursive: true });
    await page.screenshot({ path: 'work/verification/modal-preview.png', fullPage: true });
    await page.evaluate(()=>{document.body.innerHTML=window.masonryFixtureHTML;});
    await page.screenshot({ path: 'work/verification/masonry-preview.png', fullPage: true });
    assert.equal(result.notices.some(message=>message.startsWith('JotDrop:')),false);
    console.log(`PASS: ${result.checks} browser integration checks (mock Obsidian services; real bundle, DOM and CSS).`);
    console.log('Preview: work/verification/modal-preview.png');
  } finally { await browser.close(); }
})().catch(error=>{ console.error(error.message); process.exitCode=1; });
