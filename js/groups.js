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
  if(!baseUrl) throw new Error('Keine Backend-URL konfiguriert');
  const allParams = isAccountMode ? {...params, token: CFG.sessionToken} : params;
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
  return groupsApiCall({action:'get', range});
}
function groupsApiAppend(sheet, values){
  return groupsApiCall({action:'append', sheet, values: JSON.stringify(values)});
}
function groupsApiUpdate(range, values){
  return groupsApiCall({action:'update', range, values: JSON.stringify(values)});
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

/** Current user identity — checks both account-mode and profile name. */
function _myGroupName(){
  return CFG.authUser || CFG.userName || 'Ich';
}

/** Is the current user admin of this group? */
function isGroupAdmin(group){
  if(!group) return false;
  if(!group.adminId) return true; // legacy groups without adminId
  const me = _myGroupName();
  return group.adminId === me
      || group.adminId === CFG.authUser
      || group.adminId === CFG.userName;
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
      action:'ensureSheet',
      sheet:'Groups',
      headers:JSON.stringify(['id','name','type','members','currency','status','created','adminId','inviteCode','sharedSheetUrl'])
    });
    await groupsApiCall({
      action:'ensureSheet',
      sheet:'Notifications',
      headers:JSON.stringify(['recipient','notifJSON','read'])
    });
  }catch(e){
    // If ensureSheet is not supported, silently ignore.
    // Errors during actual writes will be visible later.
    console.warn('ensureGroupsSheets:', e.message);
  }
  // Mark done even on error — we'll get real errors on the actual read/write
  _groupsSheetsEnsured = true;
}

async function loadGroups(){
  await ensureGroupsSheets();
  try{
    const res = await groupsApiGet('Groups!A2:J200');
    DATA.groups = (res.values||[])
      .filter(r=>r[0] && r[5]!=='deleted')
      .map(_rowToGroup);
  }catch(e){
    if(!DATA.groups) DATA.groups = [];
    // No toast — groups are optional
  }
}

// ── 6. CRUD ──────────────────────────────────────────────────

async function saveGroup(name, type, members, currency){
  const id = genId('G');
  const created = today();
  const adminId = _myGroupName();
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
  if(!confirm('Gruppe archivieren? Sie ist danach unter "Archiv" sichtbar.')) return;
  await updateGroup(id, {status:'archived'});
  toast('✓ Gruppe archiviert','ok');
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
    if(CFG.sessionToken){
      if(!CFG.adminUrl){ CFG.adminUrl = backendUrl; urlChanged = true; }
    } else {
      if(!CFG.scriptUrl){ CFG.scriptUrl = backendUrl; urlChanged = true; }
    }
  }
  // Invalidate ensureGroupsSheets cache if we switched to a new backend
  if(urlChanged) _groupsSheetsEnsured = false;

  let success = false;
  try{
    // Ensure sheets exist on this backend before reading
    await ensureGroupsSheets();

    // Fetch all groups from backend to find the one we're joining
    const res = await groupsApiGet('Groups!A2:J200').catch(()=>({values:[]}));
    const rows = (res.values||[]).filter(r=>r[0]);
    const row = rows.find(r=>r[0]===groupId);
    if(!row){ toast('Gruppe nicht gefunden','err'); return false; }

    const g = _rowToGroup(row);
    if(g.inviteCode !== inviteCode){ toast('Ungültiger Einladungscode','err'); return false; }
    if(g.status === 'deleted'){ toast('Gruppe wurde gelöscht','err'); return false; }
    if(g.status === 'archived'){ toast('Diese Gruppe ist archiviert','err'); return false; }

    const me = _myGroupName();
    if(g.members.includes(me)){
      toast('Du bist bereits Mitglied','info');
      // Still make sure group is in local DATA
      if(!DATA.groups.find(x=>x.id===groupId)) DATA.groups.push(g);
      success = true;
      return true;
    }

    // Add member
    g.members.push(me);

    // Write back to backend
    const sheetRow = rows.indexOf(row) + 2; // +2 for header + 0-index
    await groupsApiUpdate(`Groups!D${sheetRow}`, [[JSON.stringify(g.members)]]);

    // Merge into local DATA
    const existing = DATA.groups.find(x=>x.id===groupId);
    if(existing) Object.assign(existing, g);
    else DATA.groups.push(g);

    dataCacheSave();
    toast('✓ Gruppe beigetreten: '+g.name,'ok');
    markDirty('groups');
    success = true;
    return true;
  }catch(e){
    toast('Fehler beim Beitreten: '+e.message,'err');
    return false;
  }finally{
    // Restore original URLs on failure to avoid persisting a wrong backend URL
    if(!success && urlChanged){
      CFG.adminUrl = origAdminUrl;
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
  const payerId = document.getElementById('f-split-payer')?.value||_myGroupName();
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

async function settleUp(groupId, from, to, amount){
  const id = genId('A');
  const date = today();
  const what = 'Ausgleich: '+from+' → '+to;
  const splitData = {totalAmount:amount, payerId:from, participants:{[to]:amount}};
  const entry = {id,date,what,cat:'Transfer',amt:amount,note:'Settlement',recurringId:'',isFixkosten:false,groupId,splitData};
  DATA.expenses.push(entry);
  if(!CFG.demo){
    setSyncStatus('syncing');
    try{
      await apiAppend('Ausgaben',[[id,date,what,'Transfer',amount,'Settlement','','0',groupId,JSON.stringify(splitData)]]);
      setSyncStatus('online');
    }catch(e){ setSyncStatus('error'); toast('Sync-Fehler: '+e.message,'err'); }
  }
  dataCacheSave();
  toast('✓ Ausgleich gebucht','ok');
  // Push notification to other group members
  const group = DATA.groups.find(g=>g.id===groupId);
  if(group) pushGroupNotification(group, entry);
  markDirty('groups','verlauf');
}

// ── 11. Group notifications ──────────────────────────────────
// Admin-Sheet tab "Notifications": A=recipientUser, B=notifJSON, C=read(0/1)

/**
 * Push a group_activity notification to all other members of a group.
 * Writes one row per recipient into the Notifications tab.
 */
async function pushGroupNotification(group, entry){
  if(CFG.demo || !group || !group.members) return;
  const me = _myGroupName();
  const recipients = group.members.filter(m=>m!==me);
  if(!recipients.length) return;

  const notif = {
    id: genId('N'),
    type: 'group_activity',
    groupId: group.id,
    groupName: group.name,
    actorName: me,
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
    const me = _myGroupName();
    if(!CFG.notifications) CFG.notifications = [];
    const existingIds = new Set(CFG.notifications.map(n=>n.id));

    for(const row of rows){
      if(row[0]!==me) continue; // not for us
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
    const me = _myGroupName();
    for(let i=0;i<rows.length;i++){
      if(rows[i][0]===me && rows[i][2]!=='1'){
        const sheetRow = i+2; // +2 for header+0-index
        await groupsApiUpdate(`Notifications!C${sheetRow}`, [['1']]);
      }
    }
  }catch(e){
    console.warn('markGroupNotifsRead failed:', e.message);
  }
}

// ── 12. Admin groups panel ───────────────────────────────────

async function renderAdminGroupsPanel(){
  const container = document.getElementById('admin-groups-list');
  if(!container) return;
  container.innerHTML = '<div class="t-muted" style="padding:12px 0;text-align:center">Lade Gruppen…</div>';

  try{
    const res = await groupsApiGet('Groups!A2:J200').catch(()=>({values:[]}));
    const groups = (res.values||[]).filter(r=>r[0]).map(_rowToGroup).filter(g=>g.status!=='deleted');

    if(!groups.length){
      container.innerHTML = '<div class="t-muted" style="padding:12px 0;text-align:center">Keine Gruppen vorhanden.</div>';
      return;
    }

    container.innerHTML = groups.map(g=>{
      const memberCount = g.members.length;
      const statusBadge = g.status==='archived'
        ? '<span style="font-size:10px;color:var(--text3);background:var(--bg3);padding:2px 6px;border-radius:4px;margin-left:6px">Archiviert</span>'
        : '<span style="font-size:10px;color:var(--accent);background:rgba(200,245,60,.1);padding:2px 6px;border-radius:4px;margin-left:6px">Aktiv</span>';
      const typeBadge = g.type==='split'
        ? '<span style="font-size:10px;color:#8b5cf6;margin-left:4px">Split</span>'
        : '<span style="font-size:10px;color:var(--accent);margin-left:4px">Event</span>';

      return `<div class="card" style="padding:12px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <div>
            <span style="font-weight:600;font-size:14px">${esc(g.name)}</span>
            ${typeBadge}${statusBadge}
          </div>
          <div style="display:flex;gap:4px">
            ${g.status==='active'?`<button class="grp-action-btn" onclick="adminArchiveGroup('${g.id}')" title="Archivieren" style="font-size:11px;padding:3px 8px;border:1px solid var(--border);border-radius:5px;background:var(--bg2);cursor:pointer;color:var(--text2)">Archiv</button>`:''}
            <button class="grp-action-btn grp-action-del" onclick="adminDeleteGroup('${g.id}')" title="Löschen" style="font-size:11px;padding:3px 8px;border:1px solid rgba(255,77,109,.3);border-radius:5px;background:rgba(255,77,109,.06);cursor:pointer;color:#ff4d6d">Löschen</button>
          </div>
        </div>
        <div style="font-size:12px;color:var(--text2);display:flex;gap:12px;flex-wrap:wrap">
          <span>Admin: ${esc(g.adminId||'–')}</span>
          <span>${memberCount} Mitglieder</span>
          <span>Erstellt: ${g.created?fmtDate(g.created):'–'}</span>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">
          Mitglieder: ${g.members.map(m=>esc(m)).join(', ')}
        </div>
      </div>`;
    }).join('');
  }catch(e){
    container.innerHTML = '<div class="t-muted" style="padding:12px 0;text-align:center">Fehler beim Laden: '+esc(e.message)+'</div>';
  }
}

/** Admin: archive any group (no permission check — admin panel). */
async function adminArchiveGroup(id){
  if(!confirm('Gruppe archivieren?')) return;
  try{
    const row = await groupsApiFindRow('Groups', id);
    if(row) await groupsApiUpdate(`Groups!F${row}`, [['archived']]);
    const local = DATA.groups.find(x=>x.id===id);
    if(local) local.status = 'archived';
    dataCacheSave();
    toast('✓ Archiviert','ok');
    renderAdminGroupsPanel();
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
    DATA.expenses.forEach(e=>{ if(e.groupId===id){ delete e.groupId; delete e.splitData; } });
    DATA.incomes.forEach(e=>{ if(e.groupId===id) delete e.groupId; });
    dataCacheSave();
    toast('✓ Gelöscht','ok');
    renderAdminGroupsPanel();
    markDirty('groups');
  }catch(e){ toast('Fehler: '+e.message,'err'); }
}
