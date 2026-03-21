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
    var sh = ss.getSheetByName('Kurse');
    if (!sh) {
      sh = ss.insertSheet('Kurse');
      sh.getRange(1,1,1,3).setValues([['Ticker','Kurs','Währung']]);
    }
    if (tickers.length > 0) {
      // Clear old data
      var clearRows = Math.max(sh.getLastRow(), tickers.length + 2);
      sh.getRange(2, 1, clearRows, 3).clearContent();
      sh.getRange(2, 1, tickers.length, 1).setValues(tickers.map(function(t){ return [t]; }));

      // Try batch setFormulas first; fall back to row-by-row if any ticker causes a parse error
      var formulas = tickers.map(function(t) {
        // Strip anything that could break the formula string (only keep safe chars)
        var safe = t.replace(/["\\]/g, '').trim();
        return [
          '=IFERROR(GOOGLEFINANCE("' + safe + '","price"),"")',
          '=IFERROR(GOOGLEFINANCE("' + safe + '","currency"),"")'
        ];
      });

      try {
        sh.getRange(2, 2, tickers.length, 2).setFormulas(formulas);
      } catch(e) {
        // Batch failed — write row by row so one bad ticker doesn't kill the rest
        for (var r = 0; r < formulas.length; r++) {
          try {
            sh.getRange(r + 2, 2, 1, 2).setFormulas([formulas[r]]);
          } catch(e2) {
            sh.getRange(r + 2, 2, 1, 2).setValues([['', '']]);
          }
        }
      }

      // Wait for GOOGLEFINANCE to resolve (flush twice with a longer pause)
      SpreadsheetApp.flush();
      Utilities.sleep(4000);
      SpreadsheetApp.flush();
      Utilities.sleep(2000);

      // Read back values; retry once more if all prices are still empty
      var vals = sh.getRange(2, 1, tickers.length, 3).getValues();
      var gotAny = vals.some(function(r){ return parseFloat(r[1]) > 0; });
      if (!gotAny) {
        SpreadsheetApp.flush();
        Utilities.sleep(3000);
        vals = sh.getRange(2, 1, tickers.length, 3).getValues();
      }

      for (var i = 0; i < vals.length; i++) {
        var ticker  = String(vals[i][0] || '').toUpperCase();
        var price   = parseFloat(vals[i][1]);
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
