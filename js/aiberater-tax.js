// ═══════════════════════════════════════════════════════════════
// AI-Berater Steuer-Modul — Saxo-CSV Import + CH-Tax-Übersicht
//
// Multi-Portfolio: Jede Transaktion bekommt ein `portfolio`-Tag
// (z.B. "Saxo", "PostFinance"). Tax-View kann gefiltert werden.
//
// Steuerjahr-First: Selector ganz oben → Wertschriftenverzeichnis
// per 31.12. + Bruttoerträge CH/Ausland + Abzüge + DA-1.
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

// ── ISIN-Country-Code → Land-Name ───────────────────────────────────────────
function aibIsinCountry(isin) {
  if (!isin || typeof isin !== 'string' || isin.length < 2) return '';
  var c = isin.slice(0, 2).toUpperCase();
  return ({
    CH: 'Schweiz', US: 'USA', DE: 'Deutschland', FR: 'Frankreich',
    GB: 'Grossbritannien', IT: 'Italien', NL: 'Niederlande',
    SE: 'Schweden', NO: 'Norwegen', DK: 'Dänemark', FI: 'Finnland',
    ES: 'Spanien', AT: 'Österreich', BE: 'Belgien', LU: 'Luxemburg',
    IE: 'Irland', JP: 'Japan', CA: 'Kanada', AU: 'Australien',
    EX: 'Krypto/Sonstige',
  })[c] || c;
}

function aibIsSwissIsin(isin) {
  return typeof isin === 'string' && isin.toUpperCase().indexOf('CH') === 0;
}

// ── CSV-Parser ──────────────────────────────────────────────────────────────
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

function aibParseSaxoCsv(text, portfolioName) {
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
      portfolio: (portfolioName || 'Saxo').trim() || 'Saxo',
      importedAt: Date.now(),
    };
    if (!tx.date) { errors.push('Zeile ' + (i + 1) + ': Datum ungültig'); continue; }
    transactions.push(tx);
  }
  return { transactions: transactions, errors: errors };
}

// ── Portfolio-Liste (verfügbare Portfolios aus den Transaktionen) ───────────
function aibAllPortfolios() {
  var s = new Set();
  (AIB_STATE.transactions || []).forEach(function (t) {
    if (t.portfolio) s.add(t.portfolio);
  });
  return Array.from(s).sort();
}

// ── Wertschriftenverzeichnis: Bestand 31.12.YYYY pro ISIN ───────────────────
function aibBuildHoldingsAt(year, portfolioFilter) {
  // year: 'YYYY' string or 'all'
  // portfolioFilter: '' (alle) oder konkreter Name
  var cutoff = year === 'all' ? '9999-12-31' : (year + '-12-31');
  var byIsin = {};
  (AIB_STATE.transactions || []).forEach(function (tx) {
    if (!tx.date || tx.date > cutoff) return;
    if (portfolioFilter && tx.portfolio !== portfolioFilter) return;
    if (tx.type !== 'buy' && tx.type !== 'sell') return;
    var key = tx.isin || tx.symbol || tx.name;
    if (!byIsin[key]) byIsin[key] = {
      isin: tx.isin || '', symbol: tx.symbol || '', name: tx.name || '',
      currency: tx.currency || '', country: aibIsinCountry(tx.isin),
      ch: aibIsSwissIsin(tx.isin),
      shares: 0, totalBoughtCost: 0, totalBoughtQty: 0,
    };
    var entry = byIsin[key];
    var qty = aibNum(tx.qty);
    if (tx.type === 'buy') {
      entry.shares += qty;
      entry.totalBoughtCost += qty * aibNum(tx.price);
      entry.totalBoughtQty += qty;
    } else if (tx.type === 'sell') {
      entry.shares -= qty;
    }
  });
  // avg-cost + Filter nur Positionen mit shares > 0
  var out = [];
  Object.keys(byIsin).forEach(function (k) {
    var e = byIsin[k];
    if (e.shares <= 0.0001) return;
    e.avgCost = e.totalBoughtQty > 0 ? e.totalBoughtCost / e.totalBoughtQty : 0;
    e.estValue = e.shares * e.avgCost; // ohne Live-Kurs nur Einstand
    out.push(e);
  });
  return out.sort(function (a, b) { return b.estValue - a.estValue; });
}

// ── Erträge / Abzüge pro Steuerjahr ─────────────────────────────────────────
function aibBuildTaxYearData(year, portfolioFilter) {
  var inYear = function (date) { return year === 'all' || (date && date.slice(0, 4) === year); };
  var inFilter = function (tx) { return !portfolioFilter || tx.portfolio === portfolioFilter; };
  var d = {
    year: year, portfolioFilter: portfolioFilter,
    dividendsCH: [],       // pro Position
    dividendsForeign: [],  // pro Position pro Land
    interestIn: 0, interestOut: 0,
    feesCustody: 0,
    buysCount: 0, sellsCount: 0, buysTotal: 0, sellsTotal: 0,
    chWithholdingTotal: 0,
    foreignWithholdingByCountry: {},
    txCount: 0,
  };
  var byPosCH = {}, byPosFor = {};
  (AIB_STATE.transactions || []).forEach(function (tx) {
    if (!inYear(tx.date)) return;
    if (!inFilter(tx)) return;
    d.txCount++;
    var qty = aibNum(tx.qty), price = aibNum(tx.price);
    var fees = aibNum(tx.fees), net = aibNum(tx.netAmount);
    var ch = aibIsSwissIsin(tx.isin);
    var country = aibIsinCountry(tx.isin);
    if (tx.type === 'dividend' || tx.type === 'capital_gain') {
      var brutto = qty * price;
      var key = tx.isin || tx.symbol || tx.name;
      var bucket = ch ? byPosCH : byPosFor;
      if (!bucket[key]) bucket[key] = {
        isin: tx.isin, symbol: tx.symbol, name: tx.name,
        currency: tx.currency, country: country,
        brutto: 0, qst: 0, netto: 0, entries: 0, ch: ch,
        events: [],
      };
      bucket[key].brutto += brutto;
      bucket[key].qst += fees;
      bucket[key].netto += net;
      bucket[key].entries++;
      bucket[key].events.push({ date: tx.date, brutto: brutto, qst: fees, netto: net, type: tx.type });
      if (ch) d.chWithholdingTotal += fees;
      else {
        d.foreignWithholdingByCountry[country] = (d.foreignWithholdingByCountry[country] || 0) + fees;
      }
    } else if (tx.type === 'interest_in') d.interestIn += net;
    else if (tx.type === 'interest_out') d.interestOut += Math.abs(net);
    else if (tx.type === 'fee_custody' || tx.type === 'fee_correction') d.feesCustody += Math.abs(net);
    else if (tx.type === 'buy') { d.buysTotal += Math.abs(net); d.buysCount++; }
    else if (tx.type === 'sell') { d.sellsTotal += Math.abs(net); d.sellsCount++; }
  });
  d.dividendsCH = Object.keys(byPosCH).map(function (k) { return byPosCH[k]; }).sort(function (a, b) { return b.brutto - a.brutto; });
  d.dividendsForeign = Object.keys(byPosFor).map(function (k) { return byPosFor[k]; }).sort(function (a, b) { return b.brutto - a.brutto; });
  return d;
}

// ── Render: Steuer-View ─────────────────────────────────────────────────────
function renderAibTax() {
  var ySel = document.getElementById('aib-tax-year');
  var pfSel = document.getElementById('aib-tax-portfolio-filter');
  var content = document.getElementById('aib-tax-content');
  if (!ySel || !pfSel || !content) return;

  // Year-Select (alle Jahre aus Transaktionen)
  var yearSet = {};
  (AIB_STATE.transactions || []).forEach(function (t) { if (t.date) yearSet[t.date.slice(0, 4)] = true; });
  var yearKeys = Object.keys(yearSet).sort().reverse();
  var defaultYear = yearKeys.length ? yearKeys[0] : String(new Date().getFullYear() - 1);
  var currentYear = ySel.value && (yearKeys.indexOf(ySel.value) >= 0 || ySel.value === 'all') ? ySel.value : defaultYear;
  ySel.innerHTML = yearKeys.map(function (y) { return '<option value="' + y + '"' + (y === currentYear ? ' selected' : '') + '>Steuerjahr ' + y + '</option>'; }).join('') + '<option value="all"' + (currentYear === 'all' ? ' selected' : '') + '>Alle Jahre</option>';

  // Portfolio-Select
  var portfolios = aibAllPortfolios();
  var currentPf = pfSel.value && (pfSel.value === '' || portfolios.indexOf(pfSel.value) >= 0) ? pfSel.value : '';
  pfSel.innerHTML = '<option value="">Alle Portfolios</option>' + portfolios.map(function (p) { return '<option value="' + aibEscape(p) + '"' + (p === currentPf ? ' selected' : '') + '>' + aibEscape(p) + '</option>'; }).join('');

  // Datalist für Import
  var dl = document.getElementById('aib-tax-portfolio-list');
  if (dl) dl.innerHTML = portfolios.map(function (p) { return '<option value="' + aibEscape(p) + '">'; }).join('');

  if (!AIB_STATE.transactions || AIB_STATE.transactions.length === 0) {
    content.innerHTML = '<div class="aib-empty">Noch keine Transaktionen.<br><span style="font-size:12px;opacity:.7">CSV-Import oben rechts (📥).</span></div>';
    return;
  }

  var tax = aibBuildTaxYearData(currentYear, currentPf);
  var holdings = currentYear === 'all' ? [] : aibBuildHoldingsAt(currentYear, currentPf);
  var fmt = function (n) { return aibFmt(n, 2); };

  var html = '';

  // ── HEADER ── Kompakte Total-Übersicht
  var totalCH = tax.dividendsCH.reduce(function (s, p) { return s + p.brutto; }, 0);
  var totalForeign = tax.dividendsForeign.reduce(function (s, p) { return s + p.brutto; }, 0);
  html += '<div class="aib-stat-card" style="background:linear-gradient(135deg,rgba(255,107,53,.1),rgba(0,212,170,.05));border-color:var(--accent)">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">' +
      '<div>' +
        '<div style="font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px">Steuerjahr</div>' +
        '<div style="font-size:22px;font-weight:700;color:var(--text)">' + aibEscape(tax.year) + '</div>' +
        (currentPf ? '<div style="font-size:11px;color:var(--text2)">Portfolio: ' + aibEscape(currentPf) + '</div>' : '') +
      '</div>' +
      '<div style="text-align:right">' +
        '<div style="font-size:11px;color:var(--text2)">Total Brutto-Ertrag</div>' +
        '<div style="font-size:18px;font-weight:600;color:var(--text)">' + fmt(totalCH + totalForeign + tax.interestIn) + '</div>' +
      '</div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;border-top:1px solid var(--border);padding-top:8px">' +
      '<div><span style="color:var(--text2)">VST zurück</span><div style="font-weight:600;color:#5DEABF">' + fmt(tax.chWithholdingTotal) + '</div></div>' +
      '<div><span style="color:var(--text2)">DA-1 Anrechnung</span><div style="font-weight:600;color:#9DDEFC">' + fmt(Object.values(tax.foreignWithholdingByCountry).reduce(function (s, v) { return s + v; }, 0)) + '</div></div>' +
    '</div>' +
  '</div>';

  // ── KARTE 1: Wertschriftenverzeichnis ──
  if (currentYear !== 'all') {
    html += '<div class="aib-stat-card">' +
      '<h4>📋 Wertschriftenverzeichnis per 31.12.' + aibEscape(tax.year) + '</h4>';
    if (holdings.length === 0) {
      html += '<div style="font-size:12px;color:var(--text2);text-align:center;padding:12px">Keine Positionen am Stichtag (aus Transaktionen rekonstruiert).</div>';
    } else {
      html += '<div style="font-size:11px;color:var(--text2);margin-bottom:6px">' + holdings.length + ' Positionen · Einstand zur Bewertung (Steuerwert aus ESTV-Kursliste manuell)</div>';
      holdings.forEach(function (h) {
        html += '<div style="display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid var(--border);font-size:12px">' +
          '<div style="flex:1;min-width:0">' +
            '<div style="color:var(--text);font-weight:500">' + aibEscape(h.name || h.symbol) + ' <span style="color:var(--text2);font-weight:400;font-size:10px">' + aibEscape(h.isin || '') + '</span></div>' +
            '<div style="color:var(--text2);font-size:11px">' + aibEscape(h.country) + ' · ' + fmt(h.shares) + ' Stück · Einstand ' + fmt(h.avgCost) + ' ' + aibEscape(h.currency) + '</div>' +
          '</div>' +
          '<div style="text-align:right;color:var(--text)">' + fmt(h.estValue) + '<br><span style="color:var(--text2);font-size:10px">' + aibEscape(h.currency) + '</span></div>' +
        '</div>';
      });
    }
    html += '</div>';
  }

  // ── KARTE 2: Bruttoerträge CH ──
  html += '<div class="aib-stat-card">' +
    '<h4>🇨🇭 Schweizer Wertschriftenerträge ' + aibEscape(tax.year) + '</h4>' +
    '<div style="font-size:11px;color:var(--text2);margin-bottom:8px">Brutto-Erträge, davon 35% Verrechnungssteuer (rückforderbar)</div>';
  if (tax.dividendsCH.length === 0) {
    html += '<div style="font-size:12px;color:var(--text2);text-align:center;padding:8px">Keine CH-Erträge in ' + aibEscape(tax.year) + '.</div>';
  } else {
    tax.dividendsCH.forEach(function (p) {
      html += '<div style="padding:6px 0;border-top:1px solid var(--border);font-size:12px">' +
        '<div style="display:flex;justify-content:space-between">' +
          '<span style="color:var(--text)"><b>' + aibEscape(p.name || p.symbol) + '</b></span>' +
          '<span style="color:var(--text);font-weight:500">' + fmt(p.brutto) + ' ' + aibEscape(p.currency) + '</span>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;color:var(--text2);font-size:11px;margin-top:2px">' +
          '<span>' + p.entries + ' Ausschüttung' + (p.entries === 1 ? '' : 'en') + ' · VST ' + fmt(p.qst) + '</span>' +
          '<span>Netto ' + fmt(p.netto) + '</span>' +
        '</div>' +
      '</div>';
    });
    html += '<div style="display:flex;justify-content:space-between;padding-top:8px;margin-top:6px;border-top:2px solid var(--border);font-weight:600;font-size:13px"><span>Total CH</span><span>' + fmt(totalCH) + ' · VST ' + fmt(tax.chWithholdingTotal) + '</span></div>';
  }
  html += '</div>';

  // ── KARTE 3: Bruttoerträge Ausland (gruppiert nach Land) ──
  html += '<div class="aib-stat-card">' +
    '<h4>🌍 Ausländische Wertschriftenerträge ' + aibEscape(tax.year) + '</h4>' +
    '<div style="font-size:11px;color:var(--text2);margin-bottom:8px">Pro Land — Quellensteuer via DA-1 anrechenbar</div>';
  if (tax.dividendsForeign.length === 0) {
    html += '<div style="font-size:12px;color:var(--text2);text-align:center;padding:8px">Keine ausländischen Erträge in ' + aibEscape(tax.year) + '.</div>';
  } else {
    var byCountry = {};
    tax.dividendsForeign.forEach(function (p) {
      var c = p.country || '—';
      if (!byCountry[c]) byCountry[c] = { brutto: 0, qst: 0, netto: 0, positions: [] };
      byCountry[c].brutto += p.brutto;
      byCountry[c].qst += p.qst;
      byCountry[c].netto += p.netto;
      byCountry[c].positions.push(p);
    });
    Object.keys(byCountry).sort(function (a, b) { return byCountry[b].brutto - byCountry[a].brutto; }).forEach(function (c) {
      var cc = byCountry[c];
      html += '<details style="margin:6px 0;padding:0;border-top:1px solid var(--border);padding-top:6px">' +
        '<summary style="cursor:pointer;font-size:12px;color:var(--text);display:flex;justify-content:space-between;list-style:none">' +
          '<span><b>' + aibEscape(c) + '</b> <span style="color:var(--text2)">(' + cc.positions.length + ')</span></span>' +
          '<span><b>' + fmt(cc.brutto) + '</b> · QSt ' + fmt(cc.qst) + '</span>' +
        '</summary>' +
        '<div style="padding:6px 0 0 6px">';
      cc.positions.forEach(function (p) {
        html += '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text2);padding:3px 0">' +
          '<span>' + aibEscape(p.name || p.symbol) + '</span>' +
          '<span>' + fmt(p.brutto) + ' ' + aibEscape(p.currency) + ' (QSt ' + fmt(p.qst) + ')</span>' +
        '</div>';
      });
      html += '</div></details>';
    });
    html += '<div style="display:flex;justify-content:space-between;padding-top:8px;margin-top:6px;border-top:2px solid var(--border);font-weight:600;font-size:13px"><span>Total Ausland</span><span>' + fmt(totalForeign) + ' · QSt ' + fmt(Object.values(tax.foreignWithholdingByCountry).reduce(function (s, v) { return s + v; }, 0)) + '</span></div>';
  }
  html += '</div>';

  // ── KARTE 4: Abzüge ──
  html += '<div class="aib-stat-card">' +
    '<h4>💰 Abzüge & weitere Erträge ' + aibEscape(tax.year) + '</h4>' +
    '<div class="aib-stat-row"><span class="l">Zinsertrag (steuerbar)</span><span class="v">' + fmt(tax.interestIn) + '</span></div>' +
    '<div class="aib-stat-row"><span class="l">Schuldzinsen (abzugsfähig)</span><span class="v">' + fmt(tax.interestOut) + '</span></div>' +
    '<div class="aib-stat-row"><span class="l">Depotgebühren (abzugsfähig)</span><span class="v">' + fmt(tax.feesCustody) + '</span></div>' +
  '</div>';

  // ── KARTE 5: Trades (informativ, steuerfrei) ──
  if (tax.buysCount + tax.sellsCount > 0) {
    html += '<div class="aib-stat-card" style="opacity:.75">' +
      '<h4>📊 Trades ' + aibEscape(tax.year) + ' (informativ, steuerfrei)</h4>' +
      '<div class="aib-stat-row"><span class="l">' + tax.buysCount + ' Käufe</span><span class="v">' + fmt(tax.buysTotal) + '</span></div>' +
      '<div class="aib-stat-row"><span class="l">' + tax.sellsCount + ' Verkäufe</span><span class="v">' + fmt(tax.sellsTotal) + '</span></div>' +
      '<div style="font-size:10px;color:var(--text2);margin-top:6px">Kapitalgewinne sind für Privatpersonen in der CH steuerfrei.</div>' +
    '</div>';
  }

  // ── Kompakte Tx-Liste (collapsed) ──
  var allTx = (AIB_STATE.transactions || []).filter(function (t) {
    if (currentYear !== 'all' && (t.date || '').slice(0, 4) !== currentYear) return false;
    if (currentPf && t.portfolio !== currentPf) return false;
    return true;
  });
  if (allTx.length) {
    html += '<details class="aib-stat-card" style="padding:0">' +
      '<summary style="cursor:pointer;padding:12px 14px;font-weight:600;font-size:13px">📜 Alle Transaktionen anzeigen (' + allTx.length + ')</summary>' +
      '<div style="padding:0 14px 12px">';
    allTx.slice(0, 200).forEach(function (t) {
      var ch = aibIsSwissIsin(t.isin);
      html += '<div style="display:flex;justify-content:space-between;font-size:11px;padding:4px 0;border-top:1px solid var(--border)">' +
        '<div><span style="color:var(--text2)">' + aibEscape(t.date) + '</span> ' +
          '<b>' + aibEscape(aibTxTypeLabel(t.type)) + '</b> ' +
          (t.symbol ? aibEscape(t.symbol) + ' ' : '') +
          (t.portfolio ? '<span style="font-size:9px;color:var(--accent);background:rgba(255,107,53,.1);padding:1px 4px;border-radius:3px">' + aibEscape(t.portfolio) + '</span>' : '') +
        '</div>' +
        '<div class="v">' + (t.netAmount != null ? fmt(t.netAmount) : '—') + ' ' + aibEscape(t.currency || '') + '</div>' +
      '</div>';
    });
    if (allTx.length > 200) html += '<div style="text-align:center;color:var(--text2);font-size:11px;margin-top:6px">Erste 200 von ' + allTx.length + '</div>';
    html += '</div></details>';
  }

  content.innerHTML = html;
}

// ── Import-Handlers ─────────────────────────────────────────────────────────
function openAibTaxImportModal() {
  var pfInput = document.getElementById('aib-tax-portfolio');
  if (pfInput && !pfInput.value) {
    var existing = aibAllPortfolios();
    pfInput.value = existing.length ? existing[0] : '';
    pfInput.placeholder = existing.length ? existing[0] : 'Saxo';
  }
  document.getElementById('aib-tax-paste').value = '';
  document.getElementById('aib-tax-import-msg').textContent = '';
  // Datalist mit existierenden Portfolios
  var dl = document.getElementById('aib-tax-portfolio-list');
  if (dl) dl.innerHTML = aibAllPortfolios().map(function (p) { return '<option value="' + aibEscape(p) + '">'; }).join('');
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
  var pfName = (document.getElementById('aib-tax-portfolio').value || '').trim() || 'Saxo';
  var res = aibParseSaxoCsv(text, pfName);
  if (res.transactions.length === 0) {
    document.getElementById('aib-tax-import-msg').innerHTML = '<span style="color:#FF6B6B">' + (res.errors[0] || 'Keine Transaktionen erkannt.') + '</span>';
    return;
  }
  var existing = new Set((AIB_STATE.transactions || []).map(function (t) {
    return (t.portfolio || '') + '|' + t.date + '|' + t.type + '|' + t.symbol + '|' + t.netAmount + '|' + t.currency;
  }));
  var fresh = res.transactions.filter(function (t) {
    return !existing.has((t.portfolio || '') + '|' + t.date + '|' + t.type + '|' + t.symbol + '|' + t.netAmount + '|' + t.currency);
  });
  if (fresh.length === 0) {
    document.getElementById('aib-tax-import-msg').innerHTML = '<span style="color:var(--text2)">Alle ' + res.transactions.length + ' Einträge bereits importiert.</span>';
    return;
  }
  AIB_STATE.transactions = fresh.concat(AIB_STATE.transactions || []);
  aibMarkDirty();
  document.getElementById('aib-tax-import-msg').innerHTML = '<span style="color:#5DEABF">' + fresh.length + ' Transaktionen importiert in Portfolio „' + aibEscape(pfName) + '".</span>';
  setTimeout(function () {
    closeModal('aib-tax-import-modal');
    renderAibTax();
  }, 800);
}

function exportTaxCsv() {
  var ySel = document.getElementById('aib-tax-year');
  var pfSel = document.getElementById('aib-tax-portfolio-filter');
  var year = ySel ? ySel.value : 'all';
  var pf = pfSel ? pfSel.value : '';
  var filteredTx = (AIB_STATE.transactions || []).filter(function (t) {
    if (year !== 'all' && (t.date || '').slice(0, 4) !== year) return false;
    if (pf && t.portfolio !== pf) return false;
    return true;
  });
  var rows = [['Portfolio', 'Datum', 'Typ', 'Symbol', 'Name', 'ISIN', 'Land', 'Anzahl', 'Stückpreis', 'Kosten/QSt', 'Nettobetrag', 'Währung', 'CH/Ausland', 'VST CH', 'QSt Ausland']];
  filteredTx.forEach(function (t) {
    var ch = aibIsSwissIsin(t.isin);
    var isDiv = t.type === 'dividend' || t.type === 'capital_gain';
    rows.push([
      t.portfolio || '', t.date, aibTxTypeLabel(t.type), t.symbol, t.name, t.isin, aibIsinCountry(t.isin),
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
  a.download = 'steuern-' + (pf || 'alle') + '-' + year + '-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Auto-Portfolio-Build aus Transaktionen ──────────────────────────────────
// Aggregiert Buy/Sell pro ISIN und erstellt/aktualisiert AI-Portfolio-Einträge.
function aibBuildPortfolioFromTx() {
  if (!AIB_STATE.transactions || AIB_STATE.transactions.length === 0) {
    if (typeof toast === 'function') toast('Keine Transaktionen zum Rekonstruieren', 'err');
    return;
  }
  if (!confirm('Aus allen Buy/Sell-Transaktionen Positionen rekonstruieren?\n\n• Bestehende Positionen (gleiche ISIN/Ticker) werden überschrieben\n• DD-Felder werden NICHT angefasst\n• Bei mehreren Portfolios entstehen ggf. mehrere Positionen pro ISIN\n\nFortfahren?')) return;
  var holdings = aibBuildHoldingsAt('all', null); // alle Trades, alle Portfolios → aktuelle Bestände
  if (holdings.length === 0) {
    if (typeof toast === 'function') toast('Keine offenen Positionen', 'err');
    return;
  }
  // Map current portfolio by ISIN für DD-Preservation
  var existingByKey = {};
  (AIB_STATE.portfolio || []).forEach(function (p) {
    var k = (p.ticker || '') + '|' + (p.currency || '');
    existingByKey[k] = p;
  });
  var newPositions = holdings.map(function (h) {
    var key = (h.symbol || h.isin) + '|' + h.currency;
    var existing = existingByKey[key];
    var base = {
      id: existing ? existing.id : aibUid(),
      ticker: h.symbol || h.isin,
      name: h.name || h.symbol,
      assetClass: existing ? existing.assetClass : 'Sonstige',
      shares: h.shares,
      costBasis: h.avgCost,
      currentPrice: existing ? existing.currentPrice : h.avgCost,
      currency: h.currency,
      purchaseDate: existing ? existing.purchaseDate : new Date().toISOString().slice(0, 10),
      isin: h.isin,
      note: existing ? existing.note : '',
      dueDiligence: existing ? existing.dueDiligence : aibEmptyDD(),
    };
    return base;
  });
  AIB_STATE.portfolio = newPositions;
  aibMarkDirty();
  if (typeof toast === 'function') toast('Portfolio rekonstruiert: ' + newPositions.length + ' Positionen', '');
  // Wechseln zum Portfolio-Tab
  aibSetView('portfolio');
}
