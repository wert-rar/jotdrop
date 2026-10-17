// Diagnostic only: production bundle, synthetic notes, mocked Obsidian APIs.
// Run after npm run build. No vault access, deployment, or production changes.
// Reuses the integration fixture, as scripts/probe-drag-filter.cjs does.
const fs = require('node:fs');
const assert = require('node:assert/strict');
let harness = fs.readFileSync('scripts/check-fork-browser.cjs', 'utf8').replaceAll('\r\n', '\n');
function replace(from, to) {
  assert(harness.includes(from), 'Browser fixture seam changed: ' + from);
  harness = harness.replace(from, to);
}
replace("const dragWindowOnly = process.argv.includes('--drag-window');", 'const dragWindowOnly = true;');
replace('      if (dragWindowOnly) {', `      if (dragWindowOnly) {
        // Drive the real page callback explicitly so viewport timing is deterministic.
        const NativeObserver = window.IntersectionObserver;
        let nextPage;
        window.IntersectionObserver = class {
          constructor(callback) { this.callback = callback; }
          observe() { nextPage = () => this.callback([{isIntersecting:true}]); }
          disconnect() {}
        };
        const originalRead = app.vault.cachedRead;
        let reads = 0, inFlight = 0, maxInFlight = 0;
        app.vault.cachedRead = async file => {
          reads++; inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
          try { return await originalRead(file); } finally { inFlight--; }
        };
        const paint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const rows = [];
        for (const scenario of [{notes:160,rich:false}, {notes:1000,rich:false}, {notes:120,rich:true}]) {
          const sampleFiles = Array.from({length:scenario.notes}, (_,i) => ({
            path:'Grail/Perf'+i+'.md', name:'Perf'+i+'.md', basename:'Perf'+i,
            stat:{ctime:scenario.notes-i,mtime:scenario.notes-i}
          }));
          sampleFiles.forEach((file,i) => {
            metadata.set(file,{tags:['shared'],color:'default',pinned:false});
            const paragraph = 'Shared paragraph with **bold** and [link](https://example.invalid).';
            text.set(file, '# Note '+i+'\\n\\n'+(scenario.rich ?
              (paragraph+'\\n\\n- One\\n- Two\\n- [ ] Task\\n\\n').repeat(15) : paragraph));
          });
          app.vault.getMarkdownFiles = () => sampleFiles;
          const board = makeView();
          Object.assign(board.contentEl.style,{width:'720px',height:'600px'});
          board.gridEl.className = 'jotdrop-grid';
          board.filterBarEl = board.contentEl.createDiv({cls:'jotdrop-filter-bar'});
          board.contentEl.prepend(board.filterBarEl);
          const measure = async (action, run) => {
            reads = 0; maxInFlight = 0;
            const beforeRenders = rendered.length;
            const beforeNodes = new Set(board.gridEl.querySelectorAll('.jotdrop-card'));
            const started = performance.now();
            await run();
            const workMs = Math.round(performance.now()-started);
            await paint();
            const visible = [...board.gridEl.querySelectorAll('.jotdrop-card')];
            const row = {notes:scenario.notes,rich:scenario.rich,action,reads,maxInFlight,
              markdownRenders:rendered.length-beforeRenders,visible:visible.length,
              retainedVisible:visible.filter(node=>beforeNodes.has(node)).length,
              cachedCards:board.retainedCards.size,components:board.markdownComponents.length,
              workMs,paintMs:Math.round(performance.now()-started)};
            rows.push(row);
            return row;
          };
          const cold = await measure('initial', () => board.render());
          assert(cold.reads===scenario.notes && cold.visible===60, 'initial sample reads all notes and renders one chunk');
          board.query = 'shared';
          const search = await measure('search-cached', () => board.render(true));
          assert(search.reads===0 && search.markdownRenders===0 && search.retainedVisible===60, 'search reuses loaded notes and cards');
          board.query = 'share';
          const reused = await measure('search-reuse-experiment', () => board.render(true));
          assert(reused.reads===0 && reused.markdownRenders===0 && reused.retainedVisible===60,
            'snapshot reuse handles this unchanged-result search without reads or Markdown work');
          text.set(sampleFiles[0], text.get(sampleFiles[0])+'\\n\\nChanged');
          plugin.refreshViews({kind:'files',paths:[sampleFiles[0].path]});
          const refresh = await measure('one-note-refresh', () => board.render());
          assert(refresh.reads===1 && refresh.markdownRenders===1 && refresh.retainedVisible===59,
            'one note refresh replaces only the changed card');
          await measure('load-next-60', () => nextPage());
          const loaded = await measure('load-remaining-pages', async () => {
            while (board.gridEl.querySelectorAll('.jotdrop-card').length < scenario.notes) {
              nextPage();
              await paint();
            }
          });
          assert(loaded.visible===scenario.notes, 'all requested cards are loaded');
          const hidden = await measure('hide-all', () => {
            board.excludedTags.add('shared');
            return board.render(true);
          });
          assert(hidden.visible===0 && hidden.cachedCards===scenario.notes && hidden.components===scenario.notes,
            'hidden loaded cards and Markdown components stay retained');
          await board.onClose(); board.contentEl.remove();
          assert(board.children.size===0, 'close releases Markdown components');
        }
        window.IntersectionObserver = NativeObserver;
        return {checks,rows};
      }
      if (dragWindowOnly) {`);
replace('    if (dragWindowOnly) {\n      console.log', `    if (dragWindowOnly) {
      console.log(JSON.stringify({kind:'synthetic-plugin-performance',checks:result.checks,rows:result.rows},null,2));
      return;
    }
    if (dragWindowOnly) {
      console.log`);
new Function('require', harness)(require);
