// ═══════════════════════════════════════════════════════════════
// AI-Berater Steuer-Modul — Saxo-CSV Import + CH-Tax-Übersicht
// ═══════════════════════════════════════════════════════════════

var AIB_TX_TYPE_MAP = {
  'Kauf': 'buy', 'Verkauf': 'sell',
  'Dividende': 'dividend', 'Capital Gain': 'capital_gain',
  'Zinsen auf Einlagen': 'interest_in', 'Zinsen auf Belastungen': 'interest_out',
  'Depotgebühren': 'fee_custody', 'Berichtigung Börsengeb.': 'fee_correction',
  'Forex-Gutschrift': 'fx', 'Forex-Belastung': 'fx',
  'Fx-Gutschrift Comp.': 'fx', 'Fx-Belastung Comp.': 'fx',
  'Zahlung': 'deposit', 'Auszahlung': 'withdrawal',
};

function aibTxTypeLabel(t) {
  return ({
    buy: 'Kauf', sell: 'Verkauf', dividend: 'Dividende',
    capital_gain: 'Kapitalgewinn (Fonds)', interest_in: 'Zinsertrag',
    interest_out: 'Schuldzins', fee_custody: 'Depotgebühr',
    fee_correction: 'Gebühr-Korrektur', fx: 'FX',
    deposit: 'Einzahlung', withdrawal: 'Auszahlung', other: 'Andere',
  })[t] || t;
}

function aibParseGermanNumber(raw) {
  if (raw == null || raw === '') return null;
  var s = String(raw).trim().replace(/'/g, '').replace(/\s/g, '');
  var n = parseFloat(s.indexOf(',') >= 0 && s.indexOf('.') < 0 ? s.replace(',', '.') : s);
  return Number.isFinite(n) ? n : null;
}

function aibParseSaxoDate(raw) {
  if (!raw) return null;
  var m = String(raw).trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (!m) return null;
  return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
}

function aibSplitCsvLine(line) {
  var out = [], cur = '', q = false;
  for (var i = 0; i < line.length; i++) {
    var c = line[i];
    if (c === '"') { q = !q; continue; }
    if (c === ';' && !q) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

function aibParseSaxoCsv(text) {
  var lines = String(text).split(/\r?\n/).filter(function (l) { return l.trim().length > 0; });
  if (lines.length < 2) return { transactions: [], errors: ['Keine Daten in CSV.'] };
  var header = aibSplitCsvLine(lines[0]);
  var find = function () {
    for (var i = 0; i < arguments.length; i++) {
      var n = arguments[i];
      var idx = header.findIndex(function (h) { return h.toLowerCase().indexOf(n.toLowerCase()) >= 0; });
      if (idx >= 0) return idx;
    }
    return -1;
  };
  var ix = {
    date: find('Datum'), type: find('Transaktion'), symbol: find('Symbol'),
    name: find('Name'), isin: find('ISIN'), qty: find('Anzahl'),
    price: find('ckpreis', 'preis'), fees: find('Kosten'),
    accruedInterest: find('Aufgelaufene'), net: find('Nettobetrag'),
    netCcy: find('hrung Nettobetrag', 'Währung Nettobetrag'),
    netAccount: find('hrung des Kontos', 'Währung des Kontos'),
    accountCcy: header.length - 1,
  };
  var errors = [], transactions = [];
  for (var i = 1; i < lines.length; i++) {
    var c = aibSplitCsvLine(lines[i]);
    if (c.length < 5) continue;
    var typeRaw = (c[ix.type] || '').trim();
    var mapped = AIB_TX_TYPE_MAP[typeRaw] || 'other';
    var tx = {
      id: aibUid(),
      date: aibParseSaxoDate(c[ix.date]),
      type: mapped,
      typeRaw: typeRaw,
      symbol: (c[ix.symbol] || '').trim(),
      name: (c[ix.name] || '').trim().replace(/^"|"$/g, ''),
      isin: (c[ix.isin] || '').trim(),
      qty: ix.qty >= 0 ? aibParseGermanNumber(c[ix.qty]) : null,
      price: ix.price >= 0 ? aibParseGermanNumber(c[ix.price]) : null,
      fees: ix.fees >= 0 ? aibParseGermanNumber(c[ix.fees]) : null,
      accruedInterest: ix.accruedInterest >= 0 ? aibParseGermanNumber(c[ix.accruedInterest]) : null,
      netAmount: ix.net >= 0 ? aibParseGermanNumber(c[ix.net]) : null,
      currency: ix.netCcy >= 0 ? (c[ix.netCcy] || '').trim() : '',
      netAccountCurrency: ix.netAccount >= 0 ? aibParseGermanNumber(c[ix.netAccount]) : null,
      accountCurrency: ix.accountCcy >= 0 ? (c[ix.accountCcy] || '').trim() : '',
      source: 'saxo-csv',
      importedAt: Date.now(),
    };
    if (!tx.date) { errors.push('Zeile ' + (i + 1) + ': Datum ungültig'); continue; }
    transactions.push(tx);
  }
  return { transactions: transactions, errors: errors };
}

function aibIsSwissIsin(isin) {
  return typeof isin === 'string' && isin.toUpperCase().indexOf('CH') === 0;
}

function aibComputeTaxSummary(transactions, year) {
  var yearStr = year && year !== 'all' ? String(year) : null;
  var s = {
    year: yearStr || 'alle', txCount: 0,
    incomeGrossCH: 0, incomeGrossFOR: 0, interestIn: 0,
    withholdingCH: 0, withholdingFOR: 0,
    feesCustody: 0, interestOut: 0,
    buysTotal: 0, sellsTotal: 0, buysCount: 0, sellsCount: 0,
    perPosition: {},
  };
  transactions.forEach(function (tx) {
    if (yearStr && (tx.date || '').slice(0, 4) !== yearStr) return;
    s.txCount++;
    var ch = aibIsSwissIsin(tx.isin);
    var qty = Number(tx.qty || 0), price = Number(tx.price || 0);
    var fees = Number(tx.fees || 0), net = Number(tx.netAmount || 0);
    if (tx.type === 'dividend' || tx.type === 'capital_gain') {
      var brutto = qty * price;
      if (ch) { s.incomeGrossCH += brutto; s.withholdingCH += fees; }
      else { s.incomeGrossFOR += brutto; s.withholdingFOR += fees; }
      var k = tx.isin || tx.symbol || tx.name;
      if (!s.perPosition[k]) s.perPosition[k] = { name: tx.name, symbol: tx.symbol, ccy: tx.currency, ch: ch, brutto: 0, qst: 0, netto: 0, entries: 0 };
      s.perPosition[k].brutto += brutto;
      s.perPosition[k].qst += fees;
      s.perPosition[k].netto += net;
      s.perPosition[k].entries++;
    } else if (tx.type === 'interest_in') s.interestIn += net;
    else if (tx.type === 'interest_out') s.interestOut += Math.abs(net);
    else if (tx.type === 'fee_custody' || tx.type === 'fee_correction') s.feesCustody += Math.abs(net);
    else if (tx.type === 'buy') { s.buysTotal += Math.abs(net); s.buysCount++; }
    else if (tx.type === 'sell') { s.sellsTotal += Math.abs(net); s.sellsCount++; }
  });
  return s;
}

function renderAibTax() {
  var ySel = document.getElementById('aib-tax-year');
  var content = document.getElementById('aib-tax-content');
  if (!ySel || !content) return;

  // Year-Select populieren
  var years = {};
  (AIB_STATE.transactions || []).forEach(function (t) { if (t.date) years[t.date.slice(0, 4)] = true; });
  var yearKeys = Object.keys(years).sort().reverse();
  var currentYear = ySel.value || (yearKeys.length ? yearKeys[0] : String(new Date().getFullYear()));
  ySel.innerHTML = yearKeys.map(function (y) { return '<option value="' + y + '"' + (y === currentYear ? ' selected' : '') + '>' + y + '</option>'; }).join('') + '<option value="all"' + (currentYear === 'all' ? ' selected' : '') + '>Alle Jahre</option>';

  if ((AIB_STATE.transactions || []).length === 0) {
    content.innerHTML = '<div class="aib-empty">Noch keine Transaktionen importiert.<br><span style="font-size:12px;opacity:.7">CSV-Import oben rechts.</span></div>';
    return;
  }

  var s = aibComputeTaxSummary(AIB_STATE.transactions, currentYear);
  var fmt = function (n) { return (n || 0).toFixed(2); };
  var html = '' +
    '<div class="aib-stat-card"><h4>Erträge ' + aibEscape(s.year) + '</h4>' +
      '<div class="aib-stat-row"><span class="l">Dividenden CH (brutto)</span><span class="v">' + fmt(s.incomeGrossCH) + '</span></div>' +
      '<div class="aib-stat-row"><span class="l">Dividenden Ausland (brutto)</span><span class="v">' + fmt(s.incomeGrossFOR) + '</span></div>' +
      '<div class="aib-stat-row"><span class="l">Zinsertrag</span><span class="v">' + fmt(s.interestIn) + '</span></div>' +
    '</div>' +
    '<div class="aib-stat-card"><h4>Steuerabzüge ' + aibEscape(s.year) + '</h4>' +
      '<div class="aib-stat-row"><span class="l" style="color:#5DEABF">Verrechnungssteuer CH (rückforderbar)</span><span class="v">' + fmt(s.withholdingCH) + '</span></div>' +
      '<div class="aib-stat-row"><span class="l" style="color:#9DDEFC">Quellensteuer Ausland (DA-1)</span><span class="v">' + fmt(s.withholdingFOR) + '</span></div>' +
      '<div style="font-size:11px;color:var(--text2);margin-top:6px">VST = 35% auf CH-Erträge, voll rückforderbar via Wertschriftenverzeichnis. Auslandische QSt anrechenbar via DA-1 (US-Vertrag: 15%).</div>' +
    '</div>' +
    '<div class="aib-stat-card"><h4>Abzugsfähige Kosten</h4>' +
      '<div class="aib-stat-row"><span class="l">Depotgebühren</span><span class="v">' + fmt(s.feesCustody) + '</span></div>' +
      '<div class="aib-stat-row"><span class="l">Schuldzinsen</span><span class="v">' + fmt(s.interestOut) + '</span></div>' +
    '</div>' +
    '<div class="aib-stat-card"><h4>Trades (steuerfrei privat)</h4>' +
      '<div class="aib-stat-row"><span class="l">Käufe (' + s.buysCount + ')</span><span class="v">' + fmt(s.buysTotal) + '</span></div>' +
      '<div class="aib-stat-row"><span class="l">Verkäufe (' + s.sellsCount + ')</span><span class="v">' + fmt(s.sellsTotal) + '</span></div>' +
      '<div style="font-size:11px;color:var(--text2);margin-top:6px">Kapitalgewinne aus Wertschriften sind für Privatpersonen in der CH steuerfrei.</div>' +
    '</div>';

  var perPos = Object.keys(s.perPosition).map(function (k) { return s.perPosition[k]; }).sort(function (a, b) { return b.brutto - a.brutto; });
  if (perPos.length) {
    html += '<div class="aib-stat-card"><h4>Erträge pro Position</h4>';
    perPos.forEach(function (p) {
      html += '<div style="border-left:2px solid var(--border);padding-left:8px;margin-bottom:8px;font-size:12px">' +
        '<div style="display:flex;justify-content:space-between"><span><b>' + aibEscape(p.name || p.symbol) + '</b> <span style="color:var(--text2)">(' + (p.ch ? 'CH' : 'Ausl.') + ')</span></span><span class="v">' + fmt(p.brutto) + ' ' + aibEscape(p.ccy) + '</span></div>' +
        '<div style="color:var(--text2);font-size:11px">' + p.entries + ' Ausschüttung' + (p.entries === 1 ? '' : 'en') + (p.qst > 0 ? ' · ' + (p.ch ? 'VST ' : 'QSt ') + fmt(p.qst) : '') + '</div>' +
      '</div>';
    });
    html += '</div>';
  }

  // Transaktionsliste (max 100 zur Übersicht)
  var filteredTx = currentYear === 'all'
    ? AIB_STATE.transactions
    : AIB_STATE.transactions.filter(function (t) { return (t.date || '').slice(0, 4) === currentYear; });
  html += '<div class="aib-stat-card"><h4>Transaktionen (' + filteredTx.length + ')</h4>';
  filteredTx.slice(0, 100).forEach(function (t) {
    var ch = aibIsSwissIsin(t.isin);
    html += '<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-top:1px solid var(--border)">' +
      '<div><span style="color:var(--text2)">' + aibEscape(t.date) + '</span> ' +
      '<b>' + aibEscape(aibTxTypeLabel(t.type)) + '</b> ' +
      (t.symbol ? aibEscape(t.symbol) + ' ' : '') +
      (t.isin ? '<span style="font-size:10px;color:var(--text2)">' + (ch ? 'CH' : 'Ausl') + '</span>' : '') +
      '</div>' +
      '<div class="v">' + (t.netAmount != null ? fmt(t.netAmount) : '—') + ' ' + aibEscape(t.currency || '') + '</div>' +
    '</div>';
  });
  if (filteredTx.length > 100) html += '<div style="text-align:center;color:var(--text2);font-size:11px;margin-top:6px">Erste 100 von ' + filteredTx.length + '</div>';
  html += '</div>';

  content.innerHTML = html;
}

function openAibTaxImportModal() {
  document.getElementById('aib-tax-paste').value = '';
  document.getElementById('aib-tax-import-msg').textContent = '';
  openModal('aib-tax-import-modal');
}

async function aibTaxHandleFile(e) {
  var file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    var buf = await file.arrayBuffer();
    var text = new TextDecoder('utf-8').decode(buf);
    if (text.indexOf('�') >= 0) text = new TextDecoder('windows-1252').decode(buf);
    aibTaxImportText(text);
  } catch (err) {
    document.getElementById('aib-tax-import-msg').innerHTML = '<span style="color:#FF6B6B">Datei-Fehler: ' + aibEscape(err.message || err) + '</span>';
  } finally {
    e.target.value = '';
  }
}

function aibTaxHandlePaste() {
  var text = document.getElementById('aib-tax-paste').value;
  if (!text.trim()) {
    document.getElementById('aib-tax-import-msg').innerHTML = '<span style="color:#FF6B6B">CSV-Text fehlt</span>';
    return;
  }
  aibTaxImportText(text);
}

function aibTaxImportText(text) {
  var res = aibParseSaxoCsv(text);
  if (res.transactions.length === 0) {
    document.getElementById('aib-tax-import-msg').innerHTML = '<span style="color:#FF6B6B">' + (res.errors[0] || 'Keine Transaktionen erkannt.') + '</span>';
    return;
  }
  var existing = new Set((AIB_STATE.transactions || []).map(function (t) { return t.date + '|' + t.type + '|' + t.symbol + '|' + t.netAmount + '|' + t.currency; }));
  var fresh = res.transactions.filter(function (t) { return !existing.has(t.date + '|' + t.type + '|' + t.symbol + '|' + t.netAmount + '|' + t.currency); });
  if (fresh.length === 0) {
    document.getElementById('aib-tax-import-msg').innerHTML = '<span style="color:var(--text2)">Alle ' + res.transactions.length + ' Einträge bereits importiert.</span>';
    return;
  }
  AIB_STATE.transactions = fresh.concat(AIB_STATE.transactions || []);
  aibMarkDirty();
  document.getElementById('aib-tax-import-msg').innerHTML = '<span style="color:#5DEABF">' + fresh.length + ' Transaktionen importiert.</span>';
  setTimeout(function () {
    closeModal('aib-tax-import-modal');
    renderAibTax();
  }, 800);
}

function exportTaxCsv() {
  var ySel = document.getElementById('aib-tax-year');
  var year = ySel ? ySel.value : 'all';
  var filteredTx = year === 'all'
    ? AIB_STATE.transactions
    : (AIB_STATE.transactions || []).filter(function (t) { return (t.date || '').slice(0, 4) === year; });
  var rows = [['Datum', 'Typ', 'Symbol', 'Name', 'ISIN', 'Anzahl', 'Stückpreis', 'Kosten/QSt', 'Nettobetrag', 'Währung', 'CH/Ausland', 'VST CH', 'QSt Ausland']];
  filteredTx.forEach(function (t) {
    var ch = aibIsSwissIsin(t.isin);
    var isDiv = t.type === 'dividend' || t.type === 'capital_gain';
    rows.push([
      t.date, aibTxTypeLabel(t.type), t.symbol, t.name, t.isin,
      t.qty, t.price, t.fees, t.netAmount, t.currency,
      ch ? 'CH' : 'AUSLAND',
      isDiv && ch ? (t.fees || 0) : '',
      isDiv && !ch ? (t.fees || 0) : '',
    ]);
  });
  var csv = rows.map(function (r) { return r.map(function (v) {
    if (v == null) return '';
    var s = String(v);
    return s.indexOf(';') >= 0 || s.indexOf('"') >= 0 ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(';'); }).join('\n');
  var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'steuern-' + year + '-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
