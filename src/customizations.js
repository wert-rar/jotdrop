/* Fork features, compiled as a source module by esbuild. */
import MarkdownIt from 'markdown-it';

const taskMarkdown = new MarkdownIt({ html: true });

export function installJotDropCustomizations({ EditModal, CaptureModal, View, obsidian, t, stripFrontmatter }) {
  const { Component, MarkdownRenderer, Notice, setIcon, normalizePath } = obsidian;
  const icon = (button, name, label) => {
    button.replaceChildren();
    button.classList.add('jotdrop-icon-button');
    button.setAttribute('type', 'button');
    button.setAttribute('aria-label', label);
    button.removeAttribute('title');
    setIcon(button, name);
    return button;
  };
  const reportError = error => new Notice(`JotDrop: ${error.message}`);
  const run = action => event => { event.preventDefault(); void action(event).catch(reportError); };

  function taskLines(markdown) {
    const lines = markdown.split('\n');
    const tokens = taskMarkdown.parse(markdown, {});
    return tokens.flatMap((token, index) => {
      if (token.type !== 'list_item_open' || !token.map) return [];
      const inline = tokens[index + 2];
      const line = token.map[0];
      // Source maps identify actual list items, excluding code and HTML blocks.
      if (inline?.type !== 'inline' || !/^\[[ xX]\](?:[ \t]|$)/.test(inline.content)) return [];
      return /^(\s*(?:>\s*)*(?:[-+*]|\d+[.)])\s+\[)[ xX]\]/.test(lines[line]) ? [line] : [];
    });
  }
  function toggleTask(markdown, index) {
    const lines = markdown.split('\n');
    const line = taskLines(markdown)[index];
    if (line === undefined) throw new Error('Checklist item no longer exists. Reopen the note.');
    lines[line] = lines[line].replace(/^(\s*(?:>\s*)*(?:[-+*]|\d+[.)])\s+\[)([ xX])(\])/, (_, a, checked, b) => a + (checked === ' ' ? 'x' : ' ') + b);
    return lines.join('\n');
  }
  async function renderMarkdown(owner, parent, markdown, target, path, onTask) {
    const component = new Component();
    parent.addChild(component);
    owner.markdownComponents.push({ parent, component, target });
    await MarkdownRenderer.render(owner.app, markdown, target, path, component);
    const checkboxes = [...target.querySelectorAll('input.task-list-item-checkbox')]
      .filter(box => !box.closest('.internal-embed'));
    checkboxes.forEach((box, index) => {
      box.disabled = false;
      box.addEventListener('click', event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        void onTask(index).then(checked => {
          box.checked = checked;
          const item = box.closest('li.task-list-item');
          if (item) {
            item.classList.toggle('is-checked', checked);
            item.dataset.task = checked ? 'x' : ' ';
          }
        }).catch(reportError);
      }, true);
    });
    target.addEventListener('click', event => {
      const link = event.target.closest('a');
      if (!link) return;
      event.stopPropagation();
      if (link.classList.contains('internal-link')) {
        event.preventDefault();
        void owner.app.workspace.openLinkText(link.dataset.href || link.getAttribute('href'), path, event.ctrlKey || event.metaKey);
      }
    });
  }
  function clearMarkdown(owner) {
    for (const { parent, component } of owner.markdownComponents || []) parent.removeChild(component);
    owner.markdownComponents = [];
  }

  EditModal.prototype.renderNavHeader = function () {};
  EditModal.prototype.registerNavHandlers = function () {};
  function compactControls(container, allowArchive) {
    const row = container.querySelector('.jotdrop-edit-row');
    row.classList.add('jotdrop-compact-actions');
    const buttons = row.querySelectorAll('button');
    icon(buttons[0], this.state.pinned ? 'pin-off' : 'pin', t(this.state.pinned ? 'action_unpin' : 'action_pin'));
    buttons[0].setAttribute('aria-pressed', String(this.state.pinned));
    icon(buttons[1], 'link', t('action_insert_link'));
    icon(buttons[2], 'list-todo', t('action_checklist'));
    const checklist = icon(row.createEl('button'), 'list-todo', t('action_checklist'));
    buttons[2].replaceWith(checklist);
    checklist.addEventListener('click', () => {
      const editor = this.liveEditor.editor;
      const from = editor.getCursor('from'), to = editor.getCursor('to');
      const last = to.line > from.line && to.ch === 0 ? to.line - 1 : to.line;
      const lines = [];
      for (let line = from.line; line <= last; line++) {
        const text = editor.getLine(line);
        lines.push(/^\s*- \[[ xX]\] /.test(text) ? text.replace(/^(\s*)- \[[ xX]\] /, '$1') : text.replace(/^(\s*)/, '$1- [ ] '));
      }
      editor.replaceRange(lines.join('\n'), {line:from.line,ch:0}, {line:last,ch:editor.getLine(last).length});
      editor.focus();
      this.syncDraft();
    });

    if (allowArchive) {
      const archiveFolder = normalizePath(this.plugin.settings.archiveFolder).replace(/\/$/, '');
      const archived = this.file.path.startsWith(archiveFolder + '/');
      const archive = icon(row.createEl('button'), archived ? 'archive-restore' : 'archive', t(archived ? 'action_unarchive' : 'action_archive'));
      archive.addEventListener('click', run(async () => {
        archive.disabled = true;
        try {
          if (!await this.persist()) return;
          const oldPath = this.file.path;
          await View.prototype.toggleArchive.call({ app: this.app, plugin: this.plugin }, this.file, archived);
          if (this.file.path !== oldPath) this.close();
        } finally { archive.disabled = false; }
      }));
    }

    const reminder = container.querySelector('.jotdrop-reminder-row');
    const popup = row.createEl('details', { cls: 'jotdrop-reminder-popup' });
    const summary = popup.createEl('summary', { cls: 'jotdrop-icon-button' });
    setIcon(summary, 'bell');
    const updateReminderLabel = () => {
      summary.removeAttribute('title');
      summary.setAttribute('aria-label', this.state.reminder || t('label_reminder'));
      summary.classList.toggle('is-active', !!this.state.reminder);
    };
    updateReminderLabel();
    reminder.classList.add('jotdrop-reminder-panel');
    popup.appendChild(reminder);
    reminder.addEventListener('change', updateReminderLabel);
    reminder.addEventListener('click', updateReminderLabel);
    popup.addEventListener('focusout', event => { if (!popup.contains(event.relatedTarget)) popup.open = false; });
    popup.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); popup.open = false; summary.focus(); } });
    const tags = container.querySelector('.jotdrop-edit-tagrow');
    tags.querySelector('.jotdrop-edit-label').remove();
    this.tagInputEl.setAttribute('aria-label', t('label_tags'));
    row.appendChild(tags);
    container.querySelectorAll('[title][aria-label]').forEach(element => element.removeAttribute('title'));
  }
  const controls = EditModal.prototype.renderControls;
  EditModal.prototype.renderControls = function (container) {
    controls.call(this, container);
    compactControls.call(this, container, true);
  };
  const captureControls = CaptureModal.prototype.renderControls;
  CaptureModal.prototype.renderControls = function (container) {
    captureControls.call(this, container);
    const bar = container.querySelector('.jotdrop-capture-controls');
    bar.classList.add('jotdrop-edit-controls');
    compactControls.call(this, bar, false);
  };
  let NativeEditor;
  function createLiveEditor(modal, container) {
    if (!NativeEditor) {
      // Resolve the same native editor used by Obsidian's editable Markdown embeds.
      // See THIRD_PARTY.md. No file is attached to the temporary probe.
      const probe = modal.app.embedRegistry.embedByExtension.md({app:modal.app,containerEl:container.ownerDocument.createElement('div'),state:{}}, null, '');
      try {
        probe.load(); probe.editable = true; probe.showEditor();
        const Base = Object.getPrototypeOf(Object.getPrototypeOf(probe.editMode)).constructor;
        NativeEditor = class extends Base {
          onUpdate(update, changed) {
            super.onUpdate(update, changed);
            if (update.docChanged) this.onDraftChange?.();
          }
          onunload() { super.onunload(); this.destroy(); }
        };
      } finally { probe.unload(); }
    }
    const owner = {
      app:modal.app, file:modal.file || null, containerEl:container, editor:null, editMode:null,
      getMode:()=>'source', syncScroll:()=>{}, onMarkdownScroll:()=>{},
      saveImmediately:async()=>modal.syncDraft(),
      toggleMode:()=>{}, showSearch:()=>modal.liveEditor.showSearch()
    };
    const native = new NativeEditor(modal.app, container, owner);
    owner.editMode = native; owner.editor = native.editor;
    native.sourceMode = false;
    native.load();
    native.set(modal.state.body);
    native.onDraftChange = () => modal.syncDraft();
    container.addEventListener('focusin', () => {
      if (modal.app.workspace.activeEditor !== owner) modal.previousActiveEditor = modal.app.workspace.activeEditor;
      modal.app.workspace.activeEditor = owner;
    });
    container.addEventListener('focusout', event => {
      if (!container.contains(event.relatedTarget) && modal.app.workspace.activeEditor === owner) modal.app.workspace.activeEditor = modal.previousActiveEditor;
    });
    return native;
  }
  function registerDraftHotkeys(modal) {
    for (const binding of modal.draftHotkeys || []) modal.scope.unregister(binding);
    modal.draftHotkeys = [];
    const { commands, hotkeyManager } = modal.app;
    // Modal scopes do not inherit Obsidian's app scope. Forward only editor
    // commands, using the user's bindings and honoring explicitly disabled keys.
    for (const id of Object.keys(commands?.editorCommands || {})) {
      if (!id.startsWith('editor:')) continue;
      const hotkeys = hotkeyManager.getHotkeys(id) ?? hotkeyManager.getDefaultHotkeys(id) ?? [];
      for (const hotkey of hotkeys) {
        if (!hotkey.key) continue;
        const binding = modal.scope.register(hotkey.modifiers, hotkey.key, event => {
          if (!modal.liveEditorEl.contains(modal.liveEditorEl.ownerDocument.activeElement)) return;
          if (event.repeat && !commands.editorCommands[id].repeatable) return false;
          modal.app.workspace.activeEditor = modal.liveEditor.owner;
          commands.executeCommandById(id, event);
          modal.syncDraft();
          return false;
        });
        modal.draftHotkeys.push(binding);
      }
    }
    modal.draftHotkeys.push(modal.scope.register(['Mod'], 'Enter', () => { void modal.save(); return false; }));
  }
  function closeLiveEditor(modal) {
    for (const binding of modal.draftHotkeys || []) modal.scope.unregister(binding);
    modal.draftHotkeys = [];
    if (!modal.liveEditor) return;
    if (modal.app.workspace.activeEditor === modal.liveEditor.owner) modal.app.workspace.activeEditor = modal.previousActiveEditor;
    modal.liveEditor.unload();
    modal.liveEditor = null;
  }
  const layout = EditModal.prototype.buildLayout;
  EditModal.prototype.buildLayout = function () {
    layout.call(this);
    this.modalEl.classList.add('jotdrop-compact-modal');
    this.liveEditorEl = this.contentEl.createDiv({cls:'jotdrop-live-editor'});
    this.bodyEl.replaceWith(this.liveEditorEl);
    this.liveEditor = createLiveEditor(this, this.liveEditorEl);
    registerDraftHotkeys(this);
  };
  EditModal.prototype.syncDraft = function () {
    this.state.body = this.liveEditor.get();
    this.bodyEl.value = this.state.body;
  };
  EditModal.prototype.insertLinkAtCursor = function (link) {
    this.liveEditor.editor.replaceSelection(`[[${link}]]`);
    this.liveEditor.editor.focus();
    this.syncDraft();
  };
  const persist = EditModal.prototype.persist;
  EditModal.prototype.persist = async function () {
    this.syncDraft();
    return persist.call(this);
  };
  const closeEdit = EditModal.prototype.onClose;
  EditModal.prototype.onClose = function () {
    closeLiveEditor(this);
    closeEdit.call(this);
  };

  const openCapture = CaptureModal.prototype.onOpen;
  CaptureModal.prototype.onOpen = function () {
    this.state.body = '';
    openCapture.call(this);
    this.modalEl.classList.add('jotdrop-compact-modal');
    this.liveEditorEl = this.contentEl.createDiv({ cls:'jotdrop-live-editor' });
    this.textArea.replaceWith(this.liveEditorEl);
    this.contentEl.querySelector('.jotdrop-capture-hint').remove();
    this.contentEl.querySelector('.jotdrop-capture-footer').classList.add('jotdrop-edit-footer');
    this.liveEditor = createLiveEditor(this, this.liveEditorEl);
    registerDraftHotkeys(this);
    this.liveEditor.editor.focus();
  };
  CaptureModal.prototype.syncDraft = function () {
    this.state.body = this.liveEditor.get();
    this.textArea.value = this.state.body;
  };
  CaptureModal.prototype.insertLinkAtCursor = EditModal.prototype.insertLinkAtCursor;
  const saveCapture = CaptureModal.prototype.save;
  CaptureModal.prototype.save = async function () {
    if (this.savingDraft) return;
    this.savingDraft = true;
    try {
      this.syncDraft();
      return await saveCapture.call(this);
    } finally { this.savingDraft = false; }
  };
  const closeCapture = CaptureModal.prototype.onClose;
  CaptureModal.prototype.onClose = function () {
    closeLiveEditor(this);
    closeCapture.call(this);
  };

  View.prototype.decorateCard = function (card, metadataOnly) {
    const yaml = card.content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    // A content refresh with no YAML must clear stale cached pin/rank fields.
    let frontmatter = metadataOnly || yaml ? this.app.metadataCache.getFileCache(card.file)?.frontmatter || {} : {};
    if (yaml && !metadataOnly) {
      try {
        frontmatter = obsidian.parseYaml(yaml[1]) || {};
      } catch {
        // One malformed note must not prevent the other cards from rendering.
        // Retain cached metadata when available, without rewriting the note.
      }
    }
    card.order = Number.isFinite(frontmatter?.jotdrop_order) ? frontmatter.jotdrop_order : Infinity;
    card.meta.pinned = frontmatter?.pinned === true || frontmatter?.pinned === 'true';
  };
  View.prototype.releaseCardMarkdown = function (cards) {
    const removed = new Set(cards);
    for (const card of cards) this.masonryObserver?.unobserve(card);
    this.markdownComponents = (this.markdownComponents || []).filter(entry => {
      if (!removed.has(entry.target.closest('.jotdrop-card'))) return true;
      entry.parent.removeChild(entry.component);
      return false;
    });
  };
  View.prototype.moveCard = function (sourcePath, targetPath, after, columnTarget) {
    const execute = () => this.performCardMove(sourcePath, targetPath, after, columnTarget);
    const operation = this.orderQueue ? this.orderQueue.then(execute, execute) : execute();
    this.orderQueue = operation;
    return operation;
  };
  // Keep the current compact stacks when dropping: the chosen column outranks
  // global height balancing. Save one layout snapshot, not every note's metadata.
  View.prototype.captureCardPlacement = function (sourcePath, targetPath, after, columnTarget) {
    const nodes=[...this.gridEl.querySelectorAll('.jotdrop-card')];
    const target=nodes.find(node=>node.dataset.path===targetPath);
    const destination=columnTarget
      ? [...this.gridEl.querySelectorAll('.jotdrop-grid-inner')].find(inner=>inner.dataset.pinned===String(columnTarget.pinned) && inner.children.length===columnTarget.count)?.children[columnTarget.index]
      : target?.parentElement;
    if (!destination) return null;
    const source=nodes.find(node=>node.dataset.path===sourcePath);
    const columns=[...destination.parentElement.children];
    const previous=this.plugin.settings.cardLayout;
    const paths=new Set(this.orderCards.map(card=>card.file.path));
    const saved=previous?.columnCount===columns.length ? Object.fromEntries(Object.entries(previous.columns).filter(([path])=>paths.has(path))) : {};
    for (const inner of this.gridEl.querySelectorAll('.jotdrop-grid-inner')) {
      [...inner.children].forEach((column,index)=>{
        for (const node of column.children) saved[node.dataset.path]=index;
      });
    }
    saved[sourcePath]=columns.indexOf(destination);
    return {
      layout:{columnCount:columns.length,columns:saved},
      unchanged:source && (columnTarget ? source.parentElement===destination && destination.lastElementChild===source : after ? target.nextElementSibling===source : target.previousElementSibling===source)
    };
  };
  View.prototype.performCardMove = async function (sourcePath, targetPath, after, columnTarget) {
    if (sourcePath === targetPath) return;
    // A refresh already awaiting file reads must not replace the dragged DOM.
    if (this.cardRead) this.renderPending = true;
    this.renderRequest++;
    this.reordering = true;
    const previousLayout=this.plugin.settings.cardLayout;
    const previousSort=this.plugin.settings.sortMode;
    try {
      const cards = this.orderCards || await this.collectCards();
      this.orderCards = cards;
      const source = cards.find(card => card.file.path === sourcePath);
      const target = cards.find(card => card.file.path === targetPath);
      const placement=this.captureCardPlacement(sourcePath,targetPath,after,columnTarget);
      if (!source || (!target && !columnTarget) || (columnTarget && !placement)) throw new Error('A dragged note has moved or disappeared. Refresh the board.');
      if (placement?.unchanged) return;
      const pinned = columnTarget ? columnTarget.pinned : target.meta.pinned;
      const group = cards.filter(card => card !== source && card.meta.pinned === pinned);
      const mounted = new Set([...this.gridEl.querySelectorAll('.jotdrop-card')].map(node => node.dataset.path));
      // An empty column has no rank target. Keep an existing group's position;
      // appending to all notes would move a visible card beyond the render window.
      const insertion = target ? group.indexOf(target) + Number(after)
        : source.meta.pinned === pinned ? cards.filter(card => card.meta.pinned === pinned).indexOf(source)
        : group.findLastIndex(card => mounted.has(card.file.path)) + 1;
      group.splice(insertion, 0, source);
      const previousGroup = cards.filter(card=>card.meta.pinned===pinned);
      if (!placement && group.length===previousGroup.length && group.every((card,index)=>card===previousGroup[index])) return;
      const index = group.indexOf(source);
      const left = index ? group[index-1].order : null;
      const right = index < group.length-1 ? group[index+1].order : null;
      const order = left === null && right === null ? 0 : left === null ? right - 1024 : right === null ? left + 1024 : left + (right-left)/2;
      const ranksValid = group.filter(card=>card!==source).every((card,index,array)=>Number.isFinite(card.order) && (!index || card.order>array[index-1].order));
      const sparse = ranksValid && Number.isFinite(order) && (left===null || order>left) && (right===null || order<right);
      const changed = sparse ? [source] : group;
      if (sparse) source.order = order;
      else group.forEach((card,index)=>{card.order=index*1024;});
      source.meta.pinned = pinned;
      cards.sort((a,b)=>a.order-b.order);
      this.lastFiltered = cards.filter(card=>this.matchesFilters(card));
      if (placement) this.plugin.settings.cardLayout=placement.layout;
      this.plugin.settings.sortMode='manual';
      this.updateSortControl();
      this.reflowCards(true);
      for (const card of changed) {
        this.plugin.suppressModifyOnce(card.file.path);
        try {
          await this.app.fileManager.processFrontMatter(card.file, frontmatter => {
            frontmatter.jotdrop_order = card.order;
            if (card === source) frontmatter.pinned = pinned;
          });
        } catch (error) {
          this.plugin.suppressedPaths.delete(card.file.path);
          throw error;
        }
      }
      if (placement || previousSort !== 'manual') await this.plugin.saveSettings();
    } catch (error) {
      // Reload authoritative files after a failed write, undoing the optimistic DOM move.
      this.plugin.settings.cardLayout=previousLayout;
      this.plugin.settings.sortMode=previousSort;
      if (this.orderCards) this.invalidateCards({kind:'files',paths:this.orderCards.map(card=>card.file.path)});
      this.orderCards = null;
      this.renderPending = true;
      throw error;
    } finally {
      this.reordering = false;
      if (this.renderPending) { this.renderPending = false; await this.render(); }
    }
  };
  View.prototype.reflowCards = function (animate = false) {
    if (this.preserveCardColumns && !animate) return;
    if (!this.gridEl?.isConnected || !this.lastFiltered) return;
    const nodes = new Map([...this.gridEl.querySelectorAll('.jotdrop-card')].map(node=>[node.dataset.path,node]));
    const positions = new Map(animate ? [...nodes.values()].map(node=>[node,node.getBoundingClientRect()]) : []);
    // Measure layout heights independently of in-progress movement animations.
    for (const node of nodes.values()) node.jotdropReflowAnimation?.cancel();
    const sizes = new Map([...nodes.values()].map(node=>[node,node.offsetHeight]));
    const scroll = this.contentEl.scrollTop;
    const height = this.gridEl.style.minHeight;
    this.gridEl.style.minHeight = `${this.gridEl.getBoundingClientRect().height}px`;
    for (const inner of this.gridEl.querySelectorAll('.jotdrop-grid-inner')) {
      const pinned = inner.dataset.pinned === 'true';
      const columns = [...inner.children];
      const cards = this.lastFiltered.filter(card=>card.meta.pinned===pinned && nodes.has(card.file.path));
      inner.style.display=cards.length?'':'none';
      const gap=cards.length?parseFloat(inner.ownerDocument.defaultView.getComputedStyle(columns[0]).rowGap):0;
      const heights=columns.map(()=>0);
      const placements=columns.map(()=>[]);
      const saved=this.plugin.settings.sortMode==='manual' && this.plugin.settings.cardLayout?.columnCount===columns.length ? this.plugin.settings.cardLayout.columns : null;
      for (const card of cards) {
        const node=nodes.get(card.file.path);
        let shortest=0;
        for (let index=1;index<columns.length;index++) if (heights[index]<heights[shortest]) shortest=index;
        if (saved && saved[card.file.path]!==undefined) shortest=saved[card.file.path];
        placements[shortest].push(node);
        heights[shortest]+=sizes.get(node)+gap;
        const pinChanged=node.classList.contains('is-pinned')!==pinned;
        Object.assign(node.jotdropData.meta,card.meta);
        node.classList.toggle('is-pinned',pinned);
        if (pinChanged) {
          const button=node.querySelector('.jotdrop-card-quick-pin');
          button.classList.toggle('is-active',pinned);
          button.setAttribute('aria-pressed',String(pinned));
          button.setAttribute('aria-label',t(pinned?'action_unpin':'action_pin'));
          setIcon(button,pinned?'pin-off':'pin');
        }
      }
      placements.forEach((ordered,column)=>{
        ordered.forEach((node,index)=>{
          const current=columns[column].children[index];
          if (current!==node) columns[column].insertBefore(node,current||null);
        });
      });
      const label=inner.parentElement.querySelector(':scope > .jotdrop-section-label');
      if(label) label.style.display=cards.length?'':'none';
    }
    this.gridEl.style.minHeight=height;
    this.contentEl.scrollTop=scroll;
    if (animate && !this.contentEl.ownerDocument.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const [node,before] of positions) {
        const after=node.getBoundingClientRect();
        if ((before.x!==after.x || before.y!==after.y) && after.bottom>0 && after.top<this.contentEl.ownerDocument.defaultView.innerHeight) node.jotdropReflowAnimation=node.animate([{transform:`translate(${before.x-after.x}px,${before.y-after.y}px)`},{transform:'translate(0,0)'}],{duration:80,easing:'ease-out'});
      }
    }
  };
  View.prototype.scheduleMasonryLayout = function () {
    if (this.preserveCardColumns) return;
    if (this.masonryFrame != null) return;
    const win=this.contentEl.ownerDocument.defaultView;
    this.masonryFrame=win.requestAnimationFrame(()=>{
      this.masonryFrame=null;
      // Do not move drop targets while the pointer is carrying a card.
      if (this.draggedPath) { this.masonryDeferred=true; return; }
      this.reflowCards();
    });
  };
  View.prototype.stopMasonryObservation = function () {
    this.masonryObserver?.disconnect();
    if (this.masonryFrame != null) this.contentEl.ownerDocument.defaultView.cancelAnimationFrame(this.masonryFrame);
    this.masonryFrame=null;
    this.masonryDeferred=false;
  };
  View.prototype.observeCardSize = function (card) {
    if (!this.masonryObserver) {
      this.masonrySizes=new WeakMap();
      this.masonryObserver=new this.contentEl.ownerDocument.defaultView.ResizeObserver(entries=>{
        let changed=false;
        for (const {target} of entries) {
          const size=[target.offsetWidth,target.offsetHeight];
          const previous=this.masonrySizes.get(target);
          if (!previous || size[0]!==previous[0] || size[1]!==previous[1]) changed=true;
          this.masonrySizes.set(target,size);
        }
        if (changed) this.scheduleMasonryLayout();
      });
    }
    this.masonrySizes.set(card,[card.offsetWidth,card.offsetHeight]);
    this.masonryObserver.observe(card);
  };
  View.prototype.dropColumnAt = function (event) {
    const direct = event.target.closest?.('.jotdrop-grid-col');
    if (direct) return direct;
    // Flex gaps and the free grid background belong to the nearest visible column.
    let nearest = null, distance = Infinity;
    for (const column of this.gridEl.querySelectorAll('.jotdrop-grid-col')) {
      const rect = column.getClientRects()[0];
      if (!rect) continue;
      const dx = Math.max(rect.left - event.clientX, 0, event.clientX - rect.right);
      const dy = Math.max(rect.top - event.clientY, 0, event.clientY - rect.bottom);
      const squared = dx * dx + dy * dy;
      if (squared < distance) { nearest = column; distance = squared; }
    }
    return nearest;
  };
  // The carried card's top edge, not the pointer, picks the slot: a tall card
  // grabbed low still lands where its drag image visibly sits.
  View.prototype.dropSlotAt = function (event) {
    const column = this.dropColumnAt(event);
    if (!column) return null;
    const top = event.clientY - (this.dragGrabOffset || 0);
    const cards = [...column.children].filter(node => node.classList.contains('jotdrop-card') && node.dataset.path !== this.draggedPath);
    const next = cards.find(node => { const rect = node.getBoundingClientRect(); return top < rect.top + rect.height / 2; });
    if (next) return { column, target: next, after: false };
    return cards.length ? { column, target: cards.at(-1), after: true } : { column, target: null, after: false };
  };
  View.prototype.markDropSlot = function (slot) {
    const element = slot?.target || slot?.column || null;
    const cls = !slot ? null : !slot.target ? 'jotdrop-column-drop' : slot.after ? 'jotdrop-drop-after' : 'jotdrop-drop-before';
    const marker = this.dropMarker;
    if (marker?.element === element && marker?.cls === cls) return;
    marker?.element.classList.remove(marker.cls);
    element?.classList.add(cls);
    this.dropMarker = element ? { element, cls } : null;
  };
  // Cards move with pointer events, not HTML5 drag and drop: on Windows the
  // native drag runs an OS modal loop that held Obsidian for seconds per drop.
  const DRAG_THRESHOLD_PX = 10; // Matches the long-press cancel distance.
  const AUTO_SCROLL_EDGE_PX = 56;
  View.prototype.beginCardPress = function (event, card, data) {
    if (event.button !== 0 || event.pointerType === 'touch' || this.selectionMode || this.cardDrag) return;
    if (event.target.closest('a, input, button, textarea, select, summary, [contenteditable="true"], .jotdrop-card-actions')) return;
    const doc = card.ownerDocument, win = doc.defaultView;
    const { pointerId, clientX: startX, clientY: startY } = event;
    let dragging = false;
    const stop = () => {
      doc.removeEventListener('pointermove', move, true);
      doc.removeEventListener('pointerup', up, true);
      doc.removeEventListener('pointercancel', cancel, true);
      doc.removeEventListener('keydown', key, true);
      win.removeEventListener('blur', cancel);
    };
    const move = moved => {
      if (moved.pointerId !== pointerId) return;
      if (!dragging) {
        if (Math.abs(moved.clientX - startX) <= DRAG_THRESHOLD_PX && Math.abs(moved.clientY - startY) <= DRAG_THRESHOLD_PX) return;
        if (!card.isConnected || this.selectionMode) { stop(); return; }
        dragging = true;
        this.startCardDrag(card, data, startX, startY);
      }
      moved.preventDefault();
      this.updateCardDrag(moved.clientX, moved.clientY);
    };
    const up = released => {
      if (released.pointerId !== pointerId) return;
      stop();
      if (!dragging) return;
      this.updateCardDrag(released.clientX, released.clientY);
      void this.finishCardDrag(true).catch(reportError);
    };
    const cancel = () => {
      stop();
      if (dragging) void this.finishCardDrag(false).catch(reportError);
    };
    const key = pressed => {
      if (pressed.key !== 'Escape' || !dragging) return;
      pressed.preventDefault();
      pressed.stopPropagation();
      cancel();
    };
    doc.addEventListener('pointermove', move, true);
    doc.addEventListener('pointerup', up, true);
    doc.addEventListener('pointercancel', cancel, true);
    doc.addEventListener('keydown', key, true);
    win.addEventListener('blur', cancel);
  };
  View.prototype.startCardDrag = function (card, data, x, y) {
    const doc = card.ownerDocument;
    const rect = card.getBoundingClientRect();
    this.draggedPath = data.file.path;
    this.dragGrabOffset = Math.min(Math.max(y - rect.top, 0), rect.height);
    this.dropSlot = null;
    // A refresh already awaiting file reads is replayed after the drag ends.
    if (this.cardRead) this.renderPending = true;
    this.renderRequest++;
    const ghost = card.cloneNode(true);
    ghost.removeAttribute('data-path');
    ghost.classList.remove('is-dragging', 'jotdrop-drop-before', 'jotdrop-drop-after');
    ghost.classList.add('jotdrop-drag-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    Object.assign(ghost.style, { width: `${rect.width}px`, height: `${rect.height}px` });
    doc.body.appendChild(ghost);
    card.classList.add('is-dragging');
    doc.body.classList.add('jotdrop-is-card-dragging');
    doc.getSelection()?.removeAllRanges();
    this.cardDrag = { card, ghost, grabX: x - rect.left, x, y, scroll: 0, frame: null };
  };
  View.prototype.updateCardDrag = function (x, y) {
    const drag = this.cardDrag;
    if (!drag) return;
    drag.x = x; drag.y = y;
    drag.ghost.style.transform = `translate3d(${x - drag.grabX}px, ${y - this.dragGrabOffset}px, 0)`;
    const doc = this.contentEl.ownerDocument, win = doc.defaultView;
    const view = this.contentEl.getBoundingClientRect();
    const horizontal = x >= view.left && x <= view.right;
    const under = horizontal && y >= view.top && y <= view.bottom ? doc.elementFromPoint(x, y) : null;
    const onBoard = under && this.contentEl.contains(under) && !under.closest('.jotdrop-toolbar, .jotdrop-filter-bar');
    const slot = onBoard ? this.dropSlotAt({ clientX: x, clientY: y, target: under }) : null;
    this.dropSlot = slot;
    this.markDropSlot(slot);
    // Scroll the board while the pointer rests near its top or bottom edge.
    const depth = !horizontal ? 0 : y < view.top + AUTO_SCROLL_EDGE_PX ? y - view.top - AUTO_SCROLL_EDGE_PX
      : y > view.bottom - AUTO_SCROLL_EDGE_PX ? y - view.bottom + AUTO_SCROLL_EDGE_PX : 0;
    drag.scroll = Math.max(-24, Math.min(24, Math.round(depth * 0.4)));
    if (drag.scroll && drag.frame == null) {
      drag.frame = win.requestAnimationFrame(() => {
        drag.frame = null;
        if (this.cardDrag !== drag || !drag.scroll) return;
        const before = this.contentEl.scrollTop;
        this.contentEl.scrollTop += drag.scroll;
        if (this.contentEl.scrollTop !== before) this.updateCardDrag(drag.x, drag.y);
      });
    }
  };
  View.prototype.finishCardDrag = async function (commit) {
    const drag = this.cardDrag;
    if (!drag) return;
    const doc = drag.card.ownerDocument, win = doc.defaultView;
    if (drag.frame != null) win.cancelAnimationFrame(drag.frame);
    this.cardDrag = null;
    drag.ghost.remove();
    drag.card.classList.remove('is-dragging');
    doc.body.classList.remove('jotdrop-is-card-dragging');
    const slot = commit && this.dropSlot?.column.isConnected ? this.dropSlot : null;
    const source = this.draggedPath;
    this.dropSlot = null;
    this.markDropSlot(null);
    this.draggedPath = null;
    // The release would otherwise click the card under the pointer and open it.
    const swallow = clicked => { clicked.preventDefault(); clicked.stopPropagation(); };
    doc.addEventListener('click', swallow, true);
    win.setTimeout(() => doc.removeEventListener('click', swallow, true), 0);
    if (this.masonryDeferred) { this.masonryDeferred=false; this.scheduleMasonryLayout(); }
    if (!slot) {
      // A cancelled drag replays the refresh deferred while the card was carried.
      if (this.renderPending && !this.reordering) { this.renderPending=false; await this.render(); }
      return;
    }
    const columns = slot.column.parentElement;
    if (slot.target) await this.moveCard(source, slot.target.dataset.path, slot.after);
    else await this.moveCard(source, null, false, {pinned:columns.dataset.pinned==='true',index:[...columns.children].indexOf(slot.column),count:columns.children.length});
  };
  const render = View.prototype.render;
  View.prototype.render = async function (...args) {
    // Rebuilding the grid would replace the carried card and its drop targets.
    if (this.reordering || this.draggedPath) { this.renderPending=true; return; }
    return render.apply(this, args);
  };
  const renderCards = View.prototype.renderCards;
  View.prototype.renderCards = function (cards, reuseLayout = false) {
    // Only an accepted render owns the displayed order; cancelled reads are pure.
    this.orderCards = cards;
    // Visibility changes retain Markdown components and existing column stacks.
    this.stopMasonryObservation();
    if (reuseLayout) return renderCards.call(this, cards, true);
    const scroll = this.contentEl.scrollTop;
    const height = this.gridEl?.style.minHeight;
    if (this.gridEl) this.gridEl.style.minHeight=`${this.gridEl.getBoundingClientRect().height}px`;
    try { return renderCards.call(this, cards); }
    finally {
      if (this.gridEl) this.gridEl.style.minHeight=height;
      this.contentEl.scrollTop=scroll;
    }
  };
  const closeView = View.prototype.onClose;
  View.prototype.onClose = async function () {
    this.stopMasonryObservation();
    // Closing mid-drag must not leave the floating card behind.
    if (this.cardDrag) {
      this.cardDrag.ghost.remove();
      this.cardDrag.card.ownerDocument.body.classList.remove('jotdrop-is-card-dragging');
      this.cardDrag = null;
      this.draggedPath = null;
    }
    this.masonryObserver=null;
    clearMarkdown(this);
    return closeView.call(this);
  };
  View.prototype.renderCardMarkdown = function (container, markdown, file) {
    container.classList.add('markdown-rendered');
    this.markdownComponents ||= [];
    void renderMarkdown(this, this, markdown, container, file.path, async index => {
      let checked;
      this.plugin.suppressModifyOnce(file.path);
      try {
        await this.app.vault.process(file, text => {
          const body = stripFrontmatter(text);
          const updated = toggleTask(body, index);
          checked = /^\s*(?:>\s*)*(?:[-+*]|\d+[.)])\s+\[[xX]\]/.test(updated.split('\n')[taskLines(updated)[index]]);
          return text.slice(0, text.length - body.length) + updated;
        });
      } catch (error) {
        this.plugin.suppressedPaths.delete(file.path);
        throw error;
      }
      return checked;
    }).catch(reportError);
  };
  const renderCard = View.prototype.renderCard;
  View.prototype.renderCard = function (parent, data) {
    renderCard.call(this, parent, data);
    const card = parent.lastElementChild;
    card.jotdropData=data;
    this.observeCardSize(card);
    parent.parentElement.dataset.pinned=String(data.meta.pinned);
    card.draggable = false;
    // Images and links inside a card must not start an OS drag either.
    card.addEventListener('dragstart', event => event.preventDefault());
    card.addEventListener('pointerdown', event => this.beginCardPress(event, card, data));
  };
}
