// ═══════════════════════════════════════════════════════
// GRUPPEN-CODE.GS — Standalone Groups Backend
// Deploy this script against the dedicated Gruppen-Sheet.
// Bereitstellen → Web-App · Ausführen als: Ich · Zugriff: Jeder
//
// Gruppen-Sheet ID: 160KSTtvmpNlOPr9M5THyPfQ6YNUtro65k0bPuPd6Sqo
// ═══════════════════════════════════════════════════════

const GRUPPEN_SHEET_ID = '160KSTtvmpNlOPr9M5THyPfQ6YNUtro65k0bPuPd6Sqo';

// Index tab columns (A–K):
//   A=id, B=name, C=type, D=members(JSON), E=currency,
//   F=status, G=created, H=adminId, I=inviteCode,
//   J=closedDate, K=leftMembers(JSON)
//
// G_<id> entry tab columns (A–L):
//   A=id, B=authorId, C=authorName, D=date, E=what, F=cat,
//   G=amt, H=currency, I=splitData(JSON), J=deleted(1/blank),
//   K=editedAt, L=editedBy

function doGet(e) {
  const p = e.parameter || {};
  try { return _json(_handle(p)); }
  catch (err) { return _json({ error: err.toString() }); }
}

function _handle(p) {
  const ss = SpreadsheetApp.openById(GRUPPEN_SHEET_ID);
  const userId = (p.user || '').trim();

  switch (p.action) {
    case 'groups_setup':          return _setup(ss);
    case 'groups_getIndex':       return _getIndex(ss, userId);
    case 'groups_createGroup':    return _createGroup(ss, p, userId);
    case 'groups_updateIndex':    return _updateIndex(ss, p, userId);
    case 'groups_getEntries':     return _getEntries(ss, p, userId);
    case 'groups_appendEntry':    return _appendEntry(ss, p, userId);
    case 'groups_updateEntry':    return _updateEntry(ss, p, userId);
    case 'groups_joinGroup':      return _joinGroup(ss, p, userId);
    case 'groups_getNotifs':      return _getNotifs(ss, userId);
    case 'groups_appendNotifs':   return _appendNotifs(ss, p);
    case 'groups_markNotifsRead': return _markNotifsRead(ss, userId);
    case 'groups_cleanup':        return _cleanup(ss);
    default: return { error: 'Unbekannte Aktion: ' + (p.action || '(keine)') };
  }
}

// ── Setup: ensure Index + Notifications tabs exist ──────────────
function _setup(ss) {
  if (!ss.getSheetByName('Index')) {
    const sh = ss.insertSheet('Index');
    sh.getRange(1, 1, 1, 11).setValues([[
      'id', 'name', 'type', 'members', 'currency',
      'status', 'created', 'adminId', 'inviteCode',
      'closedDate', 'leftMembers'
    ]]);
    sh.setFrozenRows(1);
  }
  if (!ss.getSheetByName('Notifications')) {
    const sh = ss.insertSheet('Notifications');
    sh.getRange(1, 1, 1, 3).setValues([['recipient', 'notifJSON', 'read']]);
    sh.setFrozenRows(1);
  }
  return { ok: true };
}

// ── Index: read groups where userId is a member ─────────────────
function _getIndex(ss, userId) {
  const sh = ss.getSheetByName('Index');
  if (!sh) return { rows: [] };
  const vals = sh.getDataRange().getValues();
  const rows = vals.slice(1).filter(r => {
    if (!r[0] || r[5] === 'deleted') return false;
    if (!userId) return false;
    try { return JSON.parse(r[3] || '[]').includes(userId); }
    catch (e) { return false; }
  });
  return { rows };
}

// ── Create group: write Index row + create G_<id> tab ───────────
function _createGroup(ss, p, userId) {
  if (!userId) return { error: 'Benutzer erforderlich' };
  const id = p.id, name = p.name;
  if (!id || !name) return { error: 'id und name erforderlich' };
  let members;
  try { members = JSON.parse(p.members || '[]'); }
  catch (e) { members = [userId]; }
  if (!members.includes(userId)) return { error: 'Admin muss Mitglied sein' };
  _setup(ss);
  const idxSh = ss.getSheetByName('Index');
  // Idempotent: skip if already exists
  const existing = idxSh.getDataRange().getValues().slice(1).find(r => r[0] === id);
  if (existing) return { ok: true };
  idxSh.appendRow([
    id, name, p.type || 'event',
    JSON.stringify(members),
    p.currency || 'CHF',
    'active',
    p.created || new Date().toISOString().slice(0, 10),
    userId,
    p.inviteCode || '',
    '',
    '[]'
  ]);
  const tabName = 'G_' + id;
  if (!ss.getSheetByName(tabName)) {
    const sh = ss.insertSheet(tabName);
    sh.getRange(1, 1, 1, 12).setValues([[
      'id', 'authorId', 'authorName', 'date', 'what', 'cat',
      'amt', 'currency', 'splitData', 'deleted', 'editedAt', 'editedBy'
    ]]);
    sh.setFrozenRows(1);
  }
  return { ok: true };
}

// ── Update Index row ────────────────────────────────────────────
function _updateIndex(ss, p, userId) {
  if (!userId) return { error: 'Benutzer erforderlich' };
  const groupId = p.groupId;
  if (!groupId) return { error: 'groupId erforderlich' };
  const sh = ss.getSheetByName('Index');
  if (!sh) return { error: 'Index nicht gefunden' };
  const vals = sh.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (vals[i][0] !== groupId) continue;
    let members;
    try { members = JSON.parse(vals[i][3] || '[]'); }
    catch (e) { members = []; }
    if (!members.includes(userId)) return { error: 'Kein Mitglied dieser Gruppe' };
    const upd = JSON.parse(p.updates || '{}');
    if (upd.name        !== undefined) vals[i][1]  = upd.name;
    if (upd.type        !== undefined) vals[i][2]  = upd.type;
    if (upd.members     !== undefined) vals[i][3]  = JSON.stringify(upd.members);
    if (upd.currency    !== undefined) vals[i][4]  = upd.currency;
    if (upd.status      !== undefined) vals[i][5]  = upd.status;
    if (upd.adminId     !== undefined) vals[i][7]  = upd.adminId;
    if (upd.inviteCode  !== undefined) vals[i][8]  = upd.inviteCode;
    if (upd.closedDate  !== undefined) vals[i][9]  = upd.closedDate;
    if (upd.leftMembers !== undefined) vals[i][10] = JSON.stringify(upd.leftMembers);
    sh.getRange(i + 1, 1, 1, 11).setValues([vals[i].slice(0, 11)]);
    return { ok: true };
  }
  return { error: 'Gruppe nicht gefunden' };
}

// ── Get group entries (non-deleted) ─────────────────────────────
function _getEntries(ss, p, userId) {
  if (!userId) return { error: 'Benutzer erforderlich' };
  const groupId = p.groupId;
  if (!groupId) return { error: 'groupId erforderlich' };
  if (!_isMember(ss, groupId, userId)) return { error: 'Kein Mitglied dieser Gruppe' };
  const sh = ss.getSheetByName('G_' + groupId);
  if (!sh) return { rows: [] };
  const vals = sh.getDataRange().getValues();
  return { rows: vals.slice(1).filter(r => r[0] && String(r[9]) !== '1') };
}

// ── Append entry ────────────────────────────────────────────────
function _appendEntry(ss, p, userId) {
  if (!userId) return { error: 'Benutzer erforderlich' };
  const groupId = p.groupId;
  if (!groupId) return { error: 'groupId erforderlich' };
  if (!_isMember(ss, groupId, userId)) return { error: 'Kein Mitglied dieser Gruppe' };
  const tabName = 'G_' + groupId;
  let sh = ss.getSheetByName(tabName);
  if (!sh) {
    sh = ss.insertSheet(tabName);
    sh.getRange(1, 1, 1, 12).setValues([[
      'id', 'authorId', 'authorName', 'date', 'what', 'cat',
      'amt', 'currency', 'splitData', 'deleted', 'editedAt', 'editedBy'
    ]]);
    sh.setFrozenRows(1);
  }
  sh.appendRow(JSON.parse(p.row || '[]'));
  return { ok: true };
}

// ── Update entry ────────────────────────────────────────────────
function _updateEntry(ss, p, userId) {
  if (!userId) return { error: 'Benutzer erforderlich' };
  const groupId = p.groupId, entryId = p.entryId;
  if (!groupId || !entryId) return { error: 'groupId und entryId erforderlich' };
  if (!_isMember(ss, groupId, userId)) return { error: 'Kein Mitglied dieser Gruppe' };
  const sh = ss.getSheetByName('G_' + groupId);
  if (!sh) return { error: 'Gruppen-Tab nicht gefunden' };
  const vals = sh.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) !== String(entryId)) continue;
    const row = JSON.parse(p.row || '[]');
    sh.getRange(i + 1, 1, 1, row.length).setValues([row]);
    return { ok: true };
  }
  return { error: 'Eintrag nicht gefunden' };
}

// ── Join group via invite code ───────────────────────────────────
function _joinGroup(ss, p, userId) {
  if (!userId) return { error: 'Benutzer erforderlich' };
  const groupId = p.groupId, inviteCode = p.inviteCode;
  if (!groupId || !inviteCode) return { error: 'groupId und inviteCode erforderlich' };
  const sh = ss.getSheetByName('Index');
  if (!sh) return { error: 'Index nicht gefunden' };
  const vals = sh.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (vals[i][0] !== groupId) continue;
    if (vals[i][8] !== inviteCode) return { error: 'Ungültiger Einladungscode' };
    const status = vals[i][5];
    if (status === 'deleted')  return { error: 'Gruppe wurde gelöscht' };
    if (status === 'archived') return { error: 'Diese Gruppe ist archiviert' };
    let members;
    try { members = JSON.parse(vals[i][3] || '[]'); }
    catch (e) { members = []; }
    if (members.includes(userId)) return { ok: true, alreadyMember: true };
    members.push(userId);
    sh.getRange(i + 1, 4).setValue(JSON.stringify(members));
    return { ok: true };
  }
  return { error: 'Gruppe nicht gefunden' };
}

// ── Notifications ────────────────────────────────────────────────
function _getNotifs(ss, userId) {
  if (!userId) return { rows: [] };
  const sh = ss.getSheetByName('Notifications');
  if (!sh) return { rows: [] };
  const vals = sh.getDataRange().getValues();
  return { rows: vals.slice(1).filter(r => r[0] === userId && String(r[2]) !== '1') };
}

function _appendNotifs(ss, p) {
  let rows;
  try { rows = JSON.parse(p.rows || '[]'); }
  catch (e) { return { error: 'rows parse error' }; }
  if (!rows.length) return { ok: true };
  let sh = ss.getSheetByName('Notifications');
  if (!sh) {
    sh = ss.insertSheet('Notifications');
    sh.getRange(1, 1, 1, 3).setValues([['recipient', 'notifJSON', 'read']]);
    sh.setFrozenRows(1);
  }
  rows.forEach(row => sh.appendRow(row));
  return { ok: true };
}

function _markNotifsRead(ss, userId) {
  const sh = ss.getSheetByName('Notifications');
  if (!sh) return { ok: true };
  const vals = sh.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (vals[i][0] === userId && String(vals[i][2]) !== '1') {
      sh.getRange(i + 1, 3).setValue('1');
    }
  }
  return { ok: true };
}

// ── Cleanup: delete tabs + mark 'deleted' for groups archived >14d ──
function _cleanup(ss) {
  const sh = ss.getSheetByName('Index');
  if (!sh) return { ok: true, deleted: 0 };
  const vals = sh.getDataRange().getValues();
  const now = new Date();
  let deleted = 0;
  for (let i = 1; i < vals.length; i++) {
    if (vals[i][5] !== 'archived' || !vals[i][9]) continue;
    const closed = new Date(vals[i][9]);
    if (isNaN(closed.getTime())) continue;
    const diffDays = (now - closed) / 86400000;
    if (diffDays < 14) continue;
    const tab = ss.getSheetByName('G_' + vals[i][0]);
    if (tab) ss.deleteSheet(tab);
    sh.getRange(i + 1, 6).setValue('deleted');
    deleted++;
  }
  return { ok: true, deleted };
}

// ── Helper ───────────────────────────────────────────────────────
function _isMember(ss, groupId, userId) {
  const sh = ss.getSheetByName('Index');
  if (!sh) return false;
  const vals = sh.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (vals[i][0] !== groupId) continue;
    try { return JSON.parse(vals[i][3] || '[]').includes(userId); }
    catch (e) { return false; }
  }
  return false;
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
