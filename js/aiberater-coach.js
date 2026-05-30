// ═══════════════════════════════════════════════════════════════
// AI-Berater Coach — vanilla port der Chat-Logik
// Nutzt aibCallClaude() aus js/aiberater.js
// ═══════════════════════════════════════════════════════════════

function aibCoachBuildSystem() {
  var portfolio = AIB_STATE.portfolio || [];
  var portfolioSummary = portfolio.map(function (p) {
    var dd = aibEnsureDD(p);
    return {
      t: p.ticker, n: p.name, cls: p.assetClass, ccy: p.currency,
      qty: p.shares, cost: p.costBasis, px: p.currentPrice,
      th: (dd.thesis || p.note || '').slice(0, 140),
      topRisks: (dd.risks || []).slice(0, 2),
      verdict: dd.recommendation && dd.recommendation.verdict || '',
      ddDeep: !!dd.lastAnalyzedAt,
    };
  });
  return 'Du bist ein erfahrener, ehrlicher Finanzberater für einen Schweizer Privatanleger. Du sprichst Deutsch (Du-Form). Du bist direkt, datenbasiert und nicht zu vorsichtig. Du erinnerst den User an Disziplin (Gewinnmitnahmen, Diversifikation, Klumpenrisiken). Du schmeichelst nicht. Schweiz-Steuer-Aspekte erwähnst du wenn relevant (Kapitalgewinne privat steuerfrei, Dividenden steuerbar).\n\nTOOLS: Du hast web_search. Nutze es SPARSAM – nur bei expliziten News/Earnings/aktuellen Fragen. Für reine Portfolio-Analyse brauchst du KEINE Suche.\n\nMARKER am Ende deiner Antwort (jeweils eigene Zeile):\n\n[POSITION_DD: TICKER | <field> | <op> <value>]\n  → DD-Update vorschlagen. <field> ∈ {thesis, fundamentals, strengths, risks, catalysts}; <op> ∈ {+, -, =}.\n  Beispiele:\n    [POSITION_DD: NOVN | risks | + Patent-Cliff Entresto 2026 ]\n    [POSITION_DD: AAPL | catalysts | + Q1-Earnings 30.01.2026 ]\n  ÜBERSCHREIBE NIE userNotes.\n\nKONTEXT — Portfolio (compact JSON, eine Zeile pro Position):\n' + portfolioSummary.map(function (x) { return JSON.stringify(x); }).join('\n');
}

function renderAibCoach() {
  var listEl = document.getElementById('aib-chat-list');
  if (!listEl) return;
  var history = AIB_STATE.chatHistory || [];
  if (history.length === 0) {
    listEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text2);font-size:13px">Frag mich was zu deinem Portfolio. Ich kann DD-Updates vorschlagen, die du dann pro Position übernehmen kannst.</div>';
    return;
  }
  var html = history.map(function (m, idx) {
    if (m.role === 'user') {
      return '<div class="aib-chat-msg user">' + aibEscape(m.content || '') + '</div>';
    }
    var content = m.content || '';
    var updates = aibCoachParseDDUpdates(content);
    var cleaned = aibCoachStripMarkers(content);
    var msgClass = m.error ? 'error' : 'assistant';
    var html2 = '<div class="aib-chat-msg ' + msgClass + '">' + aibEscape(cleaned);
    updates.forEach(function (u, i) {
      var known = AIB_STATE.portfolio.some(function (p) { return p.ticker === u.ticker; });
      var opLabel = u.op === '+' ? '+' : u.op === '-' ? '−' : '=';
      html2 += '<div class="aib-dd-marker-card" data-msg="' + idx + '" data-upd="' + i + '">' +
        '<div class="aib-marker-head">DD · ' + aibEscape(u.ticker) + ' · ' + opLabel + ' ' + aibEscape(u.field) + '</div>' +
        '<div>' + aibEscape(u.value) + '</div>' +
        (known
          ? '<div class="aib-marker-actions">' +
              '<button class="aib-marker-accept" onclick="aibCoachAcceptUpdate(' + idx + ',' + i + ', this)">Übernehmen</button>' +
              '<button class="aib-marker-skip" onclick="this.parentNode.parentNode.style.display=\'none\'">Verwerfen</button>' +
            '</div>'
          : '<div style="color:#FFA372;font-size:11px;margin-top:4px">Ticker nicht im Portfolio</div>') +
      '</div>';
    });
    html2 += '</div>';
    return html2;
  }).join('');
  listEl.innerHTML = html;
  // Scroll to bottom
  listEl.scrollTop = listEl.scrollHeight;
}

function aibCoachParseDDUpdates(text) {
  var re = /\[POSITION_DD:\s*([^|]+?)\s*\|\s*([a-zA-Z]+)\s*\|\s*([+\-=])\s*([^\]]+?)\s*\]/g;
  var out = [];
  var m;
  while ((m = re.exec(text)) !== null) {
    var field = m[2].trim();
    if (['thesis', 'fundamentals', 'strengths', 'risks', 'catalysts'].indexOf(field) < 0) continue;
    out.push({
      ticker: m[1].trim().toUpperCase(),
      field: field,
      op: m[3].trim(),
      value: m[4].trim(),
    });
  }
  return out;
}

function aibCoachStripMarkers(text) {
  return String(text || '').replace(/\[POSITION_DD:[^\]]*\]/g, '').trim();
}

function aibCoachAcceptUpdate(msgIdx, updIdx, btnEl) {
  var msg = AIB_STATE.chatHistory[msgIdx];
  if (!msg) return;
  var updates = aibCoachParseDDUpdates(msg.content || '');
  var u = updates[updIdx];
  if (!u) return;
  var pos = AIB_STATE.portfolio.find(function (p) { return p.ticker === u.ticker; });
  if (!pos) { if (typeof toast === 'function') toast('Ticker nicht im Portfolio', 'err'); return; }
  if (u.field === 'userNotes' || u.field === 'tags') return; // AI darf das nicht
  pos.dueDiligence = aibEnsureDD(pos);
  var dd = pos.dueDiligence;
  if (['strengths', 'risks', 'catalysts'].indexOf(u.field) >= 0) {
    var list = dd[u.field] || [];
    if (u.op === '+') dd[u.field] = list.concat([u.value]);
    else if (u.op === '-') dd[u.field] = list.filter(function (x) { return x !== u.value; });
    else dd[u.field] = [u.value];
  } else if (u.field === 'thesis' || u.field === 'fundamentals') {
    dd[u.field] = u.value;
    if (u.field === 'thesis') pos.note = u.value;
  }
  dd.lastAnalyzedAt = Date.now();
  dd.history = [{ ts: Date.now(), source: 'assessment', summary: u.op + ' ' + u.field + ': ' + String(u.value).slice(0, 80), model: AIB_MODEL_COACH }].concat((dd.history || []).slice(0, 4));
  aibMarkDirty();
  if (btnEl) {
    var parent = btnEl.parentNode;
    parent.innerHTML = '<span style="color:#5DEABF;font-size:11px">Übernommen</span>';
  }
  if (typeof toast === 'function') toast('DD-Update übernommen', '');
}

async function aibCoachSend(text) {
  if (!text || !text.trim()) return;
  AIB_STATE.chatHistory.push({ role: 'user', content: text, ts: Date.now() });
  renderAibCoach();
  aibMarkDirty();
  // Render Loading-Bubble
  var listEl = document.getElementById('aib-chat-list');
  var loading = document.createElement('div');
  loading.className = 'aib-chat-msg assistant';
  loading.id = 'aib-chat-loading';
  loading.textContent = 'Denke nach…';
  listEl.appendChild(loading);
  listEl.scrollTop = listEl.scrollHeight;
  try {
    var reply = await aibCallClaude({
      system: aibCoachBuildSystem(),
      messages: AIB_STATE.chatHistory.map(function (m) { return { role: m.role, content: m.content }; }),
      maxTokens: 2000,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
    });
    AIB_STATE.chatHistory.push({ role: 'assistant', content: reply, ts: Date.now() });
  } catch (e) {
    AIB_STATE.chatHistory.push({ role: 'assistant', content: '_Fehler: ' + (e.message || 'AI nicht erreichbar') + '_', ts: Date.now(), error: true });
  } finally {
    var l = document.getElementById('aib-chat-loading');
    if (l) l.remove();
    renderAibCoach();
    aibMarkDirty();
  }
}

function aibCoachSendFromInput() {
  var input = document.getElementById('aib-chat-input');
  if (!input) return;
  var v = (input.value || '').trim();
  if (!v) return;
  input.value = '';
  aibCoachSend(v);
}

function aibCoachClearLocal() {
  if (!confirm('Lokalen Chat zurücksetzen?')) return;
  AIB_STATE.chatHistory = [];
  aibMarkDirty();
  renderAibCoach();
}

async function aibCoachClearSheet() {
  if (!confirm('Chat-Verlauf auch im Sheet löschen? (sofort, nicht rückgängig)')) return;
  try {
    await aibApiCall({ action: 'ai_clear_chat' });
    AIB_STATE.chatHistory = [];
    AIB_STATE.dirty = false;
    AIB_STATE.lastSavedAt = Date.now();
    aibUpdateSaveFab();
    renderAibCoach();
    if (typeof toast === 'function') toast('Chat im Sheet gelöscht', '');
  } catch (e) {
    if (typeof toast === 'function') toast('Löschen fehlgeschlagen: ' + (e.message || e), 'err');
  }
}

// Enter-to-send (Shift+Enter = newline)
document.addEventListener('DOMContentLoaded', function () {
  var input = document.getElementById('aib-chat-input');
  if (!input) return;
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      aibCoachSendFromInput();
    }
  });
});
