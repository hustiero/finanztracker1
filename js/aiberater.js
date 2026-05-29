// ═══════════════════════════════════════════════════════════════
// AI-Berater — Vanilla-Port (ersetzt das alte React-Bundle)
//
// Lebt im Aktien-Tab des finanztrackers. Nutzt:
//   - apiCall()  (js/data.js)  für ai_pull/ai_push gegen admin-code.gs
//   - openModal/closeModal (js/ui.js) für Modals
//   - toast() (js/ui.js) für Feedback
//   - markDirty() (js/core.js) für Re-Render-Triggers
//   - CFG.sessionToken, CFG.adminUrl — Auth via finanztracker-Login
// ═══════════════════════════════════════════════════════════════

// ── State ────────────────────────────────────────────────────────────────────
var AIB_STATE = {
  loaded: false,
  loading: false,
  dirty: false,
  lastSavedAt: null,
  portfolio: [],
  watchlist: [],     // Phase 2 — UI MVP-leer
  chatHistory: [],
  transactions: [],
  openPositionId: null,
};

var aibView = 'portfolio'; // 'portfolio' | 'coach' | 'steuern'

// ── Konstanten / DD-Schema ───────────────────────────────────────────────────
var AIB_MODEL_COACH = 'claude-sonnet-4-6';
var AIB_VERDICTS = ['sell', 'reduce', 'hold', 'add', 'watch'];
var AIB_VERDICT_LABEL = { sell: 'Verkaufen', reduce: 'Reduzieren', hold: 'Halten', add: 'Nachkaufen', watch: 'Beobachten' };
var AIB_VERDICT_EMOJI = { sell: '🔴', reduce: '🟠', hold: '⚪', add: '🟢', watch: '🔵' };
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

function aibUid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
function aibFmtCcy(n, ccy) {
  if (!Number.isFinite(n)) n = 0;
  try { return n.toLocaleString('de-CH', { style: 'currency', currency: ccy || 'CHF', maximumFractionDigits: 2 }); }
  catch { return n.toFixed(2) + ' ' + (ccy || ''); }
}

// ── Sub-Tab-Navigation ──────────────────────────────────────────────────────
function aibSetView(v) {
  aibView = v;
  var tabs = ['portfolio', 'coach', 'steuern'];
  tabs.forEach(function (t) {
    var btn = document.getElementById('aib-tab-' + t);
    var view = document.getElementById('aib-view-' + t);
    if (btn) btn.classList.toggle('active', t === v);
    if (view) view.style.display = t === v ? 'block' : 'none';
  });
  aibRender();
}

// ── Dispatcher + Render ─────────────────────────────────────────────────────
function aibRender() {
  if (aibView === 'portfolio') renderAibPortfolio();
  else if (aibView === 'coach') renderAibCoach();
  else if (aibView === 'steuern') renderAibTax();
  aibUpdateSaveFab();
}

function aibUpdateSaveFab() {
  var fab = document.getElementById('aib-save-fab');
  if (!fab) return;
  fab.style.display = AIB_STATE.dirty ? 'flex' : 'none';
}

function aibMarkDirty() {
  AIB_STATE.dirty = true;
  aibUpdateSaveFab();
}

// ── Auth-Check + API-Wrapper ────────────────────────────────────────────────
function aibCheckAuth() {
  if (!CFG.sessionToken || !CFG.adminUrl) {
    if (typeof toast === 'function') toast('Bitte zuerst anmelden (Einstellungen → Account)', 'err');
    return false;
  }
  return true;
}

// Big-payload-aware API-Call. Kleine Params (action, token) → URL.
// Grosse Strings (portfolio-JSON etc.) → Body. doPost in admin-code.gs
// merged beide und dispatcht via _handle.
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
    if (typeof toast === 'function') toast('Sitzung abgelaufen', 'err');
    throw new Error('HTTP 401');
  }
  if (!r.ok) throw new Error('HTTP ' + r.status);
  var d;
  try { d = await r.json(); } catch { throw new Error('Ungültige Server-Antwort'); }
  if (d && d.error) throw new Error(d.error);
  return d;
}

async function aibPull() {
  if (!aibCheckAuth()) return null;
  AIB_STATE.loading = true;
  try {
    var d = await aibApiCall({ action: 'ai_pull' });
    AIB_STATE.portfolio = Array.isArray(d.portfolio) ? d.portfolio.map(function (p) { p.dueDiligence = aibEnsureDD(p); return p; }) : [];
    AIB_STATE.watchlist = Array.isArray(d.watchlist) ? d.watchlist : [];
    AIB_STATE.chatHistory = Array.isArray(d.chatHistory) ? d.chatHistory : [];
    AIB_STATE.transactions = Array.isArray(d.transactions) ? d.transactions : [];
    AIB_STATE.loaded = true;
    AIB_STATE.lastSavedAt = Date.now();
    AIB_STATE.dirty = false;
    return d;
  } catch (e) {
    var msg = e.message || String(e);
    // Hilfreiche Diagnose: wenn Apps-Script noch alte Version
    if (msg.indexOf('Unbekannte Aktion') >= 0 || msg.indexOf('Unknown action') >= 0) {
      msg = 'Apps-Script ist noch nicht aktualisiert. Bitte gas/admin-code.gs in Apps-Script-Editor neu deployen (Bereitstellen → Bereitstellungen verwalten → Bearbeiten → Version: Neu → Bereitstellen). URL bleibt gleich.';
    }
    AIB_STATE.bootErr = msg;
    if (typeof toast === 'function') toast(msg.slice(0, 120), 'err');
    return null;
  } finally {
    AIB_STATE.loading = false;
  }
}

async function aibPush() {
  if (!aibCheckAuth()) return false;
  try {
    await aibApiCall({
      action: 'ai_push',
      portfolio: AIB_STATE.portfolio,
      watchlist: AIB_STATE.watchlist,
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
  if (fab) { fab.disabled = true; fab.textContent = '⏳ Speichere…'; }
  var ok = await aibPush();
  if (fab) { fab.disabled = false; fab.textContent = '💾 Speichern'; }
  aibUpdateSaveFab();
  if (ok && typeof toast === 'function') toast('Gespeichert', '');
  aibRender();
}

// ── Bootstrap (bei goTab('aktien')) ─────────────────────────────────────────
async function aibBoot() {
  if (AIB_STATE.loading) return;
  if (!aibCheckAuth()) {
    var status = document.getElementById('aib-portfolio-status');
    if (status) {
      status.style.display = 'block';
      status.textContent = 'Bitte zuerst im finanztracker anmelden.';
    }
    return;
  }
  if (!AIB_STATE.loaded) {
    var status2 = document.getElementById('aib-portfolio-status');
    if (status2) { status2.style.display = 'block'; status2.textContent = 'Lade aus Sheet…'; }
    await aibPull();
    if (status2) {
      if (AIB_STATE.bootErr) {
        status2.style.display = 'block';
        status2.innerHTML = '<div style="color:#FF6B6B;font-weight:600;margin-bottom:6px">⚠ ' + aibEscape(AIB_STATE.bootErr) + '</div>' +
          '<button class="filter-chip" onclick="AIB_STATE.bootErr=null;AIB_STATE.loaded=false;aibBoot()">Erneut versuchen</button>';
      } else {
        status2.style.display = 'none';
      }
    }
  }
  aibRender();
}

// ── Portfolio-View ──────────────────────────────────────────────────────────
function renderAibPortfolio() {
  var listEl = document.getElementById('aib-portfolio-list');
  if (!listEl) return;
  var statusEl = document.getElementById('aib-portfolio-status');
  if (statusEl) statusEl.style.display = AIB_STATE.portfolio.length === 0 && AIB_STATE.loaded ? 'none' : statusEl.style.display;
  if (AIB_STATE.portfolio.length === 0 && AIB_STATE.loaded) {
    listEl.innerHTML = '<div class="aib-empty">Noch keine Positionen.<br><span style="font-size:12px;opacity:.7">Klicke unten auf „+ Position hinzufügen".</span></div>';
    return;
  }
  var html = AIB_STATE.portfolio.map(function (p) {
    var dd = aibEnsureDD(p);
    var fresh = aibDDFreshness(dd);
    var verdict = dd.recommendation.verdict;
    var verdictHtml = verdict ? '<span class="aib-verdict aib-verdict-' + verdict + '">' + AIB_VERDICT_EMOJI[verdict] + ' ' + AIB_VERDICT_LABEL[verdict] + '</span>' : '';
    var ageDays = dd.lastAnalyzedAt ? Math.round((Date.now() - dd.lastAnalyzedAt) / 86400000) : null;
    var ageStr = ageDays == null ? 'keine AI-DD' : (ageDays === 0 ? 'heute' : ageDays + ' Tage');
    var mvLocal = (p.shares || 0) * (p.currentPrice || 0);
    return '<div class="aib-card" onclick="openAibPositionModal(\'' + p.id + '\')">' +
      '<div class="aib-card-head"><div class="aib-card-title">' +
        aibEscape(p.name || p.ticker) + ' ' + verdictHtml +
      '</div></div>' +
      '<div class="aib-card-sub">' + aibEscape(p.ticker) + ' · ' + (p.shares || 0) + ' × ' + aibFmtCcy(p.currentPrice || 0, p.currency) + '</div>' +
      '<div class="aib-card-meta">' +
        '<span><span class="aib-aging-dot aib-aging-' + fresh + '"></span>DD ' + ageStr + '</span>' +
        '<span>' + aibFmtCcy(mvLocal, p.currency) + '</span>' +
      '</div>' +
    '</div>';
  }).join('');
  listEl.innerHTML = html;
}

function aibEscape(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
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
    ? '<div class="aib-rec-bubble ' + v + '"><b>' + AIB_VERDICT_EMOJI[v] + ' ' + AIB_VERDICT_LABEL[v].toUpperCase() + '</b>' +
      (dd.recommendation.confidence ? ' <span style="opacity:.7;font-size:12px">· ' + dd.recommendation.confidence + '</span>' : '') +
      (dd.recommendation.rationale ? '<div style="font-size:13px;margin-top:4px;opacity:.95">' + aibEscape(dd.recommendation.rationale) + '</div>' : '') +
      '</div>'
    : '<div class="aib-rec-bubble" style="border-style:dashed;color:var(--text2);font-size:12px">Noch keine AI-Empfehlung. „DD aktualisieren" unten klicken.</div>';

  var ageDays = dd.lastAnalyzedAt ? Math.round((Date.now() - dd.lastAnalyzedAt) / 86400000) : null;
  var ageStr = ageDays == null ? 'noch nie' : (ageDays === 0 ? 'heute' : 'vor ' + ageDays + ' Tagen');

  return '' +
    '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text2);margin-bottom:10px">' +
      '<span>' + aibEscape(pos.ticker) + ' · ' + aibEscape(pos.assetClass || '—') + ' · ' + aibEscape(pos.currency || '') + '</span>' +
      '<span>DD: ' + ageStr + '</span>' +
    '</div>' +
    recHtml +
    '<button class="save-btn" style="margin-bottom:14px" onclick="aibRefreshDD(\'' + pos.id + '\')" id="aib-refresh-dd-btn">🤖 DD aktualisieren (web-search)</button>' +

    '<div class="aib-dd-section" style="padding-top:0;border-top:0">' +
      '<h4>Thesis</h4>' +
      '<textarea id="aib-pos-thesis" class="form-input" rows="2" oninput="aibPosFieldChanged(\'thesis\', this.value)">' + aibEscape(dd.thesis) + '</textarea>' +
    '</div>' +

    aibRenderBulletSection(pos.id, 'strengths', 'Stärken', dd.strengths) +
    aibRenderBulletSection(pos.id, 'risks', 'Risiken', dd.risks) +
    aibRenderBulletSection(pos.id, 'catalysts', 'Catalysts', dd.catalysts) +

    '<div class="aib-dd-section">' +
      '<h4>Fundamentals</h4>' +
      '<textarea id="aib-pos-fundamentals" class="form-input" rows="3" placeholder="P/E, Margen, Verschuldung…" oninput="aibPosFieldChanged(\'fundamentals\', this.value)">' + aibEscape(dd.fundamentals) + '</textarea>' +
    '</div>' +

    '<div class="aib-dd-section">' +
      '<h4>Eigene Notizen <span style="font-weight:400;color:var(--text2);font-size:12px">(AI fasst diese NIE an)</span></h4>' +
      '<textarea id="aib-pos-usernotes" class="form-input" rows="2" oninput="aibPosFieldChanged(\'userNotes\', this.value)">' + aibEscape(dd.userNotes) + '</textarea>' +
    '</div>' +

    '<div class="aib-dd-section">' +
      '<h4>Stammdaten</h4>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
        '<div><label class="form-label">Ticker</label><input id="aib-pos-ticker" class="form-input" type="text" value="' + aibEscape(pos.ticker) + '" oninput="aibPosFieldChanged(\'ticker\', this.value.toUpperCase())"></div>' +
        '<div><label class="form-label">Asset-Klasse</label><input id="aib-pos-class" class="form-input" type="text" value="' + aibEscape(pos.assetClass || '') + '" oninput="aibPosFieldChanged(\'assetClass\', this.value)"></div>' +
        '<div><label class="form-label">Anzahl</label><input id="aib-pos-shares" class="form-input" type="number" step="any" value="' + (pos.shares || 0) + '" oninput="aibPosFieldChanged(\'shares\', parseFloat(this.value)||0)"></div>' +
        '<div><label class="form-label">Einstand</label><input id="aib-pos-cost" class="form-input" type="number" step="any" value="' + (pos.costBasis || 0) + '" oninput="aibPosFieldChanged(\'costBasis\', parseFloat(this.value)||0)"></div>' +
        '<div><label class="form-label">Akt. Kurs</label><input id="aib-pos-price" class="form-input" type="number" step="any" value="' + (pos.currentPrice || 0) + '" oninput="aibPosFieldChanged(\'currentPrice\', parseFloat(this.value)||0)"></div>' +
        '<div><label class="form-label">Währung</label><input id="aib-pos-currency" class="form-input" type="text" value="' + aibEscape(pos.currency || '') + '" oninput="aibPosFieldChanged(\'currency\', this.value.toUpperCase())"></div>' +
      '</div>' +
    '</div>' +

    '<button class="btn-cancel" style="background:rgba(229,75,75,.15);color:#FF6B6B;border:1px solid rgba(229,75,75,.3);margin-top:14px" onclick="aibDeletePosition(\'' + pos.id + '\')">🗑 Position löschen</button>';
}

function aibRenderBulletSection(posId, field, label, items) {
  var rows = (items || []).map(function (it, i) {
    return '<div class="aib-bullet-row">' +
      '<input type="text" value="' + aibEscape(it) + '" oninput="aibBulletUpdate(\'' + field + '\', ' + i + ', this.value)">' +
      '<button class="aib-bullet-del" onclick="aibBulletDelete(\'' + field + '\', ' + i + ')" title="Entfernen">✕</button>' +
    '</div>';
  }).join('');
  return '<div class="aib-dd-section"><h4>' + label + '</h4>' +
    '<div class="aib-bullet-list">' + rows +
      '<button class="aib-bullet-add" onclick="aibBulletAdd(\'' + field + '\')">+ ' + label.toLowerCase() + ' hinzufügen</button>' +
    '</div>' +
  '</div>';
}

function aibPosFieldChanged(field, value) {
  var pos = AIB_STATE.portfolio.find(function (p) { return p.id === AIB_STATE.openPositionId; });
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

function aibBulletUpdate(field, idx, value) {
  var pos = AIB_STATE.portfolio.find(function (p) { return p.id === AIB_STATE.openPositionId; });
  if (!pos) return;
  pos.dueDiligence = aibEnsureDD(pos);
  if (!pos.dueDiligence[field]) pos.dueDiligence[field] = [];
  pos.dueDiligence[field][idx] = value;
  aibMarkDirty();
}

function aibBulletDelete(field, idx) {
  var pos = AIB_STATE.portfolio.find(function (p) { return p.id === AIB_STATE.openPositionId; });
  if (!pos) return;
  pos.dueDiligence = aibEnsureDD(pos);
  pos.dueDiligence[field] = (pos.dueDiligence[field] || []).filter(function (_, i) { return i !== idx; });
  document.getElementById('aib-pos-body').innerHTML = renderAibPositionBody(pos);
  aibMarkDirty();
}

function aibBulletAdd(field) {
  var pos = AIB_STATE.portfolio.find(function (p) { return p.id === AIB_STATE.openPositionId; });
  if (!pos) return;
  pos.dueDiligence = aibEnsureDD(pos);
  if (!pos.dueDiligence[field]) pos.dueDiligence[field] = [];
  pos.dueDiligence[field].push('');
  document.getElementById('aib-pos-body').innerHTML = renderAibPositionBody(pos);
  aibMarkDirty();
  // Focus auf neues Input
  setTimeout(function () {
    var section = Array.from(document.querySelectorAll('#aib-pos-body .aib-dd-section h4'))
      .find(function (h) { return h.textContent === (field === 'strengths' ? 'Stärken' : field === 'risks' ? 'Risiken' : 'Catalysts'); });
    if (section) {
      var inputs = section.parentNode.querySelectorAll('input[type="text"]');
      if (inputs.length) inputs[inputs.length - 1].focus();
    }
  }, 30);
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
  var apiKey = CFG.anthropicApiKey || CFG.aibAnthropicKey || '';
  if (!apiKey) throw new Error('Anthropic API-Key fehlt — bitte in Einstellungen setzen (CFG.anthropicApiKey).');
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
    throw new Error('Claude-API ' + r.status + ': ' + txt.slice(0, 200));
  }
  var data = await r.json();
  return (data.content || []).filter(function (b) { return b && b.type === 'text' && typeof b.text === 'string'; }).map(function (b) { return b.text; }).join('\n').trim();
}

async function aibRefreshDD(positionId) {
  var pos = AIB_STATE.portfolio.find(function (p) { return p.id === positionId; });
  if (!pos) return;
  var btn = document.getElementById('aib-refresh-dd-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Recherchiere…'; }
  try {
    var current = aibEnsureDD(pos);
    var system = 'Du bist ein Equity-Research-Analyst für einen Schweizer Privatanleger. Liefere eine fundierte Due-Diligence zu EINER Aktie/ETF/Fund. Recherchiere mit web_search aktuelle Earnings, Analyst-Calls, Sektor-News (max 5 Suchen). Sei knapp und präzise. Antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt – kein Markdown, kein Text drumherum:\n{\n  "thesis": "1–2 Sätze, max 220 Zeichen",\n  "strengths": ["3–5 Bullets, max 110 Zeichen je"],\n  "risks": ["3–5 Bullets, max 110 Zeichen je"],\n  "catalysts": ["2–4 Events mit Datum"],\n  "fundamentals": "P/E, EV/EBITDA, Marge, Verschuldung, Wachstum. Max 400 Zeichen.",\n  "recommendation": { "verdict": "sell|reduce|hold|add|watch", "confidence": "low|medium|high", "rationale": "1–2 Sätze, max 240 Zeichen" },\n  "summary": "1 Satz für History, max 120 Zeichen"\n}\nVerdict-Leitplanke: sell=Strukturbruch/Bewertung überreizt, reduce=Position zu gross/Gewinnmitnahme, hold=These intakt, add=Bewertung spricht für aufstocken, watch=unklar/vor Earnings. WICHTIG: bestehende userNotes nie anfassen.';
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
    var hist = (current.history || []).slice(0, 4);
    nextDD.history = [{ ts: Date.now(), source: 'deep', summary: (parsed.summary || nextDD.thesis || '').slice(0, 120), model: AIB_MODEL_COACH }].concat(hist);
    pos.dueDiligence = nextDD;
    pos.note = nextDD.thesis || pos.note || '';
    aibMarkDirty();
    document.getElementById('aib-pos-body').innerHTML = renderAibPositionBody(pos);
    renderAibPortfolio();
    if (typeof toast === 'function') toast('DD aktualisiert', '');
  } catch (e) {
    if (typeof toast === 'function') toast('DD-Refresh fehlgeschlagen: ' + (e.message || e), 'err');
  } finally {
    var btn2 = document.getElementById('aib-refresh-dd-btn');
    if (btn2) { btn2.disabled = false; btn2.textContent = '🤖 DD aktualisieren (web-search)'; }
  }
}

// ── AddPosition-Modal ───────────────────────────────────────────────────────
function openAibAddPositionModal() {
  document.getElementById('aib-add-ticker').value = '';
  document.getElementById('aib-add-name').value = '';
  document.getElementById('aib-add-shares').value = '';
  document.getElementById('aib-add-cost').value = '';
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
  var pos = {
    id: aibUid(),
    ticker: ticker,
    name: name,
    assetClass: document.getElementById('aib-add-class').value,
    shares: shares,
    costBasis: cost,
    currentPrice: cost,
    currency: document.getElementById('aib-add-currency').value,
    purchaseDate: document.getElementById('aib-add-date').value,
    note: '',
    dueDiligence: aibEmptyDD(),
  };
  AIB_STATE.portfolio = [pos].concat(AIB_STATE.portfolio);
  aibMarkDirty();
  closeModal('aib-add-position-modal');
  renderAibPortfolio();
  if (typeof toast === 'function') toast('Position hinzugefügt — vergiss nicht zu speichern', '');
}

// ── goTab-Hook: bei 'aktien' → boot/render ─────────────────────────────────
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
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      hook();
      // beforeunload-Warning bei dirty
      window.addEventListener('beforeunload', function (e) {
        if (AIB_STATE.dirty) { e.preventDefault(); e.returnValue = 'Ungespeicherte Änderungen — wirklich verlassen?'; }
      });
      // Auto-Boot falls schon im Aktien-Tab
      var tab = document.getElementById('tab-aktien');
      if (tab && tab.style.display !== 'none') setTimeout(aibBoot, 50);
    });
  } else {
    hook();
    var tab = document.getElementById('tab-aktien');
    if (tab && tab.style.display !== 'none') setTimeout(aibBoot, 50);
  }
})();
