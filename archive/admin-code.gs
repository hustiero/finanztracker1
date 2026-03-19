// ═══════════════════════════════════════════════════
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
  if (p.action === 'signup') return _signup(ss, p);
  if (p.action === 'login')  return _login(ss, p);
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
    return { prices: results };
  }
  if (p.action === 'change_pw')    return _changePw(ss, session.username, p);
  if (user.role !== 'admin') return { error: 'Keine Berechtigung.' };
  if (p.action === 'admin_list')     return _adminList(ss);
  if (p.action === 'admin_delete')   return _adminDelete(ss, p);
  if (p.action === 'admin_reset_pw') return _adminResetPw(ss, p);
  return { error: 'Unbekannte Aktion: ' + (p.action || '(keine)') };
}

// ─── Auth ────────────────────────────────────────────────────

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
  sheet.appendRow([user, p.hash, newSs.getId(), newSs.getUrl(), new Date().toISOString(), 'user', '']);
  const token = _createSession(ss, user);
  return { ok: true, token, username: user, role: 'user' };
}

function _login(ss, p) {
  if (!p.user || !p.hash) return { error: 'Benutzername und Passwort erforderlich.' };
  const user = p.user.trim().toLowerCase();
  const sheet = ss.getSheetByName('Users');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).toLowerCase() === user && rows[i][1] === p.hash) {
      sheet.getRange(i + 1, 7).setValue(new Date().toISOString());
      const token = _createSession(ss, user);
      return { ok: true, token, username: user, role: rows[i][5] || 'user' };
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

// ─── Sessions ────────────────────────────────────────────────

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

// ─── Proxy (User-Sheet Zugriff) ──────────────────────────────

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

// ─── Admin ───────────────────────────────────────────────────

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

// ─── User-Sheet Initialisierung ──────────────────────────────

function _initUserSheet(ss) {
  const def = ss.getSheets()[0]; def.setName('Ausgaben');
  _hdr(def, ['ID','Datum','Beschreibung','Kategorie','Betrag','Notiz','Deleted','isFixkosten']);
  [['Einnahmen',['ID','Datum','Beschreibung','Kategorie','Betrag','Notiz','Deleted','isLohn']],
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
