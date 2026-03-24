/* ============================================================
   gas-src.js — Google Apps Script source code as JS string constants
   Canonical source: gas/code.gs  and  gas/admin-code.gs
   To update: edit the gas/*.gs files, then sync this file.
   ============================================================ */

const CODE_GS = `function doGet(e) {
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
        var safe = t.replace(/["\\]/g, '').trim();
        var isFx = safe.toUpperCase().indexOf('CURRENCY:') === 0;
        return [
          '=IFERROR(GOOGLEFINANCE("' + safe + '","price"),"")',
          isFx ? '' : '=IFERROR(GOOGLEFINANCE("' + safe + '","currency"),"")'
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
        if (ticker.indexOf('CURRENCY:') === 0 && !currency) {
          var pair = ticker.replace('CURRENCY:', '');
          currency = pair.length >= 6 ? pair.substring(3) : pair;
        }
        if (ticker && !isNaN(price) && price > 0) {
          results[ticker] = { price: price, currency: currency, prevClose: null };
        }
      }
    }
    return _json({ prices: results });
  }
  // ── Groups (stored in this sheet's Groups + Notifications tabs) ──
  if (p.action === 'groupsEnsureSheet') {
    var gsh = ss.getSheetByName(p.sheet);
    if (!gsh) {
      gsh = ss.insertSheet(p.sheet);
      if (p.headers) { var h = JSON.parse(p.headers); gsh.getRange(1,1,1,h.length).setValues([h]); gsh.setFrozenRows(1); }
    }
    return _json({ ok: true });
  }
  if (p.action === 'groupsGet') {
    var parts = p.range.split('!'); var sheetName = parts[0]; var rangePart = parts[1] || 'A:Z';
    var gsh = ss.getSheetByName(sheetName);
    if (!gsh) return _json({ values: [] });
    var lastRow = gsh.getLastRow();
    if (lastRow < 1) return _json({ values: [] });
    var m = rangePart.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);
    if (m) {
      var sr = parseInt(m[2]); var er = Math.min(parseInt(m[4]), lastRow);
      if (sr > er) return _json({ values: [] });
      return _json({ values: gsh.getRange(m[1]+sr+':'+m[3]+er).getValues() });
    }
    return _json({ values: gsh.getRange(1,1,lastRow,gsh.getLastColumn()).getValues() });
  }
  if (p.action === 'groupsAppend') {
    var gsh = ss.getSheetByName(p.sheet);
    if (!gsh) return _json({ error: 'Sheet nicht gefunden: ' + p.sheet });
    var rows = JSON.parse(p.values);
    var startRow = Math.max(gsh.getLastRow(), 1) + 1;
    gsh.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
    return _json({ ok: true });
  }
  if (p.action === 'groupsUpdate') {
    var parts = p.range.split('!');
    ss.getSheetByName(parts[0]).getRange(parts[1]).setValues(JSON.parse(p.values));
    return _json({ ok: true });
  }
  if (p.action === 'groupsFindRow') {
    var gsh = ss.getSheetByName(p.sheet);
    if (!gsh) return _json({ row: null });
    var vals = gsh.getDataRange().getValues();
    for (var i = 0; i < vals.length; i++) { if (String(vals[i][0]) === String(p.id)) return _json({ row: i+1 }); }
    return _json({ row: null });
  }
  return _json({ error: 'Unbekannte Aktion: ' + (p.action || '(keine)') });
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
`;

// ─── Admin Code.gs (deploy on admin sheet only) ───────────
const ADMIN_CODE_GS = `// ═══════════════════════════════════════════════════
// F-TRACKER ADMIN CODE.GS
// Nur im Admin-Sheet deployen (nicht im User-Sheet!)
// Bereitstellen → Web-App · Ausführen als: Ich · Zugriff: Jeder
// ═══════════════════════════════════════════════════

const SESSION_HOURS = 720; // 30 Tage

function doGet(e) {
  const p = e.parameter || {};
  try { return _json(_handle(p)); }
  catch(err) { return _json({ error: err.toString() }); }
}

function _handle(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (p.action === 'signup')         return _signup(ss, p);
  if (p.action === 'login')          return _login(ss, p);
  if (p.action === 'get_app_config') return _getAppConfig(ss);
  const session = _checkSession(ss, p.token);
  if (!session) return { error: 'Sitzung abgelaufen. Bitte neu anmelden.' };
  const user = _getUser(ss, session.username);
  if (!user) return { error: 'Benutzer nicht gefunden.' };
  if (p.action === 'logout')       return _logout(ss, p.token);
  if (p.action === 'get')          return _proxyGet(user.sheetId, p);
  if (p.action === 'append')       return _proxyAppend(user.sheetId, p);
  if (p.action === 'update')       return _proxyUpdate(user.sheetId, p);
  if (p.action === 'meta')         return _proxyMeta(user.sheetId);
  if (p.action === 'ensureSheet')  return _proxyEnsureSheet(user.sheetId, p);
  if (p.action === 'setFormulas')  return _proxySetFormulas(user.sheetId, p);
  if (p.action === 'fetchPrices') {
    var tickers = JSON.parse(p.tickers || '[]');
    var results = {};
    var userSs = SpreadsheetApp.openById(user.sheetId);
    var sh = userSs.getSheetByName('Kurse');
    if (!sh) {
      sh = userSs.insertSheet('Kurse');
      sh.getRange(1,1,1,3).setValues([['Ticker','Kurs','Währung']]);
    }
    if (tickers.length > 0) {
      var dataRange = sh.getRange(2, 1, Math.max(sh.getLastRow(), tickers.length + 1), 3);
      dataRange.clearContent();
      sh.getRange(2, 1, tickers.length, 1).setValues(tickers.map(function(t){ return [t]; }));
      var formulas = tickers.map(function(t) {
        var clean = t.replace(/"/g, '');
        var isFx = clean.toUpperCase().indexOf('CURRENCY:') === 0;
        return [
          '=IFERROR(GOOGLEFINANCE("' + clean + '","price"),"")',
          isFx ? '' : '=IFERROR(GOOGLEFINANCE("' + clean + '","currency"),"")'
        ];
      });
      sh.getRange(2, 2, tickers.length, 2).setFormulas(formulas);
      SpreadsheetApp.flush();
      Utilities.sleep(2000);
      SpreadsheetApp.flush();
      var vals = sh.getRange(2, 1, tickers.length, 3).getValues();
      for (var i = 0; i < vals.length; i++) {
        var ticker = String(vals[i][0] || '').toUpperCase();
        var price = parseFloat(vals[i][1]);
        var currency = String(vals[i][2] || '');
        if (ticker.indexOf('CURRENCY:') === 0 && !currency) {
          var pair = ticker.replace('CURRENCY:', '');
          currency = pair.length >= 6 ? pair.substring(3) : pair;
        }
        if (ticker && !isNaN(price) && price > 0) {
          results[ticker] = { price: price, currency: currency, prevClose: null };
        }
      }
    }
    return { prices: results };
  }
  if (p.action === 'change_pw')    return _changePw(ss, session.username, p);
  // Groups — operate on ADMIN sheet (shared across users)
  if (p.action === 'groupsGet')         return _groupsGet(ss, p);
  if (p.action === 'groupsAppend')      return _groupsAppend(ss, p);
  if (p.action === 'groupsUpdate')      return _groupsUpdate(ss, p);
  if (p.action === 'groupsEnsureSheet') return _groupsEnsureSheet(ss, p);
  if (p.action === 'groupsFindRow')     return _groupsFindRow(ss, p);
  if (user.role !== 'admin') return { error: 'Keine Berechtigung.' };
  if (p.action === 'admin_list')            return _adminList(ss);
  if (p.action === 'admin_delete')          return _adminDelete(ss, p);
  if (p.action === 'admin_reset_pw')        return _adminResetPw(ss, p);
  if (p.action === 'admin_set_admin_url')   return _adminSetAdminUrl(ss, p);
  if (p.action === 'admin_list_pending')    return _adminListPending(ss);
  if (p.action === 'admin_approve')         return _adminApprove(ss, p);
  if (p.action === 'admin_reject')          return _adminReject(ss, p);
  return { error: 'Unbekannte Aktion: ' + (p.action || '(keine)') };
}

function _signup(ss, p) {
  if (!p.user || !p.hash) return { error: 'Benutzername und Passwort erforderlich.' };
  const user = p.user.trim().toLowerCase();
  if (user.length < 3) return { error: 'Benutzername: mind. 3 Zeichen.' };
  if (!/^[a-z0-9._-]+$/.test(user)) return { error: 'Nur a–z 0–9 . _ - erlaubt.' };
  const sheet = ss.getSheetByName('Users');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++)
    if (String(rows[i][0]).toLowerCase() === user) return { error: 'Benutzername bereits vergeben.' };
  const newSs = SpreadsheetApp.create('FTracker – ' + user);
  _initUserSheet(newSs);
  sheet.appendRow([user, p.hash, newSs.getId(), newSs.getUrl(), new Date().toISOString(), 'pending', '']);
  return { ok: true, pending: true };
}

function _login(ss, p) {
  if (!p.user || !p.hash) return { error: 'Benutzername und Passwort erforderlich.' };
  const user = p.user.trim().toLowerCase();
  const sheet = ss.getSheetByName('Users');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).toLowerCase() === user && rows[i][1] === p.hash) {
      const role = rows[i][5] || 'user';
      if (role === 'pending') return { error: 'Dein Konto wartet noch auf Freischaltung durch den Admin.' };
      sheet.getRange(i + 1, 7).setValue(new Date().toISOString());
      const token = _createSession(ss, user);
      return { ok: true, token, username: user, role };
    }
  }
  return { error: 'Benutzername oder Passwort falsch.' };
}

function _logout(ss, token) {
  const sheet = ss.getSheetByName('Sessions');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++)
    if (rows[i][0] === token) { sheet.deleteRow(i + 1); break; }
  return { ok: true };
}

function _changePw(ss, username, p) {
  if (!p.newHash) return { error: 'newHash fehlt' };
  const sheet = ss.getSheetByName('Users');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++)
    if (String(rows[i][0]).toLowerCase() === username.toLowerCase()) {
      sheet.getRange(i + 1, 2).setValue(p.newHash);
      return { ok: true };
    }
  return { error: 'Benutzer nicht gefunden' };
}

function _checkSession(ss, token) {
  if (!token) return null;
  const sheet = ss.getSheetByName('Sessions');
  const rows = sheet.getDataRange().getValues();
  const now = new Date();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === token) {
      if (new Date(rows[i][2]) > now) return { username: rows[i][1] };
      sheet.deleteRow(i + 1); return null;
    }
  }
  return null;
}

function _createSession(ss, username) {
  const token = Utilities.getUuid();
  const expires = new Date(Date.now() + SESSION_HOURS * 3600 * 1000);
  ss.getSheetByName('Sessions').appendRow([token, username, expires.toISOString()]);
  return token;
}

function _getUser(ss, username) {
  const rows = ss.getSheetByName('Users').getDataRange().getValues();
  for (let i = 1; i < rows.length; i++)
    if (String(rows[i][0]).toLowerCase() === username.toLowerCase())
      return { username: rows[i][0], sheetId: rows[i][2], sheetUrl: rows[i][3], role: rows[i][5] || 'user' };
  return null;
}

function _proxyGet(sheetId, p) {
  return { values: SpreadsheetApp.openById(sheetId).getRange(p.range).getValues() };
}
function _proxyAppend(sheetId, p) {
  const ss = SpreadsheetApp.openById(sheetId);
  const sh = ss.getSheetByName(p.sheet);
  if (!sh) return { error: 'Sheet nicht gefunden: ' + p.sheet };
  const rows = JSON.parse(p.values);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  return { ok: true };
}
function _proxyUpdate(sheetId, p) {
  SpreadsheetApp.openById(sheetId).getRange(p.range).setValues(JSON.parse(p.values));
  return { ok: true };
}
function _proxyMeta(sheetId) {
  return { sheets: SpreadsheetApp.openById(sheetId).getSheets().map(s => ({ properties: { title: s.getName() } })) };
}
function _proxyEnsureSheet(sheetId, p) {
  const ss = SpreadsheetApp.openById(sheetId);
  let sh = ss.getSheetByName(p.sheet);
  if (!sh) {
    sh = ss.insertSheet(p.sheet);
    if (p.headers) { const h = JSON.parse(p.headers); sh.getRange(1,1,1,h.length).setValues([h]); }
  }
  return { ok: true };
}
function _proxySetFormulas(sheetId, p) {
  SpreadsheetApp.openById(sheetId).getRange(p.range).setFormulas(JSON.parse(p.formulas));
  return { ok: true };
}

// ── Groups: operate on ADMIN sheet (shared data) ──────────
// Convert column letter to number: A=1, B=2, ..., Z=26, AA=27
function _colToNum(col) {
  var n = 0;
  for (var i = 0; i < col.length; i++) n = n * 26 + col.charCodeAt(i) - 64;
  return n;
}

// Groups/Notifications/GE_* tabs live in the admin spreadsheet so
// all members can read/write them regardless of their own user sheet.

function _groupsGet(ss, p) {
  try {
    // p.range = 'SheetName!A2:L5000'
    var parts = p.range.split('!');
    var sheetName = parts[0];
    var rangePart = parts[1] || 'A:Z';
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return { values: [] };
    var lastRow = sh.getLastRow();
    if (lastRow < 1) return { values: [] };
    // Parse range: A2:L5000 or A:A or A:L
    var match = rangePart.match(/([A-Z]+)(\\d+):([A-Z]+)(\\d+)/);
    if (match) {
      var startRow = parseInt(match[2]);
      var endRow = Math.min(parseInt(match[4]), lastRow);
      if (startRow > endRow) return { values: [] };
      return { values: sh.getRange(match[1] + startRow + ':' + match[3] + endRow).getValues() };
    }
    // Column-only ranges (A:A, A:L)
    var colMatch = rangePart.match(/^([A-Z]+):([A-Z]+)$/);
    if (colMatch) {
      var c1 = _colToNum(colMatch[1]);
      var c2 = _colToNum(colMatch[2]);
      var numCols = c2 - c1 + 1;
      return { values: sh.getRange(1, c1, lastRow, numCols).getValues() };
    }
    // Fallback: full data
    return { values: sh.getRange(1, 1, lastRow, sh.getLastColumn()).getValues() };
  } catch(e) {
    return { values: [], _note: e.toString() };
  }
}

function _groupsAppend(ss, p) {
  var sh = ss.getSheetByName(p.sheet);
  if (!sh) return { error: 'Sheet nicht gefunden: ' + p.sheet };
  var rows = JSON.parse(p.values);
  var lastRow = sh.getLastRow();
  var startRow = lastRow < 1 ? 1 : lastRow + 1;
  sh.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
  return { ok: true };
}

function _groupsUpdate(ss, p) {
  // p.range = 'SheetName!K5' or 'SheetName!A5:L5'
  var parts = p.range.split('!');
  var sheetName = parts[0];
  var rangePart = parts[1];
  var sh = ss.getSheetByName(sheetName);
  if (!sh) return { error: 'Sheet nicht gefunden: ' + sheetName };
  sh.getRange(rangePart).setValues(JSON.parse(p.values));
  return { ok: true };
}

function _groupsEnsureSheet(ss, p) {
  var sh = ss.getSheetByName(p.sheet);
  if (!sh) {
    sh = ss.insertSheet(p.sheet);
    if (p.headers) {
      var h = JSON.parse(p.headers);
      sh.getRange(1, 1, 1, h.length).setValues([h]);
    }
  }
  return { ok: true };
}

function _groupsFindRow(ss, p) {
  var sh = ss.getSheetByName(p.sheet);
  if (!sh) return { row: null };
  var lastRow = sh.getLastRow();
  if (lastRow < 1) return { row: null };
  var data = sh.getRange(1, 1, lastRow, 1).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(p.id)) return { row: i + 1 };
  }
  return { row: null };
}

function _adminList(ss) {
  const rows = ss.getSheetByName('Users').getDataRange().getValues();
  const users = [];
  for (let i = 1; i < rows.length; i++)
    if (rows[i][0]) users.push({ username: rows[i][0], sheetUrl: rows[i][3], createdAt: rows[i][4], lastLogin: rows[i][6] || '', role: rows[i][5] || 'user' });
  return { users };
}
function _adminDelete(ss, p) {
  if (!p.target) return { error: 'target fehlt' };
  const sheet = ss.getSheetByName('Users');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++)
    if (String(rows[i][0]).toLowerCase() === p.target.toLowerCase()) { sheet.deleteRow(i + 1); return { ok: true }; }
  return { error: 'Benutzer nicht gefunden' };
}
function _adminResetPw(ss, p) {
  if (!p.target || !p.newHash) return { error: 'target + newHash fehlen' };
  const sheet = ss.getSheetByName('Users');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++)
    if (String(rows[i][0]).toLowerCase() === p.target.toLowerCase()) {
      sheet.getRange(i + 1, 2).setValue(p.newHash); return { ok: true };
    }
  return { error: 'Benutzer nicht gefunden' };
}

function _getAppConfig(ss) {
  var sh = ss.getSheetByName('AppConfig');
  if (!sh) return { config: {} };
  var rows = sh.getDataRange().getValues();
  var config = {};
  for (var i = 1; i < rows.length; i++)
    if (rows[i][0]) config[String(rows[i][0])] = { value: String(rows[i][1] || ''), updatedAt: String(rows[i][2] || ''), history: rows[i][3] ? JSON.parse(rows[i][3]) : [] };
  return { config };
}

function _adminSetAdminUrl(ss, p) {
  if (!p.newUrl) return { error: 'newUrl fehlt' };
  var sh = ss.getSheetByName('AppConfig');
  if (!sh) {
    sh = ss.insertSheet('AppConfig');
    sh.getRange(1, 1, 1, 4).setValues([['key', 'value', 'updatedAt', 'history']]);
  }
  var now = new Date().toISOString();
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === 'adminUrl') {
      var hist = rows[i][3] ? JSON.parse(rows[i][3]) : [];
      if (rows[i][1]) hist.unshift({ url: String(rows[i][1]), changedAt: String(rows[i][2] || now) });
      sh.getRange(i + 1, 1, 1, 4).setValues([['adminUrl', p.newUrl, now, JSON.stringify(hist.slice(0, 20))]]);
      return { ok: true };
    }
  }
  sh.appendRow(['adminUrl', p.newUrl, now, '[]']);
  return { ok: true };
}

function _adminListPending(ss) {
  var rows = ss.getSheetByName('Users').getDataRange().getValues();
  var pending = [];
  for (var i = 1; i < rows.length; i++)
    if (String(rows[i][5]) === 'pending' && rows[i][0])
      pending.push({ username: String(rows[i][0]), createdAt: String(rows[i][4] || '') });
  return { pending };
}

function _adminApprove(ss, p) {
  if (!p.target) return { error: 'target fehlt' };
  var sheet = ss.getSheetByName('Users');
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++)
    if (String(rows[i][0]).toLowerCase() === p.target.toLowerCase() && String(rows[i][5]) === 'pending') {
      sheet.getRange(i + 1, 6).setValue('user');
      return { ok: true };
    }
  return { error: 'Benutzer nicht gefunden oder nicht ausstehend' };
}

function _adminReject(ss, p) {
  if (!p.target) return { error: 'target fehlt' };
  var sheet = ss.getSheetByName('Users');
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++)
    if (String(rows[i][0]).toLowerCase() === p.target.toLowerCase() && String(rows[i][5]) === 'pending') {
      sheet.deleteRow(i + 1);
      return { ok: true };
    }
  return { error: 'Benutzer nicht gefunden oder nicht ausstehend' };
}

function _initUserSheet(ss) {
  const def = ss.getSheets()[0]; def.setName('Ausgaben');
  _hdr(def, ['ID','Datum','Beschreibung','Kategorie','Betrag','Notiz','Deleted','isFixkosten','GroupID','SplitData']);
  [['Einnahmen',['ID','Datum','Beschreibung','Kategorie','Betrag','Notiz','Deleted','isLohn','GroupID']],
   ['Daueraufträge',['ID','Was','Kategorie','Betrag','Intervall','Tag','Kommentar','Aktiv','nextDate','startDate','endDate','lastBooked']],
   ['Kategorien',['ID','Name','Typ','Farbe','Sortierung']],
   ['Einstellungen',['Schlüssel','Wert']],
   ['Aktien',['ID','Titel','ISIN','Ticker','Währung','Deleted']],
   ['Trades',['ID','AktieID','Typ','Datum','Anzahl','Preis','Währung','Courtage','Gesamt','Deleted']],
   ['Kurse',['Ticker','Kurs','Währung']],
   ['Portfolio-Verlauf',['Datum','Gesamt']],
  ].forEach(([name,headers])=>_hdr(ss.insertSheet(name),headers));
  const cats=[['k001','Zmittag','ausgabe','#FF6B35',1],['k002','Snack','ausgabe','#F7931E',2],
    ['k003','Ferien','ausgabe','#00D4AA',3],['k004','Poschte','ausgabe','#4ECDC4',4],
    ['k005','Znacht','ausgabe','#FF6B6B',5],['k006','Chleider','ausgabe','#E06C75',6],
    ['k007','Technik','ausgabe','#61AFEF',7],['k008','Mieti','ausgabe','#E5C07B',8],
    ['k009','Gsundheit','ausgabe','#56B6C2',9],['k010','Internet','ausgabe','#98C379',10],
    ['k011','Diverses','ausgabe','#888888',11],['k012','Lohn','einnahme','#C8F53C',12],
    ['k013','Twint','einnahme','#00C9A7',13],['k014','Diverses','einnahme','#AAAAAA',14]];
  ss.getSheetByName('Kategorien').getRange(2,1,cats.length,5).setValues(cats);
}
function _hdr(sh,headers){sh.getRange(1,1,1,headers.length).setValues([headers]);}

function _json(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}
`;
