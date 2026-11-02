// Minimal stand-in for the Obsidian API, enough to run main.js in a browser.
// Development only: Obsidian never loads this folder, and releases ship only main.js, manifest.json and styles.css.
(function () {
  'use strict';

  // ── DOM helpers Obsidian adds to elements and fragments ──
  function applyOpts(el, o) {
    if (typeof o === 'string') o = { cls: o };
    if (!o) return el;
    if (o.cls) el.setAttribute('class', Array.isArray(o.cls) ? o.cls.join(' ') : o.cls);
    if (o.text != null) el.textContent = o.text;
    if (o.type) el.type = o.type;
    if (o.value != null) el.value = o.value;
    if (o.placeholder) el.placeholder = o.placeholder;
    if (o.attr) Object.entries(o.attr).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  }
  const creators = {
    createEl(tag, o, cb) { const el = applyOpts(document.createElement(tag), o); this.appendChild(el); if (cb) cb(el); return el; },
    createDiv(o, cb) { return this.createEl('div', o, cb); },
    createSpan(o, cb) { return this.createEl('span', o, cb); },
  };
  Object.assign(HTMLElement.prototype, creators, {
    empty() { while (this.firstChild) this.removeChild(this.firstChild); },
    addClass(...c) { this.classList.add(...c); },
    removeClass(...c) { this.classList.remove(...c); },
    toggleClass(c, v) { this.classList.toggle(c, v); },
    setText(t) { this.textContent = t; },
    setAttr(k, v) { this.setAttribute(k, v); },
    setCssProps(props) { Object.entries(props).forEach(([k, v]) => this.style.setProperty(k, v)); },
    setCssStyles(styles) { Object.assign(this.style, styles); },
  });
  Object.assign(DocumentFragment.prototype, creators);
  Element.prototype.createSvg = function (tag, o) { const el = applyOpts(document.createElementNS('http://www.w3.org/2000/svg', tag), o); this.appendChild(el); return el; };
  window.activeDocument = document;
  window.createFragment = (cb) => { const f = document.createDocumentFragment(); if (cb) cb(f); return f; };

  // ── Icons: the Lucide glyphs main.js asks for, plus anything added with addIcon ──
  const ICONS = {
    plus: '<path d="M5 12h14M12 5v14"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
    bike: '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
    truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
    receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
    paperclip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    'external-link': '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    fuel: '<line x1="3" x2="15" y1="22" y2="22"/><line x1="4" x2="14" y1="9" y2="9"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/>',
    zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
    gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    'refresh-cw': '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    'file-json': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
    table: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M3 15h18M12 3v18"/>',
    pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    'trending-up': '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    play: '<path d="m6 3 14 9-14 9V3z"/>',
    pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
    ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
    'trash-2': '<path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  };
  const CUSTOM = {};
  function addIcon(name, svg) { CUSTOM[name] = svg; }
  function setIcon(el, name) {
    el.innerHTML = CUSTOM[name]
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="16" height="16" class="svg-icon">${CUSTOM[name]}</svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon">${ICONS[name] || ''}</svg>`;
  }

  function normalizePath(p) {
    return String(p).replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '').trim();
  }

  // ── Notices ──
  const noticeLog = [];
  class Notice {
    constructor(msg, ms = 4000) {
      let host = document.querySelector('.notice-container');
      if (!host) host = document.body.createDiv('notice-container');
      this.noticeEl = this.messageEl = host.createDiv('notice');
      if (typeof msg === 'string') this.noticeEl.textContent = msg;
      else this.noticeEl.appendChild(msg);
      noticeLog.push(this);
      if (ms) this._t = setTimeout(() => this.hide(), ms);
    }
    hide() { clearTimeout(this._t); this.noticeEl.remove(); }
  }

  // ── Menu ──
  class Menu {
    constructor() { this.items = []; }
    addItem(cb) {
      const it = { title: '', icon: '', click: null };
      const api = {
        setTitle: (t) => { it.title = t; return api; },
        setIcon: (i) => { it.icon = i; return api; },
        onClick: (f) => { it.click = f; return api; },
      };
      cb(api);
      this.items.push(it);
      return this;
    }
    addSeparator() { this.items.push(null); return this; }
    showAtPosition(pos) { this.showAtMouseEvent(pos); }
    showAtMouseEvent(e) {
      document.querySelectorAll('.menu').forEach((m) => m.remove());
      const m = document.body.createDiv('menu');
      this.items.forEach((it) => {
        if (!it) return m.createDiv('menu-separator');
        const row = m.createDiv('menu-item');
        setIcon(row.createSpan('menu-item-icon'), it.icon);
        row.createSpan({ text: it.title });
        row.onclick = () => { m.remove(); it.click && it.click(); };
      });
      m.style.left = Math.min(e.clientX || e.x || 0, innerWidth - 220) + 'px';
      m.style.top = Math.min(e.clientY || e.y || 0, innerHeight - m.offsetHeight - 8) + 'px';
      window.__lastMenu = m;
      setTimeout(() => document.addEventListener('click', () => m.remove(), { once: true }), 0);
    }
  }

  // ── Modals ──
  class Modal {
    constructor(app) {
      this.app = app;
      this.containerEl = document.createElement('div');
      this.containerEl.className = 'modal-container';
      this.containerEl.createDiv('modal-bg').onclick = () => this.close();
      this.modalEl = this.containerEl.createDiv('modal');
      const x = this.modalEl.createDiv('modal-close-button');
      x.textContent = '×';
      x.onclick = () => this.close();
      this.titleEl = this.modalEl.createDiv('modal-title');
      this.contentEl = this.modalEl.createDiv('modal-content');
      this._esc = (e) => { if (e.key === 'Escape') this.close(); };
    }
    open() { document.body.appendChild(this.containerEl); document.addEventListener('keydown', this._esc); this.onOpen(); }
    close() { this.containerEl.remove(); document.removeEventListener('keydown', this._esc); this.onClose(); }
    onOpen() {}
    onClose() {}
  }

  class FuzzySuggestModal extends Modal {
    setPlaceholder(p) { this._ph = p; }
    onOpen() {
      const input = this.contentEl.createEl('input', { type: 'text', placeholder: this._ph || '', cls: 'prompt-input' });
      const list = this.contentEl.createDiv('suggestion-container');
      const draw = () => {
        list.empty();
        const q = input.value.toLowerCase();
        this.getItems().filter((i) => this.getItemText(i).toLowerCase().includes(q)).forEach((item) => {
          const row = list.createDiv({ cls: 'suggestion-item', text: this.getItemText(item) });
          row.onclick = () => { this.close(); this.onChooseItem(item); };
        });
        if (!list.childElementCount) list.createDiv({ cls: 'suggestion-empty', text: 'No matching files.' });
      };
      input.oninput = draw;
      draw();
    }
  }

  // ── Settings controls ──
  function component(el) {
    const api = {
      inputEl: el, selectEl: el, buttonEl: el, toggleEl: el,
      setValue: (v) => { if (el.type === 'checkbox') el.checked = !!v; else el.value = v; return api; },
      getValue: () => (el.type === 'checkbox' ? el.checked : el.value),
      setPlaceholder: (p) => { el.placeholder = p; return api; },
      onChange: (f) => { el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', () => f(el.type === 'checkbox' ? el.checked : el.value)); return api; },
      addOption: (v, t) => { el.createEl('option', { text: t, value: v }); return api; },
      setButtonText: (t) => { el.textContent = t; return api; },
      setCta: () => { el.addClass('mod-cta'); return api; },
      setWarning: () => { el.addClass('mod-warning'); return api; },
      setDisabled: (d) => { el.disabled = d; return api; },
      onClick: (f) => { el.addEventListener('click', f); return api; },
      setIcon: (n) => { setIcon(el, n); return api; },
      setTooltip: (t) => { el.setAttribute('aria-label', t); el.title = t; return api; },
    };
    return api;
  }
  class Setting {
    constructor(parent) {
      this.settingEl = parent.createDiv('setting-item');
      this.infoEl = this.settingEl.createDiv('setting-item-info');
      this.nameEl = this.infoEl.createDiv('setting-item-name');
      this.descEl = this.infoEl.createDiv('setting-item-description');
      this.controlEl = this.settingEl.createDiv('setting-item-control');
    }
    setName(n) { this.nameEl.textContent = n; return this; }
    setDesc(d) { this.descEl.textContent = d; return this; }
    setHeading() { this.settingEl.addClass('setting-item-heading'); return this; }
    setClass(c) { this.settingEl.addClass(c); return this; }
    addText(cb) { cb(component(this.controlEl.createEl('input', { type: 'text' }))); return this; }
    addTextArea(cb) { cb(component(this.controlEl.createEl('textarea'))); return this; }
    addDropdown(cb) { cb(component(this.controlEl.createEl('select', 'dropdown'))); return this; }
    addButton(cb) { cb(component(this.controlEl.createEl('button'))); return this; }
    addExtraButton(cb) { cb(component(this.controlEl.createEl('button', 'clickable-icon extra-setting-button'))); return this; }
    addToggle(cb) { cb(component(this.controlEl.createEl('label', 'checkbox-container').createEl('input', { type: 'checkbox' }))); return this; }
  }

  // ── Vault (in memory) ──
  class TFile {
    constructor(path) {
      this.path = path;
      this.name = path.split('/').pop();
      this.extension = this.name.includes('.') ? this.name.split('.').pop() : '';
      this.basename = this.name.replace(/\.[^.]+$/, '');
    }
  }
  const files = new Map();
  const folders = new Set();
  const vault = {
    getFiles: () => [...files.keys()].map((p) => files.get(p).file),
    getFileByPath: (p) => (files.has(p) ? files.get(p).file : null),
    getFolderByPath: (p) => (folders.has(p) ? { path: p, children: [] } : null),
    process: async (f, fn) => { files.get(f.path).data = fn(files.get(f.path).data); return files.get(f.path).data; },
    getAbstractFileByPath: (p) => (files.has(p) ? files.get(p).file : folders.has(p) ? { path: p, children: [] } : null),
    read: async (f) => files.get(f.path).data,
    cachedRead: async (f) => files.get(f.path).data,
    create: async (p, data) => {
      if (files.has(p)) throw new Error('File already exists.');
      const file = new TFile(p);
      files.set(p, { file, data });
      return file;
    },
    createBinary: async (p, data) => vault.create(p, data),
    modify: async (f, data) => { files.get(f.path).data = data; },
    createFolder: async (p) => { folders.add(p); },
  };

  // ── Workspace, views, plugin ──
  const leaves = [];
  const app = {
    vault,
    workspace: {
      getLeavesOfType: () => leaves,
      getLeaf: () => leaves[0],
      revealLeaf: async () => {},
      onLayoutReady: (cb) => setTimeout(cb, 0),
      openLinkText: (p) => new Notice(`Would open ${p}`),
    },
  };

  class Component {
    load() { this.onload && this.onload(); }
    unload() { this.onunload && this.onunload(); }
  }
  class MarkdownRenderChild extends Component {
    constructor(containerEl) { super(); this.containerEl = containerEl; }
  }

  class ItemView {
    constructor(leaf) {
      this.leaf = leaf;
      this.app = app;
      this.containerEl = leaf.containerEl;
      this.contentEl = leaf.containerEl.createDiv('view-content');
    }
  }

  class PluginSettingTab {
    constructor(appRef, plugin) { this.app = appRef; this.plugin = plugin; this.containerEl = document.createElement('div'); }
  }

  // Demo mode keeps its own store so it never mixes with your own data
  const store = () => (window.__VM_DEMO__ ? 'vm-preview-demo' : 'vm-preview-data');
  class Plugin {
    constructor() { this.app = app; this.codeBlocks = {}; this.commands = {}; }
    async loadData() {
      if (window.__VM_EMPTY__) return null;
      if (window.__VM_DEMO__) return window.__demoData();
      const cached = localStorage.getItem(store());
      if (cached) return JSON.parse(cached);
      // Your vault's data.json when present, otherwise the fictional demo
      const res = await fetch('../data.json').catch(() => null);
      if (res && res.ok) return res.json();
      window.__VM_DEMO__ = true;
      return window.__demoData();
    }
    async saveData(d) { localStorage.setItem(store(), JSON.stringify(d)); }
    registerView(type, factory) { this._viewFactory = factory; }
    addRibbonIcon() {}
    addSettingTab(tab) { this._settingTab = tab; }
    addCommand(c) { this.commands[c.id] = c; }
    registerMarkdownCodeBlockProcessor(lang, fn) { this.codeBlocks[lang] = fn; }
  }

  async function requestUrl() { throw new Error('offline preview'); }

  window.__obsidian = {
    Plugin, ItemView, Modal, Setting, Notice, PluginSettingTab, Menu, FuzzySuggestModal,
    MarkdownRenderChild, TFile, requestUrl, setIcon, addIcon, normalizePath,
  };
  window.__obsidianApp = app;
  window.__obsidianLeaves = leaves;
  window.__noticeLog = noticeLog;
  window.__vaultFiles = files;
})();
