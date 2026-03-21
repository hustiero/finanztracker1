// ═══════════════════════════════════════════════════════════════
// MODULE: RENDER
// ═══════════════════════════════════════════════════════════════
// MODULE: MONATSÜBERSICHT
// ═══════════════════════════════════════════════════════════════
let mvYear = new Date().getFullYear();
let mvMonth = new Date().getMonth();
const mvMonths=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const mvWdays=['So','Mo','Di','Mi','Do','Fr','Sa'];

// ── Dashboard year navigation ──────────────────────────────────
let dashYear = new Date().getFullYear();

function getBookedYears(){
  const years = new Set([new Date().getFullYear()]);
  [...DATA.expenses, ...DATA.incomes].forEach(e=>{
    const y = new Date(e.date+'T12:00:00').getFullYear();
    if(y>2000 && y<2100) years.add(y);
  });
  return [...years].sort((a,b)=>a-b);
}

function prevDashYear(){
  const years = getBookedYears();
  const idx = years.indexOf(dashYear);
  if(idx > 0){ dashYear = years[idx-1]; renderDashboard(); }
}

function nextDashYear(){
  const years = getBookedYears();
  const idx = years.indexOf(dashYear);
  if(idx >= 0 && idx < years.length-1){ dashYear = years[idx+1]; renderDashboard(); }
}

function openMonthView(){
  mvYear=new Date().getFullYear(); mvMonth=new Date().getMonth();
  renderMonthView();
  document.getElementById('month-view').classList.add('open');
  Device.pushNav('monthview','month-view');
}
function closeMonthView(){
  document.getElementById('month-view').classList.remove('open');
}
function prevMvMonth(){ mvMonth--; if(mvMonth<0){mvMonth=11;mvYear--;} if(currentTab==='monat') renderMonat(); else renderMonthView(); }
function nextMvMonth(){ mvMonth++; if(mvMonth>11){mvMonth=0;mvYear++;} if(currentTab==='monat') renderMonat(); else renderMonthView(); }

function renderMonthView(){
  const now=new Date(), yr=mvYear, mo=mvMonth;
  const isCurrent = yr===now.getFullYear()&&mo===now.getMonth();
  document.getElementById('mv-title-text').textContent=mvMonths[mo]+' '+yr;
  document.getElementById('mv-next-btn').disabled=isCurrent;

  const mExp=DATA.expenses.filter(e=>{const d=new Date(e.date+'T12:00:00');return d.getMonth()===mo&&d.getFullYear()===yr;});
  const mInc=DATA.incomes.filter(e=>{const d=new Date(e.date+'T12:00:00');return d.getMonth()===mo&&d.getFullYear()===yr;});
  const totalOut=mExp.reduce((s,e)=>s+e.amt,0);
  const totalIn=mInc.reduce((s,e)=>s+e.amt,0);
  const bal=totalIn-totalOut;

  // Category breakdown (grouped by parent if set)
  const catMap={}; mExp.forEach(e=>{catMap[e.cat]=(catMap[e.cat]||0)+e.amt;});
  // Roll up subcategories to parent
  const parentMap={}; DATA.categories.forEach(c=>{if(c.parent)parentMap[c.name]=c.parent;});
  const parentTotals={};
  Object.entries(catMap).forEach(([cat,amt])=>{const key=parentMap[cat]||cat;parentTotals[key]=(parentTotals[key]||0)+amt;});
  const cats=Object.entries(parentTotals).sort(([,a],[,b])=>b-a).slice(0,6);
  const maxCat=cats[0]?.[1]||1;

  const dateSet=new Set([...mExp.map(e=>e.date),...mInc.map(e=>e.date)]);
  const sortedDates=[...dateSet].sort((a,b)=>b.localeCompare(a));
  const todayStr=today();

  document.getElementById('mv-content').innerHTML=`
    <div class="section pb-0">
      <div class="stats-grid" style="grid-template-columns:1fr 1fr 1fr;margin-bottom:0">
        <div class="stat-card">
          <div class="stat-label">Einnahmen</div>
          <div style="font-size:15px;font-family:'DM Mono',monospace;color:var(--green);font-weight:500;margin-top:2px">+${fmtAmt(totalIn)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Ausgaben</div>
          <div style="font-size:15px;font-family:'DM Mono',monospace;color:var(--red);font-weight:500;margin-top:2px">−${fmtAmt(totalOut)}</div>
        </div>
        <div class="stat-card" style="background:${bal>=0?'rgba(61,219,150,.07)':'rgba(255,77,109,.07)'}">
          <div class="stat-label">Bilanz</div>
          <div style="font-size:15px;font-family:'DM Mono',monospace;color:${bal>=0?'var(--green)':'var(--red)'};font-weight:500;margin-top:2px">${bal>=0?'+':''}${fmtAmt(bal)}</div>
        </div>
      </div>
    </div>

    ${cats.length?`
    <div class="section" style="padding-top:10px;padding-bottom:0">
      <div class="card" style="padding:12px 14px">
        ${cats.map(([cat,amt])=>`
          <div class="bar-wrap">
            <div class="bar-label-row">
              <span class="bar-label">${catEmoji(cat)} ${esc(cat)}</span>
              <span class="bar-val">${curr()} ${fmtAmt(amt)}</span>
            </div>
            <div class="bar-track"><div class="bar-fill" style="width:${(amt/maxCat*100).toFixed(1)}%;background:${catColor(cat)}"></div></div>
          </div>`).join('')}
      </div>
    </div>`:''}

    ${sortedDates.length?`
    <div class="section" style="padding-top:10px">
      <div class="card p-0">
        ${sortedDates.map(ds=>{
          const d=new Date(ds+'T12:00:00');
          const dExp=DATA.expenses.filter(e=>e.date===ds);
          const dInc=DATA.incomes.filter(e=>e.date===ds);
          const dOut=dExp.reduce((s,e)=>s+e.amt,0);
          const dIn=dInc.reduce((s,e)=>s+e.amt,0);
          const isToday=ds===todayStr;
          const entries=[...dInc.map(e=>({...e,t:'i'})),...dExp.map(e=>({...e,t:'e'}))];
          return `<div class="mv-day-group">
            <div class="mv-day-hdr">
              <span class="mv-day-lbl${isToday?' is-today':''}">${isToday?'Heute':mvWdays[d.getDay()]+' '+d.getDate()+'.'}</span>
              <span class="mv-day-totals">
                ${dIn>0?`<span style="color:var(--green)">+${fmtAmt(dIn)}</span>`:''}
                ${dOut>0?`<span class="t-red">−${fmtAmt(dOut)}</span>`:''}
              </span>
            </div>
            ${entries.map(e=>{
              const par=parentOf(e.cat);
              const catLabel=par?`${esc(par)} › ${esc(e.cat)}`:esc(e.cat);
              return `
              <div class="mv-entry">
                <span class="mv-entry-cat">${catEmoji(e.cat)} ${catLabel}</span>
                <span class="mv-entry-what">${esc(e.what)}</span>
                <span class="mv-entry-amt" style="color:${e.t==='i'?'var(--green)':'var(--red)'}">
                  ${e.t==='i'?'+':'−'}${fmtAmt(e.amt)}
                </span>
              </div>`;}).join('')}
          </div>`;
        }).join('')}
      </div>
    </div>`
    :`<div class="section"><div class="empty"><div class="empty-icon"><svg viewBox="0 0 24 24" style="width:40px;height:40px;stroke:var(--border2);fill:none;stroke-width:1.5"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg></div><div class="empty-text">Keine Einträge</div></div></div>`}
  `;
}

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

  const content = ()=>document.getElementById('content');
  const mv = ()=>document.getElementById('month-view');

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

    // 1. Month-view open: swipe right to close
    if(mv()?.classList.contains('open')){
      if(dx>0){ closeMonthView(); handled=true; return; }
    }

    // 2. Any open modal: swipe right to close
    const openModal = document.querySelector('.modal-overlay.show');
    if(openModal && dx>0){
      openModal.classList.remove('show'); handled=true; return;
    }

    // 3. Menu overlay open: swipe right to close
    const menuOv = document.getElementById('menu-overlay');
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

// ═══════════════════════════════════════════════════════════════
// Verlauf Navigation State (3 Ebenen)
let verlaufType = 'alle';         // 'alle' | 'ausgaben' | 'einnahmen'
let verlaufKat = null;            // null | string — gewählte Kategorie für L3
let verlaufL3SearchVis = false;   // Suchfeld auf L3 sichtbar?
let verlaufCatSort = 'amount';    // 'amount' | 'count' — sort for L2 tiles
let dashboardChartMonths = 3;

function renderAll(){
  fillAllDropdowns();
  renderVerlauf();
  renderCategories();
  renderRecurring();
  renderDashboard();
  renderHome();
  if(currentTab==='sparen') renderSparen();
  updatePageSub();
  autoMaterializeRecurrings();
  checkDueRecurrings();
  checkAllNotifications();
}

function updatePageSub(){
  document.getElementById('page-sub').textContent =
    currentTab==='eingabe' ? today() :
    currentTab==='verlauf' ? `${DATA.expenses.length+DATA.incomes.length} Einträge` :
    '';
}

function getRecurringInstances(startStr, endStr){
  const entries = [];
  const todayStr = today();
  const effectiveEnd = endStr < todayStr ? endStr : todayStr;
  for(const r of DATA.recurring){
    if(!r.active) continue;
    const rStart = r.start||'2020-01-01';
    const rEnd = r.endDate && r.endDate < effectiveEnd ? r.endDate : effectiveEnd;
    if(rStart > rEnd) continue;
    const push = ds => {
      if(ds >= startStr && ds <= rEnd && ds >= rStart)
        entries.push({id:r.id+'_'+ds, what:r.what, cat:r.cat, amt:r.amt, date:ds, note:r.note||'', _type:'recurring', _recurId:r.id});
    };
    if(r.interval==='monatlich'){
      let d = new Date(startStr+'T12:00:00');
      d = new Date(d.getFullYear(), d.getMonth(), r.day, 12);
      if(dateStr(d) < startStr) d = new Date(d.getFullYear(), d.getMonth()+1, r.day, 12);
      while(dateStr(d) <= rEnd){ push(dateStr(d)); d = new Date(d.getFullYear(), d.getMonth()+1, r.day, 12); }
    } else if(r.interval==='wöchentlich'){
      let d = new Date(Math.max(new Date(startStr+'T12:00:00'), new Date(rStart+'T12:00:00')));
      while(dateStr(d) <= rEnd){ push(dateStr(d)); d = new Date(d.getTime()+7*86400000); }
    } else if(r.interval==='jährlich'){
      const orig = new Date(rStart+'T12:00:00');
      let d = new Date(new Date(startStr+'T12:00:00').getFullYear(), orig.getMonth(), orig.getDate(), 12);
      if(dateStr(d) < startStr) d = new Date(d.getFullYear()+1, orig.getMonth(), orig.getDate(), 12);
      while(dateStr(d) <= rEnd){ push(dateStr(d)); d = new Date(d.getFullYear()+1, orig.getMonth(), orig.getDate(), 12); }
    } else if(r.interval==='halbjährlich'){
      const orig = new Date(rStart+'T12:00:00');
      let d = new Date(new Date(startStr+'T12:00:00').getFullYear(), orig.getMonth(), orig.getDate(), 12);
      if(dateStr(d) < rStart) d = new Date(d.getFullYear(), d.getMonth()+6, d.getDate(), 12);
      while(dateStr(d) <= rEnd){ push(dateStr(d)); d = new Date(d.getFullYear(), d.getMonth()+6, d.getDate(), 12); }
    }
  }
  return entries;
}

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
  const W=320, H=72, padB=16, padT=4;
  const chartW=W, chartH=H-padB-padT;
  const barW = Math.max(1, chartW/months-2);
  const bars = monthLabels.map((m,i)=>{
    const amt = monthData[m.key];
    const bh = amt>0 ? Math.max(2,(amt/maxAmt)*chartH) : 0;
    const x = i*(chartW/months);
    const y = padT+chartH-bh;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" fill="${catColor(kat)}" opacity="0.75" rx="1"/>`;
  });
  const labels = monthLabels.map((m,i)=>{
    if(i%3!==0 && i!==months-1) return '';
    const x = i*(chartW/months);
    return `<text x="${x.toFixed(1)}" y="${H-3}" font-size="8" fill="var(--text3)" font-family="DM Mono,monospace">${m.label}</text>`;
  }).filter(Boolean);
  return `<svg viewBox="0 0 ${W} ${H}" height="${H}" class="w-full">${bars.join('')}${labels.join('')}</svg>`;
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
            const isShadow = e._type==='shadow';
            const isGroup  = e._type==='groupEntry';
            const isFuture = isRec && e.date > today();
            const onclick  = isShadow
              ? `onclick="openGroupEntryDetail('${e.id}')"`
              : isGroup
              ? `onclick="openGroupEntryDetail('${e.id}')"`
              : isRec ? '' : `onclick="openEditModal('${e.id}','${e._type==='ausgabe'?'ausgabe':'einnahme'}')"`;
            const recLabel = isFuture
              ? `<span style="font-size:10px;color:var(--accent);font-weight:600;margin-left:3px">geplant</span>`
              : `<span style="font-size:10px;color:var(--text3);font-weight:400">Abo</span>`;
            // Shadow entry: shows group name, paid-by, and share amount
            if(isShadow){
              return `
              <div class="card-row shadow-entry" ${onclick}>
                <div class="card-row-icon shadow-icon" style="background:${catColor(e.cat)}15">
                  <span>${catEmoji(e.cat)}</span>
                </div>
                <div class="card-row-body">
                  <div class="card-row-title shadow-title">${esc(e.what)}</div>
                  <div class="card-row-sub">${parentOf(e.cat)?esc(parentOf(e.cat))+' › ':''}${esc(e.cat)}</div>
                  <div class="shadow-meta">
                    <span class="shadow-group-chip">${esc(e.groupName)}</span>
                    <span class="shadow-paidby">bezahlt von ${esc(e.paidBy)}</span>
                  </div>
                </div>
                <div class="card-row-amount shadow-amount">
                  <div>− ${fmtAmt(e.amt)}</div>
                  <div class="shadow-full">von ${fmtAmt(e.fullAmt)}</div>
                </div>
              </div>`;
            }
            // Gruppen-Meta für eigene Split-Buchungen (unterhalb card-row-sub)
            const splitTotal = e._fullAmt || (e.splitData && e.splitData.totalAmount) || 0;
            const hasSplitInfo = e.groupId && e.splitData && splitTotal && splitTotal !== e.amt;
            const isSplitOwn = !!e._isSplit || !!hasSplitInfo;
            const groupLabel = isGroup
              ? `<span class="group-entry-author">👤 ${esc(e.authorName)} · ${esc(groupName(e.groupId))}</span>`
              : '';
            const groupMeta = hasSplitInfo
              ? `<div class="shadow-meta" style="margin-top:2px">
                   <span class="shadow-group-chip">${esc(groupName(e.groupId))}</span>
                   <span class="shadow-full" style="font-size:10px;color:var(--text3)">von ${curr()} ${fmtAmt(splitTotal)}</span>
                 </div>`
              : e.groupId && !isGroup
              ? `<div class="shadow-meta" style="margin-top:2px">
                   <span class="shadow-group-chip">${esc(groupName(e.groupId))}</span>
                 </div>`
              : '';
            return `
            <div class="card-row${isGroup?' group-foreign-entry':''}${isSplitOwn?' split-own-entry':''}" ${onclick} style="${isRec?'opacity:'+(isFuture?'0.5':'0.7'):''}">
              <div class="card-row-icon" style="background:${catColor(e.cat)}22">
                <span>${isRec?'↻':catEmoji(e.cat)}</span>
              </div>
              <div class="card-row-body">
                <div class="card-row-title">${esc(e.what)}${isRec?' '+recLabel:''}</div>
                <div class="card-row-sub">${parentOf(e.cat)?esc(parentOf(e.cat))+' › ':'' }${esc(e.cat)}${e.note?' · '+esc(e.note):''}</div>
                ${groupLabel}
                ${groupMeta}
              </div>
              <div class="card-row-amount${isGroup?' foreign':''}">${e._type==='einnahme'?'+ ':'− '}${fmtAmt(e.amt)}</div>
              ${isRec||isGroup?'':`<svg class="chevron" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>`}
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }).join('');
}

const _VERLAUF_EMPTY = `<div class="empty"><div class="empty-icon"><svg viewBox="0 0 24 24" style="width:40px;height:40px;stroke:var(--border2);fill:none;stroke-width:1.5"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg></div><div class="empty-text">Keine Einträge</div></div>`;

// ── L1: Alle Buchungen ────────────────────────────────────────────────────────
// Zeigt alle Ausgaben, Einnahmen und aktive Daueraufträge chronologisch.
// Suche filtert über Bezeichnung, Kategorie, Betrag, Datum und Notiz.
function renderVerlaufL1(){
  const container = document.getElementById('verlauf-l1-content');
  if(!container) return;
  const {von, bis} = verlaufGetRange();
  const recurStart = von || dateStr(new Date(new Date().getFullYear(), new Date().getMonth()-11, 1));
  const recurEnd   = bis || today();
  // Eigene Gruppenbuchungen: Betrag auf persönlichen Anteil reduzieren
  const myId = (typeof _myGroupId==='function') ? _myGroupId() : (CFG.authUser||'');
  const myName = (typeof _myGroupName==='function') ? _myGroupName() : (CFG.userName||'Ich');

  const plainExpenses = DATA.expenses
    .filter(e => !e.groupId)
    .map(e => ({...e, _type:'ausgabe'}));

  const myGroupExpenses = DATA.expenses
    .filter(e => e.groupId && e.splitData?.participants)
    .map(e => {
      const parts = e.splitData.participants;
      const myShare = parts[myId]!==undefined ? parts[myId] : (parts[myName]!==undefined ? parts[myName] : undefined);
      const amt = (myShare !== undefined) ? Math.round(myShare * 100) / 100 : e.amt;
      const fullAmt = e.splitData.totalAmount || e.amt;
      return {
        ...e,
        amt,
        _fullAmt: fullAmt,
        _isSplit: amt !== fullAmt,
        _type: 'ausgabe'
      };
    });

  const groupExpensesNoSplit = DATA.expenses
    .filter(e => e.groupId && !e.splitData?.participants)
    .map(e => ({...e, _type:'ausgabe'}));

  let entries = [
    ...plainExpenses,
    ...myGroupExpenses,
    ...groupExpensesNoSplit,
    ...DATA.incomes.map(e=>({...e,_type:'einnahme'})),
    ...getRecurringOccurrences(recurStart, recurEnd, false, true)
  ];

  // Shadow entries (fremde Gruppenbuchungen, dein Anteil)
  if(CFG.showGroupEntries){
    const shadows = getGroupShadowEntries();
    entries = [...entries, ...shadows];
  }

  // Gruppen ausblenden wenn Toggle aktiv
  if(CFG.excludeGroupsFromVerlauf){
    entries = entries.filter(e=>!e.groupId);
  }

  entries = verlaufFilterEntries(entries);
  entries = sucheTransaktionen(verlaufSearch, entries);
  entries.sort((a,b)=>b.date.localeCompare(a.date));
  // Update group toggle button state
  const gtBtn = document.getElementById('verlauf-group-toggle');
  if(gtBtn) gtBtn.classList.toggle('active', !!CFG.showGroupEntries);
  if(!entries.length){ container.innerHTML = _VERLAUF_EMPTY; return; }
  container.innerHTML = renderVerlaufEntryGroups(entries);
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
    container.innerHTML = `<div class="empty"><div class="empty-text">Keine Kategorien</div></div>`;
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
    html += `<div class="empty" style="padding:24px 0"><div class="empty-text">${verlaufSearch?'Keine Treffer':'Keine Einträge'}</div></div>`;
  } else {
    html += renderVerlaufEntryGroups(displayedEntries);
  }
  container.innerHTML = html;
}

// ── renderVerlauf: Haupt-Dispatcher ──────────────────────────────────────────
// Steuert Header-Anzeige und leitet an L1/L2/L3 weiter.
// Navigation-State: verlaufType, verlaufKat, verlaufL3SearchVis, verlaufSearch
function renderVerlauf(){
  const isL3 = verlaufKat !== null;
  // Zeitraum-Filter-Label aktualisieren
  const lbl = document.getElementById('verlauf-filter-label');
  if(lbl) lbl.textContent = verlaufGetRangeLabel();
  // Header: Type-Switch oder Zurück-Button
  const typBar = document.getElementById('verlauf-type-bar');
  const l3Bar = document.getElementById('verlauf-l3-bar');
  if(typBar) typBar.style.display = isL3 ? 'none' : '';
  if(l3Bar) l3Bar.style.display = isL3 ? 'flex' : 'none';
  // L3-Titel aktualisieren
  if(isL3){
    const titleEl = document.getElementById('verlauf-l3-title');
    if(titleEl) titleEl.textContent = verlaufKat;
  }
  // Type-Button aktiv-Klassen setzen
  if(!isL3){
    [['alle',''],['ausgaben',' expense'],['einnahmen',' income']].forEach(([t,cls])=>{
      const btn = document.getElementById('v-btn-'+t);
      if(btn) btn.className = 'type-btn'+(verlaufType===t?' active'+cls:'');
    });
  }
  // Suchfeld sichtbar: immer auf L1/L2, per Toggle auf L3
  const sw = document.getElementById('verlauf-search-wrap');
  if(sw) sw.style.display = (!isL3 || verlaufL3SearchVis) ? '' : 'none';
  // Suchfeld-Icon auf L3 einfärben wenn aktiv
  const sbtn = document.getElementById('verlauf-l3-search-btn');
  if(sbtn) sbtn.style.color = verlaufL3SearchVis ? 'var(--accent)' : 'var(--text3)';
  // Content-Bereiche umschalten
  const l1 = document.getElementById('verlauf-l1-content');
  const l2 = document.getElementById('verlauf-l2-content');
  const l3 = document.getElementById('verlauf-l3-content');
  if(l1) l1.style.display = (!isL3 && verlaufType==='alle') ? '' : 'none';
  if(l2) l2.style.display = (!isL3 && verlaufType!=='alle') ? '' : 'none';
  if(l3) l3.style.display = isL3 ? '' : 'none';
  // Inhalt rendern
  if(isL3) renderVerlaufL3();
  else if(verlaufType!=='alle') renderVerlaufL2();
  else renderVerlaufL1();
}

// ── Navigation ────────────────────────────────────────────────────────────────
// verlaufSetType: wechselt Typ-Ansicht (L1 ↔ L2), resettet Suche und Kategorie
function verlaufSetType(t){
  verlaufType = t; verlaufKat = null;
  verlaufL3SearchVis = false; verlaufSearch = '';
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
function setDashboardMonths(m){ dashboardChartMonths=m; renderDashboard(); }

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

// Baut SVG-Donut (nur äusserer Ring) für Kategorie-Anteile
// segments: [{name, amt, color}], total: Gesamtbetrag
function buildDonutSVG(segments, total, size=100){
  if(!total || !segments.length) return '';
  const r=42, ir=26, cx=size/2, cy=size/2;
  let paths='', angle=-Math.PI/2;
  segments.forEach(seg=>{
    const frac = seg.amt/total;
    if(frac<0.001) return;
    const endA = angle + frac*2*Math.PI;
    const largeArc = frac>0.5?1:0;
    const x1=cx+r*Math.cos(angle), y1=cy+r*Math.sin(angle);
    const x2=cx+r*Math.cos(endA), y2=cy+r*Math.sin(endA);
    const ix1=cx+ir*Math.cos(endA), iy1=cy+ir*Math.sin(endA);
    const ix2=cx+ir*Math.cos(angle), iy2=cy+ir*Math.sin(angle);
    const d=`M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L${ix1.toFixed(2)} ${iy1.toFixed(2)} A${ir} ${ir} 0 ${largeArc} 0 ${ix2.toFixed(2)} ${iy2.toFixed(2)}Z`;
    paths+=`<path d="${d}" fill="${seg.color}" opacity="0.9"/>`;
    angle=endA;
  });
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="flex-shrink-0">${paths}</svg>`;
}

// Berechnet Zeitraum-Summary (Ausgaben/Einnahmen/Netto + Top-Segmente für Donut)
function verlaufCalcSummary(){
  const {von, bis} = verlaufGetRange();
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
  return {ausgaben,einnahmen,netto:einnahmen-ausgaben,segments,top5,weitereAmt};
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
let verlaufExcludeGroups = false;

function toggleVerlaufExcludeGroups(){
  verlaufExcludeGroups = !verlaufExcludeGroups;
  const btn = document.getElementById('verlauf-excl-groups-btn');
  if(btn) btn.classList.toggle('active', verlaufExcludeGroups);
  renderVerlauf();
}

function verlaufFilterEntries(entries){
  const {von, bis} = verlaufGetRange();
  let result = entries;
  if(von || bis) result = result.filter(e=>(!von||e.date>=von)&&(!bis||e.date<=bis));
  // Exclude event-group entries when toggle is active
  if(verlaufExcludeGroups){
    const eventGroupIds = new Set(DATA.groups.filter(g=>g.type==='event').map(g=>g.id));
    result = result.filter(e=>!e.groupId||!eventGroupIds.has(e.groupId));
  }
  return result;
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

    container.innerHTML = rows.map(c=>`
      <div class="cat-row" onclick="openCatModal('${c.id}')">
        <div class="cat-dot" style="background:${c.color};${c._child?'margin-left:16px':''}"></div>
        <div class="cat-name" style="${c._child?'color:var(--text2);font-size:13px':''}">
          ${c._child?`<span style="color:var(--text3);font-size:11px">↳ </span>`:''}${esc(c.name)}
        </div>
        <div class="cat-count">${countMap[c.name]||0}×</div>
        <div class="cat-type ${c.type}">${c.parent?esc(c.parent):c.type==='ausgabe'?'Ausgabe':'Einnahme'}</div>
        <svg class="chevron" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    `).join('');
  });
}

function renderRecurring(){
  const container = document.getElementById('rec-list');
  if(!DATA.recurring.length){
    container.innerHTML=`<div class="empty"><div class="empty-icon"><svg viewBox="0 0 24 24" style="width:40px;height:40px;stroke:var(--border2);fill:none;stroke-width:1.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.08-4.36"/></svg></div><div class="empty-text">Noch keine Daueraufträge</div></div>`;
    return;
  }
  const todayStr = today();
  const totalFix = DATA.recurring.filter(r=>r.active).reduce((s,r)=>s+r.amt,0);
  container.innerHTML = DATA.recurring.map(r=>{
    const expired = r.endDate && r.endDate < todayStr;
    const expiringSoon = r.endDate && !expired && r.endDate <= dateStr(new Date(Date.now()+30*86400000));
    let endBadge = '';
    if(expired) endBadge=`<span style="background:var(--red)22;color:var(--red);font-size:10px;padding:1px 5px;border-radius:4px;margin-left:4px">abgelaufen</span>`;
    else if(expiringSoon) endBadge=`<span style="background:var(--yellow)22;color:var(--yellow);font-size:10px;padding:1px 5px;border-radius:4px;margin-left:4px">bis ${fmtDate(r.endDate)}</span>`;
    else if(r.endDate) endBadge=`<span style="color:var(--text3);font-size:11px"> · bis ${fmtDate(r.endDate)}</span>`;
    return `
    <div class="card-row" onclick="openRecModal('${r.id}')" style="${expired?'opacity:0.5':''}">
      <div class="card-row-icon" style="background:${catColor(r.cat)}22">
        <span>${catEmoji(r.cat)}</span>
      </div>
      <div class="card-row-body">
        <div class="card-row-title">${esc(r.what)}${endBadge}</div>
        <div class="card-row-sub">${r.interval} · ${r.day}.${r.start?' · ab '+fmtDate(r.start):''}${r.affectsAvg?' · <span style="color:var(--accent);font-size:10px">Ø</span>':''}${r.note?' · '+esc(r.note):''}</div>
      </div>
      <div class="card-row-amount expense">${curr()} ${fmtAmt(r.amt)}</div>
      <svg class="chevron" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
    </div>`;
  }).join('')+`<div style="padding:10px 16px;border-top:1px solid var(--border);display:flex;justify-content:space-between;font-size:13px"><span class="t-text3">Total Fixkosten / Monat</span><span class="t-mono-bold">${curr()} ${fmtAmt(totalFix)}</span></div>`;
}

// ═══════════════════════════════════════════════════
//  HOME TAB – WIDGET SYSTEM
// ═══════════════════════════════════════════════════
const WIDGET_CATALOG = [
  { key:'greeting',        label:'Begrüssung',              sub:'Persönliche Begrüssung mit Datum' },
  { key:'lohnzyklus',      label:'Lohnzyklus',              sub:'Budget, Ausgaben & Tagesrate im Zyklus' },
  { key:'tagesavg',        label:'Ø Tagesausgaben',         sub:'Durchschnittliche Ausgaben pro Tag (laufender Monat, ohne Fixkosten)' },
  { key:'topKategorien',   label:'Top Kategorien (Zyklus)', sub:'Top 5 Ausgabenkategorien im Lohnzyklus' },
  { key:'monatsverlauf',   label:'Monatsverlauf (6 Mo.)',   sub:'Ausgaben-Balken der letzten 6 Monate' },
  { key:'heuteAusgaben',   label:'Heutige Ausgaben',        sub:'Alle Buchungen von heute' },
  { key:'sparquote',       label:'Zyklus-Sparquote',        sub:'Sparquote im laufenden Lohnzyklus' },
  { key:'monatSummary',    label:'Monats-Zusammenfassung',  sub:'Einnahmen, Ausgaben & Bilanz + Ø Tagesausgabe aktueller Monat' },
  { key:'monatKategorien', label:'Monats-Kategorien',       sub:'Top Ausgabenkategorien des aktuellen Monats' },
  { key:'kontostand',      label:'Kontostand-Verlauf',      sub:'Kontostand-Linienchart der letzten Monate' },
  { key:'jahresSparquote', label:'Jahres-Sparquote',        sub:'Sparquote und Zielerreichung für das laufende Jahr' },
  { key:'jahresKategorien',label:'Jahres-Kategorien',       sub:'Top 5 Ausgabenkategorien des laufenden Jahres' },
  { key:'monatsverlaufJahr',label:'Monatsverlauf Jahr',     sub:'Ein-/Ausgaben je Monat für das laufende Jahr' },
  { key:'verlaufZeitraum',  label:'Verlauf: Zeitraum',          sub:'Ausgaben, Einnahmen und Netto im gewählten Zeitraum mit Kategorie-Donut' },
  { key:'aktienDashboard',  label:'Aktien-Dashboard',         sub:'Portfolio-Wert, Tagesperformance, G/V und Positionen in einer Karte' },
  { key:'aktienPortfolio',  label:'Aktienportfolio',          sub:'Gesamtübersicht Aktien-Positionen & P&L' },
  { key:'aktienWert',       label:'Portfolio-Wert',           sub:'Aktueller Gesamtwert des Depots (prominent)' },
  { key:'aktienPnl',        label:'Depot Gewinn/Verlust',     sub:'Gesamt-P&L in Zielwährung und % (benötigt Live-Kurse)' },
  { key:'aktienTop',        label:'Top-Performer',            sub:'Aktie mit höchstem prozentualen Gewinn' },
  { key:'aktienVerteilung', label:'Portfolio-Verteilung',     sub:'Kuchendiagramm: Depotgewichtung nach Wert' },
  { key:'aktienPosition',   label:'Einzelposition',           sub:'Detailansicht einer Aktie (konfigurierbar)' },
  { key:'sparzieleOverview', label:'Sparziele',              sub:'Übersicht deiner Sparziele mit Fortschrittsbalken' },
];
const DEFAULT_HOME_WIDGETS = ['greeting','heuteAusgaben','lohnzyklus','topKategorien','tagesavg'];
let homeEditMode = false;
let homeKontoMonths = 3;

function getHomeWidgets(){
  if(!CFG.homeWidgets || CFG.homeWidgets.length===0) return [...DEFAULT_HOME_WIDGETS];
  return CFG.homeWidgets;
}

function saveHomeWidgets(arr){ CFG.homeWidgets=arr; cfgSave(); autoSyncProfile(); }

function toggleHomeEdit(){
  homeEditMode = !homeEditMode;
  renderHome();
}

function addWidget(key){
  const w = getHomeWidgets();
  if(!w.includes(key)){ w.push(key); saveHomeWidgets(w); }
  renderHome();
}

function removeWidget(key){
  const w = getHomeWidgets().filter(k=>k!==key);
  saveHomeWidgets(w);
  renderHome();
}

function moveWidget(key, dir){
  const w = getHomeWidgets();
  const i = w.indexOf(key);
  if(i<0) return;
  const j = i + dir;
  if(j<0 || j>=w.length) return;
  [w[i],w[j]] = [w[j],w[i]];
  saveHomeWidgets(w);
  renderHome();
}

// ── Tile sizes: widget key → CSS size class ──
// Sizes: 1x1, 2x1 (wide), 1x2 (tall), 2x2, 2x3, 2x4
const WIDGET_SIZES = {
  greeting:         '2x1',
  lohnzyklus:       '2x2',
  tagesavg:         '1x1',
  topKategorien:    '1x2',
  monatsverlauf:    '2x1',
  heuteAusgaben:    '1x1',
  sparquote:        '1x1',
  monatSummary:     '2x1',
  monatKategorien:  '1x2',
  kontostand:       '2x2',
  jahresSparquote:  '1x1',
  jahresKategorien: '1x2',
  monatsverlaufJahr:'2x2',
  verlaufZeitraum:  '2x2',
  aktienDashboard:  '2x2',
  aktienPortfolio:  '2x1',
  aktienWert:       '1x1',
  aktienPnl:        '1x1',
  aktienTop:        '1x1',
  aktienVerteilung: '1x2',
  aktienPosition:   '1x1',
  sparzieleOverview:'2x1',
};

/** Return tile CSS class for a widget key. Falls back to 2x1 (full-width mobile). */
function tileClass(key){ return 'tile-'+(WIDGET_SIZES[key]||'2x1'); }

// Widget → target tab mapping for clickable widgets
const WIDGET_TAB_MAP = {
  lohnzyklus:'lohn', tagesavg:'verlauf', topKategorien:'kategorien',
  monatsverlauf:'dashboard', heuteAusgaben:'verlauf', sparquote:'lohn',
  monatSummary:'monat', monatKategorien:'kategorien', kontostand:'dashboard',
  jahresSparquote:'dashboard', jahresKategorien:'kategorien',
  monatsverlaufJahr:'dashboard', verlaufZeitraum:'verlauf',
  aktienDashboard:'aktien', aktienPortfolio:'aktien', aktienWert:'aktien',
  aktienPnl:'aktien', aktienTop:'aktien', aktienVerteilung:'aktien', aktienPosition:'aktien',
  sparzieleOverview:'sparen',
};

function renderHome(){
  const el = document.getElementById('tab-home');
  if(!el) return;
  const aktienWidgetKeys = ['aktienDashboard','aktienPortfolio','aktienWert','aktienPnl','aktienTop','aktienVerteilung','aktienPosition'];
  const visibleCatalog = CFG.aktienEnabled ? WIDGET_CATALOG : WIDGET_CATALOG.filter(w=>!aktienWidgetKeys.includes(w.key));
  const allWidgets = getHomeWidgets();
  const widgets = CFG.aktienEnabled ? allWidgets : allWidgets.filter(k=>!aktienWidgetKeys.includes(k));
  const available = visibleCatalog.filter(c=>!widgets.includes(c.key));
  let html = '<div class="tile-grid">';

  // Active widgets
  widgets.forEach((key,idx)=>{
    const def = visibleCatalog.find(c=>c.key===key);
    if(!def) return;
    const targetTab = WIDGET_TAB_MAP[key];
    const clickAttr = targetTab && !homeEditMode ? ` onclick="goTab('${targetTab}')" style="cursor:pointer"` : '';
    html += `<div class="widget-card ${tileClass(key)}" id="widget-card-${key}"${clickAttr}>`;
    if(homeEditMode){
      html += `<div class="home-edit-row">
        <span class="home-edit-drag">⠿</span>
        <span style="flex:1;font-size:13px;font-weight:600">${def.label}</span>
        <button class="home-edit-btn" onclick="moveWidget('${key}',-1)" ${idx===0?'disabled':''}>↑</button>
        <button class="home-edit-btn" onclick="moveWidget('${key}',1)" ${idx===widgets.length-1?'disabled':''}>↓</button>
        <button class="home-edit-btn t-red" onclick="removeWidget('${key}')">✕</button>
      </div>`;
    } else {
      html += renderWidgetContent(key);
    }
    html += `</div>`;
  });

  html += '</div>'; // close tile-grid

  // Available to add (edit mode only)
  if(homeEditMode && available.length>0){
    html += `<div style="margin:0 16px 12px;padding:12px 0">
      <div class="widget-title" style="padding:0 0 8px">Verfügbare Kacheln</div>`;
    available.forEach(def=>{
      html += `<div class="home-avail-row">
        <div>
          <div style="font-size:13px;font-weight:600">${def.label}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">${def.sub}</div>
        </div>
        <button class="home-edit-btn" style="color:var(--accent);border-color:var(--accent)" onclick="addWidget('${def.key}')">+ Hinzufügen</button>
      </div>`;
    });
    html += `</div>`;
  }

  // Edit toggle button
  html += `<div style="padding:16px;text-align:center">
    <button onclick="toggleHomeEdit()" style="background:${homeEditMode?'var(--accent)':'var(--bg3)'};color:${homeEditMode?'var(--bg0)':'var(--text2)'};border:1px solid ${homeEditMode?'var(--accent)':'var(--border)'};border-radius:8px;padding:8px 20px;font-size:13px;font-weight:600">
      ${homeEditMode ? '✓ Fertig' : '⊞ Kacheln bearbeiten'}
    </button>
  </div>`;

  el.innerHTML = html;
}

function renderWidgetContent(key){
  switch(key){
    case 'greeting':         return renderWidgetGreeting();
    case 'lohnzyklus':       return renderWidgetLohnzyklus();
    case 'tagesavg':         return renderWidgetTagesavg();
    case 'topKategorien':    return renderWidgetTopKategorien();
    case 'monatsverlauf':    return renderWidgetMonatverlauf();
    case 'heuteAusgaben':    return renderWidgetHeuteAusgaben();
    case 'sparquote':        return renderWidgetSparquote();
    case 'monatSummary':     return renderWidgetMonatSummary();
    case 'monatKategorien':  return renderWidgetMonatKategorien();
    case 'kontostand':       return renderWidgetKontostand();
    case 'jahresSparquote':  return renderWidgetJahresSparquote();
    case 'jahresKategorien': return renderWidgetJahresKategorien();
    case 'monatsverlaufJahr':return renderWidgetMonatsverlaufJahr();
    case 'verlaufZeitraum':  return renderWidgetVerlaufZeitraum();
    case 'aktienDashboard':  return renderWidgetAktienDashboard();
    case 'aktienPortfolio':  return renderWidgetAktienPortfolio();
    case 'aktienWert':       return renderWidgetAktienWert();
    case 'aktienPnl':        return renderWidgetAktienPnl();
    case 'aktienTop':        return renderWidgetAktienTop();
    case 'aktienVerteilung': return renderWidgetAktienVerteilung();
    case 'aktienPosition':   return renderWidgetAktienPosition();
    case 'sparzieleOverview': return renderWidgetSparzieleOverview();
    default: return '';
  }
}

function renderWidgetGreeting(){
  const now = new Date();
  const h = now.getHours();
  const greet = h<11 ? 'Guete Morge' : h<17 ? 'Grüezi' : 'Guete Abig';
  const name = CFG.userName ? `, ${CFG.userName}` : '';
  const wday = now.toLocaleDateString('de-CH',{weekday:'long'});
  const dat  = now.toLocaleDateString('de-CH',{day:'numeric',month:'long',year:'numeric'});
  // Quick today stat
  const t = today();
  const todayVar = DATA.expenses.filter(e=>e.date===t&&!isFixkostenEntry(e)).reduce((s,e)=>s+e.amt,0);
  const z = getZyklusInfo();
  const budget = z.dailyRate;
  let statHtml = '';
  if(budget!==null){
    const over = todayVar > budget;
    statHtml = `<div style="margin-top:8px;font-size:12px;color:var(--text3)">
      Heute: <span style="font-family:'DM Mono',monospace;font-weight:600;color:${over?'var(--red)':'var(--green)'}">${curr()} ${fmtAmt(todayVar)}</span>
      <span style="color:var(--text3)"> / Budget ${curr()} ${fmtAmt(budget)}</span>
    </div>`;
  } else if(todayVar>0){
    statHtml = `<div style="margin-top:8px;font-size:12px;color:var(--text3)">
      Heute ausgegeben: <span style="font-family:'DM Mono',monospace;font-weight:600;color:var(--text)">${curr()} ${fmtAmt(todayVar)}</span>
    </div>`;
  }
  return `<div style="padding:4px 0">
    <div style="font-size:20px;font-weight:700;letter-spacing:-.3px">${greet}${name}</div>
    <div style="font-size:13px;color:var(--text3);margin-top:4px">${wday}, ${dat}</div>
    ${statHtml}
  </div>`;
}

// ── Widget: Verlauf Zeitraum ─────────────────────────────────────────────────
// Kompakte Version: Donut + 3 Kennzahlen. Klick → Verlauf mit gesetztem Filter.
function renderWidgetVerlaufZeitraum(){
  const {ausgaben,einnahmen,netto,segments}=verlaufCalcSummary();
  const donut=buildDonutSVG(segments,ausgaben,80);
  const label=verlaufGetRangeLabel();
  return `<div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:8px">${label}</div>
    <div style="display:flex;gap:10px;align-items:center">
      ${donut?`<div>${donut}</div>`:''}
      <div class="flex-1">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px">
          <span class="t-muted-sm">Ausgaben</span>
          <span style="font-family:'DM Mono',monospace;font-size:13px;font-weight:700;color:var(--red)">${curr()} ${fmtAmt(ausgaben)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:3px">
          <span class="t-muted-sm">Einnahmen</span>
          <span style="font-family:'DM Mono',monospace;font-size:13px;font-weight:700;color:var(--green)">${curr()} ${fmtAmt(einnahmen)}</span>
        </div>
        <div style="height:1px;background:var(--border);margin:4px 0"></div>
        <div style="display:flex;justify-content:space-between">
          <span class="t-muted-sm">Netto</span>
          <span style="font-family:'DM Mono',monospace;font-size:13px;font-weight:700;color:${netto>=0?'var(--green)':'var(--red)'}">${netto>=0?'+':'−'}${curr()} ${fmtAmt(Math.abs(netto))}</span>
        </div>
      </div>
    </div>
  </div>`;
}

function renderWidgetLohnzyklus(){
  const z = getZyklusInfo();
  if(!z.hasSalary){
    return `<div><div class="widget-title">Lohnzyklus</div><div class="t-muted">Kein Lohneingang erkannt.</div></div>`;
  }
  const pct = z.varBudget>0 ? Math.min(100,Math.round(z.varSpent/z.varBudget*100)) : 0;
  const barColor = pct>=90?'var(--red)':pct>=70?'var(--yellow)':'var(--accent)';
  const startLabel = z.startStr.slice(8)+'.'+z.startStr.slice(5,7)+'.';
  const endLabel   = z.endStr.slice(8)+'.'+z.endStr.slice(5,7)+'.';
  return `<div>
    <div class="widget-title">Lohnzyklus <span style="font-weight:400;color:var(--text3)">${startLabel}–${endLabel}</span></div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
      <span style="font-size:22px;font-weight:700;font-family:'DM Mono',monospace;color:${z.varRemaining<0?'var(--red)':'var(--text)'}">${z.varRemaining<0?'− ':''}${curr()} ${fmtAmt(Math.abs(z.varRemaining))}</span>
      <span class="t-muted-sm">${z.varRemaining<0?'überzogen':'verbleibend'}</span>
    </div>
    <div style="height:6px;border-radius:3px;background:var(--bg3);overflow:hidden;margin-bottom:8px">
      <div style="height:100%;width:${pct}%;background:${barColor};border-radius:3px;transition:width .4s"></div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text3)">
      <span>Variabel: <span style="color:var(--text);font-family:'DM Mono',monospace">${curr()} ${fmtAmt(z.varSpent)}</span></span>
      <span>Budget: <span style="color:var(--text);font-family:'DM Mono',monospace">${curr()} ${fmtAmt(z.varBudget)}</span></span>
    </div>
    ${z.dailyRate!==null?`<div style="margin-top:6px;font-size:12px;color:var(--text3)">Tagesrate: ${z.daysLeft>0&&z.varRemaining>0
      ?`<span style="color:var(--accent);font-family:'DM Mono',monospace">${curr()} ${fmtAmt(z.varRemaining/z.daysLeft)}/Tag</span> (${z.daysLeft} Tage verbleibend)`
      :`<span style="color:var(--red);font-weight:600">Budget aufgebraucht</span>`}</div>`:''}
  </div>`;
}

// ─── Shared render helpers (used by both widgets and tab views) ───

// Tagesausgabe stat-card — identical to what renderMonat() shows
function buildTagesavgCard(mo, yr){
  const now = new Date();
  const isCurrent = mo===now.getMonth() && yr===now.getFullYear();
  const daysElapsed = isCurrent ? now.getDate() : new Date(yr, mo+1, 0).getDate();
  const avg = avgDailyVarSpend(mo, yr, daysElapsed);
  const prevC = avgDailyVarSpendPrevComp(mo, yr);
  const diffPct = prevC.avg>0 ? (avg-prevC.avg)/prevC.avg*100 : null;
  const mNames = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  return `<div class="stats-grid mb-0">
    <div class="stat-card" style="grid-column:1/-1;cursor:pointer" onclick="openAvgConfig()">
      <div class="stat-label">Ø Tagesausgabe (ohne Fixkosten)
        ${diffPct!==null?`<span style="font-size:11px;color:${diffPct<=0?'var(--green)':'var(--red)'};margin-left:6px">${diffPct<=0?'↓':'↑'}${Math.abs(diffPct).toFixed(0)}% vs. ${mNames[prevC.prevMo]}</span>`:''}
        <span style="font-size:11px;color:var(--text3);margin-left:6px">⚙</span>
      </div>
      <div class="stat-value" style="font-size:18px">${curr()} ${fmtAmt(avg)}</div>
    </div>
  </div>`;
}

// Day entry group with optional virtual recurring entries (dRec).
// Virtual recurring appear with a "DA" badge; clicking opens openMaterializeModal().
function buildDayGroup(ds, dExp, dInc, dRec){
  const wdays = ['So','Mo','Di','Mi','Do','Fr','Sa'];
  const d = new Date(ds+'T12:00:00');
  const isToday = ds===today();
  // Filter virtual recurring: skip ones already materialized
  const dRecVirtual = (dRec||[]).filter(r=>!DATA.expenses.some(e=>e.recurringId===r._recurId&&e.date===ds));
  const dNet = dInc.reduce((s,e)=>s+e.amt,0) - dExp.reduce((s,e)=>s+e.amt,0) - dRecVirtual.reduce((s,e)=>s+e.amt,0);
  const entries = [
    ...dInc.map(e=>({...e,t:'i'})),
    ...dExp.map(e=>({...e,t:'e'})),
    ...dRecVirtual.map(e=>({...e,t:'r'}))
  ];
  return `<div class="mv-day-group">
    <div class="mv-day-hdr">
      <span class="mv-day-lbl${isToday?' is-today':''}">${isToday?'Heute':wdays[d.getDay()]+' '+d.getDate()+'.'}</span>
      <span class="mv-day-totals t-text2">${dNet>=0?'+':''}${fmtAmt(dNet)}</span>
    </div>
    ${entries.map(e=>{
      const par = parentOf(e.cat);
      const catLabel = par ? `${esc(par)} › ${esc(e.cat)}` : esc(e.cat);
      if(e.t==='r'){
        return `<div class="mv-entry" onclick="openMaterializeModal('${e._recurId}','${e.date}')" style="cursor:pointer;opacity:.65">
          <span class="mv-entry-cat t-text3">↻ ${catLabel}</span>
          <span class="mv-entry-what">${esc(e.what)}<span style="font-size:10px;margin-left:5px;padding:1px 5px;border:1px solid var(--border);border-radius:4px;background:var(--bg3);color:var(--text3)">DA</span></span>
          <span class="mv-entry-amt t-text3">−${fmtAmt(e.amt)}</span>
        </div>`;
      }
      return `<div class="mv-entry" onclick="openEditModal('${e.id}','${e.t==='i'?'einnahme':'ausgabe'}')" style="cursor:pointer">
        <span class="mv-entry-cat">${catEmoji(e.cat)} ${catLabel}</span>
        <span class="mv-entry-what">${esc(e.what)}</span>
        <span class="mv-entry-amt" style="color:${e.t==='i'?'var(--green)':'var(--red)'}">
          ${e.t==='i'?'+':'−'}${fmtAmt(e.amt)}
        </span>
      </div>`;
    }).join('')}
  </div>`;
}

function renderWidgetTagesavg(){
  // Exact same card as in renderMonat() — uses the shared helper
  return buildTagesavgCard(new Date().getMonth(), new Date().getFullYear());
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

function renderWidgetMonatverlauf(){
  const now = new Date();
  const months = [];
  for(let i=5;i>=0;i--){
    const d = new Date(now.getFullYear(),now.getMonth()-i,1);
    months.push({mo:d.getMonth(),yr:d.getFullYear(),label:d.toLocaleDateString('de-CH',{month:'short'})});
  }
  const totals = months.map(m=>{
    const s=`${m.yr}-${String(m.mo+1).padStart(2,'0')}-01`;
    const e=`${m.yr}-${String(m.mo+1).padStart(2,'0')}-${String(new Date(m.yr,m.mo+1,0).getDate()).padStart(2,'0')}`;
    const recur=getRecurringOccurrences(s,e,true,true).reduce((a,x)=>a+x.amt,0);
    return DATA.expenses.filter(x=>x.date>=s&&x.date<=e).reduce((a,x)=>a+x.amt,0)+recur;
  });
  const max = Math.max(...totals,1);
  const barH = 48;
  return `<div>
    <div class="widget-title">Monatsverlauf (6 Monate)</div>
    <div style="display:flex;align-items:flex-end;gap:4px;height:${barH+20}px;padding-bottom:18px;position:relative">
      ${totals.map((t,i)=>{
        const h = Math.max(4,Math.round(t/max*barH));
        const isCur = i===5;
        const m = months[i];
        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;justify-content:flex-end;height:100%;cursor:pointer"
          onclick="mvMonth=${m.mo};mvYear=${m.yr};goTab('monat');renderMonat()">
          <div style="width:100%;height:${h}px;background:${isCur?'var(--accent)':'var(--bg3)'};border-radius:3px 3px 0 0;opacity:${isCur?1:.8}"></div>
          <div style="font-size:9px;color:${isCur?'var(--accent)':'var(--text3)'};font-weight:${isCur?700:400};white-space:nowrap">${m.label}</div>
        </div>`;
      }).join('')}
    </div>
    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text3)">
      <span>Ø <span style="font-family:'DM Mono',monospace;color:var(--text2)">${curr()} ${fmtAmt(totals.reduce((a,v)=>a+v,0)/totals.filter(v=>v>0).length||1)}</span></span>
      <span>Akt.: <span style="font-family:'DM Mono',monospace;color:var(--accent)">${curr()} ${fmtAmt(totals[5])}</span></span>
    </div>
  </div>`;
}

function renderWidgetHeuteAusgaben(){
  const t = today();
  const dExp = DATA.expenses.filter(e=>e.date===t);
  const dInc = DATA.incomes.filter(e=>e.date===t);
  // Variable spending today (excluding fixkosten — what daily budget tracks)
  const todayVar = dExp.filter(e=>!isFixkostenEntry(e)).reduce((s,e)=>{
    if(e.groupId && e.splitData && e.splitData.participants){
      const _id = (typeof _myGroupId==='function') ? _myGroupId() : (CFG.authUser||'');
      const _nm = (typeof _myGroupName==='function') ? _myGroupName() : (CFG.userName||'');
      const parts = e.splitData.participants;
      const myShare = parts[_id]!==undefined ? parts[_id] : (parts[_nm]!==undefined ? parts[_nm] : undefined);
      return s + (myShare !== undefined ? myShare : e.amt);
    }
    return s + e.amt;
  },0);
  const todayFix  = dExp.filter(e=>isFixkostenEntry(e)).reduce((s,e)=>s+e.amt,0);
  const todayIn   = dInc.reduce((s,e)=>s+e.amt,0);
  // Virtual recurring for today (not yet materialized)
  const dRec = getRecurringOccurrences(t, t, false, true);

  // Daily budget and color — both display and comparison use variable spending
  const z = getZyklusInfo();
  const dailyBudget = z.dailyRate;
  const overBudget = dailyBudget!==null && todayVar > dailyBudget;
  const amtColor = dailyBudget===null ? 'var(--text)' : overBudget ? 'var(--red)' : 'var(--green)';

  let html = `<div>
    <div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--text3);margin-bottom:4px">HEUTE</div>
    <div style="font-family:'DM Mono',monospace;font-size:36px;font-weight:700;line-height:1;color:${amtColor};margin-bottom:4px">${curr()}&nbsp;${fmtAmt(todayVar)}</div>`;

  if(todayFix>0){
    html += `<div style="font-size:11px;color:var(--text3);margin-bottom:4px">+ ${curr()} ${fmtAmt(todayFix)} Fixkosten</div>`;
  }
  if(todayIn>0){
    html += `<div style="font-size:12px;color:var(--green);margin-bottom:4px">+${curr()} ${fmtAmt(todayIn)} Einnahmen</div>`;
  }

  if(dailyBudget!==null){
    const remaining = dailyBudget - todayVar;
    const remainingDisplay = remaining >= 0
      ? `noch <span class="t-mono">${curr()} ${fmtAmt(remaining)}</span>`
      : `− <span class="t-mono">${curr()} ${fmtAmt(Math.abs(remaining))}</span> überzogen`;
    html += `<div style="font-size:12px;color:var(--text3);margin-bottom:10px;display:flex;gap:12px;flex-wrap:wrap">
      <span>Tagesbudget: <span style="font-family:'DM Mono',monospace;color:var(--accent)">${curr()} ${fmtAmt(dailyBudget)}</span></span>
      <span style="color:${remaining>=0?'var(--green)':'var(--red)'}">${remainingDisplay}</span>
    </div>`;
  } else { html += `<div style="height:6px"></div>`; }

  if(!dExp.length && !dInc.length && !dRec.length){
    html += `<div style="font-size:13px;color:var(--text3)">Noch keine Buchungen heute.</div>`;
  } else {
    html += `<div style="margin:0 -14px;border-top:1px solid var(--border)">${buildDayGroup(t, dExp, dInc, dRec)}</div>`;
  }
  html += `</div>`;
  return html;
}

function renderWidgetSparquote(){
  const z = getZyklusInfo();
  if(!z.hasSalary) return `<div><div class="widget-title">Sparquote</div><div class="t-muted">Kein Lohneingang erkannt.</div></div>`;
  const ziel = CFG.mSparziel||0;
  const saved = z.lohn - z.fixKosten - z.varSpent;
  const pct = z.lohn>0 ? Math.round(saved/z.lohn*100) : 0;
  const zielPct = z.lohn>0 && ziel>0 ? Math.round(ziel/z.lohn*100) : 0;
  const barColor = saved<0?'var(--red)':pct>=zielPct?'var(--green)':'var(--yellow)';
  return `<div>
    <div class="widget-title">Sparquote (laufender Zyklus)</div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
      <span style="font-size:24px;font-weight:700;font-family:'DM Mono',monospace;color:${barColor}">${pct}%</span>
      ${zielPct>0?`<span class="t-muted-sm">Ziel: ${zielPct}%</span>`:''}
    </div>
    <div style="height:6px;border-radius:3px;background:var(--bg3);overflow:hidden">
      <div style="height:100%;width:${Math.min(100,Math.max(0,pct))}%;background:${barColor};border-radius:3px;transition:width .4s"></div>
    </div>
    <div style="margin-top:6px;font-size:12px;color:var(--text3)">
      Gespart: <span style="color:var(--text);font-family:'DM Mono',monospace">${curr()} ${fmtAmt(saved)}</span>
      ${ziel>0?` / Ziel: <span style="color:var(--text);font-family:'DM Mono',monospace">${curr()} ${fmtAmt(ziel)}</span>`:''}
    </div>
  </div>`;
}

function setHomeKontoMonths(m){ homeKontoMonths=m; renderHome(); }

function renderWidgetMonatSummary(mo, yr){
  const now = new Date();
  if(mo==null) mo = now.getMonth();
  if(yr==null) yr = now.getFullYear();
  const s=`${yr}-${String(mo+1).padStart(2,'0')}-01`;
  const e=`${yr}-${String(mo+1).padStart(2,'0')}-${String(new Date(yr,mo+1,0).getDate()).padStart(2,'0')}`;
  const mExp = DATA.expenses.filter(ex=>{const d=new Date(ex.date+'T12:00:00');return d.getMonth()===mo&&d.getFullYear()===yr;});
  const mInc = DATA.incomes.filter(ex=>{const d=new Date(ex.date+'T12:00:00');return d.getMonth()===mo&&d.getFullYear()===yr;});
  const recurExp = getRecurringOccurrences(s,e,true,true);
  const totalOut = mExp.reduce((a,ex)=>a+ex.amt,0) + recurExp.reduce((a,ex)=>a+ex.amt,0);
  const totalIn  = mInc.reduce((a,ex)=>a+ex.amt,0);
  const bal      = totalIn - totalOut;
  const mNames   = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  return `<div>
    <div class="widget-title">Monats-Zusammenfassung – ${mNames[mo]} ${yr}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">
      <div style="text-align:center">
        <div style="font-size:10px;color:var(--text3);margin-bottom:2px">Einnahmen</div>
        <div style="font-family:'DM Mono',monospace;font-size:13px;color:var(--green)">+${fmtAmt(totalIn)}</div>
      </div>
      <div style="text-align:center">
        <div style="font-size:10px;color:var(--text3);margin-bottom:2px">Ausgaben</div>
        <div style="font-family:'DM Mono',monospace;font-size:13px;color:var(--red)">−${fmtAmt(totalOut)}</div>
      </div>
      <div style="text-align:center;background:${bal>=0?'rgba(61,219,150,.07)':'rgba(255,77,109,.07)'};border-radius:6px;padding:4px">
        <div style="font-size:10px;color:var(--text3);margin-bottom:2px">Bilanz</div>
        <div style="font-family:'DM Mono',monospace;font-size:13px;color:${bal>=0?'var(--green)':'var(--red)'}">${bal>=0?'+':''}${fmtAmt(bal)}</div>
      </div>
    </div>
    <div style="border-top:1px solid var(--border);padding-top:8px">${buildTagesavgCard(mo, yr)}</div>
  </div>`;
}

function renderWidgetMonatKategorien(mo, yr, limit=5){
  const now = new Date();
  if(mo==null) mo = now.getMonth();
  if(yr==null) yr = now.getFullYear();
  const s=`${yr}-${String(mo+1).padStart(2,'0')}-01`;
  const e=`${yr}-${String(mo+1).padStart(2,'0')}-${String(new Date(yr,mo+1,0).getDate()).padStart(2,'0')}`;
  const catMap={};
  [...DATA.expenses.filter(x=>x.date>=s&&x.date<=e),...getRecurringOccurrences(s,e,true,true)].forEach(x=>{catMap[x.cat]=(catMap[x.cat]||0)+x.amt;});
  // Parent-category rollup
  const parentMap={};
  DATA.categories.forEach(c=>{if(c.parent)parentMap[c.name]=c.parent;});
  const parentTotals={};
  Object.entries(catMap).forEach(([cat,amt])=>{const key=parentMap[cat]||cat;parentTotals[key]=(parentTotals[key]||0)+amt;});
  const sorted=Object.entries(parentTotals).sort((a,b)=>b[1]-a[1]).slice(0,limit);
  if(!sorted.length) return `<div class="widget-title mb-0">Keine Ausgaben diesen Monat.</div>`;
  const maxVal=sorted[0][1]||1;
  const mNames=['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  return `<div>
    <div class="widget-title">Monats-Kategorien – ${mNames[mo]}</div>
    ${sorted.map(([cat,amt])=>`
      <div class="bar-wrap">
        <div class="bar-label-row">
          <span class="bar-label">${catEmoji(cat)} ${esc(cat)}</span>
          <span class="bar-val">${curr()} ${fmtAmt(amt)}</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${(amt/maxVal*100).toFixed(1)}%;background:${catColor(cat)}"></div></div>
      </div>`).join('')}
  </div>`;
}

function renderWidgetKontostand(){
  return `<div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <div class="widget-title mb-0">Kontostand-Verlauf</div>
      <div style="display:flex;gap:3px">
        ${[1,3,6,12].map(m=>`<button onclick="setHomeKontoMonths(${m});event.stopPropagation()" style="font-size:10px;padding:2px 6px;border-radius:4px;border:1px solid ${homeKontoMonths===m?'var(--accent)':'var(--border)'};background:${homeKontoMonths===m?'rgba(200,245,60,.15)':'var(--bg3)'};color:${homeKontoMonths===m?'var(--accent)':'var(--text3)'}">${m}M</button>`).join('')}
      </div>
    </div>
    <div style="overflow-x:auto">${buildBalanceChart(homeKontoMonths)}</div>
  </div>`;
}

function renderWidgetJahresSparquote(yr){
  const now = new Date();
  if(!yr) yr = now.getFullYear();
  const isCurrentYear = yr === now.getFullYear();
  const maxMonth = isCurrentYear ? now.getMonth() : 11;
  const months=['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  const sparziel=CFG.sparziel||0;
  const yMonths=[];
  for(let m=0;m<=maxMonth;m++){
    const s=`${yr}-${String(m+1).padStart(2,'0')}-01`;
    const e=`${yr}-${String(m+1).padStart(2,'0')}-${String(new Date(yr,m+1,0).getDate()).padStart(2,'0')}`;
    const inc=DATA.incomes.filter(ex=>{const d=new Date(ex.date+'T12:00:00');return d.getMonth()===m&&d.getFullYear()===yr;}).reduce((a,ex)=>a+ex.amt,0);
    const out=DATA.expenses.filter(ex=>{const d=new Date(ex.date+'T12:00:00');return d.getMonth()===m&&d.getFullYear()===yr;}).reduce((a,ex)=>a+ex.amt,0)
      +getRecurringOccurrences(s,e,true,true).reduce((a,ex)=>a+ex.amt,0);
    yMonths.push({label:months[m],net:inc-out,cur:isCurrentYear&&m===now.getMonth()});
  }
  const cashSaved=yMonths.reduce((s,m)=>s+m.net,0);
  const depotWert=isCurrentYear&&CFG.aktienInBilanz?getGesamtPortfoliowert():0;
  const yearSaved=cashSaved+depotWert;
  const sparPct=sparziel>0?Math.min(yearSaved/sparziel*100,100):0;
  const goalReached=sparziel>0&&sparPct>=100;
  const savedColor=yearSaved>=0?'var(--green)':'var(--red)';
  const maxNet=Math.max(...yMonths.map(m=>Math.abs(m.net)),1);
  const doneM=yMonths.filter(m=>!m.cur);
  const avgM=doneM.length>0?doneM.reduce((s,m)=>s+m.net,0)/doneM.length:yearSaved;
  // Projection: already saved (completed months) + average × remaining months (incl. current)
  const pastSaved=doneM.reduce((s,m)=>s+m.net,0);
  const proj=doneM.length>0 ? pastSaved+avgM*(12-doneM.length) : yearSaved;
  return `<div onclick="goTab('sparen')" style="cursor:pointer">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div class="widget-title mb-0">Jahres-Sparquote ${yr}</div>
      ${isCurrentYear?`<button onclick="openSparziel();event.stopPropagation()" style="background:none;color:var(--text3);font-size:11px;padding:2px 8px;border:1px solid var(--border);border-radius:6px">Ziel ⚙</button>`:''}
    </div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:${sparziel?'8px':'4px'}">
      <span style="font-family:'DM Mono',monospace;font-size:22px;font-weight:700;color:${savedColor}">${yearSaved>=0?'+':''}${curr()} ${fmtAmt(yearSaved)}</span>
      ${goalReached?`<span style="font-size:11px;font-weight:700;color:var(--green);background:rgba(61,219,150,.15);padding:2px 8px;border-radius:99px">✓ Ziel erreicht</span>`:''}
    </div>
    ${isCurrentYear&&CFG.aktienInBilanz&&depotWert>0?`<div style="font-size:11px;color:var(--text3);margin-bottom:${sparziel?'8px':'6px'}">davon ${curr()} ${fmtAmt(cashSaved)} Cash + ${curr()} ${fmtAmt(depotWert)} Depot</div>`:''}
    ${sparziel>0?`<div class="mb-10">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text3);margin-bottom:3px"><span>Ziel: ${curr()} ${fmtAmt(sparziel)}</span><span style="color:${sparPct>=100?'var(--green)':sparPct>50?'var(--accent)':'var(--yellow)'};font-weight:600">${sparPct.toFixed(0)}%</span></div>
      <div style="height:5px;border-radius:3px;background:var(--bg3)"><div style="height:100%;width:${sparPct.toFixed(1)}%;background:${sparPct>=100?'var(--green)':sparPct>50?'var(--accent)':'var(--yellow)'};border-radius:3px"></div></div>
    </div>`:''}
    ${yMonths.map(m=>{
      const isPos=m.net>=0;
      const bw=Math.min(Math.abs(m.net)/maxNet*100,100).toFixed(1);
      return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <div style="width:26px;font-size:10px;color:${m.cur?'var(--accent)':'var(--text3)'}">${m.label}</div>
        <div style="flex:1;height:4px;background:var(--bg3);border-radius:2px"><div style="width:${bw}%;height:100%;background:${isPos?'var(--green)':'var(--red)'};border-radius:2px"></div></div>
        <div style="width:72px;text-align:right;font-size:10px;font-family:'DM Mono',monospace;color:${isPos?'var(--green)':'var(--red)'}">${isPos?'+':''}${fmtAmt(m.net)}</div>
      </div>`;
    }).join('')}
    ${doneM.length>0?`<div style="display:flex;gap:20px;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
      <div><div style="font-size:11px;color:var(--text3);margin-bottom:2px">Ø / Monat</div>
        <div style="font-size:13px;font-family:'DM Mono',monospace;color:${avgM>=0?'var(--green)':'var(--red)'}">${avgM>=0?'+':''}${curr()} ${fmtAmt(Math.abs(avgM))}</div>
      </div>
      <div><div style="font-size:11px;color:var(--text3);margin-bottom:2px">Hochrechnung ${yr}</div>
        <div style="font-size:13px;font-family:'DM Mono',monospace;color:var(--text2)">${proj>=0?'+':''}${curr()} ${fmtAmt(Math.abs(proj))}</div>
      </div>
    </div>`:''}
  </div>`;
}

function renderWidgetJahresKategorien(yr){
  if(!yr) yr = new Date().getFullYear();
  const catMap={};
  const yrStart=`${yr}-01-01`, yrEnd=`${yr}-12-31`;
  [...DATA.expenses.filter(e=>new Date(e.date+'T12:00:00').getFullYear()===yr),...getRecurringOccurrences(yrStart,yrEnd,true,true)]
    .forEach(e=>{catMap[e.cat]=(catMap[e.cat]||0)+e.amt;});
  const sorted=Object.entries(catMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
  if(!sorted.length) return `<div><div class="widget-title">Jahres-Kategorien</div><div class="t-muted">Keine Ausgaben erfasst.</div></div>`;
  const total=Object.values(catMap).reduce((a,v)=>a+v,0);
  return `<div>
    <div class="widget-title">Jahres-Kategorien ${yr}</div>
    ${sorted.map(([cat,amt])=>{
      const pct=total>0?Math.round(amt/total*100):0;
      const col=catColor(cat);
      return `<div style="padding:6px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <div style="display:flex;align-items:center;gap:6px"><div style="width:8px;height:8px;border-radius:50%;background:${col}"></div><span style="font-size:13px">${esc(cat)}</span></div>
          <div style="font-size:12px;font-family:'DM Mono',monospace"><span class="t-text3">${pct}%</span> ${curr()} ${fmtAmt(amt)}</div>
        </div>
        <div style="height:4px;border-radius:2px;background:var(--bg3)"><div style="height:100%;width:${pct}%;background:${col};border-radius:2px;opacity:.7"></div></div>
      </div>`;
    }).join('')}
  </div>`;
}

function renderWidgetMonatsverlaufJahr(yr){
  const now = new Date();
  if(!yr) yr = now.getFullYear();
  const isCurrentYear = yr === now.getFullYear();
  const maxMonth = isCurrentYear ? now.getMonth() : 11;
  const months=['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  const trend=[];
  for(let m=0;m<=maxMonth;m++){
    const s=`${yr}-${String(m+1).padStart(2,'0')}-01`;
    const e=`${yr}-${String(m+1).padStart(2,'0')}-${String(new Date(yr,m+1,0).getDate()).padStart(2,'0')}`;
    const out=DATA.expenses.filter(ex=>{const d=new Date(ex.date+'T12:00:00');return d.getMonth()===m&&d.getFullYear()===yr;}).reduce((a,ex)=>a+ex.amt,0)
      +getRecurringOccurrences(s,e,true,true).reduce((a,ex)=>a+ex.amt,0);
    const inc=DATA.incomes.filter(ex=>{const d=new Date(ex.date+'T12:00:00');return d.getMonth()===m&&d.getFullYear()===yr;}).reduce((a,ex)=>a+ex.amt,0);
    trend.push({label:months[m],out,inc,net:inc-out,mo:m,cur:isCurrentYear&&m===now.getMonth()});
  }
  if(!trend.length) return `<div><div class="widget-title">Monatsverlauf ${yr}</div><div class="t-muted">Keine Daten.</div></div>`;
  const maxT=Math.max(...trend.map(t=>Math.max(t.out,t.inc)),1);
  return `<div>
    <div class="widget-title">Monatsverlauf ${yr}</div>
    ${trend.map(m=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;cursor:pointer" onclick="mvMonth=${m.mo};mvYear=${yr};goTab('monat');renderMonat()">
      <div style="width:26px;font-size:10px;color:${m.cur?'var(--accent)':'var(--text3)'};font-weight:${m.cur?600:400}">${m.label}</div>
      <div style="flex:1;display:flex;flex-direction:column;gap:2px">
        <div style="height:5px;border-radius:2px;background:var(--bg3);overflow:hidden"><div style="height:100%;width:${m.out?Math.max(m.out/maxT*100,2).toFixed(1):0}%;background:${m.cur?'var(--accent)':'var(--red)'};border-radius:2px;opacity:${m.cur?1:.7}"></div></div>
        ${m.inc>0?`<div style="height:5px;border-radius:2px;background:var(--bg3);overflow:hidden"><div style="height:100%;width:${Math.max(m.inc/maxT*100,2).toFixed(1)}%;background:var(--green);border-radius:2px;opacity:.7"></div></div>`:''}
      </div>
      <div style="min-width:70px;text-align:right;font-size:10px;font-family:'DM Mono',monospace">
        <div style="color:${m.cur?'var(--accent)':'var(--red)'}">${m.out?'−'+fmtAmt(m.out):'—'}</div>
        ${m.net!==0?`<div style="color:${m.net>=0?'var(--green)':'var(--red)'}">${m.net>=0?'+':''}${fmtAmt(m.net)}</div>`:''}
      </div>
    </div>`).join('')}
  </div>`;
}

function renderWidgetAktienPortfolio(){
  const active = SDATA.stocks.filter(s=>{
    const pos = calcPosition(s.id);
    return pos.qty > 0.0001;
  });
  if(!active.length) return `<div><div class="widget-title">Aktienportfolio</div><div class="t-muted">Keine aktiven Positionen.</div></div>`;
  let totalCost=0, totalPnl=0, hasPnl=false;
  const rows = active.map(s=>{
    const pos = calcPosition(s.id);
    const live = s.ticker ? getCachedStock(s.ticker) : null;
    const lp = live?.price;
    totalCost += pos.totalCost;
    let pnlAmt=null, pnlPct=null;
    if(lp && pos.qty>0.0001){ pnlAmt=(lp-pos.avgPrice)*pos.qty; pnlPct=pos.avgPrice>0?(lp/pos.avgPrice-1)*100:0; totalPnl+=pnlAmt; hasPnl=true; }
    const pc = pnlAmt==null?'var(--text3)':pnlAmt>=0?'var(--green)':'var(--red)';
    const ps = pnlAmt!=null&&pnlAmt>=0?'+':'';
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-top:1px solid var(--border)">
      <div>
        <div style="font-size:13px;font-weight:600">${esc(s.title)}</div>
        <div style="font-size:11px;color:var(--text3)">${fmtQty(pos.qty)} Stk. · Ø ${fmtPrice(pos.avgPrice)}</div>
      </div>
      <div style="text-align:right">
        ${pnlAmt!=null?`<div style="font-size:12px;font-family:'DM Mono',monospace;color:${pc}">${ps}${fmtPrice(pnlAmt)}</div><div style="font-size:10px;color:${pc}">${ps}${pnlPct?.toFixed(1)}%</div>`:lp!=null?'':`<div style="font-size:11px;color:var(--text3)">kein Kurs</div>`}
      </div>
    </div>`;
  });
  const pnlColor = totalPnl>=0?'var(--green)':'var(--red)';
  return `<div>
    <div class="widget-title">Aktienportfolio</div>
    ${hasPnl?`<div style="display:flex;justify-content:space-between;margin-bottom:8px">
      <div><div style="font-size:11px;color:var(--text3)">Einstand</div><div style="font-family:'DM Mono',monospace;font-size:14px">${fmtPrice(totalCost)}</div></div>
      <div style="text-align:right"><div style="font-size:11px;color:var(--text3)">Gesamt P&amp;L</div><div style="font-family:'DM Mono',monospace;font-size:14px;color:${pnlColor}">${totalPnl>=0?'+':''}${fmtPrice(totalPnl)}</div></div>
    </div>`:''}
    ${rows.join('')}
  </div>`;
}

// ── New Aktien Widgets (Point 5) ─────────────────────────────────────────────

function renderWidgetAktienWert(){
  const active = SDATA.stocks.filter(s=>calcPosition(s.id).qty>0.0001);
  if(!active.length) return `<div><div class="widget-title">Portfolio-Wert</div><div class="t-muted">Keine Positionen.</div></div>`;
  const total = getGesamtPortfoliowert();
  const totalCost = active.reduce((s,st)=>s+calcPosition(st.id).totalCost,0);
  const gv = getGesamtGewinnVerlust();
  const hasLive = gv.hasLive;
  const valColor = hasLive ? (gv.amt>=0?'var(--green)':'var(--red)') : 'var(--text)';
  return `<div>
    <div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--text3);margin-bottom:4px">PORTFOLIO-WERT</div>
    <div style="font-family:'DM Mono',monospace;font-size:34px;font-weight:700;line-height:1;color:${valColor};margin-bottom:6px">${fmtPrice(total)}</div>
    <div style="font-size:12px;color:var(--text3);display:flex;gap:12px;flex-wrap:wrap">
      <span>Einstand: <span style="font-family:'DM Mono',monospace;color:var(--text)">${fmtPrice(totalCost)}</span></span>
      ${hasLive?`<span style="color:${gv.amt>=0?'var(--green)':'var(--red)'}">P&L: ${gv.amt>=0?'+':''}${fmtPrice(gv.amt)}</span>`:''}
    </div>
  </div>`;
}

function renderWidgetAktienPnl(){
  const gv = getGesamtGewinnVerlust();
  const active = SDATA.stocks.filter(s=>calcPosition(s.id).qty>0.0001);
  if(!active.length) return `<div><div class="widget-title">Depot Gewinn/Verlust</div><div class="t-muted">Keine Positionen.</div></div>`;
  if(!gv.hasLive) return `<div><div class="widget-title">Depot Gewinn/Verlust</div><div class="t-muted">Warte auf Live-Kurse…</div></div>`;
  const color = gv.amt>=0?'var(--green)':'var(--red)';
  const sign = gv.amt>=0?'+':'';
  return `<div>
    <div class="widget-title">Depot Gewinn/Verlust</div>
    <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:6px">
      <span style="font-family:'DM Mono',monospace;font-size:26px;font-weight:700;color:${color}">${sign}${fmtPrice(gv.amt)}</span>
      <span style="font-size:16px;color:${color};font-weight:600">${sign}${gv.pct.toFixed(1)}%</span>
    </div>
    <div style="height:6px;border-radius:3px;background:var(--bg3);overflow:hidden">
      <div style="height:100%;width:${Math.min(Math.abs(gv.pct),100).toFixed(1)}%;background:${color};border-radius:3px"></div>
    </div>
    <div style="margin-top:6px;font-size:11px;color:var(--text3)">${active.length} aktive Position${active.length!==1?'en':''}</div>
  </div>`;
}

function renderWidgetAktienTop(){
  const active = SDATA.stocks.filter(s=>calcPosition(s.id).qty>0.0001&&s.ticker);
  if(!active.length) return `<div><div class="widget-title">Top-Performer</div><div class="t-muted">Keine Positionen mit Ticker.</div></div>`;
  let best=null, bestPct=-Infinity;
  active.forEach(s=>{
    const gv=getGewinnVerlust(s.id);
    if(gv.hasLive&&gv.pct>bestPct){bestPct=gv.pct;best=s;}
  });
  if(!best) return `<div><div class="widget-title">Top-Performer</div><div class="t-muted">Warte auf Live-Kurse…</div></div>`;
  const gv=getGewinnVerlust(best.id); const pos=calcPosition(best.id);
  const color=gv.pct>=0?'var(--green)':'var(--red)'; const sign=gv.pct>=0?'+':'';
  return `<div>
    <div class="widget-title">Top-Performer</div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <div>
        <div style="font-size:15px;font-weight:700">${esc(best.title)}</div>
        <div style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace">${esc(best.ticker||'')} · ${fmtQty(pos.qty)} Stk.</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:20px;font-weight:700;color:${color}">${sign}${gv.pct.toFixed(1)}%</div>
        <div style="font-size:11px;color:${color};font-family:'DM Mono',monospace">${sign}${fmtPrice(gv.amt)}</div>
      </div>
    </div>
  </div>`;
}

function renderWidgetAktienVerteilung(){
  const active = SDATA.stocks.filter(s=>calcPosition(s.id).qty>0.0001);
  if(!active.length) return `<div><div class="widget-title">Portfolio-Verteilung</div><div class="t-muted">Keine Positionen.</div></div>`;
  const data = active.map(s=>({
    label: s.ticker||s.title,
    value: getPositionsWert(s.id),
    color: aktieColor(s.id)
  })).filter(d=>d.value>0);
  const total = data.reduce((s,d)=>s+d.value,0);
  if(total===0) return `<div><div class="widget-title">Portfolio-Verteilung</div><div class="t-muted">Keine Daten.</div></div>`;
  // SVG pie chart
  const cx=70,cy=70,r=58;
  let angle=-Math.PI/2;
  const slices=data.map(d=>{
    const frac=d.value/total; const sweep=frac*2*Math.PI;
    const ea=angle+sweep; const la=frac>0.5?1:0;
    const x1=cx+r*Math.cos(angle),y1=cy+r*Math.sin(angle);
    const x2=cx+r*Math.cos(ea),y2=cy+r*Math.sin(ea);
    const path=frac>0.9999?`M${cx-r},${cy} A${r},${r} 0 1 1 ${cx+r},${cy} A${r},${r} 0 1 1 ${cx-r},${cy}`
      :`M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${la} 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`;
    angle=ea;
    return {...d,path,pct:(frac*100).toFixed(1)};
  });
  return `<div>
    <div class="widget-title">Portfolio-Verteilung</div>
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <svg viewBox="0 0 140 140" height="110" class="flex-shrink-0">
        ${slices.map(s=>`<path d="${s.path}" fill="${s.color}" stroke="var(--bg0)" stroke-width="1.5"/>`).join('')}
      </svg>
      <div style="flex:1;min-width:80px">
        ${slices.map(s=>`<div style="display:flex;align-items:center;gap:5px;margin-bottom:5px;font-size:11px">
          <span style="width:8px;height:8px;border-radius:2px;background:${s.color};flex-shrink:0"></span>
          <span class="t-text2">${esc(s.label)}</span>
          <span style="color:var(--text3);margin-left:auto">${s.pct}%</span>
        </div>`).join('')}
      </div>
    </div>
  </div>`;
}

function renderWidgetAktienPosition(){
  // Shows the stock selected via CFG.widgetAktienPosId, or the largest position by value
  let s = CFG.widgetAktienPosId ? SDATA.stocks.find(st=>st.id===CFG.widgetAktienPosId) : null;
  if(!s){
    // Auto-pick: largest position by cost
    const best = SDATA.stocks.reduce((best,st)=>{
      const c=calcPosition(st.id).totalCost;
      return c>(best?.cost||0)?{s:st,cost:c}:best;
    }, null);
    s = best?.s;
  }
  if(!s) return `<div><div class="widget-title">Einzelposition</div><div class="t-muted">Keine Positionen.</div></div>`;
  const pos=calcPosition(s.id); const gv=getGewinnVerlust(s.id);
  const color=!gv.hasLive?'var(--text)':gv.pct>=0?'var(--green)':'var(--red)';
  const sign=gv.pct>=0?'+':'';
  const lp=s.ticker?getAktuellerKurs(s.ticker):null;
  return `<div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px">
      <div class="widget-title mb-0">${esc(s.title)}</div>
      ${s.ticker?`<span style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace">${esc(s.ticker)}</span>`:''}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
      <div><div class="t-muted-sm">Anzahl</div><div class="t-mono-bold">${fmtQty(pos.qty)} Stk.</div></div>
      <div><div class="t-muted-sm">Ø Kaufpreis</div><div class="t-mono-bold">${fmtPrice(pos.avgPrice)}</div></div>
      <div><div class="t-muted-sm">Kurs live</div><div class="t-mono-bold">${lp!=null?fmtPrice(lp):'—'}</div></div>
      <div><div class="t-muted-sm">P&L</div><div style="font-family:'DM Mono',monospace;font-weight:600;color:${color}">${gv.hasLive?sign+gv.pct.toFixed(1)+'%':'—'}</div></div>
    </div>
    ${SDATA.stocks.filter(st=>calcPosition(st.id).qty>0.0001).length>1?`
    <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">
      ${SDATA.stocks.filter(st=>calcPosition(st.id).qty>0.0001).map(st=>`
        <button onclick="CFG.widgetAktienPosId='${st.id}';cfgSave();renderHome();event.stopPropagation()"
          style="font-size:10px;padding:2px 7px;border-radius:4px;border:1px solid ${(CFG.widgetAktienPosId||''===st.id)||s.id===st.id?'var(--accent)':'var(--border)'};background:${s.id===st.id?'rgba(200,245,60,.1)':'var(--bg3)'};color:${s.id===st.id?'var(--accent)':'var(--text3)'}">
          ${esc(st.ticker||st.title)}
        </button>`).join('')}
    </div>`:''
    }
  </div>`;
}

// getPortfolioTodayChange and renderWidgetAktienDashboard live in js/portfolio.js

function renderDashboard(){
  const now = new Date();
  const isCurrentYear = dashYear === now.getFullYear();
  const todayStr = today();

  // Year navigation state
  const bookedYears = getBookedYears();
  const dashYearIdx = bookedYears.indexOf(dashYear);
  const hasPrev = dashYearIdx > 0;
  const hasNext = dashYearIdx < bookedYears.length - 1;

  // Current-year-only calculations
  let todayOut=0, weekOut=0;
  if(isCurrentYear){
    const dow = now.getDay()===0?6:now.getDay()-1;
    const ws = new Date(now); ws.setDate(now.getDate()-dow);
    todayOut = DATA.expenses.filter(e=>e.date===todayStr).reduce((s,e)=>s+e.amt,0);
    weekOut  = DATA.expenses.filter(e=>e.date>=dateStr(ws)&&e.date<=todayStr).reduce((s,e)=>s+e.amt,0);
  }
  // Yearly Ø Tagesausgabe (all years)
  const avgDayYear = avgDailyVarSpendYear(dashYear);
  const avgDayYearPrev = avgDailyVarSpendYear(dashYear-1);
  const avgDayYearDiff = avgDayYearPrev>0 ? ((avgDayYear-avgDayYearPrev)/avgDayYearPrev*100) : null;
  // Lohn % Einnahmen (all years)
  const yearTotalInc = DATA.incomes.filter(e=>{const d=new Date(e.date+'T12:00:00');return d.getFullYear()===dashYear;}).reduce((s,e)=>s+e.amt,0);
  const yearLohnInc = DATA.incomes.filter(e=>{const d=new Date(e.date+'T12:00:00');return d.getFullYear()===dashYear&&e.isLohn;}).reduce((s,e)=>s+e.amt,0);
  const lohnPct = yearTotalInc>0 ? yearLohnInc/yearTotalInc*100 : 0;

  const container=document.getElementById('dashboard-content');
  container.innerHTML=`
    <!-- Jahres-Navigation -->
    <div class="section pb-0">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:0 0 8px">
        <button class="btn-cancel" onclick="prevDashYear()" style="padding:8px 16px;font-size:18px"${hasPrev?'':' disabled'}>‹</button>
        <div style="font-size:16px;font-weight:700">${dashYear}</div>
        <button class="btn-cancel" onclick="nextDashYear()" style="padding:8px 16px;font-size:18px"${hasNext?'':' disabled'}>›</button>
      </div>
    </div>

    ${isCurrentYear ? `
    <!-- Heute & Woche stats -->
    <div class="section pt-0">
      <div class="stats-grid mb-0">
        <div class="stat-card">
          <div class="stat-label">Heute ausgegeben</div>
          <div class="stat-value" style="font-size:18px;color:${todayOut>0?'var(--red)':'var(--text3)'}">
            ${todayOut>0?'− '+fmtAmt(todayOut):'—'}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Diese Woche</div>
          <div class="stat-value" style="font-size:18px;color:${weekOut>0?'var(--red)':'var(--text3)'}">
            ${weekOut>0?'− '+fmtAmt(weekOut):'—'}
          </div>
        </div>
      </div>
    </div>

    <!-- Kontostand-Verlauf (Linienchart) -->
    <div class="section pt-0">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div class="section-title mb-0">Kontostand-Verlauf</div>
        <div style="display:flex;gap:4px">
          ${[1,3,6,12].map(m=>`<button class="chart-period-btn${dashboardChartMonths===m?' active':''}" onclick="setDashboardMonths(${m})">${m}M</button>`).join('')}
        </div>
      </div>
      <div style="overflow-x:auto">${buildBalanceChart(dashboardChartMonths)}</div>
    </div>
    ` : ''}

    <!-- Ø Tagesausgabe (Jahresdurchschnitt) -->
    <div class="section pt-0">
      <div class="stats-grid mb-0">
        <div class="stat-card" style="grid-column:1/-1;cursor:pointer" onclick="openAvgConfig()">
          <div class="stat-label">Ø Tagesausgabe ${dashYear} (ohne Fixkosten)
            ${avgDayYearDiff!==null?`<span style="font-size:11px;color:${avgDayYearDiff<=0?'var(--green)':'var(--red)'};margin-left:6px">${avgDayYearDiff<=0?'↓':'↑'}${Math.abs(avgDayYearDiff).toFixed(0)}% vs. ${dashYear-1}</span>`:''}
            <span style="font-size:11px;color:var(--text3);margin-left:6px">⚙</span>
          </div>
          <div class="stat-value" style="font-size:18px;color:${avgDayYear>0?'var(--text)':'var(--text3)'}">
            ${avgDayYear>0?curr()+' '+fmtAmt(avgDayYear):'—'}
          </div>
        </div>
      </div>
    </div>

    <!-- Lohn % Einnahmen -->
    <div class="section pt-0">
      <div class="card" style="padding:14px 16px">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--text3);margin-bottom:10px">Lohn % Einnahmen ${dashYear}</div>
        ${yearTotalInc>0 ? `
        <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:10px">
          <span style="font-family:'DM Mono',monospace;font-size:26px;font-weight:500;color:var(--text)">${lohnPct.toFixed(1)}%</span>
          <span class="t-muted-sm">${curr()} ${fmtAmt(yearLohnInc)} von ${curr()} ${fmtAmt(yearTotalInc)}</span>
        </div>
        <div class="zy-prog-wrap" style="margin:0;height:8px">
          <div class="zy-prog-fill" style="width:${Math.min(lohnPct,100).toFixed(1)}%;background:var(--accent)"></div>
        </div>
        ` : `<div style="font-size:13px;color:var(--text3)">Keine Einnahmen erfasst</div>`}
      </div>
    </div>

    <!-- Jahres-Sparquote (shared widget) — click navigates to Sparen tab -->
    <div class="section pt-0">
      <div class="card" style="padding:14px;cursor:pointer" onclick="goTab('sparen')">${renderWidgetJahresSparquote(dashYear)}</div>
    </div>

    <!-- Top Kategorien (shared widget) -->
    <div class="section pt-0">
      <div class="card" style="padding:14px">${renderWidgetJahresKategorien(dashYear)}</div>
    </div>

    <!-- Monatsverlauf (shared widget) -->
    <div class="section pt-0">
      <div class="card" style="padding:14px">${renderWidgetMonatsverlaufJahr(dashYear)}</div>
    </div>
  `;
}

function openMonthViewAt(mo,yr){
  mvMonth=mo; mvYear=yr;
  renderMonthView();
  document.getElementById('month-view').classList.add('open');
}

// ═══════════════════════════════════════════════════════════════
// MODULE: VERLAUF SEARCH
// ═══════════════════════════════════════════════════════════════
let verlaufSearch = '';
function setVerlaufSearch(v){ verlaufSearch=v; renderVerlauf(); }

// ═══════════════════════════════════════════════════════════════
// MODULE: MONATSÜBERSICHT TAB
// ═══════════════════════════════════════════════════════════════
function renderMonat(){
  const now = new Date();
  const todayStr = today();
  const yr = mvYear, mo = mvMonth;
  const isCurrent = yr===now.getFullYear() && mo===now.getMonth();

  // Auto-materialization now happens globally via autoMaterializeRecurrings()

  const s=`${yr}-${String(mo+1).padStart(2,'0')}-01`;
  const e=`${yr}-${String(mo+1).padStart(2,'0')}-${String(new Date(yr,mo+1,0).getDate()).padStart(2,'0')}`;

  const mExp = DATA.expenses.filter(ex=>{const d=new Date(ex.date+'T12:00:00');return d.getMonth()===mo&&d.getFullYear()===yr;});
  const mInc = DATA.incomes.filter(ex=>{const d=new Date(ex.date+'T12:00:00');return d.getMonth()===mo&&d.getFullYear()===yr;});

  // Virtual recurring: future occurrences not yet materialized (current month only)
  // capToToday=false shows upcoming entries; skipMaterialized=true avoids double-counting
  const mRecVirtual = isCurrent ? getRecurringOccurrences(s, e, false, true) : [];

  // Date set includes virtual recurring dates
  const dateSet = new Set([...mExp.map(ex=>ex.date),...mInc.map(ex=>ex.date),...mRecVirtual.map(r=>r.date)]);
  const sortedDates = [...dateSet].sort((a,b)=>b.localeCompare(a));

  // Today/week stats (current month only)
  let todayOut=0, weekOut=0;
  if(isCurrent){
    const dow = now.getDay()===0?6:now.getDay()-1;
    const ws = new Date(now); ws.setDate(now.getDate()-dow);
    todayOut = DATA.expenses.filter(e=>e.date===todayStr).reduce((s,e)=>s+e.amt,0);
    weekOut = DATA.expenses.filter(e=>e.date>=dateStr(ws)&&e.date<=todayStr).reduce((s,e)=>s+e.amt,0);
  }

  const container = document.getElementById('monat-content');
  if(!container) return;

  container.innerHTML = `
    <!-- Month navigation -->
    <div class="section pb-0">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:0 0 8px">
        <button class="btn-cancel" onclick="prevMvMonth()" style="padding:8px 16px;font-size:18px">‹</button>
        <div style="font-size:16px;font-weight:700">${mvMonths[mo]} ${yr}</div>
        <button class="btn-cancel" onclick="nextMvMonth()" style="padding:8px 16px;font-size:18px" ${isCurrent?'disabled':''}>›</button>
      </div>
    </div>

    <!-- Monats-Zusammenfassung (shared widget — includes 3-stat + Ø Tagesausgabe) -->
    <div class="section pt-0">
      <div class="card" style="padding:14px">${renderWidgetMonatSummary(mo, yr)}</div>
    </div>

    ${isCurrent ? `
    <!-- Heute & Woche (current month only) -->
    <div class="section pt-0">
      <div class="stats-grid mb-0">
        <div class="stat-card">
          <div class="stat-label">Heute ausgegeben</div>
          <div class="stat-value" style="font-size:18px;color:${todayOut>0?'var(--red)':'var(--text3)'}">${todayOut>0?'− '+fmtAmt(todayOut):'—'}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Diese Woche</div>
          <div class="stat-value" style="font-size:18px;color:${weekOut>0?'var(--red)':'var(--text3)'}">${weekOut>0?'− '+fmtAmt(weekOut):'—'}</div>
        </div>
      </div>
    </div>
    ` : ''}

    <!-- Kategorien (shared widget) -->
    <div class="section pt-0">
      <div class="card" style="padding:12px 14px">${renderWidgetMonatKategorien(mo, yr, 8)}</div>
    </div>

    ${sortedDates.length ? `
    <!-- Day entries -->
    <div class="section pt-0">
      <div class="section-title">Einträge</div>
      <div class="card p-0">
        ${sortedDates.map(ds=>buildDayGroup(ds,
          DATA.expenses.filter(ex=>ex.date===ds),
          DATA.incomes.filter(ex=>ex.date===ds),
          mRecVirtual.filter(r=>r.date===ds)
        )).join('')}
      </div>
    </div>`
    : `<div class="section"><div class="empty"><div class="empty-icon"><svg viewBox="0 0 24 24" style="width:40px;height:40px;stroke:var(--border2);fill:none;stroke-width:1.5"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg></div><div class="empty-text">Keine Einträge</div></div></div>`}
  `;
}

