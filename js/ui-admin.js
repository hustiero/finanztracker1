// ═══════════════════════════════════════════════════════════════
// MODULE: ADMIN TAB UI
// Script-URL Management, User Management, Pending Registrations,
// Default-Design für neue Nutzer, Code.gs Templates.
// (Vorher in ui-groups.js — extrahiert beim Groups-Cleanup.)
// ═══════════════════════════════════════════════════════════════

let _adminUserCache = null;
const _USER_PAGE_SIZE = 50;
let _userPageShown = 0;

async function renderAdmin(){
  if(CFG.authRole!=='admin') return;
  const invEl = document.getElementById('admin-invite-link');
  if(invEl) invEl.textContent = _buildInviteUrl();
  renderAdminDesignPresets();
  _renderAdminScriptUrl();
  _fetchPendingRegistrations();
}

// ─── Script-URL Management ────────────────────────────────

async function _renderAdminScriptUrl(){
  const inp = document.getElementById('admin-script-url-input');
  if(inp && !inp.value) inp.value = CFG.adminUrl || '';
  const curEl = document.getElementById('admin-current-url');
  if(curEl) curEl.textContent = CFG.adminUrl || '–';
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
  if(!newUrl || !isValidScriptUrl(newUrl)){ toast('Ungültige Script-URL','err'); return; }
  if(newUrl === CFG.adminUrl){ toast('URL ist bereits aktuell','info'); return; }
  try{
    const r = await fetch(CFG.adminUrl+'?'+new URLSearchParams({action:'admin_set_admin_url', token:CFG.sessionToken, newUrl}));
    const d = await r.json();
    if(d.error) throw new Error(d.error);
    CFG.adminUrl = newUrl;
    cfgSave();
    toast('URL gespeichert — alle Nutzer erhalten sie beim nächsten Start','ok');
    _renderAdminScriptUrl();
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
  if(!await confirmDialog(`"${username}" freischalten?`, 'Freischalten')) return;
  try{
    const r = await fetch(CFG.adminUrl+'?'+new URLSearchParams({action:'admin_approve', token:CFG.sessionToken, target:username}));
    const d = await r.json();
    if(d.error) throw new Error(d.error);
    toast(username+' freigeschaltet','ok');
    _fetchPendingRegistrations();
  }catch(e){ toast('Fehler: '+e.message,'err'); }
}

async function adminRejectUser(username){
  if(!await confirmDialog(`Registrierung von "${username}" ablehnen und Konto löschen?`, 'Ablehnen')) return;
  try{
    const r = await fetch(CFG.adminUrl+'?'+new URLSearchParams({action:'admin_reject', token:CFG.sessionToken, target:username}));
    const d = await r.json();
    if(d.error) throw new Error(d.error);
    toast(username+' abgelehnt','ok');
    _fetchPendingRegistrations();
  }catch(e){ toast('Fehler: '+e.message,'err'); }
}

// ─── User Management Overlay ─────────────────────────────────

function openUserManagement(){
  if(CFG.authRole!=='admin'){ toast('Kein Zugriff','err'); return; }
  const ov = document.getElementById('user-mgmt-overlay');
  ov.style.display = 'flex';
  document.getElementById('user-mgmt-search').value = '';
  if(_adminUserCache) _renderUserMgmtList(_adminUserCache);
  else _fetchAndRenderUsers();
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
  const moreBtn = body.querySelector('.user-mgmt-more');
  if(moreBtn) moreBtn.remove();
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
    toast(`PW für ${target} geändert: ${newPw}`, 'ok');
  }catch(e){ toast('Fehler: '+e.message,'err'); }
}

async function adminDeleteUser(target){
  if(!await confirmDialog(`Benutzer "${target}" und alle Session-Einträge löschen?\n\nDas persönliche Sheet wird NICHT gelöscht.`, 'Löschen')) return;
  try{
    const r = await fetch(CFG.adminUrl+'?'+new URLSearchParams({action:'admin_delete',token:CFG.sessionToken,target}));
    const d = await r.json();
    if(d.error) throw new Error(d.error);
    toast('Benutzer gelöscht','ok');
    _adminUserCache = null;
    _fetchAndRenderUsers();
  }catch(e){ toast('Fehler: '+e.message,'err'); }
}

async function adminToggleRole(target, currentRole){
  const newRole = currentRole === 'admin' ? 'user' : 'admin';
  const label = newRole === 'admin' ? 'zum Admin befördern' : 'Admin-Rolle entziehen';
  if(!await confirmDialog(`"${target}" ${label}?`, 'Bestätigen')) return;
  try{
    const r = await fetch(CFG.adminUrl+'?'+new URLSearchParams({action:'admin_set_role',token:CFG.sessionToken,target,newRole}));
    const d = await r.json();
    if(d.error) throw new Error(d.error);
    toast(`${target} ist jetzt ${newRole==='admin'?'Admin':'User'}`, 'ok');
    _adminUserCache = null;
    _fetchAndRenderUsers();
  }catch(e){ toast('Fehler: '+e.message,'err'); }
}

// ─── Einladungslink + Default-Design für neue Nutzer ─────────

function _buildInviteUrl(){
  let invUrl = window.location.origin + window.location.pathname + '?adminUrl=' + encodeURIComponent(CFG.adminUrl);
  const dd = CFG.adminDefaultDesign;
  if(dd) invUrl += '&design=' + encodeURIComponent(JSON.stringify(dd));
  return invUrl;
}

function copyInviteLink(){
  const invUrl = _buildInviteUrl();
  if(navigator.clipboard) navigator.clipboard.writeText(invUrl).then(()=>toast('Einladungslink kopiert','ok')).catch(()=>toast('Clipboard n/a','err'));
  else{ const ta=document.createElement('textarea');ta.value=invUrl;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);toast('Einladungslink kopiert','ok'); }
}

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

// ─── Code.gs Templates ──────────────────────────────────────

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
      .then(() => toast('Code.gs kopiert', 'ok'))
      .catch(() => toast('Clipboard nicht verfügbar', 'err'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = CODE_GS;
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    toast('Code.gs kopiert', 'ok');
  }
}

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
  if(navigator.clipboard) navigator.clipboard.writeText(ADMIN_CODE_GS).then(()=>toast('Admin Code.gs kopiert','ok')).catch(()=>toast('Clipboard n/a','err'));
  else{ const ta=document.createElement('textarea');ta.value=ADMIN_CODE_GS;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);toast('Admin Code.gs kopiert','ok'); }
}
