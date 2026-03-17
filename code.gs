// ═══════════════════════════════════════════════════
// F-TRACKER CODE.GS (Einfacher Modus — ohne Login)
// Direkt im User-Sheet deployen.
// Bereitstellen → Web-App · Ausführen als: Ich · Zugriff: Jeder
// ═══════════════════════════════════════════════════

function doGet(e) {
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
  return _json({ error: 'Unbekannte Aktion: ' + (p.action || '(keine)') });
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
