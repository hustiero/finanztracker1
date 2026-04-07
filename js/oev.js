/* ═══════════════════════════════════════════════════════════════
   ÖV FAHRTEN-TRACKER
   Tracks Swiss public transport journeys, subscription ROI,
   and flags extraordinary trips.
═══════════════════════════════════════════════════════════════ */

// ── State ────────────────────────────────────────────────────────
const OEV_KEY = 'ft_oev_v1';
let ODATA = { fahrten: [] };
let oevPeriod   = 'monat';  // 'monat' | 'jahr' | 'alles'
let oevFilter   = 'alle';   // 'alle' | 'regular' | 'ausserordentlich'
let _oevLoaded  = false;
let _oevEditId  = null;
let _oevAusserordentlich = false;

// ── Persistence ──────────────────────────────────────────────────
function odataLoad(){
  try{ const s = localStorage.getItem(OEV_KEY); if(s) ODATA = JSON.parse(s); }
  catch{ ODATA = { fahrten: [] }; }
}
function odataSave(){ localStorage.setItem(OEV_KEY, JSON.stringify(ODATA)); }

// ── Sheet: lazy load on first render ─────────────────────────────
async function loadOevFromSheet(){
  if(!CFG.scriptUrl && !CFG.sessionToken) return;
  try {
    await apiCall({action:'ensureSheet', sheet:'OEV',
      headers: JSON.stringify(['ID','Datum','Von','Nach','Preis','Normalpreis','Notiz','Ausserordentlich','Deleted'])});
    const res = await apiGet('OEV!A2:I5000');
    const rows = (res.values||[]).filter(r => r[0] && String(r[8]||'') !== '1');
    ODATA.fahrten = rows.map(r => ({
      id:               r[0],
      date:             r[1] || '',
      von:              r[2] || '',
      nach:             r[3] || '',
      preis:            parseFloat(r[4]) || 0,
      normalpreis:      parseFloat(r[5]) || 0,
      notiz:            r[6] || '',
      ausserordentlich: String(r[7]||'') === '1',
    }));
    odataSave();
  } catch(e) { console.warn('OEV load failed', e); }
}

// ── CRUD ─────────────────────────────────────────────────────────
async function saveOevFahrt(f){
  const row = [f.id, f.date, f.von, f.nach, f.preis,
               f.normalpreis||'', f.notiz||'', f.ausserordentlich?'1':'', ''];
  await apiAppend('OEV', [row]);
  ODATA.fahrten.unshift(f);
  odataSave();
  _updateOevSuggest();
  markDirty('oev');
}

async function updateOevFahrt(f){
  const rowNum = await apiFindRow('OEV', f.id);
  if(!rowNum) return;
  const row = [f.id, f.date, f.von, f.nach, f.preis,
               f.normalpreis||'', f.notiz||'', f.ausserordentlich?'1':'', ''];
  await apiUpdate(`OEV!A${rowNum}:I${rowNum}`, [row]);
  const idx = ODATA.fahrten.findIndex(x => x.id === f.id);
  if(idx >= 0) ODATA.fahrten[idx] = f;
  odataSave();
  _updateOevSuggest();
  markDirty('oev');
}

async function deleteOevFahrt(id){
  const rowNum = await apiFindRow('OEV', id);
  if(rowNum) await apiUpdate(`OEV!I${rowNum}`, [['1']]);
  ODATA.fahrten = ODATA.fahrten.filter(x => x.id !== id);
  odataSave();
  markDirty('oev');
}

// ── Period helpers ────────────────────────────────────────────────
function _oevPeriodRange(period){
  const now = new Date();
  if(period === 'monat'){
    const von = new Date(now.getFullYear(), now.getMonth(), 1);
    const bis = new Date(now.getFullYear(), now.getMonth()+1, 0);
    return {von, bis};
  }
  if(period === 'jahr'){
    return {von: new Date(now.getFullYear(),0,1), bis: new Date(now.getFullYear(),11,31)};
  }
  return {von: new Date(0), bis: new Date(9999,0)};
}

function _oevInRange(f, von, bis){
  const d = new Date(f.date);
  return d >= von && d <= bis;
}

// ── Calculations ─────────────────────────────────────────────────
function _oevStats(fahrten){
  let total = 0, normalpreisSum = 0, savings = 0, count = 0;
  fahrten.forEach(f => {
    total += f.preis;
    count++;
    if(f.normalpreis > 0){
      normalpreisSum += f.normalpreis;
      savings += (f.normalpreis - f.preis);
    } else if(CFG.oevAboType === 'halbtax' || CFG.oevAboType === 'halbtax_plus'){
      // Halbtax = 50% off → saved ≈ same as paid
      savings += f.preis;
      normalpreisSum += f.preis * 2;
    }
  });
  return {total, normalpreisSum, savings, count};
}

function _oevAboInfo(){
  const type = CFG.oevAboType || 'keine';
  const jahreskosten = CFG.oevAboJahreskosten || 0;
  if(type === 'keine' || !jahreskosten) return {type:'keine'};

  const {von} = _oevPeriodRange('jahr'); // current year
  const allFahrten = ODATA.fahrten.filter(f => new Date(f.date) >= von);
  const {total, savings} = _oevStats(allFahrten);

  if(type === 'halbtax_plus'){
    const verbraucht = ODATA.fahrten.reduce((s,f) => s + f.preis, 0); // all time
    const restguthaben = Math.max(0, jahreskosten - verbraucht);
    const restPct = jahreskosten > 0 ? Math.min(100, restguthaben / jahreskosten * 100) : 0;
    return {type, jahreskosten, verbraucht, restguthaben, restPct};
  }

  // halbtax / ga2 / ga1: annual amortisation
  const amortPct = jahreskosten > 0 ? Math.min(200, savings / jahreskosten * 100) : 0;
  return {type, jahreskosten, savings, amortPct, amortisiert: savings >= jahreskosten};
}

// ── Render ────────────────────────────────────────────────────────
async function renderOev(){
  if(!_oevLoaded){ _oevLoaded = true; await loadOevFromSheet(); }

  // Period chip state
  ['monat','jahr','alles'].forEach(p => {
    const btn = document.getElementById('oev-chip-'+p);
    if(btn) btn.classList.toggle('active', p === oevPeriod);
  });
  // Filter chip state
  ['alle','regular','ausserordentlich'].forEach(f => {
    const btn = document.getElementById('oev-chip-'+f);
    if(btn) btn.classList.toggle('active', f === oevFilter);
  });

  const {von, bis} = _oevPeriodRange(oevPeriod);
  let fahrten = ODATA.fahrten.filter(f => _oevInRange(f, von, bis));
  if(oevFilter === 'regular')          fahrten = fahrten.filter(f => !f.ausserordentlich);
  if(oevFilter === 'ausserordentlich') fahrten = fahrten.filter(f =>  f.ausserordentlich);

  const stats = _oevStats(fahrten);
  _renderOevSummaryCard(stats);
  _renderOevAboCard(_oevAboInfo());
  _renderOevList(fahrten);
  _updateOevSuggest();
}

function oevSetPeriod(p){ oevPeriod = p; renderOev(); }
function oevSetFilter(f){ oevFilter = f; renderOev(); }

function _renderOevSummaryCard(stats){
  const el = document.getElementById('oev-summary-card');
  if(!el) return;
  const showSavings = CFG.oevAboType !== 'keine';
  el.innerHTML = `<div class="oev-summary-grid">
    <div>
      <div class="oev-stat-lbl">Ausgaben</div>
      <div class="oev-stat-val">${curr()} ${fmtAmt(stats.total)}</div>
    </div>
    ${showSavings ? `<div>
      <div class="oev-stat-lbl">Ersparnis</div>
      <div class="oev-stat-val green">${curr()} ${fmtAmt(stats.savings)}</div>
    </div>
    <div>
      <div class="oev-stat-lbl">Vollpreis</div>
      <div class="oev-stat-val">${curr()} ${fmtAmt(stats.normalpreisSum)}</div>
    </div>` : `<div>
      <div class="oev-stat-lbl">Fahrten</div>
      <div class="oev-stat-val">${stats.count}</div>
    </div><div></div>`}
  </div>`;
}

function _renderOevAboCard(abo){
  const el = document.getElementById('oev-abo-card');
  if(!el) return;
  if(abo.type === 'keine'){ el.innerHTML = ''; return; }

  let html = '<div class="oev-abo-box">';
  const labels = {halbtax:'Halbtax', halbtax_plus:'Halbtax Plus', ga2:'GA 2. Kl.', ga1:'GA 1. Kl.'};
  html += `<div class="oev-abo-title">${labels[abo.type]||abo.type}</div>`;

  if(abo.type === 'halbtax_plus'){
    const pct = 100 - abo.restPct;
    html += `<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">
      <span style="color:var(--text2)">Restguthaben</span>
      <span style="font-family:'DM Mono',monospace;font-weight:600">${curr()} ${fmtAmt(abo.restguthaben)} <span style="color:var(--text3);font-weight:400">/ ${fmtAmt(abo.jahreskosten)}</span></span>
    </div>
    <div class="oev-progress-track"><div class="oev-progress-fill" style="--bar-w:${pct.toFixed(1)}%"></div></div>
    <div class="oev-abo-row"><span>Verbraucht: ${curr()} ${fmtAmt(abo.verbraucht)}</span><span>${pct.toFixed(0)}%</span></div>`;
  } else {
    const pct = Math.min(100, abo.amortPct);
    const color = abo.amortisiert ? 'var(--green)' : 'var(--accent)';
    html += `<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">
      <span style="color:var(--text2)">Amortisiert</span>
      <span style="font-family:'DM Mono',monospace;font-weight:600">${pct.toFixed(0)}%
        ${abo.amortisiert ? '<span style="color:var(--green);font-size:11px;margin-left:4px">✓ bezahlt</span>' : ''}
      </span>
    </div>
    <div class="oev-progress-track"><div class="oev-progress-fill${abo.amortisiert?' done':''}" style="--bar-w:${pct.toFixed(1)}%"></div></div>
    <div class="oev-abo-row"><span>Ersparnis: ${curr()} ${fmtAmt(abo.savings)}</span><span>Abo: ${curr()} ${fmtAmt(abo.jahreskosten)}/Jahr</span></div>`;
  }
  html += '</div>';
  el.innerHTML = html;
}

function _renderOevList(fahrten){
  const el = document.getElementById('oev-list');
  if(!el) return;
  if(!fahrten.length){
    el.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--text3);font-size:14px">Noch keine Fahrten erfasst</div>';
    return;
  }
  const sorted = [...fahrten].sort((a,b) => b.date.localeCompare(a.date));
  let html = '<div class="card" style="padding:0 14px;margin:0 16px 16px">';
  sorted.forEach(f => {
    const savings = f.normalpreis > 0 ? f.normalpreis - f.preis
      : (CFG.oevAboType==='halbtax'||CFG.oevAboType==='halbtax_plus') ? f.preis : 0;
    html += `<div class="oev-row" onclick="openEditFahrtModal('${f.id}')">
      <div class="oev-row-left">
        <div class="oev-row-route">${esc(f.von)} → ${esc(f.nach)}
          ${f.ausserordentlich ? '<span class="oev-badge">★</span>' : ''}
        </div>
        <div class="oev-row-meta">${fmtDate(f.date)}${f.notiz ? ' · '+esc(f.notiz) : ''}</div>
      </div>
      <div class="oev-row-right">
        <div class="oev-row-preis">${curr()} ${fmtAmt(f.preis)}</div>
        ${savings > 0 && CFG.oevAboType!=='keine' ? `<div class="oev-row-savings">-${curr()} ${fmtAmt(savings)}</div>` : ''}
      </div>
    </div>`;
  });
  html += '</div>';
  el.innerHTML = html;
}

// ── Autocomplete (datalist) ───────────────────────────────────────
function _updateOevSuggest(){
  const dl = document.getElementById('oev-destinations');
  if(!dl) return;
  const seen = new Set();
  const opts = [];
  ODATA.fahrten.forEach(f => {
    [f.von, f.nach].forEach(v => {
      if(v && !seen.has(v)){ seen.add(v); opts.push(`<option value="${esc(v)}">`); }
    });
  });
  dl.innerHTML = opts.join('');
}

// ── Modal ─────────────────────────────────────────────────────────
function openNewFahrtModal(){
  _oevEditId = null;
  _oevAusserordentlich = false;
  document.getElementById('oev-modal-title').textContent = 'Neue Fahrt';
  document.getElementById('oev-von').value = '';
  document.getElementById('oev-nach').value = '';
  document.getElementById('oev-datum').value = today();
  document.getElementById('oev-preis').value = '';
  document.getElementById('oev-normalpreis').value = '';
  document.getElementById('oev-notiz').value = '';
  document.getElementById('oev-delete-btn').style.display = 'none';
  const sw = document.getElementById('oev-ausserord-sw');
  if(sw) sw.classList.remove('on');
  openModal('oev-fahrt-modal');
}

function openEditFahrtModal(id){
  const f = ODATA.fahrten.find(x => x.id === id);
  if(!f) return;
  _oevEditId = id;
  _oevAusserordentlich = !!f.ausserordentlich;
  document.getElementById('oev-modal-title').textContent = 'Fahrt bearbeiten';
  document.getElementById('oev-von').value = f.von;
  document.getElementById('oev-nach').value = f.nach;
  document.getElementById('oev-datum').value = f.date;
  document.getElementById('oev-preis').value = f.preis || '';
  document.getElementById('oev-normalpreis').value = f.normalpreis || '';
  document.getElementById('oev-notiz').value = f.notiz || '';
  document.getElementById('oev-delete-btn').style.display = '';
  const sw = document.getElementById('oev-ausserord-sw');
  if(sw) sw.classList.toggle('on', !!f.ausserordentlich);
  openModal('oev-fahrt-modal');
}

function toggleOevAusserordentlich(){
  _oevAusserordentlich = !_oevAusserordentlich;
  const sw = document.getElementById('oev-ausserord-sw');
  if(sw) sw.classList.toggle('on', _oevAusserordentlich);
}

async function saveOevFahrtModal(){
  const von   = document.getElementById('oev-von').value.trim();
  const nach  = document.getElementById('oev-nach').value.trim();
  const datum = document.getElementById('oev-datum').value;
  const preis = parseFloat(document.getElementById('oev-preis').value);
  if(!von || !nach){ toast('Von und Nach sind Pflichtfelder', 'err'); return; }
  if(!preis || preis <= 0){ toast('Bitte einen Preis eingeben', 'err'); return; }

  const f = {
    id:               _oevEditId || genId('OV'),
    date:             datum || today(),
    von, nach, preis,
    normalpreis:      parseFloat(document.getElementById('oev-normalpreis').value) || 0,
    notiz:            document.getElementById('oev-notiz').value.trim(),
    ausserordentlich: _oevAusserordentlich,
  };

  closeModal('oev-fahrt-modal');
  try {
    if(_oevEditId) await updateOevFahrt(f);
    else           await saveOevFahrt(f);
    toast(_oevEditId ? 'Fahrt aktualisiert' : 'Fahrt gespeichert');
  } catch(e){
    toast('Fehler beim Speichern', 'err');
    console.error('saveOevFahrtModal', e);
  }
}

async function deleteOevFahrtConfirm(){
  if(!_oevEditId) return;
  const id = _oevEditId;
  const ok = await confirmDialog('Fahrt löschen?', 'Löschen');
  if(!ok) return;
  closeModal('oev-fahrt-modal');
  try { await deleteOevFahrt(id); toast('Fahrt gelöscht'); }
  catch(e){ toast('Fehler beim Löschen', 'err'); }
}

// ── Settings ─────────────────────────────────────────────────────
function renderOevSettings(){
  const typeSel = document.getElementById('oev-abo-type');
  if(typeSel) typeSel.value = CFG.oevAboType || 'halbtax';

  const kostenInput = document.getElementById('oev-abo-kosten');
  if(kostenInput) kostenInput.value = CFG.oevAboJahreskosten || '';

  const kostenLabel = document.getElementById('oev-kosten-label');
  if(kostenLabel) kostenLabel.textContent =
    CFG.oevAboType === 'halbtax_plus' ? 'Guthaben total (CHF)' : 'Jährliche Kosten (CHF)';

  const kostenRow = document.getElementById('oev-kosten-row');
  if(kostenRow) kostenRow.style.display = CFG.oevAboType === 'keine' ? 'none' : '';
}

function saveOevAboSettings(){
  CFG.oevAboType        = document.getElementById('oev-abo-type')?.value || 'halbtax';
  CFG.oevAboJahreskosten = parseFloat(document.getElementById('oev-abo-kosten')?.value) || 0;
  cfgSave();
  autoSyncProfile();
  renderOevSettings(); // update label
  markDirty('oev');
}
