// ═══════════════════════════════════════════════════════════════
// MODULE: SHEETS API (via Google Apps Script, GET-only)
// ═══════════════════════════════════════════════════════════════

/** Sum the .amt field of an array of entries. */
const sumAmt = arr => arr.reduce((s, e) => s + e.amt, 0);

// ── Lookup caches (invalidated on data load / CRUD) ──────────────
// Category name → category object
let _catLookup = null;
function _getCatLookup(){
  if(!_catLookup) _catLookup = new Map(DATA.categories.map(c=>[c.name, c]));
  return _catLookup;
}
/** Call after any change to DATA.categories or CFG.fixkostenKats. */
function invalidateCatCache(){ _catLookup = null; _fixkostKatsSet = null; }

// Set of recurring IDs with affectsAvg===false (= fixkosten recurring)
let _fixRecurIds = null;
function _getFixRecurIds(){
  if(!_fixRecurIds) _fixRecurIds = new Set(DATA.recurring.filter(r=>!r.affectsAvg).map(r=>r.id));
  return _fixRecurIds;
}
/** Call after any change to DATA.recurring. */
function invalidateRecurCache(){ _fixRecurIds = null; }

// CFG.fixkostenKats as a Set (fast .has() checks)
let _fixkostKatsSet = null;
function _getFixkostKatsSet(){
  if(!_fixkostKatsSet) _fixkostKatsSet = new Set(CFG.fixkostenKats||[]);
  return _fixkostKatsSet;
}

const _DATA_ACTIONS = new Set(['get','append','update','meta','ensureSheet','setFormulas','fetchPrices']);

async function apiCall(params){
  const isAccountMode = !!(CFG.sessionToken && CFG.adminUrl);
  const isHybrid = isAccountMode && CFG.scriptUrl && _DATA_ACTIONS.has(params.action);
  const baseUrl = isHybrid ? CFG.scriptUrl : (isAccountMode ? CFG.adminUrl : CFG.scriptUrl);
  const allParams = (isAccountMode && !isHybrid) ? {...params, token: CFG.sessionToken} : params;
  const url = baseUrl + '?' + new URLSearchParams(allParams).toString();
  let r;
  try { r = await fetch(url); } catch(e){ throw new Error('Netzwerkfehler: '+e.message); }
  // Session expired via HTTP 401
  if(r.status === 401){
    CFG.sessionToken=''; CFG.authRole=''; cfgSave();
    toast('Sitzung abgelaufen – bitte neu anmelden','err');
    setTimeout(()=>location.reload(), 2500);
    throw new Error('HTTP 401 – Sitzung abgelaufen');
  }
  if(!r.ok) throw new Error('HTTP '+r.status);
  let data;
  try { data = await r.json(); } catch(e){ throw new Error('Ungültige Server-Antwort (kein JSON)'); }
  if(data && data.error){
    // Also catch German session-expiry string from backend (legacy support)
    if((data.error||'').includes('Sitzung abgelaufen') || (data.error||'').includes('session expired')){
      CFG.sessionToken=''; CFG.authRole=''; cfgSave();
      toast('Sitzung abgelaufen – bitte neu anmelden','err');
      setTimeout(()=>location.reload(), 2500);
    }
    throw new Error(data.error);
  }
  return data;
}

async function apiGet(range){
  return apiCall({action:'get', range});
}

// ── Row-Index Cache ───────────────────────────────────────────
// Caches sheet row numbers per (sheet, id) to avoid repeated O(n) column fetches.
// Populated by apiFindRow(); invalidated on append (new rows) or explicit reset.
const _rowCache = {}; // { [sheet]: { [id]: rowNum } }

function _rowCacheInvalidate(sheet){ delete _rowCache[sheet]; }

// Append a row and invalidate the row cache for that sheet.
async function apiAppend(sheet, values){
  const result = await apiCall({action:'append', sheet, values: JSON.stringify(values)});
  _rowCacheInvalidate(sheet); // row numbers shifted — cache is stale
  return result;
}

async function apiUpdate(range, values){
  return apiCall({action:'update', range, values: JSON.stringify(values)});
}

// Find row number of an entry by its ID (searches column A).
// Caches the full column index per sheet so repeated lookups in the same session
// hit memory instead of making O(n) network requests.
async function apiFindRow(sheet, id){
  if(_rowCache[sheet]?.[String(id)]) return _rowCache[sheet][String(id)];
  const res = await apiGet(sheet+'!A:A');
  const rows = res.values||[];
  // Populate full cache for this sheet in one pass
  _rowCache[sheet] = {};
  for(let i=0;i<rows.length;i++){
    const rowId = String(rows[i]?.[0] ?? '');
    if(rowId) _rowCache[sheet][rowId] = i+1; // 1-indexed
  }
  return _rowCache[sheet][String(id)] || null;
}

async function apiGetMeta(){
  return apiCall({action:'meta'});
}

// ═══════════════════════════════════════════════════════════════
// MODULE: DATA STATE
// ═══════════════════════════════════════════════════════════════
const DATA = {
  expenses: [],   // {id,date,what,cat,amt,note,groupId?,splitData?}
  incomes: [],    // {id,date,what,cat,amt,note,groupId?}
  recurring: [],  // {id,what,cat,amt,interval,day,note,active,start,endDate,affectsAvg}
  categories: [], // {id,name,type,color,sort,parent}
  sparziele: [],  // {id,name,target,start,saved,deadline,open,priority,taxPct,taxAmt,isTax}
  groups: [],     // {id,name,type('event'|'split'),members[],currency,status,created,adminId,inviteCode,sharedSheetUrl}
  groupEntries: [], // {id,groupId,authorName,date,what,cat,amt,currency,splitData,isMine,_type:'groupEntry'}
};

function genId(prefix){ return prefix+(Date.now().toString(36)+Math.random().toString(36).slice(2,5)).toUpperCase(); }
function today(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function dateStr(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

// Lohnzyklus: 25th → 24th of next month (lohnTag configurable)
function getCycleRange(){
  const now = new Date();
  const lt = CFG.lohnTag||25;
  let start, end;
  if(now.getDate()>=lt){
    start = new Date(now.getFullYear(),now.getMonth(),lt);
    end   = new Date(now.getFullYear(),now.getMonth()+1,lt-1);
  } else {
    start = new Date(now.getFullYear(),now.getMonth()-1,lt);
    end   = new Date(now.getFullYear(),now.getMonth(),lt-1);
  }
  return {start,end};
}

// Expand active Daueraufträge into synthetic expense objects within [startStr, endStr].
// capToToday (default true): when true caps at today so only realised bookings are returned.
//   Pass false to include scheduled future occurrences (needed for budget projections).
// Output fields are unified for both budget and display consumers:
//   id, date, what, cat, amt, note,
//   isFixkosten (!r.affectsAvg), isRecurring:true,
//   _type:'recurring', _recurId:r.id
function getRecurringOccurrences(startStr, endStr, capToToday=true, skipMaterialized=false){
  const todayS = today();
  const cutoff = capToToday ? (todayS < endStr ? todayS : endStr) : endStr;
  if(cutoff < startStr) return [];
  // Pre-compute set of already-materialized keys to avoid double-counting
  const matKeys = skipMaterialized ? new Set(DATA.expenses.filter(e=>e.recurringId).map(e=>e.recurringId+'_'+e.date)) : null;
  const results = [];
  for(const r of DATA.recurring){
    if(!r.active) continue;
    if(r.endDate && r.endDate < startStr) continue;
    const rStart = r.start || startStr;
    const interval = r.interval || 'monatlich';
    const fromDt = new Date(startStr+'T12:00:00');
    const toDt   = new Date(cutoff+'T12:00:00');
    const dates  = [];

    if(interval==='monatlich'){
      let year=fromDt.getFullYear(), month=fromDt.getMonth();
      const toYM=toDt.getFullYear()*12+toDt.getMonth();
      while(year*12+month<=toYM){
        const lastDay=new Date(year,month+1,0).getDate();
        const occDay=Math.min(r.day||1,lastDay);
        const ds=dateStr(new Date(year,month,occDay));
        if(ds>=startStr&&ds<=cutoff&&ds>=rStart&&(!r.endDate||ds<=r.endDate)) dates.push(ds);
        month++; if(month>11){month=0;year++;}
      }
    } else if(interval==='wöchentlich'||interval==='zweiwöchentlich'){
      const step=(interval==='wöchentlich'?7:14)*86400000;
      const anchor=rStart>startStr?rStart:startStr;
      const cur=new Date(anchor+'T12:00:00');
      for(let _i=0;_i<1000;_i++){
        const ds=dateStr(cur);
        if(ds>cutoff) break;
        if(ds>=startStr&&(!r.endDate||ds<=r.endDate)) dates.push(ds);
        cur.setTime(cur.getTime()+step);
      }
    } else if(interval==='jährlich'){
      const a=new Date(rStart+'T12:00:00');
      for(let i=0;i<20;i++){
        const ds=dateStr(new Date(fromDt.getFullYear()+i,a.getMonth(),a.getDate()));
        if(ds>cutoff) break;
        if(ds>=startStr&&ds>=rStart&&(!r.endDate||ds<=r.endDate)) dates.push(ds);
      }
    } else if(interval==='quartalsweise'){
      const a=new Date(rStart+'T12:00:00');
      let yr=a.getFullYear(),mo=a.getMonth();
      while(new Date(yr,mo,a.getDate())<fromDt){mo+=3;if(mo>11){mo-=12;yr++;}}
      for(let i=0;i<80;i++){
        const ds=dateStr(new Date(yr,mo,a.getDate()));
        if(ds>cutoff) break;
        if(ds>=startStr&&(!r.endDate||ds<=r.endDate)) dates.push(ds);
        mo+=3;if(mo>11){mo-=12;yr++;}
      }
    } else if(interval==='halbjährlich'||interval==='semestral'){
      const a=new Date(rStart+'T12:00:00');
      let yr=a.getFullYear(), mo=a.getMonth();
      while(new Date(yr,mo,a.getDate())<fromDt){mo+=6;if(mo>11){mo-=12;yr++;}}
      for(let i=0;i<40;i++){
        const ds=dateStr(new Date(yr,mo,a.getDate()));
        if(ds>cutoff) break;
        if(ds>=startStr&&ds>=rStart&&(!r.endDate||ds<=r.endDate)) dates.push(ds);
        mo+=6;if(mo>11){mo-=12;yr++;}
      }
    }

    for(const ds of dates){
      if(matKeys && matKeys.has(r.id+'_'+ds)) continue;
      results.push({
        id: r.id+'_r_'+ds, date: ds, what: r.what, cat: r.cat, amt: r.amt,
        note: r.note||'', isFixkosten: !r.affectsAvg,
        isRecurring: true, _type: 'recurring', _recurId: r.id,
      });
    }
  }
  return results;
}

// ═══════════════════════════════════════════════════
// ZENTRALE LOGIK-SCHICHT (Point 2 + 3)
// ═══════════════════════════════════════════════════

// Central fixkosten check: per-entry flag OR category in CFG.fixkostenKats
// OR entry is from a recurring that has affectsAvg=false (i.e. it's a standing fixed cost)
function isFixkostenEntry(e){
  if(!e) return false;
  if(e.isFixkosten) return true;
  if(_getFixkostKatsSet().has(e.cat)) return true;
  const fixIds = _getFixRecurIds();
  if(e.recurringId && fixIds.has(e.recurringId)) return true;
  if((e.isRecurring || e._type==='recurring') && e._recurId && fixIds.has(e._recurId)) return true;
  return false;
}

// Returns all expense-like objects (manual + optional Daueraufträge) for a date range.
// kategorien: null = all, else array of category names to include
// inclDauerauftraege: if true, includes recurring occurrences from getRecurringOccurrences
function getAusgaben(von, bis, kategorien=null, inclDauerauftraege=true, opts={}){
  let items = DATA.expenses.filter(e=>e.date>=von&&e.date<=bis);
  if(inclDauerauftraege){
    // Past/today occurrences are auto-materialized into DATA.expenses.
    // Only add future virtual occurrences (skipMaterialized avoids double-counting).
    const recur = getRecurringOccurrences(von, bis, true, true);
    items = [...items, ...recur];
  }
  if(kategorien) items = items.filter(e=>kategorien.includes(e.cat));
  // Group filter: exclude specific groups from general stats
  if(opts.excludeGroups){
    const excl = Array.isArray(opts.excludeGroups) ? opts.excludeGroups : DATA.groups.filter(g=>g.status==='active'&&g.type==='event').map(g=>g.id);
    items = items.filter(e=>!e.groupId||!excl.includes(e.groupId));
  }
  // Use ownShare for split entries when requested
  if(opts.useOwnShare){
    items = items.map(e=>e.splitData ? {...e, amt:getOwnShare(e)} : e);
  }
  return items;
}

// Returns income entries for a date range
function getEinnahmen(von, bis){
  return DATA.incomes.filter(e=>e.date>=von&&e.date<=bis);
}

// Returns net balance (incomes - expenses incl. recurring) for a date range
function getNetto(von, bis){
  return sumAmt(getEinnahmen(von,bis)) - sumAmt(getAusgaben(von,bis));
}

// Returns fixkosten entries for a date range (manual + recurring fixed costs)
function getFixkosten(von, bis){
  return getAusgaben(von,bis).filter(e=>isFixkostenEntry(e));
}

// Auto-materialize ALL due recurring occurrences (up to today) as real DATA.expenses entries.
// Called on every data load / renderAll. Syncs new entries to the Sheet in one batch.
// Guard prevents concurrent runs (e.g. rapid reload) from creating duplicates.
let _materializeRunning = false;
async function autoMaterializeRecurrings(){
  if(_materializeRunning) return;
  _materializeRunning = true;
  try { await _autoMaterializeImpl(); } finally { _materializeRunning = false; }
}
async function _autoMaterializeImpl(){
  if(!DATA.recurring.length) return;
  const todayStr = today();
  // Use a wide range: earliest possible start to today
  const earliest = DATA.recurring.reduce((min,r)=>r.start&&r.start<min?r.start:min, todayStr.slice(0,4)+'-01-01');
  // skipMaterialized=true: getRecurringOccurrences checks DATA.expenses for recurringId+date keys
  const occurrences = getRecurringOccurrences(earliest, todayStr, true, true);
  if(!occurrences.length) return;

  const newEntries = [];
  // Build a second dedupe set from DATA.expenses to guard against race
  // where entries were pushed after getRecurringOccurrences captured its snapshot
  const existingKeys = new Set(DATA.expenses.filter(e=>e.recurringId).map(e=>e.recurringId+'_'+e.date));
  for(const occ of occurrences){
    const key = occ._recurId+'_'+occ.date;
    if(existingKeys.has(key)) continue; // double-check: skip if already in DATA
    existingKeys.add(key); // prevent same key being added twice within this batch
    const r = DATA.recurring.find(r=>r.id===occ._recurId);
    if(!r) continue;
    const id = genId('A');
    const isFixk = !r.affectsAvg;
    const entry = {id, date:occ.date, what:occ.what, cat:occ.cat, amt:occ.amt,
      note:occ.note||'', recurringId:occ._recurId, isFixkosten:isFixk};
    DATA.expenses.push(entry);
    newEntries.push(entry);
  }
  if(!newEntries.length) return;

  // Sync all new materialized entries to Sheet
  if(!CFG.demo){
    setSyncStatus('syncing');
    try{
      const rows = newEntries.map(e=>[e.id,e.date,e.what,e.cat,e.amt,e.note,e.recurringId,e.isFixkosten?'1':'0']);
      await apiAppend('Ausgaben', rows);
      setSyncStatus('online');
    } catch(err){ setSyncStatus('error'); console.warn('Auto-materialize sync error:', err); }
  }
  dataCacheSave();
}

// Toggle a category in CFG.fixkostenKats
function toggleFixkostenKat(cat){
  const arr = CFG.fixkostenKats||[];
  const idx = arr.indexOf(cat);
  if(idx===-1) arr.push(cat); else arr.splice(idx,1);
  CFG.fixkostenKats = arr;
  cfgSave();
  // Invalidate caches that depend on fixkostenKats
  invalidateCatCache();  // _fixkostKatsSet is part of invalidateCatCache
  _zyklusCache = null;
  markDirty('all');
}

// ── Budget helpers (private) ──────────────────────────────────────────────────

/**
 * Calculate salary booked in [startStr, endStr].
 * Handles both explicit isLohn flag and legacy backward-compat (first 3 days of cycle).
 * Falls back to the active Lohn-Dauerauftrag amount if no real income found.
 */
function _calcLohnInRange(startStr, endStr){
  const win3 = dateStr(new Date(new Date(startStr+'T12:00:00').getTime()+2*86400000));
  let lohn = sumAmt(DATA.incomes.filter(e=>{
    if(e.date<startStr||e.date>endStr) return false;
    if(e.isLohn===true) return true;
    if(e.isLohn===undefined||e.isLohn===null) return e.date<=win3; // backward compat
    return false;
  }));
  if(lohn===0){
    const lohnRec = DATA.recurring.find(r=>r.active && r.isLohn && r.type==='einnahme');
    if(lohnRec){
      const hasOcc = getRecurringOccurrences(startStr, endStr, false, false)
        .some(e=>e._recurId===lohnRec.id);
      if(hasOcc) lohn = lohnRec.amt;
    }
  }
  return lohn;
}

/**
 * Sum fixed-cost expenses + recurring in [startStr, endStr].
 * capToToday: false = include future recurring (for forward-looking budget),
 *             true  = only realised (for historical views).
 */
function _calcFixKosten(startStr, endStr, capToToday=false){
  const recur = getRecurringOccurrences(startStr, endStr, capToToday, true);
  // Respect per-cycle renewal skips: CFG.recurringSkips[recurId] = [cycleStartStr, ...]
  // startStr doubles as the cycle identifier (it is the cycle start for both current and prev cycle calls)
  const skips = CFG.recurringSkips || {};
  return sumAmt([
    ...DATA.expenses.filter(e=>e.date>=startStr&&e.date<=endStr&&isFixkostenEntry(e)),
    ...recur.filter(e=>isFixkostenEntry(e) && !(skips[e._recurId]||[]).includes(startStr))
  ]);
}

/**
 * Sum variable expenses + recurring in [startStr, endStr] (today-capped).
 * Uses getOwnShare() for consistent group-split handling.
 */
function _calcVarSpent(startStr, endStr){
  const todayStr = today();
  const recur = getRecurringOccurrences(startStr, endStr, true, true);
  return [
    ...DATA.expenses.filter(e=>e.date>=startStr&&e.date<=todayStr&&!isFixkostenEntry(e)),
    ...recur.filter(e=>!isFixkostenEntry(e))
  ].reduce((s,e)=>s+getOwnShare(e), 0);
}

// Cache for getZyklusInfo — key encodes all inputs that affect the result.
// Invalidated automatically when data lengths or config changes.
let _zyklusCache = null, _zykulsCacheKey = null;

// Expose cache invalidation so ui.js toggle handlers can call it directly.
function invalidateZyklusCache(){ _zyklusCache = null; _zykulsCacheKey = null; }

function getZyklusInfo(){
  // Budget formula toggles (default true for backward-compat if not yet saved)
  const inclCarryover = CFG.budgetInclCarryover !== false;
  const inclSparziel  = CFG.budgetInclSparziel  !== false;

  // Key: today + lohnTag + data lengths + config that affects the result
  const key = today()+'|'+(CFG.lohnTag||25)+'|'+DATA.incomes.length+'|'+DATA.expenses.length
             +'|'+(CFG.mSparziel||0)+'|'+DATA.sparziele.length
             +'|'+(inclCarryover?1:0)+'|'+(inclSparziel?1:0);
  if(_zyklusCache && _zykulsCacheKey===key) return _zyklusCache;

  const {start,end} = getCycleRange();
  const now = new Date();
  const startStr = dateStr(start), endStr = dateStr(end);
  const lt = CFG.lohnTag||25;

  const lohn = _calcLohnInRange(startStr, endStr);

  // Fixed costs: full cycle range (capToToday=false) so a newly-added Dauerauftrag
  // for a future date immediately reduces the daily rate.
  const fixKosten = _calcFixKosten(startStr, endStr, false);

  // Previous cycle dates & full breakdown (always computed for transparency display)
  const prevEnd   = new Date(start.getTime()-86400000);
  const prevStart = prevEnd.getDate()>=lt
    ? new Date(prevEnd.getFullYear(),prevEnd.getMonth(),lt)
    : new Date(prevEnd.getFullYear(),prevEnd.getMonth()-1,lt);
  const prevStartStr  = dateStr(prevStart), prevEndStr = dateStr(prevEnd);
  const prevLohn      = _calcLohnInRange(prevStartStr, prevEndStr);
  const prevFixKosten = _calcFixKosten(prevStartStr, prevEndStr, true);
  const prevVarSpent  = _calcVarSpent(prevStartStr, prevEndStr);
  // Raw carryover always calculated; only applied to budget when toggle is on
  const prevCarryoverRaw = prevLohn > 0 ? (prevLohn - prevFixKosten - prevVarSpent) : 0;
  const prevCarryover    = inclCarryover ? prevCarryoverRaw : 0;

  // Savings target: dynamic Sparziele total or static CFG.mSparziel
  const sparMonthly  = (typeof sparTotalMonthly==='function' && DATA.sparziele.length>0)
    ? sparTotalMonthly() : 0;
  const mSparzielRaw = sparMonthly > 0 ? sparMonthly : (CFG.mSparziel||0);
  const mSparziel    = inclSparziel ? mSparzielRaw : 0;

  // Days: cycleDays = total days in cycle; daysElapsed includes today;
  // daysLeft = days from TOMORROW to end (what dailyRate divides by).
  const cycleDays    = Math.round((end-start)/86400000)+1;
  const daysElapsed  = Math.min(Math.round((now-start)/86400000)+1, cycleDays);
  const daysLeft     = cycleDays - daysElapsed;
  // First remaining day is tomorrow — used for display only
  const daysLeftStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1);

  const varBudget    = lohn - fixKosten + prevCarryover - mSparziel;
  const varSpent     = _calcVarSpent(startStr, endStr);
  const varRemaining = varBudget - varSpent;
  const dailyRate    = daysLeft > 0 ? varRemaining / daysLeft : null;

  _zyklusCache = {
    // Current cycle
    start, end, startStr, endStr,
    lohn, fixKosten, varBudget,
    cycleDays, daysElapsed, daysLeft, daysLeftStart,
    varSpent, varRemaining, dailyRate,
    hasSalary: lohn > 0,
    // Carryover — raw value always available for detail view
    prevCarryover, prevCarryoverRaw,
    prevStart, prevEnd, prevStartStr, prevEndStr,
    prevLohn, prevFixKosten, prevVarSpent,
    // Savings target — raw always available
    mSparziel, mSparzielRaw,
    // Toggle state (consumed by widgets)
    inclCarryover, inclSparziel,
  };
  _zykulsCacheKey = key;
  return _zyklusCache;
}

// Returns parent category name of a given category (empty string if top-level)
function parentOf(catName){ const c=_getCatLookup().get(catName); return c?c.parent:''; }

// Avg daily variable spend for a month (excluding Fixkosten; includes affectsAvg recurring)
function avgDailyVarSpend(mo, yr, daysElapsed){
  const s=`${yr}-${String(mo+1).padStart(2,'0')}-01`;
  const e=`${yr}-${String(mo+1).padStart(2,'0')}-${String(new Date(yr,mo+1,0).getDate()).padStart(2,'0')}`;
  const recur=getRecurringOccurrences(s,e,true,true).filter(r=>!isFixkostenEntry(r));
  const allExp=[...DATA.expenses.filter(ex=>{
    const d=new Date(ex.date+'T12:00:00');
    return d.getMonth()===mo&&d.getFullYear()===yr&&!isFixkostenEntry(ex)&&!ex.excludeAvg;
  }),...recur];
  const total=allExp.reduce((a,ex)=>a+ex.amt,0);
  return daysElapsed>0?total/daysElapsed:0;
}
// Smart prev-month avg: categories marked isFixkosten in currMo/currYr are also excluded from prev month
// Includes recurring occurrences for prev month (same as avgDailyVarSpend does for current)
function avgDailyVarSpendPrevComp(currMo, currYr){
  const prevMo = currMo===0?11:currMo-1;
  const prevYr = currMo===0?currYr-1:currYr;
  const daysInPrev = new Date(prevYr,prevMo+1,0).getDate();
  const ps=`${prevYr}-${String(prevMo+1).padStart(2,'0')}-01`;
  const pe=`${prevYr}-${String(prevMo+1).padStart(2,'0')}-${String(daysInPrev).padStart(2,'0')}`;
  const recur=getRecurringOccurrences(ps,pe,true,true).filter(r=>!isFixkostenEntry(r));
  const expEntries = DATA.expenses.filter(e=>{
    const d=new Date(e.date+'T12:00:00');
    return d.getMonth()===prevMo&&d.getFullYear()===prevYr&&!isFixkostenEntry(e)&&!e.excludeAvg;
  });
  const total = sumAmt([...expEntries,...recur]);
  return {avg:daysInPrev>0?total/daysInPrev:0, prevMo, prevYr};
}
// Avg daily variable spend for a full year
function avgDailyVarSpendYear(yr){
  const now = new Date();
  const isCurrentYear = yr === now.getFullYear();
  const fixCats = new Set(DATA.recurring.filter(r=>r.active&&!r.affectsAvg).map(r=>r.cat));
  const total = sumAmt(DATA.expenses.filter(e=>{
    const d=new Date(e.date+'T12:00:00');
    return d.getFullYear()===yr && !fixCats.has(e.cat) && !e.excludeAvg && !e.isFixkosten;
  }));
  const daysElapsed = isCurrentYear
    ? Math.floor((now - new Date(yr,0,1))/86400000)+1
    : (new Date(yr+1,0,1)-new Date(yr,0,1))/86400000;
  return daysElapsed>0 ? total/daysElapsed : 0;
}
// Cached Intl formatters — created once, reused on every call
const _numFmt  = new Intl.NumberFormat('de-CH',{minimumFractionDigits:2,maximumFractionDigits:2});
const _dateFmt = new Intl.DateTimeFormat('de-CH',{day:'numeric',month:'short',year:'numeric'});
function fmtDate(s){ if(!s)return ''; try{ return _dateFmt.format(new Date(s+'T12:00:00')); }catch{ return s; } }
function fmtAmt(n){ return _numFmt.format(Math.abs(n)); }

// Normalize date from Google Sheets (various formats → YYYY-MM-DD)
function normalizeDate(s){
  if(s===null||s===undefined||s==='') return '';
  // Google Sheets serial number (days since Dec 30 1899, e.g. 45678)
  const num = typeof s==='number' ? s : (/^\d{4,5}$/.test(String(s).trim()) ? +s : null);
  if(num && num>25000 && num<80000){
    const d=new Date(Math.round((num-25569)*86400000));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  }
  s=String(s).trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;                           // YYYY-MM-DD
  const isoT=s.match(/^(\d{4}-\d{2}-\d{2})T/); if(isoT) return isoT[1]; // YYYY-MM-DDTHH…
  const dm=s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);                  // DD.MM.YYYY
  if(dm) return `${dm[3]}-${dm[2].padStart(2,'0')}-${dm[1].padStart(2,'0')}`;
  const sl=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);                  // DD/MM/YYYY
  if(sl) return `${sl[3]}-${sl[2].padStart(2,'0')}-${sl[1].padStart(2,'0')}`;
  const d=new Date(s);
  if(!isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return ''; // unparseable → leer statt "Invalid Date"
}

// Normalize amount from Google Sheets (handles 1'234.50, 1.234,50 etc.)
function normalizeAmt(s){
  if(typeof s === 'number') return s;
  const str = String(s||'').trim().replace(/['''\s]/g,'').replace(/,(\d{1,2})$/,'.$1');
  return parseFloat(str)||0;
}
function catColor(name){ const c=_getCatLookup().get(name); return c?c.color:'#888'; }
function catEmoji(name){
  const cat = _getCatLookup().get(name);
  if(cat && cat.emoji) return cat.emoji;
  const map={'Zmittag':'🍱','Snack':'🍫','Ferien':'✈️','Poschte':'🛒','Znacht':'🍽️','Gschänk':'🎁','Chleider':'👕','Technik':'💻','Mieti':'🏠','Gsundheit':'💊','Internet':'📡','Handy':'📱','Alkohol':'🍺','Essen in Reschti':'🍷','Rudern':'🚣','Bildung':'📚','Verlochet':'🎉','SBB':'🚆','Möbel o.Ä.':'🪑','Gipfeli':'🥐','Buch':'📖','Sport':'⚽','Freiziit':'🎮','Diverses':'📦','Siemens':'💼','Twint':'📲','Schenkung':'🎀','Übertrag':'🔄'};
  return map[name]||'💰';
}

// ═══════════════════════════════════════════════════════════════
// GROUPS & EVENTS — data helpers
// ═══════════════════════════════════════════════════════════════

// Get expenses for a specific group
function getGroupExpenses(groupId){
  return DATA.expenses.filter(e=>e.groupId===groupId);
}

// Get incomes for a specific group
function getGroupIncomes(groupId){
  return DATA.incomes.filter(e=>e.groupId===groupId);
}

// Total spent in a group
function getGroupTotal(groupId){
  return sumAmt(getGroupExpenses(groupId));
}

// For split groups: calculate balances for each member
// Returns { memberName: balance } (positive = is owed, negative = owes)
function calcSplitBalances(groupId){
  const expenses = getGroupExpenses(groupId);
  const balances = {};
  const group = DATA.groups.find(g=>g.id===groupId);
  if(!group) return balances;
  group.members.forEach(m=>{ balances[m]=0; });

  for(const e of expenses){
    if(!e.splitData) continue;
    let sd;
    try { sd = typeof e.splitData==='string' ? JSON.parse(e.splitData) : e.splitData; }
    catch(err){ console.warn('calcSplitBalances: invalid splitData for entry', e.id, err); continue; }
    const payer = sd.payerId || (typeof _myGroupId==='function' ? _myGroupId() : CFG.authUser||CFG.userName);
    const total = sd.totalAmount || e.amt;
    // Payer paid the full amount
    if(balances[payer]===undefined) balances[payer]=0;
    balances[payer] += total;
    // Each participant owes their share
    const parts = sd.participants||{};
    for(const [member, share] of Object.entries(parts)){
      if(balances[member]===undefined) balances[member]=0;
      balances[member] -= share;
    }
  }
  return balances;
}

// Simplify debts: returns [{from, to, amount}] to settle all balances
function calcSettlements(groupId){
  const balances = calcSplitBalances(groupId);
  const debtors = []; // negative balance = owes money
  const creditors = []; // positive balance = is owed money

  for(const [member, bal] of Object.entries(balances)){
    if(bal < -0.005) debtors.push({name:member, amt:-bal});
    else if(bal > 0.005) creditors.push({name:member, amt:bal});
  }

  debtors.sort((a,b)=>b.amt-a.amt);
  creditors.sort((a,b)=>b.amt-a.amt);

  const settlements = [];
  let di=0, ci=0;
  while(di<debtors.length && ci<creditors.length){
    const transfer = Math.min(debtors[di].amt, creditors[ci].amt);
    if(transfer > 0.005){
      settlements.push({from:debtors[di].name, to:creditors[ci].name, amount:Math.round(transfer*100)/100});
    }
    debtors[di].amt -= transfer;
    creditors[ci].amt -= transfer;
    if(debtors[di].amt < 0.005) di++;
    if(creditors[ci].amt < 0.005) ci++;
  }
  return settlements;
}

// Own share from an expense with splitData (for stats filtering)
function getOwnShare(expense){
  if(!expense.splitData) return expense.amt;
  const sd = typeof expense.splitData==='string' ? JSON.parse(expense.splitData) : expense.splitData;
  const parts = sd.participants||{};
  const myId = typeof _myGroupId==='function' ? _myGroupId() : (CFG.authUser||'');
  const myName = CFG.userName||'';
  if(parts[myId]!==undefined) return parts[myId];
  if(parts[myName]!==undefined) return parts[myName];
  return expense.amt;
}

// Top categories within a group
function getGroupTopCategories(groupId, limit=5){
  const expenses = getGroupExpenses(groupId);
  const cats = {};
  for(const e of expenses){
    cats[e.cat] = (cats[e.cat]||0) + e.amt;
  }
  return Object.entries(cats)
    .sort((a,b)=>b[1]-a[1])
    .slice(0, limit)
    .map(([name,total])=>({name,total}));
}

// getGroupShadowEntries() is defined in groups.js (needs _myGroupName())

