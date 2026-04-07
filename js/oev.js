/* ═══════════════════════════════════════════════════════════════
   MODULE: ÖV FAHRTEN-TRACKER
   Station search via transport.opendata.ch API (CORS-enabled)
   Stackable abos, journey tracking, Halbtax Plus credit balance
═══════════════════════════════════════════════════════════════ */

// ── State ────────────────────────────────────────────────────────
const OEV_KEY = 'ft_oev_v1';
let ODATA = { fahrten: [], abos: [] };
let oevView   = 'fahrten';            // 'fahrten' | 'abos'
let oevPeriod = 'monat';              // 'monat' | 'jahr' | 'alles'
let oevFilter = 'alle';               // 'alle' | 'regular' | 'ausserordentlich'
let _oevEditFahrtId   = null;         // null = new
let _oevEditAboId     = null;         // null = new
let _oevAusserordentlich = false;     // modal toggle state
let _suggestTimer     = null;         // debounce handle

// ── Persistence ──────────────────────────────────────────────────
function odataLoad(){
  try{ const s = localStorage.getItem(OEV_KEY); if(s) ODATA = JSON.parse(s); }
  catch{ ODATA = { fahrten:[], abos:[] }; }
  if(!ODATA.fahrten) ODATA.fahrten = [];
  if(!ODATA.abos)    ODATA.abos    = [];
}
function odataSave(){
  localStorage.setItem(OEV_KEY, JSON.stringify(ODATA));
}

// ── Station Autocomplete (transport.opendata.ch) ─────────────────
function showOevSuggest(inputId, dropId){
  const inp = document.getElementById(inputId);
  const drop = document.getElementById(dropId);
  if(!inp || !drop) return;
  const query = (inp.value||'').trim();

  clearTimeout(_suggestTimer);
  _suggestTimer = setTimeout(async ()=>{
    const favs = (CFG.oevFavStations||[]);
    let items = [];

    // Favourites matching query (case-insensitive contains)
    const favMatches = query.length===0
      ? favs.slice(0,5)
      : favs.filter(f=>f.toLowerCase().includes(query.toLowerCase())).slice(0,5);

    favMatches.forEach(name=>{
      items.push({ name, isFav:true });
    });

    // API results (only if ≥ 2 chars)
    if(query.length >= 2){
      try{
        const url = 'https://transport.opendata.ch/v1/locations?query='+encodeURIComponent(query)+'&type=station';
        const res = await fetch(url);
        if(res.ok){
          const data = await res.json();
          const apiNames = (data.stations||[])
            .map(s=>s.name).filter(Boolean)
            .filter(n=>!items.some(i=>i.name===n)); // dedup
          apiNames.slice(0,8).forEach(name=>{
            items.push({ name, isFav: favs.includes(name) });
          });
        }
      }catch{
        // offline: fall back to recent stations from ODATA
        const recents = _recentStations().filter(n=>n.toLowerCase().includes(query.toLowerCase()));
        recents.forEach(name=>{
          if(!items.some(i=>i.name===name)) items.push({ name, isFav: favs.includes(name) });
        });
      }
    } else if(query.length === 0){
      // Show recent stations if nothing typed
      _recentStations().slice(0,5).forEach(name=>{
        if(!items.some(i=>i.name===name)) items.push({ name, isFav: favs.includes(name) });
      });
    }

    if(items.length === 0 && query.length === 0){ drop.style.display='none'; return; }

    let html = items.map(({name,isFav})=>`
      <div class="oev-suggest-item" onmousedown="pickOevSuggest('${escJs(name)}','${inputId}','${dropId}')">
        <span>${escHtml(name)}</span>
        <span class="oev-fav-star${isFav?' active':''}"
              onmousedown="event.stopPropagation();toggleOevFav('${escJs(name)}')"
              title="${isFav?'Aus Favoriten entfernen':'Zu Favoriten hinzufügen'}">★</span>
      </div>`).join('');

    // "Use as-is" entry at bottom when query is non-empty
    if(query.length >= 2){
      html += `<div class="oev-suggest-item oev-suggest-custom"
        onmousedown="pickOevSuggest('${escJs(query)}','${inputId}','${dropId}')">
        <em>«${escHtml(query)}» einmalig verwenden</em>
      </div>`;
    }

    drop.innerHTML = html;
    drop.style.display = 'block';
  }, query.length >= 2 ? 300 : 0);
}

function hideOevSuggest(dropId){
  const drop = document.getElementById(dropId);
  if(drop){ drop.style.display='none'; drop.innerHTML=''; }
}

function pickOevSuggest(val, inputId, dropId){
  const inp = document.getElementById(inputId);
  if(inp) inp.value = val;
  hideOevSuggest(dropId);
}

function toggleOevFav(name){
  const favs = CFG.oevFavStations || [];
  const idx = favs.indexOf(name);
  if(idx>=0) favs.splice(idx,1);
  else favs.unshift(name);
  CFG.oevFavStations = favs;
  cfgSave();
}

function _recentStations(){
  const seen = new Set();
  const out = [];
  [...ODATA.fahrten].reverse().forEach(f=>{
    [f.von, f.nach].forEach(n=>{ if(n && !seen.has(n)){ seen.add(n); out.push(n); } });
  });
  return out;
}

// ── Abo helpers ───────────────────────────────────────────────────
function getActiveAbos(dateStr){
  const d = dateStr ? new Date(dateStr) : new Date();
  return ODATA.abos.filter(a=>{
    if(a.deleted) return false;
    if(a.gueltigBis && new Date(a.gueltigBis) < d) return false;
    return true;
  });
}

function aboDisplayName(abo){
  if(abo.name) return abo.name;
  return { halbtax:'Halbtax', halbtax_plus:'Halbtax Plus',
           ga2:'GA 2. Kl.', ga1:'GA 1. Kl.',
           stadtabo:'Stadtabo', other:'Abo' }[abo.type] || 'Abo';
}

function getAboById(id){ return ODATA.abos.find(a=>a.id===id); }

function _calcHalbtaxPlusVerbraucht(aboId){
  return ODATA.fahrten
    .filter(f=>!f.deleted && (f.aboIds||[]).includes(aboId))
    .reduce((s,f)=>s+(f.preis||0),0);
}

// ── Period range ──────────────────────────────────────────────────
function getOevPeriodRange(period){
  const now = new Date();
  if(period==='monat'){
    return { von:new Date(now.getFullYear(),now.getMonth(),1),
             bis:new Date(now.getFullYear(),now.getMonth()+1,0) };
  }
  if(period==='jahr'){
    return { von:new Date(now.getFullYear(),0,1),
             bis:new Date(now.getFullYear(),11,31) };
  }
  return { von:new Date(0), bis:new Date(9999,0) };
}

// ── Stats ─────────────────────────────────────────────────────────
function getOevStats(vonDate, bisDate, inclAusserordentlich){
  const fahrten = ODATA.fahrten.filter(f=>{
    if(f.deleted) return false;
    const d = new Date(f.date);
    if(d < vonDate || d > bisDate) return false;
    if(!inclAusserordentlich && f.ausserordentlich) return false;
    return true;
  });
  let total=0, normalpreis=0, savings=0;
  fahrten.forEach(f=>{
    total += f.preis||0;
    if((f.normalpreis||0)>0){
      normalpreis += f.normalpreis;
      savings += Math.max(0, f.normalpreis - f.preis);
    }
  });
  return { total, normalpreis, savings, count:fahrten.length };
}

// ── CRUD — Fahrten ────────────────────────────────────────────────
async function saveOevFahrt(fahrt){
  const row = [fahrt.id, fahrt.date, fahrt.von, fahrt.nach,
    fahrt.preis, fahrt.normalpreis||'', fahrt.notiz||'',
    fahrt.ausserordentlich?'1':'', JSON.stringify(fahrt.aboIds||[]), ''];
  queueSync('oev_save_'+fahrt.id, async ()=>{
    await apiCall({action:'ensureSheet', sheet:'OEV',
      headers:JSON.stringify(['ID','Datum','Von','Nach','Preis','Normalpreis','Notiz','Ausserordentlich','AboIDs','Deleted'])});
    await apiAppend('OEV', [row]);
  });
  ODATA.fahrten.push(fahrt);
  odataSave();
  markDirty('oev');
  toast('Fahrt gespeichert');
}

async function updateOevFahrt(fahrt){
  const row = [fahrt.id, fahrt.date, fahrt.von, fahrt.nach,
    fahrt.preis, fahrt.normalpreis||'', fahrt.notiz||'',
    fahrt.ausserordentlich?'1':'', JSON.stringify(fahrt.aboIds||[]), ''];
  queueSync('oev_upd_'+fahrt.id, async ()=>{
    const rowNum = await apiFindRow('OEV', fahrt.id);
    if(rowNum) await apiUpdate('OEV!A'+rowNum+':J'+rowNum, [row]);
  });
  const idx = ODATA.fahrten.findIndex(f=>f.id===fahrt.id);
  if(idx>=0) ODATA.fahrten[idx] = fahrt;
  odataSave();
  markDirty('oev');
  toast('Fahrt aktualisiert');
}

async function deleteOevFahrt(id){
  queueSync('oev_del_'+id, async ()=>{
    const rowNum = await apiFindRow('OEV', id);
    if(rowNum) await apiUpdate('OEV!J'+rowNum, [['1']]);
  });
  ODATA.fahrten = ODATA.fahrten.filter(f=>f.id!==id);
  odataSave();
  markDirty('oev');
}

// ── CRUD — Abos ───────────────────────────────────────────────────
async function saveOevAbo(abo){
  const row = [abo.id, abo.name||'', abo.type||'other', abo.kaufdatum||'',
    abo.gueltigBis||'', abo.preis||0, abo.guthaben||'',
    abo.notiz||'', abo.ausgabenId||'', ''];
  queueSync('oev_abo_save_'+abo.id, async ()=>{
    await apiCall({action:'ensureSheet', sheet:'OEV-Abos',
      headers:JSON.stringify(['ID','Name','Typ','Kaufdatum','GültigBis','Preis','Guthaben','Notiz','AusgabenID','Deleted'])});
    await apiAppend('OEV-Abos', [row]);
  });
  ODATA.abos.push(abo);
  odataSave();
  markDirty('oev');
  toast('Abo gespeichert');
}

async function updateOevAbo(abo){
  const row = [abo.id, abo.name||'', abo.type||'other', abo.kaufdatum||'',
    abo.gueltigBis||'', abo.preis||0, abo.guthaben||'',
    abo.notiz||'', abo.ausgabenId||'', ''];
  queueSync('oev_abo_upd_'+abo.id, async ()=>{
    const rowNum = await apiFindRow('OEV-Abos', abo.id);
    if(rowNum) await apiUpdate('OEV-Abos!A'+rowNum+':J'+rowNum, [row]);
  });
  const idx = ODATA.abos.findIndex(a=>a.id===abo.id);
  if(idx>=0) ODATA.abos[idx] = abo;
  odataSave();
  markDirty('oev');
}

async function deleteOevAbo(id){
  queueSync('oev_abo_del_'+id, async ()=>{
    const rowNum = await apiFindRow('OEV-Abos', id);
    if(rowNum) await apiUpdate('OEV-Abos!J'+rowNum, [['1']]);
  });
  ODATA.abos = ODATA.abos.filter(a=>a.id!==id);
  odataSave();
  markDirty('oev');
}

function oevAboToAusgabe(aboId){
  const abo = getAboById(aboId);
  if(!abo) return;
  // Pre-fill expense entry form then switch to eingabe tab
  closeModal('oev-abo-modal');
  goTab('eingabe');
  setTimeout(()=>{
    const whatEl = document.getElementById('f-what');
    const amtEl  = document.getElementById('f-amount');
    const dateEl = document.getElementById('f-date');
    if(whatEl) whatEl.value = aboDisplayName(abo) + (abo.name?'':' Abo');
    if(amtEl)  amtEl.value  = abo.preis||'';
    if(dateEl) dateEl.value = abo.kaufdatum || todayStr();
    setType('ausgabe');
  }, 150);
}

// ── Render ────────────────────────────────────────────────────────
function renderOev(){
  const el = document.getElementById('tab-oev');
  if(!el || !CFG.oevEnabled) return;

  // Sync view toggle buttons
  const btnF = document.getElementById('oev-btn-fahrten');
  const btnA = document.getElementById('oev-btn-abos');
  if(btnF) btnF.classList.toggle('active', oevView==='fahrten');
  if(btnA) btnA.classList.toggle('active', oevView==='abos');

  const fview = document.getElementById('oev-fahrten-view');
  const aview = document.getElementById('oev-abos-view');
  if(fview) fview.style.display = oevView==='fahrten' ? '' : 'none';
  if(aview) aview.style.display = oevView==='abos'    ? '' : 'none';

  if(oevView==='fahrten'){
    _syncOevPeriodChips();
    _syncOevFilterChips();
    _renderOevSummaryCard();
    _renderOevAboStrip();
    _renderOevList();
  } else {
    _renderOevAbos();
  }
}

function oevSetView(v){
  oevView = v;
  renderOev();
}

function oevSetPeriod(p){
  oevPeriod = p;
  _syncOevPeriodChips();
  _renderOevSummaryCard();
  _renderOevList();
}

function oevSetFilter(f){
  oevFilter = f;
  _syncOevFilterChips();
  _renderOevList();
}

function _syncOevPeriodChips(){
  ['monat','jahr','alles'].forEach(p=>{
    const btn = document.getElementById('oev-chip-'+p);
    if(btn) btn.classList.toggle('active', oevPeriod===p);
  });
}

function _syncOevFilterChips(){
  ['alle','regular','ausserord'].forEach(f=>{
    const key = f==='regular'?'regular':f==='ausserord'?'ausserordentlich':'alle';
    const btn = document.getElementById('oev-chip-'+f);
    if(btn) btn.classList.toggle('active', oevFilter===key||(f==='alle'&&oevFilter==='alle'));
  });
  // fix: 'ausserordentlich' chip id
  const ausBtn = document.getElementById('oev-chip-ausserord');
  if(ausBtn) ausBtn.classList.toggle('active', oevFilter==='ausserordentlich');
  const allBtn = document.getElementById('oev-chip-alle');
  if(allBtn) allBtn.classList.toggle('active', oevFilter==='alle');
  const regBtn = document.getElementById('oev-chip-regular');
  if(regBtn) regBtn.classList.toggle('active', oevFilter==='regular');
}

function _renderOevSummaryCard(){
  const el = document.getElementById('oev-summary-card');
  if(!el) return;
  const {von, bis} = getOevPeriodRange(oevPeriod);
  const inclAuss = (oevFilter !== 'regular');
  const stats = getOevStats(von, bis, inclAuss);
  const c = curr();
  const hasSavings = stats.savings > 0;
  el.innerHTML = `<div class="oev-summary-grid">
    <div>
      <div class="oev-stat-lbl">Ausgaben</div>
      <div class="oev-stat-val">${c} ${fmtAmt(stats.total)}</div>
    </div>
    <div>
      <div class="oev-stat-lbl">Ersparnis</div>
      <div class="oev-stat-val${hasSavings?' green':''}">${hasSavings?c+' '+fmtAmt(stats.savings):'—'}</div>
    </div>
    <div>
      <div class="oev-stat-lbl">Fahrten</div>
      <div class="oev-stat-val">${stats.count}</div>
    </div>
  </div>`;
}

function _renderOevAboStrip(){
  const el = document.getElementById('oev-abo-strip');
  if(!el) return;
  const active = getActiveAbos(todayStr());
  if(!active.length){ el.innerHTML=''; return; }
  const pills = active.map(a=>{
    let extra = '';
    if(a.type==='halbtax_plus' && a.guthaben>0){
      const verbraucht = _calcHalbtaxPlusVerbraucht(a.id);
      const rest = Math.max(0, a.guthaben - verbraucht);
      extra = ` <span style="font-size:11px;color:var(--text2)">CHF ${fmtAmt(rest)} übrig</span>`;
    } else if(a.gueltigBis){
      const daysLeft = Math.ceil((new Date(a.gueltigBis)-new Date())/864e5);
      if(daysLeft<=30) extra = ` <span style="font-size:11px;color:var(--yellow)">noch ${daysLeft}d</span>`;
    }
    return `<span class="oev-abo-pill" onclick="oevSetView('abos')">${escHtml(aboDisplayName(a))}${extra}</span>`;
  }).join('');
  el.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:6px;padding:0 16px 4px">${pills}</div>`;
}

function _renderOevList(){
  const el = document.getElementById('oev-list');
  if(!el) return;
  const {von, bis} = getOevPeriodRange(oevPeriod);
  let fahrten = ODATA.fahrten.filter(f=>{
    if(f.deleted) return false;
    const d = new Date(f.date);
    if(d < von || d > bis) return false;
    if(oevFilter==='regular' && f.ausserordentlich) return false;
    if(oevFilter==='ausserordentlich' && !f.ausserordentlich) return false;
    return true;
  }).sort((a,b)=>b.date.localeCompare(a.date));

  if(!fahrten.length){
    el.innerHTML = `<div style="padding:32px 16px;text-align:center;color:var(--text3);font-size:14px">
      Noch keine Fahrten erfasst</div>`;
    return;
  }

  const html = fahrten.map(f=>{
    const savings = (f.normalpreis||0)>0 ? fmtAmt(f.normalpreis-f.preis) : null;
    const aboNames = (f.aboIds||[]).map(id=>{ const a=getAboById(id); return a?aboDisplayName(a):null; }).filter(Boolean);
    const aboBadge = aboNames.length ? `<span style="font-size:11px;color:var(--text3)">${aboNames.join(', ')}</span>` : '';
    const auBadge  = f.ausserordentlich ? '<span class="oev-badge">Ausserord.</span>' : '';
    return `<div class="oev-row" onclick="openEditFahrtModal('${f.id}')">
      <div class="oev-row-left">
        <div class="oev-row-route">${escHtml(f.von)} → ${escHtml(f.nach)}${auBadge}</div>
        <div class="oev-row-meta">${formatDateShort(f.date)}${aboBadge?' · ':' '}${aboBadge}</div>
      </div>
      <div class="oev-row-right">
        <div class="oev-row-preis">${curr()} ${fmtAmt(f.preis)}</div>
        ${savings?`<div class="oev-row-savings">−${curr()} ${savings}</div>`:''}
      </div>
    </div>`;
  }).join('');
  el.innerHTML = `<div class="card" style="padding:0 0 4px;margin:0 16px 12px">${html}</div>`;
}

function _renderOevAbos(){
  const el = document.getElementById('oev-abos-list');
  if(!el) return;
  const abos = ODATA.abos.filter(a=>!a.deleted);
  if(!abos.length){
    el.innerHTML = `<div style="padding:32px 16px;text-align:center;color:var(--text3);font-size:14px">
      Noch keine Abos hinterlegt</div>`;
    return;
  }
  const html = abos.map(a=>{
    const typeLabel = { halbtax:'Halbtax', halbtax_plus:'Halbtax Plus',
      ga2:'GA 2. Kl.', ga1:'GA 1. Kl.', stadtabo:'Stadtabo', other:'Abo' }[a.type]||'Abo';
    const expiry = a.gueltigBis ? `Gültig bis ${formatDateShort(a.gueltigBis)}` : '';
    const daysLeft = a.gueltigBis ? Math.ceil((new Date(a.gueltigBis)-new Date())/864e5) : null;
    const expiryColor = daysLeft!==null && daysLeft<=30 ? 'var(--yellow)' : 'var(--text2)';

    let progressHtml = '';
    if(a.type==='halbtax_plus' && a.guthaben>0){
      const verbraucht = _calcHalbtaxPlusVerbraucht(a.id);
      const rest = Math.max(0, a.guthaben - verbraucht);
      const pct  = Math.min(100, verbraucht/a.guthaben*100);
      progressHtml = `
        <div style="margin-top:8px">
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text2);margin-bottom:4px">
            <span>Verbraucht: ${curr()} ${fmtAmt(verbraucht)}</span>
            <span style="color:var(--green)">Übrig: ${curr()} ${fmtAmt(rest)}</span>
          </div>
          <div class="oev-progress-track">
            <div class="oev-progress-fill${pct>=100?' done':''}" style="--bar-w:${pct.toFixed(1)}%"></div>
          </div>
        </div>`;
    }

    return `<div class="oev-abo-card" onclick="openEditAboModal('${a.id}')">
      <div class="oev-abo-card-top">
        <span class="oev-abo-name">${escHtml(aboDisplayName(a))}</span>
        <span class="oev-abo-type-badge">${typeLabel}</span>
      </div>
      <div class="oev-abo-meta" style="color:${expiryColor}">${expiry}</div>
      ${a.preis ? `<div class="oev-abo-meta" style="margin-top:2px">${curr()} ${fmtAmt(a.preis)}</div>` : ''}
      ${progressHtml}
    </div>`;
  }).join('');
  el.innerHTML = html;
}

// ── Modal — Fahrten ───────────────────────────────────────────────
function openNewFahrtModal(){
  _oevEditFahrtId = null;
  _oevAusserordentlich = false;
  const title = document.getElementById('oev-modal-title');
  if(title) title.textContent = 'Neue Fahrt';
  const delBtn = document.getElementById('oev-delete-btn');
  if(delBtn) delBtn.style.display = 'none';

  const vonEl  = document.getElementById('oev-von');
  const nachEl = document.getElementById('oev-nach');
  const dateEl = document.getElementById('oev-datum');
  const preisEl= document.getElementById('oev-preis');
  const normEl = document.getElementById('oev-normalpreis');
  const notizEl= document.getElementById('oev-notiz');
  if(vonEl)  vonEl.value  = '';
  if(nachEl) nachEl.value = '';
  if(dateEl) dateEl.value = todayStr();
  if(preisEl)preisEl.value= '';
  if(normEl) normEl.value = '';
  if(notizEl)notizEl.value= '';

  const sw = document.getElementById('oev-ausserord-sw');
  if(sw) sw.classList.remove('on');

  _renderFahrtAboChips(null);
  openModal('oev-fahrt-modal');
}

function openEditFahrtModal(id){
  const f = ODATA.fahrten.find(x=>x.id===id);
  if(!f) return;
  _oevEditFahrtId = id;
  _oevAusserordentlich = !!f.ausserordentlich;
  const title = document.getElementById('oev-modal-title');
  if(title) title.textContent = 'Fahrt bearbeiten';
  const delBtn = document.getElementById('oev-delete-btn');
  if(delBtn) delBtn.style.display = '';

  const vonEl  = document.getElementById('oev-von');
  const nachEl = document.getElementById('oev-nach');
  const dateEl = document.getElementById('oev-datum');
  const preisEl= document.getElementById('oev-preis');
  const normEl = document.getElementById('oev-normalpreis');
  const notizEl= document.getElementById('oev-notiz');
  if(vonEl)  vonEl.value  = f.von||'';
  if(nachEl) nachEl.value = f.nach||'';
  if(dateEl) dateEl.value = f.date||todayStr();
  if(preisEl)preisEl.value= f.preis||'';
  if(normEl) normEl.value = f.normalpreis||'';
  if(notizEl)notizEl.value= f.notiz||'';

  const sw = document.getElementById('oev-ausserord-sw');
  if(sw) sw.classList.toggle('on', !!f.ausserordentlich);

  _renderFahrtAboChips(f.aboIds||[]);
  openModal('oev-fahrt-modal');
}

function _renderFahrtAboChips(selectedIds){
  const container = document.getElementById('oev-fahrt-abo-chips');
  const row = document.getElementById('oev-fahrt-abos-row');
  if(!container) return;
  const active = getActiveAbos(todayStr());
  if(!active.length){ if(row) row.style.display='none'; return; }
  if(row) row.style.display='';

  // Auto-select abos that are always-on (halbtax, halbtax_plus, ga2, ga1)
  const autoTypes = ['halbtax','halbtax_plus','ga2','ga1'];
  const sel = selectedIds !== null ? selectedIds
    : active.filter(a=>autoTypes.includes(a.type)).map(a=>a.id);

  container.innerHTML = active.map(a=>{
    const on = sel.includes(a.id);
    return `<button class="oev-abo-chip${on?' active':''}"
      onclick="toggleFahrtAboChip('${a.id}',this)">${escHtml(aboDisplayName(a))}</button>`;
  }).join('');
}

function toggleFahrtAboChip(aboId, btn){
  if(btn) btn.classList.toggle('active');
}

function _getSelectedAboIds(){
  const chips = document.querySelectorAll('#oev-fahrt-abo-chips .oev-abo-chip.active');
  return Array.from(chips).map(c=>c.getAttribute('onclick').match(/'([^']+)'/)?.[1]).filter(Boolean);
}

function toggleOevAusserordentlich(){
  _oevAusserordentlich = !_oevAusserordentlich;
  const sw = document.getElementById('oev-ausserord-sw');
  if(sw) sw.classList.toggle('on', _oevAusserordentlich);
}

function saveOevFahrtModal(){
  const von   = (document.getElementById('oev-von')?.value||'').trim();
  const nach  = (document.getElementById('oev-nach')?.value||'').trim();
  const date  = document.getElementById('oev-datum')?.value||todayStr();
  const preis = parseFloat(document.getElementById('oev-preis')?.value)||0;
  const norm  = parseFloat(document.getElementById('oev-normalpreis')?.value)||0;
  const notiz = (document.getElementById('oev-notiz')?.value||'').trim();
  if(!von||!nach){ toast('Bitte Von und Nach ausfüllen','error'); return; }
  if(preis<0){ toast('Preis darf nicht negativ sein','error'); return; }

  const aboIds = _getSelectedAboIds();
  const fahrt  = { id: _oevEditFahrtId||genId('OV'), date, von, nach, preis, normalpreis:norm, notiz,
                   ausserordentlich:_oevAusserordentlich, aboIds };
  closeModal('oev-fahrt-modal');
  if(_oevEditFahrtId) updateOevFahrt(fahrt);
  else saveOevFahrt(fahrt);
}

function deleteOevFahrtConfirm(){
  if(!_oevEditFahrtId) return;
  const id = _oevEditFahrtId;
  closeModal('oev-fahrt-modal');
  if(!confirm('Fahrt löschen?')) return;
  deleteOevFahrt(id);
}

// ── Modal — Abos ──────────────────────────────────────────────────
function openNewAboModal(){
  _oevEditAboId = null;
  const title = document.getElementById('oev-abo-modal-title');
  if(title) title.textContent = 'Neues Abo';
  const delBtn = document.getElementById('oev-abo-delete-btn');
  const ausgBtn= document.getElementById('oev-abo-ausgaben-btn');
  if(delBtn)  delBtn.style.display  = 'none';
  if(ausgBtn) ausgBtn.style.display = 'none';

  const fields = ['oev-abo-type','oev-abo-name','oev-abo-kaufdatum','oev-abo-gueltigbis','oev-abo-preis','oev-abo-guthaben','oev-abo-notiz'];
  fields.forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  const typeEl = document.getElementById('oev-abo-type');
  if(typeEl) typeEl.value = 'halbtax';
  oevAboTypeChanged();
  openModal('oev-abo-modal');
}

function openEditAboModal(id){
  const a = getAboById(id);
  if(!a) return;
  _oevEditAboId = id;
  const title = document.getElementById('oev-abo-modal-title');
  if(title) title.textContent = 'Abo bearbeiten';
  const delBtn = document.getElementById('oev-abo-delete-btn');
  const ausgBtn= document.getElementById('oev-abo-ausgaben-btn');
  if(delBtn)  delBtn.style.display  = '';
  if(ausgBtn) ausgBtn.style.display = (a.type!=='ga2'&&a.type!=='ga1') ? '' : 'none';

  const set = (id,v)=>{ const el=document.getElementById(id); if(el) el.value=v||''; };
  set('oev-abo-type',     a.type);
  set('oev-abo-name',     a.name);
  set('oev-abo-kaufdatum',a.kaufdatum);
  set('oev-abo-gueltigbis',a.gueltigBis);
  set('oev-abo-preis',    a.preis);
  set('oev-abo-guthaben', a.guthaben);
  set('oev-abo-notiz',    a.notiz);
  oevAboTypeChanged();
  openModal('oev-abo-modal');
}

function oevAboTypeChanged(){
  const type = document.getElementById('oev-abo-type')?.value;
  const gutGroup   = document.getElementById('oev-abo-guthaben-group');
  const preisLabel = document.getElementById('oev-abo-preis-label');
  if(gutGroup) gutGroup.style.display = type==='halbtax_plus' ? '' : 'none';
  if(preisLabel) preisLabel.textContent = type==='halbtax_plus' ? 'Einzahlung (CHF)' : 'Preis (CHF)';
  // Auto-fill default price
  const preisEl = document.getElementById('oev-abo-preis');
  if(preisEl && !preisEl.value){
    const defaults = { halbtax:'190', halbtax_plus:'800', ga2:'3860', ga1:'6300' };
    if(defaults[type]) preisEl.value = defaults[type];
  }
  // Auto-fill default validity (1 year from today)
  const gueltigEl = document.getElementById('oev-abo-gueltigbis');
  if(gueltigEl && !gueltigEl.value){
    const d = new Date(); d.setFullYear(d.getFullYear()+1);
    gueltigEl.value = d.toISOString().slice(0,10);
  }
  const kaufEl = document.getElementById('oev-abo-kaufdatum');
  if(kaufEl && !kaufEl.value) kaufEl.value = todayStr();
}

function saveOevAboModal(){
  const type      = document.getElementById('oev-abo-type')?.value||'other';
  const name      = (document.getElementById('oev-abo-name')?.value||'').trim();
  const kaufdatum = document.getElementById('oev-abo-kaufdatum')?.value||'';
  const gueltigBis= document.getElementById('oev-abo-gueltigbis')?.value||'';
  const preis     = parseFloat(document.getElementById('oev-abo-preis')?.value)||0;
  const guthaben  = parseFloat(document.getElementById('oev-abo-guthaben')?.value)||0;
  const notiz     = (document.getElementById('oev-abo-notiz')?.value||'').trim();

  const abo = { id: _oevEditAboId||genId('ABO'), type, name, kaufdatum, gueltigBis,
                preis, guthaben: type==='halbtax_plus'?guthaben:0, notiz,
                ausgabenId: _oevEditAboId ? (getAboById(_oevEditAboId)?.ausgabenId||'') : '' };
  closeModal('oev-abo-modal');
  if(_oevEditAboId) updateOevAbo(abo);
  else saveOevAbo(abo);
}

function deleteOevAboConfirm(){
  if(!_oevEditAboId) return;
  const id = _oevEditAboId;
  closeModal('oev-abo-modal');
  if(!confirm('Abo löschen?')) return;
  deleteOevAbo(id);
}

// ── Helpers ───────────────────────────────────────────────────────
function todayStr(){ return new Date().toISOString().slice(0,10); }

function formatDateShort(d){
  if(!d) return '';
  const [y,m,day] = d.split('-');
  return `${day}.${m}.${y}`;
}

function fmtAmt(n){
  if(n==null||isNaN(n)) return '0.00';
  return parseFloat(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,"'");
}

function escHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escJs(s)  { return String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }
