/* Fork features, compiled as a source module by esbuild. */
import MarkdownIt from 'markdown-it';

const taskMarkdown = new MarkdownIt({ html: true });

export function installJotDropCustomizations({ EditModal, View, obsidian, t, stripFrontmatter }) {
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
    owner.markdownComponents.push({ parent, component });
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
  const controls = EditModal.prototype.renderControls;
  EditModal.prototype.renderControls = function (container) {
    controls.call(this, container);
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
      app:modal.app, file:modal.file, containerEl:container, editor:null, editMode:null,
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
  const layout = EditModal.prototype.buildLayout;
  EditModal.prototype.buildLayout = function () {
    layout.call(this);
    this.modalEl.classList.add('jotdrop-compact-modal');
    this.liveEditorEl = this.contentEl.createDiv({cls:'jotdrop-live-editor'});
    this.bodyEl.replaceWith(this.liveEditorEl);
    this.liveEditor = createLiveEditor(this, this.liveEditorEl);
    this.scope.register(['Mod'], 'Enter', () => { void this.save(); return false; });
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
    if (this.liveEditor) {
      if (this.app.workspace.activeEditor === this.liveEditor.owner) this.app.workspace.activeEditor = this.previousActiveEditor;
      this.liveEditor.unload();
      this.liveEditor = null;
    }
    closeEdit.call(this);
  };

  const collect = View.prototype.collectCards;
  View.prototype.collectCards = async function () {
    const cards = await collect.call(this);
    for (const card of cards) {
      const yaml = card.content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
      let frontmatter = {};
      if (yaml) {
        frontmatter = this.app.metadataCache.getFileCache(card.file)?.frontmatter || {};
        try {
          frontmatter = obsidian.parseYaml(yaml[1]) || {};
        } catch {
          // One malformed note must not prevent the other cards from rendering.
          // Retain cached metadata when available, without rewriting the note.
        }
      }
      card.order = Number.isFinite(frontmatter?.jotdrop_order) ? frontmatter.jotdrop_order : Infinity;
      card.meta.pinned = frontmatter?.pinned === true || frontmatter?.pinned === 'true';
    }
    if (this.plugin.settings.sortMode === 'manual') {
      cards.sort((a, b) => a.order - b.order);
    }
    this.orderCards = cards;
    return cards;
  };
  View.prototype.moveCard = function (sourcePath, targetPath, after) {
    const execute = () => this.performCardMove(sourcePath, targetPath, after);
    const operation = this.orderQueue ? this.orderQueue.then(execute, execute) : execute();
    this.orderQueue = operation;
    return operation;
  };
  // Keep the current compact stacks when dropping: the chosen column outranks
  // global height balancing. Save one layout snapshot, not every note's metadata.
  View.prototype.captureCardPlacement = function (sourcePath, targetPath, after) {
    const nodes=[...this.gridEl.querySelectorAll('.jotdrop-card')];
    const target=nodes.find(node=>node.dataset.path===targetPath);
    if (!target) return null;
    const source=nodes.find(node=>node.dataset.path===sourcePath);
    const columns=[...target.parentElement.parentElement.children];
    const previous=this.plugin.settings.cardLayout;
    const paths=new Set(this.orderCards.map(card=>card.file.path));
    const saved=previous?.columnCount===columns.length ? Object.fromEntries(Object.entries(previous.columns).filter(([path])=>paths.has(path))) : {};
    for (const inner of this.gridEl.querySelectorAll('.jotdrop-grid-inner')) {
      [...inner.children].forEach((column,index)=>{
        for (const node of column.children) saved[node.dataset.path]=index;
      });
    }
    saved[sourcePath]=columns.indexOf(target.parentElement);
    return {
      layout:{columnCount:columns.length,columns:saved},
      unchanged:source && (after ? target.nextElementSibling===source : target.previousElementSibling===source)
    };
  };
  View.prototype.performCardMove = async function (sourcePath, targetPath, after) {
    if (sourcePath === targetPath) return;
    this.reordering = true;
    const previousLayout=this.plugin.settings.cardLayout;
    const previousSort=this.plugin.settings.sortMode;
    try {
      const cards = this.orderCards || await this.collectCards();
      const source = cards.find(card => card.file.path === sourcePath);
      const target = cards.find(card => card.file.path === targetPath);
      if (!source || !target) throw new Error('A dragged note has moved or disappeared. Refresh the board.');
      const placement=this.captureCardPlacement(sourcePath,targetPath,after);
      if (placement?.unchanged) return;
      const group = cards.filter(card => card !== source && card.meta.pinned === target.meta.pinned);
      group.splice(group.indexOf(target) + Number(after), 0, source);
      const previousGroup = cards.filter(card=>card.meta.pinned===target.meta.pinned);
      if (!placement && group.length===previousGroup.length && group.every((card,index)=>card===previousGroup[index])) return;
      const index = group.indexOf(source);
      const left = index ? group[index-1].order : null;
      const right = index < group.length-1 ? group[index+1].order : null;
      const order = left === null ? right - 1024 : right === null ? left + 1024 : left + (right-left)/2;
      const ranksValid = group.filter(card=>card!==source).every((card,index,array)=>Number.isFinite(card.order) && (!index || card.order>array[index-1].order));
      const sparse = ranksValid && Number.isFinite(order) && (left===null || order>left) && (right===null || order<right);
      const changed = sparse ? [source] : group;
      if (sparse) source.order = order;
      else group.forEach((card,index)=>{card.order=index*1024;});
      source.meta.pinned = target.meta.pinned;
      cards.sort((a,b)=>a.order-b.order);
      this.lastFiltered = cards.filter(card=>this.matchesFilters(card));
      if (placement) this.plugin.settings.cardLayout=placement.layout;
      this.plugin.settings.sortMode='manual';
      this.reflowCards(true);
      for (const card of changed) {
        this.plugin.suppressModifyOnce(card.file.path);
        try {
          await this.app.fileManager.processFrontMatter(card.file, frontmatter => {
            frontmatter.jotdrop_order = card.order;
            if (card === source) frontmatter.pinned = target.meta.pinned;
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
      this.orderCards = null;
      this.renderPending = true;
      throw error;
    } finally {
      this.reordering = false;
      if (this.renderPending) { this.renderPending = false; await this.render(); }
    }
  };
  View.prototype.reflowCards = function (animate = false) {
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
        if ((before.x!==after.x || before.y!==after.y) && after.bottom>0 && after.top<this.contentEl.ownerDocument.defaultView.innerHeight) node.jotdropReflowAnimation=node.animate([{transform:`translate(${before.x-after.x}px,${before.y-after.y}px)`},{transform:'translate(0,0)'}],{duration:160,easing:'ease-out'});
      }
    }
  };
  View.prototype.scheduleMasonryLayout = function () {
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
  const render = View.prototype.render;
  View.prototype.render = async function () {
    if (this.reordering) { this.renderPending=true; return; }
    this.stopMasonryObservation();
    const scroll = this.contentEl.scrollTop;
    const height = this.gridEl?.style.minHeight;
    if (this.gridEl) this.gridEl.style.minHeight=`${this.gridEl.getBoundingClientRect().height}px`;
    clearMarkdown(this);
    try { return await render.call(this); }
    finally {
      if (this.gridEl) this.gridEl.style.minHeight=height;
      this.contentEl.scrollTop=scroll;
    }
  };
  const closeView = View.prototype.onClose;
  View.prototype.onClose = async function () {
    this.stopMasonryObservation();
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
    card.draggable = !this.selectionMode;
    card.addEventListener('dragstart', event => {
      if (this.selectionMode || event.target.closest('a, input, button')) { event.preventDefault(); return; }
      this.draggedPath = data.file.path;
      event.dataTransfer.setData('application/x-jotdrop-note', data.file.path);
      event.dataTransfer.effectAllowed = 'move';
      card.classList.add('is-dragging');
    });
    const clearDrop = () => {
      card.classList.remove('jotdrop-drop-before', 'jotdrop-drop-after');
    };
    card.addEventListener('dragover', event => {
      if (!this.draggedPath || this.draggedPath === data.file.path) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const rect = card.getBoundingClientRect();
      const after = event.clientY > rect.top + rect.height / 2;
      card.classList.toggle('jotdrop-drop-before', !after);
      card.classList.toggle('jotdrop-drop-after', after);
    });
    card.addEventListener('dragleave', clearDrop);
    card.addEventListener('drop', run(async event => {
      event.stopPropagation();
      const source = event.dataTransfer.getData('application/x-jotdrop-note');
      const after = card.classList.contains('jotdrop-drop-after');
      clearDrop();
      if (source && source === this.draggedPath) await this.moveCard(source, data.file.path, after);
    }));
    card.addEventListener('dragend', () => {
      this.draggedPath = null;
      card.classList.remove('is-dragging');
      this.gridEl.querySelectorAll('.jotdrop-drop-before, .jotdrop-drop-after').forEach(el => el.classList.remove('jotdrop-drop-before', 'jotdrop-drop-after'));
      if (this.masonryDeferred) { this.masonryDeferred=false; this.scheduleMasonryLayout(); }
    });
  };
}
