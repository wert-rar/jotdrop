// Isolated browser integration test: actual installed bundle + mocked Obsidian services.
// Default tests use disposable notes. Optional --vault-sample reads Markdown locally; never writes user notes.
// MarkdownRenderer is an API-contract stub, not the live Obsidian renderer.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const tagPerformanceOnly = process.argv.includes('--tag-performance');
const tagRenderOnly = process.argv.includes('--tag-render-performance');
const dragRefreshOnly = process.argv.includes('--drag-refresh');
const dragWindowOnly = process.argv.includes('--drag-window');
const sampleRoot = process.argv.find(arg => arg.startsWith('--vault-sample='))?.slice('--vault-sample='.length);
const readSamples = dir => fs.readdirSync(dir, {withFileTypes:true}).flatMap(entry => {
  if (entry.name.startsWith('.') || entry.name === 'Archive') return [];
  const name = path.join(dir, entry.name);
  return entry.isDirectory() ? readSamples(name) : entry.name.endsWith('.md') ? [{content:fs.readFileSync(name,'utf8'),mtime:fs.statSync(name).mtimeMs}] : [];
});
const sampleMarkdown = sampleRoot ? readSamples(sampleRoot).sort((a,b)=>b.mtime-a.mtime).map(note=>note.content) : null;

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 760, height: 780 } });
    await page.route('**/*', route => route.abort());
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
          const handlers = [];
          this.scope = {
            register(modifiers, key, callback) { const binding = { modifiers, key, callback }; handlers.push(binding); return binding; },
            unregister(binding) { const index = handlers.indexOf(binding); if (index >= 0) handlers.splice(index, 1); }
          };
          this.modalEl.addEventListener('keydown', event => {
            const binding = handlers.find(item => item.key?.toLowerCase() === event.key.toLowerCase()
              && item.modifiers.includes('Mod') === (event.ctrlKey || event.metaKey)
              && item.modifiers.includes('Shift') === event.shiftKey
              && item.modifiers.includes('Alt') === event.altKey);
            if (binding?.callback(event) === false) event.preventDefault();
          });
        }
        open() { this.onOpen(); }
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
          Menu: class {
            constructor() { this.items = []; }
            addItem(build) {
              const item = {
                setTitle(title) { this.title = title; return this; },
                setChecked(checked) { this.checked = checked; return this; },
                onClick(callback) { this.callback = callback; return this; },
              };
              build(item); this.items.push(item); return this;
            }
            showAtPosition(position) { this.position = position; window.fixtureMenu = this; }
          },
          SuggestModal: Modal, Notice: class { constructor(message) { notices.push(message); } },
          normalizePath: p => p.replace(/\\/g, '/'), getLanguage: () => 'en',
          parseYaml:JSON.parse,
          setIcon: (el, name) => { el.dataset.icon = name;
            if (name === 'eye' || name === 'eye-off') {
              const shape = name === 'eye'
                ? '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'
                : '<path d="m3 3 18 18M10.6 5.1A12 12 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3 4M6 6a20 20 0 0 0-4 6s3.5 7 10 7a13 13 0 0 0 5-1M10 10a3 3 0 0 0 4 4"/>';
              el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">' + shape + '</svg>';
              return;
            }
            el.textContent = ({pin:'♧','pin-off':'♧',link:'↗','list-todo':'☑',archive:'▣',bell:'♧',pencil:'✎',eye:'◉'})[name] || name; },
          MarkdownRenderer: { render: async (app, md, target, sourcePath, component) => {
            rendered.push({ md, sourcePath, component });
            target.innerHTML = fixtureMarkdown.render(md);
          } }
        };
      };
    });
    const installed = fs.readFileSync('main.js', 'utf8');
    await page.addScriptTag({ content: installed + '\nwindow.fixtureClasses={EditModal:module.exports.EditNoteModal,CaptureModal:module.exports.QuickCaptureModal,View:module.exports.JotDropView};' });
    const result = await page.evaluate(async ({tagPerformanceOnly,tagRenderOnly,dragRefreshOnly,dragWindowOnly,sampleMarkdown}) => {
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
          modify:async(file,value)=>text.set(file,value), process:async(file,callback)=>{const value=callback(text.get(file));text.set(file,value);if(plugin.suppressedPaths.has(file.path)){plugin.cardsVersion++;for(const board of boards)board.invalidateCards({kind:'files',paths:[file.path]});plugin.suppressedPaths.delete(file.path);}else plugin.refreshViews({kind:'files',paths:[file.path]});return value;}
        },
        fileManager: {
          processFrontMatter:async(file,callback)=>{writes.push(file.path); callback(metadata.get(file));if(plugin.suppressedPaths.has(file.path)){plugin.cardsVersion++;for(const board of boards)board.invalidateCards({kind:'files',paths:[file.path]});plugin.suppressedPaths.delete(file.path);}else plugin.refreshViews({kind:'files',paths:[file.path]});},
          renameFile:async(file,newPath)=>{file.path=newPath;}
        }, workspace:{openLinkText:async()=>{}},embedRegistry:{embedByExtension:{md:editorProbe}},
        hotkeyManager: {
          getHotkeys: id => id === 'editor:insert-codeblock' ? [{modifiers:['Mod'],key:'K'}] : id === 'editor:toggle-highlight' ? [] : undefined,
          getDefaultHotkeys: id => ({'editor:toggle-bold':[{modifiers:['Mod'],key:'B'}],'editor:toggle-italics':[{modifiers:['Mod'],key:'I'}],'editor:toggle-highlight':[{modifiers:['Mod'],key:'H'}]})[id]
        },
        commands: {
          editorCommands: {'editor:toggle-bold':{},'editor:toggle-italics':{},'editor:toggle-highlight':{},'editor:insert-codeblock':{}},
          executeCommandById: id => {
            const active = app.workspace.activeEditor;
            if (!active || active.getMode() !== 'source') return false;
            const markers = {'editor:toggle-bold':'**','editor:toggle-italics':'*','editor:toggle-highlight':'==','editor:insert-codeblock':'```'};
            active.editor.setValue(markers[id] + active.editor.getValue() + markers[id]);
            return true;
          }
        }
      };
      let refreshes = 0;
      const boards = new Set();
      const plugin = {cardsVersion:0,settings:{notesFolder:'Grail',archiveFolder:'Grail/Archive',sortMode:'modified-desc',showArchived:false},saveSettings:async()=>{},refreshViews:(change={kind:'all'})=>{refreshes++;plugin.cardsVersion++;for(const board of boards)board.invalidateCards(change);},resolveAssetCandidates:()=>[],suppressedPaths:new Set(),suppressModifyOnce(path){this.suppressedPaths.add(path);}};
      const makeView = (viewPlugin=plugin) => {
        const contentEl=document.body.createDiv({cls:'fixture-board'});
        Object.assign(contentEl.style,{height:'160px',width:'300px',overflow:'auto'});
        const board = Object.assign(new fixtureClasses.View({},viewPlugin), {app,plugin:viewPlugin,contentEl,gridEl:contentEl.createDiv(),selectedPaths:new Set(),selectionMode:false,markdownComponents:[]});
        boards.add(board);return board;
      };
      if (dragWindowOnly) {
        const NativeObserver=window.IntersectionObserver;
        let loadNext;
        window.IntersectionObserver=class {
          constructor(callback){loadNext=()=>callback([{isIntersecting:true}]);}
          observe(){}
          disconnect(){}
        };
        const windowFiles=Array.from({length:121},(_,i)=>({path:`DragWindow/${i}.md`,name:`${i}.md`,basename:String(i),stat:{ctime:121-i,mtime:121-i}}));
        windowFiles.forEach((file,i)=>{metadata.set(file,{pinned:i<16,tags:[i===120?'irrelevant':'keep'],jotdrop_order:i*1024});text.set(file,`# Card ${i}`);});
        app.vault.getMarkdownFiles=()=>windowFiles;
        const owner={...plugin,settings:{...plugin.settings,notesFolder:'DragWindow',archiveFolder:'DragWindow/Archive',sortMode:'manual',cardWidth:240,cardLayout:{columnCount:6,columns:Object.fromEntries(windowFiles.map((file,i)=>[file.path,i<16?0:i%3]))}}};
        const board=makeView(owner);Object.assign(board.contentEl.style,{width:'1580px',height:'600px'});
        await board.render();
        board.gridEl.querySelectorAll('.jotdrop-card').forEach(node=>node.style.height='200px');
        await tick();
        assert(board.gridEl.querySelectorAll('.jotdrop-card').length===60,'window fixture initially mounts 60 of 121 notes');
        const sourcePath=windowFiles[16].path;
        const source=board.gridEl.querySelector(`[data-path="${sourcePath}"]`);
        const column=board.gridEl.querySelector('.jotdrop-grid-inner[data-pinned="false"]').children[3];
        const transfer=new DataTransfer();
        source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));
        column.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));
        await board.orderQueue;
        source.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:transfer}));
        assert(source.parentElement===column,'windowed drop immediately reaches the chosen empty column');
        board.excludedTags.add('irrelevant');
        await board.render(true);
        assert(source.isConnected&&source.parentElement===column,'tag filtering after a windowed drop keeps the moved note visible in its chosen column');
        const unpinnedColumn=board.gridEl.querySelector('.jotdrop-grid-inner[data-pinned="false"]').children[4];
        const pinnedPath=windowFiles[0].path;
        await board.moveCard(pinnedPath,null,false,{pinned:false,index:4,count:6});
        await board.render(true);
        assert(board.gridEl.querySelector(`[data-path="${pinnedPath}"]`)?.parentElement===unpinnedColumn,'unpinning into an empty column keeps the moved note within the visible window');
        await board.render();
        const refreshed=board.gridEl.querySelector(`[data-path="${sourcePath}"]`);
        assert(refreshed&&[...refreshed.parentElement.parentElement.children].indexOf(refreshed.parentElement)===3,'rereading saved notes preserves the first moved note in its column');
        await board.render(true);
        loadNext();
        const loaded=[...board.gridEl.querySelectorAll('.jotdrop-card')];
        assert(loaded.length===120&&new Set(loaded.map(node=>node.dataset.path)).size===120,'next window appends each matching note once');
        assert(loaded.every(node=>[...node.parentElement.parentElement.children].indexOf(node.parentElement)===owner.settings.cardLayout.columns[node.dataset.path]),'notes loaded after filtering respect saved manual columns');
        await board.onClose();
        window.IntersectionObserver=NativeObserver;
        return {checks};
      }
      if (dragRefreshOnly) {
        // Slots follow the carried card's top edge: a tall card grabbed near its
        // bottom leaves the pointer in the column's free space below the stack.
        const slotFiles=Array.from({length:6},(_,i)=>({path:`DragSlot/${i}.md`,name:`${i}.md`,basename:String(i),stat:{ctime:6-i,mtime:6-i}}));
        slotFiles.forEach((file,i)=>{metadata.set(file,{pinned:false,tags:['keep'],jotdrop_order:i*1024});text.set(file,`# Card ${i}`);});
        app.vault.getMarkdownFiles=()=>slotFiles;
        Object.assign(plugin.settings,{notesFolder:'DragSlot',archiveFolder:'DragSlot/Archive',sortMode:'manual',cardWidth:240,cardLayout:undefined});
        const slotBoard=makeView();Object.assign(slotBoard.contentEl.style,{width:'900px',height:'900px'});
        await slotBoard.render();await tick();
        const slotNode=index=>slotBoard.gridEl.querySelector(`[data-path="DragSlot/${index}.md"]`);
        slotFiles.forEach((_,i)=>Object.assign(slotNode(i).style,{height:(i===0?400:80)+'px',boxSizing:'border-box',overflow:'hidden'}));
        slotBoard.reflowCards();
        const slotColumns=[...slotBoard.gridEl.querySelectorAll('.jotdrop-grid-col')];
        const stack=column=>[...column.children].map(node=>node.jotdropData.file.basename).join(',');
        assert(slotColumns.map(stack).join('|')==='0|1,3,5|2,4','slot fixture packs a tall card alone in the first column');
        const tall=slotNode(0),low=slotNode(3),lowRect=low.getBoundingClientRect(),tallRect=tall.getBoundingClientRect();
        const grab=380,slotTransfer=new DataTransfer();
        tall.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:slotTransfer,clientY:tallRect.top+grab}));
        const columnRect=slotColumns[1].getBoundingClientRect(),pointerY=lowRect.top+10+grab;
        assert(pointerY>slotNode(5).getBoundingClientRect().bottom,'pointer sits below the target stack while the card top is above the target middle');
        slotColumns[1].dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:slotTransfer,clientX:columnRect.left+20,clientY:pointerY}));
        assert(low.classList.contains('jotdrop-drop-before')&&!slotColumns[1].classList.contains('jotdrop-column-drop'),'marker shows the card top edge slot, not the column end');
        slotColumns[1].dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:slotTransfer}));
        await slotBoard.orderQueue;
        tall.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:slotTransfer}));
        assert(stack(slotColumns[1])==='1,0,3,5','a tall card lands where its top edge was shown, not at the bottom of the column: '+slotColumns.map(stack).join('|'));
        assert(!slotBoard.gridEl.querySelector('.jotdrop-drop-before, .jotdrop-drop-after, .jotdrop-column-drop'),'drop markers are cleared after the drag');
        await slotBoard.onClose();slotBoard.contentEl.remove();
        const raceFiles=Array.from({length:6},(_,i)=>({path:`DragRace/${i}.md`,name:`${i}.md`,basename:String(i),stat:{ctime:6-i,mtime:6-i}}));
        raceFiles.forEach((file,i)=>{metadata.set(file,{pinned:false,tags:['keep'],jotdrop_order:i*1024});text.set(file,`# Card ${i}`);});
        app.vault.getMarkdownFiles=()=>raceFiles;
        Object.assign(plugin.settings,{notesFolder:'DragRace',archiveFolder:'DragRace/Archive',sortMode:'manual',cardWidth:240});
        const board=makeView();board.contentEl.style.width='900px';
        await board.render();await tick();
        const sourcePath=raceFiles[0].path,targetPath=raceFiles[1].path;
        const source=board.gridEl.querySelector(`[data-path="${sourcePath}"]`);
        const target=board.gridEl.querySelector(`[data-path="${targetPath}"]`);
        assert(source.parentElement!==target.parentElement,'race fixture crosses columns');
        const read=app.vault.cachedRead,write=app.fileManager.processFrontMatter;
        let releaseRead,releaseWrite,readEntered,writeEntered,paused=false;
        const readGate=new Promise(resolve=>{releaseRead=resolve;});
        const writeGate=new Promise(resolve=>{releaseWrite=resolve;});
        const readStarted=new Promise(resolve=>{readEntered=resolve;});
        const writeStarted=new Promise(resolve=>{writeEntered=resolve;});
        app.vault.cachedRead=async file=>{const value=await read(file);if(!paused){paused=true;readEntered();await readGate;}return value;};
        app.fileManager.processFrontMatter=async(file,callback)=>{writeEntered();await writeGate;return write(file,callback);};
        const incoming={path:'DragRace/incoming.md',name:'incoming.md',basename:'incoming',stat:{ctime:0,mtime:0}};
        raceFiles.push(incoming);metadata.set(incoming,{pinned:false,tags:['keep'],jotdrop_order:6144});text.set(incoming,'# Incoming note');
        const refreshing=board.render();await readStarted;
        const moving=board.moveCard(sourcePath,targetPath,true);await writeStarted;
        const movingCards=board.orderCards,markdownAtMove=rendered.length;
        releaseRead();await refreshing;
        const during={sameNode:board.gridEl.querySelector(`[data-path="${sourcePath}"]`)===source,correctColumn:source.previousElementSibling===target,markdownRenders:rendered.length-markdownAtMove,sameOrder:board.orderCards===movingCards};
        releaseWrite();await moving;
        app.vault.cachedRead=read;app.fileManager.processFrontMatter=write;
        assert(during.sameNode&&during.correctColumn,'pending refresh must not replace or displace a card during a cross-column drop: '+JSON.stringify(during));
        assert(during.markdownRenders===0,'pending refresh must not rebuild Markdown during drop');
        assert(during.sameOrder,'a cancelled refresh must not overwrite the active drag order');
        assert(!board.reordering,'cross-column move releases its write lock');
        assert(board.lastFiltered.some(card=>card.file===incoming),'a refresh interrupted by dragging must apply incoming notes after the save finishes');
        await board.moveCard(raceFiles[2].path,sourcePath,true);
        const expected=board.lastFiltered.map(card=>card.file.path).join('|');
        await board.render();
        assert(board.lastFiltered.map(card=>card.file.path).join('|')===expected,'consecutive move after a stale refresh preserves both saved ranks');
        const nodes=[...board.gridEl.querySelectorAll('.jotdrop-card')];
        assert(nodes.length===7&&new Set(nodes.map(node=>node.dataset.path)).size===7,'all cards remain present once after refresh and consecutive moves');
        assert(board.gridEl.querySelector(`[data-path="${sourcePath}"]`).parentElement===board.gridEl.querySelectorAll('.jotdrop-grid-col')[1],'target column survives the next authoritative refresh');
        await board.onClose();board.contentEl.remove();
        // Native drags: a refresh during dragstart → dragend must not detach the carried card.
        window.createNativeRefreshFixture=async mode=>{
          document.body.replaceChildren();
          const nativeFiles=Array.from({length:6},(_,i)=>({path:`NativeRace/${i}.md`,name:`${i}.md`,basename:String(i),stat:{ctime:6-i,mtime:6-i}}));
          nativeFiles.forEach((file,i)=>{metadata.set(file,{pinned:false,tags:['keep'],jotdrop_order:i*1024});text.set(file,`# Card ${i}`);});
          app.vault.getMarkdownFiles=()=>nativeFiles;
          Object.assign(plugin.settings,{notesFolder:'NativeRace',archiveFolder:'NativeRace/Archive',sortMode:'manual',cardWidth:240,cardLayout:undefined});
          const nativeBoard=makeView();Object.assign(nativeBoard.contentEl.style,{width:'900px',height:'500px'});
          document.body.createDiv({attr:{id:'native-outside'}}).style.height='200px';
          await nativeBoard.render();await tick();
          const nativeSource=nativeBoard.gridEl.querySelector('[data-path="NativeRace/0.md"]');
          const incoming={path:'NativeRace/incoming.md',name:'incoming.md',basename:'incoming',stat:{ctime:0,mtime:0}};
          const addIncoming=()=>{nativeFiles.push(incoming);metadata.set(incoming,{pinned:false,tags:['keep'],jotdrop_order:6144});text.set(incoming,'# Incoming note');};
          const state=window.nativeRefreshFixture={board:nativeBoard,events:[],sourceAtDrop:null,refresh:null};
          document.addEventListener('drop',event=>{state.events.push({type:'drop',trusted:event.isTrusted});state.sourceAtDrop=nativeSource.isConnected;},true);
          nativeSource.addEventListener('dragend',event=>state.events.push({type:'dragend',trusted:event.isTrusted}));
          if(mode==='read'){
            const read=app.vault.cachedRead;let releaseRead,paused=false;
            const gate=new Promise(resolve=>{releaseRead=resolve;});
            app.vault.cachedRead=async file=>{const value=await read(file);if(!paused){paused=true;await gate;}return value;};
            addIncoming();state.refresh=nativeBoard.render();
            nativeSource.addEventListener('dragstart',()=>{app.vault.cachedRead=read;releaseRead();});
          } else {
            nativeSource.addEventListener('dragstart',()=>{addIncoming();state.refresh=nativeBoard.render();});
          }
        };
        window.readNativeRefreshFixture=async()=>{
          const state=window.nativeRefreshFixture;
          await state.refresh;await state.board.orderQueue;await tick();
          const nodes=[...state.board.gridEl.querySelectorAll('.jotdrop-card')].map(node=>node.dataset.path);
          const observed={events:state.events,sourceAtDrop:state.sourceAtDrop,draggedPath:state.board.draggedPath,reordering:!!state.board.reordering,
            nodes:nodes.length,unique:new Set(nodes).size,incoming:nodes.includes('NativeRace/incoming.md'),
            column:plugin.settings.cardLayout?.columns['NativeRace/0.md'],order:metadata.get(app.vault.getMarkdownFiles()[0]).jotdrop_order};
          await state.board.onClose();
          return observed;
        };
        return {checks};
      }
      if (tagRenderOnly) {
        const bodies = sampleMarkdown || Array.from({length:120}, (_,i) => '# Note ' + i + '\n\n' + ('## Heading\n\nA paragraph with **bold**, [link](https://example.invalid) and `code`.\n\n- One\n- Two\n- [ ] Task\n\n').repeat(15));
        const sampleFiles = bodies.map((body,i)=>({path:`Grail/Sample${i}.md`,name:`Sample${i}.md`,basename:`Sample${i}`,stat:{ctime:bodies.length-i,mtime:bodies.length-i}}));
        sampleFiles.forEach((file,i)=>{metadata.set(file,{tags:[i===0?'hide-one':'keep'],color:'default'});text.set(file,bodies[i].replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,''));});
        app.vault.getMarkdownFiles=()=>sampleFiles;
        app.metadataCache.getFirstLinkpathDest=()=>null;
        const board=makeView();
        Object.assign(board.contentEl.style,{width:'720px',height:'600px'});
        board.gridEl.className='jotdrop-grid';
        board.filterBarEl=board.contentEl.createDiv({cls:'jotdrop-filter-bar'});
        board.contentEl.prepend(board.filterBarEl);
        const paint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        await board.render(); await paint();
        const initialNodes=new Map([...board.gridEl.querySelectorAll('.jotdrop-card')].map(el=>[el.dataset.path,el]));
        const relativeTop=el=>el.getBoundingClientRect().top-board.gridEl.getBoundingClientRect().top;
        const placements=new Map([...initialNodes].map(([path,el])=>[path,{column:el.parentElement,top:relativeTop(el)}]));
        const removed=initialNodes.get(sampleFiles[0].path);
        const removedColumn=removed.parentElement;
        const removedTop=relativeTop(removed);
        const removedSpace=removed.getBoundingClientRect().height+parseFloat(getComputedStyle(removedColumn).rowGap);
        const before=rendered.length;
        const render=board.render.bind(board);
        let pending;
        board.render=(...args)=>pending=render(...args);
        const started=performance.now();
        board.filterBarEl.querySelector('[data-tag="hide-one"]').click();
        await pending; await paint();
        const elapsed=performance.now()-started;
        const visible=[...board.gridEl.querySelectorAll('.jotdrop-card')];
        const retained=visible.filter(el=>initialNodes.get(el.dataset.path)===el).length;
        const common=visible.filter(el=>initialNodes.has(el.dataset.path)).length;
        const rerenders=rendered.length-before;
        const stats={notes:bodies.length,elapsedMs:Math.round(elapsed),markdownRenders:rerenders,retained,common};
        assert(retained===common && rerenders<=visible.length-common && elapsed<200, 'single tag must retain unchanged cards and paint within 200 ms: '+JSON.stringify(stats));
        for (const el of visible) {
          const previous=placements.get(el.dataset.path);
          if (!previous) continue;
          assert(el.parentElement===previous.column, 'filter keeps each existing card in its column');
          const expected=previous.top-(previous.column===removedColumn && previous.top>removedTop ? removedSpace : 0);
          assert(Math.abs(relativeTop(el)-expected)<1, 'only cards below the hidden card shift upward');
        }
        const afterHide=rendered.length;
        board.filterBarEl.querySelector('[data-tag="hide-one"]').click();
        await pending; await paint();
        assert(rendered.length===afterHide, 'restoring a tag reuses its previously rendered Markdown');
        assert(board.lastFiltered.length===bodies.length, 'restoring tag restores all notes');
        for (const [path,el] of initialNodes) {
          assert(board.gridEl.contains(el) && el.parentElement===placements.get(path).column, 'restored cards retain their original DOM and column');
          assert(Math.abs(relativeTop(el)-placements.get(path).top)<1, 'restoring a tag restores original vertical positions');
        }
        const untouched=[...board.gridEl.querySelectorAll('.jotdrop-card')];
        board.toggleTagFilter('absent-tag'); await pending; await paint();
        assert(rendered.length===afterHide && untouched.every(el=>board.gridEl.contains(el)), 'excluding a tag absent from visible notes does not rebuild cards');

        board.filterBarEl.querySelector('[data-action="hide-all"]').click(); await pending; await paint();
        assert(board.gridEl.querySelectorAll('.jotdrop-card').length===0, 'hide all detaches every card');
        board.filterBarEl.querySelector('[data-action="show-all"]').click(); await pending; await paint();
        assert(rendered.length===afterHide && untouched.every(el=>board.gridEl.contains(el)), 'show all reuses detached cards');
        const initialComponentCount=board.markdownComponents.length;
        board.renderLimit=bodies.length;
        await board.render(true); await paint();
        const loaded=[...board.gridEl.querySelectorAll('.jotdrop-card')];
        assert(loaded.length===bodies.length, 'expanded render window loads the remaining notes');
        board.contentEl.scrollTop=board.contentEl.scrollHeight/2;
        await paint();
        const scrolled=board.contentEl.scrollTop;
        const loadedRenders=rendered.length;
        const loadedColumns=new Map(loaded.map(el=>[el,el.parentElement]));
        board.toggleTagFilter('another-absent-tag'); await pending; await paint();
        assert(board.renderLimit===bodies.length && loaded.every(el=>board.gridEl.contains(el)), 'tag changes preserve the already loaded window');
        assert(rendered.length===loadedRenders && Math.abs(board.contentEl.scrollTop-scrolled)<1, 'unmatched tag leaves rendering and scroll position unchanged');
        board.toggleTagFilter('hide-one'); await pending; await paint();
        assert(loaded.filter(el=>el!==removed).every(el=>el.parentElement===loadedColumns.get(el)), 'scrolled filtering also keeps column placement');
        const components=board.markdownComponents.map(entry=>entry.component);
        assert(components.length>=initialComponentCount && components.every(component=>board.children.has(component)), 'hidden Markdown components remain alive for reuse');
        await board.onClose(); board.contentEl.remove();
        assert(components.every(component=>!board.children.has(component)), 'closing the view unloads retained Markdown components');
        return {checks,stats};
      }

      if (tagPerformanceOnly) {
        const perfFiles = Array.from({length:160}, (_,i) => ({path:`Grail/Perf${i}.md`,name:`Perf${i}.md`,basename:`Perf${i}`,stat:{ctime:i,mtime:i}}));
        perfFiles.forEach((file,i) => { metadata.set(file,{tags:[i % 2 ? 'keep' : 'hide']}); text.set(file,'Short note\n\n- [ ] task'); });
        app.vault.getMarkdownFiles = () => perfFiles;
        const read = app.vault.cachedRead;
        let reads = 0;
        let slow = false;
        app.vault.cachedRead = async file => {
          reads++;
          if (slow) await new Promise(resolve => setTimeout(resolve, 2));
          return read(file);
        };
        const board = makeView();
        board.filterBarEl = board.contentEl.createDiv({cls:'jotdrop-filter-bar'});
        await board.render();
        await tick();
        slow = true;
        reads = 0;
        const render = board.render.bind(board);
        let pending;
        board.render = (...args) => pending = render(...args);
        const samples = [];
        const click = async selector => {
          const started = performance.now();
          board.filterBarEl.querySelector(selector).click();
          await pending;
          const elapsed = performance.now() - started;
          samples.push(Math.round(elapsed));
          assert(reads === 0 && elapsed < 200, `tag toggle must finish without rereading notes: ${reads} reads, ${Math.round(elapsed)} ms`);
        };
        await click('[data-tag="hide"]');
        assert(board.lastFiltered.length === 80, 'single tag immediately hides matching notes');
        await click('[data-tag="hide"]');
        assert(board.lastFiltered.length === 160, 'single tag immediately restores matching notes');
        await click('[data-action="hide-all"]');
        assert(board.lastFiltered.length === 0, 'hide all responds without file reads');
        await click('[data-action="show-all"]');
        assert(board.lastFiltered.length === 160, 'show all responds without file reads');
        board.toggleTagFilter('hide'); board.toggleTagFilter('keep'); board.toggleTagFilter('hide');
        await pending;
        await tick();
        assert(board.lastFiltered.length === 80 && board.lastFiltered.every(card => card.meta.tags.includes('hide')), 'rapid toggles use the final filter state');
        const visibleCards = [...board.gridEl.querySelectorAll('.jotdrop-card')];
        assert(visibleCards.length > 0 && visibleCards.length <= 80 && new Set(visibleCards.map(card => card.dataset.path)).size === visibleCards.length, 'rapid toggles render one chunk without duplicate cards');
        slow = false;
        text.set(perfFiles[0], 'Changed content');
        metadata.set(perfFiles[0], {tags:['keep']});
        perfFiles.pop();
        plugin.refreshViews({kind:'files',paths:[perfFiles[0].path]});
        await board.render();
        assert(reads === 1, 'external refresh reads only the changed file');
        assert(board.lastFiltered.length === 79 && !board.lastFiltered.some(card => card.file === perfFiles[0]), 'external refresh applies changed tags and deletion');
        reads = 0;
        await click('[data-action="show-all"]');
        assert(board.lastFiltered.length === 159 && board.lastFiltered.find(card => card.file === perfFiles[0]).content.includes('Changed content'), 'fast filters use externally refreshed content');
        await tick();
        const taskCard = board.gridEl.querySelector('.jotdrop-card');
        const taskPath = taskCard.dataset.path;
        taskCard.querySelector('.task-list-item-checkbox').click();
        await tick();
        reads = 0;
        board.toggleTagFilter('keep');
        await pending; await tick();
        assert(reads === 1, 'in-place checkbox invalidates only its own file');
        const updatedTaskCard = [...board.gridEl.querySelectorAll('.jotdrop-card')].find(card => card.dataset.path === taskPath);
        assert(updatedTaskCard.querySelector('.task-list-item-checkbox').checked, 'filtering preserves the saved checkbox state');
        slow = true;
        plugin.refreshViews({kind:'files',paths:[perfFiles[0].path]});
        const refresh = board.render();
        board.toggleTagFilter('keep');
        await pending;
        assert(board.lastFiltered.length === 159, 'tag toggle responds while a background refresh reads notes');
        await refresh;
        const refreshedCards = [...board.gridEl.querySelectorAll('.jotdrop-card')];
        assert(board.lastFiltered.length === 159 && new Set(refreshedCards.map(card => card.dataset.path)).size === refreshedCards.length, 'background refresh preserves final filters without duplicate cards');
        // File changes invalidate the snapshot while the toolbar remains clickable.
        // Reproduce a refresh followed by two tag clicks during delayed file reads.
        reads = 0;
        plugin.refreshViews({kind:'files',paths:[perfFiles[0].path]});
        const burstRendersBefore = rendered.length;
        const burstLimit = board.renderLimit;
        const burstStarted = performance.now();
        const burstRefresh = board.render();
        board.toggleTagFilter('hide'); const firstToggle = pending;
        board.toggleTagFilter('hide'); const secondToggle = pending;
        await Promise.all([burstRefresh, firstToggle, secondToggle]);
        const burstStats = {reads, markdownRenders:rendered.length-burstRendersBefore, elapsedMs:Math.round(performance.now()-burstStarted)};
        assert(reads === 1, 'file invalidation plus rapid tag clicks must share one read pass: '+JSON.stringify(burstStats));
        assert(burstStats.markdownRenders <= burstLimit, 'overlapping refreshes must commit only the latest grid: '+JSON.stringify(burstStats));
        assert(board.lastFiltered.length === 159, 'overlapping refreshes retain the final tag state');
        reads = 0; plugin.refreshViews({kind:'files',paths:[perfFiles[0].path]});
        const closingRefresh = board.render();
        await board.onClose();
        const rendersAtClose = rendered.length;
        await closingRefresh;
        assert(rendered.length === rendersAtClose && board.contentEl.children.length === 0 && board.children.size === 0, 'closing during file reads must not resurrect Markdown components or render detached cards');
        await board.onClose(); board.contentEl.remove();
        return {checks,samples};
      }

      // Exercise the actual tag buttons and rendered grid, including untagged notes.
      const originalTags = files.map(file => metadata.get(file).tags);
      // Exercise the toolbar against actual sorting, persistence, filters and saved columns.
      const writesBeforeSort = writes.length;
      const sortFiles = Array.from({length:4}, (_,index) => ({path:`SortFixture/${index}.md`,name:`${index}.md`,basename:String(index),stat:{ctime:100*(index+1),mtime:[800,500,600,700][index]}}));
      files.push(...sortFiles);
      sortFiles.forEach((file,index) => {metadata.set(file,{pinned:false,tags:[index===3?'hidden':'keep'],jotdrop_order:[2048,0,3072,1024][index]});text.set(file,`# Sort card ${index}`);});
      let sortSaved,sortSaves=0,sortRefresh;
      const sortViews=[];
      const sortPlugin={...plugin,settings:{...plugin.settings,notesFolder:'SortFixture',archiveFolder:'SortFixture/Archive',sortMode:'manual',cardWidth:240,cardLayout:{columnCount:3,columns:Object.fromEntries(sortFiles.map((file,index)=>[file.path,[2,0,1,0][index]]))}},
        saveSettings:async function(){sortSaves++;sortSaved=JSON.parse(JSON.stringify(this.settings));},
        refreshViews(){this.cardsVersion++;sortRefresh=Promise.all(sortViews.map(view=>view.render()));}};
      const makeSortView=(owner=sortPlugin)=>{
        const board=makeView(owner);
        Object.assign(board.contentEl.style,{width:'900px',height:'450px'});
        const toolbar=board.contentEl.createDiv({cls:'jotdrop-toolbar'});
        board.contentEl.prepend(toolbar);board.buildSortControl(toolbar);
        board.filterBarEl=board.contentEl.createDiv({cls:'jotdrop-filter-bar'});
        board.contentEl.insertBefore(board.filterBarEl,board.gridEl);
        return board;
      };
      const sortView=makeSortView(),sortPeer=makeSortView();sortViews.push(sortView,sortPeer);
      await Promise.all(sortViews.map(view=>view.render()));
      const sortNames=()=>sortView.lastFiltered.map(card=>card.file.basename).join(',');
      const sortColumns=()=>[...sortView.gridEl.querySelectorAll('.jotdrop-grid-col')].map(col=>[...col.children].map(card=>card.dataset.path).join(',')).join('|');
      const manualColumns=sortColumns(),manualLayout=JSON.stringify(sortPlugin.settings.cardLayout),manualNotes=JSON.stringify(sortFiles.map(file=>metadata.get(file)));
      const chooseSort=async title=>{
        sortView.contentEl.querySelector('.jotdrop-sort-btn').click();
        const menu=window.fixtureMenu;
        assert(menu.items.map(item=>item.title).join('|')==='Manual order|Newest created first|Last edited first','toolbar offers exactly the three agreed modes');
        assert(menu.items.filter(item=>item.checked).length===1,'menu checks the current mode');
        await menu.items.find(item=>item.title===title).callback();await sortRefresh;
      };
      assert(sortNames()==='1,3,0,2','initial manual order uses saved note ranks');
      await chooseSort('Manual order');assert(sortSaves===0,'selecting the current mode does not save or refresh');
      await chooseSort('Newest created first');
      assert(sortNames()==='3,2,1,0','newest mode uses creation time rather than modification time');
      assert(sortSaved.sortMode==='created-desc','newest mode is persisted');
      assert(sortPeer.contentEl.querySelector('.jotdrop-sort-btn').textContent.includes('Newest created first'),'other open views update their mode labels');
      sortView.filterBarEl.querySelector('[data-tag="hidden"]').click();await tick();await tick();
      await chooseSort('Last edited first');
      assert(sortNames()==='0,2,1','modified mode sorts by modification time and retains excluded tags');
      assert(sortSaved.sortMode==='modified-desc','modified mode is persisted');
      const reopenedSort=makeSortView({...sortPlugin,settings:JSON.parse(JSON.stringify(sortSaved))});await reopenedSort.render();
      assert(reopenedSort.lastFiltered.map(card=>card.file.basename).join(',')==='0,3,2,1','saved mode survives reopening');
      assert(reopenedSort.contentEl.querySelector('.jotdrop-sort-btn').textContent.includes('Last edited first'),'reopened view shows the persisted mode');
      await chooseSort('Manual order');
      assert(sortNames()==='1,0,2','return to manual restores ranks while retaining the tag filter');
      sortView.filterBarEl.querySelector('[data-tag="hidden"]').click();await tick();await tick();
      assert(sortNames()==='1,3,0,2'&&sortColumns()===manualColumns,'return to manual restores exact columns and positions including hidden notes');
      assert(JSON.stringify(sortPlugin.settings.cardLayout)===manualLayout&&JSON.stringify(sortFiles.map(file=>metadata.get(file)))===manualNotes,'switching sort modes never rewrites manual layout or note metadata');
      sortPlugin.settings.sortMode='title-asc';sortPlugin.refreshViews();await sortRefresh;
      assert(sortView.contentEl.querySelector('.jotdrop-sort-btn').textContent.includes('Title A-Z'),'toolbar accurately reflects existing advanced settings modes');
      await sortView.moveCard(sortFiles[3].path,sortFiles[0].path,false);
      assert(sortPlugin.settings.sortMode==='manual'&&sortView.contentEl.querySelector('.jotdrop-sort-btn').textContent.includes('Manual order'),'dragging from an automatic mode updates the toolbar to manual');
      Object.assign(sortView.contentEl.style,{width:'280px'});
      assert(sortView.contentEl.querySelector('.jotdrop-sort-btn').getBoundingClientRect().width<=280,'sort control fits a narrow pane');
      await Promise.all([...sortViews,reopenedSort].map(view=>view.onClose()));
      [...sortViews,reopenedSort].forEach(view=>view.contentEl.remove());
      files.splice(files.indexOf(sortFiles[0]),sortFiles.length);
      writes.splice(writesBeforeSort);

      const originalPinnedText = text.get(files[3]);
      text.set(files[3], originalPinnedText + '\nunique-search-needle');
      [['work'], ['work', 'archive'], [], ['archive']].forEach((tags, i) => metadata.get(files[i]).tags = tags);
      const tagView = makeView();
      Object.assign(tagView.contentEl.style, { width:'640px', height:'auto', overflow:'visible', padding:'16px', background:'white' });
      tagView.filterBarEl = tagView.contentEl.createDiv({cls:'jotdrop-filter-bar'});
      tagView.contentEl.prepend(tagView.filterBarEl);
      const tagClick = async selector => {
        const button = tagView.filterBarEl.querySelector(selector);
        assert(button && !button.disabled, 'tag control is available: ' + selector);
        button.click(); await tick(); await tick();
      };
      const visibleNames = () => tagView.lastFiltered.map(card => card.file.basename).sort().join(',');
      await tagView.render(); await tick();
      assert(visibleNames() === 'A,B,C,Pinned', 'all tagged and untagged notes are visible initially');
      assert(tagView.filterBarEl.querySelector('[data-tag="archive"]').getAttribute('aria-pressed') === 'true', 'tags start enabled');
      await tagClick('[data-tag="archive"]');
      assert(visibleNames() === 'A,C', 'one excluded tag hides multi-tag notes and pinned notes');
      assert(getComputedStyle(tagView.filterBarEl.querySelector('[data-tag="archive"] .jotdrop-filter-chip-label')).textDecorationLine.includes('line-through'), 'hidden tag is visibly crossed out');
      window.tagVisibilityPreviewHTML = tagView.contentEl.outerHTML;
      await tagView.render(); await tick();
      assert(visibleNames() === 'A,C', 'exclusions survive a board refresh');
      await tagClick('[data-tag="archive"]');
      assert(visibleNames() === 'A,B,C,Pinned', 'clicking an excluded tag restores its notes');
      await tagClick('[data-tag="archive"]');
      tagView.query = 'unique-search-needle'; await tagView.render(); await tick();
      assert(visibleNames() === '', 'search cannot reveal excluded notes');
      await tagClick('[data-action="show-all"]');
      assert(visibleNames() === 'Pinned' && tagView.query === 'unique-search-needle', 'show all resets visibility and preserves the search query');
      tagView.clearAllFilters(); await tick(); await tick();
      assert(visibleNames() === 'A,B,C,Pinned' && tagView.query === '', 'full reset also clears the search');
      await tagClick('[data-action="hide-all"]');
      assert(tagView.gridEl.querySelectorAll('.jotdrop-card').length === 0 && visibleNames() === '', 'hide all removes every card, including untagged notes');
      assert([...tagView.filterBarEl.querySelectorAll('[aria-pressed]')].every(button => button.getAttribute('aria-pressed') === 'false'), 'hide all switches off every visible category');
      assert(tagView.filterBarEl.querySelector('[data-action="hide-all"]').disabled, 'hide all is disabled when everything is hidden');
      await tagClick('.jotdrop-filter-untagged');
      assert(visibleNames() === 'C', 'untagged notes can be restored independently');
      await tagClick('[data-action="hide-all"]');
      tagView.gridEl.querySelector('.jotdrop-empty-clear').click(); await tick(); await tick();
      assert(visibleNames() === 'A,B,C,Pinned', 'empty-state reset restores every category');
      await tagClick('[data-action="hide-all"]');
      const freshView = makeView(); await freshView.render(); await tick();
      assert(freshView.lastFiltered.length === 4, 'visibility defaults are per view, not saved to notes/settings');
      await freshView.onClose(); freshView.contentEl.remove();

      await tagClick('[data-action="show-all"]');
      metadata.get(files[3]).tags = ['archive', ...Array.from({length:9}, (_,i) => 'z' + i)];
      plugin.refreshViews({kind:'metadata',paths:[files[3].path]});
      await tagView.render(); await tick();
      await tagClick('.is-overflow');
      const pickerRow = () => document.querySelector('.jotdrop-tagpicker-row[data-tag="z8"]');
      assert(pickerRow()?.tagName === 'BUTTON', 'overflow tags use native keyboard-accessible buttons');
      pickerRow().click(); await tick(); await tick();
      assert(visibleNames() === 'A,B,C', 'overflow tag exclusion updates the board immediately');
      assert(pickerRow().getAttribute('aria-pressed') === 'false', 'picker shares the visibility state without toggling twice');
      assert(tagView.filterBarEl.querySelector('[data-tag="z8"].is-excluded'), 'excluded overflow tag stays visible on the toolbar');
      pickerRow().click(); await tick(); await tick();
      assert(visibleNames() === 'A,B,C,Pinned', 'overflow tag can be enabled again');
      document.querySelector('.modal').remove();
      originalTags.forEach((tags,i) => metadata.get(files[i]).tags = tags);
      text.set(files[3], originalPinnedText);
      assert(writes.length === 0, 'visibility changes do not write note metadata');
      await tagView.onClose(); tagView.contentEl.remove();

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
      const refreshesBeforeDrag = refreshes;
      await view.moveCard(files[2].path,files[0].path,false);
      assert(plugin.settings.sortMode==='manual','drop enables manual mode');
      assert(await ordinary()==='C,A,B','move before');
      assert(refreshes===refreshesBeforeDrag,'drag/drop must not rebuild the board and reset its scroll');
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
      reopened.invalidateCards({kind:"metadata",paths:[columnFiles[8].path]});
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
      const emptyFiles=Array.from({length:3},(_,index)=>({path:`EmptyFixture/${index}.md`,name:`${index}.md`,basename:String(index),stat:{ctime:100-index,mtime:100-index}}));
      files.push(...emptyFiles);
      emptyFiles.forEach((file,index)=>{metadata.set(file,{pinned:index===2,tags:[],jotdrop_order:index*1024});text.set(file,`# Empty card ${index}`);});
      const emptyPlugin={...plugin,settings:{...plugin.settings,notesFolder:'EmptyFixture',archiveFolder:'EmptyFixture/Archive',sortMode:'manual',cardWidth:240,cardLayout:{columnCount:3,columns:Object.fromEntries(emptyFiles.map(file=>[file.path,0]))}},saveSettings:async()=>{}};
      const emptyView=makeView(emptyPlugin);emptyView.contentEl.style.width='900px';emptyView.query='empty card 0';
      await emptyView.render();await settleLayout();
      const emptyColumns=[...emptyView.gridEl.querySelectorAll('.jotdrop-grid-col')];
      const emptySource=emptyView.gridEl.querySelector('.jotdrop-card');
      const emptyTransfer=new DataTransfer();
      emptySource.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:emptyTransfer}));
      const emptyOver=new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:emptyTransfer});
      emptyColumns[2].dispatchEvent(emptyOver);
      assert(emptyOver.defaultPrevented,'empty column accepts a dragged note without a target card');
      assert(emptyColumns[2].getBoundingClientRect().height>=120,'empty column has a usable mouse drop area');
      const beforeEmptyWrites=writes.length;
      const hiddenEmptyRanks=emptyFiles.slice(1).map(file=>metadata.get(file).jotdrop_order);
      emptyColumns[2].dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:emptyTransfer}));
      await emptyView.orderQueue;
      emptySource.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:emptyTransfer}));await settleLayout();
      assert(emptySource.parentElement===emptyColumns[2]&&emptyPlugin.settings.cardLayout.columns[emptyFiles[0].path]===2,'drop into empty filtered column persists the chosen column');
      assert(writes.length===beforeEmptyWrites+1&&emptyFiles.slice(1).every((file,index)=>metadata.get(file).jotdrop_order===hiddenEmptyRanks[index]),'empty-column drop writes only the moved note and retains hidden ranks');
      assert(emptyFiles.slice(1).every(file=>emptyPlugin.settings.cardLayout.columns[file.path]===0),'empty-column drop retains hidden column assignments');
      assert(!emptyView.gridEl.querySelector('.jotdrop-column-drop'),'drag end clears empty-column feedback');
      await emptyView.render();await settleLayout();
      assert(emptyView.gridEl.querySelector('.jotdrop-card').parentElement===emptyView.gridEl.querySelectorAll('.jotdrop-grid-col')[2],'empty-column placement survives rerender');
      emptyView.query='';await emptyView.render();await settleLayout();
      const pinnedEmpty=emptyView.gridEl.querySelector('.jotdrop-grid-inner[data-pinned="true"]').children[1];
      const crossSource=emptyView.gridEl.querySelector(`[data-path="${emptyFiles[0].path}"]`);
      const crossTransfer=new DataTransfer();
      crossSource.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:crossTransfer}));
      pinnedEmpty.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:crossTransfer}));await emptyView.orderQueue;
      crossSource.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:crossTransfer}));await settleLayout();
      assert(metadata.get(emptyFiles[0]).pinned===true&&crossSource.parentElement===pinnedEmpty,'empty pinned column accepts an unpinned note and persists pin state');
      const beforeColumnNoOp=writes.length;
      crossSource.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:crossTransfer}));
      pinnedEmpty.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:crossTransfer}));await emptyView.orderQueue;
      crossSource.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:crossTransfer}));
      assert(writes.length===beforeColumnNoOp,'drop into the current column with a single card writes nothing');
      window.createEmptyColumnMouseFixture=async(useTags=false)=>{
        document.body.replaceChildren();
        emptyFiles.forEach((file,index)=>Object.assign(metadata.get(file),{pinned:index===2,jotdrop_order:index*1024,tags:[index===0?'drag-visible':'drag-hidden']}));
        const mousePlugin={...emptyPlugin,settings:{...emptyPlugin.settings,cardLayout:{columnCount:3,columns:Object.fromEntries(emptyFiles.map(file=>[file.path,0]))}}};
        const mouseView=makeView(mousePlugin);Object.assign(mouseView.contentEl.style,{width:'880px',height:'600px'});mouseView.query=useTags?'':'empty card 0';
        mouseView.filterBarEl=mouseView.contentEl.createDiv({cls:'jotdrop-filter-bar'});
        mouseView.contentEl.prepend(mouseView.filterBarEl);
        await mouseView.render();await settleLayout();
        if(useTags){
          const render=mouseView.render.bind(mouseView);let filtering;
          mouseView.render=(...args)=>filtering=render(...args);
          mouseView.filterBarEl.querySelector('[data-tag="drag-hidden"]').click();
          await filtering;await settleLayout();
        }
        return window.emptyColumnMouseFixture={view:mouseView,plugin:mousePlugin,sourcePath:emptyFiles[0].path,events:[]};
      };
      await emptyView.onClose();emptyView.contentEl.remove();
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
      const hotkey = (modal, key) => modal.liveEditor.content.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey:true, bubbles:true, cancelable:true }));
      const originalDraft = note.liveEditor.get();
      note.liveEditor.editor.setValue('format me'); note.liveEditor.editor.focus();
      hotkey(note, 'b');
      assert(note.state.body === '**format me**', 'Ctrl+B formats the draft inside the modal');
      hotkey(note, 'i');
      assert(note.state.body === '***format me***', 'Ctrl+I formats the draft inside the modal');
      hotkey(note, 'k');
      assert(note.state.body === '```***format me***```', 'custom formatting hotkeys use the Obsidian command');
      hotkey(note, 'h');
      assert(note.state.body === '```***format me***```', 'explicitly disabled hotkeys stay disabled');
      note.titleInputEl.focus();
      note.titleInputEl.dispatchEvent(new KeyboardEvent('keydown', { key:'b',ctrlKey:true,bubbles:true }));
      assert(note.state.body === '```***format me***```', 'formatting shortcuts do not alter the body while typing a title');
      note.liveEditor.editor.setValue(originalDraft);
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
      const originalActiveEditor = {getMode:()=> 'source'};
      app.workspace.activeEditor = originalActiveEditor;
      const capture = new fixtureClasses.CaptureModal(app,plugin);
      capture.onOpen();
      assert(capture.modalEl.classList.contains('jotdrop-compact-modal'), 'new-note modal uses the compact editor design');
      assert(capture.liveEditor.sourceMode === false && !capture.textArea.isConnected, 'new-note modal replaces textarea with native Live Preview');
      assert(capture.liveEditor.owner.file === null, 'new-note draft is not attached to a vault file');
      assert(capture.contentEl.querySelector('.jotdrop-compact-actions .jotdrop-edit-tagrow'), 'new-note tags use the shared compact controls');
      assert(!capture.contentEl.querySelector('[data-icon="archive"]'), 'new-note draft has no archive action before creation');
      assert(!capture.contentEl.querySelector('.jotdrop-capture-hint'), 'new-note modal removes the extra hint row');
      assert(getComputedStyle(capture.contentEl.querySelector('.jotdrop-edit-footer')).justifyContent === 'flex-end', 'new-note buttons align with the edit modal');
      capture.liveEditor.editor.setValue('new draft');
      hotkey(capture, 'b');
      assert(capture.state.body === '**new draft**' && capture.textArea.value === '**new draft**', 'new-note hotkeys format and synchronize the draft');
      const countBeforeCancel = files.length;
      const captureEditor = capture.liveEditor;
      capture.close();
      assert(files.length === countBeforeCancel && captureEditor.destroyed, 'cancelled new note creates no file and releases editor');
      assert(app.workspace.activeEditor === originalActiveEditor, 'closing new-note editor restores the previous active editor');
      const create = new fixtureClasses.CaptureModal(app,plugin); create.onOpen();
      create.titleInputEl.value = 'New note'; create.liveEditor.editor.setValue('**bold**\n\n- [ ] task');
      const originalCreate = app.vault.create;
      const originalAbstractFile = app.vault.getAbstractFileByPath;
      app.vault.getAbstractFileByPath = () => null;
      app.vault.create = async (path, content) => {
        const file = {path,name:path.split('/').at(-1),basename:'New note',stat:{mtime:100,ctime:100}};
        files.push(file); text.set(file, content); metadata.set(file, {}); return file;
      };
      const createdEditor = create.liveEditor;
      await Promise.all([create.save(),create.save()]);
      assert(files.length === countBeforeCancel + 1, 'repeated save creates exactly one new note');
      assert(text.get(files.at(-1)) === '# New note\n\n**bold**\n\n- [ ] task', 'new-note save preserves title and native Markdown draft');
      assert(createdEditor.destroyed, 'new-note save closes and releases editor');
      app.vault.create = originalCreate; app.vault.getAbstractFileByPath = originalAbstractFile;
      const display=new fixtureClasses.EditModal(app,plugin,files[1]);await display.onOpen();
      return { checks, notices, writes:writes.length };
    }, {tagPerformanceOnly,tagRenderOnly,dragRefreshOnly,dragWindowOnly,sampleMarkdown});
    if (dragWindowOnly) {
      console.log(`PASS: ${result.checks} windowed drag and filter checks.`);
      return;
    }
    if (dragRefreshOnly) {
      // A detached drag source stalls the native drag indefinitely; fail instead of hanging.
      const within = (promise, label) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`native drag stalled: ${label}`)), 10000))]);
      await page.setViewportSize({ width: 1000, height: 800 });
      for (const mode of ['refresh', 'read', 'cancel']) {
        await page.evaluate(mode => window.createNativeRefreshFixture(mode), mode);
        const target = mode === 'cancel' ? '#native-outside' : '[data-path="NativeRace/1.md"]';
        await within(page.locator('[data-path="NativeRace/0.md"]').dragTo(page.locator(target), { sourcePosition: { x: 8, y: 8 }, targetPosition: { x: 8, y: 8 } }), mode);
        await page.waitForFunction(() => document.querySelector('[data-path="NativeRace/incoming.md"]'), null, { timeout: 5000 });
        const observed = await page.evaluate(() => window.readNativeRefreshFixture());
        const detail = `${mode}: ${JSON.stringify(observed)}`;
        assert.deepEqual(observed.events, mode === 'cancel' ? [{ type: 'dragend', trusted: true }] : [{ type: 'drop', trusted: true }, { type: 'dragend', trusted: true }], `native drag completes during a ${detail}`);
        if (mode !== 'cancel') assert.equal(observed.sourceAtDrop, true, `carried card stays mounted until drop: ${detail}`);
        assert(observed.incoming && observed.nodes === 7 && observed.unique === 7, `deferred refresh applies after the drag: ${detail}`);
        assert(observed.draggedPath === null && !observed.reordering, `drag state is released: ${detail}`);
        if (mode === 'cancel') assert(observed.column === undefined && observed.order === 0, `cancelled drag writes nothing: ${detail}`);
        else assert.equal(observed.column, 1, `dropped note keeps the chosen column: ${detail}`);
      }
      console.log(`PASS: ${result.checks} cross-column drag and in-flight refresh checks; 3 native drags with refreshes during the drag.`);
      return;
    }
    if (tagRenderOnly) {
      console.log(`PASS: ${result.checks} card retention checks: ${JSON.stringify(result.stats)}; source=${sampleMarkdown ? "local vault sample (read only, no network)" : "synthetic Markdown"}.`);
      return;
    }
    if (tagPerformanceOnly) {
      console.log(`PASS: ${result.checks} tag responsiveness checks; toggle times: ${result.samples.join(", ")} ms (160 notes, delayed file reads).`);
      return;
    }
    fs.mkdirSync('work/verification', { recursive: true });
    await page.screenshot({ path: 'work/verification/modal-preview.png', fullPage: true });
    await page.setViewportSize({width:900,height:780});
    const createMouseFixture = async (useTags=false) => page.evaluate(async(useTags)=>{
      const fixture=await window.createEmptyColumnMouseFixture(useTags);
      for(const type of ['dragstart','drop']) fixture.view.gridEl.addEventListener(type,event=>fixture.events.push({type:event.type,trusted:event.isTrusted}),true);
    },useTags);
    await createMouseFixture();
    await page.locator('.jotdrop-card').dragTo(page.locator('.jotdrop-grid-col').nth(2),{targetPosition:{x:40,y:40}});
    await page.waitForFunction(()=>window.emptyColumnMouseFixture.plugin.settings.cardLayout.columns[window.emptyColumnMouseFixture.sourcePath]===2);
    assert.deepEqual(await page.evaluate(()=>window.emptyColumnMouseFixture.events),[{type:'dragstart',trusted:true},{type:'drop',trusted:true}]);
    assert.equal(await page.locator('.jotdrop-grid-col').nth(2).locator('.jotdrop-card').count(),1,'real mouse drag moves the card into the empty column');
    await page.evaluate(async()=>{await window.emptyColumnMouseFixture.view.onClose();});
    for (const area of ['gap', 'background']) {
      await createMouseFixture(true);
      const point = await page.evaluate(area => {
        const grid=window.emptyColumnMouseFixture.view.gridEl;
        grid.dataset.mouseDropGrid='true';
        if (area==='background') grid.style.paddingBottom='40px';
        const inner=grid.querySelector('.jotdrop-grid-inner[data-pinned="false"]'),right=inner.children[2].getBoundingClientRect();
        const surface=area==='gap'?inner:grid,rect=surface.getBoundingClientRect();
        const x=area==='gap'?right.left-rect.left-2:right.left-rect.left+15;
        const y=area==='gap'?40:rect.height-8;
        return {x,y,hitSurface:document.elementFromPoint(rect.left+x,rect.top+y)===surface,selector:area==='gap'?'.jotdrop-grid-inner[data-pinned="false"]':'[data-mouse-drop-grid]'};
      },area);
      assert(point.hitSurface,`native mouse targets the ${area} outside column elements`);
      await page.locator('.jotdrop-card').dragTo(page.locator(point.selector),{targetPosition:{x:point.x,y:point.y}});
      await page.waitForFunction(()=>window.emptyColumnMouseFixture.plugin.settings.cardLayout.columns[window.emptyColumnMouseFixture.sourcePath]===2,{},{timeout:10000});
      await page.evaluate(()=>window.emptyColumnMouseFixture.view.orderQueue);
      assert.deepEqual(await page.evaluate(()=>window.emptyColumnMouseFixture.events),[{type:'dragstart',trusted:true},{type:'drop',trusted:true}],`native ${area} drop reaches the plugin`);
      assert.equal(await page.locator('.jotdrop-grid-col:visible').nth(2).locator('.jotdrop-card').count(),1,`${area} drop places one card in the nearest visible column after excluding tags`);
      assert.equal(await page.evaluate(()=>window.emptyColumnMouseFixture.view.draggedPath),null,`${area} drop finishes dragging`);
      await page.evaluate(async()=>{await window.emptyColumnMouseFixture.view.onClose();});
    }
    await page.evaluate(()=>{document.body.innerHTML=window.masonryFixtureHTML;});
    await page.screenshot({ path: 'work/verification/masonry-preview.png', fullPage: true });
    await page.evaluate(() => { document.body.innerHTML = window.tagVisibilityPreviewHTML; });
    await page.screenshot({ path: 'work/verification/tag-visibility-preview.png', fullPage: true });
    assert.equal(result.notices.some(message=>message.startsWith('JotDrop:')),false);
    console.log(`PASS: ${result.checks} browser integration checks (mock Obsidian services; real bundle, DOM and CSS).`);
    console.log('PASS: real browser mouse drag into an empty column (trusted dragstart and drop events).');
    console.log('PASS: native drops in column gaps and free grid background select the nearest column and finish.');
    console.log('Preview: work/verification/modal-preview.png');
  } finally { await browser.close(); }
})().catch(error=>{ console.error(error.message); process.exitCode=1; });
