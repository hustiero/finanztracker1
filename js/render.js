// ═══════════════════════════════════════════════════════════════
// MODULE: RENDER
// ═══════════════════════════════════════════════════════════════

// ── Swipe gestures ───────────────────────────────────────────────────────────
// Main tabs: swipe left/right to switch between adjacent tabs
// Sub-pages (month-view, modals, detail views): swipe right to go back
(function(){
  let sx=0, sy=0, sTime=0, handled=false;
  const MAIN_TABS = ['home','eingabe','verlauf'];
  // Dynamically build the ordered tab list matching the bottom nav bar exactly:
  // Home, pinned[0], eingabe (FAB), pinned[1], pinned[2], then remaining from Mehr menu
  function getTabOrder(){
    const pinned = (typeof CFG!=='undefined' && CFG.pinnedTabs) ? CFG.pinnedTabs : [];
    const tabs = ['home'];
    if(pinned[0]) tabs.push(pinned[0]);
    tabs.push('eingabe'); // FAB/center
    if(pinned[1]) tabs.push(pinned[1]);
    if(pinned[2]) tabs.push(pinned[2]);
    // Add remaining from PINNABLE_TABS (Mehr menu order) that are not already included
    if(typeof PINNABLE_TABS!=='undefined'){
      PINNABLE_TABS.forEach(t=>{
        if(!tabs.includes(t.key) && (t.key!=='aktien'||CFG.aktienEnabled)) tabs.push(t.key);
      });
    }
    return tabs;
  }

  const content = ()=>dom('content');

  document.addEventListener('touchstart',e=>{
    sx=e.touches[0].clientX; sy=e.touches[0].clientY; sTime=Date.now(); handled=false;
  },{passive:true});

  document.addEventListener('touchend',e=>{
    if(handled) return;
    const dx=e.changedTouches[0].clientX-sx;
    const dy=e.changedTouches[0].clientY-sy;
    const dt=Date.now()-sTime;
    // Must be a horizontal swipe: >60px horizontal, <100px vertical, <400ms
    if(Math.abs(dx)<60 || Math.abs(dy)>100 || dt>400) return;

    // 0. Edge swipe from right edge → open Mehr menu
    const screenW = window.innerWidth;
    if(sx > screenW - 30 && dx < -60){
      if(typeof openMenuOverlay==='function') openMenuOverlay();
      handled=true; return;
    }

    // 1. Any open modal: swipe right to close
    const openModal = document.querySelector('.modal-overlay.show');
    if(openModal && dx>0){
      openModal.classList.remove('show'); handled=true; return;
    }

    // 3. Menu overlay open: swipe right to close
    const menuOv = dom('menu-overlay');
    if(menuOv?.classList.contains('open') && dx>0){
      closeMenuOverlay(); handled=true; return;
    }

    // 4. Notif overlay open: swipe up (already natural) — skip

    // 5. Main tabs: swipe to switch tabs
    if(typeof currentTab!=='undefined'){
      const order = getTabOrder();
      const curIdx = order.indexOf(currentTab);
      if(curIdx<0) return;
      if(dx>0 && curIdx>0){
        // Swipe right → previous tab
        goTab(order[curIdx-1]); handled=true;
      } else if(dx<0 && curIdx<order.length-1){
        // Swipe left → next tab
        goTab(order[curIdx+1]); handled=true;
      }
    }
  },{passive:true});
})();

// Prevent pinch-zoom (iOS ignores user-scalable=no in some cases)
document.addEventListener('gesturestart',e=>e.preventDefault());
document.addEventListener('gesturechange',e=>e.preventDefault());

// ── Pull-to-Refresh ───────────────────────────────────────────────────────────
(function(){
  let sy=0, pulling=false, pullStarted=false, refreshing=false;
  const ind=()=>dom('pull-indicator');
  const cont=()=>dom('content');

  document.addEventListener('touchstart',e=>{
    if(refreshing) return;
    const c=cont();
    if(c && c.scrollTop===0){
      sy=e.touches[0].clientY; pullStarted=true;
    }
  },{passive:true});

  document.addEventListener('touchmove',e=>{
    if(!pullStarted||refreshing) return;
    const dy=e.touches[0].clientY-sy;
    if(dy>10){ pulling=true; ind()?.classList.add('visible'); }
  },{passive:true});

  document.addEventListener('touchend',async e=>{
    if(!pullStarted) return;
    pullStarted=false;
    const dy=e.changedTouches[0].clientY-sy;
    if(pulling && dy>60 && !refreshing){
      refreshing=true;
      if(typeof haptic==='function') haptic(8);
      try{ await loadAll(); }catch(_){}
      refreshing=false;
    }
    pulling=false;
    ind()?.classList.remove('visible');
  },{passive:true});
})();

// ── Swipe-to-Delete ───────────────────────────────────────────────────────────
function initSwipeToDelete(container){
  if(!container) return;
  // Only attach once per container element; re-renders change innerHTML, not the node
  if(container._swipeInit) return;
  container._swipeInit = true;
  let startX=0, startY=0, activeEl=null, dirLocked=false, thresholdHit=false;

  container.addEventListener('touchstart',e=>{
    const wrap = e.target.closest('.swipe-wrap');
    if(!wrap) return;
    activeEl = wrap.querySelector('.swipe-content');
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    dirLocked = false;
    thresholdHit = false;
    if(activeEl) activeEl.style.transition='none';
  },{passive:true});

  container.addEventListener('touchmove',e=>{
    if(!activeEl) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if(!dirLocked){
      if(Math.abs(dy) > Math.abs(dx)){ activeEl=null; return; }
      dirLocked = true;
    }
    if(dx < 0){
      activeEl.style.transform = `translateX(${Math.max(-72, dx)}px)`;
      e.stopPropagation();
      // Haptic when delete threshold first crossed
      if(!thresholdHit && dx < -50){
        thresholdHit = true;
        if(typeof haptic==='function') haptic(8);
      }
    } else if(dx > 0){
      activeEl.style.transform = '';
      thresholdHit = false;
    }
  },{passive:true});

  container.addEventListener('touchend',e=>{
    if(!activeEl) return;
    const dx = e.changedTouches[0].clientX - startX;
    activeEl.style.transition = 'transform .2s ease';
    activeEl.style.transform = dx < -50 ? 'translateX(-72px)' : '';
    activeEl = null;
  },{passive:true});

  // Tap elsewhere resets all open swipe items
  container.addEventListener('touchstart',e=>{
    if(!e.target.closest('.swipe-wrap')){
      container.querySelectorAll('.swipe-content').forEach(el=>{
        el.style.transition='transform .2s ease';
        el.style.transform='';
      });
    }
  },{passive:true});
}

// ═══════════════════════════════════════════════════════════════
// Verlauf Navigation State (3 Ebenen)
let verlaufType = 'alle';         // 'alle' | 'ausgaben' | 'einnahmen'
let verlaufKat = null;            // null | string — gewählte Kategorie für L3
let verlaufL3SearchVis = false;   // Suchfeld auf L3 sichtbar?
let verlaufCatSort = 'amount';    // 'amount' | 'count' — sort for L2 tiles

function renderAll(){
  fillAllDropdowns();
  renderHome();
  renderVerlauf();
  renderCategories();
  renderRecurring();
  renderLohn();
  updatePageSub();
  // Post-render side-effects (non-blocking)
  autoMaterializeRecurrings();
  checkDueRecurrings();
  checkCycleRenewals();
  checkAllNotifications();
}

function updatePageSub(){
  document.getElementById('page-sub').textContent =
    currentTab==='eingabe' ? today() :
    currentTab==='verlauf' ? `${DATA.expenses.length+DATA.incomes.length} Einträge` :
    '';
}

// Recurring occurrences: use getRecurringOccurrences(startStr, endStr, capToToday, skipMaterialized) from data.js.

// ═══════════════════════════════════════════════════════════════
// VERLAUF — 3-Ebenen-Navigation
// Ebene 1 (L1): Alle Buchungen, Typ = 'alle'
// Ebene 2 (L2): Kategorienliste, Typ = 'ausgaben' | 'einnahmen'
// Ebene 3 (L3): Kategorie-Detail, verlaufKat gesetzt
// ═══════════════════════════════════════════════════════════════

// ── Universelle Suchfunktion ─────────────────────────────────────────────────
// Durchsucht Einträge nach Betrag, Kategorie, Datum und Notiz.
// Source: DATA.expenses / DATA.incomes (je nach Kontext)
function sucheTransaktionen(query, entries){
  if(!query) return entries;
  const q = query.toLowerCase();
  return entries.filter(e=>
    (e.what||'').toLowerCase().includes(q)||
    (e.cat||'').toLowerCase().includes(q)||
    (e.note||'').toLowerCase().includes(q)||
    fmtAmt(e.amt).includes(q)||
    fmtDate(e.date).toLowerCase().includes(q)
  );
}

// ── Kategorien mit Einträgen (für L2) ────────────────────────────────────────
// Gibt alle Kategorien mit min. 1 Eintrag zurück, sortiert nach Gesamtbetrag.
// typ: 'ausgaben' | 'einnahmen'. Respektiert verlaufGetRange()-Filter.
function getKategorienMitEintraegen(typ){
  let entries = typ==='ausgaben' ? DATA.expenses : DATA.incomes;
  // Daueraufträge count as Ausgaben — merge recurring instances into the date range
  if(typ==='ausgaben'){
    const {von, bis} = verlaufGetRange();
    const rangeStart = von || dateStr(new Date(new Date().getFullYear(), new Date().getMonth()-11, 1));
    const rangeEnd   = bis || today();
    entries = [...entries, ...getRecurringOccurrences(rangeStart, rangeEnd, true, true)];
  }
  entries = verlaufFilterEntries(entries);
  const byKat = {};
  entries.forEach(e=>{
    if(!byKat[e.cat]) byKat[e.cat] = {name:e.cat, total:0, count:0};
    byKat[e.cat].total += e.amt;
    byKat[e.cat].count++;
  });
  return Object.values(byKat).sort((a,b)=>b.total-a.total);
}

// ── Kategorie-Details (für L3 Stats) ─────────────────────────────────────────
// Gibt Statistiken für eine Kategorie zurück (total, Ø/Monat, Anzahl, %).
// Datenquelle: DATA.expenses oder DATA.incomes je nach Kategorie-Typ
function getKategorieDetails(kat, von='', bis=''){
  const catDef = DATA.categories.find(c=>c.name===kat);
  const isInc = catDef?.type==='einnahme';
  let entries = isInc
    ? DATA.incomes.filter(e=>e.cat===kat)
    : DATA.expenses.filter(e=>e.cat===kat);
  if(von) entries = entries.filter(e=>e.date>=von);
  if(bis) entries = entries.filter(e=>e.date<=bis);
  const total = entries.reduce((s,e)=>s+e.amt, 0);
  const count = entries.length;
  let avgPerMonth = 0;
  if(count){
    const dates = entries.map(e=>e.date);
    const minD = dates.reduce((a,b)=>a<b?a:b);
    const maxD = dates.reduce((a,b)=>a>b?a:b);
    const months = getMonthsBetween(minD, maxD);
    avgPerMonth = months > 0 ? total/months : total;
  }
  const allOfType = isInc ? DATA.incomes : DATA.expenses;
  const grandTotal = allOfType.reduce((s,e)=>s+e.amt, 0);
  const pct = grandTotal>0 ? total/grandTotal*100 : 0;
  return {total, count, avgPerMonth, pct, entries};
}

// ── Hilfsfunktion: Monate zwischen zwei Datumsstrings ────────────────────────
function getMonthsBetween(a, b){
  if(!a||!b) return 1;
  const da = new Date(a+'T12:00:00'), db = new Date(b+'T12:00:00');
  return Math.max(1, (db.getFullYear()-da.getFullYear())*12+(db.getMonth()-da.getMonth())+1);
}

// ── Monatlicher Balken-Chart für L3 ─────────────────────────────────────────
// Zeigt Ausgaben/Einnahmen einer Kategorie über die letzten 12 Monate.
// Datenquelle: DATA.expenses oder DATA.incomes (je nach typ)
function buildMonthlyBarData(kat, typ){
  const now = new Date();
  const months = 12;
  const monthData = {}, monthLabels = [];
  for(let i=months-1;i>=0;i--){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    monthData[key] = 0;
    monthLabels.push({key, label:`${d.getMonth()+1}.${d.getFullYear().toString().slice(2)}`});
  }
  let entries = typ==='ausgaben' ? DATA.expenses : DATA.incomes;
  // Include Daueraufträge in the ausgaben monthly bars
  if(typ==='ausgaben'){
    const chartStart = dateStr(new Date(now.getFullYear(), now.getMonth()-(months-1), 1));
    entries = [...entries, ...getRecurringOccurrences(chartStart, dateStr(now), true, true)];
  }
  entries.filter(e=>e.cat===kat).forEach(e=>{
    const key = e.date.slice(0,7);
    if(key in monthData) monthData[key] += e.amt;
  });
  const maxAmt = Math.max(...Object.values(monthData), 0.01);
  if(Object.values(monthData).every(v=>v===0)) return null;
  return buildBarChartSVG(monthLabels, monthData, maxAmt, catColor(kat));
}

// ── Einträge nach Datum gruppiert rendern ─────────────────────────────────────
// Gemeinsame Renderfunktion für L1 und L3 Transaktionslisten.
// entries: Array mit _type: 'ausgabe' | 'einnahme' | 'recurring'
function renderVerlaufEntryGroups(entries){
  const byDate = {};
  entries.forEach(e=>{ if(!byDate[e.date])byDate[e.date]=[]; byDate[e.date].push(e); });
  return Object.entries(byDate)
    .sort(([a],[b])=>b.localeCompare(a))
    .map(([date, items])=>{
      const dayTotal = items.reduce((s,e)=>s+(e._type==='einnahme'?e.amt:-e.amt), 0);
      const daySign = dayTotal>=0?'+':'−';
      const dayColor = dayTotal>=0?'var(--green)':'var(--red)';
      return `
      <div class="date-group">
        <div class="date-label" style="display:flex;justify-content:space-between;align-items:center">
          <span>${fmtDate(date)}</span>
          <span style="font-size:12px;font-weight:500;color:${dayColor}">${daySign} ${curr()} ${fmtAmt(Math.abs(dayTotal))}</span>
        </div>
        <div class="card" style="margin:0 16px">
          ${items.map(e=>{
            const isRec    = e._type==='recurring';
            const isFuture = isRec && e.date > today();
            const onclick  = isRec ? '' : `onclick="openEditModal('${escJs(e.id)}','${e._type==='ausgabe'?'ausgabe':'einnahme'}')"`;
            const recLabel = isFuture
              ? `<span style="font-size:10px;color:var(--accent);font-weight:600;margin-left:3px">geplant</span>`
              : `<span style="font-size:10px;color:var(--text3);font-weight:400">Abo</span>`;
            const rowEl = `<div class="card-row" ${onclick} style="${isRec?'opacity:'+(isFuture?'0.5':'0.7'):''}">
              <div class="card-row-icon" style="background:${catColor(e.cat)}22">
                <span>${isRec?'↻':catEmoji(e.cat)}</span>
              </div>
              <div class="card-row-body">
                <div class="card-row-title">${esc(e.what)}${isRec?' '+recLabel:''}</div>
                <div class="card-row-sub">${parentOf(e.cat)?esc(parentOf(e.cat))+' › ':'' }${esc(e.cat)}${e.note?' · '+esc(e.note):''}</div>
              </div>
              <div class="card-row-amount">${e._type==='einnahme'?'+ ':'− '}${fmtAmt(e.amt)}</div>
              ${isRec?'':`<svg class="chevron" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>`}
            </div>`;
            if(!isRec){
              const eType = e._type==='ausgabe'?'ausgabe':'einnahme';
              return `<div class="swipe-wrap"><div class="swipe-delete-zone" onclick="deleteEntryById('${escJs(e.id)}','${eType}')"><svg viewBox="0 0 24 24" style="width:20px;height:20px;stroke:#fff;fill:none;stroke-width:2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></div><div class="swipe-content">${rowEl}</div></div>`;
            }
            return rowEl;
          }).join('')}
        </div>
      </div>`;
    }).join('');
}

const _VERLAUF_EMPTY = `<div class="empty"><div class="empty-icon"><svg viewBox="0 0 24 24" style="width:40px;height:40px;stroke:var(--border2);fill:none;stroke-width:1.5"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg></div><div class="empty-text">Noch keine Einträge</div><button class="empty-cta" onclick="goTab('eingabe')"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Ersten Eintrag erfassen</button></div>`;

// ── L1: Alle Buchungen ────────────────────────────────────────────────────────
// Zeigt alle Ausgaben, Einnahmen und aktive Daueraufträge chronologisch.
// Suche filtert über Bezeichnung, Kategorie, Betrag, Datum und Notiz.
function renderVerlaufL1(){
  const container = document.getElementById('verlauf-l1-content');
  if(!container) return;
  const {von, bis} = verlaufGetRange();
  const recurStart = von || dateStr(new Date(new Date().getFullYear(), new Date().getMonth()-11, 1));
  const recurEnd   = bis || today();

  let entries = [
    ...DATA.expenses.map(e=>({...e, _type:'ausgabe'})),
    ...DATA.incomes.map(e=>({...e,_type:'einnahme'})),
    ...getRecurringOccurrences(recurStart, recurEnd, false, true)
  ];

  entries = verlaufFilterEntries(entries);
  entries = sucheTransaktionen(verlaufSearch, entries);
  entries.sort((a,b)=>b.date.localeCompare(a.date));
  if(!entries.length){ container.innerHTML = _VERLAUF_EMPTY; return; }

  // Render at most VERLAUF_PAGE_SIZE entries at once to avoid large DOM builds.
  // "Weitere laden" button appends the next page.
  const total = entries.length;
  const limit = verlaufL1Page * _VERLAUF_PAGE_SIZE;
  const visible = entries.slice(0, limit);
  const hasMore = total > limit;

  let html = renderVerlaufEntryGroups(visible);
  if(hasMore){
    html += `<div style="text-align:center;padding:16px 0">
      <button onclick="verlaufLoadMore()" style="font-size:13px;color:var(--text2);
        background:var(--bg3);border:1px solid var(--border);border-radius:10px;
        padding:8px 24px;cursor:pointer">
        Weitere laden (${total - limit} verbleibend)
      </button></div>`;
  }
  container.innerHTML = html;
  initSwipeToDelete(container);
  // One-time swipe hint on very first open
  if(!localStorage.getItem('ft_swipe_hint_seen')){
    const firstWrap = container.querySelector('.swipe-wrap');
    if(firstWrap){
      firstWrap.classList.add('swipe-hint');
      firstWrap.addEventListener('animationend',()=>firstWrap.classList.remove('swipe-hint'),{once:true});
      localStorage.setItem('ft_swipe_hint_seen','1');
    }
  }
}

const _VERLAUF_PAGE_SIZE = 200;
let verlaufL1Page = 1;

function verlaufLoadMore(){
  verlaufL1Page++;
  renderVerlaufL1();
  // Preserve scroll position by not jumping to top
}

// ── L2: Kategorie-Kacheln ─────────────────────────────────────────────────────
// 2-Spalten-Kachelraster, sortiert nach Gesamtbetrag absteigend.
// Suche filtert Kategorienamen. Klick → L3.
// Datenquelle: DATA.expenses (ausgaben) oder DATA.incomes (einnahmen)
function toggleVerlaufCatSort(){
  verlaufCatSort = verlaufCatSort==='amount' ? 'count' : 'amount';
  renderVerlaufL2();
}
function renderVerlaufL2(){
  const container = document.getElementById('verlauf-l2-content');
  if(!container) return;
  let cats = getKategorienMitEintraegen(verlaufType);
  if(verlaufSearch){
    const q = verlaufSearch.toLowerCase();
    cats = cats.filter(c=>c.name.toLowerCase().includes(q));
  }
  if(!cats.length){
    container.innerHTML = `<div class="empty"><div class="empty-text">Keine Kategorien</div><button class="empty-cta" onclick="document.getElementById('new-cat-section')?.scrollIntoView({behavior:'smooth'})"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Kategorie erstellen</button></div>`;
    return;
  }
  // Sort by amount or transaction count
  if(verlaufCatSort==='count'){
    cats.sort((a,b)=>b.count-a.count || b.total-a.total);
  } else {
    cats.sort((a,b)=>b.total-a.total);
  }
  const grandTotal = cats.reduce((s,c)=>s+c.total, 0);
  const maxTotal = cats[0]?.total||1;
  const sortLabel = verlaufCatSort==='amount' ? 'Betrag ↓' : 'Anzahl ↓';
  container.innerHTML = `<div style="display:flex;justify-content:flex-end;padding:0 16px 6px">
    <button onclick="toggleVerlaufCatSort()" style="font-size:11px;color:var(--text3);background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:3px 10px;cursor:pointer">${sortLabel}</button>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:4px 16px 16px">` +
    cats.map(c=>{
      const pct = grandTotal>0 ? c.total/grandTotal*100 : 0;
      const barPct = maxTotal>0 ? c.total/maxTotal*100 : 0;
      return `
      <div class="verlauf-tile" data-kat="${esc(c.name)}" onclick="verlaufOpenKatFromEl(this)" style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:12px;cursor:pointer;min-height:88px">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
          <span style="font-size:18px;line-height:1">${catEmoji(c.name)}</span>
          <span style="font-size:12px;font-weight:600;color:var(--text2);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.name)}</span>
        </div>
        <div style="font-family:'DM Mono',monospace;font-size:15px;font-weight:700;color:var(--text);margin-bottom:7px">${curr()} ${fmtAmt(c.total)}</div>
        <div style="height:3px;background:var(--bg3);border-radius:2px;overflow:hidden;margin-bottom:4px">
          <div style="height:100%;width:${barPct.toFixed(1)}%;background:${catColor(c.name)};border-radius:2px"></div>
        </div>
        <div class="t-muted-sm">${c.count}× · ${pct.toFixed(0)}%</div>
      </div>`;
    }).join('') + `</div>`;
}

// ── L3: Kategorie-Detailansicht ───────────────────────────────────────────────
// Zeigt Stats (Gesamtbetrag, Ø/Monat, Anzahl, Anteil) + Verlaufsdiagramm
// + gefilterte Transaktionsliste für die gewählte Kategorie.
// Datenquelle: DATA.expenses oder DATA.incomes (je nach Kategorie-Typ)
function renderVerlaufL3(){
  const container = document.getElementById('verlauf-l3-content');
  if(!container) return;
  const kat = verlaufKat;
  const catDef = DATA.categories.find(c=>c.name===kat);
  const isInc = catDef?.type==='einnahme' || verlaufType==='einnahmen';
  // For expense categories include Daueraufträge (recurring) as well
  let baseEntries = (isInc ? DATA.incomes : DATA.expenses).filter(e=>e.cat===kat);
  if(!isInc){
    const {von, bis} = verlaufGetRange();
    const rangeStart = von || dateStr(new Date(new Date().getFullYear(), new Date().getMonth()-11, 1));
    const rangeEnd   = bis || today();
    baseEntries = [...baseEntries, ...getRecurringOccurrences(rangeStart, rangeEnd, true, true).filter(e=>e.cat===kat)];
  }
  let allEntries = verlaufFilterEntries(baseEntries)
    .map(e=>({...e, _type: isInc?'einnahme':'ausgabe'}))
    .sort((a,b)=>b.date.localeCompare(a.date));
  const displayedEntries = sucheTransaktionen(verlaufSearch, allEntries);

  // Stats berechnen
  const total = allEntries.reduce((s,e)=>s+e.amt, 0);
  const count = allEntries.length;
  let avgPerMonth = 0;
  if(count){
    const dates = allEntries.map(e=>e.date);
    const minD = dates.reduce((a,b)=>a<b?a:b);
    const maxD = dates.reduce((a,b)=>a>b?a:b);
    avgPerMonth = total / getMonthsBetween(minD, maxD);
  }
  // grandTotal also includes recurring so the "Anteil" percentage stays consistent
  let allOfTypeArr = (isInc ? DATA.incomes : DATA.expenses).slice();
  if(!isInc){
    const {von, bis} = verlaufGetRange();
    const rangeStart = von || dateStr(new Date(new Date().getFullYear(), new Date().getMonth()-11, 1));
    const rangeEnd   = bis || today();
    allOfTypeArr = [...allOfTypeArr, ...getRecurringOccurrences(rangeStart, rangeEnd, true, true)];
  }
  const grandTotal = verlaufFilterEntries(allOfTypeArr).reduce((s,e)=>s+e.amt, 0);
  const pct = grandTotal>0 ? total/grandTotal*100 : 0;
  const monthChart = buildMonthlyBarData(kat, verlaufType);

  let html = `
  <div style="padding:4px 16px 0">
    <!-- Visuals & Stats -->
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:14px;margin-bottom:4px">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px">
        <div>
          <div class="t-label">Gesamt</div>
          <div style="font-family:'DM Mono',monospace;font-size:14px;font-weight:700;margin-top:3px">${curr()} ${fmtAmt(total)}</div>
        </div>
        <div>
          <div class="t-label">Ø / Monat</div>
          <div style="font-family:'DM Mono',monospace;font-size:14px;font-weight:700;margin-top:3px">${curr()} ${fmtAmt(avgPerMonth)}</div>
        </div>
        <div>
          <div class="t-label">Anzahl</div>
          <div style="font-family:'DM Mono',monospace;font-size:14px;font-weight:700;margin-top:3px">${count}</div>
        </div>
      </div>
      <!-- Anteil-Balken -->
      <div style="margin-bottom:${monthChart?'12px':'0'}">
        <div style="display:flex;justify-content:space-between;margin-bottom:5px;font-size:11px;color:var(--text3)">
          <span>Anteil an Gesamt-${isInc?'Einnahmen':'Ausgaben'}</span>
          <span style="font-weight:700;color:var(--text)">${pct.toFixed(1)}%</span>
        </div>
        <div style="height:6px;background:var(--bg3);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${Math.min(pct,100).toFixed(1)}%;background:${catColor(kat)};border-radius:3px"></div>
        </div>
      </div>
      <!-- Monatliches Verlaufsdiagramm -->
      ${monthChart ? `<div style="overflow-x:hidden;margin-top:0">${monthChart}</div>` : ''}
    </div>
  </div>
  <!-- Trennlinie -->
  <div style="display:flex;align-items:center;gap:10px;padding:10px 16px 6px">
    <div style="flex:1;height:1px;background:var(--border)"></div>
    <span style="font-size:10px;font-weight:700;letter-spacing:.08em;color:var(--text3);text-transform:uppercase">Transaktionen</span>
    <div style="flex:1;height:1px;background:var(--border)"></div>
  </div>`;
  if(!displayedEntries.length){
    html += `<div class="empty" style="padding:24px 0"><div class="empty-text">${verlaufSearch?'Keine Treffer':'Keine Einträge'}</div>${!verlaufSearch?'<button class="empty-cta" onclick="goTab(\'eingabe\')"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Eintrag erfassen</button>':''}</div>`;
  } else {
    html += renderVerlaufEntryGroups(displayedEntries);
  }
  container.innerHTML = html;
  initSwipeToDelete(container);
}

// ── renderVerlauf: Haupt-Dispatcher ──────────────────────────────────────────
// Steuert Header-Anzeige und leitet an L1/L2/L3 weiter.
// Navigation-State: verlaufType, verlaufKat, verlaufL3SearchVis, verlaufSearch
function renderVerlauf(){
  const isL3 = verlaufKat !== null;
  // Zeitraum-Filter-Label aktualisieren
  const lbl = document.getElementById('verlauf-filter-label');
  if(lbl) lbl.textContent = verlaufGetRangeLabel();
  const typBar = document.getElementById('verlauf-type-bar');
  const l3Bar = document.getElementById('verlauf-l3-bar');
  if(typBar) typBar.style.display = isL3 ? 'none' : '';
  if(l3Bar) l3Bar.style.display = isL3 ? 'flex' : 'none';
  if(isL3){
    const titleEl = document.getElementById('verlauf-l3-title');
    if(titleEl) titleEl.textContent = verlaufKat;
  }
  if(!isL3){
    [['alle',''],['ausgaben',' expense'],['einnahmen',' income']].forEach(([t,cls])=>{
      const btn = document.getElementById('v-btn-'+t);
      if(btn) btn.className = 'type-btn'+(verlaufType===t?' active'+cls:'');
    });
  }
  const sw = document.getElementById('verlauf-search-wrap');
  const fb = document.getElementById('verlauf-filter-bar');
  if(fb) fb.style.display = '';
  if(sw) sw.style.display = (!isL3 || verlaufL3SearchVis) ? '' : 'none';
  const sbtn = document.getElementById('verlauf-l3-search-btn');
  if(sbtn) sbtn.style.color = verlaufL3SearchVis ? 'var(--accent)' : 'var(--text3)';
  const l1 = document.getElementById('verlauf-l1-content');
  const l2 = document.getElementById('verlauf-l2-content');
  const l3 = document.getElementById('verlauf-l3-content');
  if(l1) l1.style.display = (!isL3 && verlaufType==='alle') ? '' : 'none';
  if(l2) l2.style.display = (!isL3 && verlaufType!=='alle') ? '' : 'none';
  if(l3) l3.style.display = isL3 ? '' : 'none';
  if(isL3) renderVerlaufL3();
  else if(verlaufType!=='alle') renderVerlaufL2();
  else renderVerlaufL1();
}

// ── Navigation ────────────────────────────────────────────────────────────────
// verlaufSetType: wechselt Typ-Ansicht (L1 ↔ L2), resettet Suche und Kategorie
function verlaufSetType(t){
  verlaufType = t; verlaufKat = null;
  verlaufL3SearchVis = false; verlaufSearch = ''; verlaufL1Page = 1;
  const inp = document.getElementById('verlauf-search');
  if(inp) inp.value = '';
  renderVerlauf();
}
// verlaufOpenKatFromEl: Hilfsfunktion für data-kat onclick (umgeht Anführungszeichen-Problem)
function verlaufOpenKatFromEl(el){ verlaufOpenKat(el.dataset.kat); }
// verlaufOpenKat: öffnet L3 für eine Kategorie, resettet Suche
function verlaufOpenKat(name){
  verlaufKat = name; verlaufL3SearchVis = false; verlaufSearch = '';
  const inp = document.getElementById('verlauf-search');
  if(inp) inp.value = '';
  renderVerlauf();
}
// verlaufGoBack: kehrt von L3 zu L2 zurück
function verlaufGoBack(){
  verlaufKat = null; verlaufL3SearchVis = false; verlaufSearch = '';
  const inp = document.getElementById('verlauf-search');
  if(inp) inp.value = '';
  renderVerlauf();
}
// verlaufToggleL3Search: blendet Suchfeld auf L3 ein/aus
function verlaufToggleL3Search(){
  verlaufL3SearchVis = !verlaufL3SearchVis;
  if(!verlaufL3SearchVis){ verlaufSearch=''; const inp=document.getElementById('verlauf-search'); if(inp) inp.value=''; }
  const sw = document.getElementById('verlauf-search-wrap');
  if(sw) sw.style.display = verlaufL3SearchVis ? '' : 'none';
  const sbtn = document.getElementById('verlauf-l3-search-btn');
  if(sbtn) sbtn.style.color = verlaufL3SearchVis ? 'var(--accent)' : 'var(--text3)';
  if(verlaufL3SearchVis) setTimeout(()=>document.getElementById('verlauf-search')?.focus(), 50);
  else renderVerlaufL3();
}

// ═══════════════════════════════════════════════════════════════
// MODULE: VERLAUF ZEITRAUM-FILTER
// State: verlaufZeitraumMode, verlaufVonCustom, verlaufBisCustom
// ═══════════════════════════════════════════════════════════════
let verlaufZeitraumMode = 'monat'; // 'woche'|'monat'|'jahr'|'custom'
let verlaufVonCustom = '';
let verlaufBisCustom = '';
let verlaufFilterOpen = false;

function verlaufGetRange(){
  const now = new Date();
  const t = today();
  if(verlaufZeitraumMode==='woche'){
    const dow = now.getDay();
    const off = dow===0 ? -6 : 1-dow;
    const mon = new Date(now); mon.setDate(now.getDate()+off);
    return {von:dateStr(mon), bis:t};
  }
  if(verlaufZeitraumMode==='monat'){
    const von = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    return {von, bis:t};
  }
  if(verlaufZeitraumMode==='jahr'){
    return {von:`${now.getFullYear()}-01-01`, bis:t};
  }
  if(verlaufZeitraumMode==='custom'){
    return {von:verlaufVonCustom, bis:verlaufBisCustom};
  }
  return {von:'', bis:''};
}

function verlaufGetRangeLabel(){
  const {von, bis} = verlaufGetRange();
  if(verlaufZeitraumMode==='woche') return 'Diese Woche';
  if(verlaufZeitraumMode==='monat'){
    const now = new Date();
    return now.toLocaleDateString('de-CH',{month:'long',year:'numeric'});
  }
  if(verlaufZeitraumMode==='jahr') return `Jahr ${new Date().getFullYear()}`;
  if(verlaufZeitraumMode==='custom'){
    if(von && bis) return `${fmtDate(von)} – ${fmtDate(bis)}`;
    if(von) return `Ab ${fmtDate(von)}`;
    return 'Eigener Zeitraum';
  }
  return 'Zeitraum';
}

function toggleVerlaufFilter(){
  verlaufFilterOpen = !verlaufFilterOpen;
  const panel = document.getElementById('verlauf-filter-panel');
  const chev = document.getElementById('verlauf-filter-chevron');
  if(panel) panel.style.display = verlaufFilterOpen ? '' : 'none';
  if(chev) chev.style.transform = verlaufFilterOpen ? 'rotate(180deg)' : '';
  if(verlaufFilterOpen) renderVerlaufFilterSummary();
}

function setVerlaufZeitraum(mode){
  verlaufZeitraumMode = mode;
  const customDates = document.getElementById('vzm-custom-dates');
  if(customDates) customDates.style.display = mode==='custom' ? '' : 'none';
  ['woche','monat','jahr','custom'].forEach(m=>{
    const btn = document.getElementById('vzm-'+m);
    if(btn) btn.className = 'type-btn'+(m===mode?' active':'');
  });
  const lbl = document.getElementById('verlauf-filter-label');
  if(lbl) lbl.textContent = verlaufGetRangeLabel();
  renderVerlaufFilterSummary();
  renderVerlauf();
}

function setVerlaufCustomRange(){
  const von = document.getElementById('verlauf-von-input')?.value||'';
  const bis = document.getElementById('verlauf-bis-input')?.value||'';
  verlaufVonCustom = von; verlaufBisCustom = bis;
  const lbl = document.getElementById('verlauf-filter-label');
  if(lbl) lbl.textContent = verlaufGetRangeLabel();
  renderVerlaufFilterSummary();
  renderVerlauf();
}

// buildDonutSVG → moved to js/charts.js

// Cache for verlaufCalcSummary — invalidated whenever data or filter changes.
let _verlaufSummaryCache = null;
let _verlaufSummaryCacheKey = null;

// Berechnet Zeitraum-Summary (Ausgaben/Einnahmen/Netto + Top-Segmente für Donut)
function verlaufCalcSummary(){
  const {von, bis} = verlaufGetRange();
  const cacheKey = (von||'')+'|'+(bis||'')+'|'+DATA.expenses.length+'|'+DATA.incomes.length;
  if(_verlaufSummaryCache && _verlaufSummaryCacheKey === cacheKey) return _verlaufSummaryCache;
  let ausgaben=0, einnahmen=0;
  const byKat={};
  DATA.expenses.forEach(e=>{
    if((!von||e.date>=von)&&(!bis||e.date<=bis)){
      ausgaben+=e.amt;
      if(!byKat[e.cat]) byKat[e.cat]=0;
      byKat[e.cat]+=e.amt;
    }
  });
  DATA.incomes.forEach(e=>{
    if((!von||e.date>=von)&&(!bis||e.date<=bis)) einnahmen+=e.amt;
  });
  const sorted=Object.entries(byKat).sort((a,b)=>b[1]-a[1]);
  const top5=sorted.slice(0,5);
  const weitereAmt=sorted.slice(5).reduce((s,[,a])=>s+a,0);
  const segments=[
    ...top5.map(([name,amt])=>({name,amt,color:catColor(name)})),
    ...(weitereAmt>0?[{name:'Weitere',amt:weitereAmt,color:'#666'}]:[])
  ];
  const result = {ausgaben,einnahmen,netto:einnahmen-ausgaben,segments,top5,weitereAmt};
  _verlaufSummaryCache = result;
  _verlaufSummaryCacheKey = cacheKey;
  return result;
}

function renderVerlaufFilterSummary(){
  const el=document.getElementById('verlauf-filter-summary'); if(!el) return;
  const {ausgaben,einnahmen,netto,segments,top5,weitereAmt}=verlaufCalcSummary();
  const donut=buildDonutSVG(segments,ausgaben);
  el.innerHTML=`
  <div style="display:flex;gap:12px;align-items:flex-start;margin-top:8px">
    ${donut?`<div style="padding-top:4px">${donut}</div>`:''}
    <div class="flex-1">
      <div style="display:flex;justify-content:space-between;margin-bottom:3px">
        <span class="t-muted-sm">Ausgaben</span>
        <span style="font-family:'DM Mono',monospace;font-size:13px;font-weight:700;color:var(--red)">${curr()} ${fmtAmt(ausgaben)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:3px">
        <span class="t-muted-sm">Einnahmen</span>
        <span style="font-family:'DM Mono',monospace;font-size:13px;font-weight:700;color:var(--green)">${curr()} ${fmtAmt(einnahmen)}</span>
      </div>
      <div style="height:1px;background:var(--border);margin:5px 0"></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span class="t-muted-sm">Netto</span>
        <span style="font-family:'DM Mono',monospace;font-size:13px;font-weight:700;color:${netto>=0?'var(--green)':'var(--red)'}">${netto>=0?'+':'−'}${curr()} ${fmtAmt(Math.abs(netto))}</span>
      </div>
      ${top5.map(([name,amt])=>{
        const pct=ausgaben>0?amt/ausgaben*100:0;
        return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <div style="width:8px;height:8px;border-radius:2px;background:${catColor(name)};flex-shrink:0"></div>
          <div style="flex:1;min-width:0;font-size:11px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(name)}</div>
          <div style="font-size:11px;font-family:'DM Mono',monospace;color:var(--text3)">${pct.toFixed(0)}%</div>
        </div>`;
      }).join('')}
      ${weitereAmt>0?`<div style="font-size:10px;color:var(--text3);margin-top:2px">+ Weitere ${curr()} ${fmtAmt(weitereAmt)}</div>`:''}
    </div>
  </div>`;
}

// Gibt Einträge im aktuellen Verlauf-Zeitraum zurück (mit von/bis-Filter)
function toggleVerlaufExcludeGroups(){ /* Groups removed */ }

function verlaufFilterEntries(entries){
  const {von, bis} = verlaufGetRange();
  if(!von && !bis) return entries;
  return entries.filter(e=>(!von||e.date>=von)&&(!bis||e.date<=bis));
}

function renderCategories(){
  renderOberkategorien();
  // Also populate new-cat-parent dropdown
  fillParentDropdown('new-cat-parent', document.getElementById('new-cat-type')?.value||'ausgabe');
  // Build emoji grid for new category form
  buildEmojiGrid('new-cat-emoji-grid','new-cat-emoji');

  ['ausgabe','einnahme'].forEach(type=>{
    const cats = DATA.categories.filter(c=>c.type===type&&c.id!=='DELETED'&&c.name!=='DELETED');
    const container = document.getElementById('cats-'+type);
    if(!cats.length){
      container.innerHTML=`<div style="padding:16px;color:var(--text3);font-size:13px;text-align:center">Keine Kategorien</div>`;
      return;
    }

    const countMap = {};
    const allEntries = type==='ausgabe'?DATA.expenses:DATA.incomes;
    allEntries.forEach(e=>{ countMap[e.cat]=(countMap[e.cat]||0)+1; });

    // Current-month spend map for budget bars
    const nowD = new Date();
    const monStart = dateStr(new Date(nowD.getFullYear(), nowD.getMonth(), 1));
    const monEnd   = dateStr(new Date(nowD.getFullYear(), nowD.getMonth()+1, 0));
    const spendMap = {};
    if(type==='ausgabe'){
      DATA.expenses.forEach(e=>{
        if(e.date >= monStart && e.date <= monEnd) spendMap[e.cat]=(spendMap[e.cat]||0)+e.amt;
      });
    }

    // Group: parents first, then their children
    const parents = cats.filter(c=>!c.parent);
    const children = cats.filter(c=>c.parent);
    const rows = [];
    parents.forEach(p=>{
      rows.push(p);
      children.filter(c=>c.parent===p.name).forEach(c=>rows.push({...c,_child:true}));
    });
    // Orphans (parent not found)
    children.filter(c=>!parents.find(p=>p.name===c.parent)).forEach(c=>rows.push(c));

    container.innerHTML = rows.map(c=>{
      const budget = (CFG.catBudgets||{})[c.name];
      const spent  = spendMap[c.name]||0;
      const pct    = budget>0 ? Math.min(100, Math.round(spent/budget*100)) : 0;
      const barColor = pct>=100?'var(--red)':pct>=80?'var(--yellow)':'var(--accent)';
      const budgetBar = (budget>0 && type==='ausgabe') ? `
        <div style="margin-top:5px;height:3px;background:var(--bg3);border-radius:2px;overflow:hidden">
          <div style="height:100%;--bar-w:${pct}%;width:var(--bar-w);background:${barColor};border-radius:2px;animation:barGrow .55s cubic-bezier(.4,0,.2,1) both"></div>
        </div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px;font-family:'DM Mono',monospace">${curr()} ${fmtAmt(spent)} / ${fmtAmt(budget)}</div>` : '';
      return `
      <div class="cat-row" onclick="openCatModal('${c.id}')">
        <div class="cat-dot" style="background:${c.color};${c._child?'margin-left:16px':''}"></div>
        <div style="flex:1;min-width:0">
          <div class="cat-name" style="${c._child?'color:var(--text2);font-size:13px':''}">
            ${c._child?`<span style="color:var(--text3);font-size:11px">↳ </span>`:''}${esc(c.name)}
          </div>
          ${budgetBar}
        </div>
        <div class="cat-count">${countMap[c.name]||0}×</div>
        <div class="cat-type ${c.type}">${c.parent?esc(c.parent):c.type==='ausgabe'?'Ausgabe':'Einnahme'}</div>
        <svg class="chevron" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
      </div>`;
    }).join('');
  });
}

// Monthly equivalent of a recurring amount (for amortized total)
function _recurMonthlyAmt(r){
  if(!r.active) return 0;
  const iv = r.interval||'monatlich';
  // For gestaffelt, use the current effective step amount
  const baseAmt = (r.subType==='gestuft' && typeof _getStepAmt==='function') ? _getStepAmt(r, today()) : r.amt;
  if(iv==='monatlich')    return baseAmt;
  if(iv==='wöchentlich')  return baseAmt * 52 / 12;
  if(iv==='jährlich')     return baseAmt / 12;
  if(iv==='halbjährlich') return baseAmt / 6;
  if(iv==='semestral')    return baseAmt / 6;
  return baseAmt;
}

// Compute the next occurrence date of a recurring entry (on or after today)
function _nextRecurDate(r){
  const t = today();
  const start = r.start || t;
  const iv = r.interval || 'monatlich';
  const _ds = d => {
    const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${dd}`;
  };
  if(iv==='monatlich'){
    const now = new Date();
    const d = Math.min(r.day||1, new Date(now.getFullYear(), now.getMonth()+1, 0).getDate());
    let cand = new Date(now.getFullYear(), now.getMonth(), d);
    if(_ds(cand) < t) cand = new Date(now.getFullYear(), now.getMonth()+1, Math.min(r.day||1, new Date(now.getFullYear(), now.getMonth()+2, 0).getDate()));
    return _ds(cand);
  }
  if(iv==='wöchentlich'){
    let d = new Date(start.replace(/-/g,'/'));
    const td = new Date(t.replace(/-/g,'/'));
    while(d < td) d = new Date(d.getTime() + 7*86400000);
    return _ds(d);
  }
  const mkd = (base, monthAdd) => {
    const b = new Date(base.replace(/-/g,'/'));
    const m = b.getMonth() + monthAdd;
    return new Date(b.getFullYear() + Math.floor(m/12), ((m%12)+12)%12, b.getDate());
  };
  if(iv==='jährlich'){
    let d = new Date(start.replace(/-/g,'/'));
    const td = new Date(t.replace(/-/g,'/'));
    while(d < td) d = new Date(d.getFullYear()+1, d.getMonth(), d.getDate());
    return _ds(d);
  }
  if(iv==='halbjährlich'||iv==='semestral'){
    let d = new Date(start.replace(/-/g,'/'));
    const td = new Date(t.replace(/-/g,'/'));
    while(d < td){ const m=d.getMonth()+6; d=new Date(d.getFullYear()+Math.floor(m/12), m%12, d.getDate()); }
    return _ds(d);
  }
  return null;
}

function renderRecurring(){
  const container = document.getElementById('rec-list');
  if(!container) return;
  // Fix deletion bug: only show active entries (active===false means deleted/deactivated on Sheet)
  const recs = DATA.recurring.filter(r=>r.active!==false);

  // Render pending variable payments section
  const pendingWrap = document.getElementById('rec-pending-wrap');
  const pendingContainer = document.getElementById('rec-pending-list');
  if(pendingContainer && typeof getPendingVariableRecurrings==='function'){
    const pending = getPendingVariableRecurrings();
    if(pending.length){
      if(pendingWrap) pendingWrap.style.display='';
      pendingContainer.style.display='';
      pendingContainer.innerHTML = pending.map((p,i)=>{
        const inputId = `pending-amt-${p.r.id}-${p.date.replace(/-/g,'')}`;
        return `<div class="card-row" style="align-items:flex-start;flex-wrap:wrap;gap:6px;padding:12px 14px">
          <div class="card-row-icon" style="background:${catColor(p.r.cat)}22;flex-shrink:0">
            <span>${catEmoji(p.r.cat)}</span>
          </div>
          <div class="card-row-body" style="flex:1;min-width:0">
            <div class="card-row-title">${esc(p.r.what)}</div>
            <div class="card-row-sub" style="color:var(--orange)">Fällig: ${fmtDate(p.date)}</div>
          </div>
          <div style="display:flex;gap:6px;align-items:center;margin-top:2px;width:100%;padding-left:44px">
            <input id="${inputId}" type="number" class="input-field" style="width:110px;font-size:13px" placeholder="${curr()} Betrag" min="0" step="0.01" value="${p.r.amt||''}">
            <button class="btn btn-primary" style="font-size:12px;padding:6px 12px" onclick="confirmVariablePayment('${p.r.id}','${p.date}','${inputId}')">Buchen</button>
          </div>
        </div>`;
      }).join('');
    } else {
      if(pendingWrap) pendingWrap.style.display='none';
      pendingContainer.style.display='none';
      pendingContainer.innerHTML='';
    }
  }

  if(!recs.length){
    container.innerHTML=`<div class="empty"><div class="empty-icon"><svg viewBox="0 0 24 24" style="width:40px;height:40px;stroke:var(--border2);fill:none;stroke-width:1.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.08-4.36"/></svg></div><div class="empty-text">Noch keine Daueraufträge</div><button class="empty-cta" onclick="toggleAboForm()"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Ersten Dauerauftrag anlegen</button></div>`;
    return;
  }

  const todayStr = today();
  const ausgaben  = recs.filter(r=>r.type!=='einnahme');
  const einnahmen = recs.filter(r=>r.type==='einnahme');
  const totalAusgaben  = ausgaben.reduce((s,r)=>s+_recurMonthlyAmt(r),0);
  const totalEinnahmen = einnahmen.reduce((s,r)=>s+_recurMonthlyAmt(r),0);
  const hasMixed = recs.some(r=>(r.interval||'monatlich')!=='monatlich');

  // Render one entry row
  const renderRow = r => {
    const expired = r.endDate && r.endDate < todayStr;
    const expiringSoon = r.endDate && !expired && r.endDate <= dateStr(new Date(Date.now()+30*86400000));
    let endBadge = '';
    if(expired)           endBadge=`<span style="background:var(--red)22;color:var(--red);font-size:10px;padding:1px 5px;border-radius:4px;margin-left:4px">abgelaufen</span>`;
    else if(expiringSoon) endBadge=`<span style="background:var(--yellow)22;color:var(--yellow);font-size:10px;padding:1px 5px;border-radius:4px;margin-left:4px">bis ${fmtDate(r.endDate)}</span>`;
    else if(r.endDate)    endBadge=`<span style="color:var(--text3);font-size:11px"> · bis ${fmtDate(r.endDate)}</span>`;
    const nextDate = !expired && r.subType!=='variabel' ? _nextRecurDate(r) : null;
    const nextLabel = nextDate ? `<span style="color:var(--text3);font-size:11px"> · nächste: ${fmtDate(nextDate)}</span>` : '';
    const iv = r.interval||'monatlich';
    const ivBadge = iv!=='monatlich'
      ? `<span style="background:rgba(96,165,250,.15);color:var(--blue);font-size:10px;padding:1px 6px;border-radius:4px;margin-left:4px">${iv}</span>`
      : '';
    const st = r.subType||'normal';
    const stBadge = st==='variabel'
      ? `<span style="background:rgba(251,146,60,.18);color:var(--orange,#fb923c);font-size:10px;padding:1px 6px;border-radius:4px;margin-left:4px">variabel</span>`
      : st==='gestuft'
      ? `<span style="background:rgba(96,165,250,.15);color:var(--blue);font-size:10px;padding:1px 6px;border-radius:4px;margin-left:4px">gestaffelt</span>`
      : '';
    const displayAmt = st==='gestuft' && typeof _getStepAmt==='function'
      ? `${curr()} ${fmtAmt(_getStepAmt(r, todayStr))}`
      : st==='variabel' ? `~ ${curr()} ${fmtAmt(r.amt)}`
      : `${curr()} ${fmtAmt(r.amt)}`;
    const amtClass = r.type==='einnahme' ? 'income' : 'expense';
    return `<div class="card-row" onclick="openRecModal('${r.id}')" style="${expired?'opacity:0.5':''}">
      <div class="card-row-icon" style="background:${catColor(r.cat)}22"><span>${catEmoji(r.cat)}</span></div>
      <div class="card-row-body">
        <div class="card-row-title">${esc(r.what)}${ivBadge}${stBadge}${endBadge}</div>
        <div class="card-row-sub">${r.day}.${r.start?' · ab '+fmtDate(r.start):''}${nextLabel}${r.affectsAvg?' · <span style="color:var(--accent);font-size:10px">Ø</span>':''}${r.note?' · '+esc(r.note):''}</div>
      </div>
      <div class="card-row-amount ${amtClass}">${r.type==='einnahme'?'+':''}${displayAmt}</div>
      <svg class="chevron" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
    </div>`;
  };

  // Stats summary header
  const statsHtml = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px 16px 12px">
    <div style="background:var(--bg2);border-radius:8px;padding:8px 10px;border:1px solid var(--border)">
      <div style="font-size:10px;color:var(--text3);margin-bottom:2px">∑ Ausgaben / Monat${hasMixed?' (anteilig)':''}</div>
      <div style="font-family:'DM Mono',monospace;font-size:14px;font-weight:700;color:var(--red)">− ${curr()} ${fmtAmt(totalAusgaben)}</div>
    </div>
    <div style="background:var(--bg2);border-radius:8px;padding:8px 10px;border:1px solid var(--border)">
      <div style="font-size:10px;color:var(--text3);margin-bottom:2px">∑ Einnahmen / Monat${hasMixed?' (anteilig)':''}</div>
      <div style="font-family:'DM Mono',monospace;font-size:14px;font-weight:700;color:var(--green)">+ ${curr()} ${fmtAmt(totalEinnahmen)}</div>
    </div>
  </div>`;

  // Ausgaben section
  const ausgabenHtml = ausgaben.length ? `
    <div style="padding:0 16px 4px;font-size:11px;font-weight:600;color:var(--text3);letter-spacing:.06em;text-transform:uppercase">Ausgaben & Fixkosten</div>
    <div class="card" style="margin:0 16px 12px">${ausgaben.map(renderRow).join('')}</div>` : '';

  // Einnahmen section
  const einnahmenHtml = einnahmen.length ? `
    <div style="padding:0 16px 4px;font-size:11px;font-weight:600;color:var(--text3);letter-spacing:.06em;text-transform:uppercase">Wiederkehrende Einnahmen</div>
    <div class="card" style="margin:0 16px 12px">${einnahmen.map(renderRow).join('')}</div>` : '';

  container.innerHTML = statsHtml + ausgabenHtml + einnahmenHtml;
}


// ═══════════════════════════════════════════════════════════════
// HOME — Wiedereinstieg-Dashboard
// Einspaltig, kuratiert. Drei Aufgaben: zeigen was während der
// Abwesenheit passiert ist, Budget-Status, schneller Eintrag.
// ═══════════════════════════════════════════════════════════════

// Wie viele Tage liegt ein Datum zurück?
function _daysSince(dateStr){
  if(!dateStr) return 0;
  const a = new Date(dateStr+'T12:00:00'), b = new Date(today()+'T12:00:00');
  return Math.round((b - a) / 86400000);
}

function renderHome(){
  const el = document.getElementById('tab-home');
  if(!el) return;

  // Letzten Besuch genau einmal pro Tag "konsumieren": Snapshot des
  // vorherigen Besuchsdatums festhalten, dann lastVisitDate auf heute setzen.
  // renderHome läuft mehrmals pro Session — _homeVisitRead verhindert
  // wiederholtes Verschieben des Snapshots.
  if(CFG._homeVisitRead !== today()){
    CFG._lastVisitSnapshot = CFG.lastVisitDate || '';
    CFG._homeVisitRead = today();
    CFG.lastVisitDate = today();
    cfgSave();
  }
  const daysAway = _daysSince(CFG._lastVisitSnapshot);

  let html = '';

  // ── 1. Begrüssung + Uhr ──
  html += `<div class="section" style="padding-bottom:6px">${renderWidgetGreeting()}</div>`;

  // ── 2. Catch-up-Banner (nur wenn ≥ 3 Tage weg) ──
  if(daysAway >= 3){
    html += renderHomeCatchup(CFG._lastVisitSnapshot, daysAway);
  }

  // ── 3. Offene Dauerauftrag-Bestätigungen ──
  html += renderHomeRenewals();

  // ── 4. Budget-Status (Lohnzyklus) ──
  html += `<div class="section pt-0">
    <div class="card" style="padding:16px;cursor:pointer" onclick="goTab('lohn')">${renderWidgetLohnzyklus()}</div>
  </div>`;

  // ── 5. Heute + Ø Tagesausgabe ──
  html += `<div class="section pt-0">
    <div class="card" style="padding:16px">${renderHomeHeute()}</div>
  </div>`;

  // ── 6. Top Kategorien im Lohnzyklus (wohin fliesst das Geld) ──
  html += `<div class="section pt-0">
    <div class="card" style="padding:16px;cursor:pointer" onclick="goTab('verlauf')">${renderWidgetTopKategorien()}</div>
  </div>`;

  // ── 7. Letzte Buchungen ──
  html += renderHomeRecent();

  // ── 8. Aktien-Teaser (nur wenn aktiviert) ──
  if(CFG.aktienEnabled){
    html += `<div class="section pt-0">
      <button class="card" style="width:100%;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;border:none;text-align:left" onclick="goTab('aktien')">
        <span style="display:flex;align-items:center;gap:10px">
          <svg viewBox="0 0 24 24" style="width:18px;height:18px;stroke:var(--accent);fill:none;stroke-width:2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
          <span style="font-size:14px;font-weight:600;color:var(--text)">Aktien &amp; Portfolio</span>
        </span>
        <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:var(--text3);fill:none;stroke-width:2"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>`;
  }

  el.innerHTML = html;
  startGreetingClock();
}

// Catch-up-Karte: was ist passiert seit dem letzten Besuch
function renderHomeCatchup(since, daysAway){
  // Materialisierte Daueraufträge im Abwesenheitsfenster
  const autoBooked = DATA.expenses.filter(e=>e.recurringId && e.date>since && e.date<=today());
  const autoSum = autoBooked.reduce((s,e)=>s+e.amt,0);
  // Manuelle Buchungen seit dem letzten Besuch (nicht von heute)
  const manualNew = DATA.expenses.filter(e=>!e.recurringId && e.date>since && e.date<today());
  const manualSum = manualNew.reduce((s,e)=>s+e.amt,0);

  let lines = '';
  if(autoBooked.length){
    lines += `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:4px 0;font-size:13px">
      <span style="color:var(--text2)">${autoBooked.length} Dauerauftr${autoBooked.length===1?'ag':'äge'} automatisch gebucht</span>
      <span style="font-family:'DM Mono',monospace;color:var(--text2)">${curr()} ${fmtAmt(autoSum)}</span>
    </div>`;
  }
  if(manualNew.length){
    lines += `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:4px 0;font-size:13px">
      <span style="color:var(--text2)">${manualNew.length} eigene Buchung${manualNew.length===1?'':'en'}</span>
      <span style="font-family:'DM Mono',monospace;color:var(--text2)">${curr()} ${fmtAmt(manualSum)}</span>
    </div>`;
  }
  if(!lines){
    lines = `<div style="font-size:13px;color:var(--text3);padding:4px 0">Keine Buchungen in der Zwischenzeit.</div>`;
  }

  return `<div class="section pt-0">
    <div class="card" style="padding:16px;border:1px solid var(--accent);background:rgba(var(--accent-rgb,100,220,120),.05)">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <svg viewBox="0 0 24 24" style="width:17px;height:17px;stroke:var(--accent);fill:none;stroke-width:2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
        <span style="font-size:15px;font-weight:700;color:var(--text)">Willkommen zurück</span>
      </div>
      <div style="font-size:13px;color:var(--text3);margin-bottom:8px">${daysAway} Tage nicht hier gewesen.</div>
      ${lines}
      <button class="save-btn" style="width:100%;margin-top:12px" onclick="goTab('verlauf')">Verlauf ansehen</button>
    </div>
  </div>`;
}

// Offene Dauerauftrag-Bestätigungen als Inline-Karten (statt im Notif-Overlay)
function renderHomeRenewals(){
  const renewals = (CFG.notifications||[]).filter(n=>n.type==='dauerauftrag_renewal' && !n.dismissed);
  if(!renewals.length) return '';
  const rows = renewals.map(n=>`
    <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-top:1px solid var(--border)">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--text);overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(n.title||'')}</div>
        <div style="font-size:11px;color:var(--text3)">${esc(n.body||'')}</div>
      </div>
      <button onclick="event.stopPropagation();confirmRecurringRenewal('${n.id}')" style="font-size:12px;padding:5px 12px;border-radius:8px;border:1px solid var(--green);background:rgba(100,220,120,.1);color:var(--green);font-weight:600;cursor:pointer;flex-shrink:0">Ja</button>
      <button onclick="event.stopPropagation();skipRecurringRenewal('${n.id}')" style="font-size:12px;padding:5px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text3);cursor:pointer;flex-shrink:0">Nein</button>
    </div>`).join('');
  return `<div class="section pt-0">
    <div class="card" style="padding:14px 16px;border:1px solid rgba(255,209,102,.25);background:rgba(255,209,102,.05)">
      <div style="font-size:13px;font-weight:700;color:var(--yellow);margin-bottom:2px">Daueraufträge bestätigen</div>
      <div style="font-size:11px;color:var(--text3)">Neuer Lohnzyklus — laufen diese weiter?</div>
      ${rows}
    </div>
  </div>`;
}

// Heute-Zusammenfassung + Ø Tagesausgabe
function renderHomeHeute(){
  const t = today();
  const todayExp = DATA.expenses.filter(e=>e.date===t);
  const todayInc = DATA.incomes.filter(e=>e.date===t);
  const outVar = todayExp.filter(e=>!isFixkostenEntry(e)).reduce((s,e)=>s+e.amt,0);
  const outFix = todayExp.filter(e=>isFixkostenEntry(e)).reduce((s,e)=>s+e.amt,0);
  const inSum  = todayInc.reduce((s,e)=>s+e.amt,0);
  const z = (typeof getZyklusInfo==='function') ? getZyklusInfo() : null;
  const dailyBudget = z && z.hasSalary && z.daysLeft>=0 ? z.dailyRate : null;
  const over = dailyBudget!==null && outVar > dailyBudget;
  const amtColor = dailyBudget===null ? 'var(--text)' : over ? 'var(--red)' : 'var(--green)';

  let html = `<div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:4px">
    <div>
      <div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--text3)">HEUTE</div>
      <div style="font-family:'DM Mono',monospace;font-size:30px;font-weight:700;line-height:1.1;color:${amtColor}">${curr()}&nbsp;${fmtAmt(outVar)}</div>
    </div>
    <button class="save-btn" style="padding:8px 14px;font-size:13px" onclick="goTab('eingabe')">+ Erfassen</button>
  </div>`;
  const sub = [];
  if(outFix>0) sub.push(`+ ${curr()} ${fmtAmt(outFix)} Fixkosten`);
  if(inSum>0)  sub.push(`<span style="color:var(--green)">+ ${curr()} ${fmtAmt(inSum)} Einnahmen</span>`);
  if(dailyBudget!==null) sub.push(`Tagesbudget ${curr()} ${fmtAmt(dailyBudget)}`);
  if(sub.length) html += `<div style="font-size:12px;color:var(--text3);margin-top:2px">${sub.join(' · ')}</div>`;
  return html;
}

// Letzte Buchungen (max 8, nach Datum) — Klick öffnet Bearbeiten
function renderHomeRecent(){
  const entries = [
    ...DATA.expenses.map(e=>({...e,_t:'ausgabe'})),
    ...DATA.incomes.map(e=>({...e,_t:'einnahme'})),
  ].sort((a,b)=> b.date.localeCompare(a.date) || (b.id>a.id?1:-1)).slice(0,8);

  if(!entries.length){
    return `<div class="section pt-0">
      <div class="empty" style="padding:24px 0">
        <div class="empty-text">Noch keine Buchungen</div>
        <button class="empty-cta" onclick="goTab('eingabe')"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Ersten Eintrag erfassen</button>
      </div>
    </div>`;
  }

  const rows = entries.map(e=>{
    const par = parentOf(e.cat);
    const sub = (par?esc(par)+' › ':'')+esc(e.cat);
    return `<div class="card-row" onclick="openEditModal('${escJs(e.id)}','${e._t}')">
      <div class="card-row-icon" style="background:${catColor(e.cat)}22"><span>${catEmoji(e.cat)}</span></div>
      <div class="card-row-body">
        <div class="card-row-title">${esc(e.what)}</div>
        <div class="card-row-sub">${sub} · ${fmtDate(e.date)}</div>
      </div>
      <div class="card-row-amount">${e._t==='einnahme'?'+ ':'− '}${fmtAmt(e.amt)}</div>
      <svg class="chevron" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
    </div>`;
  }).join('');

  return `<div class="section pt-0">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:0 16px 8px">
      <span style="font-size:13px;font-weight:700;color:var(--text2)">Letzte Buchungen</span>
      <button onclick="goTab('verlauf')" style="background:none;border:none;color:var(--accent);font-size:12px;font-weight:600;cursor:pointer">Alle →</button>
    </div>
    <div class="card" style="margin:0 16px">${rows}</div>
  </div>`;
}


// ── Greeting clock ───────────────────────────────────────────────────────────
let _greetingClockInterval = null;
function startGreetingClock(){
  if(_greetingClockInterval) clearInterval(_greetingClockInterval);
  const tick = () => {
    const el = document.getElementById('greeting-clock');
    if(!el){ clearInterval(_greetingClockInterval); _greetingClockInterval = null; return; }
    const n = new Date();
    const hh = String(n.getHours()).padStart(2,'0');
    const mm = String(n.getMinutes()).padStart(2,'0');
    const ss = String(n.getSeconds()).padStart(2,'0');
    el.innerHTML = `${hh}:${mm}<span style="font-size:.48em;color:var(--text3);vertical-align:middle;margin-left:2px">:${ss}</span>`;
  };
  tick();
  _greetingClockInterval = setInterval(tick, 1000);
}

function renderWidgetGreeting(){
  const now = new Date();
  const h = now.getHours();
  const greet = h<11 ? 'Guete Morge' : h<17 ? 'Grüezi' : 'Guete Abig';
  const name = CFG.userName ? `, ${CFG.userName}` : '';
  const wday = now.toLocaleDateString('de-CH',{weekday:'long'});
  const dat  = now.toLocaleDateString('de-CH',{day:'numeric',month:'long',year:'numeric'});
  return `<div style="padding:4px 0">
    <div style="font-size:20px;font-weight:700;letter-spacing:-.3px">${greet}${name}</div>
    <div style="font-size:13px;color:var(--text3);margin-top:4px">${wday}, ${dat}</div>
    <div id="greeting-clock" style="margin-top:10px;font-family:'DM Mono',monospace;font-size:34px;font-weight:300;letter-spacing:-1px;line-height:1;color:var(--text)"></div>
  </div>`;
}
function renderWidgetLohnzyklus(){
  const z = getZyklusInfo();
  const fmt = s => s.slice(8)+'.'+s.slice(5,7)+'.';
  const startLabel = fmt(z.startStr), endLabel = fmt(z.endStr);

  if(!z.hasSalary){
    return `<div>
      <div class="widget-title">Lohnzyklus <span style="font-weight:400;color:var(--text3)">${startLabel}–${endLabel}</span></div>
      <div style="background:rgba(255,209,102,.07);border:1px solid rgba(255,209,102,.2);border-radius:8px;padding:10px 12px;margin-bottom:10px">
        <div style="font-size:12px;color:var(--yellow);font-weight:600;margin-bottom:4px">Noch kein Lohn erfasst</div>
        <div style="font-size:12px;color:var(--text2);line-height:1.5">Einnahme erfassen und <strong style="color:var(--text)">«Als Lohn zählen»</strong> aktivieren. Lohntag: ${CFG.lohnTag||25}.</div>
      </div>
      <button onclick="event.stopPropagation();setType('einnahme');goTab('eingabe')" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--accent);background:rgba(var(--accent-rgb,100,220,120),.08);color:var(--accent);font-size:13px;font-weight:600;cursor:pointer">+ Einnahme erfassen</button>
    </div>`;
  }

  const pct      = z.varBudget>0 ? Math.min(100,Math.round(z.varSpent/z.varBudget*100)) : 0;
  const barColor = pct>=90?'var(--red)':pct>=70?'var(--yellow)':'var(--accent)';
  const remColor = z.varRemaining<0?'var(--red)':'var(--green)';
  const rateVal  = z.daysLeft>0 ? z.varRemaining/z.daysLeft : 0;

  // Helper: plain formula row
  const row = (label, sign, val, color) =>
    `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:2px 0;font-size:12px">
      <span style="color:var(--text3)">${sign} ${label}</span>
      <span style="font-family:'DM Mono',monospace;color:${color}">${curr()} ${fmtAmt(val)}</span>
    </div>`;

  // Toggle chip: shows active/inactive state, stops propagation
  const chip = (label, active, fn) =>
    `<button onclick="event.stopPropagation();${fn}()"
      style="font-size:10px;padding:2px 7px;border-radius:10px;cursor:pointer;
             background:${active?'rgba(var(--accent-rgb,100,220,120),.15)':'var(--bg3)'};
             border:1px solid ${active?'var(--accent)':'var(--border)'};
             color:${active?'var(--accent)':'var(--text3)'};"
      title="${active?'Klick: ausschliessen':'Klick: einbeziehen'}">${active?'✓ ':'+ '}${label}</button>`;

  // Übertrag: show prev-cycle breakdown inline when it's toggled on and non-zero
  const prevLbl = `${fmt(z.prevStartStr)}–${fmt(z.prevEndStr)}`;
  const carryoverDetail = z.inclCarryover && z.prevCarryoverRaw !== 0
    ? `<div style="font-size:10px;color:var(--text3);background:var(--bg2);border-radius:6px;padding:5px 8px;margin:2px 0 2px 8px;line-height:1.6">
        Vorperiode ${prevLbl}<br>
        + Lohn <span style="font-family:'DM Mono',monospace">${curr()} ${fmtAmt(z.prevLohn)}</span>
        − Fixkosten <span style="font-family:'DM Mono',monospace">${curr()} ${fmtAmt(z.prevFixKosten)}</span>
        − Variabel <span style="font-family:'DM Mono',monospace">${curr()} ${fmtAmt(z.prevVarSpent)}</span>
        = <strong style="color:${z.prevCarryoverRaw>=0?'var(--green)':'var(--red)'}">${curr()} ${fmtAmt(z.prevCarryoverRaw)}</strong>
      </div>` : '';

  // Exact day range label for the division: "ab morgen (X Tage: TT.MM. – TT.MM.)"
  const daysLeftStart = z.daysLeftStart;
  const daysLeftLabel = z.daysLeft > 0
    ? `÷ ${z.daysLeft} Tage (${daysLeftStart.getDate()}.${String(daysLeftStart.getMonth()+1).padStart(2,'0')}.–${fmt(z.endStr)})`
    : `letzter Tag`;

  return `<div>
    <div class="widget-title">Lohnzyklus <span style="font-weight:400;color:var(--text3)">${startLabel}–${endLabel}</span>
      <span style="font-size:10px;color:var(--text3);font-weight:400;margin-left:4px">Tag ${z.daysElapsed}/${z.cycleDays}</span>
    </div>

    <!-- Formula -->
    <div style="margin-bottom:6px">
      ${row('Lohn / Einnahmen', '+', z.lohn, 'var(--green)')}
      ${z.fixKosten>0 ? row('Fixkosten', '−', z.fixKosten, 'var(--text2)') : ''}

      <!-- Carryover row with toggle + detail -->
      <div style="display:flex;justify-content:space-between;align-items:center;padding:2px 0;font-size:12px">
        <span style="display:flex;align-items:center;gap:4px;color:var(--text3)">
          ${chip('Übertrag', z.inclCarryover, 'toggleBudgetCarryover')}
          ${z.inclCarryover && z.prevCarryoverRaw!==0
            ? `<span style="color:var(--text3)">${z.prevCarryoverRaw>=0?'+ Übertrag':'− Übertrag'}</span>`
            : ''}
        </span>
        ${z.inclCarryover && z.prevCarryoverRaw!==0
          ? `<span style="font-family:'DM Mono',monospace;color:${z.prevCarryoverRaw>=0?'var(--green)':'var(--red)'}">${curr()} ${fmtAmt(Math.abs(z.prevCarryoverRaw))}</span>`
          : `<span style="font-size:10px;color:var(--text3);font-style:italic">${z.inclCarryover?'Vorperiode: 0':'nicht einbezogen'}</span>`}
      </div>
      ${carryoverDetail}

      <div style="border-top:1px solid var(--border);margin:4px 0"></div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:2px 0;font-size:12px">
        <span style="color:var(--text2);font-weight:600">= Variables Budget</span>
        <span style="font-family:'DM Mono',monospace;font-weight:600;color:${z.varBudget<0?'var(--red)':'var(--text)'}">${curr()} ${fmtAmt(Math.abs(z.varBudget))}</span>
      </div>
      ${row('Ausgegeben (variabel)', '−', z.varSpent, 'var(--red)')}
    </div>

    <!-- Progress bar -->
    <div style="height:5px;border-radius:3px;background:var(--bg3);overflow:hidden;margin-bottom:8px">
      <div style="height:100%;width:${pct}%;background:${barColor};border-radius:3px;transition:width .4s"></div>
    </div>

    <!-- Result: Verbleibend + Tagesrate -->
    <div style="display:flex;justify-content:space-between;align-items:flex-end">
      <div>
        <div style="font-size:20px;font-weight:700;font-family:'DM Mono',monospace;color:${remColor}">${z.varRemaining<0?'−\u00a0':''}${curr()} ${fmtAmt(Math.abs(z.varRemaining))}</div>
        <div style="font-size:11px;color:var(--text3)">${z.varRemaining<0?'überzogen':'verbleibend'} · ${pct}% verbraucht</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:15px;font-weight:700;font-family:'DM Mono',monospace;color:${rateVal>0?'var(--accent)':'var(--red)'}">
          ${z.daysLeft>0 ? `${curr()} ${fmtAmt(Math.abs(rateVal))}/Tag` : 'letzter Tag'}
        </div>
        <div style="font-size:10px;color:var(--text3);margin-top:1px">${daysLeftLabel}</div>
      </div>
    </div>
  </div>`;
}

function renderWidgetTopKategorien(){
  const {start,end} = getCycleRange();
  const startStr=dateStr(start), endStr=dateStr(end);
  const catMap = {};
  // Manual expenses
  DATA.expenses.filter(e=>e.date>=startStr&&e.date<=endStr).forEach(e=>{
    const c = e.cat||'Sonstiges'; catMap[c]=(catMap[c]||0)+e.amt;
  });
  // Daueraufträge occurrences in cycle
  getRecurringOccurrences(startStr,endStr,true,true).forEach(e=>{
    const c = e.cat||'Sonstiges'; catMap[c]=(catMap[c]||0)+e.amt;
  });
  const sorted = Object.entries(catMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
  if(sorted.length===0) return `<div><div class="widget-title">Top Kategorien</div><div class="t-muted">Keine Ausgaben im Zyklus.</div></div>`;
  const total = Object.values(catMap).reduce((a,v)=>a+v,0);
  const max = sorted[0][1];
  return `<div>
    <div class="widget-title">Top Kategorien im Lohnzyklus</div>
    ${sorted.map(([cat,amt])=>{
      const pct = Math.round(amt/max*100);
      const col = catColor(cat);
      return `<div style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
          <span style="display:flex;align-items:center;gap:5px"><span style="width:7px;height:7px;border-radius:50%;background:${col};display:inline-block"></span>${esc(cat)}</span>
          <span class="t-mono">${curr()} ${fmtAmt(amt)} <span style="color:var(--text3);font-size:10px">${total>0?Math.round(amt/total*100):0}%</span></span>
        </div>
        <div style="height:4px;border-radius:2px;background:var(--bg3)"><div style="height:100%;width:${pct}%;background:${col};border-radius:2px;opacity:.85"></div></div>
      </div>`;
    }).join('')}
  </div>`;
}





// ═══════════════════════════════════════════════════════════════
// MODULE: VERLAUF SEARCH
// ═══════════════════════════════════════════════════════════════
let verlaufSearch = '';
function setVerlaufSearch(v){ verlaufSearch=v; verlaufL1Page=1; renderVerlauf(); }

