/* [DEBUG-dragtrace] Temporary drag diagnostics for a freeze not reproduced outside Obsidian.
 * Records timings and counts only: no note paths, titles, Markdown or settings contents.
 * Written once per drag to <configDir>/plugins/jotdrop/drag-trace.json. Remove after diagnosis. */
export function installDragTrace({ View, normalizePath }) {
  const BUILD = 'drag-trace-2026-10-17-2';
  const sessions = [];
  const totals = { since: new Date().toISOString(), ops: {} };
  let session = null;
  let writing = Promise.resolve();
  let disabled = false;
  const stack = [];
  const now = () => performance.now();

  const bump = (bucket, name, ms) => {
    const entry = bucket[name] ||= { calls: 0, ms: 0, max: 0 };
    entry.calls++; entry.ms = Math.round(entry.ms + ms); entry.max = Math.max(entry.max, Math.round(ms));
  };
  const record = (name, ms) => {
    bump(totals.ops, name, ms);
    if (!session) return;
    bump(session.ops, name, ms);
    if (ms >= 16) session.slow.push({ at: Math.round(now() - session.t0), op: name, ms: Math.round(ms), inside: stack.join('>') });
    if (session.slow.length > 150) session.slow.shift();
  };
  const timed = (name, fn) => function (...args) {
    const start = now();
    stack.push(name);
    let result;
    try { result = fn.apply(this, args); }
    finally { stack.pop(); }
    if (result && typeof result.then === 'function') {
      record(name + ':sync', now() - start);
      return result.finally(() => record(name, now() - start));
    }
    record(name, now() - start);
    return result;
  };
  const wrap = (owner, name, label = name) => {
    const original = owner?.[name];
    if (typeof original !== 'function' || original.jotdropTraced) return;
    owner[name] = timed(label, original);
    owner[name].jotdropTraced = true;
  };

  for (const name of ['render', 'renderCards', 'collectCards', 'reflowCards', 'performCardMove', 'renderCard', 'renderCardMarkdown',
    'releaseCardMarkdown', 'observeCardSize', 'invalidateCards', 'renderFilterBar', 'filterRenderedCards', 'captureCardPlacement',
    'dropSlotAt', 'markDropSlot', 'scheduleMasonryLayout']) {
    wrap(View.prototype, name);
  }

  let longTasks = null;
  try {
    longTasks = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const target = session || totals;
        (target.longTasks ||= []).push({ at: session ? Math.round(entry.startTime - session.t0) : undefined, ms: Math.round(entry.duration) });
        if (target.longTasks.length > 200) target.longTasks.shift();
      }
    });
    longTasks.observe({ entryTypes: ['longtask'] });
  } catch { longTasks = null; }

  const classOf = node => (node && node.nodeType === 1 ? (typeof node.className === 'string' && node.className ? node.className.split(' ').slice(0, 2).join('.') : node.tagName) : 'text');

  function snapshot(view) {
    return {
      cards: view.gridEl?.querySelectorAll('.jotdrop-card').length,
      gridNodes: view.gridEl?.getElementsByTagName('*').length,
      docNodes: view.contentEl.ownerDocument.getElementsByTagName('*').length,
      columns: view.lastColumnCount,
      markdownComponents: view.markdownComponents?.length,
      viewChildren: view._children?.length,
      retained: view.retainedCards?.size,
      cached: view.cardCache?.size,
      renderLimit: view.renderLimit,
      sort: view.plugin.settings.sortMode,
      filters: (view.excludedTags?.size || 0) + (view.hideUntagged ? 1 : 0),
      query: !!view.query,
      renderPending: !!view.renderPending,
      reordering: !!view.reordering,
      reading: !!view.cardRead,
    };
  }

  function write(view) {
    if (disabled) return;
    const payload = JSON.stringify({ build: BUILD, longTaskSupport: !!longTasks, totals, sessions }, null, 1);
    const file = normalizePath(`${view.app.vault.configDir}/plugins/jotdrop/drag-trace.json`);
    writing = writing.then(() => view.app.vault.adapter.write(file, payload)).catch(() => { disabled = true; });
  }

  function finish(view, reason) {
    if (!session || session.closing) return;
    const s = session;
    s.closing = true;
    s.events.push({ at: Math.round(now() - s.t0), type: 'settle:' + reason });
    // Keep recording for a while so post-drop writes and refreshes are included.
    window.setTimeout(() => {
      if (session === s) session = null;
      s.observer?.disconnect();
      delete s.observer; delete s.source; delete s.closing;
      s.after = snapshot(view);
      s.durationMs = Math.round(now() - s.t0);
      sessions.push(s);
      if (sessions.length > 10) sessions.shift();
      write(view);
    }, 6000);
  }

  function tracePlugin(view) {
    const plugin = view.plugin;
    if (plugin.jotdropTraced) return;
    plugin.jotdropTraced = true;
    for (const name of ['handleVaultChange', 'referencesBoardFile', 'saveSettings']) wrap(plugin, name, 'plugin.' + name);
    wrap(view.app.fileManager, 'processFrontMatter', 'app.processFrontMatter');
    wrap(view.app.vault, 'process', 'app.vault.process');
    const refresh = plugin.refreshViews;
    plugin.refreshViews = function (change, schedule) {
      const start = now();
      try { return refresh.call(this, change, schedule); }
      finally { record('plugin.refresh:' + (change?.kind || 'all') + (schedule === false ? ':quiet' : ''), now() - start); }
    };
    for (const [owner, name, label] of [[view.app.vault, 'modify', 'event.vault.modify'], [view.app.metadataCache, 'changed', 'event.metadata.changed']]) {
      const ref = owner.on(name, () => { if (session) bump(session.ops, label, 0); bump(totals.ops, label, 0); });
      plugin.register(() => owner.offref(ref));
    }
  }

  const open = View.prototype.onOpen;
  View.prototype.onOpen = async function (...args) {
    try { tracePlugin(this); } catch { /* diagnostics must never block the board */ }
    let lastOver = 0;
    const listen = type => this.registerDomEvent(this.contentEl, type, event => {
      const t = now();
      if (type === 'dragstart') {
        const source = event.target.closest?.('.jotdrop-card');
        if (!source) return;
        if (session) { session.events.push({ at: Math.round(t - session.t0), type: 'superseded' }); session.observer?.disconnect(); }
        const rect = source.getBoundingClientRect();
        session = { start: new Date().toISOString(), t0: t, ops: {}, slow: [], events: [{ at: 0, type }],
          card: { height: Math.round(rect.height), nodes: source.getElementsByTagName('*').length, checkboxes: source.querySelectorAll('input[type=checkbox]').length },
          over: { count: 0, maxGapMs: 0, gaps100: 0 }, mutations: { count: 0, targets: {} }, source, before: snapshot(this) };
        lastOver = t;
        session.observer = new MutationObserver(records => {
          const s = session;
          if (!s) return;
          for (const r of records) {
            s.mutations.count++;
            const key = r.type + ':' + classOf(r.target);
            s.mutations.targets[key] = (s.mutations.targets[key] || 0) + 1;
            for (const node of r.removedNodes) if (s.source && (node === s.source || node.contains?.(s.source))) s.events.push({ at: Math.round(now() - s.t0), type: 'source-removed', inside: stack.join('>') || 'outside-plugin' });
          }
        });
        session.observer.observe(this.contentEl.ownerDocument.body, { childList: true, subtree: true, attributes: true });
        return;
      }
      if (!session || session.closing) return;
      if (type === 'dragover') {
        const gap = t - lastOver;
        lastOver = t;
        session.over.count++;
        session.over.maxGapMs = Math.max(session.over.maxGapMs, Math.round(gap));
        if (gap > 100) { session.over.gaps100++; session.events.push({ at: Math.round(t - session.t0), type: 'dragover-gap', ms: Math.round(gap) }); }
        return;
      }
      session.events.push({ at: Math.round(t - session.t0), type, trusted: event.isTrusted, sourceConnected: !!session.source?.isConnected });
      if (type === 'dragend') finish(this, 'dragend');
    }, true);
    for (const type of ['dragstart', 'dragover', 'drop', 'dragend']) listen(type);
    // A stalled drag never delivers dragend: close the session on the next pointer or key input.
    for (const type of ['pointerdown', 'keydown']) this.registerDomEvent(this.contentEl.ownerDocument, type, () => { if (session && !session.closing) finish(this, 'input:' + type); }, true);
    const result = await open.apply(this, args);
    totals.atOpen = snapshot(this);
    write(this);
    return result;
  };
}
