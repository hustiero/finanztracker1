/* ui-groups.js: Groups & Events UI + Admin Panel — split from js/ui.js */

// ═══════════════════════════════════════════════════════════════
// GROUPS & EVENTS — UI
// ═══════════════════════════════════════════════════════════════

let groupFilter = 'all';
let currentGroupId = null;

function renderGroups(){
  const grid = document.getElementById('groups-grid');
  if(!grid) return;
  const myId = _myGroupId();
  const myNm = _myGroupName();
  let groups = DATA.groups.filter(g=>g.status!=='deleted' && (g.members.includes(myId) || g.members.includes(myNm)));

  if(groupFilter==='archived') groups = groups.filter(g=>g.status==='archived');
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

    if(g.type==='split'){
      const balances = calcSplitBalances(g.id);
      const _myId = _myGroupId();
      const _myNm = _myGroupName();
      const myBal = balances[_myId]||balances[_myNm]||0;
      const balClass = myBal>0.01?'grp-bal-pos':myBal<-0.01?'grp-bal-neg':'grp-bal-zero';
      const balText = myBal>0.01?'Du bekommst '+fmtAmt(myBal):myBal<-0.01?'Du schuldest '+fmtAmt(Math.abs(myBal)):'Ausgeglichen';
      return `<div class="grp-card grp-card-split" onclick="openGroupDetail('${g.id}')">
        <div class="grp-card-type">Split</div>
        <div class="grp-card-name">${esc(g.name)}</div>
        <div class="grp-card-members">${g.members.length} Teilnehmer</div>
        <div class="grp-card-total">${fmtAmt(total)}</div>
        <div class="grp-card-bal ${balClass}">${balText}</div>
      </div>`;
    } else {
      return `<div class="grp-card grp-card-event" onclick="openGroupDetail('${g.id}')">
        <div class="grp-card-type">Event</div>
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
      <div class="grp-detail-title">${esc(g.name)}</div>
      <div class="grp-detail-sub">Event · ${fmtAmt(total)} total${g.adminId?' · Admin: '+esc(g.adminId):''}</div>
    </div>
    <div class="grp-detail-actions">
      ${isAdmin && g.status==='active'?`<button onclick="archiveGroup('${g.id}')" class="grp-action-btn" title="Archivieren">
        <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
      </button>`:''}
      ${isAdmin?`<button onclick="deleteGroup('${g.id}')" class="grp-action-btn grp-action-del" title="Löschen">
        <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>`:''}
      ${!isAdmin?`<button onclick="leaveGroup('${g.id}')" class="grp-action-btn" title="Gruppe verlassen" style="color:var(--text2)">
        <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </button>`:''}
    </div>
  </div>`;

  // Invite link section
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

  // Transactions (own + foreign) — with delete button for own entries
  const myId = _myGroupId();
  const myName = _myGroupName();
  const foreignEntries = (DATA.groupEntries||[]).filter(e=>e.groupId===g.id && !e.isMine);
  const allTx = [
    ...expenses.map(e=>({...e, _author:'', _isOwn:true, _source:'local'})),
    ...foreignEntries.map(e=>({...e, _author:e.authorName, _isOwn:false, _source:'group'}))
  ].sort((a,b)=>b.date.localeCompare(a.date));

  // Also include own entries from groupEntries (for entries saved to group tab)
  const ownGroupEntries = (DATA.groupEntries||[]).filter(e=>e.groupId===g.id && e.isMine);
  const localIds = new Set(expenses.map(e=>e.id));
  ownGroupEntries.forEach(e=>{
    if(!localIds.has(e.id)){
      allTx.push({...e, _author:'', _isOwn:true, _source:'group'});
    }
  });
  allTx.sort((a,b)=>b.date.localeCompare(a.date));

  html += '<div class="grp-section-title">Buchungen</div><div class="grp-tx-list">';
  if(!allTx.length) html += '<div class="t-muted">Noch keine Buchungen.</div>';
  allTx.forEach(e=>{
    const authorTag = e._author ? ` · ${esc(e._author)}` : '';
    const canDelete = e._isOwn || isAdmin;
    const isSettlement = e.splitData && e.splitData.isSettlement;
    const editedTag = e.editedAt ? ' · bearbeitet' : '';
    html += `<div class="grp-tx-row${e._author?' group-foreign-entry':''}">
      <div class="grp-tx-left">
        <div class="grp-tx-what">${esc(e.what)}</div>
        <div class="grp-tx-meta">${fmtDate(e.date)} · ${esc(e.cat)}${authorTag}${editedTag}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <div class="grp-tx-amt">${fmtAmt(e.amt)}</div>
        ${canDelete && !isSettlement && e._source==='group' ? `<button class="grp-entry-del-btn" onclick="event.stopPropagation();deleteGroupEntry('${e.id}','${g.id}')" title="Löschen">✕</button>` : ''}
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
  const settlements = calcSettlements(g.id);
  const isAdmin = isGroupAdmin(g);

  let html = `<div class="grp-detail-header">
    <button class="grp-detail-back" onclick="closeGroupDetail()">
      <svg viewBox="0 0 24 24" style="width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
    <div>
      <div class="grp-detail-title">${esc(g.name)}</div>
      <div class="grp-detail-sub">Split · ${g.members.length} Teilnehmer${g.adminId?' · Admin: '+esc(g.adminId):''}</div>
    </div>
    <div class="grp-detail-actions">
      ${isAdmin && g.status==='active'?`<button onclick="archiveGroup('${g.id}')" class="grp-action-btn" title="Archivieren">
        <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
      </button>`:''}
      ${isAdmin?`<button onclick="deleteGroup('${g.id}')" class="grp-action-btn grp-action-del" title="Löschen">
        <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>`:''}
      ${!isAdmin?`<button onclick="leaveGroup('${g.id}')" class="grp-action-btn" title="Gruppe verlassen" style="color:var(--text2)">
        <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </button>`:''}
    </div>
  </div>`;

  // Invite link section
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
  html += '<div class="grp-section-title">Mitglieder</div><div class="grp-members-list">';
  g.members.forEach(m=>{
    const isAdminMember = m===g.adminId;
    html += `<div class="grp-member-row">
      <span class="grp-member-name">${esc(m)}${isAdminMember?' <span class="grp-admin-badge">Admin</span>':''}</span>
      ${isAdmin && !isAdminMember?`<button class="grp-member-remove" onclick="removeGroupMember('${g.id}','${esc(m)}')" title="Entfernen">✕</button>`:''}
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

  // Settlements — using calculateGroupBalances for combined local+foreign entries
  const debts = calculateGroupBalances(g.id);
  const splitMyId = _myGroupId();
  const splitMyName = _myGroupName();
  if(debts.length && g.status==='active'){
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

  // Transactions (own + foreign) — with delete button for own entries
  const foreignTx = (DATA.groupEntries||[]).filter(e=>e.groupId===g.id && !e.isMine);
  const allSplitTx = [
    ...expenses.map(e=>({...e, _author:'', _isOwn:true, _source:'local'})),
    ...foreignTx.map(e=>({...e, _author:e.authorName, _isOwn:false, _source:'group'}))
  ];

  // Include own entries from groupEntries that aren't in local expenses
  const ownGE = (DATA.groupEntries||[]).filter(e=>e.groupId===g.id && e.isMine);
  const localExpIds = new Set(expenses.map(e=>e.id));
  ownGE.forEach(e=>{
    if(!localExpIds.has(e.id)){
      allSplitTx.push({...e, _author:'', _isOwn:true, _source:'group'});
    }
  });
  allSplitTx.sort((a,b)=>b.date.localeCompare(a.date));

  html += '<div class="grp-section-title">Buchungen</div><div class="grp-tx-list">';
  if(!allSplitTx.length) html += '<div class="t-muted">Noch keine Buchungen.</div>';
  allSplitTx.forEach(e=>{
    const sd = e.splitData;
    const payer = sd ? (typeof sd==='string'?JSON.parse(sd):sd).payerId : '';
    const authorTag = e._author ? ` · ${esc(e._author)}` : '';
    const canDelete = e._isOwn || isAdmin;
    const isSettlement = sd && sd.isSettlement;
    const editedTag = e.editedAt ? ' · bearbeitet' : '';
    html += `<div class="grp-tx-row${e._author?' group-foreign-entry':''}">
      <div class="grp-tx-left">
        <div class="grp-tx-what">${esc(e.what)}</div>
        <div class="grp-tx-meta">${fmtDate(e.date)}${payer?' · bezahlt von '+esc(payer):''}${authorTag}${editedTag}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <div class="grp-tx-amt">${fmtAmt(e.amt)}</div>
        ${canDelete && !isSettlement && e._source==='group' ? `<button class="grp-entry-del-btn" onclick="event.stopPropagation();deleteGroupEntry('${e.id}','${g.id}')" title="Löschen">✕</button>` : ''}
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
  const myId = _myGroupId();
  let members;
  if(type==='event'){
    members = [myId||'Ich'];
  } else {
    members = membersRaw.split(',').map(s=>s.trim()).filter(Boolean);
    // Replace display-name with authUser so the creator is stored by their
    // canonical account username, not the device-local display name.
    if(myId && CFG.userName && myId !== CFG.userName){
      members = members.map(m => m === CFG.userName ? myId : m);
    }
  }
  if(type==='split' && members.length<2){ toast('Mind. 2 Teilnehmer für Split','err'); return; }
  const group = await saveGroup(name, type, members, currency);
  if(!group) return;
  closeGenericModal();
  toast('✓ Gruppe erstellt','ok');
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
    // Fill payer dropdown
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

// copyGroupInviteLink() moved to js/groups.js

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

  // Top categories
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
  toast('✓ Bericht heruntergeladen','ok');
}

// ─── Admin Panel ─────────────────────────────────────────────

// ─── Admin: user cache & pagination state ────────────────────
let _adminUserCache = null;
const _USER_PAGE_SIZE = 50;
let _userPageShown = 0;

async function renderAdmin(){
  if(CFG.authRole!=='admin') return;
  const invEl = document.getElementById('admin-invite-link');
  if(invEl) invEl.textContent = _buildInviteUrl();
  renderAdminDesignPresets();
  // Admin groups panel is now lazy-loaded via toggleAdminGroupsPanel()
  _renderAdminScriptUrl();
  _fetchPendingRegistrations();
}

// ─── Script-URL Management ────────────────────────────────

async function _renderAdminScriptUrl(){
  const inp = document.getElementById('admin-script-url-input');
  if(inp && !inp.value) inp.value = CFG.adminUrl || '';
  // Show current active URL
  const curEl = document.getElementById('admin-current-url');
  if(curEl) curEl.textContent = CFG.adminUrl || '–';
  // Fetch history from backend
  try{
    const r = await fetch(CFG.adminUrl+'?'+new URLSearchParams({action:'get_app_config'}));
    const d = await r.json();
    if(d.config && d.config.adminUrl){
      const entry = d.config.adminUrl;
      if(inp && !inp.value) inp.value = entry.value || CFG.adminUrl || '';
      if(curEl && entry.value) curEl.textContent = entry.value;
      _renderUrlHistory(entry);
    }
  }catch(e){ /* silent */ }
}

function _renderUrlHistory(entry){
  const el = document.getElementById('admin-url-history');
  if(!el) return;
  const hist = entry.history || [];
  if(!hist.length){ el.innerHTML = ''; return; }
  el.innerHTML = `
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--text3);margin-bottom:5px">Verlauf</div>
    <div style="display:flex;flex-direction:column;gap:4px">
      ${hist.map(h=>`
        <div style="background:var(--bg3);border-radius:6px;padding:6px 8px">
          <div style="font-size:10px;font-family:'DM Mono',monospace;color:var(--text2);word-break:break-all">${esc(h.url)}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px">${h.changedAt ? h.changedAt.slice(0,16).replace('T',' ') : '–'}</div>
        </div>`).join('')}
    </div>`;
}

async function adminSetScriptUrl(){
  const inp = document.getElementById('admin-script-url-input');
  const newUrl = (inp?.value||'').trim();
  if(!newUrl || !newUrl.includes('script.google.com')){ toast('Ungültige Script-URL','err'); return; }
  if(newUrl === CFG.adminUrl){ toast('URL ist bereits aktuell','info'); return; }
  try{
    const r = await fetch(CFG.adminUrl+'?'+new URLSearchParams({action:'admin_set_admin_url', token:CFG.sessionToken, newUrl}));
    const d = await r.json();
    if(d.error) throw new Error(d.error);
    CFG.adminUrl = newUrl;
    cfgSave();
    toast('✓ URL gespeichert — alle Nutzer erhalten sie beim nächsten Start','ok');
    _renderAdminScriptUrl();
    // Update invite link (was broken before — invEl is not in this scope)
    const invEl = document.getElementById('admin-invite-link');
    if(invEl) invEl.textContent = _buildInviteUrl();
  }catch(e){ toast('Fehler: '+e.message,'err'); }
}

// ─── Pending Registrations ────────────────────────────────

async function _fetchPendingRegistrations(){
  const el = document.getElementById('admin-pending-list');
  if(!el) return;
  try{
    const r = await fetch(CFG.adminUrl+'?'+new URLSearchParams({action:'admin_list_pending', token:CFG.sessionToken}));
    const d = await r.json();
    if(d.error) throw new Error(d.error);
    _renderPendingList(d.pending||[]);
  }catch(e){
    if(el) el.innerHTML = '<div style="font-size:12px;color:var(--red);text-align:center;padding:10px">'+esc(e.message)+'</div>';
  }
}

function _renderPendingList(list){
  const el = document.getElementById('admin-pending-list');
  const badge = document.getElementById('admin-pending-badge');
  if(badge){ badge.textContent = list.length; badge.style.display = list.length ? '' : 'none'; }
  if(!el) return;
  if(!list.length){
    el.innerHTML = '<div class="t-muted" style="text-align:center;padding:12px;font-size:12px">Keine ausstehenden Registrierungen.</div>';
    return;
  }
  el.innerHTML = list.map(u=>`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--text)">${esc(u.username)}</div>
        <div style="font-size:11px;color:var(--text3)">Registriert: ${u.createdAt?u.createdAt.slice(0,10):'–'}</div>
      </div>
      <div style="display:flex;gap:6px">
        <button onclick="adminApproveUser('${esc(u.username)}')" style="font-size:11px;padding:5px 10px;border-radius:6px;border:1px solid rgba(0,201,167,.3);background:rgba(0,201,167,.1);color:#00c9a7;cursor:pointer">Freischalten</button>
        <button onclick="adminRejectUser('${esc(u.username)}')" style="font-size:11px;padding:5px 10px;border-radius:6px;border:1px solid rgba(255,77,109,.3);background:rgba(255,77,109,.08);color:var(--red);cursor:pointer">Ablehnen</button>
      </div>
    </div>`).join('');
}

async function adminApproveUser(username){
  if(!confirm(`"${username}" freischalten?`)) return;
  try{
    const r = await fetch(CFG.adminUrl+'?'+new URLSearchParams({action:'admin_approve', token:CFG.sessionToken, target:username}));
    const d = await r.json();
    if(d.error) throw new Error(d.error);
    toast('✓ '+username+' freigeschaltet','ok');
    _fetchPendingRegistrations();
  }catch(e){ toast('Fehler: '+e.message,'err'); }
}

async function adminRejectUser(username){
  if(!confirm(`Registrierung von "${username}" ablehnen und Konto löschen?`)) return;
  try{
    const r = await fetch(CFG.adminUrl+'?'+new URLSearchParams({action:'admin_reject', token:CFG.sessionToken, target:username}));
    const d = await r.json();
    if(d.error) throw new Error(d.error);
    toast('✓ '+username+' abgelehnt','ok');
    _fetchPendingRegistrations();
  }catch(e){ toast('Fehler: '+e.message,'err'); }
}

// ─── User Management Overlay ─────────────────────────────────
function openUserManagement(){
  if(CFG.authRole!=='admin'){ toast('Kein Zugriff','err'); return; }
  const ov = document.getElementById('user-mgmt-overlay');
  ov.style.display = 'flex';
  document.getElementById('user-mgmt-search').value = '';
  if(_adminUserCache){
    _renderUserMgmtList(_adminUserCache);
  } else {
    _fetchAndRenderUsers();
  }
}

function closeUserManagement(){
  document.getElementById('user-mgmt-overlay').style.display = 'none';
}

function refreshUserList(){
  _adminUserCache = null;
  _fetchAndRenderUsers();
}

async function _fetchAndRenderUsers(){
  const body = document.getElementById('user-mgmt-body');
  body.innerHTML = '<div class="user-mgmt-spinner"><div class="spinner"></div><div style="margin-top:10px;font-size:12px;color:var(--text3)">Lade Benutzerliste…</div></div>';
  try{
    const r = await fetch(CFG.adminUrl+'?'+new URLSearchParams({action:'admin_list',token:CFG.sessionToken}));
    const d = await r.json();
    if(d.error) throw new Error(d.error);
    _adminUserCache = d.users || [];
    _renderUserMgmtList(_adminUserCache);
  }catch(e){
    body.innerHTML = '<div style="color:var(--red);font-size:12px;text-align:center;padding:30px 0">'+esc(e.message)+'</div>';
  }
}

function filterUsers(query){
  if(!_adminUserCache) return;
  const q = query.trim().toLowerCase();
  if(!q){ _renderUserMgmtList(_adminUserCache); return; }
  const filtered = _adminUserCache.filter(u =>
    (u.username||'').toLowerCase().includes(q) ||
    (u.email||'').toLowerCase().includes(q)
  );
  _renderUserMgmtList(filtered, true);
}

function _renderUserMgmtList(users, isFiltered){
  const body = document.getElementById('user-mgmt-body');
  if(!users.length){
    body.innerHTML = '<div class="t-muted" style="text-align:center;padding:40px 0">'+(isFiltered?'Keine Treffer.':'Noch keine Benutzer.')+'</div>';
    return;
  }
  _userPageShown = Math.min(users.length, _USER_PAGE_SIZE);
  const slice = users.slice(0, _userPageShown);
  let html = '<div class="user-mgmt-count">'+users.length+' Benutzer'+(isFiltered?' gefunden':'')+'</div>';
  html += slice.map(u => _userRowHtml(u)).join('');
  if(users.length > _userPageShown){
    html += '<button class="user-mgmt-more" onclick="_showMoreUsers()">Mehr laden ('+(_userPageShown)+'/'+users.length+')</button>';
  }
  body.innerHTML = html;
}

function _showMoreUsers(){
  const query = (document.getElementById('user-mgmt-search').value||'').trim().toLowerCase();
  let list = _adminUserCache || [];
  if(query) list = list.filter(u => (u.username||'').toLowerCase().includes(query) || (u.email||'').toLowerCase().includes(query));
  const nextEnd = Math.min(list.length, _userPageShown + _USER_PAGE_SIZE);
  const newSlice = list.slice(_userPageShown, nextEnd);
  _userPageShown = nextEnd;
  const body = document.getElementById('user-mgmt-body');
  // Remove "Mehr laden" button
  const moreBtn = body.querySelector('.user-mgmt-more');
  if(moreBtn) moreBtn.remove();
  // Append new rows
  const frag = document.createElement('div');
  frag.innerHTML = newSlice.map(u => _userRowHtml(u)).join('');
  while(frag.firstChild) body.appendChild(frag.firstChild);
  if(list.length > _userPageShown){
    const btn = document.createElement('button');
    btn.className = 'user-mgmt-more';
    btn.textContent = 'Mehr laden ('+_userPageShown+'/'+list.length+')';
    btn.onclick = _showMoreUsers;
    body.appendChild(btn);
  }
}

function _userRowHtml(u){
  const isSelf = u.username === CFG.authUser;
  const isAdmin = u.role === 'admin';
  const roleBtn = !isSelf ? `<button onclick="adminToggleRole('${esc(u.username)}','${esc(u.role)}')"
    style="font-size:11px;padding:5px 10px;border-radius:6px;cursor:pointer;
           border:1px solid ${isAdmin?'rgba(255,165,0,.35)':'rgba(200,245,60,.3)'};
           background:${isAdmin?'rgba(255,165,0,.08)':'rgba(200,245,60,.07)'};
           color:${isAdmin?'#ffa500':'var(--accent)'}"
    >${isAdmin?'→ User':'→ Admin'}</button>` : '';
  return `<div class="admin-user-row">
    <div style="min-width:0">
      <div class="admin-user-name">${esc(u.username)}<span class="admin-badge ${isAdmin?'':'user'}">${isAdmin?'Admin':'User'}</span>${isSelf?'<span style="font-size:10px;color:var(--text3);margin-left:5px">(du)</span>':''}</div>
      <div class="admin-user-meta">Erstellt: ${u.createdAt?u.createdAt.slice(0,10):'–'} · Login: ${u.lastLogin?u.lastLogin.slice(0,10):'–'}</div>
      ${u.sheetUrl?`<div class="admin-user-meta"><a href="${esc(u.sheetUrl)}" target="_blank" style="color:var(--accent);text-decoration:none;font-size:10px">Sheet öffnen ↗</a></div>`:''}
    </div>
    <div class="admin-user-actions">
      <button onclick="adminResetPw('${esc(u.username)}')" style="font-size:11px;padding:5px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer">PW Reset</button>
      ${roleBtn}
      ${!isSelf?`<button onclick="adminDeleteUser('${esc(u.username)}')" style="font-size:11px;padding:5px 10px;border-radius:6px;border:1px solid rgba(255,77,109,.3);background:rgba(255,77,109,.08);color:var(--red);cursor:pointer">Löschen</button>`:''}
    </div>
  </div>`;
}

async function adminResetPw(target){
  const newPw = prompt(`Neues temporäres Passwort für "${target}":`, '');
  if(!newPw||newPw.length<6){ toast('Mindestens 6 Zeichen','err'); return; }
  try{
    const newHash = await sha256(newPw);
    const r = await fetch(CFG.adminUrl+'?'+new URLSearchParams({action:'admin_reset_pw',token:CFG.sessionToken,target,newHash}));
    const d = await r.json();
    if(d.error) throw new Error(d.error);
    toast(`✓ PW für ${target} geändert: ${newPw}`, 'ok');
  }catch(e){ toast('Fehler: '+e.message,'err'); }
}

async function adminDeleteUser(target){
  if(!confirm(`Benutzer "${target}" und alle Session-Einträge löschen?\n\nDas persönliche Sheet wird NICHT gelöscht.`)) return;
  try{
    const r = await fetch(CFG.adminUrl+'?'+new URLSearchParams({action:'admin_delete',token:CFG.sessionToken,target}));
    const d = await r.json();
    if(d.error) throw new Error(d.error);
    toast('✓ Benutzer gelöscht','ok');
    _adminUserCache = null;
    _fetchAndRenderUsers();
  }catch(e){ toast('Fehler: '+e.message,'err'); }
}

async function adminToggleRole(target, currentRole){
  const newRole = currentRole === 'admin' ? 'user' : 'admin';
  const label = newRole === 'admin' ? 'zum Admin befördern' : 'Admin-Rolle entziehen';
  if(!confirm(`"${target}" ${label}?`)) return;
  try{
    const r = await fetch(CFG.adminUrl+'?'+new URLSearchParams({action:'admin_set_role',token:CFG.sessionToken,target,newRole}));
    const d = await r.json();
    if(d.error) throw new Error(d.error);
    toast(`✓ ${target} ist jetzt ${newRole==='admin'?'Admin':'User'}`, 'ok');
    _adminUserCache = null;
    _fetchAndRenderUsers();
  }catch(e){ toast('Fehler: '+e.message,'err'); }
}

function _buildInviteUrl(){
  let invUrl = window.location.origin + window.location.pathname + '?adminUrl=' + encodeURIComponent(CFG.adminUrl);
  const dd = CFG.adminDefaultDesign;
  if(dd) invUrl += '&design=' + encodeURIComponent(JSON.stringify(dd));
  return invUrl;
}
function copyInviteLink(){
  const invUrl = _buildInviteUrl();
  if(navigator.clipboard) navigator.clipboard.writeText(invUrl).then(()=>toast('✓ Einladungslink kopiert','ok')).catch(()=>toast('Clipboard n/a','err'));
  else{ const ta=document.createElement('textarea');ta.value=invUrl;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);toast('✓ Einladungslink kopiert','ok'); }
}

// Admin: set default design for new users (embedded in invite link)
function renderAdminDesignPresets(){
  const grid = document.getElementById('admin-design-presets'); if(!grid) return;
  const dd = CFG.adminDefaultDesign || DEFAULT_DESIGN;
  grid.innerHTML = Object.entries(BG_PRESETS).map(([key, p])=>{
    const isActive = dd.bgPreset===key;
    return `<div onclick="setAdminDefaultBg('${key}')" style="
      height:44px;border-radius:var(--r2);cursor:pointer;
      background:${p.gradient};
      border:2px solid ${isActive?'var(--accent)':'transparent'};
      transition:border .15s;position:relative;overflow:hidden">
      <div style="position:absolute;bottom:3px;left:0;right:0;text-align:center;font-size:9px;font-weight:600;color:rgba(255,255,255,0.75);text-shadow:0 1px 3px rgba(0,0,0,.8)">${p.label}</div>
    </div>`;
  }).join('');
  const glassSw = document.getElementById('admin-glass-sw');
  if(glassSw) glassSw.classList.toggle('on', !!dd.glassEnabled);
  const detail = document.getElementById('admin-glass-detail');
  if(detail) detail.style.display = dd.glassEnabled ? '' : 'none';
  const blurSlider = document.getElementById('admin-glass-blur-slider');
  if(blurSlider) blurSlider.value = dd.glassBlur||14;
  const blurVal = document.getElementById('admin-glass-blur-val');
  if(blurVal) blurVal.textContent = (dd.glassBlur||14)+'px';
  const alphaSlider = document.getElementById('admin-glass-alpha-slider');
  if(alphaSlider) alphaSlider.value = dd.glassAlpha||45;
  const alphaVal = document.getElementById('admin-glass-alpha-val');
  if(alphaVal) alphaVal.textContent = (dd.glassAlpha||45)+'%';
  // Accent color presets
  const accentGrid = document.getElementById('admin-accent-presets');
  if(accentGrid){
    const isLight = document.documentElement.dataset.theme === 'light';
    const curAccent = dd.accentColor || '';
    accentGrid.innerHTML = ACCENT_PRESETS.map(p => {
      const c = isLight ? p.light : p.dark;
      const isActive = curAccent === c;
      return `<div onclick="setAdminAccentColor('${c}')" style="
        height:26px;border-radius:5px;cursor:pointer;background:${c};
        border:2px solid ${isActive ? 'var(--text)' : 'transparent'};
        display:flex;align-items:center;justify-content:center;
        font-size:7px;font-weight:700;color:${_contrastText(c)};
        transition:border .15s">${p.label}</div>`;
    }).join('');
  }
  const accentPicker = document.getElementById('admin-accent-picker');
  if(accentPicker) accentPicker.value = dd.accentColor || '#C8F53C';
  // Glow slider
  const glowSlider = document.getElementById('admin-glow-slider');
  if(glowSlider) glowSlider.value = dd.textGlow ?? 100;
  const glowVal = document.getElementById('admin-glow-val');
  if(glowVal) glowVal.textContent = (dd.textGlow ?? 100) + '%';
}
function setAdminDefaultBg(key){
  if(!CFG.adminDefaultDesign) CFG.adminDefaultDesign = {...DEFAULT_DESIGN};
  CFG.adminDefaultDesign.bgPreset = key;
  const fcKey = BG_FONT_MAP[key];
  if(fcKey && FONT_COLOR_PRESETS[fcKey]){
    const p = FONT_COLOR_PRESETS[fcKey];
    CFG.adminDefaultDesign.fontColor = fcKey;
    CFG.adminDefaultDesign.fontColors = {primary:p.primary,secondary:p.secondary,tertiary:p.tertiary};
  }
  cfgSave(); renderAdminDesignPresets(); _updateAdminInviteLink();
}
function toggleAdminDefaultGlass(){
  if(!CFG.adminDefaultDesign) CFG.adminDefaultDesign = {...DEFAULT_DESIGN};
  CFG.adminDefaultDesign.glassEnabled = !CFG.adminDefaultDesign.glassEnabled;
  cfgSave(); renderAdminDesignPresets(); _updateAdminInviteLink();
}
function updateAdminDefaultDesign(){
  if(!CFG.adminDefaultDesign) CFG.adminDefaultDesign = {...DEFAULT_DESIGN};
  const blurSlider = document.getElementById('admin-glass-blur-slider');
  const alphaSlider = document.getElementById('admin-glass-alpha-slider');
  if(blurSlider) CFG.adminDefaultDesign.glassBlur = +blurSlider.value;
  if(alphaSlider) CFG.adminDefaultDesign.glassAlpha = +alphaSlider.value;
  const blurVal = document.getElementById('admin-glass-blur-val');
  if(blurVal) blurVal.textContent = CFG.adminDefaultDesign.glassBlur+'px';
  const alphaVal = document.getElementById('admin-glass-alpha-val');
  if(alphaVal) alphaVal.textContent = CFG.adminDefaultDesign.glassAlpha+'%';
  // Glow
  const glowSlider = document.getElementById('admin-glow-slider');
  if(glowSlider){
    CFG.adminDefaultDesign.textGlow = +glowSlider.value;
    const gv = document.getElementById('admin-glow-val');
    if(gv) gv.textContent = CFG.adminDefaultDesign.textGlow + '%';
  }
  cfgSave(); _updateAdminInviteLink();
}
function setAdminAccentColor(color){
  if(!CFG.adminDefaultDesign) CFG.adminDefaultDesign = {...DEFAULT_DESIGN};
  CFG.adminDefaultDesign.accentColor = color || '';
  cfgSave(); renderAdminDesignPresets(); _updateAdminInviteLink();
}
function saveAdminDefaultDesign(){
  CFG.adminDefaultDesign = {
    bgPreset: CFG.bgPreset||'aurora',
    glassEnabled: !!CFG.glassEnabled,
    glassBlur: CFG.glassBlur||14,
    glassAlpha: CFG.glassAlpha||45,
    glassClean: !!CFG.glassClean,
    fontColor: CFG.fontColor||'',
    fontColors: CFG.fontColors||{},
    accentColor: CFG.accentColor||'',
    textGlow: CFG.textGlow ?? 100,
  };
  cfgSave(); renderAdminDesignPresets(); _updateAdminInviteLink();
  toast('Aktuelles Design als Standard gespeichert','ok');
}
function _updateAdminInviteLink(){
  const invEl = document.getElementById('admin-invite-link');
  if(invEl) invEl.textContent = _buildInviteUrl();
}

// CODE_GS constant → defined in js/gas-src.js


function toggleCodeGs(btn) {
  const block = btn.nextElementSibling;
  const pre = block.querySelector('pre');
  if (!pre.textContent) pre.textContent = CODE_GS;
  const shown = block.style.display !== 'none';
  block.style.display = shown ? 'none' : 'block';
  const icon = '<svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2;display:inline;vertical-align:middle;margin-right:5px"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';
  btn.innerHTML = icon + (shown ? 'Code.gs anzeigen &amp; kopieren' : 'Code.gs ausblenden');
}

function copyCodeGs() {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(CODE_GS)
      .then(() => toast('✓ Code.gs kopiert!', 'ok'))
      .catch(() => toast('Clipboard nicht verfügbar', 'err'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = CODE_GS;
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    toast('✓ Code.gs kopiert!', 'ok');
  }
}
// ADMIN_CODE_GS constant → defined in js/gas-src.js


function toggleAdminCodeGs(btn) {
  const block = document.getElementById('admin-codeg-block');
  const pre = document.getElementById('admin-codeg-pre');
  if (!pre.textContent) pre.textContent = ADMIN_CODE_GS;
  const shown = block.style.display !== 'none';
  block.style.display = shown ? 'none' : 'block';
  const icon = '<svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2;display:inline;vertical-align:middle;margin-right:5px"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';
  btn.innerHTML = icon + (shown ? 'Admin Code.gs anzeigen &amp; kopieren' : 'Admin Code.gs ausblenden');
}

function copyAdminCodeGs() {
  if(navigator.clipboard) navigator.clipboard.writeText(ADMIN_CODE_GS).then(()=>toast('✓ Admin Code.gs kopiert!','ok')).catch(()=>toast('Clipboard n/a','err'));
  else{ const ta=document.createElement('textarea');ta.value=ADMIN_CODE_GS;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);toast('✓ Admin Code.gs kopiert!','ok'); }
}

