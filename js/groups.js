// ═══════════════════════════════════════════════════════════════
// MODULE: GROUPS — API, CRUD, Invitations, Notifications, Admin
// Centralises ALL group-related logic. Loaded before render.js.
// ═══════════════════════════════════════════════════════════════

// ── 1. Groups API layer (targets Admin-Sheet when available) ──

/**
 * Determine the correct base URL for group operations.
 * Account mode → CFG.adminUrl (central admin sheet)
 * Script-URL mode → CFG.scriptUrl (user sheet, fallback)
 */
function _groupsBaseUrl(){
  return (CFG.sessionToken && CFG.adminUrl) ? CFG.adminUrl : (CFG.scriptUrl || CFG.adminUrl || '');
}

/** Generic API call routed to the groups backend. */
async function groupsApiCall(params){
  const isAccountMode = !!(CFG.sessionToken && CFG.adminUrl);
  const baseUrl = _groupsBaseUrl();
  if(!baseUrl){
    // Script-URL-Modus ohne Admin-Sheet: Gruppen nicht verfügbar
    throw new Error('Gruppen sind nur im Account-Modus verfügbar.');
  }
  const allParams = isAccountMode ? {...params, token: CFG.sessionToken} : params;
  const url = baseUrl + '?' + new URLSearchParams(allParams).toString();
  const r = await fetch(url);
  if(!r.ok) throw new Error('HTTP '+r.status);
  const data = await r.json();
  if(data.error){
    if((data.error||'').includes('Sitzung abgelaufen')){
      CFG.sessionToken=''; CFG.authRole=''; cfgSave();
      toast('Sitzung abgelaufen – bitte neu anmelden','err');
      setTimeout(()=>location.reload(), 2500);
    }
    throw new Error(data.error);
  }
  return data;
}

function groupsApiGet(range){
  return groupsApiCall({action:'groupsGet', range});
}
function groupsApiAppend(sheet, values){
  return groupsApiCall({action:'groupsAppend', sheet, values: JSON.stringify(values)});
}
function groupsApiUpdate(range, values){
  return groupsApiCall({action:'groupsUpdate', range, values: JSON.stringify(values)});
}
async function groupsApiFindRow(sheet, id){
  const res = await groupsApiGet(sheet+'!A:A');
  const rows = res.values||[];
  for(let i=0;i<rows.length;i++){
    if(String(rows[i][0])===String(id)) return i+1;
  }
  return null;
}

// ── 2. Helper: identity ──────────────────────────────────────

/**
 * Canonical user identifier for all permission checks & data keys.
 * Always returns CFG.authUser (the login username in account mode).
 * Falls back to CFG.userName only for display-only contexts.
 */
function _myGroupId(){
  return CFG.authUser || CFG.userName || '';
}

/** Display name for UI rendering (greeting, author labels). */
function _myGroupName(){
  return CFG.userName || CFG.authUser || 'Ich';
}

/** Is the current user admin of this group? Uses authorId for matching. */
function isGroupAdmin(group){
  if(!group) return false;
  if(!group.adminId) return true; // legacy groups without adminId
  const id = _myGroupId();
  const name = _myGroupName();
  return group.adminId === id
      || group.adminId === name
      || group.adminId === CFG.authUser;
}

// ── 3. Invite code generation ────────────────────────────────

function _genInviteCode(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghkmnpqrstuvwxyz23456789';
  let s='';for(let i=0;i<8;i++) s+=chars[Math.floor(Math.random()*chars.length)];
  return s;
}

// ── 4. Sheet row serialisation ───────────────────────────────
// Groups sheet: A=id, B=name, C=type, D=members(JSON), E=currency,
//               F=status, G=created, H=adminId, I=inviteCode, J=sharedSheetUrl

function _groupToRow(g){
  return [g.id, g.name, g.type, JSON.stringify(g.members),
          g.currency, g.status, g.created,
          g.adminId||'', g.inviteCode||'', g.sharedSheetUrl||''];
}

function _rowToGroup(r){
  return {
    id:r[0], name:r[1]||'', type:r[2]||'event',
    members: r[3] ? JSON.parse(r[3]) : [_myGroupName()],
    currency: r[4]||CFG.currency||'CHF',
    status: r[5]||'active', created: r[6]||'',
    adminId: r[7]||'', inviteCode: r[8]||'',
    sharedSheetUrl: r[9]||''
  };
}

// ── 5. Load groups from backend ──────────────────────────────

// Session-level flag — avoid 2 redundant API calls on every loadGroups()
let _groupsSheetsEnsured = false;

async function ensureGroupsSheets(){
  if(CFG.demo || _groupsSheetsEnsured) return;
  try{
    await groupsApiCall({
      action:'groupsEnsureSheet',
      sheet:'Groups',
      headers:JSON.stringify(['id','name','type','members','currency','status','created','adminId','inviteCode','sharedSheetUrl'])
    });
    await groupsApiCall({
      action:'groupsEnsureSheet',
      sheet:'Notifications',
      headers:JSON.stringify(['recipient','notifJSON','read'])
    });
  }catch(e){
    console.warn('ensureGroupsSheets:', e.message);
  }
  // Mark done even on error — we'll get real errors on the actual read/write
  _groupsSheetsEnsured = true;
}

async function loadGroups(){
  await ensureGroupsSheets();
  try{
    const res = await groupsApiGet('Groups!A2:J200');
    const myId = _myGroupId();
    const myName = _myGroupName();
    DATA.groups = (res.values||[])
      .filter(r=>r[0] && r[5]!=='deleted')
      .map(_rowToGroup)
      .filter(g => g.members.includes(myId) || g.members.includes(myName));
  }catch(e){
    if(!DATA.groups) DATA.groups = [];
    if(e.message && e.message.includes('Account-Modus')){
      console.info('Groups: Script-URL-Modus, übersprungen.');
    }
    // sonst silent
  }
}

// ── 6. CRUD ──────────────────────────────────────────────────

async function saveGroup(name, type, members, currency){
  const id = genId('G');
  const created = today();
  const adminId = _myGroupId();
  const inviteCode = _genInviteCode();
  const group = {id,name,type,members,currency,status:'active',created,adminId,inviteCode,sharedSheetUrl:''};
  DATA.groups.push(group);
  if(!CFG.demo){
    setSyncStatus('syncing');
    try{
      await groupsApiAppend('Groups',[_groupToRow(group)]);
      setSyncStatus('online');
    }catch(e){
      setSyncStatus('error');
      toast('Gruppe konnte nicht gespeichert werden: '+e.message,'err');
      // Revert local state to avoid ghost group
      DATA.groups = DATA.groups.filter(x=>x.id!==id);
      return null;
    }
  }
  dataCacheSave();
  markDirty('groups');
  return group;
}

async function updateGroup(id, updates){
  const g = DATA.groups.find(x=>x.id===id);
  if(!g) return;
  Object.assign(g, updates);
  if(!CFG.demo){
    setSyncStatus('syncing');
    try{
      const row = await groupsApiFindRow('Groups', id);
      if(row) await groupsApiUpdate(`Groups!A${row}:J${row}`, [_groupToRow(g)]);
      setSyncStatus('online');
    }catch(e){ setSyncStatus('error'); }
  }
  dataCacheSave();
  markDirty('groups');
}

async function deleteGroup(id){
  const g = DATA.groups.find(x=>x.id===id);
  if(!g) return;
  if(!isGroupAdmin(g)){ toast('Nur der Admin kann die Gruppe löschen','err'); return; }
  if(!confirm('Gruppe löschen? Zugehörige Buchungen behalten ihre Werte, verlieren aber die Gruppenzuordnung.')) return;
  DATA.groups = DATA.groups.filter(x=>x.id!==id);
  DATA.expenses.forEach(e=>{ if(e.groupId===id){ delete e.groupId; delete e.splitData; } });
  DATA.incomes.forEach(e=>{ if(e.groupId===id) delete e.groupId; });
  if(!CFG.demo){
    setSyncStatus('syncing');
    try{
      const row = await groupsApiFindRow('Groups', id);
      if(row) await groupsApiUpdate(`Groups!F${row}`, [['deleted']]);
      setSyncStatus('online');
    }catch(e){ setSyncStatus('error'); }
  }
  dataCacheSave();
  markDirty('groups');
  renderGroups();
}

async function archiveGroup(id){
  const g = DATA.groups.find(x=>x.id===id);
  if(!g) return;
  if(!isGroupAdmin(g)){ toast('Nur der Admin kann die Gruppe archivieren','err'); return; }
  if(!confirm('Gruppe archivieren? Sie ist danach unter "Archiv" sichtbar.')) return;
  await updateGroup(id, {status:'archived'});
  toast('✓ Gruppe archiviert','ok');
  closeGroupDetail();
  renderGroups();
}

// ── 7. Invite link — generate & join ─────────────────────────

function generateInviteLink(groupId){
  const g = DATA.groups.find(x=>x.id===groupId);
  if(!g||!g.inviteCode) return '';
  const base = window.location.origin + window.location.pathname;
  const backendUrl = _groupsBaseUrl();
  const params = new URLSearchParams({joinGroup:g.id, gc:g.inviteCode});
  if(backendUrl) params.set('url', backendUrl);
  return base + '?' + params.toString();
}

function copyGroupInviteLink(groupId){
  const link = generateInviteLink(groupId);
  if(!link){ toast('Kein Einladungscode vorhanden','err'); return; }
  navigator.clipboard.writeText(link).then(()=>{
    toast('✓ Einladungslink kopiert','ok');
  }).catch(()=>{
    prompt('Einladungslink:', link);
  });
}

/**
 * Join a group via invite code.
 * Fetches the group DIRECTLY from the backend (admin sheet) to validate,
 * does NOT rely on local DATA.groups — the joiner may not have loaded it yet.
 */
async function joinGroupByInvite(groupId, inviteCode, backendUrl){
  // If a backend URL was provided (from the invite link), use it temporarily.
  // We only apply it when the user has no backend configured yet, or when it
  // matches the existing URL — never silently overwrite an existing URL.
  const origAdminUrl = CFG.adminUrl;
  const origScriptUrl = CFG.scriptUrl;
  let urlChanged = false;
  if(backendUrl && backendUrl.includes('script.google.com')){
    if(CFG.sessionToken) CFG.adminUrl = backendUrl;
    else CFG.scriptUrl = backendUrl;
    urlChanged = true;
  }
  // Invalidate ensureGroupsSheets cache if we switched to a new backend
  if(urlChanged) _groupsSheetsEnsured = false;

  let joinedOk = false;
  try{
    // Ensure sheets exist on this backend before reading
    await ensureGroupsSheets();

    const res = await groupsApiGet('Groups!A2:J200').catch(()=>({values:[]}));
    const rows = (res.values||[]).filter(r=>r[0]);
    const row = rows.find(r=>r[0]===groupId);
    if(!row){ toast('Gruppe nicht gefunden','err'); return false; }

    const g = _rowToGroup(row);
    if(g.inviteCode !== inviteCode){ toast('Ungültiger Einladungscode','err'); return false; }
    if(g.status === 'deleted'){ toast('Gruppe wurde gelöscht','err'); return false; }
    if(g.status === 'archived'){ toast('Diese Gruppe ist archiviert','err'); return false; }

    const myId = _myGroupId();
    const myName = _myGroupName();
    if(g.members.includes(myId) || g.members.includes(myName)){
      toast('Du bist bereits Mitglied','info');
      if(!DATA.groups.find(x=>x.id===groupId)) DATA.groups.push(g);
      joinedOk = true;
      return true;
    }

    g.members.push(myId);
    const sheetRow = rows.indexOf(row) + 2;
    await groupsApiUpdate(`Groups!D${sheetRow}`, [[JSON.stringify(g.members)]]);

    const existing = DATA.groups.find(x=>x.id===groupId);
    if(existing) Object.assign(existing, g);
    else DATA.groups.push(g);

    dataCacheSave();
    toast('✓ Gruppe beigetreten: '+g.name,'ok');
    markDirty('groups');
    joinedOk = true;
    return true;
  }catch(e){
    toast('Fehler beim Beitreten: '+e.message,'err');
    return false;
  }finally{
    // Restore original URLs on failure; keep new URL on success
    if(!joinedOk){
      CFG.adminUrl  = origAdminUrl;
      CFG.scriptUrl = origScriptUrl;
      _groupsSheetsEnsured = false;
    }
    cfgSave();
  }
}

// ── 8. Member management ─────────────────────────────────────

async function removeGroupMember(groupId, memberName){
  const g = DATA.groups.find(x=>x.id===groupId);
  if(!g) return;
  if(!isGroupAdmin(g)){ toast('Nur der Admin kann Mitglieder entfernen','err'); return; }
  if(memberName===g.adminId){ toast('Admin kann nicht entfernt werden','err'); return; }
  if(!confirm(memberName+' aus der Gruppe entfernen?')) return;
  g.members = g.members.filter(m=>m!==memberName);
  await updateGroup(groupId, {members:g.members});
  toast('✓ '+memberName+' entfernt','ok');
  openGroupDetail(groupId);
}

/** Non-admin members can leave a group voluntarily. */
async function leaveGroup(groupId){
  const g = DATA.groups.find(x=>x.id===groupId);
  if(!g) return;
  if(isGroupAdmin(g)){ toast('Admin kann die Gruppe nicht verlassen — erst Admin-Rolle übertragen oder Gruppe löschen','err'); return; }
  if(!confirm('Gruppe "'+g.name+'" verlassen?')) return;
  const me = _myGroupId();
  const myName = _myGroupName();
  g.members = g.members.filter(m=>m!==me && m!==myName);
  if(!CFG.demo){
    setSyncStatus('syncing');
    try{
      const row = await groupsApiFindRow('Groups', groupId);
      if(row) await groupsApiUpdate(`Groups!D${row}`, [[JSON.stringify(g.members)]]);
      setSyncStatus('online');
    }catch(e){ setSyncStatus('error'); toast('Sync-Fehler: '+e.message,'err'); return; }
  }
  DATA.groups = DATA.groups.filter(x=>x.id!==groupId);
  dataCacheSave();
  toast('✓ Gruppe verlassen','ok');
  closeGroupDetail();
  markDirty('groups');
}

async function regenerateInviteCode(groupId){
  const g = DATA.groups.find(x=>x.id===groupId);
  if(!g) return;
  if(!isGroupAdmin(g)){ toast('Nur der Admin kann den Code erneuern','err'); return; }
  g.inviteCode = _genInviteCode();
  await updateGroup(groupId, {inviteCode:g.inviteCode});
  toast('✓ Neuer Einladungscode generiert','ok');
  openGroupDetail(groupId);
}

// ── 9. Split form reading with validation ────────────────────

function _readSplitForm(totalAmt, group){
  const splitMode = document.getElementById('f-split-mode')?.value||'equal';
  const payerId = document.getElementById('f-split-payer')?.value||_myGroupId();
  const participants = {};

  if(splitMode==='equal'){
    const count = group.members.length;
    const share = Math.round((totalAmt/count)*100)/100;
    group.members.forEach(m=>{ participants[m] = share; });
    // Fix rounding — assign remainder to the payer, not first member
    const diff = totalAmt - share*count;
    if(Math.abs(diff)>0.001){
      const roundTarget = participants[payerId]!==undefined ? payerId : group.members[0];
      participants[roundTarget] = Math.round((share+diff)*100)/100;
    }
  } else {
    // Custom shares
    group.members.forEach(m=>{
      const inp = document.getElementById('f-split-share-'+CSS.escape(m));
      participants[m] = inp ? parseFloat(inp.value)||0 : 0;
    });
    // Validate: sum of shares must match total
    const sum = Object.values(participants).reduce((a,b)=>a+b,0);
    if(Math.abs(sum-totalAmt)>0.02){
      toast('Summe der Anteile ('+fmtAmt(sum)+') stimmt nicht mit Gesamtbetrag ('+fmtAmt(totalAmt)+') überein','err');
      return null;
    }
  }
  return {totalAmount:totalAmt, payerId, participants};
}

function _hideSplitSection(){
  const sec = document.getElementById('f-split-section');
  if(!sec) return;
  sec.style.display='none';
  // Clear all custom share inputs to avoid stale values on next open
  sec.querySelectorAll('input[type="number"]').forEach(i=>{ i.value=''; });
  const modeEl = document.getElementById('f-split-mode');
  if(modeEl) modeEl.value='equal';
}

// ── 10. Settle up ────────────────────────────────────────────
// Settlements are stored ONLY in GroupEntries (admin sheet),
// NOT in DATA.expenses — so they don't pollute personal stats.

async function settleUp(groupId, from, to, amount){
  const id    = genId('S');
  const date  = today();
  const what  = 'Ausgleich: '+from+' → '+to;
  const myId  = _myGroupId();
  const myName = _myGroupName();
  const splitData = {
    totalAmount: amount,
    payerId: from,
    participants: {[to]: amount},
    isSettlement: true
  };

  const entry = {
    id, groupId, authorId: myId, authorName: myName,
    date, what, cat: 'Transfer', amt: amount,
    currency: CFG.currency||'CHF',
    splitData, isMine: true, editedAt: new Date().toISOString(),
    _type: 'groupEntry'
  };

  if(!CFG.demo){
    setSyncStatus('syncing');
    try{
      const tab = _groupEntryTab(groupId);
      await _ensureGroupEntryTab(groupId);
      const row = [
        id, groupId, myId, myName, date, what, 'Transfer',
        amount, CFG.currency||'CHF',
        JSON.stringify(splitData), '', entry.editedAt
      ];
      await groupsApiCall({
        action:'groupsAppend',
        sheet: tab,
        values: JSON.stringify([row])
      });
      setSyncStatus('online');
    }catch(e){
      setSyncStatus('error');
      toast('Sync-Fehler: '+e.message,'err');
      return;
    }
  }

  if(!DATA.groupEntries) DATA.groupEntries=[];
  DATA.groupEntries.push(entry);

  dataCacheSave();
  toast('Ausgleich gebucht','ok');

  const group = DATA.groups.find(g=>g.id===groupId);
  if(group) pushGroupNotification(group, entry);

  markDirty('groups','verlauf');
  if(typeof currentGroupId!=='undefined' && currentGroupId===groupId){
    openGroupDetail(groupId);
  }
}

// ── 11. Group notifications ──────────────────────────────────
// Admin-Sheet tab "Notifications": A=recipientUser, B=notifJSON, C=read(0/1)

/**
 * Push a group_activity notification to all other members of a group.
 * Writes one row per recipient into the Notifications tab.
 */
async function pushGroupNotification(group, entry){
  if(CFG.demo || !group || !group.members) return;
  const myId = _myGroupId();
  const myName = _myGroupName();
  const recipients = group.members.filter(m=>m!==myId && m!==myName);
  if(!recipients.length) return;

  const notif = {
    id: genId('N'),
    type: 'group_activity',
    groupId: group.id,
    groupName: group.name,
    actorName: _myGroupName(),
    entryWhat: entry.what||'',
    entryAmt: entry.amt||0,
    entryDate: entry.date||today(),
    read: false,
    ts: Date.now()
  };

  const rows = recipients.map(r=>[r, JSON.stringify(notif), '0']);
  try{
    await groupsApiAppend('Notifications', rows);
  }catch(e){
    // Notifications tab may not exist — silently ignore
    console.warn('pushGroupNotification failed:', e.message);
  }
}

/**
 * Load unread group notifications for the current user from the admin sheet.
 * Merges into CFG.notifications without duplicates.
 */
async function loadGroupNotifications(){
  if(CFG.demo) return;
  try{
    const res = await groupsApiGet('Notifications!A2:C5000').catch(()=>({values:[]}));
    const rows = res.values||[];
    const myId = _myGroupId();
    const myName = _myGroupName();
    if(!CFG.notifications) CFG.notifications = [];
    const existingIds = new Set(CFG.notifications.map(n=>n.id));

    for(const row of rows){
      if(row[0]!==myId && row[0]!==myName) continue; // not for us
      if(row[2]==='1') continue; // already read
      try{
        const n = JSON.parse(row[1]);
        if(!n.id || existingIds.has(n.id)) continue;
        // Add notification fields expected by the notif renderer
        n.title = n.actorName + ' — ' + n.groupName;
        n.body = fmtAmt(n.entryAmt) + ' ' + (CFG.currency||'CHF') + ' · ' + n.entryWhat;
        n.date = n.entryDate || today();
        n.dismissed = false;
        CFG.notifications.push(n);
        existingIds.add(n.id);
      }catch(e){}
    }
    cfgSave();
    if(typeof updateNotifBadge === 'function') updateNotifBadge();
  }catch(e){
    console.warn('loadGroupNotifications failed:', e.message);
  }
}

/**
 * Mark all group notifications for current user as read in the admin sheet.
 */
async function markGroupNotifsRead(){
  if(CFG.demo) return;
  try{
    const res = await groupsApiGet('Notifications!A2:C5000').catch(()=>({values:[]}));
    const rows = res.values||[];
    const myId = _myGroupId();
    const myName = _myGroupName();

    const updatePromises = [];
    for(let i=0;i<rows.length;i++){
      if((rows[i][0]===myId || rows[i][0]===myName) && rows[i][2]!=='1'){
        const sheetRow = i+2;
        updatePromises.push(
          groupsApiUpdate(`Notifications!C${sheetRow}`, [['1']])
            .catch(e=>console.warn('markRead row', sheetRow, e.message))
        );
      }
    }
    if(updatePromises.length) await Promise.all(updatePromises);
  }catch(e){
    console.warn('markGroupNotifsRead failed:', e.message);
  }
}

// ── 12. GroupEntries — per-group tabs, load & save & CRUD ────

function _safeParseJSON(s){
  try{ return JSON.parse(s); }catch(e){ return null; }
}

/** Tab name for a group's entries. */
function _groupEntryTab(groupId){
  return 'GE_' + groupId;
}

/** Per-group tab headers (12 columns). */
const _GE_HEADERS = ['id','groupId','authorId','authorName','date','what','cat','amt','currency','splitData','deleted','editedAt'];

/** Ensure the per-group entries tab exists. */
async function _ensureGroupEntryTab(groupId){
  return groupsApiCall({
    action:'groupsEnsureSheet',
    sheet: _groupEntryTab(groupId),
    headers: JSON.stringify(_GE_HEADERS)
  });
}

/** Parse a row from a per-group tab into a groupEntry object. */
function _rowToGroupEntry(r, myId){
  const group = DATA.groups.find(g=>g.id===r[1]);
  return {
    id:         r[0],
    groupId:    r[1],
    authorId:   r[2]||'',
    authorName: r[3]||'',
    date:       r[4]||'',
    what:       r[5]||'',
    cat:        r[6]||'',
    amt:        parseFloat(r[7])||0,
    currency:   r[8]||(group&&group.currency)||'CHF',
    splitData:  r[9] ? _safeParseJSON(r[9]) : null,
    isMine:     (r[2]||'')=== myId,
    editedAt:   r[11]||'',
    _type:      'groupEntry'
  };
}

/** Parse a row from the LEGACY GroupEntries tab (old 10-column format). */
function _legacyRowToGroupEntry(r, myId, myName){
  const group = DATA.groups.find(g=>g.id===r[1]);
  return {
    id:         r[0],
    groupId:    r[1],
    authorId:   r[2]||'',          // legacy: authorName was in col C
    authorName: r[2]||'',
    date:       r[3]||'',
    what:       r[4]||'',
    cat:        r[5]||'',
    amt:        parseFloat(r[6])||0,
    currency:   r[7]||(group&&group.currency)||'CHF',
    splitData:  r[8] ? _safeParseJSON(r[8]) : null,
    isMine:     r[2]===myId || r[2]===myName || r[2]==='Ich',
    editedAt:   '',
    _type:      'groupEntry'
  };
}

/**
 * Load group entries — per-group tabs first, legacy fallback.
 * Always does a fresh load (replaces DATA.groupEntries).
 */
async function loadGroupEntries(){
  if(CFG.demo || !DATA.groups || !DATA.groups.length) return;

  const myId = _myGroupId();
  const myName = _myGroupName();
  const activeGroups = DATA.groups.filter(g =>
    g.status==='active' && (g.members.includes(myId) || g.members.includes(myName))
  );
  if(!activeGroups.length) return;

  // Fresh load — replace, don't merge
  const allEntries = [];
  const legacyGroupIds = [];

  // Try per-group tabs first
  for(const g of activeGroups){
    const tab = _groupEntryTab(g.id);
    try{
      const res = await groupsApiCall({
        action: 'groupsGet',
        range: tab + '!A2:L5000'
      }).catch(()=> null);

      if(res && res.values && res.values.length){
        for(const r of res.values){
          if(!r[0]) continue;
          if(r[10]==='1') continue; // deleted
          allEntries.push(_rowToGroupEntry(r, myId));
        }
      } else {
        // Tab doesn't exist or is empty → try legacy
        legacyGroupIds.push(g.id);
      }
    }catch(e){
      // Tab doesn't exist → try legacy
      legacyGroupIds.push(g.id);
    }
  }

  // Legacy fallback: read old GroupEntries tab for groups without per-group tabs
  if(legacyGroupIds.length){
    const legacySet = new Set(legacyGroupIds);
    try{
      const res = await groupsApiCall({
        action: 'groupsGet',
        range: 'GroupEntries!A2:J5000'
      }).catch(()=>({values:[]}));

      for(const r of (res.values||[])){
        if(!r[0] || !legacySet.has(r[1])) continue;
        if(r[9]==='1') continue; // deleted
        allEntries.push(_legacyRowToGroupEntry(r, myId, myName));
      }
    }catch(e){
      console.warn('Legacy GroupEntries load failed:', e.message);
    }
  }

  DATA.groupEntries = allEntries;
}

/** Save an entry to the per-group tab on the admin backend. */
async function saveGroupEntry(group, entry){
  if(CFG.demo) return;
  const myId = _myGroupId();
  const myName = _myGroupName();
  const now = new Date().toISOString();
  const row = [
    entry.id,
    group.id,
    myId,
    myName,
    entry.date,
    entry.what,
    entry.cat,
    entry.amt,
    group.currency||CFG.currency||'CHF',
    entry.splitData ? JSON.stringify(entry.splitData) : '',
    '',    // deleted
    now    // editedAt
  ];
  try{
    await _ensureGroupEntryTab(group.id);
    await groupsApiCall({
      action:'groupsAppend',
      sheet: _groupEntryTab(group.id),
      values: JSON.stringify([row])
    });
    // Add to local DATA.groupEntries
    if(!DATA.groupEntries) DATA.groupEntries=[];
    DATA.groupEntries.push({
      id:entry.id, groupId:group.id, authorId:myId, authorName:myName,
      date:entry.date, what:entry.what, cat:entry.cat,
      amt:entry.amt, currency:group.currency||CFG.currency||'CHF',
      splitData:entry.splitData||null, isMine:true, editedAt:now,
      _type:'groupEntry'
    });
  }catch(e){
    console.warn('saveGroupEntry failed:', e.message);
  }
}

/**
 * Delete a group entry (soft-delete: sets deleted='1').
 * Only the author or group admin can delete.
 */
async function deleteGroupEntry(entryId, groupId){
  const group = DATA.groups.find(g=>g.id===groupId);
  if(!group) return;
  const entry = (DATA.groupEntries||[]).find(e=>e.id===entryId && e.groupId===groupId);
  if(!entry) return;

  const myId = _myGroupId();
  const canDelete = entry.authorId === myId || entry.isMine || isGroupAdmin(group);
  if(!canDelete){ toast('Du kannst nur eigene Einträge löschen','err'); return; }
  if(!confirm('Gruppen-Eintrag löschen?')) return;

  // Optimistic local delete
  DATA.groupEntries = (DATA.groupEntries||[]).filter(e=>e.id!==entryId);
  markDirty('groups','verlauf');

  if(!CFG.demo){
    setSyncStatus('syncing');
    try{
      const tab = _groupEntryTab(groupId);
      const row = await groupsApiFindRow(tab, entryId);
      if(row){
        await groupsApiUpdate(tab + '!K' + row, [['1']]); // deleted=1
      }
      setSyncStatus('online');
      toast('Eintrag gelöscht','ok');
    }catch(e){
      // Revert on failure
      DATA.groupEntries.push(entry);
      markDirty('groups','verlauf');
      setSyncStatus('error');
      toast('Fehler beim Löschen: '+e.message,'err');
    }
  } else {
    toast('Eintrag gelöscht (Demo)','ok');
  }
  dataCacheSave();
}

/**
 * Update a group entry's fields.
 * Only the author can edit.
 */
async function updateGroupEntry(entryId, groupId, updates){
  const group = DATA.groups.find(g=>g.id===groupId);
  if(!group) return;
  const entry = (DATA.groupEntries||[]).find(e=>e.id===entryId && e.groupId===groupId);
  if(!entry) return;

  const myId = _myGroupId();
  if(entry.authorId !== myId && !entry.isMine && !isGroupAdmin(group)){
    toast('Du kannst nur eigene Einträge bearbeiten','err'); return;
  }

  // Optimistic local update
  const backup = {...entry};
  Object.assign(entry, updates);
  entry.editedAt = new Date().toISOString();
  markDirty('groups','verlauf');

  if(!CFG.demo){
    setSyncStatus('syncing');
    try{
      const tab = _groupEntryTab(groupId);
      const rowNum = await groupsApiFindRow(tab, entryId);
      if(rowNum){
        const row = [
          entry.id, entry.groupId, entry.authorId, entry.authorName,
          entry.date, entry.what, entry.cat, entry.amt,
          entry.currency, entry.splitData ? JSON.stringify(entry.splitData) : '',
          '', entry.editedAt
        ];
        await groupsApiUpdate(tab + '!A' + rowNum + ':L' + rowNum, [row]);
      }
      setSyncStatus('online');
      toast('Eintrag aktualisiert','ok');
    }catch(e){
      // Revert on failure
      Object.assign(entry, backup);
      markDirty('groups','verlauf');
      setSyncStatus('error');
      toast('Fehler: '+e.message,'err');
    }
  } else {
    toast('Aktualisiert (Demo)','ok');
  }
  dataCacheSave();
}

// ── 13. Group balances — debt calculation ────────────────────

function groupName(groupId){
  return DATA.groups.find(g=>g.id===groupId)?.name||'';
}

function calculateGroupBalances(groupId){
  const group = DATA.groups.find(g=>g.id===groupId);
  if(!group) return [];

  const myId = _myGroupId();
  const myName = _myGroupName();

  // Own entries (DATA.expenses with groupId) — inject authorId/authorName
  const myEntries = DATA.expenses
    .filter(e=>e.groupId===groupId)
    .map(e=>({...e, authorId: myId, authorName: myName}));

  // Foreign entries from group tabs (DATA.groupEntries)
  const foreignEntries = (DATA.groupEntries||[])
    .filter(e=>e.groupId===groupId && !e.isMine);

  // All group entries (own + foreign, combined)
  const allEntries = [...myEntries, ...foreignEntries];

  // Separate settlements (isSettlement flag in splitData)
  const settlements = allEntries.filter(
    e=>e.splitData && e.splitData.isSettlement
  );
  const regularEntries = allEntries.filter(
    e=>!e.splitData || !e.splitData.isSettlement
  );

  const paid = {};
  const owes = {};
  group.members.forEach(m=>{ paid[m]=0; owes[m]=0; });

  // Regular expenses — use authorId preferentially, fallback to authorName
  for(const entry of regularEntries){
    const payer = entry.splitData?.payerId || entry.authorId || entry.authorName || myName;
    const split = entry.splitData;
    if(!split || !split.participants) continue;
    paid[payer] = (paid[payer]||0) + (split.totalAmount||entry.amt||0);
    Object.entries(split.participants).forEach(([member, share])=>{
      owes[member] = (owes[member]||0) + share;
    });
  }

  // Settlements reduce debts
  for(const s of settlements){
    const payer = s.splitData?.payerId || s.authorId || s.authorName || '';
    if(!payer) continue;
    const participants = s.splitData?.participants||{};
    Object.entries(participants).forEach(([member, share])=>{
      paid[payer]  = (paid[payer]||0) - share;
      owes[member] = (owes[member]||0) - share;
    });
  }

  // Greedy debt simplification
  const balances = {};
  group.members.forEach(m=>{
    balances[m] = (paid[m]||0) - (owes[m]||0);
  });

  const debts = [];
  const debtors  = Object.entries(balances).filter(([,v])=>v<-0.01).sort(([,a],[,b])=>a-b);
  const creditors = Object.entries(balances).filter(([,v])=>v>0.01).sort(([,a],[,b])=>b-a);

  let di=0, ci=0;
  const dAmt = debtors.map(([,v])=>Math.abs(v));
  const cAmt = creditors.map(([,v])=>v);

  while(di<debtors.length && ci<creditors.length){
    const amount = Math.min(dAmt[di], cAmt[ci]);
    if(amount>0.01){
      debts.push({
        from:   debtors[di][0],
        to:     creditors[ci][0],
        amount: Math.round(amount*100)/100
      });
    }
    dAmt[di] -= amount;
    cAmt[ci] -= amount;
    if(dAmt[di]<0.01) di++;
    if(cAmt[ci]<0.01) ci++;
  }
  return debts;
}

function confirmSettleUp(groupId, from, to, amount){
  if(!confirm(
    `${curr()} ${fmtAmt(amount)} an ${to} begleichen?\nDies wird als Ausgleichs-Buchung erfasst.`
  )) return;
  settleUp(groupId, from, to, amount);
}

// ── 14. Verlauf toggle for group entries ─────────────────────

/** Toggle group entries visibility in Verlauf (global toggle). */
function toggleGroupEntriesVisible(){
  CFG.showGroupEntries = !CFG.showGroupEntries;
  CFG.excludeGroupsFromVerlauf = !CFG.showGroupEntries; // sync both flags
  cfgSave();
  // When enabling: auto-activate groupVerlauf for all active groups
  if(CFG.showGroupEntries){
    if(!CFG.groupVerlauf) CFG.groupVerlauf = {};
    (DATA.groups||[]).forEach(g => {
      if(g.status === 'active') CFG.groupVerlauf[g.id] = true;
    });
    cfgSave();
  }
  const btn = document.getElementById('verlauf-group-toggle');
  if(btn) btn.classList.toggle('active', CFG.showGroupEntries);
  renderVerlauf();
}

/** Toggle a specific group's Verlauf integration. */
function toggleGroupVerlauf(groupId){
  if(!CFG.groupVerlauf) CFG.groupVerlauf = {};
  CFG.groupVerlauf[groupId] = !CFG.groupVerlauf[groupId];
  cfgSave();
  markDirty('verlauf','groups');
  // Re-render group detail if open
  if(currentGroupId===groupId) openGroupDetail(groupId);
}

function openGroupEntryDetail(entryId){
  // Check shadow entries first, then raw group entries
  const shadow = getGroupShadowEntries().find(e=>e.id===entryId);
  const entry = shadow || (DATA.groupEntries||[]).find(e=>e.id===entryId);
  if(!entry) return;
  const gName = shadow ? shadow.groupName : groupName(entry.groupId);
  const isShadow = !!shadow;
  const body = `
    <div style="padding:4px 0">
      <div style="font-size:15px;font-weight:700;margin-bottom:8px">${esc(entry.what)}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px">
        <div><span class="t-label">${isShadow?'Mein Anteil':'Betrag'}</span><div style="font-weight:600;margin-top:2px">${curr()} ${fmtAmt(entry.amt)}</div></div>
        ${isShadow?`<div><span class="t-label">Gesamtbetrag</span><div style="margin-top:2px;color:var(--text3)">${curr()} ${fmtAmt(shadow.fullAmt)}</div></div>`:''}
        <div><span class="t-label">Datum</span><div style="margin-top:2px">${fmtDate(entry.date)}</div></div>
        <div><span class="t-label">Kategorie</span><div style="margin-top:2px">${catEmoji(entry.cat)} ${esc(entry.cat)}</div></div>
        <div><span class="t-label">${isShadow?'Bezahlt von':'Erstellt von'}</span><div style="margin-top:2px">${esc(isShadow?shadow.paidBy:entry.authorName)}</div></div>
      </div>
      <div style="margin-top:12px;display:flex;align-items:center;gap:6px">
        <span class="shadow-group-chip">${esc(gName)}</span>
        ${isShadow?'<span style="font-size:11px;color:var(--text3)">· Gruppen-Schuld</span>':''}
      </div>
    </div>`;
  openGenericModal(isShadow?'Gruppen-Anteil':'Gruppen-Buchung', body, '');
}

// ── 14b. Shadow entries — user's share of foreign group expenses ──

/**
 * Generate shadow entries from DATA.groupEntries where the current
 * user has a share. Only for groups with CFG.groupVerlauf[id] = true.
 * Settlements (isSettlement) are excluded.
 */
function getGroupShadowEntries(){
  const gv = CFG.groupVerlauf||{};
  const entries = DATA.groupEntries||[];
  const myId = _myGroupId();
  const myName = _myGroupName();
  const shadows = [];

  for(const e of entries){
    if(e.isMine) continue;
    if(!gv[e.groupId]) continue;
    if(e.splitData && e.splitData.isSettlement) continue;
    const group = DATA.groups.find(g=>g.id===e.groupId);
    if(!group) continue;

    // Look up user's share — try authorId first, then authorName
    let myShare = 0;
    if(e.splitData && e.splitData.participants){
      const parts = e.splitData.participants;
      if(parts[myId]!==undefined) myShare = parts[myId];
      else if(parts[myName]!==undefined) myShare = parts[myName];
      else myShare = 0;
    } else {
      myShare = group.members.length>0 ? e.amt/group.members.length : e.amt;
    }

    if(myShare<=0) continue;

    shadows.push({
      id:        e.id,
      date:      e.date,
      what:      e.what,
      cat:       e.cat,
      amt:       Math.round(myShare*100)/100,
      fullAmt:   e.amt,
      note:      e.note||'',
      groupId:   e.groupId,
      groupName: group.name,
      paidBy:    e.authorName,
      currency:  e.currency||group.currency||CFG.currency||'CHF',
      editedAt:  e.editedAt||'',
      _type:     'shadow',
      _shadowOf: e.id
    });
  }
  return shadows;
}

// ── 15. Admin groups panel ───────────────────────────────────

let _adminGroupsLoaded = false;
let _adminGroupsData = [];
let _adminGroupsPanelOpen = false;

async function toggleAdminGroupsPanel(){
  _adminGroupsPanelOpen = !_adminGroupsPanelOpen;
  const panel = document.getElementById('admin-groups-panel');
  const chev  = document.getElementById('admin-groups-chevron');
  if(panel) panel.style.display = _adminGroupsPanelOpen ? '' : 'none';
  if(chev)  chev.style.transform = _adminGroupsPanelOpen ? 'rotate(90deg)' : '';
  if(_adminGroupsPanelOpen && !_adminGroupsLoaded){
    await renderAdminGroupsPanel();
    _adminGroupsLoaded = true;
  }
}

function filterAdminGroups(){
  const q      = (document.getElementById('admin-groups-search')?.value||'').toLowerCase();
  const status = document.getElementById('admin-groups-filter')?.value||'all';
  const filtered = _adminGroupsData.filter(g => {
    const matchStatus = status==='all' || g.status===status;
    const matchQ = !q
      || g.name.toLowerCase().includes(q)
      || (g.adminId||'').toLowerCase().includes(q)
      || g.members.some(m=>m.toLowerCase().includes(q));
    return matchStatus && matchQ;
  });
  _renderAdminGroupsList(filtered);
}

async function renderAdminGroupsPanel(){
  const container = document.getElementById('admin-groups-list');
  if(!container) return;
  container.innerHTML = '<div class="t-muted" style="padding:12px 0;text-align:center">Lade Gruppen…</div>';

  try{
    const res = await groupsApiGet('Groups!A2:J200').catch(()=>({values:[]}));
    // NUR Split- und Event-Gruppen (keine persönlichen Buchungsgruppen)
    _adminGroupsData = (res.values||[])
      .filter(r=>r[0])
      .map(_rowToGroup)
      .filter(g => g.status!=='deleted' && (g.type==='split'||g.type==='event'));
    // Count-Label aktualisieren
    const countLabel = document.getElementById('admin-groups-count-label');
    if(countLabel) countLabel.textContent = _adminGroupsData.length + ' Gruppen geladen';
    filterAdminGroups();
  }catch(e){
    container.innerHTML = '<div class="t-muted" style="padding:12px 0;text-align:center">Fehler: '+esc(e.message)+'</div>';
  }
}

function _renderAdminGroupsList(groups){
  const container = document.getElementById('admin-groups-list');
  if(!container) return;
  if(!groups.length){
    container.innerHTML = '<div class="t-muted" style="padding:12px 0;text-align:center">Keine Gruppen gefunden.</div>';
    return;
  }
  container.innerHTML = groups.map(g=>{
    const memberCount = g.members.length;
    const statusBadge = g.status==='archived'
      ? '<span style="font-size:10px;color:var(--text3);background:var(--bg3);padding:2px 6px;border-radius:4px;margin-left:6px">Archiviert</span>'
      : '<span style="font-size:10px;color:var(--accent);background:rgba(200,245,60,.1);padding:2px 6px;border-radius:4px;margin-left:6px">Aktiv</span>';
    const typeBadge = g.type==='event'
      ? '<span style="font-size:10px;color:var(--accent);margin-left:4px">Event</span>'
      : '<span style="font-size:10px;color:#8b5cf6;margin-left:4px">Split</span>';
    return `
    <div class="card" style="padding:12px;margin-bottom:8px;cursor:pointer"
         onclick="openAdminGroupDetail('${g.id}')">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <span style="font-weight:600;font-size:14px">${esc(g.name)}</span>
          ${typeBadge}${statusBadge}
        </div>
        <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:var(--text3);fill:none;stroke-width:2"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
      <div style="font-size:12px;color:var(--text2);display:flex;gap:12px;flex-wrap:wrap;margin-top:4px">
        <span>Admin: ${esc(g.adminId||'–')}</span>
        <span>${memberCount} Mitglieder</span>
        <span>Erstellt: ${g.created?fmtDate(g.created):'–'}</span>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px">
        ${g.members.map(m=>esc(m)).join(' · ')}
      </div>
    </div>`;
  }).join('');
}

async function openAdminGroupDetail(groupId){
  const g = _adminGroupsData.find(x=>x.id===groupId);
  if(!g) return;

  // Lade GroupEntries — per-group tab first, legacy fallback
  let entries = [];
  try{
    const tab = _groupEntryTab(groupId);
    const res = await groupsApiGet(tab+'!A2:L5000').catch(()=>null);
    if(res && res.values){
      entries = res.values
        .filter(r=>r[0]&&r[10]!=='1')
        .map(r=>({
          id:r[0], authorId:r[2]||'', authorName:r[3]||'', date:r[4]||'', what:r[5]||'',
          cat:r[6]||'', amt:parseFloat(r[7])||0,
          splitData: r[9]?_safeParseJSON(r[9]):null
        }));
    } else {
      // Legacy fallback
      const legacyRes = await groupsApiGet('GroupEntries!A2:J5000').catch(()=>({values:[]}));
      entries = (legacyRes.values||[])
        .filter(r=>r[0]&&r[1]===groupId&&r[9]!=='1')
        .map(r=>({
          id:r[0], authorId:r[2]||'', authorName:r[2]||'', date:r[3]||'', what:r[4]||'',
          cat:r[5]||'', amt:parseFloat(r[6])||0,
          splitData: r[8]?_safeParseJSON(r[8]):null
        }));
    }
  }catch(e){}

  const totalAmt = entries.reduce((s,e)=>s+e.amt,0);

  const body = `
    <div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <span style="font-size:12px;color:var(--text3)">
          ${g.members.length} Mitglieder · ${entries.length} Buchungen ·
          Total: ${curr()} ${fmtAmt(totalAmt)}
        </span>
      </div>
      <div style="font-size:12px;font-weight:700;margin-bottom:6px">Mitglieder</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">
        ${g.members.map(m=>`
          <span style="background:var(--bg3);padding:3px 10px;border-radius:99px;font-size:12px">
            ${esc(m)}${m===g.adminId?' 👑':''}
          </span>`).join('')}
      </div>
      <div style="font-size:12px;font-weight:700;margin-bottom:6px">Letzte Buchungen</div>
      <div style="max-height:280px;overflow-y:auto">
        ${entries.length===0
          ? '<div class="t-muted" style="padding:8px 0">Keine Buchungen.</div>'
          : entries.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,20).map(e=>`
            <div style="display:flex;justify-content:space-between;
                        padding:7px 0;border-bottom:1px solid var(--border);font-size:13px">
              <div>
                <div style="font-weight:500">${esc(e.what)}</div>
                <div style="font-size:11px;color:var(--text3)">
                  ${esc(e.authorName)} · ${fmtDate(e.date)}
                </div>
              </div>
              <div style="font-family:'DM Mono',monospace;font-weight:600">
                ${curr()} ${fmtAmt(e.amt)}
              </div>
            </div>`).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-top:14px">
        ${g.status==='active'
          ? `<button onclick="adminArchiveGroup('${g.id}');closeGenericModal()"
               style="flex:1;padding:9px;border:1px solid var(--border);
                      border-radius:8px;background:var(--bg2);font-size:13px;cursor:pointer;color:var(--text)">
               Archivieren
             </button>`
          : ''}
        <button onclick="adminDeleteGroup('${g.id}');closeGenericModal()"
          style="flex:1;padding:9px;border:1px solid rgba(255,77,109,.3);
                 border-radius:8px;background:rgba(255,77,109,.06);
                 color:#ff4d6d;font-size:13px;cursor:pointer">
          Löschen
        </button>
      </div>
    </div>`;

  openGenericModal(g.name, body, '');
}

/** Admin: archive any group (no permission check — admin panel). */
async function adminArchiveGroup(id){
  if(!confirm('Gruppe archivieren?')) return;
  try{
    const row = await groupsApiFindRow('Groups', id);
    if(row) await groupsApiUpdate(`Groups!F${row}`, [['archived']]);
    const local = DATA.groups.find(x=>x.id===id);
    if(local) local.status = 'archived';
    // Update admin panel data
    const ag = _adminGroupsData.find(x=>x.id===id);
    if(ag) ag.status = 'archived';
    dataCacheSave();
    toast('✓ Archiviert','ok');
    filterAdminGroups();
    markDirty('groups');
  }catch(e){ toast('Fehler: '+e.message,'err'); }
}

/** Admin: delete any group (no permission check — admin panel). */
async function adminDeleteGroup(id){
  if(!confirm('Gruppe endgültig löschen?')) return;
  try{
    const row = await groupsApiFindRow('Groups', id);
    if(row) await groupsApiUpdate(`Groups!F${row}`, [['deleted']]);
    DATA.groups = DATA.groups.filter(x=>x.id!==id);
    _adminGroupsData = _adminGroupsData.filter(x=>x.id!==id);
    DATA.expenses.forEach(e=>{ if(e.groupId===id){ delete e.groupId; delete e.splitData; } });
    DATA.incomes.forEach(e=>{ if(e.groupId===id) delete e.groupId; });
    dataCacheSave();
    toast('✓ Gelöscht','ok');
    filterAdminGroups();
    markDirty('groups');
  }catch(e){ toast('Fehler: '+e.message,'err'); }
}
