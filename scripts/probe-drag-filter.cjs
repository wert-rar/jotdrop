// Read-only diagnostic: real bundle/browser, disposable notes, mocked vault writes.
// Run from the repository root. Does not build or deploy the plugin.
// This probe reports observations, not a pass verdict: inspect blocked/events.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const probeCase = process.argv[2];
assert(['control', 'refresh-during-drag', 'refresh-deferred', 'sort-load'].includes(probeCase),
  'Usage: node scripts/probe-drag-filter.cjs <control|refresh-during-drag|refresh-deferred|sort-load>');
let harness = fs.readFileSync('scripts/check-fork-browser.cjs', 'utf8').replaceAll('\r\n', '\n');
const replace = (from, to) => {
  assert(harness.includes(from), 'Browser fixture seam changed');
  harness = harness.replace(from, to);
};
replace("const dragWindowOnly = process.argv.includes('--drag-window');", 'const dragWindowOnly = true;');
replace("    const page = await browser.newPage", `    let probeStage='starting';
    const probeTimeout=setTimeout(()=>{console.log(JSON.stringify({case:probeCase,blocked:true,stage:probeStage}));void browser.close();},12000);
    probeTimeout.unref();
    const page = await browser.newPage`);
replace("    await page.route('**/*'", `    page.on('console',message=>{if(message.text().startsWith('[drag-probe]'))console.log(message.text());});
    await page.route('**/*'`);
replace('      if (dragWindowOnly) {', `      if (dragWindowOnly) {
        let loadNext;
        const NativeObserver=window.IntersectionObserver;
        window.IntersectionObserver=class {constructor(callback){loadNext=()=>callback([{isIntersecting:true}]);}observe(){}disconnect(){}};
        const sortLoad=${probeCase === 'sort-load'};
        const probeFiles=Array.from({length:sortLoad?121:6},(_,i)=>({path:'Probe/'+i+'.md',name:i+'.md',basename:String(i),stat:{ctime:200-i,mtime:200-i}}));
        probeFiles.forEach((file,i)=>{metadata.set(file,{pinned:false,tags:['keep'],jotdrop_order:(sortLoad?120-i:i)*1024});text.set(file,'# Card '+i);});
        app.vault.getMarkdownFiles=()=>probeFiles;
        Object.assign(plugin.settings,{notesFolder:'Probe',archiveFolder:'Probe/Archive',sortMode:sortLoad?'created-desc':'manual',cardWidth:240,cardLayout:{columnCount:6,columns:Object.fromEntries(probeFiles.map((file,i)=>[file.path,i%6]))}});
        const board=makeView();Object.assign(board.contentEl.style,{width:'1580px',height:'600px'});
        board.gridEl.classList.add('jotdrop-grid');
        await board.render();
        const source=board.gridEl.querySelector('[data-path="Probe/0.md"]'),target=board.gridEl.querySelector('[data-path="Probe/1.md"]');
        assert(source&&target&&source.parentElement!==target.parentElement,'probe starts with two visible cards in different columns');
        if(sortLoad){
          await board.render(true);
          await board.moveCard(probeFiles[0].path,probeFiles[1].path,true);
          loadNext();
          const nodes=[...board.gridEl.querySelectorAll('.jotdrop-card')];
          const invalid=[...board.gridEl.querySelectorAll('.jotdrop-grid-col')].filter(column=>[...column.children].some((node,index)=>index&&node.jotdropData.order<column.children[index-1].jotdropData.order));
          const stats={case:'sort-load',loaded:nodes.length,unique:new Set(nodes.map(node=>node.dataset.path)).size,sort:plugin.settings.sortMode,outOfOrderColumns:invalid.length};
          await board.onClose();window.IntersectionObserver=NativeObserver;
          return {checks,stats};
        }
        source.dataset.probeSource='true';target.dataset.probeTarget='true';
        const events=[];
        if(${probeCase === 'refresh-deferred'}){
          const render=board.render.bind(board);let deferred=false;
          board.render=(...args)=>{if(board.draggedPath){deferred=true;return Promise.resolve();}return render(...args);};
          source.addEventListener('dragend',()=>{if(deferred){deferred=false;window.probeRefresh=board.render();}});
        }
        board.gridEl.addEventListener('dragstart',event=>{
          events.push({type:event.type,trusted:event.isTrusted});
        },true);
        if(${probeCase === 'refresh-during-drag' || probeCase === 'refresh-deferred'}) source.addEventListener('dragstart',()=>{
          window.probeRefresh=board.render().then(()=>console.log('[drag-probe] '+JSON.stringify({stage:'refresh-request-returned',sourceConnected:source.isConnected,draggedPath:board.draggedPath,events})));
        });
        for(const type of ['drop','dragend']) board.gridEl.addEventListener(type,event=>events.push({type:event.type,trusted:event.isTrusted}),true);
        window.dragProbe={board,plugin,source,events};
        return {checks};
      }
      if (dragWindowOnly) {`);
replace('    if (dragWindowOnly) {\n      console.log', `    if (dragWindowOnly) {
      if(probeCase==='sort-load'){console.log(JSON.stringify(result.stats));return;}
      await page.setViewportSize({width:1600,height:900});
      let dragError=null;
      probeStage='native-drag';
      try {
        await page.locator('[data-probe-source]').dragTo(page.locator('[data-path="Probe/1.md"]'),{sourcePosition:{x:8,y:8},targetPosition:{x:8,y:8},timeout:5000});
      } catch(error) { dragError=error.message.split('\\n')[0]; }
      probeStage='await-refresh';
      await page.evaluate(()=>window.probeRefresh);
      probeStage='await-move';
      await page.evaluate(()=>window.dragProbe.board.orderQueue);
      const observed=await page.evaluate(()=>{
        const {board,plugin,source,events}=window.dragProbe;
        return {events,sourceConnected:source.isConnected,draggedPathCleared:!board.draggedPath,column:plugin.settings.cardLayout.columns['Probe/0.md'],reordering:!!board.reordering};
      });
      assert(observed.events.some(event=>event.type==='dragstart'&&event.trusted),'probe must start a real native drag');
      console.log(JSON.stringify({case:probeCase,dragError,...observed}));
      await page.evaluate(()=>window.dragProbe.board.onClose());
      return;
    }
    if (dragWindowOnly) {
      console.log`);
new Function('require', 'probeCase', harness)(require, probeCase);
