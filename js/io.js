// ═══════════════════════════════════════════════════════════════
// MODULE: INIT & LOAD
// ═══════════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', ()=>{
  cfgLoad();
  applyAppBackground(); // Apply background + glass immediately after CFG load
  applyFontColors();
  Device.init(); // Platform detection, body classes, history nav

  // Read adminUrl + optional design from sharing/invite link
  const urlParams = new URLSearchParams(window.location.search);
  const adminUrlParam = urlParams.get('adminUrl');
  if(adminUrlParam && adminUrlParam.includes('script.google.com')){
    CFG.adminUrl = adminUrlParam;
    // Apply admin-defined default design for new users (no session yet = first visit)
    const designParam = urlParams.get('design');
    if(designParam && !CFG.sessionToken){
      try{
        const dd = JSON.parse(designParam);
        if(dd.bgPreset) CFG.bgPreset = dd.bgPreset;
        if(dd.glassEnabled !== undefined) CFG.glassEnabled = !!dd.glassEnabled;
        if(dd.glassBlur) CFG.glassBlur = +dd.glassBlur;
        if(dd.glassAlpha) CFG.glassAlpha = +dd.glassAlpha;
        if(dd.glassClean !== undefined) CFG.glassClean = !!dd.glassClean;
        if(dd.fontColor) CFG.fontColor = dd.fontColor;
        if(dd.fontColors) CFG.fontColors = dd.fontColors;
        if(dd.accentColor) CFG.accentColor = dd.accentColor;
        if(dd.textGlow !== undefined) CFG.textGlow = +dd.textGlow;
        applyAppBackground();
        applyFontColors();
      }catch(e){}
    }
    cfgSave();
    window.history.replaceState({}, '', window.location.pathname);
  }

  // Group invite link: ?joinGroup=<id>&gc=<code>[&url=<backendUrl>]
  const joinGroupId = urlParams.get('joinGroup');
  const joinGroupCode = urlParams.get('gc');
  const joinUrl = urlParams.get('url');
  if(joinGroupId && joinGroupCode){
    // If a backend URL is provided and we don't have one, store it
    if(joinUrl && !CFG.scriptUrl && !CFG.adminUrl){
      if(joinUrl.includes('script.google.com')) CFG.scriptUrl = joinUrl;
    }
    // Store pending join for after data loads
    CFG._pendingGroupJoin = {id:joinGroupId, code:joinGroupCode, url:joinUrl||''};
    window.history.replaceState({}, '', window.location.pathname);
  }

  document.getElementById('f-date').value = today();

  if(CFG.sessionToken && CFG.adminUrl){
    // Account-Modus: Session vorhanden → direkt starten (Token wird beim ersten API-Call geprüft)
    launchApp();
  } else if(CFG.adminUrl){
    // Admin-URL bekannt, aber keine Session → Login anzeigen
    gotoSetupStep(2);
    document.getElementById('auth-admin-url').value = CFG.adminUrl;
  } else if(CFG.scriptUrl){
    document.getElementById('cfg-url').value = CFG.scriptUrl;
    launchApp();
  } else if(CFG.demo){
    loadDemo(); launchApp();
  }
});

async function doConnect(){
  const url = document.getElementById('cfg-url').value.trim();
  if(!url){ toast('Script URL eintragen','err'); return; }
  if(!url.includes('script.google.com')){ toast('Ungültige Script URL','err'); return; }
  CFG.scriptUrl = url; CFG.demo = false;
  // Clear account mode state when switching to Script URL mode
  CFG.sessionToken = ''; CFG.authUser = ''; CFG.authRole = ''; CFG.adminUrl = '';
  cfgSave();

  const btn = document.getElementById('connect-btn');
  btn.disabled=true; btn.textContent='Verbinde…';

  try{
    await checkSheets();
    launchApp();
  } catch(e){
    btn.disabled=false; btn.textContent='Verbinden →';
    alert('Verbindungsfehler\n\n'+e.message);
  }
}

function doDemo(){ CFG={scriptUrl:'',demo:true}; cfgSave(); loadDemo(); launchApp(); }

function doLogout(){
  const isAccountMode = !!(CFG.sessionToken && CFG.adminUrl);
  const msg = CFG.demo
    ? 'Demo-Modus beenden?'
    : isAccountMode
      ? `Als "${CFG.authUser}" ausloggen?`
      : 'Ausloggen? Die Script-URL wird entfernt.';
  if(!confirm(msg)) return;
  // Fire-and-forget server-side session invalidation
  if(isAccountMode && CFG.sessionToken){
    fetch(CFG.adminUrl + '?' + new URLSearchParams({action:'logout', token: CFG.sessionToken})).catch(()=>{});
  }
  CFG.scriptUrl = ''; CFG.sessionToken = ''; CFG.authUser = ''; CFG.authRole = ''; CFG.demo = false;
  cfgSave();
  location.reload();
}

// ── Setup Wizard ─────────────────────────────────────────
function gotoSetupStep(n){
  // Match by element ID (sp-0…sp-3) so DOM order doesn't affect navigation
  document.querySelectorAll('.setup-page').forEach(el=>{
    el.classList.toggle('active', el.id==='sp-'+n);
  });
  // Clear inline errors when switching steps
  document.querySelectorAll('.setup-error').forEach(e=>{e.textContent='';e.classList.remove('vis')});
  for(let i=0;i<=2;i++){
    const dot = document.getElementById('ssd-'+i);
    if(dot) dot.classList.toggle('active', i<=n);
  }
  for(let i=0;i<=1;i++){
    const line = document.getElementById('ssl-'+i);
    if(line) line.classList.toggle('active', i<n);
  }
  const prog = document.getElementById('setup-progress');
  if(prog) prog.style.display = n===0 ? 'none' : 'flex';
  // Scroll setup to top when switching pages
  const el = document.getElementById('setup');
  if(el) el.scrollTop=0;
}

function resetLoginForm(){
  ['auth-user','auth-pw','auth-admin-url','su-user','su-pw','su-pw2','su-admin-url']
    .forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  document.querySelectorAll('.setup-error').forEach(e=>{e.textContent='';e.classList.remove('vis')});
}

// ── Profile Sync (Google Sheet "Einstellungen") ───────────
function _profileExportable(){
  return {
    ft_profile_v1:     true,
    userName:          CFG.userName||'',
    theme:             CFG.theme||'',
    themeMode:         CFG.themeMode||'',
    lohnTag:           CFG.lohnTag||25,
    sparziel:          CFG.sparziel||0,
    mSparziel:         CFG.mSparziel||0,
    pinnedTabs:        CFG.pinnedTabs||[],
    homeWidgets:       CFG.homeWidgets||null,
    notifSettings:     CFG.notifSettings||{},
    fixkostenKats:     CFG.fixkostenKats||[],
    aktienEnabled:     !!CFG.aktienEnabled,
    aktienInBilanz:    !!CFG.aktienInBilanz,
    widgetAktienPosId: CFG.widgetAktienPosId||'',
    currency:          curr(),
    bgPreset:          CFG.bgPreset||'',
    glassEnabled:      !!CFG.glassEnabled,
    glassBlur:         CFG.glassBlur||12,
    glassAlpha:        CFG.glassAlpha||12,
    glassClean:        !!CFG.glassClean,
    fontColor:         CFG.fontColor||'',
    fontColors:        CFG.fontColors||{},
    accentColor:       CFG.accentColor||'',
    textGlow:          CFG.textGlow ?? 100,
  };
}
function _profileApply(prof){
  if(!prof || !prof.ft_profile_v1) return;
  if(prof.userName          !== undefined) CFG.userName          = prof.userName;
  if(prof.themeMode         !== undefined){ CFG.themeMode = prof.themeMode; applyThemeMode(); }
  else if(prof.theme        !== undefined){ CFG.theme = prof.theme; document.documentElement.dataset.theme = prof.theme||''; }
  if(prof.lohnTag           !== undefined) CFG.lohnTag           = prof.lohnTag;
  if(prof.sparziel          !== undefined) CFG.sparziel          = prof.sparziel;
  if(prof.mSparziel         !== undefined) CFG.mSparziel         = prof.mSparziel;
  if(prof.pinnedTabs        !== undefined) CFG.pinnedTabs        = prof.pinnedTabs;
  if(prof.homeWidgets       !== undefined) CFG.homeWidgets       = prof.homeWidgets;
  if(prof.notifSettings     !== undefined) CFG.notifSettings     = prof.notifSettings;
  if(prof.fixkostenKats     !== undefined) CFG.fixkostenKats     = prof.fixkostenKats;
  if(prof.aktienEnabled     !== undefined) CFG.aktienEnabled     = !!prof.aktienEnabled;
  if(prof.aktienInBilanz    !== undefined) CFG.aktienInBilanz    = !!prof.aktienInBilanz;
  if(prof.widgetAktienPosId !== undefined) CFG.widgetAktienPosId = prof.widgetAktienPosId;
  if(prof.currency          !== undefined) CFG.currency          = prof.currency;
  if(prof.bgPreset          !== undefined) CFG.bgPreset          = prof.bgPreset;
  if(prof.glassEnabled      !== undefined) CFG.glassEnabled      = !!prof.glassEnabled;
  if(prof.glassBlur         !== undefined) CFG.glassBlur         = +prof.glassBlur||12;
  if(prof.glassAlpha        !== undefined) CFG.glassAlpha        = +prof.glassAlpha||12;
  if(prof.glassClean        !== undefined) CFG.glassClean        = !!prof.glassClean;
  if(prof.fontColor         !== undefined) CFG.fontColor         = prof.fontColor||'';
  if(prof.fontColors        !== undefined) CFG.fontColors        = prof.fontColors||{};
  if(prof.accentColor       !== undefined) CFG.accentColor       = prof.accentColor||'';
  if(prof.textGlow          !== undefined) CFG.textGlow          = +prof.textGlow;
  cfgSave();
  applyAppBackground();
  applyFontColors();
}

async function syncProfileToSheet(){
  if(CFG.demo || (!CFG.scriptUrl && !CFG.sessionToken)){ toast('Nur mit echtem Sheet verfügbar','err'); return; }
  try{
    setSyncStatus('syncing');
    await apiUpdate('Einstellungen!A1:B1',[['ft_profile_v1', JSON.stringify(_profileExportable())]]);
    setSyncStatus('online');
    toast('Profil im Sheet gespeichert','ok');
  }catch(e){
    setSyncStatus('error');
    const hint = (e.message||'').includes('400') || (e.message||'').includes('Unable')
      ? 'Tab "Einstellungen" im Sheet erstellen!'
      : e.message;
    toast('Fehler: '+hint,'err');
  }
}

// Silent debounced auto-sync — called after any significant layout change
let _autoSyncTimer = null;
function autoSyncProfile(){
  if(CFG.demo || (!CFG.scriptUrl && !CFG.sessionToken)) return;
  clearTimeout(_autoSyncTimer);
  _autoSyncTimer = setTimeout(async ()=>{
    try{
      await apiUpdate('Einstellungen!A1:B1',[['ft_profile_v1', JSON.stringify(_profileExportable())]]);
      setSyncStatus('online');
    }catch(e){ /* silent — Einstellungen tab may not exist yet */ }
  }, 3000);
}

async function loadProfileFromSheet(){
  if(CFG.demo || !CFG.scriptUrl) return false;
  try{
    const res = await apiGet('Einstellungen!A1:B1');
    const rows = res.values||[];
    if(rows[0] && rows[0][0]==='ft_profile_v1' && rows[0][1]){
      _profileApply(JSON.parse(rows[0][1]));
      return true;
    }
  }catch(e){ /* silent — sheet may not exist */ }
  return false;
}

function exportProfileJSON(){
  const blob = new Blob([JSON.stringify(_profileExportable(),null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='ftracker_profil.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('Profil exportiert','ok');
}

function importProfileJSON(){
  const inp = document.createElement('input'); inp.type='file'; inp.accept='.json';
  inp.onchange = async (ev)=>{
    const file = ev.target.files[0]; if(!file) return;
    try{
      const prof = JSON.parse(await file.text());
      if(!prof.ft_profile_v1){ toast('Ungültige Profil-Datei','err'); return; }
      _profileApply(prof);
      renderAll(); renderNav();
      toast('Profil importiert','ok');
    }catch(e){ toast('Fehler: '+e.message,'err'); }
  };
  document.body.appendChild(inp); inp.click(); document.body.removeChild(inp);
}

function downloadBlankTemplate(){
  // Single Excel file with all sheets + README (located next to index.html)
  const a = document.createElement('a');
  a.href = './finanztracker_template.xlsx';
  a.download = 'finanztracker_template.xlsx';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  try{ toast('Excel-Vorlage wird heruntergeladen…','ok'); } catch(e){}
}

function generateAppIcon(){
  try{
    const accent = (typeof CFG !== 'undefined' && CFG.accentColor) || '#C8F53C';
    const c=document.createElement('canvas'); c.width=c.height=180;
    const ctx=c.getContext('2d');
    ctx.fillStyle='#0D0D0F';
    ctx.beginPath();ctx.moveTo(36,0);ctx.arcTo(180,0,180,180,36);ctx.arcTo(180,180,0,180,36);ctx.arcTo(0,180,0,0,36);ctx.arcTo(0,0,180,0,36);ctx.closePath();ctx.fill();
    ctx.fillStyle=accent; ctx.beginPath();ctx.arc(90,90,54,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#0D0D0F'; ctx.font='bold 70px monospace'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('\u20A3',90,93);
    // Apple touch icon
    const appleLink=document.createElement('link'); appleLink.rel='apple-touch-icon'; appleLink.sizes='180x180'; appleLink.href=c.toDataURL('image/png');
    document.head.appendChild(appleLink);
    // Also update generic favicon for browsers
    const favLink = document.querySelector('link[rel="icon"][sizes="180x180"]');
    if(favLink) favLink.href = c.toDataURL('image/png');
    else {
      const fl=document.createElement('link'); fl.rel='icon'; fl.sizes='180x180'; fl.type='image/png'; fl.href=c.toDataURL('image/png');
      document.head.appendChild(fl);
    }
  }catch(e){}
}

function launchApp(){
  generateAppIcon();
  sdataLoad();
  if(!CFG.notifications) CFG.notifications = [];
  document.getElementById('setup').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  renderNav();
  goTab('home');
  if(!CFG.demo){ setSyncStatus('syncing'); loadAll(); }
  else{ setSyncStatus('demo'); renderAll(); }
  updateNotifBadge();
}

async function checkSheets(){
  // Verify connection + check required sheets exist
  let meta;
  try{ meta = await apiGetMeta(); }
  catch(e){
    if(e.message.includes('403')) throw new Error('Zugriff verweigert (403).\nPrüfe: Apps Script als Web-App mit Zugriff "Jeder" bereitgestellt?');
    if(e.message.includes('404')) throw new Error('Script nicht gefunden (404).\nPrüfe die Script URL.');
    throw e;
  }

  const existing = (meta.sheets||[]).map(s=>s.properties.title);
  const required = ['Ausgaben','Einnahmen','Daueraufträge','Kategorien'];
  const missing = required.filter(r=>!existing.includes(r));

  if(missing.length>0){
    throw new Error(
      'Fehlende Tabellenblätter:\n"'+missing.join('", "')+
      '"\n\nBitte im Google Sheet manuell erstellen (+ unten) oder das Excel-Template verwenden.'
    );
  }
}

const DATA_CACHE_KEY = 'ft_datacache_v1';
const DATA_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function dataCacheSave(){
  const payload = { ts: Date.now(), DATA, SDATA };
  // Synchronous: localStorage (fast, may throw on quota)
  try{ localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(payload)); } catch(e){}
  // Async: IndexedDB (larger quota, non-blocking)
  IDB.set(DATA_CACHE_KEY, payload).catch(()=>{});
}

function dataCacheLoad(){
  // Synchronous: try localStorage first
  try{
    const raw = localStorage.getItem(DATA_CACHE_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      if(Date.now() - parsed.ts <= DATA_CACHE_TTL){
        if(parsed.DATA) Object.assign(DATA, parsed.DATA);
        if(parsed.SDATA) Object.assign(SDATA, parsed.SDATA);
        return true;
      }
    }
  } catch(e){}
  return false;
}

/**
 * Async fallback: try loading data cache from IndexedDB.
 * Call this when dataCacheLoad() returns false (localStorage miss).
 * Returns true if valid cache was found and applied.
 */
async function dataCacheLoadIDB(){
  try{
    const parsed = await IDB.get(DATA_CACHE_KEY);
    if(!parsed || Date.now() - parsed.ts > DATA_CACHE_TTL) return false;
    if(parsed.DATA) Object.assign(DATA, parsed.DATA);
    if(parsed.SDATA) Object.assign(SDATA, parsed.SDATA);
    return true;
  } catch(e){ return false; }
}

async function loadAll(){
  setSyncStatus('syncing'); setLoader(true);

  // Show cached data immediately while fetching
  let hadCache = dataCacheLoad();
  // Fallback: try IndexedDB if localStorage had no cache
  if(!hadCache) hadCache = await dataCacheLoadIDB();
  if(hadCache) renderAll();

  try{
    const [katRes, ausgRes, einRes, dauerRes, aktRes, tradeRes, profRes, sparRes] = await Promise.allSettled([
      apiGet('Kategorien!A2:G500'),
      apiGet('Ausgaben!A2:J5000'),
      apiGet('Einnahmen!A2:I5000'),
      apiGet('Daueraufträge!A2:K200'),
      apiGet('Aktien!A2:F5000'),
      apiGet('Trades!A2:J5000'),
      loadProfileFromSheet(),
      apiGet('Sparziele!A2:K200')
    ]);

    if(katRes.status==='fulfilled'){
      DATA.categories = (katRes.value.values||[])
        .filter(r=>r[0])
        .map(r=>({id:r[0],name:r[1]||'',type:r[2]||'ausgabe',color:r[3]||'#888',sort:parseInt(r[4])||99,parent:r[5]||'',emoji:r[6]||''}))
        .sort((a,b)=>a.sort-b.sort);
    } else { if(!hadCache) DATA.categories=[]; }

    if(ausgRes.status==='fulfilled'){
      DATA.expenses = (ausgRes.value.values||[])
        .filter(r=>r[0]&&String(r[6]||'')!=='1')
        .map(r=>{
          const e = {id:r[0],date:normalizeDate(r[1]),what:r[2]||'',cat:r[3]||'',amt:normalizeAmt(r[4]),note:r[5]||'',recurringId:r[6]||'',isFixkosten:String(r[7]||'')==='1'};
          if(r[8]) e.groupId = r[8];
          if(r[9]){ try{ e.splitData = JSON.parse(r[9]); }catch(x){ e.splitData = null; } }
          return e;
        });
    } else { if(!hadCache) DATA.expenses=[]; }

    if(einRes.status==='fulfilled'){
      DATA.incomes = (einRes.value.values||[])
        .filter(r=>r[0]&&String(r[6]||'')!=='1')
        .map(r=>{
          const e = {id:r[0],date:normalizeDate(r[1]),what:r[2]||'',cat:r[3]||'',amt:normalizeAmt(r[4]),note:r[5]||'',isLohn:String(r[7]||'')==='1'};
          if(r[8]) e.groupId = r[8];
          return e;
        });
    } else { if(!hadCache) DATA.incomes=[]; }

    if(dauerRes.status==='fulfilled'){
      DATA.recurring = (dauerRes.value.values||[])
        .filter(r=>r[0])
        .map(r=>({id:r[0],what:r[1],cat:r[2],amt:normalizeAmt(r[3]),interval:r[4]||'monatlich',day:parseInt(r[5])||1,note:r[6]||'',active:r[7]!=='0',start:normalizeDate(r[8]||''),endDate:normalizeDate(r[9]||''),affectsAvg:String(r[10]||'')==='1'}));
    } else { if(!hadCache) DATA.recurring=[]; }

    // Sparziele
    if(sparRes.status==='fulfilled'){
      DATA.sparziele = (sparRes.value.values||[])
        .filter(r=>r[0]&&String(r[10]||'')!=='1')
        .map(r=>({id:r[0],name:r[1]||'',target:parseFloat(r[2])||0,start:parseFloat(r[3])||0,
          saved:parseFloat(r[4])||0,deadline:r[5]||'',open:String(r[6]||'')==='1',
          priority:parseInt(r[7])||99,taxPct:parseFloat(r[8])||0,taxAmt:parseFloat(r[9])||0,
          isTax:String(r[6]||'')==='tax'}));
    }

    // Groups — loaded from admin sheet via groups.js
    await loadGroups();

    // Aktien + Trades — optionale Sheets
    if(aktRes.status==='fulfilled' && tradeRes.status==='fulfilled'){
      const shStocks = (aktRes.value.values||[])
        .filter(r=>r[0]&&String(r[5]||'')!=='1')
        .map(r=>({id:r[0],title:r[1]||'',isin:r[2]||'',ticker:r[3]||'',currency:r[4]||'CHF'}));
      const shTrades = (tradeRes.value.values||[])
        .filter(r=>r[0]&&String(r[9]||'')!=='1')
        .map(r=>({id:r[0],stockId:r[1],type:r[2]||'kauf',date:normalizeDate(r[3]),
          qty:parseFloat(r[4])||0,price:parseFloat(r[5])||0,currency:r[6]||'',
          courtage:parseFloat(r[7])||0,total:parseFloat(r[8])||0}));
      if(shStocks.length || shTrades.length){ SDATA.stocks=shStocks; SDATA.trades=shTrades; sdataSave(); }
    }

    dataCacheSave();
    setSyncStatus('online'); renderAll();

    // Process pending group join (from invite link)
    if(CFG._pendingGroupJoin){
      const pj = CFG._pendingGroupJoin;
      delete CFG._pendingGroupJoin;
      const joined = await joinGroupByInvite(pj.id, pj.code, pj.url);
      if(joined) goTab('groups');
    }

    // Load group notifications (non-blocking)
    loadGroupNotifications();

    // Secondary async: Kurse-Sheet + Portfolio-Verlauf (non-blocking)
    if(SDATA.stocks.length){
      syncKurseSheet().then(()=>{
        if(currentTab==='aktien') renderAktien();
        appendPortfolioSnapshot();
      });
      loadPortfolioVerlauf();
    }
  } catch(e){
    setSyncStatus('error');
    toast('Ladefehler: '+e.message,'err');
  }
  setLoader(false);
}

// ═══════════════════════════════════════════════════════════════
// MODULE: ENTRIES — Save, Update, Delete
// ═══════════════════════════════════════════════════════════════
let currentEntryType = 'ausgabe';
let recurringMode = false;
let lohnMode = false;

function setType(t){
  currentEntryType = t;
  document.getElementById('type-aus').className = 'type-btn'+(t==='ausgabe'?' active expense':'');
  document.getElementById('type-ein').className = 'type-btn'+(t==='einnahme'?' active income':'');
  const aktBtn = document.getElementById('type-akt');
  if(aktBtn) aktBtn.className = 'type-btn'+(t==='aktien'?' active':'');
  // Toggle standard vs aktien section
  const stdSec = document.getElementById('eingabe-standard-section');
  const aktSec = document.getElementById('eingabe-aktien-section');
  if(stdSec) stdSec.style.display = t==='aktien' ? 'none' : '';
  if(aktSec) aktSec.style.display = t==='aktien' ? '' : 'none';
  if(t==='aktien'){ renderAktienTradeForm(); return; }
  // Show/hide recurring toggle only for Ausgabe
  const recWrap = document.getElementById('f-recur-toggle-wrap');
  if(recWrap) recWrap.style.display = t==='ausgabe'?'block':'none';
  if(t!=='ausgabe' && recurringMode) { recurringMode=false; updateRecurToggleUI(); }
  // Show/hide Lohn toggle only for Einnahme
  const lohnWrap = document.getElementById('f-lohn-toggle-wrap');
  if(lohnWrap) lohnWrap.style.display = t==='einnahme'?'block':'none';
  if(t!=='einnahme' && lohnMode) { lohnMode=false; updateLohnToggleUI(); }
  fillDropdown('f-cat', t==='ausgabe'?'ausgabe':'einnahme');
  document.getElementById('f-date-label').textContent = recurringMode&&t==='ausgabe' ? 'Startdatum' : 'Datum';
}

function toggleLohnField(){
  lohnMode = !lohnMode;
  updateLohnToggleUI();
}

function updateLohnToggleUI(){
  const sw = document.getElementById('f-lohn-switch');
  const row = document.getElementById('f-lohn-row');
  if(sw) sw.className = 'toggle-switch'+(lohnMode?' on':'');
  if(row) row.className = 'lohn-toggle-row'+(lohnMode?' active':'');
}

function toggleRecurringFields(){
  recurringMode = !recurringMode;
  updateRecurToggleUI();
}

function updateRecurToggleUI(){
  const sw = document.getElementById('f-recur-switch');
  const row = document.getElementById('f-recur-row');
  const sec = document.getElementById('f-rec-section');
  const btn = document.getElementById('f-save-btn');
  const dateLabel = document.getElementById('f-date-label');
  if(sw) sw.className = 'toggle-switch'+(recurringMode?' on':'');
  if(row) row.className = 'recur-toggle-row'+(recurringMode?' active':'');
  if(sec) sec.style.display = recurringMode?'block':'none';
  if(btn) btn.textContent = recurringMode?'Als Dauerauftrag speichern':'Eintrag speichern';
  if(dateLabel) dateLabel.textContent = recurringMode ? 'Startdatum' : 'Datum';
}

async function saveEntryOrRecurring(){
  if(recurringMode && currentEntryType==='ausgabe'){
    // Build recurring from shared form fields
    const what = document.getElementById('f-what').value.trim();
    const amt = parseFloat(document.getElementById('f-amt').value)||0;
    const cat = document.getElementById('f-cat').value;
    const start = document.getElementById('f-date').value||'';
    const interval = document.getElementById('f-r-interval')?.value||'monatlich';
    const day = parseInt(document.getElementById('f-r-day')?.value)||1;
    const endDate = document.getElementById('f-r-end')?.value||'';
    const affectsAvg = document.getElementById('f-r-affects-avg')?.checked||false;
    const note = document.getElementById('f-note').value.trim();
    if(!what){ toast('Bezeichnung erforderlich','err'); return; }
    const id = genId('D');
    const rec = {id,what,cat,amt,interval,day,note,active:true,start,endDate,affectsAvg};
    DATA.recurring.push(rec);
    if(!CFG.demo){
      setSyncStatus('syncing');
      try{
        await apiAppend('Daueraufträge',[[id,what,cat,amt,interval,day,note,'1',start,endDate,affectsAvg?'1':'0']]);
        setSyncStatus('online');
      } catch(e){ setSyncStatus('error'); toast('Sync-Fehler: '+e.message,'err'); return; }
    }
    // Reset form
    ['f-amt','f-what','f-note','f-r-end'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    const cb=document.getElementById('f-r-affects-avg'); if(cb) cb.checked=false;
    recurringMode=false; updateRecurToggleUI();
    toast('✓ Dauerauftrag gespeichert','ok');
    dataCacheSave();
    markDirty('dauerauftraege','dashboard','home');
  } else {
    saveEntry();
  }
}

async function saveEntry(){
  const f = readForm('f', ['amt','date','what','cat','note']);
  const amt = parseFloat(f.amt);
  const date = f.date;
  const what = f.what.trim();
  const cat = f.cat;
  const note = f.note.trim();

  if(!amt||!date||!what){ toast('Betrag, Datum & Beschreibung erforderlich','err'); return; }

  // Group & split data from form
  const groupSel = document.getElementById('f-group');
  const groupId = groupSel ? groupSel.value : '';
  const group = groupId ? DATA.groups.find(g=>g.id===groupId) : null;
  let splitData = null;
  if(group && group.type==='split'){
    splitData = _readSplitForm(amt, group);
    if(!splitData) return; // validation failed
  }

  const id = genId(currentEntryType==='ausgabe'?'A':'E');

  if(currentEntryType==='ausgabe'){
    const entry = {id,date,what,cat,amt,note,recurringId:'',isFixkosten:false};
    if(groupId) entry.groupId = groupId;
    if(splitData) entry.splitData = splitData;
    DATA.expenses.push(entry);
    if(!CFG.demo){
      setSyncStatus('syncing');
      try{
        await apiAppend('Ausgaben',[[id,date,what,cat,amt,note,'','0',groupId||'',splitData?JSON.stringify(splitData):'']]);
        setSyncStatus('online');
      } catch(e){ setSyncStatus('error'); toast('Sync-Fehler: '+e.message,'err'); return; }
    }
  } else {
    const isLohn = document.getElementById('f-lohn-switch')?.classList.contains('on')||false;
    const entry = {id,date,what,cat,amt,note,isLohn};
    if(groupId) entry.groupId = groupId;
    DATA.incomes.push(entry);
    if(!CFG.demo){
      setSyncStatus('syncing');
      try{
        await apiAppend('Einnahmen',[[id,date,what,cat,amt,note,'',isLohn?'1':'0',groupId||'']]);
        setSyncStatus('online');
      } catch(e){ setSyncStatus('error'); toast('Sync-Fehler: '+e.message,'err'); return; }
    }
  }

  // Reset form
  document.getElementById('f-amt').value='';
  document.getElementById('f-what').value='';
  document.getElementById('f-note').value='';
  document.getElementById('f-date').value=today();
  if(groupSel) groupSel.value='';
  _hideSplitSection();
  // Reset lohn toggle
  lohnMode = false; updateLohnToggleUI();

  toast('✓ Gespeichert'+(CFG.demo?' (Demo)':''),'ok');
  dataCacheSave();
  // Push notification to group members (non-blocking)
  if(group) pushGroupNotification(group, {what,amt,date});
  markDirty('verlauf','dashboard','home','lohn','groups');
}

// Open edit modal for an entry
function openEditModal(id, type){
  const list = type==='ausgabe'?DATA.expenses:DATA.incomes;
  const entry = list.find(e=>e.id===id);
  if(!entry) return;

  fillForm('edit', { id, type, amt:entry.amt, date:entry.date, what:entry.what, note:entry.note||'' });
  fillForm('edit-modal', { $title: type==='ausgabe'?'Ausgabe bearbeiten':'Einnahme bearbeiten', '@recurringId':'' });
  fillDropdown('edit-cat', type, entry.cat);
  openModal('edit-modal');
}

// Open edit modal pre-filled from a virtual Dauerauftrag entry.
// If already materialized: opens normal edit modal for that entry.
// Otherwise: opens modal in "new from recurring" mode.
function openMaterializeModal(recurId, date){
  const existing = DATA.expenses.find(e=>e.recurringId===recurId&&e.date===date);
  if(existing){ openEditModal(existing.id,'ausgabe'); return; }
  const r = DATA.recurring.find(r=>r.id===recurId);
  if(!r) return;

  fillForm('edit', { id:'', type:'ausgabe', amt:r.amt, date, what:r.what, note:r.note||'' });
  fillForm('edit-modal', { $title:'Dauerauftrag buchen', '@recurringId':recurId });
  fillDropdown('edit-cat', 'ausgabe', r.cat);
  openModal('edit-modal');
}

async function updateEntry(){
  const f = readForm('edit', ['id','type','amt','date','what','cat','note']);
  const id = f.id, type = f.type;
  const amt = parseFloat(f.amt);
  const date = f.date;
  const what = f.what.trim();
  const cat = f.cat;
  const note = f.note.trim();

  if(!amt||!date||!what){ toast('Felder ausfüllen','err'); return; }

  // New entry from recurring (manual materialization of a future Dauerauftrag)
  const recurringId = document.getElementById('edit-modal').dataset.recurringId||'';
  if(!id && recurringId){
    const r = DATA.recurring.find(r=>r.id===recurringId);
    if(!r){ toast('Dauerauftrag nicht gefunden','err'); closeModal('edit-modal'); return; }
    if(DATA.expenses.some(e=>e.recurringId===recurringId&&e.date===date)){
      toast('Bereits gebucht','err'); closeModal('edit-modal'); return;
    }
    const newId = genId('A');
    const isFixk = !r.affectsAvg;
    const entry = {id:newId, date, what, cat, amt, note:note||'', recurringId, isFixkosten:isFixk};
    DATA.expenses.push(entry);
    if(!CFG.demo){
      setSyncStatus('syncing');
      try{
        await apiAppend('Ausgaben',[[newId,date,what,cat,amt,note||'',recurringId,isFixk?'1':'0']]);
        setSyncStatus('online');
      } catch(err){ setSyncStatus('error'); toast('Sync-Fehler: '+err.message,'err'); }
    }
    closeModal('edit-modal');
    toast('✓ Dauerauftrag gebucht','ok');
    dataCacheSave();
    markDirty('verlauf','dashboard','home','lohn','dauerauftraege');
    return;
  }

  const list = type==='ausgabe'?DATA.expenses:DATA.incomes;
  const idx = list.findIndex(e=>e.id===id);
  if(idx===-1) return;

  // Optimistic update
  list[idx] = {...list[idx],amt,date,what,cat,note};
  closeModal('edit-modal');
  dataCacheSave();
  markDirty('verlauf','dashboard','home','lohn');
  toast('Gespeichert…');

  if(!CFG.demo){
    try{
      const sheet = type==='ausgabe'?'Ausgaben':'Einnahmen';
      const row = await apiFindRow(sheet, id);
      if(row){
        const isLohn = type==='einnahme' ? (list[idx]?.isLohn ? '1' : '0') : '';
        const isFixk = type==='ausgabe' ? (list[idx]?.isFixkosten ? '1' : '0') : '';
        const updateVals = type==='ausgabe' ? [[id,date,what,cat,amt,note,'',isFixk]] : [[id,date,what,cat,amt,note,'',isLohn]];
        const updateRange = `${sheet}!A${row}:H${row}`;
        await apiUpdate(updateRange, updateVals);
        setSyncStatus('online'); toast('✓ Aktualisiert','ok');
      }
    } catch(e){ setSyncStatus('error'); toast('Sync-Fehler: '+e.message,'err'); }
  } else { toast('✓ Aktualisiert (Demo)','ok'); }
}

async function deleteEntry(){
  const id = document.getElementById('edit-id').value;
  const type = document.getElementById('edit-type').value;
  if(!confirm('Eintrag wirklich löschen?')) return;

  const list = type==='ausgabe'?DATA.expenses:DATA.incomes;
  const idx = list.findIndex(e=>e.id===id);
  const backup = idx!==-1 ? list[idx] : null;
  if(idx!==-1) list.splice(idx,1);

  closeModal('edit-modal');
  dataCacheSave();
  markDirty('verlauf','dashboard','home','lohn');

  if(!CFG.demo){
    setSyncStatus('syncing');
    try{
      const sheet = type==='ausgabe'?'Ausgaben':'Einnahmen';
      const row = await apiFindRow(sheet, id);
      if(!row){
        // Eintrag nicht in Sheet gefunden – lokal zurücksetzen
        if(backup && idx!==-1) list.splice(idx,0,backup);
        dataCacheSave();
        markDirty('verlauf','dashboard','home','lohn');
        setSyncStatus('error');
        toast('Fehler: Eintrag nicht in Sheet gefunden','err');
        return;
      }
      await apiUpdate(`${sheet}!G${row}`,[ ['1'] ]); // mark deleted
      setSyncStatus('online'); toast('✓ Gelöscht','ok');
    } catch(e){
      // Netzwerkfehler – lokal zurücksetzen
      if(backup && idx!==-1) list.splice(idx,0,backup);
      dataCacheSave();
      markDirty('verlauf','dashboard','home','lohn');
      setSyncStatus('error'); toast('Sync-Fehler: '+e.message,'err');
    }
  } else { toast('✓ Gelöscht (Demo)','ok'); }
}

// ═══════════════════════════════════════════════════════════════
// MODULE: RECURRING
// ═══════════════════════════════════════════════════════════════
// Save recurring from either Aufträge tab (prefix 'r-') or FAB inline form (prefix 'f-r-')
async function saveRecurring(prefix='r'){
  const g = id => document.getElementById(prefix+'-'+id)?.value;
  const what = (g('what')||'').trim();
  const amt = parseFloat(g('amt'))||0;
  const cat = g('cat')||'';
  const interval = g('interval')||'monatlich';
  const day = parseInt(g('day'))||1;
  const start = g('start')||'';
  const endDate = g('end')||'';
  const affectsAvg = document.getElementById(prefix+'-affects-avg')?.checked||false;
  const note = (g('note')||'').trim();

  if(!what){ toast('Bezeichnung erforderlich','err'); return; }

  const id = genId('D');
  const rec = {id,what,cat,amt,interval,day,note,active:true,start,endDate,affectsAvg};
  DATA.recurring.push(rec);

  if(!CFG.demo){
    setSyncStatus('syncing');
    try{
      await apiAppend('Daueraufträge',[[id,what,cat,amt,interval,day,note,'1',start,endDate,affectsAvg?'1':'0']]);
      setSyncStatus('online');
    } catch(e){ setSyncStatus('error'); toast('Sync-Fehler: '+e.message,'err'); return; }
  }

  // Clear form
  ['what','amt','note','start','end'].forEach(f=>{ const el=document.getElementById(prefix+'-'+f); if(el) el.value=''; });
  const cbEl=document.getElementById(prefix+'-affects-avg'); if(cbEl) cbEl.checked=false;
  toast('✓ Dauerauftrag hinzugefügt','ok');
  dataCacheSave();
  markDirty('dauerauftraege','dashboard','home');
}

function openRecModal(id){
  const rec = DATA.recurring.find(r=>r.id===id);
  if(!rec) return;
  fillForm('rec-edit', { id, what:rec.what, amt:rec.amt, day:rec.day, start:rec.start||'', end:rec.endDate||'', note:rec.note||'', interval:rec.interval });
  document.getElementById('rec-edit-affects-avg').checked = rec.affectsAvg||false;
  fillDropdown('rec-edit-cat','ausgabe',rec.cat);
  openModal('rec-modal');
}

async function updateRecurring(){
  const f = readForm('rec-edit', ['id','what','amt','cat','interval','day','start','end','note']);
  const id = f.id, what = f.what.trim(), note = f.note.trim();
  const amt = parseFloat(f.amt)||0;
  const cat = f.cat, interval = f.interval;
  const day = parseInt(f.day)||1;
  const start = f.start||'';
  const endDate = f.end||'';
  const affectsAvg = document.getElementById('rec-edit-affects-avg').checked||false;

  const idx = DATA.recurring.findIndex(r=>r.id===id);
  if(idx===-1) return;
  DATA.recurring[idx] = {...DATA.recurring[idx],what,amt,cat,interval,day,start,endDate,affectsAvg,note};
  closeModal('rec-modal');
  dataCacheSave();
  markDirty('dauerauftraege','dashboard','home');

  if(!CFG.demo){
    try{
      const row = await apiFindRow('Daueraufträge', id);
      if(row) await apiUpdate(`Daueraufträge!A${row}:K${row}`,[[id,what,cat,amt,interval,day,note,'1',start,endDate,affectsAvg?'1':'0']]);
      setSyncStatus('online'); toast('✓ Aktualisiert','ok');
    } catch(e){ setSyncStatus('error'); toast('Sync-Fehler','err'); }
  } else toast('✓ Aktualisiert (Demo)','ok');
}

async function deleteRecurring(){
  const id = document.getElementById('rec-edit-id').value;
  if(!confirm('Dauerauftrag wirklich löschen?')) return;
  const idx = DATA.recurring.findIndex(r=>r.id===id);
  if(idx!==-1) DATA.recurring.splice(idx,1);
  closeModal('rec-modal');
  dataCacheSave();
  markDirty('dauerauftraege','dashboard','home');

  if(!CFG.demo){
    try{
      const row = await apiFindRow('Daueraufträge', id);
      if(row) await apiUpdate(`Daueraufträge!H${row}`,[['0']]);
      setSyncStatus('online'); toast('✓ Gelöscht','ok');
    } catch(e){ setSyncStatus('error'); toast('Sync-Fehler','err'); }
  } else toast('✓ Gelöscht (Demo)','ok');
}

// ═══════════════════════════════════════════════════════════════
// MODULE: CATEGORIES — Add, Edit, Delete
// ═══════════════════════════════════════════════════════════════
const PRESET_COLORS = ['#FF6B35','#F7931E','#FFD166','#C8F53C','#3DDB96','#00D4AA','#60A5FA','#C678DD','#FF4D6D','#4ECDC4','#E06C75','#61AFEF','#98C379','#D19A66','#ABB2BF','#5E81F4','#E63946','#54A0FF','#FF9F43','#888888'];

async function addCategory(){
  const name = document.getElementById('new-cat-name').value.trim();
  const type = document.getElementById('new-cat-type').value;
  const parent = document.getElementById('new-cat-parent').value||'';
  const emoji = document.getElementById('new-cat-emoji')?.value.trim()||'';
  if(!name){ toast('Name eingeben','err'); return; }
  if(DATA.categories.find(c=>c.name===name&&c.type===type)){ toast('Kategorie existiert bereits','err'); return; }

  const id = genId('K');
  const color = PRESET_COLORS[DATA.categories.length % PRESET_COLORS.length];
  const sort = DATA.categories.length+1;
  const cat = {id,name,type,color,sort,parent,emoji};
  DATA.categories.push(cat);

  document.getElementById('new-cat-name').value='';
  document.getElementById('new-cat-parent').value='';
  if(document.getElementById('new-cat-emoji')) document.getElementById('new-cat-emoji').value='';

  if(!CFG.demo){
    setSyncStatus('syncing');
    try{
      await apiAppend('Kategorien',[[id,name,type,color,sort,parent,emoji]]);
      setSyncStatus('online');
    } catch(e){ setSyncStatus('error'); toast('Sync-Fehler','err'); return; }
  }

  toast('✓ Kategorie hinzugefügt','ok');
  renderCategories(); fillAllDropdowns();
}

const CAT_EMOJI_LIST = ['🛒','🍱','🍽️','🍫','🍺','🥐','✈️','🎁','👕','💻','🏠','💊','📡','📱','🍷','🚣','📚','🎉','🚆','🪑','📖','⚽','🎮','📦','💼','📲','🎀','🔄','💰','🚗','🎬','🎵','💇','🏋️','🐕','👶','💍','🏥','🧹','🔧','☕','🍕','🎂','📝','🏦','💳','📊','🌍'];

function buildEmojiGrid(gridId, inputId){
  const grid = document.getElementById(gridId);
  if(!grid) return;
  grid.innerHTML = CAT_EMOJI_LIST.map(e=>
    `<button type="button" style="font-size:20px;padding:6px;background:none;border:1px solid var(--border);border-radius:6px;cursor:pointer;line-height:1" onclick="document.getElementById('${inputId}').value='${e}';${gridId.includes('edit')?`document.getElementById('cat-edit-emoji-preview').textContent='${e}';`:''}this.parentElement.style.display='none'">${e}</button>`
  ).join('');
}

function openCatModal(id){
  const cat = DATA.categories.find(c=>c.id===id);
  if(!cat) return;
  document.getElementById('cat-edit-id').value = id;
  document.getElementById('cat-edit-name').value = cat.name;
  document.getElementById('cat-edit-type').value = cat.type;

  // Emoji
  const currentEmoji = cat.emoji || catEmoji(cat.name);
  document.getElementById('cat-edit-emoji').value = cat.emoji||'';
  document.getElementById('cat-edit-emoji-preview').textContent = currentEmoji;
  document.getElementById('cat-emoji-grid').style.display = 'none';
  buildEmojiGrid('cat-emoji-grid','cat-edit-emoji');

  // Parent dropdown: top-level categories of same type (no parent themselves)
  const parentOpts = DATA.categories.filter(c=>c.id!==id&&c.type===cat.type&&!c.parent&&c.name!==cat.name);
  const pSel = document.getElementById('cat-edit-parent');
  pSel.innerHTML = `<option value="">— keine Überkategorie —</option>`
    + parentOpts.map(c=>`<option value="${esc(c.name)}" ${c.name===cat.parent?'selected':''}>${esc(c.name)}</option>`).join('');
  pSel.value = cat.parent||'';

  // Color grid
  const grid = document.getElementById('cat-color-grid');
  grid.innerHTML = PRESET_COLORS.map(c=>
    `<div class="color-swatch${c===cat.color?' selected':''}" style="background:${c}" onclick="selectColor(this,'${c}')"></div>`
  ).join('');

  openModal('cat-modal');
}

function selectColor(el, color){
  document.querySelectorAll('#cat-color-grid .color-swatch').forEach(s=>s.classList.remove('selected'));
  el.classList.add('selected');
  el.dataset.color = color;
}

async function updateCategory(){
  const id = document.getElementById('cat-edit-id').value;
  const name = document.getElementById('cat-edit-name').value.trim();
  const type = document.getElementById('cat-edit-type').value;
  const parent = document.getElementById('cat-edit-parent').value||'';
  const emoji = document.getElementById('cat-edit-emoji').value.trim()||'';
  const selected = document.querySelector('#cat-color-grid .color-swatch.selected');
  const color = selected?selected.style.background:PRESET_COLORS[0];

  if(!name){ toast('Name erforderlich','err'); return; }
  const idx = DATA.categories.findIndex(c=>c.id===id);
  if(idx===-1) return;

  const oldName = DATA.categories[idx].name;
  DATA.categories[idx] = {...DATA.categories[idx],name,type,color,parent,emoji};

  if(oldName!==name){
    DATA.expenses.forEach(e=>{ if(e.cat===oldName) e.cat=name; });
    DATA.incomes.forEach(e=>{ if(e.cat===oldName) e.cat=name; });
    DATA.recurring.forEach(r=>{ if(r.cat===oldName) r.cat=name; });
  }

  closeModal('cat-modal');
  renderCategories(); fillAllDropdowns(); markDirty('verlauf','dashboard','home','lohn');

  if(!CFG.demo){
    try{
      const row = await apiFindRow('Kategorien', id);
      if(row) await apiUpdate(`Kategorien!A${row}:G${row}`,[[id,name,type,color,DATA.categories[idx].sort,parent,emoji]]);
      setSyncStatus('online'); toast('✓ Kategorie aktualisiert','ok');
    } catch(e){ setSyncStatus('error'); toast('Sync-Fehler','err'); }
  } else toast('✓ Aktualisiert (Demo)','ok');
}

async function deleteCategory(){
  const id = document.getElementById('cat-edit-id').value;
  const cat = DATA.categories.find(c=>c.id===id);
  const inUse = DATA.expenses.some(e=>e.cat===cat?.name) || DATA.incomes.some(e=>e.cat===cat?.name);
  if(inUse){ toast('Kategorie wird noch verwendet','err'); return; }
  if(!confirm('Kategorie "'+cat?.name+'" wirklich löschen?')) return;

  const idx = DATA.categories.findIndex(c=>c.id===id);
  if(idx!==-1) DATA.categories.splice(idx,1);
  closeModal('cat-modal');
  renderCategories(); fillAllDropdowns();

  if(!CFG.demo){
    try{
      const row = await apiFindRow('Kategorien', id);
      if(row) await apiUpdate(`Kategorien!A${row}`,[ ['DELETED'] ]);
      setSyncStatus('online'); toast('✓ Gelöscht','ok');
    } catch(e){ setSyncStatus('error'); toast('Sync-Fehler','err'); }
  } else toast('✓ Gelöscht (Demo)','ok');
}

// ═══════════════════════════════════════════════════════════════
// MODULE: EXCEL EXPORT
// ═══════════════════════════════════════════════════════════════
function exportExcel(){
  if(typeof XLSX === 'undefined'){ toast('Export wird geladen…','ok'); setTimeout(exportExcel,1200); return; }
  const wb = XLSX.utils.book_new();
  const now = new Date();

  // Ausgaben
  const expRows = [['ID','Datum','Was','Kategorie','Betrag CHF','Notiz']];
  [...DATA.expenses].sort((a,b)=>b.date.localeCompare(a.date))
    .forEach(e=>expRows.push([e.id,e.date,e.what,e.cat,e.amt,e.note]));
  const wsExp = XLSX.utils.aoa_to_sheet(expRows);
  wsExp['!cols']=[{wch:14},{wch:12},{wch:24},{wch:18},{wch:12},{wch:24}];
  XLSX.utils.book_append_sheet(wb,wsExp,'Ausgaben');

  // Einnahmen
  const incRows = [['ID','Datum','Was','Kategorie','Betrag CHF','Notiz']];
  [...DATA.incomes].sort((a,b)=>b.date.localeCompare(a.date))
    .forEach(e=>incRows.push([e.id,e.date,e.what,e.cat,e.amt,e.note]));
  const wsInc = XLSX.utils.aoa_to_sheet(incRows);
  wsInc['!cols']=[{wch:14},{wch:12},{wch:24},{wch:18},{wch:12},{wch:24}];
  XLSX.utils.book_append_sheet(wb,wsInc,'Einnahmen');

  // Daueraufträge
  const recRows = [['ID','Was','Kategorie','Betrag CHF','Intervall','Buchungstag','Startdatum','Aktiv','Kommentar']];
  DATA.recurring.forEach(r=>recRows.push([r.id,r.what,r.cat,r.amt,r.interval,r.day,r.start||'',r.active?'Ja':'Nein',r.note]));
  const wsRec = XLSX.utils.aoa_to_sheet(recRows);
  wsRec['!cols']=[{wch:14},{wch:24},{wch:18},{wch:12},{wch:14},{wch:12},{wch:14},{wch:8},{wch:24}];
  XLSX.utils.book_append_sheet(wb,wsRec,'Daueraufträge');

  const fname=`Finanzen_${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}.xlsx`;
  XLSX.writeFile(wb,fname);
  toast('✓ Excel exportiert','ok');
}

// ═══════════════════════════════════════════════════════════════
// MODULE: SPAREN & PLANEN
// Sparziele CRUD, progress, priority, Steuern, budget integration
// Sheet: "Sparziele" — columns A:K
//   A=id, B=name, C=target, D=start, E=saved, F=deadline, G=open/tax, H=priority, I=taxPct, J=taxAmt, K=deleted
// ═══════════════════════════════════════════════════════════════

function getSparzieleNonTax(){ return DATA.sparziele.filter(g=>!g.isTax).sort((a,b)=>a.priority-b.priority); }
function getSparTax(){ return DATA.sparziele.filter(g=>g.isTax); }

function sparGoalPct(g){
  if(g.open) return g.saved>0?100:0;
  if(g.target<=0) return 0;
  return Math.min((g.saved/g.target)*100, 100);
}

function sparTotalMonthly(){
  // Sum of monthly minimums from all active goals
  const goals = getSparzieleNonTax();
  let total = 0;
  for(const g of goals){
    if(g.target<=0||g.open) continue;
    if(!g.deadline) continue;
    const remaining = g.target - g.saved;
    if(remaining<=0) continue;
    const now = new Date();
    const dl = new Date(g.deadline);
    const months = Math.max(1, (dl.getFullYear()-now.getFullYear())*12 + dl.getMonth()-now.getMonth());
    total += remaining / months;
  }
  // Add tax amounts
  const taxes = getSparTax();
  for(const t of taxes){
    if(t.taxAmt>0) total += t.taxAmt;
  }
  return total;
}

function renderSparen(){
  const el = document.getElementById('sparen-content');
  if(!el) return;
  const goals = getSparzieleNonTax();
  const taxes = getSparTax();
  const totalSaved = goals.reduce((s,g)=>s+g.saved,0);
  const totalTarget = goals.filter(g=>!g.open).reduce((s,g)=>s+g.target,0);
  const monthlyMin = sparTotalMonthly();

  let html = '';

  // Summary card
  html += `<div class="section">
    <div class="section-title">Übersicht</div>
    <div class="card" style="padding:14px">
      <div class="spar-summary-row">
        <span class="spar-summary-label">Gespart (gesamt)</span>
        <span class="spar-summary-val t-accent">${curr()} ${fmtAmt(totalSaved)}</span>
      </div>
      <div class="spar-summary-row">
        <span class="spar-summary-label">Ziel (gesamt)</span>
        <span class="spar-summary-val">${curr()} ${fmtAmt(totalTarget)}</span>
      </div>
      ${totalTarget>0?`
      <div style="margin-top:8px">
        <div class="spar-prog-wrap" style="height:10px">
          <div class="spar-prog-fill" style="width:${Math.min(totalSaved/totalTarget*100,100).toFixed(1)}%;background:var(--accent)"></div>
        </div>
        <div class="spar-prog-sub"><span>${(totalSaved/totalTarget*100).toFixed(0)}%</span><span>${curr()} ${fmtAmt(totalTarget-totalSaved)} verbleibend</span></div>
      </div>`:''}
      ${monthlyMin>0?`<div class="spar-summary-row" style="margin-top:4px">
        <span class="spar-summary-label">Monatl. Minimum</span>
        <span class="spar-summary-val" style="color:var(--yellow)">${curr()} ${fmtAmt(monthlyMin)}</span>
      </div>`:''}
    </div>
  </div>`;

  // Goals list (sorted by priority)
  html += `<div class="section pt-0">
    <div class="section-title">Sparziele (Priorität)</div>`;
  if(goals.length===0){
    html += `<div class="card" style="padding:20px;text-align:center;color:var(--text3);font-size:13px">
      Noch keine Sparziele erfasst. Erstelle dein erstes Ziel!
    </div>`;
  }
  goals.forEach((g,i)=>{
    const pct = sparGoalPct(g);
    const done = !g.open && pct>=100;
    const progColor = done ? 'var(--green)' : 'var(--accent)';
    let deadlineLabel = '';
    if(g.deadline){
      const dl = new Date(g.deadline);
      const now = new Date();
      const daysLeft = Math.ceil((dl-now)/86400000);
      deadlineLabel = daysLeft>0 ? `${daysLeft} Tage verbleibend` : 'Frist abgelaufen';
    }
    html += `<div class="spar-goal-card" onclick="openSparGoalDetail('${g.id}')">
      <div class="spar-goal-header">
        <span class="spar-goal-name">${esc(g.name)}</span>
        ${done?'<span class="spar-goal-badge done">Erreicht ✓</span>':g.open?'<span class="spar-goal-badge open">Offen</span>':''}
      </div>
      <div class="spar-goal-amounts">
        <span class="saved">${curr()} ${fmtAmt(g.saved)}</span>
        ${!g.open?`<span class="target">/ ${curr()} ${fmtAmt(g.target)}</span>`:''}
      </div>
      ${!g.open?`<div class="spar-prog-wrap"><div class="spar-prog-fill" style="width:${pct.toFixed(1)}%;background:${progColor}"></div></div>
      <div class="spar-prog-sub"><span>${pct.toFixed(0)}%</span>${deadlineLabel?`<span>${deadlineLabel}</span>`:''}</div>`:''}
      <div class="spar-prio">
        <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01z"/></svg>
        Priorität ${i+1}
      </div>
    </div>`;
  });
  html += `<button class="spar-add-btn" onclick="openSparGoalModal()">
    <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    Neues Sparziel
  </button>`;
  html += `</div>`;

  // Steuern section
  html += `<div class="section pt-0">
    <div class="section-title">Steuern</div>`;
  if(taxes.length===0){
    html += `<div class="card" style="padding:14px;font-size:13px;color:var(--text3)">
      Noch keine Steuerrückstellung erfasst. Steuern werden als feste Kosten vom Budget abgezogen.
    </div>`;
  }
  taxes.forEach(t=>{
    html += `<div class="spar-goal-card" onclick="openSparGoalDetail('${t.id}')">
      <div class="spar-goal-header">
        <span class="spar-goal-name">${esc(t.name)}</span>
        <span class="spar-goal-badge tax">Steuer</span>
      </div>
      <div class="spar-goal-amounts">
        ${t.taxPct>0?`<span class="target">${t.taxPct}% vom Lohn</span>`:''}
        <span class="saved">${curr()} ${fmtAmt(t.taxAmt)} / Monat</span>
      </div>
    </div>`;
  });
  html += `<button class="spar-add-btn" onclick="openSparGoalModal(true)">
    <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    Steuerrückstellung hinzufügen
  </button>`;
  html += `</div>`;

  // Budget integration info
  const budgetDeduct = sparTotalMonthly();
  if(budgetDeduct>0){
    html += `<div class="section pt-0">
      <div class="section-title">Budget-Integration</div>
      <div class="card" style="padding:14px;font-size:13px;color:var(--text2);line-height:1.6">
        Monatlich werden <strong class="t-accent">${curr()} ${fmtAmt(budgetDeduct)}</strong> vom Lohnzyklus-Budget abgezogen
        (Sparziele + Steuern). Überschüsse fliessen automatisch in das Sparziel mit höchster Priorität.
      </div>
    </div>`;
  }

  el.innerHTML = html;
}

// ── Sparziel Modal (create/edit) ──
function openSparGoalModal(isTax=false, editId=null){
  const existing = editId ? DATA.sparziele.find(g=>g.id===editId) : null;
  const isEdit = !!existing;
  const title = isTax ? (isEdit?'Steuer bearbeiten':'Steuerrückstellung') : (isEdit?'Sparziel bearbeiten':'Neues Sparziel');

  let body = `<div style="display:flex;flex-direction:column;gap:12px">
    <div>
      <label class="form-label">Name</label>
      <input id="spar-name" class="form-input" placeholder="${isTax?'z.B. Einkommenssteuer':'z.B. Ferien, Notgroschen'}" value="${isEdit?esc(existing.name):''}">
    </div>`;

  if(isTax){
    body += `<div>
      <label class="form-label">Prozent vom Lohn (optional)</label>
      <input id="spar-tax-pct" type="number" class="form-input" placeholder="z.B. 15" step="0.1" value="${isEdit?existing.taxPct||'':''}">
    </div>
    <div>
      <label class="form-label">Fester Monatsbetrag (${curr()})</label>
      <input id="spar-tax-amt" type="number" class="form-input" placeholder="z.B. 500" step="0.01" value="${isEdit?existing.taxAmt||'':''}">
      <div style="font-size:11px;color:var(--text3);margin-top:4px">Wenn % gesetzt, wird der Betrag automatisch berechnet.</div>
    </div>`;
  } else {
    body += `<div>
      <label class="form-label">Zielbetrag (${curr()})</label>
      <input id="spar-target" type="number" class="form-input" placeholder="z.B. 5000" step="0.01" value="${isEdit?existing.target||'':''}">
    </div>
    <div>
      <label class="form-label">Startbetrag / bereits gespart (${curr()})</label>
      <input id="spar-saved" type="number" class="form-input" placeholder="0" step="0.01" value="${isEdit?existing.saved||0:''}">
    </div>
    <div>
      <label class="form-label">Zieldatum (optional — leer = offenes Ziel)</label>
      <input id="spar-deadline" type="date" class="form-input" value="${isEdit&&existing.deadline?existing.deadline:''}">
    </div>
    <div>
      <label class="form-label">Priorität (1 = höchste)</label>
      <input id="spar-priority" type="number" class="form-input" min="1" value="${isEdit?existing.priority:getSparzieleNonTax().length+1}">
    </div>`;
  }
  body += `</div>`;

  const actions = isEdit
    ? `<div style="display:flex;gap:8px">
        <button class="btn-delete flex-1" onclick="deleteSparGoal('${editId}')">Löschen</button>
        <button class="btn-primary" style="flex:2" onclick="saveSparGoal('${editId}',${isTax})">Speichern</button>
      </div>`
    : `<button class="btn-primary w-full" onclick="saveSparGoal(null,${isTax})">Erstellen</button>`;

  openGenericModal(title, body, actions);
}

function openSparGoalDetail(id){
  const g = DATA.sparziele.find(x=>x.id===id);
  if(!g) return;
  openSparGoalModal(g.isTax, id);
}

async function saveSparGoal(editId, isTax){
  const name = document.getElementById('spar-name')?.value.trim();
  if(!name){ toast('Name eingeben','err'); return; }

  let goal;
  if(isTax){
    const taxPct = parseFloat(document.getElementById('spar-tax-pct')?.value)||0;
    let taxAmt = parseFloat(document.getElementById('spar-tax-amt')?.value)||0;
    // Auto-calc from Lohn if pct set
    if(taxPct>0){
      const z = getZyklusInfo();
      if(z.lohn>0) taxAmt = Math.round(z.lohn * taxPct / 100 * 100)/100;
    }
    goal = {id:editId||genId('SZ'),name,target:0,start:0,saved:0,deadline:'',open:false,priority:99,taxPct,taxAmt,isTax:true};
  } else {
    const target = parseFloat(document.getElementById('spar-target')?.value)||0;
    const saved = parseFloat(document.getElementById('spar-saved')?.value)||0;
    const deadline = document.getElementById('spar-deadline')?.value||'';
    const priority = parseInt(document.getElementById('spar-priority')?.value)||99;
    const open = !deadline && target<=0;
    goal = {id:editId||genId('SZ'),name,target,start:saved,saved,deadline,open,priority,taxPct:0,taxAmt:0,isTax:false};
  }

  if(editId){
    const idx = DATA.sparziele.findIndex(g=>g.id===editId);
    if(idx>=0) DATA.sparziele[idx] = goal;
  } else {
    DATA.sparziele.push(goal);
  }

  closeGenericModal();
  renderSparen();
  toast('Gespeichert');

  // Sync to Sheet
  try{
    // Ensure the Sparziele sheet exists
    await apiCall({action:'ensureSheet', sheet:'Sparziele', headers:JSON.stringify(['ID','Name','Zielbetrag','Startbetrag','Gespart','Deadline','Typ','Priorität','SteuerPct','SteuerBetrag','Deleted'])});
    const row = [goal.id,goal.name,goal.target,goal.start,goal.saved,goal.deadline,
      goal.isTax?'tax':(goal.open?'1':'0'),goal.priority,goal.taxPct,goal.taxAmt,''];
    if(editId){
      const rowNum = await apiFindRow('Sparziele', editId);
      if(rowNum) await apiUpdate(`Sparziele!A${rowNum}:K${rowNum}`, [row]);
      else await apiAppend('Sparziele', [row]);
    } else {
      await apiAppend('Sparziele', [row]);
    }
    setSyncStatus('online');
  }catch(e){ toast('Sync-Fehler: '+e.message,'err'); setSyncStatus('error'); }
}

async function deleteSparGoal(id){
  const idx = DATA.sparziele.findIndex(g=>g.id===id);
  if(idx<0) return;
  DATA.sparziele.splice(idx,1);
  closeGenericModal();
  renderSparen();
  toast('Gelöscht');
  try{
    const rowNum = await apiFindRow('Sparziele', id);
    if(rowNum) await apiUpdate(`Sparziele!K${rowNum}`, [['1']]);
    setSyncStatus('online');
  }catch(e){ setSyncStatus('error'); }
}

// Update saved amount (deposit into goal)
async function addToSparGoal(id, amount){
  const g = DATA.sparziele.find(x=>x.id===id);
  if(!g) return;
  g.saved = Math.round((g.saved + amount)*100)/100;
  renderSparen();
  try{
    const rowNum = await apiFindRow('Sparziele', id);
    if(rowNum) await apiUpdate(`Sparziele!E${rowNum}`, [[g.saved]]);
    setSyncStatus('online');
  }catch(e){ setSyncStatus('error'); }
}

// ═══════════════════════════════════════════════════════════════
// MODULE: GROUPS — CRUD (delegated to js/groups.js)
// Only stubs remain here for backward compatibility.
// All group logic now lives in js/groups.js.
// ═══════════════════════════════════════════════════════════════

// Generic modal helper (reused for sparen)
function openGenericModal(title, bodyHtml, actionsHtml){
  let modal = document.getElementById('generic-modal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'generic-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `<div class="modal">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <div class="modal-title" id="generic-modal-title"></div>
      </div>
      <div id="generic-modal-body" style="padding:16px 20px"></div>
      <div id="generic-modal-actions" style="padding:0 20px 24px"></div>
    </div>`;
    modal.addEventListener('click', e=>{ if(e.target===modal) closeGenericModal(); });
    document.body.appendChild(modal);
  }
  document.getElementById('generic-modal-title').textContent = title;
  document.getElementById('generic-modal-body').innerHTML = bodyHtml;
  document.getElementById('generic-modal-actions').innerHTML = actionsHtml;
  modal.classList.add('show');
}
function closeGenericModal(){
  const m = document.getElementById('generic-modal');
  if(m) m.classList.remove('show');
}

// Widget: Sparziele overview for Home
function renderWidgetSparzieleOverview(){
  const goals = getSparzieleNonTax().slice(0,3);
  if(goals.length===0) return '<div style="font-size:13px;color:var(--text3);padding:8px 0">Keine Sparziele erfasst</div>';
  let html = '';
  goals.forEach(g=>{
    const pct = sparGoalPct(g);
    const done = !g.open && pct>=100;
    html += `<div class="mb-10">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px">
        <span class="t-bold">${esc(g.name)}</span>
        <span class="t-text3">${g.open?curr()+' '+fmtAmt(g.saved):pct.toFixed(0)+'%'}</span>
      </div>
      ${!g.open?`<div class="spar-prog-wrap"><div class="spar-prog-fill" style="width:${pct.toFixed(1)}%;background:${done?'var(--green)':'var(--accent)'}"></div></div>`:''}
    </div>`;
  });
  return html;
}

// ═══════════════════════════════════════════════════════════════
// MODULE: OBERKATEGORIEN CRUD
// ═══════════════════════════════════════════════════════════════

// Gibt alle Oberkategorien (parent='') zurück
function getOberkategorien(typ){
  return DATA.categories.filter(c=>c.type===typ&&!c.parent&&c.id!=='DELETED'&&c.name!=='DELETED');
}

// Rendert die Oberkategorien-Listen in tab-kategorien
function renderOberkategorien(){
  ['ausgabe','einnahme'].forEach(typ=>{
    const el = document.getElementById(`okt-${typ}-list`); if(!el) return;
    const tops = getOberkategorien(typ);
    if(!tops.length){ el.innerHTML=''; return; }
    el.innerHTML = `<div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:.06em;text-transform:uppercase;padding:8px 16px 4px">${typ==='ausgabe'?'Ausgaben':'Einnahmen'}-Oberkategorien</div>
    <div class="card" style="margin:0 0 8px">` +
    tops.map((c,i)=>`
      <div class="card-row" style="${i>0?'border-top:1px solid var(--border)':''}">
        <div class="card-row-body">
          <div class="card-row-title">${esc(c.name)}</div>
          <div class="card-row-sub">${DATA.categories.filter(sub=>sub.parent===c.name&&sub.id!=='DELETED').length} Unterkategorien</div>
        </div>
        <div style="display:flex;gap:6px">
          <button onclick="renameOberkategoriePrompt('${esc(c.id)}')" style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:5px 10px;font-size:12px;color:var(--text2);cursor:pointer">Umbenennen</button>
          <button onclick="deleteOberkategorieModal('${esc(c.id)}')" style="background:rgba(220,50,50,.1);border:1px solid rgba(220,50,50,.3);border-radius:6px;padding:5px 10px;font-size:12px;color:var(--red);cursor:pointer">Löschen</button>
        </div>
      </div>`).join('') + `</div>`;
  });
}

async function createOberkategorie(){
  const name = document.getElementById('new-okt-name')?.value.trim();
  const typ = document.getElementById('new-okt-type')?.value||'ausgabe';
  if(!name){ toast('Name erforderlich','err'); return; }
  if(DATA.categories.find(c=>c.name===name)){ toast('Name bereits vergeben','err'); return; }
  const id=genId('C');
  const cat={id,name,type:typ,color:randomCatColor(),sort:DATA.categories.length,parent:''};
  DATA.categories.push(cat);
  if(!CFG.demo){
    setSyncStatus('syncing');
    try{
      await apiAppend('Kategorien',[[id,name,typ,cat.color,cat.sort,'']]);
      setSyncStatus('online');
    } catch(e){ setSyncStatus('error'); toast('Sync-Fehler: '+e.message,'err'); return; }
  }
  document.getElementById('new-okt-name').value='';
  toast(`Oberkategorie «${name}» erstellt`);
  renderCategories(); renderOberkategorien(); fillAllDropdowns();
}

async function renameOberkategoriePrompt(id){
  const cat = DATA.categories.find(c=>c.id===id); if(!cat) return;
  const newName = prompt(`Oberkategorie umbenennen (aktuell: ${cat.name}):`, cat.name);
  if(!newName||newName===cat.name) return;
  if(DATA.categories.find(c=>c.name===newName&&c.id!==id)){ toast('Name bereits vergeben','err'); return; }
  const oldName = cat.name;
  cat.name = newName;
  // Update parent reference in subcategories
  DATA.categories.filter(c=>c.parent===oldName).forEach(c=>{ c.parent=newName; });
  // Update parent reference in expenses/incomes
  DATA.expenses.filter(e=>e.cat===oldName).forEach(e=>{ e.cat=newName; });
  DATA.incomes.filter(e=>e.cat===oldName).forEach(e=>{ e.cat=newName; });
  if(!CFG.demo){
    setSyncStatus('syncing');
    try{
      const row = await apiFindRow('Kategorien', id);
      if(row) await apiUpdate(`Kategorien!A${row}:F${row}`,[[id,newName,cat.type,cat.color,cat.sort,cat.parent]]);
      setSyncStatus('online');
    } catch(e){ setSyncStatus('error'); toast('Sync-Fehler: '+e.message,'err'); return; }
  }
  toast(`Umbenannt in «${newName}»`);
  renderCategories(); renderOberkategorien(); fillAllDropdowns();
}

function deleteOberkategorieModal(id){
  const cat = DATA.categories.find(c=>c.id===id); if(!cat) return;
  const subs = DATA.categories.filter(c=>c.parent===cat.name&&c.id!=='DELETED');
  const other = DATA.categories.filter(c=>c.type===cat.type&&!c.parent&&c.id!==id&&c.id!=='DELETED'&&c.name!=='DELETED');
  let msg = `Oberkategorie «${cat.name}» löschen?\n`;
  if(subs.length){
    msg += `\n${subs.length} Unterkategorie(n) sind ihr zugeordnet.\n`;
    if(other.length){
      const target = prompt(`${msg}\nUnterkategorien zuweisen zu (Name einer anderen Oberkategorie eingeben, oder leer lassen für «eigenständig»):\n${other.map(c=>c.name).join(', ')}`);
      confirmDeleteOberkategorie(id, target?.trim()||'');
    } else {
      if(confirm(`${msg}\nUnterkategorien werden eigenständig (ohne Oberkategorie). Fortfahren?`))
        confirmDeleteOberkategorie(id, '');
    }
  } else {
    if(confirm(`${msg}\nKeine Unterkategorien. Löschen?`)) confirmDeleteOberkategorie(id, '');
  }
}

async function confirmDeleteOberkategorie(id, fallbackParent){
  const cat = DATA.categories.find(c=>c.id===id); if(!cat) return;
  // Reassign subcategories
  const subs = DATA.categories.filter(c=>c.parent===cat.name&&c.id!=='DELETED');
  subs.forEach(c=>{ c.parent=fallbackParent; });
  // Mark deleted
  cat.id='DELETED'; cat.name='DELETED';
  if(!CFG.demo){
    setSyncStatus('syncing');
    try{
      const row = await apiFindRow('Kategorien', id);
      if(row) await apiUpdate(`Kategorien!A${row}`,[ ['DELETED'] ]);
      // Update reassigned subcategories
      for(const sub of subs){
        const r2=await apiFindRow('Kategorien',sub.id);
        if(r2) await apiUpdate(`Kategorien!A${r2}:F${r2}`,[[sub.id,sub.name,sub.type,sub.color,sub.sort,fallbackParent]]);
      }
      setSyncStatus('online');
    } catch(e){ setSyncStatus('error'); toast('Sync-Fehler: '+e.message,'err'); return; }
  }
  toast('Oberkategorie gelöscht');
  renderCategories(); renderOberkategorien(); fillAllDropdowns();
}

function randomCatColor(){
  const colors=['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD','#98D8C8','#F7DC6F','#BB8FCE','#85C1E9'];
  return colors[Math.floor(Math.random()*colors.length)];
}
