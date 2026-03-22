// ═══════════════════════════════════════════════════════════════
// APP NAMESPACE — Step 1 of incremental refactor
// Canonical home for all functions. Global names kept as aliases.
// Usage: App.Data.getAusgaben(von, bis) or getAusgaben(von, bis)
// ═══════════════════════════════════════════════════════════════
const App = { Data: {}, IO: {}, UI: {}, Design: {} };

// ═══════════════════════════════════════════════════════════════
// MODULE: EVENT BUS + RENDER SCHEDULER (Step 8)
// Decouples data mutations from UI updates.
// ═══════════════════════════════════════════════════════════════

/**
 * Lightweight event bus for decoupled communication.
 * Usage:
 *   AppBus.on('expenses:changed', () => { ... });
 *   AppBus.emit('expenses:changed', { id: '...' });
 */
const AppBus = {
  _subs: {},
  on(evt, fn){
    (this._subs[evt] ??= []).push(fn);
    return () => this.off(evt, fn); // return unsubscribe function
  },
  off(evt, fn){ this._subs[evt] = (this._subs[evt]||[]).filter(f=>f!==fn); },
  emit(evt, data){ (this._subs[evt]||[]).forEach(fn => { try{ fn(data); }catch(e){ console.error('AppBus error:',evt,e); } }); }
};

/**
 * Render scheduler — batches multiple markDirty() calls into one
 * requestAnimationFrame, then renders only the affected tabs.
 *
 * Tab → render function mapping (set up after functions are defined):
 *   RENDER_FN_MAP = { home: renderHome, verlauf: renderVerlauf, ... }
 *
 * Usage:
 *   markDirty('verlauf', 'dashboard');   // schedule these tabs for re-render
 *   markDirty('all');                    // schedule full re-render
 */
const _dirtyTabs = new Set();
let _renderRAF = null;

function markDirty(...tabs){
  tabs.forEach(t => _dirtyTabs.add(t));
  if(!_renderRAF){
    _renderRAF = requestAnimationFrame(flushRender);
  }
}

function flushRender(){
  _renderRAF = null;
  if(!_dirtyTabs.size) return;

  if(_dirtyTabs.has('all')){
    // Full render (backward-compatible with renderAll)
    _dirtyTabs.clear();
    renderAll();
    return;
  }

  // Smart render: only render dirty tabs that have render functions
  const tabs = [..._dirtyTabs];
  _dirtyTabs.clear();
  for(const tab of tabs){
    if(RENDER_FN_MAP[tab]){
      // Only render if tab is currently visible OR it's a global element
      if(tab === currentTab || tab === 'nav' || tab === 'dropdowns'){
        RENDER_FN_MAP[tab]();
      }
    }
  }
}

// Populated after render functions are defined (see bottom of this file)
let RENDER_FN_MAP = {};

// ═══════════════════════════════════════════════════════════════
// RENDERING HELPERS — h() & fromTemplate()
// Use for NEW components only. Existing innerHTML stays untouched.
// ═══════════════════════════════════════════════════════════════

/**
 * Minimal hyperscript helper for building DOM without innerHTML.
 *
 * Usage:
 *   h('div', {className:'card', onclick:fn},
 *     h('span', {style:{color:'var(--red)'}}, 'Hello'),
 *     h('button', null, 'Click me')
 *   )
 *
 * @param {string} tag - HTML tag name
 * @param {Object|null} attrs - Attributes, event handlers (onX), className, style (object), dataset
 * @param {...(string|number|Node|Array|null)} children
 * @returns {HTMLElement}
 */
function h(tag, attrs, ...children){
  const el = document.createElement(tag);
  if(attrs){
    for(const [k,v] of Object.entries(attrs)){
      if(v == null || v === false) continue;
      if(k.startsWith('on') && typeof v === 'function'){
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if(k === 'className'){
        el.className = v;
      } else if(k === 'style' && typeof v === 'object'){
        Object.assign(el.style, v);
      } else if(k === 'dataset' && typeof v === 'object'){
        Object.assign(el.dataset, v);
      } else if(k === 'htmlFor'){
        el.htmlFor = v;
      } else {
        el.setAttribute(k, v);
      }
    }
  }
  for(const child of children){
    if(child == null || child === false) continue;
    if(typeof child === 'string' || typeof child === 'number'){
      el.appendChild(document.createTextNode(child));
    } else if(child instanceof Node){
      el.appendChild(child);
    } else if(Array.isArray(child)){
      child.forEach(c => { if(c instanceof Node) el.appendChild(c); });
    }
  }
  return el;
}

/**
 * Clone a <template> element's content by ID.
 * Returns the first element child (the root node of the template).
 *
 * Usage:
 *   <template id="tpl-stat-card">
 *     <div class="stat-card"><span class="stat-label"></span></div>
 *   </template>
 *
 *   const card = fromTemplate('tpl-stat-card');
 *   card.querySelector('.stat-label').textContent = 'Budget';
 *
 * @param {string} id - Template element ID
 * @returns {HTMLElement|null}
 */
function fromTemplate(id){
  const tpl = document.getElementById(id);
  if(!tpl) return null;
  return tpl.content.cloneNode(true).firstElementChild;
}

// ═══════════════════════════════════════════════════════════════
// MODULE: INDEXED-DB STORAGE (Step 3)
// Primary store for CFG + data cache. localStorage kept as
// synchronous read-fallback and migration source.
// ═══════════════════════════════════════════════════════════════
const IDB = {
  _db: null,
  _DB_NAME: 'FinanzTracker',
  _DB_VERSION: 1,
  _STORE: 'kv',

  /** Open (or reuse) the database. Returns a Promise<IDBDatabase>. */
  open(){
    if(this._db) return Promise.resolve(this._db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this._DB_NAME, this._DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if(!db.objectStoreNames.contains(this._STORE)){
          db.createObjectStore(this._STORE);
        }
      };
      req.onsuccess = () => { this._db = req.result; resolve(this._db); };
      req.onerror = () => reject(req.error);
    });
  },

  /** Get a value by key. Returns Promise<any|undefined>. */
  async get(key){
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this._STORE, 'readonly');
      const req = tx.objectStore(this._STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  /** Set a value by key. Returns Promise<void>. */
  async set(key, value){
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this._STORE, 'readwrite');
      tx.objectStore(this._STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  /** Delete a key. Returns Promise<void>. */
  async del(key){
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this._STORE, 'readwrite');
      tx.objectStore(this._STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
};

// ═══════════════════════════════════════════════════════════════
// MODULE: SYNC QUEUE (Step 3)
// Queues API write operations for resilient offline-first sync.
// Failed operations are retried on next processQueue tick.
// ═══════════════════════════════════════════════════════════════
const syncQueue = [];
let _syncQueueRunning = false;

/**
 * Enqueue an API write operation.
 * @param {string} label - Human-readable label (for debugging)
 * @param {Function} fn  - Async function that performs the API call
 */
function queueSync(label, fn){
  syncQueue.push({ label, fn, retries: 0, maxRetries: 3 });
  // Persist queue length to IDB for crash recovery (fire-and-forget)
  IDB.set('ft_syncqueue_len', syncQueue.length).catch(()=>{});
}

/** Process pending sync queue items. Called by setInterval. */
async function processQueue(){
  if(_syncQueueRunning || !syncQueue.length) return;
  if(CFG.demo || (!CFG.scriptUrl && !CFG.sessionToken)) return;
  _syncQueueRunning = true;
  while(syncQueue.length > 0){
    const item = syncQueue[0];
    try{
      await item.fn();
      syncQueue.shift(); // success → remove
    } catch(e){
      item.retries++;
      if(item.retries >= item.maxRetries){
        console.warn(`syncQueue: dropping "${item.label}" after ${item.maxRetries} retries`, e);
        syncQueue.shift();
      } else {
        console.warn(`syncQueue: "${item.label}" failed (attempt ${item.retries}), will retry`, e);
        break; // stop processing, retry on next tick
      }
    }
  }
  _syncQueueRunning = false;
  IDB.set('ft_syncqueue_len', syncQueue.length).catch(()=>{});
}

// Process queue every 5 seconds
setInterval(processQueue, 5000);

// ═══════════════════════════════════════════════════════════════
// MODULE: CONFIG
// ═══════════════════════════════════════════════════════════════
// ── Admin URL ────────────────────────────────────────────────
// Set this once. All users pick it up automatically — no manual URL entry needed.
// When the Google Apps Script URL changes, update only this constant.
const ADMIN_URL = '';

const CFG_KEY = 'ft_v4';
let CFG = { scriptUrl:'', adminUrl:'', sessionToken:'', authUser:'', authRole:'', demo:false, lohnTag:25, sparziel:0, mSparziel:0, pinnedTabs:[], notifSettings:{}, homeWidgets:null, userName:'', fixkostenKats:[], aktienEnabled:false, aktienInBilanz:false, widgetAktienPosId:'', currency:'CHF', bgPreset:'', glassEnabled:false, glassBlur:12, glassAlpha:12, glassClean:false, bgImgBlur:0, themeMode:'', fontColor:'', fontColors:{}, adminDefaultDesign:null, designPackageId:null, designPackage:null };

function cfgSave(){
  // Synchronous write to localStorage (immediate, blocking)
  localStorage.setItem(CFG_KEY, JSON.stringify(CFG));
  // Async write to IndexedDB (fire-and-forget, non-blocking)
  IDB.set(CFG_KEY, JSON.parse(JSON.stringify(CFG))).catch(()=>{});
}
// Default design preset — applied to new users (no prior config)
const DEFAULT_DESIGN = {
  bgPreset:'aurora', glassEnabled:true, glassBlur:14, glassAlpha:45,
  glassClean:false, fontColor:'cool',
  fontColors:{primary:'#E8F0FF',secondary:'#8AA0C0',tertiary:'#5A6A88'}
};
// Default design package ID for brand-new installs
const DEFAULT_DESIGN_PKG_ID = 'aurora';

function cfgLoad(){
  // 1. Synchronous: read from localStorage (fast, blocking)
  const s = localStorage.getItem(CFG_KEY);
  const isNew = !s;
  if(s) CFG = JSON.parse(s);
  // If a central admin URL is hardcoded, always apply it (overrides stale stored URL)
  if(ADMIN_URL) CFG.adminUrl = ADMIN_URL;
  // Apply default design for brand-new installs
  if(isNew){
    Object.assign(CFG, DEFAULT_DESIGN);
    CFG.designPackageId = DEFAULT_DESIGN_PKG_ID;
    cfgSave();
  }
  // Migrate from old navSlots to pinnedTabs
  if(!CFG.pinnedTabs){
    CFG.pinnedTabs = Array.isArray(CFG.navSlots) ? CFG.navSlots.filter(k=>!!k) : [];
  }
  // Migrate old theme toggle to themeMode
  if(!CFG.themeMode && CFG.theme==='light') CFG.themeMode = 'light';
  // Migrate old flat design fields to design package (deferred — design.js defines migrateOldDesignToPkg)
  if(!CFG.designPackageId && !CFG.designPackage && typeof migrateOldDesignToPkg === 'function'){
    const migrated = migrateOldDesignToPkg();
    if(migrated){ CFG.designPackage = migrated; CFG.designPackageId = '_custom'; cfgSave(); }
  }
  applyThemeMode();

  // 2. Async: check IndexedDB for newer data (migration / fallback)
  IDB.get(CFG_KEY).then(idbCfg => {
    if(!idbCfg) return; // nothing in IDB yet
    if(!s){
      // localStorage was empty but IDB has data → restore from IDB
      Object.assign(CFG, idbCfg);
      localStorage.setItem(CFG_KEY, JSON.stringify(CFG));
      applyThemeMode();
    }
  }).catch(()=>{});
}

// Returns user's configured display currency (default CHF)
function curr(){ return CFG.currency||'CHF'; }

// ═══════════════════════════════════════════════════════════════
// MODULE: FORM HELPERS (Step 5)
// Eliminate repeated getElementById().value chains in modal code.
// ═══════════════════════════════════════════════════════════════

/**
 * Fill form fields from an object.  Keys map to element IDs via prefix.
 * @param {string} prefix  - e.g. 'edit'  → targets #edit-amt, #edit-date, …
 * @param {Object} fields  - { amt: 42, date: '2025-01-01', … }
 *
 * Special handling:
 *  - If the target element has .textContent property and key starts with '$',
 *    sets textContent instead of value  (e.g. { $title: 'Foo' })
 *  - dataset entries use '@' prefix (e.g. { '@recurringId': 'R1' })
 */
function fillForm(prefix, fields){
  for(const [key, val] of Object.entries(fields)){
    if(key.startsWith('@')){
      // dataset attribute
      const el = document.getElementById(prefix);
      if(el) el.dataset[key.slice(1)] = val ?? '';
    } else if(key.startsWith('$')){
      // textContent
      const el = document.getElementById(prefix + '-' + key.slice(1));
      if(el) el.textContent = val ?? '';
    } else {
      const el = document.getElementById(prefix + '-' + key);
      if(el) el.value = val ?? '';
    }
  }
}

/**
 * Read form field values into an object.
 * @param {string} prefix   - e.g. 'edit'
 * @param {string[]} keys   - field names: ['id','type','amt','date','what','cat','note']
 * @returns {Object}        - { id: '…', type: '…', amt: '…', … }
 */
function readForm(prefix, keys){
  const out = {};
  for(const key of keys){
    const el = document.getElementById(prefix + '-' + key);
    out[key] = el ? el.value : '';
  }
  return out;
}

/**
 * Clear form fields (set value to '').
 * @param {string} prefix - e.g. 'tm'
 * @param {string[]} keys - field names to clear
 */
function clearForm(prefix, keys){
  for(const key of keys){
    const el = document.getElementById(prefix + '-' + key);
    if(el) el.value = '';
  }
}

