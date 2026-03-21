// ═══════════════════════════════════════════════════════════════
// MODULE: GROUPS — API, CRUD, Invitations, Notifications, Admin
// Centralises ALL group-related logic. Loaded before render.js.
// Data lives in external Gruppen-Sheet (CFG.gruppenSheetId).
// ═══════════════════════════════════════════════════════════════

// ── 1. Groups API layer — routes to Gruppen-Sheet via backend ──

function _groupsBaseUrl(){
  return (CFG.sessionToken && CFG.adminUrl) ? CFG.adminUrl : (CFG.scriptUrl || CFG.adminUrl || '');
}

async function groupsApiCall(params){
  const isAccountMode = !!(CFG.sessionToken && CFG.adminUrl);
  const baseUrl = _groupsBaseUrl();
  if(!baseUrl) throw new Error('Kein Backend konfiguriert.');
  if(!CFG.gruppenSheetId) throw new Error('Gruppen-Sheet nicht konfiguriert. Bitte in Einstellungen hinterlegen.');
  const allParams = {
    ...params,
    gruppenSheetId: CFG.gruppenSheetId,
    ...(isAccountMode ? {token: CFG.sessionToken} : {})
  };
  const url = baseUrl + '?' + new URLSearchParams(allParams).toString();
  const r = await fetch(url);
  if(!r.ok) throw new Error('HTTP '+r.status);
  const data = await r.json();
  if(data.error){
    if((data.error||'').includes('Sitzung abgelaufen')){
      CFG.sessionToken=''; CFG.authUser=''; CFG.authRole=''; cfgSave();
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

/** Has the current user left this group? */
function hasLeftGroup(group){
  if(!group || !group.leftMembers) return false;
  const myId = _myGroupId();
  return group.leftMembers.includes(myId);
}

// ── 3. Invite code generation ────────────────────────────────

function _genInviteCode(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghkmnpqrstuvwxyz23456789';
  let s='';for(let i=0;i<8;i++) s+=chars[Math.floor(Math.random()*chars.length)];
  return s;
}

// ── 4. Sheet row serialisation ───────────────────────────────
// Gruppen-Sheet "Index" tab:
//   A=id B=name C=type D=members(JSON) E=currency F=status
//   G=created H=adminId I=inviteCode J=closedDate K=leftMembers(JSON)

const _INDEX_HEADERS = ['id','name','type','members','currency','status',
  'created','adminId','inviteCode','closedDate','leftMembers'];

function _groupToRow(g){
  return [g.id, g.name, g.type, JSON.stringify(g.members||[]),
          g.currency||'CHF', g.status||'active', g.created||'',
          g.adminId||'', g.inviteCode||'',
          g.closedDate||'', JSON.stringify(g.leftMembers||[])];
}

function _rowToGroup(r){
  let members=[], leftMembers=[];
  try{ members=JSON.parse(r[3]||'[]'); }catch(e){}
  try{ leftMembers=JSON.parse(r[10]||'[]'); }catch(e){}
  return {
    id:r[0], name:r[1]||'', type:r[2]||'event',
    members, currency: r[4]||CFG.currency||'CHF',
    status: r[5]||'active', created: r[6]||'',
    adminId: r[7]||'', inviteCode: r[8]||'',
    closedDate: r[9]||'', leftMembers
  };
}

// ── 5. Load groups from backend ──────────────────────────────

async function ensureGroupsSheets(){
  if(CFG.demo || !CFG.gruppenSheetId) return;
  try{
    await groupsApiCall({
      action:'groupsEnsureSheet',
      sheet:'Index',
      headers:JSON.stringify(_INDEX_HEADERS)
    });
    await groupsApiCall({
      action:'groupsEnsureSheet',
      sheet:'Notifications',
      headers:JSON.stringify(['recipient','notifJSON','read'])
    });
  }catch(e){
    console.warn('ensureGroupsSheets:', e.message);
  }
}

async function loadGroups(){
  if(CFG.demo || !CFG.gruppenSheetId){
    if(!DATA.groups) DATA.groups=[];
    return;
  }
  await ensureGroupsSheets();
  try{
    const res = await groupsApiGet('Index!A2:K5000');
    const myId = _myGroupId();
    const myName = _myGroupName();
    DATA.groups = (res.values||[])
      .filter(r=>r[0] && r[5]!=='deleted')
      .map(_rowToGroup)
      .filter(g => g.members.includes(myId) || g.members.includes(myName));
  }catch(e){
    if(!DATA.groups) DATA.groups = [];
    if(e.message && e.message.includes('nicht konfiguriert')){
      console.info('Groups: Gruppen-Sheet nicht konfiguriert.');
    }
  }
}

// ── 6. CRUD ──────────────────────────────────────────────────

async function saveGroup(name, type, members, currency){
  const id = genId('G');
  const created = today();
  const adminId = _myGroupId();
  const inviteCode = _genInviteCode();
  const group = {id,name,type,members,currency:currency||CFG.currency||'CHF',status:'active',created,adminId,inviteCode,closedDate:'',leftMembers:[]};
  DATA.groups.push(group);
  if(!CFG.demo){
    setSyncStatus('syncing');
    try{
      await groupsApiAppend('Index',[_groupToRow(group)]);
      // Create per-group entry tab
      await _ensureGroupEntryTab(id);
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
      const row = await groupsApiFindRow('Index', id);
      if(row) await groupsApiUpdate(`Index!A${row}:K${row}`, [_groupToRow(g)]);
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
  // New flow: can only delete archived groups (all quitt + all left)
  if(g.status === 'active'){
    toast('Aktive Gruppen müssen zuerst geschlossen werden (alle Schulden begleichen)','err'); return;
  }
  if(g.status === 'closed'){
    toast('Geschlossene Gruppen können erst gelöscht werden, wenn alle Mitglieder ausgetreten sind','err'); return;
  }
  if(!confirm('Gruppe endgültig löschen?')) return;
  DATA.groups = DATA.groups.filter(x=>x.id!==id);
  if(!CFG.demo){
    setSyncStatus('syncing');
    try{
      const row = await groupsApiFindRow('Index', id);
      if(row) await groupsApiUpdate(`Index!F${row}`, [['deleted']]);
      setSyncStatus('online');
    }catch(e){ setSyncStatus('error'); }
  }
  dataCacheSave();
  markDirty('groups');
  if(typeof renderGroups === 'function') renderGroups();
}

// ── 6b. New status flow: active → closed → archived ──────────
// close: only when ALL balances = 0 (quitt)
// leave: any member can leave a closed group (added to leftMembers)
// archived: when ALL members have left a closed group
// kick: admin can remove a member (with balance check)

/** Check if all balances in a group are settled (quitt). */
function isGroupQuitt(groupId){
  const debts = calculateGroupBalances(groupId);
  return !debts || debts.length === 0;
}

/**
 * Close a group — only possible when all balances = 0.
 * Status: active → closed. Sets closedDate.
 */
async function closeGroup(id){
  const g = DATA.groups.find(x=>x.id===id);
  if(!g) return;
  if(!isGroupAdmin(g)){ toast('Nur der Admin kann die Gruppe schliessen','err'); return; }
  if(!isGroupQuitt(id)){
    toast('Gruppe kann nicht geschlossen werden — es gibt noch offene Schulden','err');
    return;
  }
  if(!confirm('Gruppe schliessen? Neue Buchungen sind danach nicht mehr möglich.')) return;
  await updateGroup(id, {status:'closed', closedDate: today()});
  toast('Gruppe geschlossen','ok');
  markDirty('groups');
  if(typeof renderGroups === 'function') renderGroups();
}

/**
 * Leave a group — available for any member of a closed group.
 * Adds user to leftMembers list. When all have left → archived.
 */
async function leaveGroup(id){
  const g = DATA.groups.find(x=>x.id===id);
  if(!g) return;
  if(g.status !== 'closed'){
    toast('Du kannst nur geschlossene Gruppen verlassen','err');
    return;
  }
  if(!confirm('Gruppe verlassen? Du kannst danach keine Buchungen mehr sehen.')) return;

  const myId = _myGroupId();
  const left = g.leftMembers || [];
  if(!left.includes(myId)) left.push(myId);

  // Check if ALL members have now left
  const allLeft = g.members.every(m => left.includes(m));
  const newStatus = allLeft ? 'archived' : 'closed';

  await updateGroup(id, {leftMembers: left, status: newStatus});

  if(allLeft){
    toast('Alle Mitglieder haben die Gruppe verlassen — Gruppe archiviert','ok');
  } else {
    toast('Du hast die Gruppe verlassen','ok');
  }
  markDirty('groups');
  if(typeof renderGroups === 'function') renderGroups();
}

/**
 * Kick a member from a group (admin only).
 * Cannot kick if that member has outstanding balances.
 */
async function kickMember(groupId, memberName){
  const g = DATA.groups.find(x=>x.id===groupId);
  if(!g) return;
  if(!isGroupAdmin(g)){ toast('Nur der Admin kann Mitglieder entfernen','err'); return; }
  if(memberName === g.adminId || memberName === _myGroupId()){
    toast('Admin kann sich nicht selbst entfernen','err'); return;
  }

  // Check if member has outstanding balance
  const debts = calculateGroupBalances(groupId);
  const memberInvolved = debts.some(d => d.from === memberName || d.to === memberName);
  if(memberInvolved){
    toast('Mitglied hat noch offene Schulden — zuerst begleichen','err');
    return;
  }

  if(!confirm(memberName + ' aus der Gruppe entfernen?')) return;
  g.members = g.members.filter(m => m !== memberName);
  // Also add to leftMembers so they don't rejoin via old invite
  const left = g.leftMembers || [];
  if(!left.includes(memberName)) left.push(memberName);

  await updateGroup(groupId, {members: g.members, leftMembers: left});
  toast(memberName + ' wurde entfernt','ok');
  markDirty('groups');
  if(typeof openGroupDetail === 'function') openGroupDetail(groupId);
}

/** Legacy alias — routes to closeGroup for backwards compat. */
async function archiveGroup(id){
  return closeGroup(id);
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
  // If a backend URL was provided (from the invite link), use it temporarily
  const origAdminUrl = CFG.adminUrl;
  const origScriptUrl = CFG.scriptUrl;
  if(backendUrl && backendUrl.includes('script.google.com')){
    if(CFG.sessionToken) CFG.adminUrl = backendUrl;
    else CFG.scriptUrl = backendUrl;
  }

  let joinedOk = false;
  try{
    const res = await groupsApiGet('Index!A2:K5000').catch(()=>({values:[]}));
    const rows = (res.values||[]).filter(r=>r[0]);
    const row = rows.find(r=>r[0]===groupId);
    if(!row){ toast('Gruppe nicht gefunden','err'); return false; }

    const g = _rowToGroup(row);
    if(g.inviteCode !== inviteCode){ toast('Ungültiger Einladungscode','err'); return false; }
    if(g.status === 'deleted'){ toast('Gruppe wurde gelöscht','err'); return false; }
    if(g.status === 'archived'){ toast('Diese Gruppe ist archiviert','err'); return false; }
    if(g.status === 'closed'){ toast('Diese Gruppe ist geschlossen','err'); return false; }

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
    await groupsApiUpdate(`Index!D${sheetRow}`, [[JSON.stringify(g.members)]]);

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
    }
    cfgSave();
  }
}

// ── 8. Member management ─────────────────────────────────────

/** Remove member — delegates to kickMember with balance check. */
async function removeGroupMember(groupId, memberName){
  return kickMember(groupId, memberName);
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
  if(sec) sec.style.display='none';
}

// ── 10. Settle up ────────────────────────────────────────────
// Settlements are stored ONLY in GroupEntries (admin sheet),
// NOT in DATA.expenses — so they don't pollute personal stats.

async function settleUp(groupId, from, to, amount){
  const grp = DATA.groups.find(g=>g.id===groupId);
  if(grp && (grp.status==='closed'||grp.status==='archived'||grp.status==='deleted')){
    toast('In geschlossenen Gruppen können keine Ausgleiche erstellt werden','err'); return;
  }
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
  return 'G_' + groupId;
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
  // Load entries for active AND closed groups (so balances/history stay visible)
  const activeGroups = DATA.groups.filter(g =>
    (g.status==='active' || g.status==='closed') &&
    (g.members.includes(myId) || g.members.includes(myName))
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
  if(group.status === 'closed' || group.status === 'archived' || group.status === 'deleted'){
    toast('In geschlossenen Gruppen können keine neuen Buchungen erstellt werden','err'); return;
  }
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

  // All group members can delete any entry (requirement #3-5)
  const myId = _myGroupId();
  const myName = _myGroupName();
  const isMember = group.members.includes(myId) || group.members.includes(myName);
  if(!isMember){ toast('Nur Gruppenmitglieder können Einträge löschen','err'); return; }
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

  // All group members can edit any entry (requirement #3-5, #12)
  const myId = _myGroupId();
  const myName = _myGroupName();
  const isMember = group.members.includes(myId) || group.members.includes(myName);
  if(!isMember){ toast('Nur Gruppenmitglieder können Einträge bearbeiten','err'); return; }

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

  // New architecture: ALL entries come from Gruppen-Sheet (DATA.groupEntries)
  const allEntries = (DATA.groupEntries||[]).filter(e=>e.groupId===groupId);

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

  // Regular expenses
  for(const entry of regularEntries){
    const payer = entry.splitData?.payerId || entry.authorId || entry.authorName || '';
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

/**
 * Open a settle-up modal with editable amount (requirement #6).
 * Default amount is the full outstanding debt, but user can enter less.
 */
function confirmSettleUp(groupId, from, to, amount){
  const group = DATA.groups.find(g=>g.id===groupId);
  const currency = group ? group.currency||CFG.currency||'CHF' : CFG.currency||'CHF';
  const body = `
    <div style="padding:4px 0">
      <div style="font-size:14px;color:var(--text2);margin-bottom:12px">
        <strong>${esc(from)}</strong> schuldet <strong>${esc(to)}</strong>
      </div>
      <div style="margin-bottom:16px">
        <label style="font-size:12px;color:var(--text3);display:block;margin-bottom:4px">
          Betrag (${esc(currency)})
        </label>
        <input type="number" id="settle-amount" value="${amount}" step="0.01" min="0.01" max="${amount}"
          style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;
                 background:var(--bg2);color:var(--text);font-size:16px;font-family:'DM Mono',monospace">
        <div style="font-size:11px;color:var(--text3);margin-top:4px">
          Offener Betrag: ${currency} ${fmtAmt(amount)}
        </div>
      </div>
    </div>`;
  const actions = `
    <div style="display:flex;gap:8px">
      <button onclick="closeGenericModal()"
        style="flex:1;padding:10px;border:1px solid var(--border);border-radius:8px;
               background:var(--bg2);color:var(--text);font-size:14px;cursor:pointer">
        Abbrechen
      </button>
      <button onclick="_executeSettleUp('${groupId}','${esc(from)}','${esc(to)}')"
        style="flex:1;padding:10px;border:none;border-radius:8px;
               background:var(--accent);color:#000;font-size:14px;font-weight:600;cursor:pointer">
        Begleichen
      </button>
    </div>`;
  openGenericModal('Schuld begleichen', body, actions);
}

/** Execute the settlement from the modal. */
function _executeSettleUp(groupId, from, to){
  const input = document.getElementById('settle-amount');
  const amount = parseFloat(input?.value)||0;
  if(amount <= 0){
    toast('Bitte einen gültigen Betrag eingeben','err'); return;
  }
  closeGenericModal();
  settleUp(groupId, from, to, Math.round(amount*100)/100);
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

// ── 15. Group Rendering (moved from ui.js — Requirement #14) ─

let groupFilter = 'all';
let currentGroupId = null;

function renderGroups(){
  const grid = document.getElementById('groups-grid');
  if(!grid) return;
  const myId = _myGroupId();
  const myNm = _myGroupName();
  let groups = DATA.groups.filter(g=>g.status!=='deleted' && (g.members.includes(myId) || g.members.includes(myNm)));

  if(groupFilter==='archived') groups = groups.filter(g=>g.status==='archived'||g.status==='closed');
  else if(groupFilter==='all') groups = groups.filter(g=>g.status==='active');
  else groups = groups.filter(g=>g.status==='active'&&g.type===groupFilter);

  if(!groups.length){
    grid.innerHTML = '<div class="t-muted" style="text-align:center;padding:30px 0">Keine Gruppen vorhanden.</div>';
    return;
  }

  grid.innerHTML = groups.map(g=>{
    const total = getGroupTotal(g.id);
    const expenses = getGroupExpenses(g.id);
    const dates = expenses.map(e=>e.date).sort();
    const dateRange = dates.length ? fmtDate(dates[0])+' – '+fmtDate(dates[dates.length-1]) : 'Noch keine Buchungen';
    const statusBadge = g.status==='closed' ? '<span style="font-size:10px;color:var(--text3);background:var(--bg3);padding:2px 6px;border-radius:4px;margin-left:4px">Geschlossen</span>' : '';

    if(g.type==='split'){
      const balances = calcSplitBalances(g.id);
      const _myId = _myGroupId();
      const _myNm = _myGroupName();
      const myBal = balances[_myId]||balances[_myNm]||0;
      const balClass = myBal>0.01?'grp-bal-pos':myBal<-0.01?'grp-bal-neg':'grp-bal-zero';
      const balText = myBal>0.01?'Du bekommst '+fmtAmt(myBal):myBal<-0.01?'Du schuldest '+fmtAmt(Math.abs(myBal)):'Ausgeglichen';
      return `<div class="grp-card grp-card-split" onclick="openGroupDetail('${g.id}')">
        <div class="grp-card-type">Split${statusBadge}</div>
        <div class="grp-card-name">${esc(g.name)}</div>
        <div class="grp-card-members">${g.members.length} Teilnehmer</div>
        <div class="grp-card-total">${fmtAmt(total)}</div>
        <div class="grp-card-bal ${balClass}">${balText}</div>
      </div>`;
    } else {
      return `<div class="grp-card grp-card-event" onclick="openGroupDetail('${g.id}')">
        <div class="grp-card-type">Event${statusBadge}</div>
        <div class="grp-card-name">${esc(g.name)}</div>
        <div class="grp-card-meta">${dateRange}</div>
        <div class="grp-card-total">${fmtAmt(total)}</div>
        <div class="grp-card-count">${expenses.length} Buchungen</div>
      </div>`;
    }
  }).join('');
}

function setGroupFilter(f){
  groupFilter = f;
  document.querySelectorAll('.grp-filter-btn').forEach(b=>b.classList.toggle('active',b.dataset.filter===f));
  renderGroups();
}

function openGroupDetail(id){
  const g = DATA.groups.find(x=>x.id===id);
  if(!g) return;
  currentGroupId = id;
  document.getElementById('groups-main').style.display='none';
  const detail = document.getElementById('group-detail');
  detail.style.display='block';
  if(g.type==='event') _renderEventDetail(g, detail);
  else _renderSplitDetail(g, detail);
}

function closeGroupDetail(){
  document.getElementById('groups-main').style.display='';
  document.getElementById('group-detail').style.display='none';
  currentGroupId = null;
  renderGroups();
}

/** Build the action buttons for group detail header based on status. */
function _groupDetailActions(g){
  const isAdmin = isGroupAdmin(g);
  const left = hasLeftGroup(g);
  let btns = '';

  if(g.status==='active' && isAdmin){
    btns += `<button onclick="closeGroup('${g.id}')" class="grp-action-btn" title="Gruppe schliessen">
      <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
    </button>`;
  }
  if(g.status==='closed' && !left){
    btns += `<button onclick="leaveGroup('${g.id}')" class="grp-action-btn" title="Gruppe verlassen">
      <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
    </button>`;
  }
  if(isAdmin && g.status==='archived'){
    btns += `<button onclick="deleteGroup('${g.id}')" class="grp-action-btn grp-action-del" title="Endgültig löschen">
      <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
    </button>`;
  }
  return btns;
}

/** Status badge for group detail header. */
function _groupStatusBadge(g){
  if(g.status==='closed') return ' <span style="font-size:11px;color:var(--text3);background:var(--bg3);padding:2px 8px;border-radius:4px">Geschlossen</span>';
  if(g.status==='archived') return ' <span style="font-size:11px;color:var(--text3);background:var(--bg3);padding:2px 8px;border-radius:4px">Archiviert</span>';
  return '';
}

function _renderEventDetail(g, el){
  const expenses = getGroupExpenses(g.id);
  const total = expenses.reduce((s,e)=>s+e.amt,0);
  const topCats = getGroupTopCategories(g.id);
  const isAdmin = isGroupAdmin(g);

  let html = `<div class="grp-detail-header">
    <button class="grp-detail-back" onclick="closeGroupDetail()">
      <svg viewBox="0 0 24 24" style="width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
    <div>
      <div class="grp-detail-title">${esc(g.name)}${_groupStatusBadge(g)}</div>
      <div class="grp-detail-sub">Event · ${fmtAmt(total)} total${g.adminId?' · Admin: '+esc(g.adminId):''}</div>
    </div>
    <div class="grp-detail-actions">${_groupDetailActions(g)}</div>
  </div>`;

  // Invite link section (only active groups)
  if(g.status==='active'){
    html += `<div class="grp-invite-section">
      <button class="grp-invite-btn" onclick="copyGroupInviteLink('${g.id}')">
        <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        Einladungslink kopieren
      </button>
      ${isAdmin?`<button class="grp-invite-regen" onclick="regenerateInviteCode('${g.id}')" title="Neuen Code generieren">
        <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.08-4.36"/></svg>
      </button>`:''}
    </div>`;
  }

  // Verlauf integration toggle
  const gvOn = !!(CFG.groupVerlauf||{})[g.id];
  html += `<div class="grp-verlauf-toggle-row">
    <div class="grp-verlauf-toggle-info">
      <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;flex-shrink:0"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      <div>
        <div style="font-size:13px;font-weight:600">Im Verlauf anzeigen</div>
        <div style="font-size:11px;color:var(--text3)">Dein Anteil erscheint als Schatten-Buchung</div>
      </div>
    </div>
    <div class="toggle-switch ${gvOn?'on':''}" onclick="toggleGroupVerlauf('${g.id}')"></div>
  </div>`;

  // Top categories
  if(topCats.length){
    html += '<div class="grp-section-title">Top Kategorien</div><div class="grp-top-cats">';
    topCats.forEach(c=>{
      const pct = total>0 ? Math.round(c.total/total*100) : 0;
      html += `<div class="grp-cat-row">
        <span class="grp-cat-dot" style="background:${catColor(c.name)}"></span>
        <span class="grp-cat-name">${esc(c.name)}</span>
        <span class="grp-cat-bar"><span style="width:${pct}%;background:${catColor(c.name)}"></span></span>
        <span class="grp-cat-amt">${fmtAmt(c.total)}</span>
      </div>`;
    });
    html += '</div>';
  }

  // Transactions — ALL from DATA.groupEntries
  const allTx = (DATA.groupEntries||[])
    .filter(e=>e.groupId===g.id)
    .sort((a,b)=>b.date.localeCompare(a.date));

  html += '<div class="grp-section-title">Buchungen</div><div class="grp-tx-list">';
  if(!allTx.length) html += '<div class="t-muted">Noch keine Buchungen.</div>';
  allTx.forEach(e=>{
    const authorTag = e.isMine ? '' : ' · '+esc(e.authorName);
    const isSettlement = e.splitData && e.splitData.isSettlement;
    const editedTag = e.editedAt ? ' · bearbeitet' : '';
    html += `<div class="grp-tx-row${!e.isMine?' group-foreign-entry':''}">
      <div class="grp-tx-left">
        <div class="grp-tx-what">${esc(e.what)}</div>
        <div class="grp-tx-meta">${fmtDate(e.date)} · ${esc(e.cat)}${authorTag}${editedTag}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <div class="grp-tx-amt">${fmtAmt(e.amt)}</div>
        ${g.status==='active' && !isSettlement ? `<button class="grp-entry-del-btn" onclick="event.stopPropagation();deleteGroupEntry('${e.id}','${g.id}')" title="Löschen">✕</button>` : ''}
      </div>
    </div>`;
  });
  html += '</div>';

  // Export button
  html += `<div style="padding:16px"><button class="save-btn" onclick="exportGroupReport('${g.id}')" style="width:100%">Reisebericht exportieren</button></div>`;

  el.innerHTML = html;
}

function _renderSplitDetail(g, el){
  const expenses = getGroupExpenses(g.id);
  const total = expenses.reduce((s,e)=>s+e.amt,0);
  const balances = calcSplitBalances(g.id);
  const isAdmin = isGroupAdmin(g);

  let html = `<div class="grp-detail-header">
    <button class="grp-detail-back" onclick="closeGroupDetail()">
      <svg viewBox="0 0 24 24" style="width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
    <div>
      <div class="grp-detail-title">${esc(g.name)}${_groupStatusBadge(g)}</div>
      <div class="grp-detail-sub">Split · ${g.members.length} Teilnehmer${g.adminId?' · Admin: '+esc(g.adminId):''}</div>
    </div>
    <div class="grp-detail-actions">${_groupDetailActions(g)}</div>
  </div>`;

  // Invite link section (only active groups)
  if(g.status==='active'){
    html += `<div class="grp-invite-section">
      <button class="grp-invite-btn" onclick="copyGroupInviteLink('${g.id}')">
        <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        Einladungslink kopieren
      </button>
      ${isAdmin?`<button class="grp-invite-regen" onclick="regenerateInviteCode('${g.id}')" title="Neuen Code generieren">
        <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.08-4.36"/></svg>
      </button>`:''}
    </div>`;
  }

  // Verlauf integration toggle
  const gvOn = !!(CFG.groupVerlauf||{})[g.id];
  html += `<div class="grp-verlauf-toggle-row">
    <div class="grp-verlauf-toggle-info">
      <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;flex-shrink:0"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      <div>
        <div style="font-size:13px;font-weight:600">Im Verlauf anzeigen</div>
        <div style="font-size:11px;color:var(--text3)">Dein Anteil erscheint als Schatten-Buchung</div>
      </div>
    </div>
    <div class="toggle-switch ${gvOn?'on':''}" onclick="toggleGroupVerlauf('${g.id}')"></div>
  </div>`;

  // Members section with admin controls
  const leftMembers = g.leftMembers||[];
  html += '<div class="grp-section-title">Mitglieder</div><div class="grp-members-list">';
  g.members.forEach(m=>{
    const isAdminMember = m===g.adminId;
    const hasLeft = leftMembers.includes(m);
    const leftBadge = hasLeft ? ' <span style="font-size:10px;color:var(--text3)">(ausgetreten)</span>' : '';
    html += `<div class="grp-member-row">
      <span class="grp-member-name">${esc(m)}${isAdminMember?' <span class="grp-admin-badge">Admin</span>':''}${leftBadge}</span>
      ${isAdmin && !isAdminMember && !hasLeft && g.status==='active'?`<button class="grp-member-remove" onclick="kickMember('${g.id}','${esc(m)}')" title="Entfernen">✕</button>`:''}
    </div>`;
  });
  html += '</div>';

  // Balances matrix
  html += '<div class="grp-section-title">Salden</div><div class="grp-balances">';
  for(const [member, bal] of Object.entries(balances)){
    const cls = bal>0.01?'grp-bal-pos':bal<-0.01?'grp-bal-neg':'grp-bal-zero';
    const label = bal>0.01?'bekommt '+fmtAmt(bal):bal<-0.01?'schuldet '+fmtAmt(Math.abs(bal)):'ausgeglichen';
    html += `<div class="grp-balance-row ${cls}">
      <span class="grp-balance-name">${esc(member)}</span>
      <span class="grp-balance-val">${label}</span>
    </div>`;
  }
  html += '</div>';

  // Settlements — debts to settle
  const debts = calculateGroupBalances(g.id);
  if(debts.length && g.status==='active'){
    const splitMyId = _myGroupId();
    const splitMyName = _myGroupName();
    html += '<div class="grp-section-title">Abrechnung</div><div class="grp-settlements">';
    debts.forEach(debt=>{
      const isMe = debt.from===splitMyId || debt.from===splitMyName;
      html += `<div class="debt-row${isMe?' debt-mine':''}">
        <div class="debt-info">
          <span class="debt-from">${esc(debt.from)}</span>
          <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:var(--text3);fill:none;stroke-width:2;flex-shrink:0"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          <span class="debt-to">${esc(debt.to)}</span>
        </div>
        <div class="debt-right">
          <span class="debt-amt">${curr()} ${fmtAmt(debt.amount)}</span>
          ${isMe?`<button class="btn-settle" onclick="confirmSettleUp('${g.id}','${esc(debt.from)}','${esc(debt.to)}',${debt.amount})">Begleichen</button>`:''}
        </div>
      </div>`;
    });
    html += '</div>';
  } else if(!debts.length && Object.keys(balances).length){
    html += '<div class="grp-section-title">Abrechnung</div><div style="padding:8px 16px;font-size:13px;color:var(--green);font-weight:600">Alles beglichen</div>';
  }

  // Transactions — ALL from DATA.groupEntries
  const allTx = (DATA.groupEntries||[])
    .filter(e=>e.groupId===g.id)
    .sort((a,b)=>b.date.localeCompare(a.date));

  html += '<div class="grp-section-title">Buchungen</div><div class="grp-tx-list">';
  if(!allTx.length) html += '<div class="t-muted">Noch keine Buchungen.</div>';
  allTx.forEach(e=>{
    const sd = e.splitData;
    const payer = sd ? sd.payerId : '';
    const authorTag = e.isMine ? '' : ' · '+esc(e.authorName);
    const isSettlement = sd && sd.isSettlement;
    const editedTag = e.editedAt ? ' · bearbeitet' : '';
    html += `<div class="grp-tx-row${!e.isMine?' group-foreign-entry':''}">
      <div class="grp-tx-left">
        <div class="grp-tx-what">${esc(e.what)}</div>
        <div class="grp-tx-meta">${fmtDate(e.date)}${payer?' · bezahlt von '+esc(payer):''}${authorTag}${editedTag}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <div class="grp-tx-amt">${fmtAmt(e.amt)}</div>
        ${g.status==='active' && !isSettlement ? `<button class="grp-entry-del-btn" onclick="event.stopPropagation();deleteGroupEntry('${e.id}','${g.id}')" title="Löschen">✕</button>` : ''}
      </div>
    </div>`;
  });
  html += '</div>';

  el.innerHTML = html;
}

// New Group Modal
function openNewGroupModal(){
  const body = `
    <div class="form-group">
      <label class="form-label">Name</label>
      <input id="grp-name" class="form-input" type="text" placeholder="z.B. Malta Urlaub 2026">
    </div>
    <div class="form-group">
      <label class="form-label">Typ</label>
      <select id="grp-type" class="form-select" onchange="onGrpTypeChange()">
        <option value="event">Event / Reise</option>
        <option value="split">Geteilte Kosten</option>
      </select>
    </div>
    <div id="grp-members-wrap">
      <label class="form-label">Teilnehmer <span class="t-text3">(kommagetrennt)</span></label>
      <input id="grp-members" class="form-input" type="text" placeholder="${esc(_myGroupId()||'Ich')}, Max, Anna" value="${esc(_myGroupId()||'Ich')}">
    </div>
    <div class="form-group">
      <label class="form-label">Währung</label>
      <input id="grp-currency" class="form-input" type="text" value="${esc(CFG.currency||'CHF')}" maxlength="5">
    </div>`;
  const actions = `<button class="save-btn" onclick="confirmNewGroup()" style="width:100%">Gruppe erstellen</button>`;
  openGenericModal('Neue Gruppe', body, actions);
}

function onGrpTypeChange(){
  const type = document.getElementById('grp-type')?.value;
  const wrap = document.getElementById('grp-members-wrap');
  if(wrap) wrap.style.display = type==='event'?'none':'';
}

async function confirmNewGroup(){
  const name = document.getElementById('grp-name')?.value.trim();
  const type = document.getElementById('grp-type')?.value||'event';
  const membersRaw = document.getElementById('grp-members')?.value||CFG.userName||'Ich';
  const currency = document.getElementById('grp-currency')?.value.trim()||CFG.currency||'CHF';
  if(!name){ toast('Name erforderlich','err'); return; }
  const members = type==='event'
    ? [_myGroupId()||'Ich']
    : membersRaw.split(',').map(s=>s.trim()).filter(Boolean);
  if(type==='split' && members.length<2){ toast('Mind. 2 Teilnehmer für Split','err'); return; }
  const group = await saveGroup(name, type, members, currency);
  if(!group) return;
  closeGenericModal();
  toast('Gruppe erstellt','ok');
  renderGroups();
}

// Group dropdown in entry form
function fillGroupDropdown(){
  const sel = document.getElementById('f-group');
  if(!sel) return;
  const myId = _myGroupId();
  const myName = _myGroupName();
  const activeGroups = DATA.groups.filter(g=>g.status==='active' && (g.members.includes(myId) || g.members.includes(myName)));
  sel.innerHTML = '<option value="">— Keine Gruppe —</option>' +
    activeGroups.map(g=>`<option value="${g.id}">${esc(g.name)} (${g.type==='split'?'Split':'Event'})</option>`).join('');
}

function onGroupSelect(groupId){
  const sec = document.getElementById('f-split-section');
  if(!groupId || !sec){ if(sec) sec.style.display='none'; return; }
  const group = DATA.groups.find(g=>g.id===groupId);
  if(!group){ sec.style.display='none'; return; }
  if(group.type==='split'){
    sec.style.display='';
    const payerSel = document.getElementById('f-split-payer');
    const myPayerId = _myGroupId();
    if(payerSel) payerSel.innerHTML = group.members.map(m=>`<option value="${esc(m)}"${m===myPayerId?' selected':''}>${esc(m)}</option>`).join('');
    document.getElementById('f-split-mode').value='equal';
    _renderSplitShares(group);
  } else {
    sec.style.display='none';
  }
}

function onSplitModeChange(){
  const groupId = document.getElementById('f-group')?.value;
  const group = groupId ? DATA.groups.find(g=>g.id===groupId) : null;
  if(group) _renderSplitShares(group);
}

function _renderSplitShares(group){
  const container = document.getElementById('f-split-shares');
  if(!container) return;
  const mode = document.getElementById('f-split-mode')?.value||'equal';
  if(mode==='equal'){
    container.innerHTML = `<div class="t-muted" style="font-size:12px;padding:6px 0">Gleichmässig auf ${group.members.length} Personen aufgeteilt</div>`;
  } else {
    container.innerHTML = group.members.map(m=>`<div class="form-row" style="margin-bottom:6px">
      <label class="form-label" style="flex:1;font-size:13px;margin:0;line-height:36px">${esc(m)}</label>
      <input id="f-split-share-${CSS.escape(m)}" class="form-input" type="number" step="0.01" min="0" style="width:100px;text-align:right" placeholder="0.00">
    </div>`).join('');
  }
}

// Export group report as text
function exportGroupReport(groupId){
  const g = DATA.groups.find(x=>x.id===groupId);
  if(!g) return;
  const expenses = getGroupExpenses(groupId).sort((a,b)=>a.date.localeCompare(b.date));
  const total = expenses.reduce((s,e)=>s+e.amt,0);
  let text = `Reisebericht: ${g.name}\n${'='.repeat(40)}\n\n`;
  text += `Typ: ${g.type==='event'?'Event/Reise':'Split'}\n`;
  text += `Währung: ${g.currency}\nGesamt: ${fmtAmt(total)}\n\n`;
  text += `Buchungen:\n${'-'.repeat(40)}\n`;
  expenses.forEach(e=>{
    text += `${e.date}  ${e.what.padEnd(20)} ${fmtAmt(e.amt).padStart(10)}  ${e.cat}\n`;
  });
  const cats = getGroupTopCategories(groupId, 10);
  if(cats.length){
    text += `\nKategorien:\n${'-'.repeat(40)}\n`;
    cats.forEach(c=>{ text += `${c.name.padEnd(20)} ${fmtAmt(c.total).padStart(10)}\n`; });
  }
  const blob = new Blob([text], {type:'text/plain'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = g.name.replace(/[^a-zA-Z0-9äöüÄÖÜ ]/g,'_')+'-Bericht.txt';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Bericht heruntergeladen','ok');
}

// ── 16. Admin groups panel ───────────────────────────────────

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
    const res = await groupsApiGet('Index!A2:K5000').catch(()=>({values:[]}));
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
    const row = await groupsApiFindRow('Index', id);
    if(row) await groupsApiUpdate(`Index!F${row}`, [['archived']]);
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
    const row = await groupsApiFindRow('Index', id);
    if(row) await groupsApiUpdate(`Index!F${row}`, [['deleted']]);
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
