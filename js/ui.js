// ═══════════════════════════════════════════════════════════════
// MODULE: UI HELPERS
// ═══════════════════════════════════════════════════════════════
let currentTab = 'home';

function haptic(pattern){
  if(CFG.hapticsEnabled === false) return;
  try{
    if(navigator.vibrate){
      navigator.vibrate(pattern);
    } else {
      _hapticIOS();
    }
  } catch(_){}
}

function _hapticIOS(){
  try{
    const el = document.createElement('input');
    el.type = 'checkbox';
    el.setAttribute('switch', '');
    el.style.cssText = 'position:fixed;width:1px;height:1px;top:0;left:0;border:0;padding:0;margin:0;overflow:hidden;-webkit-clip-path:inset(50%);clip-path:inset(50%)';
    document.body.appendChild(el);
    el.click();
    requestAnimationFrame(() => el.remove());
  } catch(_){}
}

function _detectIOSSwitchSupport(){
  const m = /iP(?:hone|od|ad).+OS (\d+)_/.exec(navigator.userAgent);
  return m ? parseInt(m[1]) >= 17 : false;
}

function goTab(tab){
  // Daueraufträge merged into Lohn → redirect + open Abos subtab
  if(tab==='dauerauftraege'){ goTab('lohn'); setTimeout(()=>setLohnSubtab('abos'), 80); return; }
  if(tab==='admin' && CFG.authRole!=='admin') return;
  // Home button while in edit mode → exit edit mode instead of re-navigating
  if(tab === 'home' && currentTab === 'home' && homeEditMode){
    homeEditMode = false;
    renderHome();
    return;
  }
  if(homeEditMode) homeEditMode = false;
  // Push history state for Android back-gesture navigation
  if(tab !== 'home') Device.pushNav('tab', tab);
  currentTab = tab;
  haptic(4);
  document.querySelectorAll('.tab-page').forEach(p=>{ p.style.display='none'; p.classList.remove('tab-entering'); });
  const tabEl = document.getElementById('tab-'+tab);
  if(tabEl){
    tabEl.style.display='block';
    void tabEl.offsetWidth; // force reflow for animation restart
    tabEl.classList.add('tab-entering');
    tabEl.classList.remove('animating');
    void tabEl.offsetWidth; // force reflow
    tabEl.classList.add('animating');
  }
  // Nav active state: home (fixed) + pinned slots + mehr
  document.querySelectorAll('.nav-btn').forEach(b=>{ b.classList.remove('active'); b.removeAttribute('aria-current'); });
  let activeNavBtn = null;
  if(tab==='home'){ activeNavBtn = document.getElementById('nav-dashboard'); }
  else {
    const pinned = CFG.pinnedTabs||[];
    if(pinned[0]===tab) activeNavBtn = document.getElementById('nav-slot1-btn');
    else if(pinned[1]===tab) activeNavBtn = document.getElementById('nav-slot2-btn');
    else if(pinned[2]===tab) activeNavBtn = document.getElementById('nav-slot3-btn');
  }
  if(activeNavBtn){ activeNavBtn.classList.add('active'); activeNavBtn.setAttribute('aria-current','page'); }
  // FAB: active (X) state when on eingabe
  const fab = document.getElementById('fab-add');
  if(fab){
    fab.classList.toggle('fab-active', tab==='eingabe');
    fab.innerHTML = tab==='eingabe'
      ? '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
      : '<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
    fab.onclick = tab==='eingabe' ? ()=>goTab('home') : ()=>goTab('eingabe');
  }
  document.getElementById('page-title').textContent = {
    home:'Home', eingabe:'Eingabe', verlauf:'Verlauf', kategorien:'Kategorien',
    dashboard:'Jahresübersicht', lohn:'Lohn & Einnahmen',
    aktien:'Aktien', monat:'Monatsübersicht', sparen:'Sparen & Planen',
    groups:'Gruppen & Events', einstellungen:'Einstellungen', admin:'Admin'
  }[tab]||tab;
  updatePageSub();
  // Special pre-render setup (state that must be set before first render)
  if(tab==='monat'){ mvYear=new Date().getFullYear(); mvMonth=new Date().getMonth(); }
  if(tab==='groups') fillGroupDropdown();
  if(tab==='verlauf' && typeof verlaufL1Page !== 'undefined') verlaufL1Page = 1;
  // Delegate to render scheduler — avoids double-rendering when markDirty is also called
  markDirty(tab);
}

let menuEditMode = false;
function openMenuOverlay(){ menuEditMode=false; renderMenuOverlay(); document.getElementById('menu-overlay').classList.add('open'); Device.pushNav('menu','menu-overlay'); }
function closeMenuOverlay(){ document.getElementById('menu-overlay').classList.remove('open'); }
function toggleMenuEditMode(){ menuEditMode=!menuEditMode; renderMenuOverlay(); }

// ── FAB Speed-Dial stubs (kept for backward-compat) ──────────────────────────

// Aktie / Trade erfassen Flow
function openAddAktieFlow(){
  const activeStocks = SDATA.stocks.filter(s => calcPosition(s.id).qty > 0.0001 || SDATA.trades.some(t=>t.stockId===s.id));
  const body = document.getElementById('aktie-flow-body');
  const title = document.getElementById('aktie-flow-title');
  const actionsEl = document.getElementById('aktie-flow-actions');
  if(!body) return;
  title.textContent = 'Aktie / Trade erfassen';
  actionsEl.style.display = 'none';
  let html = '';
  if(activeStocks.length > 0){
    html += `<div style="margin-bottom:12px">
      <div style="font-size:12px;font-weight:700;color:var(--text3);letter-spacing:.05em;text-transform:uppercase;margin-bottom:8px">Bestehende Aktie</div>`;
    activeStocks.forEach(s=>{
      const pos = calcPosition(s.id);
      html += `<button onclick="closeModal('aktie-flow-modal');openAktieDetailFromFlow('${s.id}')" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r2);margin-bottom:6px;color:var(--text);font-size:14px;cursor:pointer;text-align:left">
        <div>
          <div class="t-bold">${esc(s.title)}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">${s.ticker?esc(s.ticker)+' · ':''} ${fmtQty(pos.qty)} Stk.</div>
        </div>
        <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:var(--text3);fill:none;stroke-width:2;flex-shrink:0"><polyline points="9 18 15 12 9 6"/></svg>
      </button>`;
    });
    html += `</div>`;
  }
  html += `<button onclick="closeModal('aktie-flow-modal');openNewAktieModal()" style="width:100%;display:flex;align-items:center;gap:10px;padding:12px 14px;background:rgba(200,245,60,.08);border:1px solid rgba(200,245,60,.2);border-radius:var(--r2);color:var(--accent);font-size:14px;font-weight:600;cursor:pointer">
    <svg viewBox="0 0 24 24" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    Neue Aktie hinzufügen
  </button>`;
  body.innerHTML = html;
  openModal('aktie-flow-modal');
}

function openAktieDetailFromFlow(stockId){
  // Navigate to aktien tab, then open detail
  if(currentTab !== 'aktien') goTab('aktien');
  setTimeout(()=>openAktieDetail(stockId), 100);
}

// All tabs available for pinning / showing in Mehr
const PINNABLE_TABS = [
  { key:'dashboard',      label:'Jahresübersicht',      icon:'<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>' },
  { key:'verlauf',        label:'Verlauf',              icon:'<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>' },
  { key:'monat',          label:'Monatsübersicht',       icon:'<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>' },
  { key:'aktien',         label:'Aktien',               icon:'<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>' },
  { key:'lohn',           label:'Lohn &amp; Einnahmen', icon:'<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>' },
  { key:'kategorien',     label:'Kategorien',            icon:'<circle cx="9" cy="9" r="4"/><circle cx="15" cy="15" r="4"/>' },
  { key:'sparen',         label:'Sparen &amp; Planen',   icon:'<path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.4-11.3-1.5-11.3 5.2 0 4 3 6.8 7.3 10.8l1 1 1-1C18 19 21 16.2 21 12.2c0-2-1-3.2-2-3.2z"/>' },
  { key:'groups',         label:'Gruppen &amp; Events',  icon:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' },
];
const SETTINGS_ICON = '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>';

// Pin icon SVG path
const PIN_ICON = '<line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"/>';
const UNPIN_ICON = '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>';

function renderMenuOverlay(){
  const pinned = CFG.pinnedTabs || [];
  const container = document.getElementById('menu-overlay-items');
  const footer = document.getElementById('menu-overlay-footer');
  if(!container) return;
  let html = '';
  // Filter aktien tab when feature is disabled
  const visibleTabs = PINNABLE_TABS.filter(t => t.key !== 'aktien' || CFG.aktienEnabled);

  if(menuEditMode){
    // Edit mode: show pinned with unpin + unpinned with pin icon
    if(pinned.length > 0){
      html += '<span class="menu-section-label">In Taskleiste</span>';
      pinned.forEach(key=>{
        const tab = visibleTabs.find(t=>t.key===key);
        if(!tab) return;
        html += `<div class="menu-item-row">
          <button class="menu-item-nav" onclick="goTab('${tab.key}');closeMenuOverlay()">
            <svg viewBox="0 0 24 24">${tab.icon}</svg>${tab.label}
          </button>
          <button class="menu-item-action unpin" onclick="unpinTab('${tab.key}')" aria-label="Aus Taskleiste entfernen">
            <svg viewBox="0 0 24 24">${UNPIN_ICON}</svg>
          </button>
        </div>`;
      });
    }
    const unpinnedTabs = visibleTabs.filter(t=>!pinned.includes(t.key));
    if(unpinnedTabs.length > 0){
      html += '<span class="menu-section-label">Weitere Ansichten</span>';
      const canPin = pinned.length < 3;
      unpinnedTabs.forEach(tab=>{
        html += `<div class="menu-item-row">
          <button class="menu-item-nav" onclick="goTab('${tab.key}');closeMenuOverlay()">
            <svg viewBox="0 0 24 24">${tab.icon}</svg>${tab.label}
          </button>
          ${canPin
            ? `<button class="menu-item-action pin" onclick="pinTab('${tab.key}')" aria-label="An Taskleiste anheften"><svg viewBox="0 0 24 24">${PIN_ICON}</svg></button>`
            : `<div style="width:50px"></div>`}
        </div>`;
      });
    }
  } else {
    // Normal mode: all tabs without pin icons, pinned ones get accent dot
    html += '<span class="menu-section-label">Ansichten</span>';
    visibleTabs.forEach(tab=>{
      const isPinned = pinned.includes(tab.key);
      html += `<div class="menu-item-row">
        <button class="menu-item-nav" onclick="goTab('${tab.key}');closeMenuOverlay()">
          <svg viewBox="0 0 24 24">${tab.icon}</svg>${tab.label}
          ${isPinned?'<span style="margin-left:auto;width:6px;height:6px;border-radius:50%;background:var(--accent);flex-shrink:0;margin-right:2px"></span>':''}
        </button>
      </div>`;
    });
  }

  container.innerHTML = html;

  // Fixed footer: "Taskleiste bearbeiten" + "Einstellungen" (not pinable)
  if(footer){
    footer.innerHTML = `
      <div class="menu-item-row" style="border-top:none">
        <button class="menu-item-nav t-accent" onclick="toggleMenuEditMode()">
          <svg viewBox="0 0 24 24" style="stroke:var(--accent)">${menuEditMode?'<polyline points="20 6 9 17 4 12"/>':PIN_ICON}</svg>
          ${menuEditMode?'Fertig':'Taskleiste bearbeiten'}
        </button>
      </div>
      <div class="menu-item-row">
        <button class="menu-item-nav" onclick="goTab('einstellungen');closeMenuOverlay()">
          <svg viewBox="0 0 24 24">${SETTINGS_ICON}</svg>Einstellungen
        </button>
      </div>
      <div class="menu-item-row" style="border-top:1px solid var(--border)">
        <button class="menu-item-nav t-red" onclick="doLogout();closeMenuOverlay()">
          <svg viewBox="0 0 24 24" style="stroke:var(--red)"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Logout
        </button>
      </div>
      <div style="padding:8px 20px 4px;text-align:center;font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;letter-spacing:.04em">F-TRACKER · SESI FINANCE</div>`;
  }
}

function pinTab(key){
  if(!CFG.pinnedTabs) CFG.pinnedTabs = [];
  if(CFG.pinnedTabs.includes(key)) return;
  if(CFG.pinnedTabs.length >= 3){ toast('Maximal 3 Tabs anheftbar',''); return; }
  CFG.pinnedTabs.push(key);
  cfgSave(); autoSyncProfile();
  renderNav();
  renderMenuOverlay();
  toast('Tab angeheftet','ok');
}

function unpinTab(key){
  if(!CFG.pinnedTabs) return;
  CFG.pinnedTabs = CFG.pinnedTabs.filter(k=>k!==key);
  cfgSave(); autoSyncProfile();
  renderNav();
  renderMenuOverlay();
  toast('Tab entfernt','ok');
}

// ═══════════════════════════════════════════════════════════════
// MODULE: NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════

// Run at most once per calendar day per session
let _dueRecurringsCheckedDate = null;
function checkDueRecurrings(){
  const todayStr = today();
  if(_dueRecurringsCheckedDate === todayStr) return;
  _dueRecurringsCheckedDate = todayStr;
  if(!CFG.notifications) CFG.notifications = [];
  const now = new Date();
  const todayDay = now.getDate();
  const todayMo  = now.getMonth();   // 0-based
  const todayWd  = now.getDay();     // 0=Sun … 6=Sat

  DATA.recurring.filter(r=>r.active && (!r.endDate || r.endDate >= todayStr)).forEach(r=>{
    const interval = r.interval || 'monatlich';
    let isDue = false;

    if(interval === 'monatlich'){
      // r.day is the day-of-month
      const lastDay = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
      isDue = r.day === Math.min(todayDay, lastDay);
    } else if(interval === 'wöchentlich'){
      // Check if today matches the weekday of r.start
      if(r.start){
        const startWd = new Date(r.start+'T12:00:00').getDay();
        isDue = todayWd === startWd;
      }
    } else if(interval === 'jährlich'){
      // Check month and day of r.start
      if(r.start){
        const s = new Date(r.start+'T12:00:00');
        isDue = s.getMonth()===todayMo && s.getDate()===todayDay;
      }
    } else if(interval === 'halbjährlich'){
      if(r.start){
        const s = new Date(r.start+'T12:00:00');
        const moOffset = (now.getMonth()-s.getMonth()+12)%12;
        isDue = s.getDate()===todayDay && (moOffset===0 || moOffset===6);
      }
    } else if(interval === 'quartalsweise'){
      if(r.start){
        const s = new Date(r.start+'T12:00:00');
        const moOffset = (now.getMonth()-s.getMonth()+12)%12;
        isDue = s.getDate()===todayDay && (moOffset===0||moOffset===3||moOffset===6||moOffset===9);
      }
    }

    if(isDue){
      const notifId = `rec-${r.id}-${todayStr}`;
      if(!CFG.notifications.find(n=>n.id===notifId)){
        CFG.notifications.push({
          id: notifId,
          type: 'dauerauftrag_info',
          recurId: r.id,
          date: todayStr,
          title: `${r.what} gebucht`,
          body: `${curr()} ${fmtAmt(r.amt)} · ${r.interval} — automatisch verbucht`,
          dismissed: false,
          confirmed: true
        });
      }
    }
  });
  cfgSave();
  updateNotifBadge();
}

// ─── Dauerauftrag renewal notifications ──────────────────────────────────────
// One confirmation notification per active Dauerauftrag per cycle.
// Created at cycle start; "Bestätigen" = keep in Fixkosten, "Ausschliessen" = skip.

let _renewalCheckedCycle = null;

function checkCycleRenewals(){
  if(!notifOn('recurringRenewal')) return;
  const z = getZyklusInfo();
  const cycleStart = z.startStr;
  // Only run once per cycle (resets when cycleStart changes)
  if(_renewalCheckedCycle === cycleStart) return;
  _renewalCheckedCycle = cycleStart;

  if(!CFG.notifications) CFG.notifications = [];
  if(!DATA.recurring.length) return;

  // Get all unique Ausgaben-Daueraufträge that have an occurrence in this cycle
  const occs = getRecurringOccurrences(z.startStr, z.endStr, false, false);
  const seen = new Set();
  occs.forEach(o => {
    if(seen.has(o._recurId)) return;
    seen.add(o._recurId);
    const r = DATA.recurring.find(r => r.id === o._recurId);
    if(!r || !r.active || r.type === 'einnahme') return;
    const notifId = `renewal-${r.id}-${cycleStart}`;
    if(CFG.notifications.find(n => n.id === notifId)) return;
    CFG.notifications.push({
      id: notifId,
      type: 'dauerauftrag_renewal',
      recurId: r.id,
      cycleStart,
      date: cycleStart,
      title: r.what,
      body: `${curr()} ${fmtAmt(r.amt)} · ${r.interval||'monatlich'} · ${r.cat}`,
      dismissed: false,
      confirmed: false,
    });
  });
  cfgSave();
  updateNotifBadge();
}

function confirmRecurringRenewal(notifId){
  const n = (CFG.notifications||[]).find(n => n.id === notifId);
  if(!n) return;
  n.dismissed = true;
  n.confirmed = true;
  cfgSave();
  renderNotifications();
  updateNotifBadge();
  toast(`✓ ${esc(n.title)} — im Budget einbezogen`, 'ok');
}

function skipRecurringRenewal(notifId){
  const n = (CFG.notifications||[]).find(n => n.id === notifId);
  if(!n) return;
  n.dismissed = true;
  // Record the skip so _calcFixKosten excludes this recurring for this cycle
  if(!CFG.recurringSkips) CFG.recurringSkips = {};
  const arr = CFG.recurringSkips[n.recurId] || [];
  if(!arr.includes(n.cycleStart)) arr.push(n.cycleStart);
  CFG.recurringSkips[n.recurId] = arr;
  cfgSave();
  invalidateZyklusCache();
  renderHome();
  renderLohn();
  renderNotifications();
  updateNotifBadge();
  toast(`${esc(n.title)} für diesen Zyklus ausgeschlossen`, '');
}

const NOTIF_TYPES = [
  { key:'dailyReport',       label:'Tagesreport',                sub:'Ausgaben-Zusammenfassung des heutigen Tages', def:true },
  { key:'overspend',         label:'Überbudget-Warnung',         sub:'Wenn Lohnzyklus-Budget überschritten wird', def:true },
  { key:'monthEnd',          label:'Monatsabschluss',            sub:'Rapport am ersten des Monats', def:true },
  { key:'cycleStart',        label:'Lohnzyklus gestartet',       sub:'Bei erkanntem Lohneingang im Zyklus', def:true },
  { key:'budgetWarning',     label:'Budget 80% erreicht',        sub:'Frühwarnung im laufenden Lohnzyklus', def:true },
  { key:'bigExpense',        label:'Grosse Ausgabe',             sub:'Bei Einzelbuchung über CHF 200', def:false },
  { key:'weeklyReport',      label:'Wochenrückblick',            sub:'Zusammenfassung jeden Sonntag', def:false },
  { key:'recurringRenewal',  label:'Dauerauftrag-Erneuerung',    sub:'Bestätigung aktiver Daueraufträge bei jedem neuen Lohnzyklus', def:true },
];

function notifOn(key){ const ns=CFG.notifSettings||{}; const t=NOTIF_TYPES.find(x=>x.key===key); return ns[key]===undefined ? (t?t.def:true) : ns[key]; }

// Skip re-check if called again with the same data snapshot (e.g. multiple renderAll calls)
let _notifsCheckedKey = null;
function checkAllNotifications(){
  const checkKey = today()+'|'+DATA.expenses.length+'|'+DATA.incomes.length;
  if(_notifsCheckedKey === checkKey) return;
  _notifsCheckedKey = checkKey;
  if(!CFG.notifications) CFG.notifications = [];
  const ns = CFG.notifSettings||{};
  const todayStr = today();
  const now = new Date();
  const mN = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

  // 1. Daily report
  if(notifOn('dailyReport')){
    const todayExp = DATA.expenses.filter(e=>e.date===todayStr);
    const t = todayExp.reduce((s,e)=>s+e.amt,0);
    if(t>0){ const nid=`daily-${todayStr}`; if(!CFG.notifications.find(n=>n.id===nid)) CFG.notifications.push({id:nid,type:'dailyReport',date:todayStr,title:`Tagesreport: ${curr()} ${fmtAmt(t)}`,body:`${todayExp.length} Buchung${todayExp.length!==1?'en':''} heute erfasst`,dismissed:false,confirmed:false}); }
  }
  // 2. Overspend
  if(notifOn('overspend')){
    const z=getZyklusInfo();
    if(z.hasSalary&&z.varRemaining<0){ const nid=`overspend-${todayStr}`; if(!CFG.notifications.find(n=>n.id===nid)) CFG.notifications.push({id:nid,type:'overspend',date:todayStr,title:'⚠ Überbudget!',body:`${curr()} ${fmtAmt(Math.abs(z.varRemaining))} über dem verfügbaren Budget`,dismissed:false,confirmed:false}); }
  }
  // 3. Month-end report (on 1st)
  if(notifOn('monthEnd')&&now.getDate()===1){
    const pM=new Date(now.getFullYear(),now.getMonth()-1,1);
    const pmKey=`${pM.getFullYear()}-${String(pM.getMonth()+1).padStart(2,'0')}`;
    const nid=`monthend-${pmKey}`;
    if(!CFG.notifications.find(n=>n.id===nid)){
      const pmOut=DATA.expenses.filter(e=>e.date.startsWith(pmKey)).reduce((s,e)=>s+e.amt,0);
      const pmInc=DATA.incomes.filter(e=>e.date.startsWith(pmKey)).reduce((s,e)=>s+e.amt,0);
      CFG.notifications.push({id:nid,type:'monthEnd',date:todayStr,title:`Monatsabschluss ${mN[pM.getMonth()]} ${pM.getFullYear()}`,body:`Ausgaben ${curr()} ${fmtAmt(pmOut)} · Einnahmen ${curr()} ${fmtAmt(pmInc)} · Saldo ${curr()} ${fmtAmt(pmInc-pmOut)}`,dismissed:false,confirmed:false});
    }
  }
  // 4. Cycle start
  if(notifOn('cycleStart')){
    const z=getZyklusInfo();
    if(z.hasSalary){ const nid=`cycle-${z.startStr}`; if(!CFG.notifications.find(n=>n.id===nid)) CFG.notifications.push({id:nid,type:'cycleStart',date:z.startStr,title:'Lohnzyklus gestartet',body:`${curr()} ${fmtAmt(z.lohn)} Lohn · Periode bis ${z.endStr}`,dismissed:false,confirmed:false}); }
  }
  // 5. Budget 80%
  if(notifOn('budgetWarning')){
    const z=getZyklusInfo();
    if(z.hasSalary&&z.varBudget>0&&z.varSpent/z.varBudget>=0.8){ const nid=`budget80-${z.startStr}`; if(!CFG.notifications.find(n=>n.id===nid)) CFG.notifications.push({id:nid,type:'budgetWarning',date:todayStr,title:`${Math.round(z.varSpent/z.varBudget*100)}% des Budgets verbraucht`,body:`${curr()} ${fmtAmt(z.varRemaining)} verbleibend · ${z.daysLeft} Tage`,dismissed:false,confirmed:false}); }
  }
  // 6. Big expense
  if(notifOn('bigExpense')){
    const thr=(CFG.notifSettings?.bigExpenseAmt)||200;
    DATA.expenses.filter(e=>e.amt>=thr).forEach(e=>{ const nid=`bigexp-${e.id}`; if(!CFG.notifications.find(n=>n.id===nid)) CFG.notifications.push({id:nid,type:'bigExpense',date:e.date,title:`Grosse Ausgabe: ${curr()} ${fmtAmt(e.amt)}`,body:`${e.what} · ${e.cat}`,dismissed:false,confirmed:false}); });
  }
  // 7. Weekly report (Sunday)
  if(notifOn('weeklyReport')&&now.getDay()===0){
    const mon=new Date(now); mon.setDate(now.getDate()-6); const monStr=dateStr(mon);
    const nid=`weekly-${monStr}`; if(!CFG.notifications.find(n=>n.id===nid)){ const wOut=DATA.expenses.filter(e=>e.date>=monStr&&e.date<=todayStr).reduce((s,e)=>s+e.amt,0); CFG.notifications.push({id:nid,type:'weeklyReport',date:todayStr,title:'Wochenrückblick',body:`${curr()} ${fmtAmt(wOut)} ausgegeben diese Woche`,dismissed:false,confirmed:false}); }
  }
  cfgSave(); updateNotifBadge();
}

function renderNotifSettings(){
  const list = document.getElementById('notif-settings-list');
  if(!list) return;
  list.innerHTML = NOTIF_TYPES.map(t=>`
    <div class="settings-row" style="padding:12px 0;border-bottom:1px solid var(--border)">
      <div><div class="settings-row-label">${t.label}</div><div class="settings-row-sub">${t.sub}</div></div>
      <div class="toggle-switch${notifOn(t.key)?' on':''}" onclick="toggleNotifSetting('${t.key}')"></div>
    </div>`).join('');
  const hapticEl = document.getElementById('haptic-toggle');
  if(hapticEl) hapticEl.classList.toggle('on', CFG.hapticsEnabled !== false);
  const hapticHint = document.getElementById('haptic-hint');
  if(hapticHint){
    const noSupport = !navigator.vibrate && !_detectIOSSwitchSupport();
    hapticHint.style.display = noSupport ? '' : 'none';
  }
}

function toggleHapticSetting(){
  CFG.hapticsEnabled = CFG.hapticsEnabled === false;
  cfgSave();
  const el = document.getElementById('haptic-toggle');
  if(el) el.classList.toggle('on', CFG.hapticsEnabled !== false);
}

function toggleNotifSetting(key){
  if(!CFG.notifSettings) CFG.notifSettings={};
  CFG.notifSettings[key] = !notifOn(key);
  cfgSave(); renderNotifSettings();
}

function updateNotifBadge(){
  const badge = document.getElementById('notif-badge');
  if(!badge) return;
  const pending = (CFG.notifications||[]).filter(n=>!n.dismissed&&(!n.confirmed||n.type==='dauerauftrag_info'||n.type==='dauerauftrag_renewal')).length;
  if(pending > 0){
    badge.textContent = pending > 9 ? '9+' : pending;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function toggleNotifOverlay(){
  const overlay = document.getElementById('notif-overlay');
  const backdrop = document.getElementById('notif-backdrop');
  if(overlay.classList.contains('open')){
    closeNotifOverlay();
  } else {
    renderNotifications();
    overlay.classList.add('open');
    backdrop.classList.add('open');
    // Mark group notifications as read in backend (fire-and-forget)
    if(typeof markGroupNotifsRead === 'function') markGroupNotifsRead();
  }
}

function closeNotifOverlay(){
  document.getElementById('notif-overlay').classList.remove('open');
  document.getElementById('notif-backdrop').classList.remove('open');
}

function renderNotifications(){
  const body = document.getElementById('notif-body');
  if(!body) return;
  const notifs = (CFG.notifications||[])
    .filter(n=>!n.confirmed||n.type==='dauerauftrag_info'||n.type==='group_activity')
    .filter(n=>!n.dismissed)
    .sort((a,b)=>(b.date||'').localeCompare(a.date||''));

  if(!notifs.length){
    body.innerHTML = `<div style="text-align:center;padding:32px 24px;color:var(--text3)">
      <svg viewBox="0 0 24 24" style="width:36px;height:36px;stroke:var(--border2);fill:none;stroke-width:1.5;margin-bottom:12px"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
      <div style="font-size:14px">Keine Benachrichtigungen</div>
    </div>`;
    return;
  }

  // Group renewal notifications together at the top if any are pending
  const renewals = notifs.filter(n=>n.type==='dauerauftrag_renewal');
  const others   = notifs.filter(n=>n.type!=='dauerauftrag_renewal');

  const renderRenewalGroup = () => {
    if(!renewals.length) return '';
    const skips = CFG.recurringSkips || {};
    return `<div style="background:rgba(255,209,102,.06);border:1px solid rgba(255,209,102,.2);border-radius:10px;padding:10px 12px;margin-bottom:8px">
      <div style="font-size:12px;font-weight:700;color:var(--yellow);margin-bottom:6px">
        ↻ Daueraufträge bestätigen — neuer Lohnzyklus
      </div>
      ${renewals.map(n => {
        const isSkipped = (skips[n.recurId]||[]).includes(n.cycleStart);
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-size:13px;font-weight:500;color:var(--text)">${esc(n.title||'')}</div>
            <div style="font-size:11px;color:var(--text3)">${esc(n.body||'')}</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;margin-left:8px">
            <button onclick="event.stopPropagation();confirmRecurringRenewal('${n.id}')"
              style="font-size:11px;padding:4px 10px;border-radius:8px;border:1px solid var(--green);background:rgba(100,220,120,.1);color:var(--green);cursor:pointer;font-weight:600">
              ✓ Ja
            </button>
            <button onclick="event.stopPropagation();skipRecurringRenewal('${n.id}')"
              style="font-size:11px;padding:4px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text3);cursor:pointer">
              Ausschliessen
            </button>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  };

  const renderOtherNotif = n => {
    const icon = n.type==='group_activity'
      ? '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
      : '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.08-4.36"/>';
    return `<div class="notif-item${n.dismissed?' dismissed':''}" onclick="openNotifDetail('${n.id}')">
      <div class="notif-item-icon">
        <svg viewBox="0 0 24 24">${icon}</svg>
      </div>
      <div class="notif-item-body">
        <div class="notif-item-title">${esc(n.title||'')}</div>
        <div class="notif-item-sub">${esc(n.body||'')}</div>
        <div class="notif-item-date">${fmtDate(n.date||'')}</div>
      </div>
      ${!n.dismissed?`<button onclick="event.stopPropagation();dismissNotif('${n.id}')" style="background:none;color:var(--text3);font-size:11px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;flex-shrink:0">Verwerfen</button>`:''}
    </div>`;
  };

  body.innerHTML = renderRenewalGroup() + others.map(renderOtherNotif).join('');
}

function dismissNotif(id){
  const n = (CFG.notifications||[]).find(n=>n.id===id);
  if(n){ n.dismissed=true; cfgSave(); }
  renderNotifications();
  updateNotifBadge();
}

function dismissAllNotifs(){
  const all = (CFG.notifications||[]).filter(n=>!n.dismissed);
  if(!all.length) return;
  all.forEach(n=>{ n.dismissed=true; });
  cfgSave();
  renderNotifications();
  updateNotifBadge();
  toast('Alle verworfen','');
}

function openNotifDetail(id){
  const n = (CFG.notifications||[]).find(n=>n.id===id);
  if(!n) return;
  if(n.type==='group_activity'){
    dismissNotif(id);
    if(n.groupId){
      goTab('groups');
      setTimeout(()=>openGroupDetail(n.groupId), 100);
    }
  } else if(n.type==='dauerauftrag_renewal'){
    // Tapping the renewal item navigates to Lohn → Abos subtab
    closeNotifOverlay();
    goTab('lohn');
    setTimeout(()=>setLohnSubtab('abos'), 80);
  } else if(n.type==='dauerauftrag_info'){
    dismissNotif(id);
    toast(`${n.title} — ${n.body}`,'ok');
  } else if(n.type==='dauerauftrag'){
    dismissNotif(id);
  } else if(n.type==='budgetWarning' || n.type==='overspend' || n.type==='cycleStart'){
    dismissNotif(id);
    closeNotifOverlay();
    goTab('lohn');
  } else if(n.type==='bigExpense'){
    dismissNotif(id);
    closeNotifOverlay();
    // Extract expense id from notification id ("bigexp-<expenseId>")
    const expId = n.id.startsWith('bigexp-') ? n.id.slice(7) : null;
    const exp = expId ? DATA.expenses.find(e=>e.id===expId) : null;
    if(exp){
      goTab('verlauf');
      setTimeout(()=>openEditModal(expId,'ausgabe'), 100);
    } else {
      goTab('verlauf');
    }
  } else if(n.type==='weeklyReport' || n.type==='dailyReport' || n.type==='monthEnd'){
    dismissNotif(id);
    closeNotifOverlay();
    goTab('dashboard');
  } else {
    dismissNotif(id);
  }
}

// confirmRecurringExecution removed — Daueraufträge are now auto-materialized on their execution date

function toggleTheme(){
  const isLight = document.documentElement.dataset.theme==='light';
  document.documentElement.dataset.theme = isLight?'':'light';
  CFG.theme = isLight?'':'light';
  cfgSave();
  const lbl = document.getElementById('theme-label');
  if(lbl) lbl.textContent = isLight?'Hell-Modus':'Dunkel-Modus';
}
function updateThemeLabel(){
  const lbl = document.getElementById('theme-label');
  if(lbl) lbl.textContent = document.documentElement.dataset.theme==='light'?'Dunkel-Modus':'Hell-Modus';
}

let lohnChartMonths = 6;
let lohnSubtab = 'zyklus'; // 'zyklus' | 'abos'

function setLohnSubtab(t){
  lohnSubtab = t;
  const zDiv = document.getElementById('lohn-sub-zyklus');
  const aDiv = document.getElementById('lohn-sub-abos');
  const zBtn = document.getElementById('lohn-btn-zyklus');
  const aBtn = document.getElementById('lohn-btn-abos');
  if(zDiv) zDiv.style.display = t === 'zyklus' ? '' : 'none';
  if(aDiv) aDiv.style.display = t === 'abos'   ? '' : 'none';
  if(zBtn) zBtn.className = 'type-btn' + (t === 'zyklus' ? ' active' : '');
  if(aBtn) aBtn.className = 'type-btn' + (t === 'abos'   ? ' active expense' : '');
  if(t === 'abos') renderRecurring();
}

function toggleAboForm(){
  const wrap = document.getElementById('abo-form-wrap');
  const btn  = document.getElementById('abo-add-btn');
  if(!wrap) return;
  const open = wrap.style.display !== 'none';
  wrap.style.display = open ? 'none' : '';
  if(btn) btn.style.background = open ? 'var(--accent)' : 'var(--bg3)';
  if(btn) btn.style.color      = open ? 'var(--bg0)'    : 'var(--text2)';
  if(!open) setTimeout(()=>document.getElementById('r-what')?.focus(), 50);
}

function renderLohn(){
  // Sync subtab visibility + button states
  const zDiv = document.getElementById('lohn-sub-zyklus');
  const aDiv = document.getElementById('lohn-sub-abos');
  const zBtn = document.getElementById('lohn-btn-zyklus');
  const aBtn = document.getElementById('lohn-btn-abos');
  if(zDiv) zDiv.style.display = lohnSubtab === 'zyklus' ? '' : 'none';
  if(aDiv) aDiv.style.display = lohnSubtab === 'abos'   ? '' : 'none';
  if(zBtn) zBtn.className = 'type-btn' + (lohnSubtab === 'zyklus' ? ' active' : '');
  if(aBtn) aBtn.className = 'type-btn' + (lohnSubtab === 'abos'   ? ' active expense' : '');

  if(lohnSubtab === 'abos'){ renderRecurring(); return; }

  const ltEl = document.getElementById('sp-lohntag');
  if(ltEl) ltEl.value = CFG.lohnTag||25;

  const now = new Date();
  const mNames = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

  // Lohnzyklus card + cycle transactions
  const zSec = document.getElementById('lohn-zyklus-section');
  if(zSec){
    const z = getZyklusInfo();
    const budgetPct = z.varBudget>0 ? Math.min(z.varSpent/z.varBudget*100,100) : 0;
    const progColor = budgetPct>90?'var(--red)':budgetPct>70?'var(--yellow)':'var(--accent)';
    const rateColor = z.dailyRate===null?'var(--text3)':z.dailyRate>=0?'var(--accent)':'var(--red)';
    const cycleInc = DATA.incomes.filter(e=>e.date>=z.startStr&&e.date<=z.endStr).sort((a,b)=>a.date.localeCompare(b.date));
    const cycleExp = DATA.expenses.filter(e=>e.date>=z.startStr&&e.date<=z.endStr).sort((a,b)=>a.date.localeCompare(b.date));
    const cycleAll = [...cycleInc.map(e=>({...e,_type:'inc'})),...cycleExp.map(e=>({...e,_type:'exp'}))].sort((a,b)=>a.date.localeCompare(b.date));
    // Helper for exact day-range label
    const fmtD = s => s ? s.slice(8)+'.'+s.slice(5,7)+'.' : '';
    const prevLbl = `${fmtD(z.prevStartStr)}–${fmtD(z.prevEndStr)}`;
    const dls = z.daysLeftStart;
    const daysRangeLabel = z.daysLeft>0
      ? `${dls.getDate()}.${String(dls.getMonth()+1).padStart(2,'0')}.–${fmtD(z.endStr)} (${z.daysLeft} Tage ab morgen)`
      : `Letzter Tag`;

    // Toggle chip helper (inline HTML string)
    const chip = (label, active, fn) =>
      `<button onclick="${fn}()" style="font-size:11px;padding:3px 10px;border-radius:12px;cursor:pointer;
         background:${active?'rgba(var(--accent-rgb,100,220,120),.12)':'var(--bg3)'};
         border:1px solid ${active?'var(--accent)':'var(--border)'};
         color:${active?'var(--accent)':'var(--text2)'};"
       title="${active?'Klick: ausschliessen':'Klick: einbeziehen'}">${active?'✓ ':'+ '}${label}</button>`;

    zSec.innerHTML = `
    <div class="section pt-0">
      <div class="section-title">Lohnzyklus</div>
      <div class="zy-card">
        <div class="zy-header">
          <div class="zy-title">${z.start.getDate()}. ${mNames[z.start.getMonth()]} – ${z.end.getDate()}. ${mNames[z.end.getMonth()]} ${z.end.getFullYear()}</div>
          <div class="zy-period">Tag ${z.daysElapsed} / ${z.cycleDays}</div>
        </div>
        <div class="zy-body">
          ${z.hasSalary ? `
          <div class="zy-row"><span class="zy-row-label">+ Lohn / Einnahmen</span><span class="zy-row-val" style="color:var(--green)">${curr()} ${fmtAmt(z.lohn)}</span></div>
          ${z.fixKosten>0?`<div class="zy-row"><span class="zy-row-label">− Fixkosten</span><span class="zy-row-val t-text2">${curr()} ${fmtAmt(z.fixKosten)}</span></div>`:''}

          <!-- Sparziel with toggle -->
          <div class="zy-row" style="align-items:center;gap:6px">
            <span class="zy-row-label" style="display:flex;align-items:center;gap:6px">
              ${chip('Sparziel', z.inclSparziel, 'toggleBudgetSparziel')}
              ${z.inclSparziel && z.mSparzielRaw>0 ? '− Sparziel' : ''}
            </span>
            <span class="zy-row-val" style="color:var(--accent)">
              ${z.inclSparziel && z.mSparzielRaw>0 ? `${curr()} ${fmtAmt(z.mSparzielRaw)}` : '<span style="font-size:11px;color:var(--text3);font-style:italic">nicht einbezogen</span>'}
            </span>
          </div>

          <!-- Übertrag with toggle + detail -->
          <div class="zy-row" style="align-items:center;gap:6px">
            <span class="zy-row-label" style="display:flex;align-items:center;gap:6px">
              ${chip('Übertrag', z.inclCarryover, 'toggleBudgetCarryover')}
              ${z.inclCarryover && z.prevCarryoverRaw!==0 ? (z.prevCarryoverRaw>=0?'+ Übertrag':'− Übertrag') : ''}
            </span>
            <span class="zy-row-val" style="color:${z.prevCarryoverRaw>=0?'var(--green)':'var(--red)'}">
              ${z.inclCarryover && z.prevCarryoverRaw!==0 ? `${curr()} ${fmtAmt(Math.abs(z.prevCarryoverRaw))}` : '<span style="font-size:11px;color:var(--text3);font-style:italic">' + (z.inclCarryover?'Vorperiode: 0':'nicht einbezogen') + '</span>'}
            </span>
          </div>
          ${z.inclCarryover && z.prevCarryoverRaw!==0 ? `
          <div style="font-size:11px;color:var(--text3);background:var(--bg2);border-radius:8px;padding:8px 10px;margin:4px 0 4px 0;line-height:1.8">
            <div style="font-weight:600;color:var(--text2);margin-bottom:2px">Vorperiode ${prevLbl}:</div>
            <div style="display:flex;justify-content:space-between"><span>+ Lohn / Einnahmen</span><span style="font-family:'DM Mono',monospace">${curr()} ${fmtAmt(z.prevLohn)}</span></div>
            <div style="display:flex;justify-content:space-between"><span>− Fixkosten</span><span style="font-family:'DM Mono',monospace">${curr()} ${fmtAmt(z.prevFixKosten)}</span></div>
            <div style="display:flex;justify-content:space-between"><span>− Variabel ausgegeben</span><span style="font-family:'DM Mono',monospace">${curr()} ${fmtAmt(z.prevVarSpent)}</span></div>
            <div style="display:flex;justify-content:space-between;border-top:1px solid var(--border);margin-top:3px;padding-top:3px;font-weight:600">
              <span>= Übertrag</span>
              <span style="font-family:'DM Mono',monospace;color:${z.prevCarryoverRaw>=0?'var(--green)':'var(--red)'}">${curr()} ${fmtAmt(z.prevCarryoverRaw)}</span>
            </div>
          </div>` : ''}

          <div class="zy-divider"></div>
          <div class="zy-row bold"><span class="zy-row-label">= Variables Budget</span><span class="zy-row-val">${z.varBudget>=0?'':'− '}${curr()} ${fmtAmt(Math.abs(z.varBudget))}</span></div>
          <div class="zy-row"><span class="zy-row-label">− Ausgegeben (variabel)</span><span class="zy-row-val t-red">${curr()} ${fmtAmt(z.varSpent)}</span></div>
          <div class="zy-row bold"><span class="zy-row-label">= Verbleibend</span><span class="zy-row-val" style="color:${z.varRemaining>=0?'var(--green)':'var(--red)'}">${curr()} ${fmtAmt(Math.abs(z.varRemaining))}</span></div>
          <div class="zy-prog-wrap"><div class="zy-prog-fill" style="width:${budgetPct.toFixed(1)}%;background:${progColor}"></div></div>
          <div class="zy-prog-labels"><span>${budgetPct.toFixed(0)}% verbraucht</span><span>${daysRangeLabel}</span></div>
          ${z.dailyRate!==null?`
          <div class="zy-rate-wrap">
            <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
              <span class="zy-rate" style="color:${rateColor}">${curr()} ${fmtAmt(Math.abs(z.dailyRate))}</span>
              <span style="font-size:13px;color:var(--text2)">/ Tag ${z.dailyRate>=0?'verfügbar':'überzogen'}</span>
            </div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px">÷ ${z.daysLeft} Tage (${daysRangeLabel})</div>
          </div>`:''}
          ` : `
          <div style="background:rgba(255,209,102,.07);border:1px solid rgba(255,209,102,.2);border-radius:8px;padding:10px 12px">
            <div style="font-size:12px;color:var(--yellow);font-weight:600;margin-bottom:4px">Noch kein Lohn erfasst</div>
            <div style="font-size:12px;color:var(--text2);line-height:1.5">Einnahme erfassen und <strong style="color:var(--text)">«Als Lohn zählen»</strong> aktivieren. Lohntag: ${CFG.lohnTag||25}.</div>
          </div>
          `}
        </div>
      </div>
    </div>

    ${cycleAll.length ? `
    <div class="section pt-0">
      <div class="section-title">Buchungen im Zyklus
        <span style="font-size:11px;color:var(--text3);font-weight:400;margin-left:6px">Fixkosten per Taste markieren</span>
      </div>
      <div class="card p-0">
        ${cycleAll.map(e=>`
        <div class="card-row" style="padding-right:8px">
          <div class="card-row-icon" style="background:${catColor(e.cat)}22"><span>${catEmoji(e.cat)}</span></div>
          <div class="card-row-body">
            <div class="card-row-title">${esc(e.what)}${e.isLohn?` <span style="font-size:10px;background:rgba(200,245,60,.15);color:var(--accent);border-radius:4px;padding:1px 5px;font-weight:600">Lohn</span>`:''}${e.isFixkosten?` <span style="font-size:10px;background:rgba(255,77,109,.12);color:var(--red);border-radius:4px;padding:1px 5px;font-weight:600">Fix</span>`:''}</div>
            <div class="card-row-sub">${fmtDate(e.date)} · ${esc(e.cat)}</div>
          </div>
          <div class="card-row-amount ${e._type==='inc'?'income':''}" style="min-width:60px;text-align:right">
            ${e._type==='inc'?'+':'−'} ${fmtAmt(e.amt)}
          </div>
          ${e._type==='exp' && e.recurringId ? `
          <button onclick="toggleFixkosten('${e.id}')" style="margin-left:6px;padding:5px 8px;font-size:11px;font-weight:600;border:1px solid ${e.isFixkosten?'var(--red)':'var(--border)'};border-radius:6px;background:${e.isFixkosten?'rgba(255,77,109,.1)':'var(--bg3)'};color:${e.isFixkosten?'var(--red)':'var(--text3)'};white-space:nowrap;flex-shrink:0">
            ${e.isFixkosten?'Fix ✓':'Fix?'}
          </button>` : `<div style="width:${e._type==='exp'?'0':'54'}px"></div>`}
        </div>`).join('')}
      </div>
    </div>
    ` : ''}`;
  }

  // Monthly income data
  const mData = [];
  for(let i=lohnChartMonths-1; i>=0; i--){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const mo = d.getMonth(), yr = d.getFullYear();
    const inc = DATA.incomes.filter(e=>{
      const ed=new Date(e.date+'T12:00:00');
      return ed.getMonth()===mo&&ed.getFullYear()===yr;
    }).reduce((s,e)=>s+e.amt,0);
    mData.push({mo,yr,label:mNames[mo],inc,cur:mo===now.getMonth()&&yr===now.getFullYear()});
  }

  // Bar chart SVG
  const maxInc = Math.max(...mData.map(m=>m.inc), 0.01);
  const W=320, H=120, padL=4, padR=4, padB=22, padT=14;
  const chartW=W-padL-padR, chartH=H-padB-padT;
  const barW = chartW/lohnChartMonths - 2;
  const bars = mData.map((m,i)=>{
    const bh = m.inc>0 ? Math.max(4,(m.inc/maxInc)*chartH) : 2;
    const x = padL + (i/lohnChartMonths)*chartW + 1;
    const y = padT + chartH - bh;
    const fill = m.cur ? 'var(--accent)' : 'var(--green)';
    const valLabel = m.inc>0 ? `<text x="${(x+barW/2).toFixed(1)}" y="${(y-3).toFixed(1)}" font-size="7" fill="var(--text3)" font-family="DM Mono,monospace" text-anchor="middle">${(m.inc/1000).toFixed(1)}k</text>` : '';
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(barW,2).toFixed(1)}" height="${bh.toFixed(1)}" fill="${fill}" opacity="${m.inc>0?'0.8':'0.15'}" rx="2"/>${valLabel}`;
  });
  const xLabels = mData.map((m,i)=>{
    const x = padL + (i/lohnChartMonths)*chartW + barW/2 + 1;
    return `<text x="${x.toFixed(1)}" y="${H-4}" font-size="8" fill="${m.cur?'var(--accent)':'var(--text3)'}" font-family="DM Mono,monospace" text-anchor="middle">${m.label}</text>`;
  });
  const chartSvg = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" height="${H}">${bars.join('')}${xLabels.join('')}</svg>`;

  const periodBtns = [3,6,12].map(n=>
    `<button class="filter-chip${lohnChartMonths===n?' active':''}" onclick="setLohnMonths(${n})" style="font-size:12px;padding:4px 10px">${n}M</button>`
  ).join('');

  const chartSection = document.getElementById('lohn-chart-section');
  if(chartSection) chartSection.innerHTML = `
    <div class="section-title" style="padding:0 0 6px">Einnahmen-Verlauf</div>
    <div style="display:flex;gap:6px;margin-bottom:8px">${periodBtns}</div>
    <div style="overflow-x:auto;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:10px 8px">${chartSvg}</div>`;

  // Income list grouped by month
  const listEl = document.getElementById('lohn-list');
  if(!listEl) return;
  if(!DATA.incomes.length){
    listEl.innerHTML = `<div class="empty"><div class="empty-icon"><svg viewBox="0 0 24 24" style="width:40px;height:40px;stroke:var(--border2);fill:none;stroke-width:1.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div><div class="empty-text">Noch keine Einnahmen erfasst</div></div>`;
    return;
  }
  const byMonth = {};
  DATA.incomes.forEach(e=>{
    const key=e.date.substring(0,7);
    if(!byMonth[key]) byMonth[key]=[];
    byMonth[key].push(e);
  });
  listEl.innerHTML = Object.entries(byMonth)
    .sort(([a],[b])=>b.localeCompare(a))
    .map(([key,items])=>{
      const [yr,mo]=key.split('-');
      const total=items.reduce((s,e)=>s+e.amt,0);
      return `
      <div class="date-group">
        <div class="date-label" style="display:flex;justify-content:space-between;align-items:center">
          <span>${mNames[parseInt(mo)-1]} ${yr}</span>
          <span style="font-size:12px;font-weight:500;color:var(--green)">+ ${curr()} ${fmtAmt(total)}</span>
        </div>
        <div class="card" style="margin:0 16px">
          ${items.map(e=>`
            <div class="card-row" onclick="openEditModal('${e.id}','einnahme')">
              <div class="card-row-icon" style="background:${catColor(e.cat)}22"><span>${catEmoji(e.cat)}</span></div>
              <div class="card-row-body">
                <div class="card-row-title">${esc(e.what)}${e.isLohn?` <span style="font-size:10px;background:rgba(200,245,60,.15);color:var(--accent);border-radius:4px;padding:1px 5px;font-weight:600">Lohn</span>`:''}</div>
                <div class="card-row-sub">${esc(e.cat)}${e.note?' · '+esc(e.note):''}</div>
              </div>
              <div class="card-row-amount income">+ ${fmtAmt(e.amt)}</div>
              <svg class="chevron" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
            </div>`).join('')}
        </div>
      </div>`;
    }).join('');

  // ── Fixkosten-Kategorien Management (Point 2) ──────────────────────────────
  const fkEl = document.getElementById('lohn-fixkosten-section');
  if(fkEl){
    const allCats = [...new Set([
      ...DATA.expenses.map(e=>e.cat),
      ...DATA.recurring.filter(r=>r.active).map(r=>r.cat)
    ])].filter(Boolean).sort();
    const fkKats = CFG.fixkostenKats||[];
    // Daueraufträge with !affectsAvg are always fixed — show them as info
    const dauerFixKats = [...new Set(DATA.recurring.filter(r=>r.active&&!r.affectsAvg).map(r=>r.cat))];

    fkEl.innerHTML = `
    <div class="section-title" style="padding:0 0 8px;display:flex;align-items:center;gap:8px">
      Fixkosten-Kategorien
      <span style="font-size:11px;font-weight:400;color:var(--text3)">zentrale Variable für alle Reiter</span>
    </div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:10px;line-height:1.5">
      Kategorien die als Fixkosten gelten → werden aus Ø Tagesausgabe und variablem Budget herausgerechnet.
    </div>
    ${dauerFixKats.length ? `
    <div style="font-size:11px;color:var(--text3);margin-bottom:6px">Von Daueraufträgen (automatisch):</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
      ${dauerFixKats.map(cat=>`
        <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;font-size:12px;background:rgba(61,219,150,.1);border:1px solid var(--green);color:var(--green)">
          ${catEmoji(cat)} ${esc(cat)}
        </span>`).join('')}
    </div>` : ''}
    <div style="font-size:11px;color:var(--text3);margin-bottom:6px">Manuelle Auswahl:</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px">
      ${allCats.filter(c=>!dauerFixKats.includes(c)).map(cat=>{
        const active = fkKats.includes(cat);
        return `<button onclick="toggleFixkostenKat('${esc(cat)}')"
          style="padding:5px 12px;border-radius:20px;font-size:12px;cursor:pointer;
                 background:${active?'rgba(255,77,109,.12)':'var(--bg3)'};
                 border:1px solid ${active?'var(--red)':'var(--border)'};
                 color:${active?'var(--red)':'var(--text2)'}">
          ${catEmoji(cat)} ${esc(cat)} ${active?'✓':''}
        </button>`;
      }).join('')}
    </div>`;
  }
}

function setLohnMonths(n){ lohnChartMonths=n; renderLohn(); }

function saveLohnTag(){
  const lt = parseInt(document.getElementById('sp-lohntag').value)||25;
  CFG.lohnTag = Math.min(Math.max(lt,1),31);
  cfgSave();
  toast('✓ Gespeichert','ok');
  renderDashboard();
}

// Budget formula toggles — called from Lohnzyklus widget buttons.
// event.stopPropagation() must be called at the call site (onclick in widget HTML).
function toggleBudgetCarryover(){
  CFG.budgetInclCarryover = CFG.budgetInclCarryover === false ? true : false;
  cfgSave();
  invalidateZyklusCache();
  renderHome();
  renderLohn();
}
function toggleBudgetSparziel(){
  CFG.budgetInclSparziel = CFG.budgetInclSparziel === false ? true : false;
  cfgSave();
  invalidateZyklusCache();
  renderHome();
  renderLohn();
}

async function toggleFixkosten(id){
  const e = DATA.expenses.find(e=>e.id===id);
  if(!e) return;
  e.isFixkosten = !e.isFixkosten;
  renderLohn();
  renderDashboard();
  if(!CFG.demo){
    setSyncStatus('syncing');
    try{
      const row = await apiFindRow('Ausgaben', id);
      if(row) await apiUpdate(`Ausgaben!H${row}`,[[e.isFixkosten?'1':'0']]);
      setSyncStatus('online');
    } catch(err){ setSyncStatus('error'); toast('Sync-Fehler','err'); }
  }
}

function openSparziel(){
  document.getElementById('sz-msparziel').value = CFG.mSparziel||0;
  document.getElementById('sz-sparziel').value = CFG.sparziel||0;
  openModal('sparziel-modal');
}

function saveSparziel(){
  CFG.mSparziel = parseFloat(document.getElementById('sz-msparziel').value)||0;
  CFG.sparziel = parseFloat(document.getElementById('sz-sparziel').value)||0;
  cfgSave();
  closeModal('sparziel-modal');
  toast('✓ Gespeichert','ok');
  renderDashboard();
}

function openAvgConfig(){
  const active = DATA.recurring.filter(r=>r.active);
  if(!active.length){ toast('Keine Daueraufträge vorhanden','err'); return; }
  document.getElementById('avg-config-list').innerHTML = active.map(r=>`
    <label style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer">
      <div>
        <div style="font-size:14px;font-weight:500">${esc(r.what)}</div>
        <div class="t-muted-sm">${r.interval} · ${curr()} ${fmtAmt(r.amt)}</div>
      </div>
      <input type="checkbox" data-rid="${r.id}" ${r.affectsAvg?'checked':''} style="width:18px;height:18px;accent-color:var(--accent)">
    </label>`).join('');
  openModal('avg-config-modal');
}

async function saveAvgConfig(){
  const checks = document.querySelectorAll('#avg-config-list input[data-rid]');
  const changed = [];
  checks.forEach(cb=>{
    const r = DATA.recurring.find(r=>r.id===cb.dataset.rid);
    if(r && r.affectsAvg !== cb.checked){ r.affectsAvg=cb.checked; changed.push(r); }
  });
  closeModal('avg-config-modal');
  renderDashboard();
  if(currentTab==='monat') renderMonat();
  if(!CFG.demo && changed.length){
    for(const r of changed){
      try{
        const row = await apiFindRow('Daueraufträge', r.id);
        if(row) await apiUpdate(`Daueraufträge!K${row}`,[[r.affectsAvg?'1':'0']]);
      } catch(e){ toast('Sync-Fehler','err'); }
    }
    setSyncStatus('online'); toast('✓ Gespeichert','ok');
  } else toast('✓ Gespeichert','ok');
}

// ─── CHARTS ────────────────────────────────────────────────────

function buildBarChart(dayData, days){
  const todayStr = today();
  const dates = Object.keys(dayData).sort();
  const maxAmt = Math.max(...Object.values(dayData), 0.01);
  const W=320, H=100, padL=4, padR=4, padB=22, padT=6;
  const chartW=W-padL-padR, chartH=H-padB-padT;
  const barW=Math.max(1, (chartW/days)-1);
  const bars = dates.map((d,i)=>{
    const amt=dayData[d];
    const bh=amt>0?Math.max(2,(amt/maxAmt)*chartH):0;
    const x=padL+(i/days)*chartW;
    const y=padT+chartH-bh;
    const isTday=d===todayStr;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(barW,1).toFixed(1)}" height="${bh.toFixed(1)}" fill="${isTday?'var(--accent)':'var(--red)'}" opacity="0.75" rx="1"/>`;
  });
  const labels=[];
  dates.forEach((d,i)=>{
    if(i===0||i%7===0||(i===dates.length-1&&dates.length>4)){
      const dt=new Date(d+'T12:00:00');
      labels.push(`<text x="${(padL+(i/days)*chartW).toFixed(1)}" y="${H-4}" font-size="8" fill="var(--text3)" font-family="DM Mono,monospace">${dt.getDate()}.${dt.getMonth()+1}.</text>`);
    }
  });
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" height="${H}">${bars.join('')}${labels.join('')}</svg>`;
}

function buildBalanceChart(months){
  const now=new Date();
  const startDate=new Date(now.getFullYear(),now.getMonth()-months+1,1);
  const startStr=dateStr(startDate), todayStr=today();
  const events=[];
  DATA.expenses.filter(e=>e.date>=startStr&&e.date<=todayStr).forEach(e=>events.push({date:e.date,amt:-e.amt}));
  DATA.incomes.filter(e=>e.date>=startStr&&e.date<=todayStr).forEach(e=>events.push({date:e.date,amt:e.amt}));
  getRecurringOccurrences(startStr,todayStr,true,true).forEach(e=>events.push({date:e.date,amt:-e.amt}));
  events.sort((a,b)=>a.date.localeCompare(b.date));
  if(!events.length) return `<div style="padding:24px;text-align:center;color:var(--text3);font-size:13px">Keine Daten für diesen Zeitraum</div>`;
  let bal=0;
  const pts=[{date:startStr,bal:0}];
  events.forEach(e=>{bal+=e.amt; pts.push({date:e.date,bal});});
  if(pts[pts.length-1].date!==todayStr) pts.push({date:todayStr,bal});
  const W=340,H=130,padL=42,padR=6,padB=22,padT=8;
  const chartW=W-padL-padR, chartH=H-padB-padT;
  const totalDays=Math.max(1,Math.round((new Date(todayStr+'T12:00:00')-startDate)/86400000));
  const mapX=d=>{const days=Math.round((new Date(d+'T12:00:00')-startDate)/86400000); return padL+(days/totalDays)*chartW;};
  const minBal=Math.min(...pts.map(p=>p.bal),0);
  const maxBal=Math.max(...pts.map(p=>p.bal),0);
  const range=maxBal-minBal||1;
  const mapY=b=>padT+chartH-((b-minBal)/range)*chartH;
  const poly=pts.map(p=>`${mapX(p.date).toFixed(1)},${mapY(p.bal).toFixed(1)}`).join(' ');
  const zeroY=mapY(0).toFixed(1);
  // Area fill
  const areaPath=`M${mapX(pts[0].date).toFixed(1)},${zeroY} `+pts.map(p=>`L${mapX(p.date).toFixed(1)},${mapY(p.bal).toFixed(1)}`).join(' ')+` L${mapX(pts[pts.length-1].date).toFixed(1)},${zeroY} Z`;
  // Y labels
  const yLabels=[[minBal,'var(--red)'],[0,'var(--text3)'],[maxBal,'var(--green)']].filter((v,i,a)=>a.findIndex(x=>x[0]===v[0])===i).map(([v,c])=>{
    const y=mapY(v).toFixed(1);
    const abs=Math.abs(v);
    const lbl=abs>=1000?`${(v/1000).toFixed(1)}k`:Math.round(v).toString();
    return `<text x="2" y="${y}" font-size="8" fill="${c}" font-family="DM Mono,monospace" dominant-baseline="middle">${lbl}</text>`;
  });
  // Month labels on X
  const xLabels=[];
  for(let i=0;i<months;i++){
    const d=new Date(now.getFullYear(),now.getMonth()-months+1+i,1);
    const ds=dateStr(d);
    if(ds>=startStr&&ds<=todayStr){
      const mNames=['J','F','M','A','M','J','J','A','S','O','N','D'];
      xLabels.push(`<text x="${mapX(ds).toFixed(1)}" y="${H-4}" font-size="8" fill="var(--text3)" font-family="DM Mono,monospace">${mNames[d.getMonth()]}</text>`);
    }
  }
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" height="${H}">
    <defs>
      <linearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    <line x1="${padL}" y1="${zeroY}" x2="${W-padR}" y2="${zeroY}" stroke="var(--border2)" stroke-width="1" stroke-dasharray="3,3"/>
    <path d="${areaPath}" fill="url(#aGrad)"/>
    <polyline points="${poly}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${yLabels.join('')}${xLabels.join('')}
  </svg>`;
}

// Cached frequency maps for dropdown sort (rebuilt when data lengths change)
let _freqMaps = null, _freqMapsKey = null;
function _getFreqMaps(){
  const key = DATA.expenses.length+'|'+DATA.incomes.length+'|'+DATA.categories.length;
  if(_freqMaps && _freqMapsKey===key) return _freqMaps;
  const exp={}, inc={};
  DATA.expenses.forEach(e=>{ if(e.cat) exp[e.cat]=(exp[e.cat]||0)+1; });
  DATA.incomes.forEach(e=>{  if(e.cat) inc[e.cat]=(inc[e.cat]||0)+1; });
  _freqMaps = {ausgabe:exp, einnahme:inc};
  _freqMapsKey = key;
  return _freqMaps;
}

function fillDropdown(elId, type, selected=''){
  const el = document.getElementById(elId);
  if(!el) return;
  const cats = DATA.categories.filter(c=>c.type===type&&c.id!=='DELETED'&&c.name!=='DELETED');
  const freq = _getFreqMaps()[type]||{};
  cats.sort((a,b)=>(freq[b.name]||0)-(freq[a.name]||0));
  el.innerHTML = cats.map(c=>`<option value="${esc(c.name)}" ${c.name===selected?'selected':''}>${c.name}</option>`).join('');
  if(!selected && cats.length) el.value = cats[0].name;
}

function fillAllDropdowns(){
  fillDropdown('f-cat', currentEntryType==='ausgabe'?'ausgabe':'einnahme');
  fillDropdown('r-cat','ausgabe');
  fillGroupDropdown();
  // Show/hide Aktien tab button based on setting
  const aktBtn = document.getElementById('type-akt');
  if(aktBtn) aktBtn.style.display = CFG.aktienEnabled ? '' : 'none';
}

function fillParentDropdown(elId, type, selected=''){
  const el=document.getElementById(elId); if(!el) return;
  const tops=DATA.categories.filter(c=>c.type===type&&!c.parent&&c.id!=='DELETED'&&c.name!=='DELETED');
  el.innerHTML=`<option value="">— keine —</option>`+tops.map(c=>`<option value="${esc(c.name)}" ${c.name===selected?'selected':''}>${esc(c.name)}</option>`).join('');
}

function openModal(id){
  const el = document.getElementById(id);
  el.classList.add('show');
  Device.pushNav('modal', id);
  // Auto-focus first focusable field after open animation
  setTimeout(()=>{
    const first = el.querySelector('input:not([type="hidden"]):not([disabled]),select:not([disabled]),textarea:not([disabled])');
    if(first) first.focus();
  }, 260);
}
function closeModal(id){ document.getElementById(id).classList.remove('show'); }

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay=>{
  overlay.addEventListener('click', e=>{ if(e.target===overlay) overlay.classList.remove('show'); });
});

// Close topmost open modal on Escape
document.addEventListener('keydown', e=>{
  if(e.key !== 'Escape') return;
  const open = document.querySelector('.modal-overlay.show');
  if(open) open.classList.remove('show');
});

let _syncSettleTimer, _syncDotHideTimer;
function setSyncStatus(s){
  const dot=document.getElementById('sync-dot'), label=document.getElementById('sync-label');
  clearTimeout(_syncSettleTimer);
  clearTimeout(_syncDotHideTimer);
  dot.className='sync-dot '+s;
  dot.style.opacity='1';
  if(s==='online'){
    label.style.display='';
    label.textContent='Verbunden';
    _syncSettleTimer=setTimeout(()=>{ label.style.display='none'; },2000);
    // Hide green dot after 4 seconds — reappears on next status change
    _syncDotHideTimer=setTimeout(()=>{ dot.style.opacity='0'; dot.style.transition='opacity .6s'; },4000);
  } else {
    label.style.display='';
    label.textContent={syncing:'Sync…',error:'Fehler',demo:'Demo'}[s]||s;
  }
}

function setLoader(v){ document.getElementById('loader').classList.toggle('show',v); }

let toastTimer;
function toast(msg,type=''){
  haptic(type==='err'?[10,50,10]:8);
  const el=document.getElementById('toast');
  el.textContent=msg; el.className='toast show '+(type||'');
  clearTimeout(toastTimer);
  const dur = type==='err' ? 4000 : 2800;
  toastTimer=setTimeout(()=>el.classList.remove('show'),dur);
}

function toastAction(msg, actionLabel, onAction){
  haptic(8);
  const el = document.getElementById('toast');
  el.innerHTML = esc(msg) + ' <button class="toast-action-btn" onclick="__toastAction()">' + esc(actionLabel) + '</button>';
  el.className = 'toast show action';
  clearTimeout(toastTimer);
  window.__toastAction = () => { clearTimeout(toastTimer); el.classList.remove('show'); onAction(); };
  toastTimer = setTimeout(() => el.classList.remove('show'), 5000);
}

function esc(s){ return s?(s+'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'):'';}

function openSettings(){
  document.getElementById('s-url').value=CFG.scriptUrl||'';
  updateThemeLabel();
  openModal('settings-modal');
}

function applySettings(){
  CFG.scriptUrl=document.getElementById('s-url').value.trim();
  CFG.demo=false; cfgSave(); location.reload();
}

function resetApp(){ if(confirm('App wirklich zurücksetzen? Alle lokalen Daten werden gelöscht.')){ localStorage.removeItem(CFG_KEY); location.reload(); } }

// ═══════════════════════════════════════════════════════════════
// MODULE: DEMO DATA
// ═══════════════════════════════════════════════════════════════
function loadDemo(){
  DATA.categories = [
    {id:'k001',name:'Zmittag',type:'ausgabe',color:'#FF6B35',sort:1},
    {id:'k002',name:'Poschte',type:'ausgabe',color:'#4ECDC4',sort:2},
    {id:'k003',name:'Ferien',type:'ausgabe',color:'#00D4AA',sort:3},
    {id:'k004',name:'Mieti',type:'ausgabe',color:'#E5C07B',sort:4},
    {id:'k005',name:'SBB',type:'ausgabe',color:'#E63946',sort:5},
    {id:'k006',name:'Sport',type:'ausgabe',color:'#FF9F43',sort:6},
    {id:'k007',name:'Diverses',type:'ausgabe',color:'#888',sort:7},
    {id:'k008',name:'Siemens',type:'einnahme',color:'#C8F53C',sort:8},
    {id:'k009',name:'Twint',type:'einnahme',color:'#00C9A7',sort:9},
    {id:'k010',name:'Schenkung',type:'einnahme',color:'#FFD93D',sort:10},
  ];
  const t=new Date(); const y=t.getFullYear(); const m=String(t.getMonth()+1).padStart(2,'0');
  // Previous month for salary and cycle-start expenses
  const prevD=new Date(t.getFullYear(),t.getMonth()-1,1); const py=prevD.getFullYear(); const pm=String(prevD.getMonth()+1).padStart(2,'0');
  DATA.expenses = [
    {id:'a001',date:`${y}-${m}-02`,what:'Migros',cat:'Poschte',amt:67.40,note:'',isFixkosten:false},
    {id:'a002',date:`${y}-${m}-03`,what:'Mittagessen Kantine',cat:'Zmittag',amt:14.50,note:'mit Lea',isFixkosten:false},
    {id:'a003',date:`${py}-${pm}-26`,what:'Miete',cat:'Mieti',amt:1023,note:'',isFixkosten:true},
    {id:'a004',date:`${py}-${pm}-28`,what:'GA Verlängerung',cat:'SBB',amt:89,note:'',isFixkosten:true},
    {id:'a005',date:`${y}-${m}-05`,what:'Coop',cat:'Poschte',amt:43.20,note:'',isFixkosten:false},
    {id:'a006',date:`${y}-${m}-12`,what:'Znacht mit Freunden',cat:'Diverses',amt:52,note:'Pizzeria',isFixkosten:false},
  ];
  DATA.incomes = [
    {id:'e001',date:`${py}-${pm}-25`,what:'Lohn Siemens',cat:'Siemens',amt:3127,note:'',isLohn:true},
    {id:'e002',date:`${py}-${pm}-26`,what:'Lohn Siemens Zusatz',cat:'Siemens',amt:649.80,note:'',isLohn:true},
  ];
  DATA.recurring = [
    {id:'d001',what:'Miete',cat:'Mieti',amt:1023,interval:'monatlich',day:1,note:'',active:true},
    {id:'d002',what:'Handy',cat:'Diverses',amt:45,interval:'monatlich',day:15,note:'Salt',active:true},
    {id:'d003',what:'Ruderkurs',cat:'Sport',amt:526,interval:'halbjährlich',day:1,note:'',active:true},
  ];
}



// ── Onboarding Intro ─────────────────────────────────────────
const _INTRO_STEPS = [
  { icon:'<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>', title:'Willkommen bei F-Tracker', text:'Dein persönlicher Finanztracker — einfach, schnell, privat. Alles auf einen Blick.' },
  { icon:'<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>', title:'Einnahmen & Ausgaben', text:'Tippe auf das «+» um Buchungen zu erfassen. Kategorie, Betrag, Datum — fertig.' },
  { icon:'<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>', title:'Dashboard & Verlauf', text:'Home zeigt dein Monatsbudget. Verlauf listet alle Buchungen — filterbar nach Monat und Kategorie.' },
  { icon:'<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>', title:'Daueraufträge', text:'Miete, Abos, Versicherungen — einmal anlegen und automatisch buchen lassen.' },
  { icon:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', title:'Gruppen & Events', text:'Teile Ausgaben mit Freunden — für Reisen, WG oder geteilte Abos.' },
];
let _introStep = 0;
function showIntro(){
  _introStep = 0; _renderIntroStep();
  document.getElementById('intro-overlay').style.display = 'flex';
}
function _renderIntroStep(){
  const s = _INTRO_STEPS[_introStep], total = _INTRO_STEPS.length;
  document.getElementById('intro-slides').innerHTML = `<div class="intro-slide">
    <div class="intro-icon-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">${s.icon}</svg></div>
    <div class="intro-title">${s.title}</div>
    <div class="intro-text">${s.text}</div>
  </div>`;
  document.getElementById('intro-dots').innerHTML = Array.from({length:total},(_,i)=>`<span class="intro-dot${i===_introStep?' active':''}"></span>`).join('');
  document.getElementById('intro-next-btn').textContent = _introStep===total-1 ? "Los geht's!" : 'Weiter';
}
function introNext(){
  if(_introStep < _INTRO_STEPS.length-1){ _introStep++; _renderIntroStep(); }
  else introClose();
}
function introClose(){
  document.getElementById('intro-overlay').style.display = 'none';
  CFG.introSeen = true; cfgSave();
}

// ── Tab Help ─────────────────────────────────────────────────
const _TAB_HELP = {
  home: { title:'Home', items:[
    'Übersicht über den aktuellen Lohnzyklus: Budget, Ausgaben, Sparrate.',
    'Widgets per «Bearbeiten» ein-/ausblenden und neu anordnen.',
    'Der Budgetbalken zeigt, wie viel vom variablen Budget noch übrig ist.',
    'Tippe auf Beträge oder Kategorien für die Detailansicht.',
  ]},
  eingabe: { title:'Eingabe', items:[
    '«−» für Ausgaben, «+» für Einnahmen — Typ jederzeit wechselbar.',
    'Betrag, Datum, Kategorie und Beschreibung erfassen.',
    '«Dauerauftrag» aktivieren für wiederkehrende Buchungen (Miete, Abos...).',
    'Gruppen-Feld erscheint automatisch wenn Gruppen vorhanden sind.',
    'Enter in Beschreibung springt zu Notiz, Enter in Notiz speichert.',
  ]},
  verlauf: { title:'Verlauf', items:[
    'Alle Buchungen chronologisch — filterbar nach Monat, Quartal, Jahr oder frei.',
    'Tabs: Alle / Ausgaben / Einnahmen / Gruppen.',
    'Tippe auf eine Buchung zum Bearbeiten oder Löschen.',
    'Kategoriename antippen öffnet die gefilterte Kategorieansicht.',
    'Lupe oben rechts filtert nach Beschreibung oder Notiz.',
  ]},
  kategorien: { title:'Kategorien', items:[
    'Eigene Ausgaben- und Einnahme-Kategorien mit Name und Farbe anlegen.',
    'Oberkategorien gruppieren verwandte Kategorien (z.B. «Wohnen» → Miete, Strom).',
    'Farbe per Farbpicker oder HEX-Eingabe anpassen.',
    'Kategorien werden sofort im Google Sheet gespeichert.',
  ]},
  lohn: { title:'Lohn & Einnahmen', items:[
    '«Lohnzyklus»: Einnahmen und Ausgaben seit dem letzten Lohneingang.',
    '«Abos & Fixkosten»: Daueraufträge verwalten — Betrag, Intervall, Tag.',
    'Lohndatum in Einstellungen → Profil festlegen.',
    'Fixkosten erscheinen immer im Fixkostenblock, unabhängig vom Datum.',
  ]},
  dashboard: { title:'Jahresübersicht', items:[
    'Monatsbalken zeigen Einnahmen vs. Ausgaben für das ganze Jahr.',
    'Kategorien-Donut für den gewählten Monat oder das Gesamtjahr.',
    'Jahres-Sparquote basiert auf allen Einnahmen und Ausgaben.',
    'Pfeil links/rechts oder Jahresauswahl zum Wechseln.',
  ]},
  monat: { title:'Monatsübersicht', items:[
    'Detaillierte Aufschlüsselung eines einzelnen Monats.',
    'Donut-Chart nach Kategorien, Balken für Einnahmen/Ausgaben.',
    'Buchungsliste gefiltert nach Monat — tippe zum Bearbeiten.',
    'Monat per Pfeil oder Monatsauswahl wechseln.',
  ]},
  sparen: { title:'Sparen & Planen', items:[
    'Sparziele mit Name und Zielbetrag anlegen — Fortschritt per Balken.',
    'Monatliches Sparziel in Einstellungen festlegen.',
    'Sparquote fliesst ins Home-Dashboard ein.',
  ]},
  aktien: { title:'Aktien', items:[
    'Portfolio mit aktuellem Kurs via GOOGLEFINANCE (braucht Google Sheet).',
    '«+ Aktie» anlegen: Ticker (z.B. AAPL, VTX:NESN), Anzahl, Kaufpreis.',
    'Käufe und Verkäufe einzeln erfassen für genaue Kostenbasis.',
    '↻-Button lädt aktuelle Kurse via Google Sheet.',
    'In Einstellungen: Depot in die Jahres-Sparrate einberechnen.',
  ]},
  groups: { title:'Gruppen & Events', items:[
    '«Event»: Alle Kosten sammeln — ideal für Reisen und gemeinsame Ausflüge.',
    '«Split»: Die App berechnet, wer wem wie viel schuldet.',
    'Einladen per Link oder Code — Mitglieder sehen alle Buchungen.',
    'Buchungen im persönlichen Verlauf einblenden: Toggle in der Gruppenansicht.',
    'Gruppenname als Admin änderbar (Stift-Icon oben rechts).',
  ]},
  einstellungen: { title:'Einstellungen', items:[
    '«Verbindung»: Google Apps Script URL eingeben und testen.',
    '«Profil»: Anzeigename und Lohntag festlegen.',
    '«Darstellung»: Währung, Dark/Light Mode, Glassmorphism-Effekte.',
    '«Navigation»: Tabs per Mehr-Menü an die Taskleiste anheften.',
    '«Export»: Alle Buchungen als Excel-Datei herunterladen.',
  ]},
  admin: { title:'Admin-Panel', items:[
    'Script-URL verwalten und an alle Nutzer verteilen.',
    'Ausstehende Registrierungen genehmigen oder ablehnen.',
    'Benutzerliste einsehen und Rollen verwalten.',
  ]},
};

function showTabHelp(){
  const help = _TAB_HELP[currentTab];
  if(!help) return;
  document.getElementById('tab-help-title').textContent = help.title;
  document.getElementById('tab-help-list').innerHTML =
    help.items.map(t=>`<li class="tab-help-item">${t}</li>`).join('');
  openModal('tab-help-modal');
}
