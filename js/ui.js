// ═══════════════════════════════════════════════════════════════
// MODULE: UI HELPERS
// ═══════════════════════════════════════════════════════════════
let currentTab = 'home';

function goTab(tab){
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
  document.querySelectorAll('.tab-page').forEach(p=>p.style.display='none');
  const tabEl = document.getElementById('tab-'+tab);
  if(tabEl){
    tabEl.style.display='block';
    tabEl.classList.remove('animating');
    void tabEl.offsetWidth; // force reflow
    tabEl.classList.add('animating');
  }
  // Nav active state: home (fixed) + pinned slots + mehr
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  if(tab==='home'){ document.getElementById('nav-dashboard')?.classList.add('active'); }
  else {
    const pinned = CFG.pinnedTabs||[];
    if(pinned[0]===tab) document.getElementById('nav-slot1-btn')?.classList.add('active');
    else if(pinned[1]===tab) document.getElementById('nav-slot2-btn')?.classList.add('active');
    else if(pinned[2]===tab) document.getElementById('nav-slot3-btn')?.classList.add('active');
  }
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
    dauerauftraege:'Daueraufträge', dashboard:'Jahresübersicht', lohn:'Lohn & Einnahmen',
    aktien:'Aktien', monat:'Monatsübersicht', sparen:'Sparen & Planen',
    groups:'Gruppen & Events', einstellungen:'Einstellungen', admin:'Admin'
  }[tab]||tab;
  updatePageSub();
  if(tab==='home') renderHome();
  if(tab==='verlauf') renderVerlauf();
  if(tab==='dashboard') renderDashboard();
  if(tab==='lohn') renderLohn();
  if(tab==='aktien') renderAktien();
  if(tab==='einstellungen') renderNotifSettings();
  if(tab==='monat'){ mvYear=new Date().getFullYear(); mvMonth=new Date().getMonth(); renderMonat(); }
  if(tab==='sparen') renderSparen();
  if(tab==='einstellungen') renderEinstellungen();
  if(tab==='groups'){ renderGroups(); fillGroupDropdown(); }
  if(tab==='admin') renderAdmin();
}

let menuEditMode = false;
function openMenuOverlay(){ menuEditMode=false; renderMenuOverlay(); document.getElementById('menu-overlay').classList.add('open'); Device.pushNav('menu','menu-overlay'); }
function closeMenuOverlay(){ document.getElementById('menu-overlay').classList.remove('open'); }
function toggleMenuEditMode(){ menuEditMode=!menuEditMode; renderMenuOverlay(); }

// ── FAB Speed-Dial stubs (kept for backward-compat) ──────────────────────────
function openFabMenu(){ goTab('eingabe'); }
function closeFabMenu(){}

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
  { key:'dauerauftraege', label:'Daueraufträge / Abos', icon:'<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.08-4.36"/>' },
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

function checkDueRecurrings(){
  const todayStr = today();
  if(!CFG.notifications) CFG.notifications = [];
  const now = new Date();
  const todayDay = now.getDate();

  DATA.recurring.filter(r=>r.active).forEach(r=>{
    // Informational notification on execution day (booking happens automatically)
    if(r.day === todayDay){
      const notifId = `rec-${r.id}-${todayStr}`;
      const exists = CFG.notifications.find(n=>n.id===notifId);
      if(!exists){
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

const NOTIF_TYPES = [
  { key:'dailyReport',   label:'Tagesreport',           sub:'Ausgaben-Zusammenfassung des heutigen Tages', def:true },
  { key:'overspend',     label:'Überbudget-Warnung',     sub:'Wenn Lohnzyklus-Budget überschritten wird', def:true },
  { key:'monthEnd',      label:'Monatsabschluss',        sub:'Rapport am ersten des Monats', def:true },
  { key:'cycleStart',    label:'Lohnzyklus gestartet',   sub:'Bei erkanntem Lohneingang im Zyklus', def:true },
  { key:'budgetWarning', label:'Budget 80% erreicht',    sub:'Frühwarnung im laufenden Lohnzyklus', def:true },
  { key:'bigExpense',    label:'Grosse Ausgabe',         sub:'Bei Einzelbuchung über CHF 200', def:false },
  { key:'weeklyReport',  label:'Wochenrückblick',        sub:'Zusammenfassung jeden Sonntag', def:false },
];

function notifOn(key){ const ns=CFG.notifSettings||{}; const t=NOTIF_TYPES.find(x=>x.key===key); return ns[key]===undefined ? (t?t.def:true) : ns[key]; }

function checkAllNotifications(){
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
}

function toggleNotifSetting(key){
  if(!CFG.notifSettings) CFG.notifSettings={};
  CFG.notifSettings[key] = !notifOn(key);
  cfgSave(); renderNotifSettings();
}

function updateNotifBadge(){
  const badge = document.getElementById('notif-badge');
  if(!badge) return;
  const pending = (CFG.notifications||[]).filter(n=>!n.dismissed&&(!n.confirmed||n.type==='dauerauftrag_info')).length;
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

  body.innerHTML = notifs.map(n=>{
    // Icon varies by type
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
  }).join('');
}

function dismissNotif(id){
  const n = (CFG.notifications||[]).find(n=>n.id===id);
  if(n){ n.dismissed=true; cfgSave(); }
  renderNotifications();
  updateNotifBadge();
}

function openNotifDetail(id){
  const n = (CFG.notifications||[]).find(n=>n.id===id);
  if(!n) return;
  if(n.type==='group_activity'){
    // Navigate to group detail
    dismissNotif(id);
    if(n.groupId){
      goTab('groups');
      setTimeout(()=>openGroupDetail(n.groupId), 100);
    }
  } else if(n.type==='dauerauftrag_info'){
    dismissNotif(id);
    toast(`${n.title} — ${n.body}`,'ok');
  } else if(n.type==='dauerauftrag'){
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

function renderLohn(){
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
    zSec.innerHTML = `
    <div class="section pt-0">
      <div class="section-title">Lohnzyklus</div>
      <div class="zy-card">
        <div class="zy-header">
          <div class="zy-title">${z.start.getDate()}. ${mNames[z.start.getMonth()]} – ${z.end.getDate()}. ${mNames[z.end.getMonth()]} ${z.end.getFullYear()}</div>
          <div class="zy-period">${z.daysElapsed} / ${z.cycleDays} Tage</div>
        </div>
        <div class="zy-body">
          ${z.hasSalary ? `
          <div class="zy-row"><span class="zy-row-label">Lohn</span><span class="zy-row-val" style="color:var(--green)">+ ${curr()} ${fmtAmt(z.lohn)}</span></div>
          ${z.fixKosten>0?`<div class="zy-row"><span class="zy-row-label">Fixkosten</span><span class="zy-row-val t-text2">− ${curr()} ${fmtAmt(z.fixKosten)}</span></div>`:''}
          ${z.prevCarryover!==0?`<div class="zy-row"><span class="zy-row-label">Übertrag Vorperiode</span><span class="zy-row-val" style="color:${z.prevCarryover>=0?'var(--green)':'var(--red)'}">${z.prevCarryover>=0?'+ ':'− '}${curr()} ${fmtAmt(Math.abs(z.prevCarryover))}</span></div>`:''}
          ${z.mSparziel>0?`<div class="zy-row"><span class="zy-row-label">Sparziel</span><span class="zy-row-val t-accent">− ${curr()} ${fmtAmt(z.mSparziel)}</span></div>`:''}
          <div class="zy-divider"></div>
          <div class="zy-row bold"><span class="zy-row-label">Frei verfügbar</span><span class="zy-row-val">${z.varBudget>=0?'':'− '}${curr()} ${fmtAmt(Math.abs(z.varBudget))}</span></div>
          <div class="zy-row"><span class="zy-row-label">Ausgegeben (variabel)</span><span class="zy-row-val t-red">− ${curr()} ${fmtAmt(z.varSpent)}</span></div>
          <div class="zy-row bold"><span class="zy-row-label">Verbleibend</span><span class="zy-row-val" style="color:${z.varRemaining>=0?'var(--green)':'var(--red)'}">${curr()} ${fmtAmt(z.varRemaining)}</span></div>
          <div class="zy-prog-wrap"><div class="zy-prog-fill" style="width:${budgetPct.toFixed(1)}%;background:${progColor}"></div></div>
          <div class="zy-prog-labels"><span>${budgetPct.toFixed(0)}% des Budgets verbraucht</span><span>${z.daysLeft} Tage verbleibend</span></div>
          ${z.dailyRate!==null?`
          <div class="zy-rate-wrap">
            <div style="display:flex;align-items:baseline;gap:8px">
              <span class="zy-rate" style="color:${rateColor}">${curr()} ${fmtAmt(Math.abs(z.dailyRate))}</span>
              <span style="font-size:13px;color:var(--text2)">/ Tag ${z.dailyRate>=0?'verfügbar':'überzogen'}</span>
            </div>
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

function fillDropdown(elId, type, selected=''){
  const el = document.getElementById(elId);
  if(!el) return;
  const cats = DATA.categories.filter(c=>c.type===type&&c.id!=='DELETED'&&c.name!=='DELETED');
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

function openModal(id){ document.getElementById(id).classList.add('show'); Device.pushNav('modal', id); }
function closeModal(id){ document.getElementById(id).classList.remove('show'); }

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay=>{
  overlay.addEventListener('click', e=>{ if(e.target===overlay) overlay.classList.remove('show'); });
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
  const el=document.getElementById('toast');
  el.textContent=msg; el.className='toast show '+(type||'');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.classList.remove('show'),2800);
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

// ═══════════════════════════════════════════════════════════════
// MODULE: ACCOUNT AUTH
// ═══════════════════════════════════════════════════════════════

async function sha256(msg){
  const buf = new TextEncoder().encode(msg);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

function togglePwVis(inputId, btn){
  const inp = document.getElementById(inputId);
  if(!inp) return;
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  btn.querySelector('svg').innerHTML = show
    ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>'
    : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
}

async function doAuthLogin(){
  const user = (document.getElementById('auth-user').value||'').trim().toLowerCase();
  const pw   = (document.getElementById('auth-pw').value)||'';
  const errEl = document.getElementById('sp2-error');
  const showErr = msg => { errEl.textContent=msg; errEl.classList.add('vis'); };
  errEl.classList.remove('vis');

  if(!user||!pw){ showErr('Benutzername und Passwort eingeben'); return; }

  const adminUrlInput = (document.getElementById('auth-admin-url').value||'').trim();
  const adminUrl = adminUrlInput || CFG.adminUrl;
  if(!adminUrl){ showErr('Admin-Script-URL fehlt → ⚙ Admin-URL konfigurieren'); return; }

  const btn = document.getElementById('auth-login-btn');
  btn.classList.add('loading'); btn.disabled=true; btn.textContent='Anmelden…';
  try{
    const hash = await sha256(pw);
    const r = await fetch(adminUrl+'?'+new URLSearchParams({action:'login',user,hash}));
    const d = await r.json();
    if(d.error) throw new Error(d.error);
    CFG.adminUrl=adminUrl; CFG.sessionToken=d.token; CFG.authUser=d.username; CFG.authRole=d.role||'user';
    CFG.scriptUrl=''; CFG.demo=false;
    cfgSave();
    launchApp();
  }catch(e){
    showErr(e.message||'Verbindung fehlgeschlagen');
    btn.classList.remove('loading'); btn.disabled=false; btn.textContent='Anmelden →';
  }
}

async function doAuthSignup(){
  const user  = (document.getElementById('su-user').value||'').trim().toLowerCase();
  const pw    = (document.getElementById('su-pw').value)||'';
  const pw2   = (document.getElementById('su-pw2').value)||'';
  const adminUrl = (document.getElementById('su-admin-url').value||'').trim() || CFG.adminUrl;
  const errEl = document.getElementById('sp3-error');
  const showErr = msg => { errEl.textContent=msg; errEl.classList.add('vis'); };
  errEl.classList.remove('vis');

  if(!user||!pw||!pw2){ showErr('Alle Felder ausfüllen'); return; }
  if(pw!==pw2){ showErr('Passwörter stimmen nicht überein'); return; }
  if(pw.length<6){ showErr('Passwort: mind. 6 Zeichen'); return; }
  if(!adminUrl){ showErr('Admin-Script-URL eintragen'); return; }

  const btn = document.getElementById('auth-signup-btn');
  btn.classList.add('loading'); btn.disabled=true; btn.textContent='Konto wird erstellt…';
  try{
    const hash = await sha256(pw);
    const r = await fetch(adminUrl+'?'+new URLSearchParams({action:'signup',user,hash}));
    const d = await r.json();
    if(d.error) throw new Error(d.error);
    CFG.adminUrl=adminUrl; CFG.sessionToken=d.token; CFG.authUser=d.username; CFG.authRole=d.role||'user';
    CFG.scriptUrl=''; CFG.demo=false;
    cfgSave();
    toast('✓ Willkommen, '+d.username+'!','ok');
    launchApp();
  }catch(e){
    showErr(e.message||'Verbindung fehlgeschlagen');
    btn.classList.remove('loading'); btn.disabled=false; btn.textContent='Konto erstellen →';
  }
}

async function doChangePw(){
  const newPw = (document.getElementById('settings-new-pw').value||'').trim();
  if(newPw.length<6){ toast('Passwort: min. 6 Zeichen','err'); return; }
  if(!confirm('Passwort wirklich ändern?')) return;
  try{
    const newHash = await sha256(newPw);
    // Use admin_reset_pw on own account (admin) or a dedicated self-reset endpoint
    const r = await fetch(CFG.adminUrl+'?'+new URLSearchParams({action:'change_pw',token:CFG.sessionToken,newHash}));
    const d = await r.json();
    if(d.error) throw new Error(d.error);
    document.getElementById('settings-new-pw').value='';
    toast('✓ Passwort geändert','ok');
  }catch(e){ toast('Fehler: '+e.message,'err'); }
}

// ═══════════════════════════════════════════════════════════════
// GROUPS & EVENTS — UI
// ═══════════════════════════════════════════════════════════════

let groupFilter = 'all';
let currentGroupId = null;

function renderGroups(){
  const grid = document.getElementById('groups-grid');
  if(!grid) return;
  const myId = _myGroupId();
  const myNm = _myGroupName();
  let groups = DATA.groups.filter(g=>g.status!=='deleted' && (g.members.includes(myId) || g.members.includes(myNm)));

  if(groupFilter==='archived') groups = groups.filter(g=>g.status==='archived');
  else if(groupFilter==='all') groups = groups.filter(g=>g.status==='active');
  else groups = groups.filter(g=>g.status==='active'&&g.type===groupFilter);

  if(!groups.length){
    grid.innerHTML = '<div class="t-muted" style="text-align:center;padding:30px 0">Keine Gruppen vorhanden.</div>';
    return;
  }

  grid.innerHTML = groups.map(g=>{
    const total = getGroupTotal(g.id);
    const expenses = getGroupExpenses(g.id);
    const dates = expenses.map(e=>e.date).sort();
    const dateRange = dates.length ? fmtDate(dates[0])+' – '+fmtDate(dates[dates.length-1]) : 'Noch keine Buchungen';

    if(g.type==='split'){
      const balances = calcSplitBalances(g.id);
      const _myId = _myGroupId();
      const _myNm = _myGroupName();
      const myBal = balances[_myId]||balances[_myNm]||0;
      const balClass = myBal>0.01?'grp-bal-pos':myBal<-0.01?'grp-bal-neg':'grp-bal-zero';
      const balText = myBal>0.01?'Du bekommst '+fmtAmt(myBal):myBal<-0.01?'Du schuldest '+fmtAmt(Math.abs(myBal)):'Ausgeglichen';
      return `<div class="grp-card grp-card-split" onclick="openGroupDetail('${g.id}')">
        <div class="grp-card-type">Split</div>
        <div class="grp-card-name">${esc(g.name)}</div>
        <div class="grp-card-members">${g.members.length} Teilnehmer</div>
        <div class="grp-card-total">${fmtAmt(total)}</div>
        <div class="grp-card-bal ${balClass}">${balText}</div>
      </div>`;
    } else {
      return `<div class="grp-card grp-card-event" onclick="openGroupDetail('${g.id}')">
        <div class="grp-card-type">Event</div>
        <div class="grp-card-name">${esc(g.name)}</div>
        <div class="grp-card-meta">${dateRange}</div>
        <div class="grp-card-total">${fmtAmt(total)}</div>
        <div class="grp-card-count">${expenses.length} Buchungen</div>
      </div>`;
    }
  }).join('');
}

function setGroupFilter(f){
  groupFilter = f;
  document.querySelectorAll('.grp-filter-btn').forEach(b=>b.classList.toggle('active',b.dataset.filter===f));
  renderGroups();
}

function openGroupDetail(id){
  const g = DATA.groups.find(x=>x.id===id);
  if(!g) return;
  currentGroupId = id;
  document.getElementById('groups-main').style.display='none';
  const detail = document.getElementById('group-detail');
  detail.style.display='block';

  if(g.type==='event') _renderEventDetail(g, detail);
  else _renderSplitDetail(g, detail);
}

function closeGroupDetail(){
  document.getElementById('groups-main').style.display='';
  document.getElementById('group-detail').style.display='none';
  currentGroupId = null;
  renderGroups();
}

function _renderEventDetail(g, el){
  const expenses = getGroupExpenses(g.id);
  const total = expenses.reduce((s,e)=>s+e.amt,0);
  const topCats = getGroupTopCategories(g.id);
  const isAdmin = isGroupAdmin(g);

  let html = `<div class="grp-detail-header">
    <button class="grp-detail-back" onclick="closeGroupDetail()">
      <svg viewBox="0 0 24 24" style="width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
    <div>
      <div class="grp-detail-title">${esc(g.name)}</div>
      <div class="grp-detail-sub">Event · ${fmtAmt(total)} total${g.adminId?' · Admin: '+esc(g.adminId):''}</div>
    </div>
    <div class="grp-detail-actions">
      ${isAdmin && g.status==='active'?`<button onclick="archiveGroup('${g.id}')" class="grp-action-btn" title="Archivieren">
        <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
      </button>`:''}
      ${isAdmin?`<button onclick="deleteGroup('${g.id}')" class="grp-action-btn grp-action-del" title="Löschen">
        <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>`:''}
      ${!isAdmin?`<button onclick="leaveGroup('${g.id}')" class="grp-action-btn" title="Gruppe verlassen" style="color:var(--text2)">
        <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </button>`:''}
    </div>
  </div>`;

  // Invite link section
  if(g.status==='active'){
    html += `<div class="grp-invite-section">
      <button class="grp-invite-btn" onclick="copyGroupInviteLink('${g.id}')">
        <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        Einladungslink kopieren
      </button>
      ${isAdmin?`<button class="grp-invite-regen" onclick="regenerateInviteCode('${g.id}')" title="Neuen Code generieren">
        <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.08-4.36"/></svg>
      </button>`:''}
    </div>`;
  }

  // Verlauf integration toggle
  const gvOn = !!(CFG.groupVerlauf||{})[g.id];
  html += `<div class="grp-verlauf-toggle-row">
    <div class="grp-verlauf-toggle-info">
      <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;flex-shrink:0"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      <div>
        <div style="font-size:13px;font-weight:600">Im Verlauf anzeigen</div>
        <div style="font-size:11px;color:var(--text3)">Dein Anteil erscheint als Schatten-Buchung</div>
      </div>
    </div>
    <div class="toggle-switch ${gvOn?'on':''}" onclick="toggleGroupVerlauf('${g.id}')"></div>
  </div>`;

  // Top categories
  if(topCats.length){
    html += '<div class="grp-section-title">Top Kategorien</div><div class="grp-top-cats">';
    topCats.forEach(c=>{
      const pct = total>0 ? Math.round(c.total/total*100) : 0;
      html += `<div class="grp-cat-row">
        <span class="grp-cat-dot" style="background:${catColor(c.name)}"></span>
        <span class="grp-cat-name">${esc(c.name)}</span>
        <span class="grp-cat-bar"><span style="width:${pct}%;background:${catColor(c.name)}"></span></span>
        <span class="grp-cat-amt">${fmtAmt(c.total)}</span>
      </div>`;
    });
    html += '</div>';
  }

  // Transactions (own + foreign) — with delete button for own entries
  const myId = _myGroupId();
  const myName = _myGroupName();
  const foreignEntries = (DATA.groupEntries||[]).filter(e=>e.groupId===g.id && !e.isMine);
  const allTx = [
    ...expenses.map(e=>({...e, _author:'', _isOwn:true, _source:'local'})),
    ...foreignEntries.map(e=>({...e, _author:e.authorName, _isOwn:false, _source:'group'}))
  ].sort((a,b)=>b.date.localeCompare(a.date));

  // Also include own entries from groupEntries (for entries saved to group tab)
  const ownGroupEntries = (DATA.groupEntries||[]).filter(e=>e.groupId===g.id && e.isMine);
  const localIds = new Set(expenses.map(e=>e.id));
  ownGroupEntries.forEach(e=>{
    if(!localIds.has(e.id)){
      allTx.push({...e, _author:'', _isOwn:true, _source:'group'});
    }
  });
  allTx.sort((a,b)=>b.date.localeCompare(a.date));

  html += '<div class="grp-section-title">Buchungen</div><div class="grp-tx-list">';
  if(!allTx.length) html += '<div class="t-muted">Noch keine Buchungen.</div>';
  allTx.forEach(e=>{
    const authorTag = e._author ? ` · ${esc(e._author)}` : '';
    const canDelete = e._isOwn || isAdmin;
    const isSettlement = e.splitData && e.splitData.isSettlement;
    const editedTag = e.editedAt ? ' · bearbeitet' : '';
    html += `<div class="grp-tx-row${e._author?' group-foreign-entry':''}">
      <div class="grp-tx-left">
        <div class="grp-tx-what">${esc(e.what)}</div>
        <div class="grp-tx-meta">${fmtDate(e.date)} · ${esc(e.cat)}${authorTag}${editedTag}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <div class="grp-tx-amt">${fmtAmt(e.amt)}</div>
        ${canDelete && !isSettlement && e._source==='group' ? `<button class="grp-entry-del-btn" onclick="event.stopPropagation();deleteGroupEntry('${e.id}','${g.id}')" title="Löschen">✕</button>` : ''}
      </div>
    </div>`;
  });
  html += '</div>';

  // Export button
  html += `<div style="padding:16px"><button class="save-btn" onclick="exportGroupReport('${g.id}')" style="width:100%">Reisebericht exportieren</button></div>`;

  el.innerHTML = html;
}

function _renderSplitDetail(g, el){
  const expenses = getGroupExpenses(g.id);
  const total = expenses.reduce((s,e)=>s+e.amt,0);
  const balances = calcSplitBalances(g.id);
  const settlements = calcSettlements(g.id);
  const isAdmin = isGroupAdmin(g);

  let html = `<div class="grp-detail-header">
    <button class="grp-detail-back" onclick="closeGroupDetail()">
      <svg viewBox="0 0 24 24" style="width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
    <div>
      <div class="grp-detail-title">${esc(g.name)}</div>
      <div class="grp-detail-sub">Split · ${g.members.length} Teilnehmer${g.adminId?' · Admin: '+esc(g.adminId):''}</div>
    </div>
    <div class="grp-detail-actions">
      ${isAdmin && g.status==='active'?`<button onclick="archiveGroup('${g.id}')" class="grp-action-btn" title="Archivieren">
        <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
      </button>`:''}
      ${isAdmin?`<button onclick="deleteGroup('${g.id}')" class="grp-action-btn grp-action-del" title="Löschen">
        <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>`:''}
      ${!isAdmin?`<button onclick="leaveGroup('${g.id}')" class="grp-action-btn" title="Gruppe verlassen" style="color:var(--text2)">
        <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </button>`:''}
    </div>
  </div>`;

  // Invite link section
  if(g.status==='active'){
    html += `<div class="grp-invite-section">
      <button class="grp-invite-btn" onclick="copyGroupInviteLink('${g.id}')">
        <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        Einladungslink kopieren
      </button>
      ${isAdmin?`<button class="grp-invite-regen" onclick="regenerateInviteCode('${g.id}')" title="Neuen Code generieren">
        <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.08-4.36"/></svg>
      </button>`:''}
    </div>`;
  }

  // Verlauf integration toggle
  const gvOn = !!(CFG.groupVerlauf||{})[g.id];
  html += `<div class="grp-verlauf-toggle-row">
    <div class="grp-verlauf-toggle-info">
      <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;flex-shrink:0"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      <div>
        <div style="font-size:13px;font-weight:600">Im Verlauf anzeigen</div>
        <div style="font-size:11px;color:var(--text3)">Dein Anteil erscheint als Schatten-Buchung</div>
      </div>
    </div>
    <div class="toggle-switch ${gvOn?'on':''}" onclick="toggleGroupVerlauf('${g.id}')"></div>
  </div>`;

  // Members section with admin controls
  html += '<div class="grp-section-title">Mitglieder</div><div class="grp-members-list">';
  g.members.forEach(m=>{
    const isAdminMember = m===g.adminId;
    html += `<div class="grp-member-row">
      <span class="grp-member-name">${esc(m)}${isAdminMember?' <span class="grp-admin-badge">Admin</span>':''}</span>
      ${isAdmin && !isAdminMember?`<button class="grp-member-remove" onclick="removeGroupMember('${g.id}','${esc(m)}')" title="Entfernen">✕</button>`:''}
    </div>`;
  });
  html += '</div>';

  // Balances matrix
  html += '<div class="grp-section-title">Salden</div><div class="grp-balances">';
  for(const [member, bal] of Object.entries(balances)){
    const cls = bal>0.01?'grp-bal-pos':bal<-0.01?'grp-bal-neg':'grp-bal-zero';
    const label = bal>0.01?'bekommt '+fmtAmt(bal):bal<-0.01?'schuldet '+fmtAmt(Math.abs(bal)):'ausgeglichen';
    html += `<div class="grp-balance-row ${cls}">
      <span class="grp-balance-name">${esc(member)}</span>
      <span class="grp-balance-val">${label}</span>
    </div>`;
  }
  html += '</div>';

  // Settlements — using calculateGroupBalances for combined local+foreign entries
  const debts = calculateGroupBalances(g.id);
  const splitMyId = _myGroupId();
  const splitMyName = _myGroupName();
  if(debts.length && g.status==='active'){
    html += '<div class="grp-section-title">Abrechnung</div><div class="grp-settlements">';
    debts.forEach(debt=>{
      const isMe = debt.from===splitMyId || debt.from===splitMyName;
      html += `<div class="debt-row${isMe?' debt-mine':''}">
        <div class="debt-info">
          <span class="debt-from">${esc(debt.from)}</span>
          <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:var(--text3);fill:none;stroke-width:2;flex-shrink:0"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          <span class="debt-to">${esc(debt.to)}</span>
        </div>
        <div class="debt-right">
          <span class="debt-amt">${curr()} ${fmtAmt(debt.amount)}</span>
          ${isMe?`<button class="btn-settle" onclick="confirmSettleUp('${g.id}','${esc(debt.from)}','${esc(debt.to)}',${debt.amount})">Begleichen</button>`:''}
        </div>
      </div>`;
    });
    html += '</div>';
  } else if(!debts.length && Object.keys(balances).length){
    html += '<div class="grp-section-title">Abrechnung</div><div style="padding:8px 16px;font-size:13px;color:var(--green);font-weight:600">Alles beglichen</div>';
  }

  // Transactions (own + foreign) — with delete button for own entries
  const foreignTx = (DATA.groupEntries||[]).filter(e=>e.groupId===g.id && !e.isMine);
  const allSplitTx = [
    ...expenses.map(e=>({...e, _author:'', _isOwn:true, _source:'local'})),
    ...foreignTx.map(e=>({...e, _author:e.authorName, _isOwn:false, _source:'group'}))
  ];

  // Include own entries from groupEntries that aren't in local expenses
  const ownGE = (DATA.groupEntries||[]).filter(e=>e.groupId===g.id && e.isMine);
  const localExpIds = new Set(expenses.map(e=>e.id));
  ownGE.forEach(e=>{
    if(!localExpIds.has(e.id)){
      allSplitTx.push({...e, _author:'', _isOwn:true, _source:'group'});
    }
  });
  allSplitTx.sort((a,b)=>b.date.localeCompare(a.date));

  html += '<div class="grp-section-title">Buchungen</div><div class="grp-tx-list">';
  if(!allSplitTx.length) html += '<div class="t-muted">Noch keine Buchungen.</div>';
  allSplitTx.forEach(e=>{
    const sd = e.splitData;
    const payer = sd ? (typeof sd==='string'?JSON.parse(sd):sd).payerId : '';
    const authorTag = e._author ? ` · ${esc(e._author)}` : '';
    const canDelete = e._isOwn || isAdmin;
    const isSettlement = sd && sd.isSettlement;
    const editedTag = e.editedAt ? ' · bearbeitet' : '';
    html += `<div class="grp-tx-row${e._author?' group-foreign-entry':''}">
      <div class="grp-tx-left">
        <div class="grp-tx-what">${esc(e.what)}</div>
        <div class="grp-tx-meta">${fmtDate(e.date)}${payer?' · bezahlt von '+esc(payer):''}${authorTag}${editedTag}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <div class="grp-tx-amt">${fmtAmt(e.amt)}</div>
        ${canDelete && !isSettlement && e._source==='group' ? `<button class="grp-entry-del-btn" onclick="event.stopPropagation();deleteGroupEntry('${e.id}','${g.id}')" title="Löschen">✕</button>` : ''}
      </div>
    </div>`;
  });
  html += '</div>';

  el.innerHTML = html;
}

// New Group Modal
function openNewGroupModal(){
  const body = `
    <div class="form-group">
      <label class="form-label">Name</label>
      <input id="grp-name" class="form-input" type="text" placeholder="z.B. Malta Urlaub 2026">
    </div>
    <div class="form-group">
      <label class="form-label">Typ</label>
      <select id="grp-type" class="form-select" onchange="onGrpTypeChange()">
        <option value="event">Event / Reise</option>
        <option value="split">Geteilte Kosten</option>
      </select>
    </div>
    <div id="grp-members-wrap">
      <label class="form-label">Teilnehmer <span class="t-text3">(kommagetrennt)</span></label>
      <input id="grp-members" class="form-input" type="text" placeholder="${esc(_myGroupId()||'Ich')}, Max, Anna" value="${esc(_myGroupId()||'Ich')}">
    </div>
    <div class="form-group">
      <label class="form-label">Währung</label>
      <input id="grp-currency" class="form-input" type="text" value="${esc(CFG.currency||'CHF')}" maxlength="5">
    </div>`;
  const actions = `<button class="save-btn" onclick="confirmNewGroup()" style="width:100%">Gruppe erstellen</button>`;
  openGenericModal('Neue Gruppe', body, actions);
}

function onGrpTypeChange(){
  const type = document.getElementById('grp-type')?.value;
  const wrap = document.getElementById('grp-members-wrap');
  if(wrap) wrap.style.display = type==='event'?'none':'';
}

async function confirmNewGroup(){
  const name = document.getElementById('grp-name')?.value.trim();
  const type = document.getElementById('grp-type')?.value||'event';
  const membersRaw = document.getElementById('grp-members')?.value||CFG.userName||'Ich';
  const currency = document.getElementById('grp-currency')?.value.trim()||CFG.currency||'CHF';
  if(!name){ toast('Name erforderlich','err'); return; }
  const members = type==='event'
    ? [_myGroupId()||'Ich']
    : membersRaw.split(',').map(s=>s.trim()).filter(Boolean);
  if(type==='split' && members.length<2){ toast('Mind. 2 Teilnehmer für Split','err'); return; }
  const group = await saveGroup(name, type, members, currency);
  if(!group) return;
  closeGenericModal();
  toast('✓ Gruppe erstellt','ok');
  renderGroups();
}

// Group dropdown in entry form
function fillGroupDropdown(){
  const sel = document.getElementById('f-group');
  if(!sel) return;
  const myId = _myGroupId();
  const myName = _myGroupName();
  const activeGroups = DATA.groups.filter(g=>g.status==='active' && (g.members.includes(myId) || g.members.includes(myName)));
  sel.innerHTML = '<option value="">— Keine Gruppe —</option>' +
    activeGroups.map(g=>`<option value="${g.id}">${esc(g.name)} (${g.type==='split'?'Split':'Event'})</option>`).join('');
}

function onGroupSelect(groupId){
  const sec = document.getElementById('f-split-section');
  if(!groupId || !sec){ if(sec) sec.style.display='none'; return; }
  const group = DATA.groups.find(g=>g.id===groupId);
  if(!group){ sec.style.display='none'; return; }
  if(group.type==='split'){
    sec.style.display='';
    // Fill payer dropdown
    const payerSel = document.getElementById('f-split-payer');
    const myPayerId = _myGroupId();
    if(payerSel) payerSel.innerHTML = group.members.map(m=>`<option value="${esc(m)}"${m===myPayerId?' selected':''}>${esc(m)}</option>`).join('');
    document.getElementById('f-split-mode').value='equal';
    _renderSplitShares(group);
  } else {
    sec.style.display='none';
  }
}

function onSplitModeChange(){
  const groupId = document.getElementById('f-group')?.value;
  const group = groupId ? DATA.groups.find(g=>g.id===groupId) : null;
  if(group) _renderSplitShares(group);
}

function _renderSplitShares(group){
  const container = document.getElementById('f-split-shares');
  if(!container) return;
  const mode = document.getElementById('f-split-mode')?.value||'equal';
  if(mode==='equal'){
    container.innerHTML = `<div class="t-muted" style="font-size:12px;padding:6px 0">Gleichmässig auf ${group.members.length} Personen aufgeteilt</div>`;
  } else {
    container.innerHTML = group.members.map(m=>`<div class="form-row" style="margin-bottom:6px">
      <label class="form-label" style="flex:1;font-size:13px;margin:0;line-height:36px">${esc(m)}</label>
      <input id="f-split-share-${CSS.escape(m)}" class="form-input" type="number" step="0.01" min="0" style="width:100px;text-align:right" placeholder="0.00">
    </div>`).join('');
  }
}

// copyGroupInviteLink() moved to js/groups.js

// Export group report as text
function exportGroupReport(groupId){
  const g = DATA.groups.find(x=>x.id===groupId);
  if(!g) return;
  const expenses = getGroupExpenses(groupId).sort((a,b)=>a.date.localeCompare(b.date));
  const total = expenses.reduce((s,e)=>s+e.amt,0);
  let text = `Reisebericht: ${g.name}\n${'='.repeat(40)}\n\n`;
  text += `Typ: ${g.type==='event'?'Event/Reise':'Split'}\n`;
  text += `Währung: ${g.currency}\nGesamt: ${fmtAmt(total)}\n\n`;
  text += `Buchungen:\n${'-'.repeat(40)}\n`;
  expenses.forEach(e=>{
    text += `${e.date}  ${e.what.padEnd(20)} ${fmtAmt(e.amt).padStart(10)}  ${e.cat}\n`;
  });

  // Top categories
  const cats = getGroupTopCategories(groupId, 10);
  if(cats.length){
    text += `\nKategorien:\n${'-'.repeat(40)}\n`;
    cats.forEach(c=>{ text += `${c.name.padEnd(20)} ${fmtAmt(c.total).padStart(10)}\n`; });
  }

  const blob = new Blob([text], {type:'text/plain'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = g.name.replace(/[^a-zA-Z0-9äöüÄÖÜ ]/g,'_')+'-Bericht.txt';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('✓ Bericht heruntergeladen','ok');
}

// ─── Admin Panel ─────────────────────────────────────────────

// ─── Admin: user cache & pagination state ────────────────────
let _adminUserCache = null;
const _USER_PAGE_SIZE = 50;
let _userPageShown = 0;

async function renderAdmin(){
  if(CFG.authRole!=='admin') return;
  const invEl = document.getElementById('admin-invite-link');
  if(invEl) invEl.textContent = _buildInviteUrl();
  renderAdminDesignPresets();
  // Admin groups panel is now lazy-loaded via toggleAdminGroupsPanel()
}

// ─── User Management Overlay ─────────────────────────────────
function openUserManagement(){
  if(CFG.authRole!=='admin'){ toast('Kein Zugriff','err'); return; }
  const ov = document.getElementById('user-mgmt-overlay');
  ov.style.display = 'flex';
  document.getElementById('user-mgmt-search').value = '';
  if(_adminUserCache){
    _renderUserMgmtList(_adminUserCache);
  } else {
    _fetchAndRenderUsers();
  }
}

function closeUserManagement(){
  document.getElementById('user-mgmt-overlay').style.display = 'none';
}

function refreshUserList(){
  _adminUserCache = null;
  _fetchAndRenderUsers();
}

async function _fetchAndRenderUsers(){
  const body = document.getElementById('user-mgmt-body');
  body.innerHTML = '<div class="user-mgmt-spinner"><div class="spinner"></div><div style="margin-top:10px;font-size:12px;color:var(--text3)">Lade Benutzerliste…</div></div>';
  try{
    const r = await fetch(CFG.adminUrl+'?'+new URLSearchParams({action:'admin_list',token:CFG.sessionToken}));
    const d = await r.json();
    if(d.error) throw new Error(d.error);
    _adminUserCache = d.users || [];
    _renderUserMgmtList(_adminUserCache);
  }catch(e){
    body.innerHTML = '<div style="color:var(--red);font-size:12px;text-align:center;padding:30px 0">'+esc(e.message)+'</div>';
  }
}

function filterUsers(query){
  if(!_adminUserCache) return;
  const q = query.trim().toLowerCase();
  if(!q){ _renderUserMgmtList(_adminUserCache); return; }
  const filtered = _adminUserCache.filter(u =>
    (u.username||'').toLowerCase().includes(q) ||
    (u.email||'').toLowerCase().includes(q)
  );
  _renderUserMgmtList(filtered, true);
}

function _renderUserMgmtList(users, isFiltered){
  const body = document.getElementById('user-mgmt-body');
  if(!users.length){
    body.innerHTML = '<div class="t-muted" style="text-align:center;padding:40px 0">'+(isFiltered?'Keine Treffer.':'Noch keine Benutzer.')+'</div>';
    return;
  }
  _userPageShown = Math.min(users.length, _USER_PAGE_SIZE);
  const slice = users.slice(0, _userPageShown);
  let html = '<div class="user-mgmt-count">'+users.length+' Benutzer'+(isFiltered?' gefunden':'')+'</div>';
  html += slice.map(u => _userRowHtml(u)).join('');
  if(users.length > _userPageShown){
    html += '<button class="user-mgmt-more" onclick="_showMoreUsers()">Mehr laden ('+(_userPageShown)+'/'+users.length+')</button>';
  }
  body.innerHTML = html;
}

function _showMoreUsers(){
  const query = (document.getElementById('user-mgmt-search').value||'').trim().toLowerCase();
  let list = _adminUserCache || [];
  if(query) list = list.filter(u => (u.username||'').toLowerCase().includes(query) || (u.email||'').toLowerCase().includes(query));
  const nextEnd = Math.min(list.length, _userPageShown + _USER_PAGE_SIZE);
  const newSlice = list.slice(_userPageShown, nextEnd);
  _userPageShown = nextEnd;
  const body = document.getElementById('user-mgmt-body');
  // Remove "Mehr laden" button
  const moreBtn = body.querySelector('.user-mgmt-more');
  if(moreBtn) moreBtn.remove();
  // Append new rows
  const frag = document.createElement('div');
  frag.innerHTML = newSlice.map(u => _userRowHtml(u)).join('');
  while(frag.firstChild) body.appendChild(frag.firstChild);
  if(list.length > _userPageShown){
    const btn = document.createElement('button');
    btn.className = 'user-mgmt-more';
    btn.textContent = 'Mehr laden ('+_userPageShown+'/'+list.length+')';
    btn.onclick = _showMoreUsers;
    body.appendChild(btn);
  }
}

function _userRowHtml(u){
  return `<div class="admin-user-row">
    <div style="min-width:0">
      <div class="admin-user-name">${esc(u.username)}<span class="admin-badge ${u.role==='admin'?'':'user'}">${u.role==='admin'?'Admin':'User'}</span></div>
      <div class="admin-user-meta">Erstellt: ${u.createdAt?u.createdAt.slice(0,10):'–'} · Login: ${u.lastLogin?u.lastLogin.slice(0,10):'–'}</div>
      ${u.sheetUrl?`<div class="admin-user-meta"><a href="${esc(u.sheetUrl)}" target="_blank" style="color:var(--accent);text-decoration:none;font-size:10px">Sheet öffnen ↗</a></div>`:''}
    </div>
    <div class="admin-user-actions">
      <button onclick="adminResetPw('${esc(u.username)}')" style="font-size:11px;padding:5px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer">Reset PW</button>
      ${u.username!==CFG.authUser?`<button onclick="adminDeleteUser('${esc(u.username)}')" style="font-size:11px;padding:5px 10px;border-radius:6px;border:1px solid rgba(255,77,109,.3);background:rgba(255,77,109,.08);color:var(--red);cursor:pointer">Löschen</button>`:''}
    </div>
  </div>`;
}

async function adminResetPw(target){
  const newPw = prompt(`Neues temporäres Passwort für "${target}":`, '');
  if(!newPw||newPw.length<6){ toast('Mindestens 6 Zeichen','err'); return; }
  try{
    const newHash = await sha256(newPw);
    const r = await fetch(CFG.adminUrl+'?'+new URLSearchParams({action:'admin_reset_pw',token:CFG.sessionToken,target,newHash}));
    const d = await r.json();
    if(d.error) throw new Error(d.error);
    toast(`✓ PW für ${target} geändert: ${newPw}`, 'ok');
  }catch(e){ toast('Fehler: '+e.message,'err'); }
}

async function adminDeleteUser(target){
  if(!confirm(`Benutzer "${target}" und alle Session-Einträge löschen?\n\nDas persönliche Sheet wird NICHT gelöscht.`)) return;
  try{
    const r = await fetch(CFG.adminUrl+'?'+new URLSearchParams({action:'admin_delete',token:CFG.sessionToken,target}));
    const d = await r.json();
    if(d.error) throw new Error(d.error);
    toast('✓ Benutzer gelöscht','ok');
    _adminUserCache = null;
    _fetchAndRenderUsers();
  }catch(e){ toast('Fehler: '+e.message,'err'); }
}

function _buildInviteUrl(){
  let invUrl = window.location.origin + window.location.pathname + '?adminUrl=' + encodeURIComponent(CFG.adminUrl);
  const dd = CFG.adminDefaultDesign;
  if(dd) invUrl += '&design=' + encodeURIComponent(JSON.stringify(dd));
  return invUrl;
}
function copyInviteLink(){
  const invUrl = _buildInviteUrl();
  if(navigator.clipboard) navigator.clipboard.writeText(invUrl).then(()=>toast('✓ Einladungslink kopiert','ok')).catch(()=>toast('Clipboard n/a','err'));
  else{ const ta=document.createElement('textarea');ta.value=invUrl;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);toast('✓ Einladungslink kopiert','ok'); }
}

// Admin: set default design for new users (embedded in invite link)
function renderAdminDesignPresets(){
  const grid = document.getElementById('admin-design-presets'); if(!grid) return;
  const dd = CFG.adminDefaultDesign || DEFAULT_DESIGN;
  grid.innerHTML = Object.entries(BG_PRESETS).map(([key, p])=>{
    const isActive = dd.bgPreset===key;
    return `<div onclick="setAdminDefaultBg('${key}')" style="
      height:44px;border-radius:var(--r2);cursor:pointer;
      background:${p.gradient};
      border:2px solid ${isActive?'var(--accent)':'transparent'};
      transition:border .15s;position:relative;overflow:hidden">
      <div style="position:absolute;bottom:3px;left:0;right:0;text-align:center;font-size:9px;font-weight:600;color:rgba(255,255,255,0.75);text-shadow:0 1px 3px rgba(0,0,0,.8)">${p.label}</div>
    </div>`;
  }).join('');
  const glassSw = document.getElementById('admin-glass-sw');
  if(glassSw) glassSw.classList.toggle('on', !!dd.glassEnabled);
  const detail = document.getElementById('admin-glass-detail');
  if(detail) detail.style.display = dd.glassEnabled ? '' : 'none';
  const blurSlider = document.getElementById('admin-glass-blur-slider');
  if(blurSlider) blurSlider.value = dd.glassBlur||14;
  const blurVal = document.getElementById('admin-glass-blur-val');
  if(blurVal) blurVal.textContent = (dd.glassBlur||14)+'px';
  const alphaSlider = document.getElementById('admin-glass-alpha-slider');
  if(alphaSlider) alphaSlider.value = dd.glassAlpha||45;
  const alphaVal = document.getElementById('admin-glass-alpha-val');
  if(alphaVal) alphaVal.textContent = (dd.glassAlpha||45)+'%';
  // Accent color presets
  const accentGrid = document.getElementById('admin-accent-presets');
  if(accentGrid){
    const isLight = document.documentElement.dataset.theme === 'light';
    const curAccent = dd.accentColor || '';
    accentGrid.innerHTML = ACCENT_PRESETS.map(p => {
      const c = isLight ? p.light : p.dark;
      const isActive = curAccent === c;
      return `<div onclick="setAdminAccentColor('${c}')" style="
        height:26px;border-radius:5px;cursor:pointer;background:${c};
        border:2px solid ${isActive ? 'var(--text)' : 'transparent'};
        display:flex;align-items:center;justify-content:center;
        font-size:7px;font-weight:700;color:${_contrastText(c)};
        transition:border .15s">${p.label}</div>`;
    }).join('');
  }
  const accentPicker = document.getElementById('admin-accent-picker');
  if(accentPicker) accentPicker.value = dd.accentColor || '#C8F53C';
  // Glow slider
  const glowSlider = document.getElementById('admin-glow-slider');
  if(glowSlider) glowSlider.value = dd.textGlow ?? 100;
  const glowVal = document.getElementById('admin-glow-val');
  if(glowVal) glowVal.textContent = (dd.textGlow ?? 100) + '%';
}
function setAdminDefaultBg(key){
  if(!CFG.adminDefaultDesign) CFG.adminDefaultDesign = {...DEFAULT_DESIGN};
  CFG.adminDefaultDesign.bgPreset = key;
  const fcKey = BG_FONT_MAP[key];
  if(fcKey && FONT_COLOR_PRESETS[fcKey]){
    const p = FONT_COLOR_PRESETS[fcKey];
    CFG.adminDefaultDesign.fontColor = fcKey;
    CFG.adminDefaultDesign.fontColors = {primary:p.primary,secondary:p.secondary,tertiary:p.tertiary};
  }
  cfgSave(); renderAdminDesignPresets(); _updateAdminInviteLink();
}
function toggleAdminDefaultGlass(){
  if(!CFG.adminDefaultDesign) CFG.adminDefaultDesign = {...DEFAULT_DESIGN};
  CFG.adminDefaultDesign.glassEnabled = !CFG.adminDefaultDesign.glassEnabled;
  cfgSave(); renderAdminDesignPresets(); _updateAdminInviteLink();
}
function updateAdminDefaultDesign(){
  if(!CFG.adminDefaultDesign) CFG.adminDefaultDesign = {...DEFAULT_DESIGN};
  const blurSlider = document.getElementById('admin-glass-blur-slider');
  const alphaSlider = document.getElementById('admin-glass-alpha-slider');
  if(blurSlider) CFG.adminDefaultDesign.glassBlur = +blurSlider.value;
  if(alphaSlider) CFG.adminDefaultDesign.glassAlpha = +alphaSlider.value;
  const blurVal = document.getElementById('admin-glass-blur-val');
  if(blurVal) blurVal.textContent = CFG.adminDefaultDesign.glassBlur+'px';
  const alphaVal = document.getElementById('admin-glass-alpha-val');
  if(alphaVal) alphaVal.textContent = CFG.adminDefaultDesign.glassAlpha+'%';
  // Glow
  const glowSlider = document.getElementById('admin-glow-slider');
  if(glowSlider){
    CFG.adminDefaultDesign.textGlow = +glowSlider.value;
    const gv = document.getElementById('admin-glow-val');
    if(gv) gv.textContent = CFG.adminDefaultDesign.textGlow + '%';
  }
  cfgSave(); _updateAdminInviteLink();
}
function setAdminAccentColor(color){
  if(!CFG.adminDefaultDesign) CFG.adminDefaultDesign = {...DEFAULT_DESIGN};
  CFG.adminDefaultDesign.accentColor = color || '';
  cfgSave(); renderAdminDesignPresets(); _updateAdminInviteLink();
}
function saveAdminDefaultDesign(){
  CFG.adminDefaultDesign = {
    bgPreset: CFG.bgPreset||'aurora',
    glassEnabled: !!CFG.glassEnabled,
    glassBlur: CFG.glassBlur||14,
    glassAlpha: CFG.glassAlpha||45,
    glassClean: !!CFG.glassClean,
    fontColor: CFG.fontColor||'',
    fontColors: CFG.fontColors||{},
    accentColor: CFG.accentColor||'',
    textGlow: CFG.textGlow ?? 100,
  };
  cfgSave(); renderAdminDesignPresets(); _updateAdminInviteLink();
  toast('Aktuelles Design als Standard gespeichert','ok');
}
function _updateAdminInviteLink(){
  const invEl = document.getElementById('admin-invite-link');
  if(invEl) invEl.textContent = _buildInviteUrl();
}

// ═══════════════════════════════════════════════════════════════
// MODULE: CODE.GS HELPER
// ═══════════════════════════════════════════════════════════════
const CODE_GS = `function doGet(e) {
  const p = e.parameter || {};
  try { return _handle(p); }
  catch(err) { return _json({ error: err.toString() }); }
}

function _handle(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (p.action === 'get') {
    return _json({ values: ss.getRange(p.range).getValues() });
  }
  if (p.action === 'append') {
    const sh = ss.getSheetByName(p.sheet);
    if (!sh) return _json({ error: 'Sheet nicht gefunden: ' + p.sheet });
    const rows = JSON.parse(p.values);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    return _json({ ok: true });
  }
  if (p.action === 'update') {
    ss.getRange(p.range).setValues(JSON.parse(p.values));
    return _json({ ok: true });
  }
  if (p.action === 'meta') {
    return _json({ sheets: ss.getSheets().map(s => ({ properties: { title: s.getName() } })) });
  }
  if (p.action === 'ensureSheet') {
    let sh = ss.getSheetByName(p.sheet);
    if (!sh) {
      sh = ss.insertSheet(p.sheet);
      if (p.headers) { const h = JSON.parse(p.headers); sh.getRange(1,1,1,h.length).setValues([h]); }
    }
    return _json({ ok: true });
  }
  if (p.action === 'setFormulas') {
    ss.getRange(p.range).setFormulas(JSON.parse(p.formulas));
    return _json({ ok: true });
  }
  if (p.action === 'fetchPrices') {
    var tickers = JSON.parse(p.tickers || '[]');
    var results = {};
    // Use GOOGLEFINANCE server-side: set formulas, flush, read back
    var sh = ss.getSheetByName('Kurse');
    if (!sh) {
      sh = ss.insertSheet('Kurse');
      sh.getRange(1,1,1,3).setValues([['Ticker','Kurs','Währung']]);
    }
    if (tickers.length > 0) {
      // Clear old data and write tickers
      var dataRange = sh.getRange(2, 1, Math.max(sh.getLastRow(), tickers.length + 1), 3);
      dataRange.clearContent();
      sh.getRange(2, 1, tickers.length, 1).setValues(tickers.map(function(t){ return [t]; }));
      // Set GOOGLEFINANCE formulas
      var formulas = tickers.map(function(t, i) {
        return [
          '=IFERROR(GOOGLEFINANCE("' + t.replace(/"/g, '') + '","price"),"")',
          '=IFERROR(GOOGLEFINANCE("' + t.replace(/"/g, '') + '","currency"),"")'
        ];
      });
      sh.getRange(2, 2, tickers.length, 2).setFormulas(formulas);
      SpreadsheetApp.flush();
      Utilities.sleep(2000);
      SpreadsheetApp.flush();
      // Read back computed values
      var vals = sh.getRange(2, 1, tickers.length, 3).getValues();
      for (var i = 0; i < vals.length; i++) {
        var ticker = String(vals[i][0] || '').toUpperCase();
        var price = parseFloat(vals[i][1]);
        var currency = String(vals[i][2] || '');
        if (ticker && !isNaN(price) && price > 0) {
          results[ticker] = { price: price, currency: currency, prevClose: null };
        }
      }
    }
    return _json({ prices: results });
  }
  // ── Groups (stored in this sheet's Groups + Notifications tabs) ──
  if (p.action === 'groupsEnsureSheet') {
    var gsh = ss.getSheetByName(p.sheet);
    if (!gsh) {
      gsh = ss.insertSheet(p.sheet);
      if (p.headers) { var h = JSON.parse(p.headers); gsh.getRange(1,1,1,h.length).setValues([h]); gsh.setFrozenRows(1); }
    }
    return _json({ ok: true });
  }
  if (p.action === 'groupsGet') {
    var parts = p.range.split('!'); var sheetName = parts[0]; var rangePart = parts[1] || 'A:Z';
    var gsh = ss.getSheetByName(sheetName);
    if (!gsh) return _json({ values: [] });
    var lastRow = gsh.getLastRow();
    if (lastRow < 1) return _json({ values: [] });
    var m = rangePart.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);
    if (m) {
      var sr = parseInt(m[2]); var er = Math.min(parseInt(m[4]), lastRow);
      if (sr > er) return _json({ values: [] });
      return _json({ values: gsh.getRange(m[1]+sr+':'+m[3]+er).getValues() });
    }
    return _json({ values: gsh.getRange(1,1,lastRow,gsh.getLastColumn()).getValues() });
  }
  if (p.action === 'groupsAppend') {
    var gsh = ss.getSheetByName(p.sheet);
    if (!gsh) return _json({ error: 'Sheet nicht gefunden: ' + p.sheet });
    var rows = JSON.parse(p.values);
    var startRow = Math.max(gsh.getLastRow(), 1) + 1;
    gsh.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
    return _json({ ok: true });
  }
  if (p.action === 'groupsUpdate') {
    var parts = p.range.split('!');
    ss.getSheetByName(parts[0]).getRange(parts[1]).setValues(JSON.parse(p.values));
    return _json({ ok: true });
  }
  if (p.action === 'groupsFindRow') {
    var gsh = ss.getSheetByName(p.sheet);
    if (!gsh) return _json({ row: null });
    var vals = gsh.getDataRange().getValues();
    for (var i = 0; i < vals.length; i++) { if (String(vals[i][0]) === String(p.id)) return _json({ row: i+1 }); }
    return _json({ row: null });
  }
  return _json({ error: 'Unbekannte Aktion: ' + (p.action || '(keine)') });
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}`;

function toggleCodeGs(btn) {
  const block = document.getElementById('codeg-block');
  const pre = document.getElementById('codeg-pre');
  if (!pre.textContent) pre.textContent = CODE_GS;
  const shown = block.style.display !== 'none';
  block.style.display = shown ? 'none' : 'block';
  const icon = '<svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2;display:inline;vertical-align:middle;margin-right:5px"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';
  btn.innerHTML = icon + (shown ? 'Code.gs anzeigen &amp; kopieren' : 'Code.gs ausblenden');
}

function copyCodeGs() {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(CODE_GS)
      .then(() => toast('✓ Code.gs kopiert!', 'ok'))
      .catch(() => toast('Clipboard nicht verfügbar', 'err'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = CODE_GS;
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    toast('✓ Code.gs kopiert!', 'ok');
  }
}

// ─── Admin Code.gs ──────────────────────────────────────────
const ADMIN_CODE_GS = `// ═══════════════════════════════════════════════════
// F-TRACKER ADMIN CODE.GS
// Nur im Admin-Sheet deployen (nicht im User-Sheet!)
// Bereitstellen → Web-App · Ausführen als: Ich · Zugriff: Jeder
// ═══════════════════════════════════════════════════

const SESSION_HOURS = 720; // 30 Tage

function doGet(e) {
  const p = e.parameter || {};
  try { return _json(_handle(p)); }
  catch(err) { return _json({ error: err.toString() }); }
}

function _handle(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (p.action === 'signup') return _signup(ss, p);
  if (p.action === 'login')  return _login(ss, p);
  const session = _checkSession(ss, p.token);
  if (!session) return { error: 'Sitzung abgelaufen. Bitte neu anmelden.' };
  const user = _getUser(ss, session.username);
  if (!user) return { error: 'Benutzer nicht gefunden.' };
  if (p.action === 'logout')       return _logout(ss, p.token);
  if (p.action === 'get')          return _proxyGet(user.sheetId, p);
  if (p.action === 'append')       return _proxyAppend(user.sheetId, p);
  if (p.action === 'update')       return _proxyUpdate(user.sheetId, p);
  if (p.action === 'meta')         return _proxyMeta(user.sheetId);
  if (p.action === 'ensureSheet')  return _proxyEnsureSheet(user.sheetId, p);
  if (p.action === 'setFormulas')  return _proxySetFormulas(user.sheetId, p);
  if (p.action === 'fetchPrices') {
    var tickers = JSON.parse(p.tickers || '[]');
    var results = {};
    var userSs = SpreadsheetApp.openById(user.sheetId);
    var sh = userSs.getSheetByName('Kurse');
    if (!sh) {
      sh = userSs.insertSheet('Kurse');
      sh.getRange(1,1,1,3).setValues([['Ticker','Kurs','Währung']]);
    }
    if (tickers.length > 0) {
      var dataRange = sh.getRange(2, 1, Math.max(sh.getLastRow(), tickers.length + 1), 3);
      dataRange.clearContent();
      sh.getRange(2, 1, tickers.length, 1).setValues(tickers.map(function(t){ return [t]; }));
      var formulas = tickers.map(function(t, i) {
        return [
          '=IFERROR(GOOGLEFINANCE("' + t.replace(/"/g, '') + '","price"),"")',
          '=IFERROR(GOOGLEFINANCE("' + t.replace(/"/g, '') + '","currency"),"")'
        ];
      });
      sh.getRange(2, 2, tickers.length, 2).setFormulas(formulas);
      SpreadsheetApp.flush();
      Utilities.sleep(2000);
      SpreadsheetApp.flush();
      var vals = sh.getRange(2, 1, tickers.length, 3).getValues();
      for (var i = 0; i < vals.length; i++) {
        var ticker = String(vals[i][0] || '').toUpperCase();
        var price = parseFloat(vals[i][1]);
        var currency = String(vals[i][2] || '');
        if (ticker && !isNaN(price) && price > 0) {
          results[ticker] = { price: price, currency: currency, prevClose: null };
        }
      }
    }
    return { prices: results };
  }
  if (p.action === 'change_pw')    return _changePw(ss, session.username, p);
  // Groups — operate on ADMIN sheet (shared across users)
  if (p.action === 'groupsGet')         return _groupsGet(ss, p);
  if (p.action === 'groupsAppend')      return _groupsAppend(ss, p);
  if (p.action === 'groupsUpdate')      return _groupsUpdate(ss, p);
  if (p.action === 'groupsEnsureSheet') return _groupsEnsureSheet(ss, p);
  if (p.action === 'groupsFindRow')     return _groupsFindRow(ss, p);
  if (user.role !== 'admin') return { error: 'Keine Berechtigung.' };
  if (p.action === 'admin_list')     return _adminList(ss);
  if (p.action === 'admin_delete')   return _adminDelete(ss, p);
  if (p.action === 'admin_reset_pw') return _adminResetPw(ss, p);
  return { error: 'Unbekannte Aktion: ' + (p.action || '(keine)') };
}

function _signup(ss, p) {
  if (!p.user || !p.hash) return { error: 'Benutzername und Passwort erforderlich.' };
  const user = p.user.trim().toLowerCase();
  if (user.length < 3) return { error: 'Benutzername: mind. 3 Zeichen.' };
  if (!/^[a-z0-9._-]+$/.test(user)) return { error: 'Nur a–z 0–9 . _ - erlaubt.' };
  const sheet = ss.getSheetByName('Users');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++)
    if (String(rows[i][0]).toLowerCase() === user) return { error: 'Benutzername bereits vergeben.' };
  const newSs = SpreadsheetApp.create('FTracker – ' + user);
  _initUserSheet(newSs);
  sheet.appendRow([user, p.hash, newSs.getId(), newSs.getUrl(), new Date().toISOString(), 'user', '']);
  const token = _createSession(ss, user);
  return { ok: true, token, username: user, role: 'user' };
}

function _login(ss, p) {
  if (!p.user || !p.hash) return { error: 'Benutzername und Passwort erforderlich.' };
  const user = p.user.trim().toLowerCase();
  const sheet = ss.getSheetByName('Users');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).toLowerCase() === user && rows[i][1] === p.hash) {
      sheet.getRange(i + 1, 7).setValue(new Date().toISOString());
      const token = _createSession(ss, user);
      return { ok: true, token, username: user, role: rows[i][5] || 'user' };
    }
  }
  return { error: 'Benutzername oder Passwort falsch.' };
}

function _logout(ss, token) {
  const sheet = ss.getSheetByName('Sessions');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++)
    if (rows[i][0] === token) { sheet.deleteRow(i + 1); break; }
  return { ok: true };
}

function _changePw(ss, username, p) {
  if (!p.newHash) return { error: 'newHash fehlt' };
  const sheet = ss.getSheetByName('Users');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++)
    if (String(rows[i][0]).toLowerCase() === username.toLowerCase()) {
      sheet.getRange(i + 1, 2).setValue(p.newHash);
      return { ok: true };
    }
  return { error: 'Benutzer nicht gefunden' };
}

function _checkSession(ss, token) {
  if (!token) return null;
  const sheet = ss.getSheetByName('Sessions');
  const rows = sheet.getDataRange().getValues();
  const now = new Date();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === token) {
      if (new Date(rows[i][2]) > now) return { username: rows[i][1] };
      sheet.deleteRow(i + 1); return null;
    }
  }
  return null;
}

function _createSession(ss, username) {
  const token = Utilities.getUuid();
  const expires = new Date(Date.now() + SESSION_HOURS * 3600 * 1000);
  ss.getSheetByName('Sessions').appendRow([token, username, expires.toISOString()]);
  return token;
}

function _getUser(ss, username) {
  const rows = ss.getSheetByName('Users').getDataRange().getValues();
  for (let i = 1; i < rows.length; i++)
    if (String(rows[i][0]).toLowerCase() === username.toLowerCase())
      return { username: rows[i][0], sheetId: rows[i][2], sheetUrl: rows[i][3], role: rows[i][5] || 'user' };
  return null;
}

function _proxyGet(sheetId, p) {
  return { values: SpreadsheetApp.openById(sheetId).getRange(p.range).getValues() };
}
function _proxyAppend(sheetId, p) {
  const ss = SpreadsheetApp.openById(sheetId);
  const sh = ss.getSheetByName(p.sheet);
  if (!sh) return { error: 'Sheet nicht gefunden: ' + p.sheet };
  const rows = JSON.parse(p.values);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  return { ok: true };
}
function _proxyUpdate(sheetId, p) {
  SpreadsheetApp.openById(sheetId).getRange(p.range).setValues(JSON.parse(p.values));
  return { ok: true };
}
function _proxyMeta(sheetId) {
  return { sheets: SpreadsheetApp.openById(sheetId).getSheets().map(s => ({ properties: { title: s.getName() } })) };
}
function _proxyEnsureSheet(sheetId, p) {
  const ss = SpreadsheetApp.openById(sheetId);
  let sh = ss.getSheetByName(p.sheet);
  if (!sh) {
    sh = ss.insertSheet(p.sheet);
    if (p.headers) { const h = JSON.parse(p.headers); sh.getRange(1,1,1,h.length).setValues([h]); }
  }
  return { ok: true };
}
function _proxySetFormulas(sheetId, p) {
  SpreadsheetApp.openById(sheetId).getRange(p.range).setFormulas(JSON.parse(p.formulas));
  return { ok: true };
}

// ── Groups: operate on ADMIN sheet (shared data) ──────────
// Convert column letter to number: A=1, B=2, ..., Z=26, AA=27
function _colToNum(col) {
  var n = 0;
  for (var i = 0; i < col.length; i++) n = n * 26 + col.charCodeAt(i) - 64;
  return n;
}

// Groups/Notifications/GE_* tabs live in the admin spreadsheet so
// all members can read/write them regardless of their own user sheet.

function _groupsGet(ss, p) {
  try {
    // p.range = 'SheetName!A2:L5000'
    var parts = p.range.split('!');
    var sheetName = parts[0];
    var rangePart = parts[1] || 'A:Z';
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return { values: [] };
    var lastRow = sh.getLastRow();
    if (lastRow < 1) return { values: [] };
    // Parse range: A2:L5000 or A:A or A:L
    var match = rangePart.match(/([A-Z]+)(\\d+):([A-Z]+)(\\d+)/);
    if (match) {
      var startRow = parseInt(match[2]);
      var endRow = Math.min(parseInt(match[4]), lastRow);
      if (startRow > endRow) return { values: [] };
      return { values: sh.getRange(match[1] + startRow + ':' + match[3] + endRow).getValues() };
    }
    // Column-only ranges (A:A, A:L)
    var colMatch = rangePart.match(/^([A-Z]+):([A-Z]+)$/);
    if (colMatch) {
      var c1 = _colToNum(colMatch[1]);
      var c2 = _colToNum(colMatch[2]);
      var numCols = c2 - c1 + 1;
      return { values: sh.getRange(1, c1, lastRow, numCols).getValues() };
    }
    // Fallback: full data
    return { values: sh.getRange(1, 1, lastRow, sh.getLastColumn()).getValues() };
  } catch(e) {
    return { values: [], _note: e.toString() };
  }
}

function _groupsAppend(ss, p) {
  var sh = ss.getSheetByName(p.sheet);
  if (!sh) return { error: 'Sheet nicht gefunden: ' + p.sheet };
  var rows = JSON.parse(p.values);
  var lastRow = sh.getLastRow();
  var startRow = lastRow < 1 ? 1 : lastRow + 1;
  sh.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
  return { ok: true };
}

function _groupsUpdate(ss, p) {
  // p.range = 'SheetName!K5' or 'SheetName!A5:L5'
  var parts = p.range.split('!');
  var sheetName = parts[0];
  var rangePart = parts[1];
  var sh = ss.getSheetByName(sheetName);
  if (!sh) return { error: 'Sheet nicht gefunden: ' + sheetName };
  sh.getRange(rangePart).setValues(JSON.parse(p.values));
  return { ok: true };
}

function _groupsEnsureSheet(ss, p) {
  var sh = ss.getSheetByName(p.sheet);
  if (!sh) {
    sh = ss.insertSheet(p.sheet);
    if (p.headers) {
      var h = JSON.parse(p.headers);
      sh.getRange(1, 1, 1, h.length).setValues([h]);
    }
  }
  return { ok: true };
}

function _groupsFindRow(ss, p) {
  var sh = ss.getSheetByName(p.sheet);
  if (!sh) return { row: null };
  var lastRow = sh.getLastRow();
  if (lastRow < 1) return { row: null };
  var data = sh.getRange(1, 1, lastRow, 1).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(p.id)) return { row: i + 1 };
  }
  return { row: null };
}

function _adminList(ss) {
  const rows = ss.getSheetByName('Users').getDataRange().getValues();
  const users = [];
  for (let i = 1; i < rows.length; i++)
    if (rows[i][0]) users.push({ username: rows[i][0], sheetUrl: rows[i][3], createdAt: rows[i][4], lastLogin: rows[i][6] || '', role: rows[i][5] || 'user' });
  return { users };
}
function _adminDelete(ss, p) {
  if (!p.target) return { error: 'target fehlt' };
  const sheet = ss.getSheetByName('Users');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++)
    if (String(rows[i][0]).toLowerCase() === p.target.toLowerCase()) { sheet.deleteRow(i + 1); return { ok: true }; }
  return { error: 'Benutzer nicht gefunden' };
}
function _adminResetPw(ss, p) {
  if (!p.target || !p.newHash) return { error: 'target + newHash fehlen' };
  const sheet = ss.getSheetByName('Users');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++)
    if (String(rows[i][0]).toLowerCase() === p.target.toLowerCase()) {
      sheet.getRange(i + 1, 2).setValue(p.newHash); return { ok: true };
    }
  return { error: 'Benutzer nicht gefunden' };
}

function _initUserSheet(ss) {
  const def = ss.getSheets()[0]; def.setName('Ausgaben');
  _hdr(def, ['ID','Datum','Beschreibung','Kategorie','Betrag','Notiz','Deleted','isFixkosten','GroupID','SplitData']);
  [['Einnahmen',['ID','Datum','Beschreibung','Kategorie','Betrag','Notiz','Deleted','isLohn','GroupID']],
   ['Daueraufträge',['ID','Was','Kategorie','Betrag','Intervall','Tag','Kommentar','Aktiv','nextDate','startDate','endDate','lastBooked']],
   ['Kategorien',['ID','Name','Typ','Farbe','Sortierung']],
   ['Einstellungen',['Schlüssel','Wert']],
   ['Aktien',['ID','Titel','ISIN','Ticker','Währung','Deleted']],
   ['Trades',['ID','AktieID','Typ','Datum','Anzahl','Preis','Währung','Courtage','Gesamt','Deleted']],
   ['Kurse',['Ticker','Kurs','Währung']],
   ['Portfolio-Verlauf',['Datum','Gesamt']],
  ].forEach(([name,headers])=>_hdr(ss.insertSheet(name),headers));
  const cats=[['k001','Zmittag','ausgabe','#FF6B35',1],['k002','Snack','ausgabe','#F7931E',2],
    ['k003','Ferien','ausgabe','#00D4AA',3],['k004','Poschte','ausgabe','#4ECDC4',4],
    ['k005','Znacht','ausgabe','#FF6B6B',5],['k006','Chleider','ausgabe','#E06C75',6],
    ['k007','Technik','ausgabe','#61AFEF',7],['k008','Mieti','ausgabe','#E5C07B',8],
    ['k009','Gsundheit','ausgabe','#56B6C2',9],['k010','Internet','ausgabe','#98C379',10],
    ['k011','Diverses','ausgabe','#888888',11],['k012','Lohn','einnahme','#C8F53C',12],
    ['k013','Twint','einnahme','#00C9A7',13],['k014','Diverses','einnahme','#AAAAAA',14]];
  ss.getSheetByName('Kategorien').getRange(2,1,cats.length,5).setValues(cats);
}
function _hdr(sh,headers){sh.getRange(1,1,1,headers.length).setValues([headers]);}

function _json(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}`;

function toggleAdminCodeGs(btn) {
  const block = document.getElementById('admin-codeg-block');
  const pre = document.getElementById('admin-codeg-pre');
  if (!pre.textContent) pre.textContent = ADMIN_CODE_GS;
  const shown = block.style.display !== 'none';
  block.style.display = shown ? 'none' : 'block';
  const icon = '<svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2;display:inline;vertical-align:middle;margin-right:5px"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';
  btn.innerHTML = icon + (shown ? 'Admin Code.gs anzeigen &amp; kopieren' : 'Admin Code.gs ausblenden');
}

function copyAdminCodeGs() {
  if(navigator.clipboard) navigator.clipboard.writeText(ADMIN_CODE_GS).then(()=>toast('✓ Admin Code.gs kopiert!','ok')).catch(()=>toast('Clipboard n/a','err'));
  else{ const ta=document.createElement('textarea');ta.value=ADMIN_CODE_GS;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);toast('✓ Admin Code.gs kopiert!','ok'); }
}

// ═══════════════════════════════════════════════════════════════
// MODULE: DYNAMIC NAV
// ═══════════════════════════════════════════════════════════════
const NAV_LABELS = {
  dashboard:'Jahresüb.', verlauf:'Verlauf', monat:'Monat', aktien:'Aktien', lohn:'Lohn',
  dauerauftraege:'Aufträge', kategorien:'Kat.', einstellungen:'Einst.',
  groups:'Gruppen', sparen:'Sparen'
};

function renderNav(){
  const pinned = CFG.pinnedTabs || [];
  [1,2,3].forEach(i=>{
    const key = pinned[i-1];
    const btn = document.getElementById('nav-slot'+i+'-btn');
    if(!btn) return;
    if(!key){ btn.style.display='none'; return; }
    btn.style.display='';
    btn.onclick = ()=>goTab(key);
    const tab = PINNABLE_TABS ? PINNABLE_TABS.find(t=>t.key===key) : null;
    const svgEl = btn.querySelector('svg');
    if(svgEl && tab) svgEl.innerHTML = tab.icon;
    const lblEl = btn.querySelector('span');
    if(lblEl) lblEl.textContent = NAV_LABELS[key]||key;
  });
  // Desktop sidebar
  if(typeof Device !== 'undefined') Device.renderSidebar();
}

// ═══════════════════════════════════════════════════════════════
// MODULE: SETTINGS TAB
// ═══════════════════════════════════════════════════════════════
function applySettings2(){
  CFG.scriptUrl = document.getElementById('s-url2').value.trim();
  CFG.demo = false;
  cfgSave();
  location.reload();
}

function setThemeMode(mode){
  CFG.themeMode = mode; // '' = dark, 'light' = light, 'auto' = auto
  cfgSave();
  applyThemeMode();
  updateThemeSegUI();
}

function applyThemeMode(){
  let effective = CFG.themeMode || '';
  if(effective === 'auto'){
    // Use system preference, fallback to time-based (6–20 = light)
    if(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches){
      effective = 'light';
    } else if(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches){
      effective = '';
    } else {
      const h = new Date().getHours();
      effective = (h >= 6 && h < 20) ? 'light' : '';
    }
  }
  document.documentElement.dataset.theme = effective;
  CFG.theme = effective;
  // Sync meta theme-color and desktop sidebar
  if(typeof Device !== 'undefined') Device.syncThemeColor();
}

function updateThemeSegUI(){
  const mode = CFG.themeMode || '';
  const order = ['dark','auto','light'];
  order.forEach((m,i)=>{
    const btn = document.getElementById('theme-btn-'+m);
    if(!btn) return;
    const isActive = (m==='dark' && mode==='') || (m==='auto' && mode==='auto') || (m==='light' && mode==='light');
    btn.style.background = isActive ? 'var(--accent)' : 'transparent';
    btn.style.color = isActive ? 'var(--bg0)' : 'var(--text2)';
    btn.style.fontWeight = isActive ? '600' : '400';
    // Only round corners on the edge buttons, not middle
    if(i===0) btn.style.borderRadius = '6px 0 0 6px';
    else if(i===order.length-1) btn.style.borderRadius = '0 6px 6px 0';
    else btn.style.borderRadius = '0';
  });
  const sub = document.getElementById('theme-mode-sub');
  if(sub) sub.textContent = mode==='auto' ? 'Wechselt automatisch je nach System/Tageszeit' : mode==='light' ? 'Helles Design' : 'Dunkles Design';
}

// Listen for system theme changes when in auto mode
if(window.matchMedia){
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ()=>{
    if(CFG.themeMode==='auto') applyThemeMode();
  });
}

function toggleSettingsGroup(id){
  const body = document.getElementById(id);
  if(!body) return;
  const btn = body.previousElementSibling;
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  body.style.display = isOpen ? 'none' : '';
  if(btn) btn.classList.toggle('open', !isOpen);
}

// Toggle the "Anpassen" customize section in settings
function toggleCustomizeSection(){
  const sec = document.getElementById('customize-section');
  if(!sec) return;
  const isOpen = sec.style.display !== 'none';
  sec.style.display = isOpen ? 'none' : '';
  const btn = document.getElementById('customize-toggle-btn');
  if(btn) btn.innerHTML = isOpen
    ? '<svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Anpassen'
    : '<svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2"><polyline points="6 9 12 15 18 9"/></svg> Schliessen';
}

// Update the design summary text shown above the Anpassen button
function updateDesignSummary(){
  const el = document.getElementById('design-summary');
  if(!el) return;
  const pkgId = CFG.designPackageId;
  const pkg = typeof DESIGN_PACKAGES!=='undefined' && DESIGN_PACKAGES[pkgId];
  if(pkg){
    el.textContent = pkg.label + ' — Einzelne Einstellungen unten anpassen';
  } else if(CFG.designPackage){
    el.textContent = 'Benutzerdefiniert — Einzelne Einstellungen unten anpassen';
  } else {
    const parts = [];
    const hasImg = !!localStorage.getItem('ft_bg_image');
    if(hasImg) parts.push('Eigenes Bild');
    else if(CFG.bgPreset && BG_PRESETS[CFG.bgPreset]) parts.push(BG_PRESETS[CFG.bgPreset].label);
    else parts.push('Standard');
    if(CFG.glassEnabled) parts.push('Glass');
    if(CFG.fontColor && CFG.fontColor!=='standard' && FONT_COLOR_PRESETS[CFG.fontColor])
      parts.push(FONT_COLOR_PRESETS[CFG.fontColor].label);
    el.textContent = parts.join(' · ');
  }
}

