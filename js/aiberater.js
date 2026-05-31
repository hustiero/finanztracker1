// ═══════════════════════════════════════════════════════════════
// AI-Berater — Portfolio + Due-Diligence (vanilla, im Aktien-Tab)
//
// Nutzt finanztracker-Infrastruktur:
//   openModal/closeModal (ui.js), toast (ui.js), CFG (core.js)
//   Auth via CFG.sessionToken + CFG.adminUrl
//   Sheet-Sync via aibApiCall → admin-code.gs (ai_pull / ai_push)
//
// Sub-Module:
//   aiberater-coach.js  — Claude-Chat über das Portfolio
//   aiberater-tax.js    — Saxo-CSV-Import + CH-Steuer-Auswertung
// ═══════════════════════════════════════════════════════════════

// ── State ────────────────────────────────────────────────────────────────────
var AIB_STATE = {
  loaded: false,
  loading: false,
  dirty: false,
  bootErr: null,
  lastSavedAt: null,
  portfolio: [],
  chatHistory: [],
  transactions: [],
  openPositionId: null,
};

var aibView = 'portfolio'; // 'portfolio' | 'coach' | 'steuern'

// ── DD-Schema ─────────────────────────────────────────────────────────────────
var AIB_MODEL_COACH = 'claude-sonnet-4-6';
var AIB_VERDICTS = ['sell', 'reduce', 'hold', 'add', 'watch'];
var AIB_VERDICT_LABEL = { sell: 'Verkaufen', reduce: 'Reduzieren', hold: 'Halten', add: 'Nachkaufen', watch: 'Beobachten' };
var AIB_VERDICT_SORT = { sell: 0, reduce: 1, add: 2, watch: 3, hold: 4, '': 5 };
var AIB_DD_LIST_FIELDS = ['strengths', 'risks', 'catalysts'];

function aibEmptyDD() {
  return {
    thesis: '', strengths: [], risks: [], catalysts: [],
    fundamentals: '', userNotes: '',
    recommendation: { verdict: '', confidence: '', rationale: '', setAt: null },
    lastAnalyzedAt: null, lastAnalysisModel: '', history: [],
  };
}

function aibEnsureDD(item) {
  var base = aibEmptyDD();
  if (item && item.dueDiligence && typeof item.dueDiligence === 'object') {
    var d = item.dueDiligence;
    var rec = d.recommendation && typeof d.recommendation === 'object' ? d.recommendation : {};
    return Object.assign({}, base, d, {
      strengths: Array.isArray(d.strengths) ? d.strengths : [],
      risks: Array.isArray(d.risks) ? d.risks : [],
      catalysts: Array.isArray(d.catalysts) ? d.catalysts : [],
      history: Array.isArray(d.history) ? d.history : [],
      recommendation: {
        verdict: AIB_VERDICTS.indexOf(rec.verdict) >= 0 ? rec.verdict : '',
        confidence: ['low', 'medium', 'high'].indexOf(rec.confidence) >= 0 ? rec.confidence : '',
        rationale: typeof rec.rationale === 'string' ? rec.rationale : '',
        setAt: typeof rec.setAt === 'number' ? rec.setAt : null,
      },
    });
  }
  return Object.assign({}, base, { thesis: item && item.note ? item.note : '' });
}

function aibDDFreshness(dd) {
  if (!dd || !dd.lastAnalyzedAt) return 'unknown';
  var days = (Date.now() - dd.lastAnalyzedAt) / 86400000;
  if (days < 30) return 'fresh';
  if (days < 90) return 'stale';
  return 'cold';
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function aibUid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
function aibNum(v) {
  if (v == null || v === '') return 0;
  var n = typeof v === 'number' ? v : parseFloat(String(v).replace(/'/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}
function aibFmt(n, digits) {
  return aibNum(n).toLocaleString('de-CH', { minimumFractionDigits: digits == null ? 2 : digits, maximumFractionDigits: digits == null ? 2 : digits });
}
function aibFmtCcy(n, ccy) {
  return aibFmt(n, 2) + ' ' + (ccy || 'CHF');
}
function aibFmtShares(n) {
  n = aibNum(n);
  if (n === 0) return '0';
  if (Math.abs(n) >= 1) return n % 1 === 0 ? String(n) : aibFmt(n, 2);
  // Bruchteile (Krypto): bis 6 signifikante Stellen, ohne Trailing-Nullen
  return parseFloat(n.toFixed(6)).toString();
}
function aibEscape(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
}
function aibCurrentPos() {
  return AIB_STATE.portfolio.find(function (p) { return p.id === AIB_STATE.openPositionId; }) || null;
}

// ── Sub-Tab-Navigation ──────────────────────────────────────────────────────
function aibSetView(v) {
  aibView = v;
  ['portfolio', 'coach', 'steuern'].forEach(function (t) {
    var btn = document.getElementById('aib-tab-' + t);
    var view = document.getElementById('aib-view-' + t);
    if (btn) btn.classList.toggle('active', t === v);
    if (view) view.style.display = t === v ? 'block' : 'none';
  });
  aibRender();
}

function aibRender() {
  if (aibView === 'portfolio') renderAibPortfolio();
  else if (aibView === 'coach') renderAibCoach();
  else if (aibView === 'steuern') renderAibTax();
  aibUpdateSaveFab();
}

function aibUpdateSaveFab() {
  var fab = document.getElementById('aib-save-fab');
  if (fab) fab.style.display = AIB_STATE.dirty ? 'flex' : 'none';
}

function aibMarkDirty() {
  AIB_STATE.dirty = true;
  aibUpdateSaveFab();
}

// ── Auth + Sheet-Sync ───────────────────────────────────────────────────────
function aibCheckAuth() {
  if (!CFG.sessionToken || !CFG.adminUrl) {
    if (typeof toast === 'function') toast('Bitte zuerst im finanztracker anmelden', 'err');
    return false;
  }
  return true;
}

// Kleine Params → URL, grosse JSON-Strings → POST-Body (doPost merged beide).
async function aibApiCall(params) {
  if (!aibCheckAuth()) throw new Error('Nicht angemeldet.');
  var urlParams = { token: CFG.sessionToken };
  var body = {};
  var hasBig = false;
  Object.keys(params || {}).forEach(function (k) {
    var v = params[k];
    if (v == null) return;
    var s = typeof v === 'string' ? v : JSON.stringify(v);
    if (k === 'action' || k === 'token' || s.length < 1500) urlParams[k] = s;
    else { body[k] = s; hasBig = true; }
  });
  var url = CFG.adminUrl + '?' + new URLSearchParams(urlParams).toString();
  var opts = hasBig ? { method: 'POST', body: JSON.stringify(body), redirect: 'follow' } : { method: 'GET' };
  var r;
  try { r = await fetch(url, opts); } catch (e) { throw new Error('Netzwerkfehler: ' + (e.message || e)); }
  if (r.status === 401) {
    CFG.sessionToken = ''; CFG.authRole = ''; if (typeof cfgSave === 'function') cfgSave();
    throw new Error('Sitzung abgelaufen — bitte neu anmelden.');
  }
  if (!r.ok) throw new Error('HTTP ' + r.status);
  var d;
  try { d = await r.json(); } catch { throw new Error('Ungültige Server-Antwort'); }
  if (d && d.error) {
    if (String(d.error).indexOf('Unbekannte Aktion') >= 0) {
      throw new Error('Apps-Script ist nicht aktuell. Im Editor neu bereitstellen (Version: Neu) — siehe Einstellungen.');
    }
    throw new Error(d.error);
  }
  return d;
}

// Bullets von leeren Strings befreien (entstehen beim Editieren).
function aibSanitizePortfolio(list) {
  return list.map(function (p) {
    var c = Object.assign({}, p);
    if (c.dueDiligence) {
      var dd = Object.assign({}, c.dueDiligence);
      AIB_DD_LIST_FIELDS.forEach(function (f) {
        if (Array.isArray(dd[f])) dd[f] = dd[f].filter(function (x) { return String(x).trim() !== ''; });
      });
      c.dueDiligence = dd;
    }
    return c;
  });
}

async function aibPull() {
  AIB_STATE.loading = true;
  AIB_STATE.bootErr = null;
  try {
    var d = await aibApiCall({ action: 'ai_pull' });
    AIB_STATE.portfolio = Array.isArray(d.portfolio) ? d.portfolio.map(function (p) { p.dueDiligence = aibEnsureDD(p); return p; }) : [];
    AIB_STATE.chatHistory = Array.isArray(d.chatHistory) ? d.chatHistory : [];
    AIB_STATE.transactions = Array.isArray(d.transactions) ? d.transactions : [];
    AIB_STATE.loaded = true;
    AIB_STATE.lastSavedAt = Date.now();
    AIB_STATE.dirty = false;
    return true;
  } catch (e) {
    AIB_STATE.bootErr = e.message || String(e);
    return false;
  } finally {
    AIB_STATE.loading = false;
  }
}

async function aibPush() {
  try {
    await aibApiCall({
      action: 'ai_push',
      portfolio: aibSanitizePortfolio(AIB_STATE.portfolio),
      chatHistory: AIB_STATE.chatHistory,
      transactions: AIB_STATE.transactions,
    });
    AIB_STATE.dirty = false;
    AIB_STATE.lastSavedAt = Date.now();
    return true;
  } catch (e) {
    if (typeof toast === 'function') toast('Speichern fehlgeschlagen: ' + (e.message || e), 'err');
    return false;
  }
}

async function aibSave() {
  var fab = document.getElementById('aib-save-fab');
  if (fab) { fab.disabled = true; fab.textContent = 'Speichere…'; }
  var ok = await aibPush();
  if (fab) { fab.disabled = false; fab.textContent = 'Speichern'; }
  aibUpdateSaveFab();
  if (ok && typeof toast === 'function') toast('Gespeichert', '');
}

// ── Bootstrap ────────────────────────────────────────────────────────────────
async function aibBoot() {
  if (AIB_STATE.loading || AIB_STATE.loaded) { aibRender(); return; }
  var status = document.getElementById('aib-portfolio-status');
  if (!aibCheckAuth()) {
    if (status) { status.style.display = 'block'; status.textContent = 'Bitte zuerst im finanztracker anmelden.'; }
    return;
  }
  if (status) { status.style.display = 'block'; status.textContent = 'Lade aus Sheet…'; }
  var ok = await aibPull();
  if (status) {
    if (!ok) {
      status.style.display = 'block';
      status.innerHTML = '<div style="color:#FF6B6B;font-weight:600;margin-bottom:8px">' + aibEscape(AIB_STATE.bootErr) + '</div>' +
        '<button class="filter-chip" onclick="AIB_STATE.loaded=false;aibBoot()">Erneut versuchen</button>';
      return;
    }
    status.style.display = 'none';
  }
  aibRender();
}

// ── Portfolio-View ──────────────────────────────────────────────────────────
function aibPortfolioSorted() {
  return AIB_STATE.portfolio.slice().sort(function (a, b) {
    var va = aibEnsureDD(a).recommendation.verdict;
    var vb = aibEnsureDD(b).recommendation.verdict;
    var ra = AIB_VERDICT_SORT[va], rb = AIB_VERDICT_SORT[vb];
    if (ra !== rb) return ra - rb;
    return (aibNum(b.shares) * aibNum(b.currentPrice)) - (aibNum(a.shares) * aibNum(a.currentPrice));
  });
}

function renderAibPortfolio() {
  var listEl = document.getElementById('aib-portfolio-list');
  var statusEl = document.getElementById('aib-portfolio-status');
  if (!listEl) return;
  if (statusEl && AIB_STATE.loaded && !AIB_STATE.bootErr) statusEl.style.display = 'none';

  if (AIB_STATE.portfolio.length === 0) {
    listEl.innerHTML = '<div class="aib-empty">Noch keine Positionen.<br>' +
      '<span style="font-size:12px;opacity:.7">„+ Position" für manuelle Erfassung, oder importiere eine Broker-CSV und nutze „Aus Trades aufbauen".</span></div>';
    return;
  }

  // Summary: Wert je Währung + Verdict-Übersicht
  var byCcy = {}, verdicts = { sell: 0, reduce: 0, hold: 0, add: 0, watch: 0, none: 0 };
  AIB_STATE.portfolio.forEach(function (p) {
    var ccy = p.currency || 'CHF';
    byCcy[ccy] = (byCcy[ccy] || 0) + aibNum(p.shares) * aibNum(p.currentPrice);
    var v = aibEnsureDD(p).recommendation.verdict;
    verdicts[v || 'none']++;
  });
  var ccyStr = Object.keys(byCcy).map(function (c) { return aibFmt(byCcy[c], 0) + ' ' + c; }).join(' · ');
  var actionable = verdicts.sell + verdicts.reduce + verdicts.add;
  var verdictBits = [];
  if (verdicts.sell) verdictBits.push(verdicts.sell + ' verkaufen');
  if (verdicts.reduce) verdictBits.push(verdicts.reduce + ' reduzieren');
  if (verdicts.add) verdictBits.push(verdicts.add + ' nachkaufen');
  if (verdicts.none) verdictBits.push(verdicts.none + ' ohne DD');

  var summary = '<div class="aib-summary">' +
    '<div class="aib-summary-row"><span>' + AIB_STATE.portfolio.length + ' Positionen</span><span>' + aibEscape(ccyStr) + '</span></div>' +
    (verdictBits.length ? '<div class="aib-summary-sub">' + (actionable ? 'Handeln: ' : '') + aibEscape(verdictBits.join(' · ')) + '</div>' : '') +
  '</div>';

  var cards = aibPortfolioSorted().map(function (p) {
    var dd = aibEnsureDD(p);
    var fresh = aibDDFreshness(dd);
    var verdict = dd.recommendation.verdict;
    var verdictHtml = verdict ? '<span class="aib-verdict aib-verdict-' + verdict + '">' + AIB_VERDICT_LABEL[verdict] + '</span>' : '';
    var ageDays = dd.lastAnalyzedAt ? Math.round((Date.now() - dd.lastAnalyzedAt) / 86400000) : null;
    var ageStr = ageDays == null ? 'keine AI-DD' : (ageDays === 0 ? 'DD heute' : 'DD ' + ageDays + ' Tage');
    var mvLocal = aibNum(p.shares) * aibNum(p.currentPrice);
    return '<div class="aib-card" onclick="openAibPositionModal(\'' + p.id + '\')">' +
      '<div class="aib-card-head"><div class="aib-card-title">' + aibEscape(p.name || p.ticker) + ' ' + verdictHtml + '</div></div>' +
      '<div class="aib-card-sub">' + aibEscape(p.ticker) + ' · ' + aibFmtShares(p.shares) + ' × ' + aibFmtCcy(p.currentPrice, p.currency) + '</div>' +
      '<div class="aib-card-meta">' +
        '<span><span class="aib-aging-dot aib-aging-' + fresh + '"></span>' + ageStr + '</span>' +
        '<span>' + aibFmtCcy(mvLocal, p.currency) + '</span>' +
      '</div>' +
    '</div>';
  }).join('');

  listEl.innerHTML = summary + cards;
}

// ── Position-Detail-Modal ───────────────────────────────────────────────────
function openAibPositionModal(id) {
  var pos = AIB_STATE.portfolio.find(function (p) { return p.id === id; });
  if (!pos) return;
  AIB_STATE.openPositionId = id;
  document.getElementById('aib-pos-title').textContent = pos.name || pos.ticker;
  document.getElementById('aib-pos-body').innerHTML = renderAibPositionBody(pos);
  openModal('aib-position-modal');
}

function renderAibPositionBody(pos) {
  var dd = aibEnsureDD(pos);
  var v = dd.recommendation.verdict;
  var recHtml = v
    ? '<div class="aib-rec-bubble ' + v + '"><b>' + AIB_VERDICT_LABEL[v].toUpperCase() + '</b>' +
      (dd.recommendation.confidence ? ' <span style="opacity:.7;font-size:12px">· ' + dd.recommendation.confidence + '</span>' : '') +
      (dd.recommendation.rationale ? '<div style="font-size:13px;margin-top:4px;opacity:.95">' + aibEscape(dd.recommendation.rationale) + '</div>' : '') +
      '</div>'
    : '<div class="aib-rec-bubble" style="border-style:dashed;color:var(--text2);font-size:12px">Noch keine AI-Empfehlung. „DD aktualisieren" unten startet die Recherche.</div>';

  var ageDays = dd.lastAnalyzedAt ? Math.round((Date.now() - dd.lastAnalyzedAt) / 86400000) : null;
  var ageStr = ageDays == null ? 'noch nie' : (ageDays === 0 ? 'heute' : 'vor ' + ageDays + ' Tagen');

  return '' +
    '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text2);margin-bottom:10px">' +
      '<span>' + aibEscape(pos.ticker) + ' · ' + aibEscape(pos.assetClass || '—') + ' · ' + aibEscape(pos.currency || '') + '</span>' +
      '<span>DD: ' + ageStr + '</span>' +
    '</div>' +
    recHtml +
    '<button class="save-btn" style="margin-bottom:14px" onclick="aibRefreshDD(\'' + pos.id + '\')" id="aib-refresh-dd-btn">DD aktualisieren (mit Web-Recherche)</button>' +

    '<div class="aib-dd-section" style="padding-top:0;border-top:0">' +
      '<h4>Thesis</h4>' +
      '<textarea class="form-input" rows="2" placeholder="Warum hältst du diese Position?" oninput="aibPosFieldChanged(\'thesis\', this.value)">' + aibEscape(dd.thesis) + '</textarea>' +
    '</div>' +

    aibRenderBulletSection('strengths', 'Stärken', dd.strengths) +
    aibRenderBulletSection('risks', 'Risiken', dd.risks) +
    aibRenderBulletSection('catalysts', 'Catalysts', dd.catalysts) +

    '<div class="aib-dd-section">' +
      '<h4>Fundamentals</h4>' +
      '<textarea class="form-input" rows="3" placeholder="P/E, Margen, Verschuldung…" oninput="aibPosFieldChanged(\'fundamentals\', this.value)">' + aibEscape(dd.fundamentals) + '</textarea>' +
    '</div>' +

    '<div class="aib-dd-section">' +
      '<h4>Eigene Notizen <span style="font-weight:400;color:var(--text2);font-size:12px">(AI fasst diese nie an)</span></h4>' +
      '<textarea class="form-input" rows="2" oninput="aibPosFieldChanged(\'userNotes\', this.value)">' + aibEscape(dd.userNotes) + '</textarea>' +
    '</div>' +

    aibRenderHistory(dd) +

    '<details class="aib-dd-section">' +
      '<summary style="cursor:pointer;font-weight:600;font-size:13px;color:var(--text)">Stammdaten bearbeiten</summary>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">' +
        '<div><label class="form-label">Ticker</label><input class="form-input" type="text" value="' + aibEscape(pos.ticker) + '" oninput="aibPosFieldChanged(\'ticker\', this.value.toUpperCase())"></div>' +
        '<div><label class="form-label">Asset-Klasse</label><input class="form-input" type="text" value="' + aibEscape(pos.assetClass || '') + '" oninput="aibPosFieldChanged(\'assetClass\', this.value)"></div>' +
        '<div><label class="form-label">Anzahl</label><input class="form-input" type="number" step="any" value="' + aibNum(pos.shares) + '" oninput="aibPosFieldChanged(\'shares\', parseFloat(this.value)||0)"></div>' +
        '<div><label class="form-label">Einstand</label><input class="form-input" type="number" step="any" value="' + aibNum(pos.costBasis) + '" oninput="aibPosFieldChanged(\'costBasis\', parseFloat(this.value)||0)"></div>' +
        '<div><label class="form-label">Akt. Kurs</label><input class="form-input" type="number" step="any" value="' + aibNum(pos.currentPrice) + '" oninput="aibPosFieldChanged(\'currentPrice\', parseFloat(this.value)||0)"></div>' +
        '<div><label class="form-label">Währung</label><input class="form-input" type="text" value="' + aibEscape(pos.currency || '') + '" oninput="aibPosFieldChanged(\'currency\', this.value.toUpperCase())"></div>' +
      '</div>' +
    '</details>' +

    '<button class="btn-cancel" style="background:rgba(229,75,75,.15);color:#FF6B6B;border:1px solid rgba(229,75,75,.3);margin-top:14px" onclick="aibDeletePosition(\'' + pos.id + '\')">Position löschen</button>';
}

function aibRenderHistory(dd) {
  var h = (dd.history || []).filter(function (x) { return x && x.summary; });
  if (h.length === 0) return '';
  var rows = h.slice(0, 5).map(function (e) {
    var dt = e.ts ? new Date(e.ts).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
    return '<div style="font-size:11px;color:var(--text2);padding:4px 0;border-top:1px solid var(--border)">' +
      '<span style="color:var(--text);font-weight:500">' + aibEscape(dt) + '</span> · ' + aibEscape(e.summary) + '</div>';
  }).join('');
  return '<details class="aib-dd-section">' +
    '<summary style="cursor:pointer;font-weight:600;font-size:13px;color:var(--text)">DD-Verlauf (' + h.length + ')</summary>' +
    '<div style="margin-top:6px">' + rows + '</div>' +
  '</details>';
}

function aibRenderBulletSection(field, label, items) {
  var rows = (items || []).map(function (it) { return aibBulletRowHtml(field, it); }).join('');
  return '<div class="aib-dd-section" data-bullet-section="' + field + '"><h4>' + label + '</h4>' +
    '<div class="aib-bullet-list">' + rows +
      '<button class="aib-bullet-add" onclick="aibBulletAdd(\'' + field + '\')">+ ' + label.toLowerCase() + '</button>' +
    '</div>' +
  '</div>';
}

function aibBulletRowHtml(field, value) {
  return '<div class="aib-bullet-row">' +
    '<input type="text" data-bullet="' + field + '" value="' + aibEscape(value) + '" oninput="aibCollectBullets(\'' + field + '\')">' +
    '<button class="aib-bullet-del" onclick="aibBulletDelRow(this, \'' + field + '\')" title="Entfernen">✕</button>' +
  '</div>';
}

// Liest alle Bullet-Inputs eines Feldes aus dem DOM zurück in den State.
// Index-frei → keine Verschiebungs-Bugs beim Löschen.
function aibCollectBullets(field) {
  var pos = aibCurrentPos();
  if (!pos) return;
  pos.dueDiligence = aibEnsureDD(pos);
  var inputs = document.querySelectorAll('#aib-pos-body input[data-bullet="' + field + '"]');
  pos.dueDiligence[field] = Array.prototype.map.call(inputs, function (i) { return i.value; });
  aibMarkDirty();
}

function aibBulletAdd(field) {
  var section = document.querySelector('#aib-pos-body [data-bullet-section="' + field + '"] .aib-bullet-list');
  if (!section) return;
  var addBtn = section.querySelector('.aib-bullet-add');
  var tmp = document.createElement('div');
  tmp.innerHTML = aibBulletRowHtml(field, '');
  var row = tmp.firstChild;
  section.insertBefore(row, addBtn);
  var input = row.querySelector('input');
  if (input) input.focus();
  aibCollectBullets(field);
}

function aibBulletDelRow(btn, field) {
  var row = btn.closest('.aib-bullet-row');
  if (row) row.remove();
  aibCollectBullets(field);
}

function aibPosFieldChanged(field, value) {
  var pos = aibCurrentPos();
  if (!pos) return;
  if (field === 'thesis' || field === 'fundamentals' || field === 'userNotes') {
    pos.dueDiligence = aibEnsureDD(pos);
    pos.dueDiligence[field] = value;
    if (field === 'thesis') pos.note = value;
  } else {
    pos[field] = value;
  }
  aibMarkDirty();
}

function aibDeletePosition(id) {
  if (!confirm('Position wirklich löschen?')) return;
  AIB_STATE.portfolio = AIB_STATE.portfolio.filter(function (p) { return p.id !== id; });
  closeModal('aib-position-modal');
  aibMarkDirty();
  renderAibPortfolio();
}

// ── AI-DD-Refresh (Claude + web_search) ─────────────────────────────────────
async function aibCallClaude(opts) {
  var apiKey = CFG.anthropicApiKey || '';
  if (!apiKey) throw new Error('Anthropic API-Key fehlt — in den AI-Berater-Einstellungen setzen.');
  var body = {
    model: opts.model || AIB_MODEL_COACH,
    max_tokens: opts.maxTokens || 2500,
    system: opts.system,
    messages: opts.messages,
  };
  if (opts.tools && opts.tools.length) body.tools = opts.tools;
  var r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    var txt = await r.text().catch(function () { return ''; });
    throw new Error('Claude-API ' + r.status + ': ' + txt.slice(0, 160));
  }
  var data = await r.json();
  return (data.content || []).filter(function (b) { return b && b.type === 'text' && typeof b.text === 'string'; }).map(function (b) { return b.text; }).join('\n').trim();
}

async function aibRefreshDD(positionId) {
  var pos = AIB_STATE.portfolio.find(function (p) { return p.id === positionId; });
  if (!pos) return;
  var btn = document.getElementById('aib-refresh-dd-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Recherchiere…'; }
  try {
    var current = aibEnsureDD(pos);
    var system = 'Du bist ein Equity-Research-Analyst für einen Schweizer Privatanleger. Liefere eine fundierte Due-Diligence zu EINER Aktie/ETF/Fund. Recherchiere mit web_search aktuelle Earnings, Analyst-Calls, Sektor-News (max 5 Suchen). Sei knapp und präzise. Antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt – kein Markdown:\n{\n  "thesis": "1-2 Sätze, max 220 Zeichen",\n  "strengths": ["3-5 Bullets, max 110 Zeichen je"],\n  "risks": ["3-5 Bullets, max 110 Zeichen je"],\n  "catalysts": ["2-4 Events mit Datum"],\n  "fundamentals": "P/E, EV/EBITDA, Marge, Verschuldung, Wachstum. Max 400 Zeichen.",\n  "recommendation": { "verdict": "sell|reduce|hold|add|watch", "confidence": "low|medium|high", "rationale": "1-2 Sätze, max 240 Zeichen" },\n  "summary": "1 Satz für History, max 120 Zeichen"\n}\nVerdict-Leitplanke: sell=Strukturbruch/Bewertung überreizt, reduce=Position zu gross/Gewinnmitnahme, hold=These intakt, add=Bewertung spricht für aufstocken, watch=unklar/vor Earnings.';
    var input = {
      ticker: pos.ticker, name: pos.name, assetClass: pos.assetClass, currency: pos.currency,
      costBasis: pos.costBasis, currentPrice: pos.currentPrice,
      bestehendeDD: { thesis: current.thesis, strengths: current.strengths, risks: current.risks, catalysts: current.catalysts, fundamentals: current.fundamentals, recommendation: current.recommendation },
    };
    var reply = await aibCallClaude({
      system: system,
      messages: [{ role: 'user', content: 'Analysiere diese Position:\n' + JSON.stringify(input) }],
      maxTokens: 2500,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
    });
    var match = reply.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI lieferte kein JSON.');
    var parsed = JSON.parse(match[0]);
    var nextDD = Object.assign({}, current, {
      thesis: typeof parsed.thesis === 'string' ? parsed.thesis : current.thesis,
      fundamentals: typeof parsed.fundamentals === 'string' ? parsed.fundamentals : current.fundamentals,
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : current.strengths,
      risks: Array.isArray(parsed.risks) ? parsed.risks.map(String) : current.risks,
      catalysts: Array.isArray(parsed.catalysts) ? parsed.catalysts.map(String) : current.catalysts,
      lastAnalyzedAt: Date.now(),
      lastAnalysisModel: AIB_MODEL_COACH,
    });
    var rec = parsed.recommendation && typeof parsed.recommendation === 'object' ? parsed.recommendation : {};
    if (AIB_VERDICTS.indexOf(rec.verdict) >= 0) {
      nextDD.recommendation = {
        verdict: rec.verdict,
        confidence: ['low', 'medium', 'high'].indexOf(rec.confidence) >= 0 ? rec.confidence : '',
        rationale: typeof rec.rationale === 'string' ? rec.rationale.slice(0, 240) : '',
        setAt: Date.now(),
      };
    }
    nextDD.history = [{ ts: Date.now(), source: 'deep', summary: (parsed.summary || nextDD.thesis || '').slice(0, 120), model: AIB_MODEL_COACH }].concat((current.history || []).slice(0, 4));
    pos.dueDiligence = nextDD;
    pos.note = nextDD.thesis || pos.note || '';
    aibMarkDirty();
    if (AIB_STATE.openPositionId === positionId) {
      document.getElementById('aib-pos-body').innerHTML = renderAibPositionBody(pos);
    }
    renderAibPortfolio();
    if (typeof toast === 'function') toast('DD aktualisiert', '');
  } catch (e) {
    if (typeof toast === 'function') toast('DD-Refresh fehlgeschlagen: ' + (e.message || e), 'err');
    var btn2 = document.getElementById('aib-refresh-dd-btn');
    if (btn2) { btn2.disabled = false; btn2.textContent = 'DD aktualisieren (mit Web-Recherche)'; }
  }
}

// ── AddPosition-Modal ───────────────────────────────────────────────────────
function openAibAddPositionModal() {
  ['ticker', 'name', 'shares', 'cost'].forEach(function (f) { var el = document.getElementById('aib-add-' + f); if (el) el.value = ''; });
  document.getElementById('aib-add-currency').value = 'CHF';
  document.getElementById('aib-add-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('aib-add-class').value = 'Sonstige';
  openModal('aib-add-position-modal');
}

function submitAibAddPosition() {
  var ticker = (document.getElementById('aib-add-ticker').value || '').trim().toUpperCase();
  var name = (document.getElementById('aib-add-name').value || '').trim();
  var shares = parseFloat(document.getElementById('aib-add-shares').value);
  var cost = parseFloat(document.getElementById('aib-add-cost').value);
  if (!ticker) return toast('Ticker fehlt', 'err');
  if (!name) return toast('Name fehlt', 'err');
  if (!(shares > 0)) return toast('Anzahl ungültig', 'err');
  if (!(cost > 0)) return toast('Einstand ungültig', 'err');
  AIB_STATE.portfolio = [{
    id: aibUid(), ticker: ticker, name: name,
    assetClass: document.getElementById('aib-add-class').value,
    shares: shares, costBasis: cost, currentPrice: cost,
    currency: document.getElementById('aib-add-currency').value,
    purchaseDate: document.getElementById('aib-add-date').value,
    note: '', dueDiligence: aibEmptyDD(),
  }].concat(AIB_STATE.portfolio);
  aibMarkDirty();
  closeModal('aib-add-position-modal');
  renderAibPortfolio();
  if (typeof toast === 'function') toast('Position hinzugefügt — Speichern nicht vergessen', '');
}

// ── Settings: API-Keys + Connection-Test (in zentralem Settings-Tab) ───────
// Aufruf vom Aktien-Tab "Einstellungen"-Button → Tab-Wechsel + Section öffnen.
function openAibSettingsModal() {
  if (typeof goTab === 'function') goTab('einstellungen');
  setTimeout(function () {
    var body = document.getElementById('sg-aiberater');
    if (body && body.style.display === 'none') {
      var btn = body.previousElementSibling;
      if (btn) btn.click();
    }
    // Felder befüllen + scrollen
    aibSyncSettingsFields();
    var sect = document.getElementById('settings-aiberater-section');
    if (sect) sect.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 80);
}

function aibSyncSettingsFields() {
  var ak = document.getElementById('s-aib-apikey');
  var fh = document.getElementById('s-aib-finnhub');
  var st = document.getElementById('s-aib-conn-status');
  if (ak) ak.value = (CFG.anthropicApiKey || '');
  if (fh) fh.value = (CFG.finnhubKey || '');
  if (st) {
    if (!CFG.sessionToken || !CFG.adminUrl) {
      st.textContent = 'Nicht angemeldet im finanztracker.';
    } else {
      st.textContent = 'Bereit zum Testen.';
    }
  }
}

// Wird live aus dem Input gerufen — sofort persistieren, kein Save-Button.
function aibPersistKey(which, value) {
  var v = (value || '').trim();
  if (which === 'anthropic') CFG.anthropicApiKey = v;
  else if (which === 'finnhub') CFG.finnhubKey = v;
  if (typeof cfgSave === 'function') cfgSave();
}

async function aibTestConnectionSettings() {
  var st = document.getElementById('s-aib-conn-status');
  if (!st) return;
  if (!CFG.sessionToken || !CFG.adminUrl) {
    st.innerHTML = '<span style="color:#FF6B6B">Nicht angemeldet. Bitte im finanztracker einloggen.</span>';
    return;
  }
  st.textContent = 'Teste…';
  try {
    var d = await aibApiCall({ action: 'ai_pull' });
    st.innerHTML = '<span style="color:#5DEABF">OK — ' + (d.portfolio || []).length + ' Positionen, ' + (d.transactions || []).length + ' Trades.</span>';
  } catch (e) {
    st.innerHTML = '<span style="color:#FF6B6B">' + aibEscape(e.message || String(e)) + '</span>';
  }
}

// ── goTab-Hook + Lifecycle ──────────────────────────────────────────────────
(function () {
  function hook() {
    if (typeof window.goTab !== 'function') { setTimeout(hook, 100); return; }
    if (window._aibGoTabHooked) return;
    var orig = window.goTab;
    window.goTab = function (name) {
      var r = orig.apply(this, arguments);
      if (name === 'aktien') setTimeout(aibBoot, 50);
      return r;
    };
    window._aibGoTabHooked = true;
  }
  function start() {
    hook();
    window.addEventListener('beforeunload', function (e) {
      if (AIB_STATE.dirty) { e.preventDefault(); e.returnValue = 'Ungespeicherte Änderungen — wirklich verlassen?'; }
    });
    var tab = document.getElementById('tab-aktien');
    if (tab && tab.style.display !== 'none') setTimeout(aibBoot, 50);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
