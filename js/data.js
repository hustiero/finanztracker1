// ═══════════════════════════════════════════════════════════════
// MODULE: SHEETS API (via Google Apps Script, GET-only)
// ═══════════════════════════════════════════════════════════════

async function apiCall(params){
  const isAccountMode = !!(CFG.sessionToken && CFG.adminUrl);
  const baseUrl = isAccountMode ? CFG.adminUrl : CFG.scriptUrl;
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

async function apiGet(range){
  return apiCall({action:'get', range});
}

async function apiAppend(sheet, values){
  return apiCall({action:'append', sheet, values: JSON.stringify(values)});
}

async function apiUpdate(range, values){
  return apiCall({action:'update', range, values: JSON.stringify(values)});
}

// Find row number of an entry by its ID (searches column A)
async function apiFindRow(sheet, id){
  const res = await apiGet(sheet+'!A:A');
  const rows = res.values||[];
  for(let i=0;i<rows.length;i++){
    if(String(rows[i][0])===String(id)) return i+1; // 1-indexed
  }
  return null;
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
  groups: [],     // {id,name,type('event'|'split'),members[],currency,status('active'|'archived'),created}
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
      while(new Date(year,month,1)<=new Date(toDt.getFullYear(),toDt.getMonth(),1)){
        const lastDay=new Date(year,month+1,0).getDate();
        const occDay=Math.min(r.day||1,lastDay);
        const ds=dateStr(new Date(year,month,occDay));
        if(ds>=startStr&&ds<=cutoff&&ds>=rStart&&(!r.endDate||ds<=r.endDate)) dates.push(ds);
        month++; if(month>11){month=0;year++;}
      }
    } else if(interval==='wöchentlich'||interval==='zweiwöchentlich'){
      const step=(interval==='wöchentlich'?7:14)*86400000;
      const anchor=rStart>startStr?rStart:startStr;
      let cur=new Date(anchor+'T12:00:00');
      while(true){
        const ds=dateStr(cur);
        if(ds>cutoff) break;
        if(ds>=startStr&&(!r.endDate||ds<=r.endDate)) dates.push(ds);
        cur=new Date(cur.getTime()+step);
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
  if((CFG.fixkostenKats||[]).includes(e.cat)) return true;
  if(e.recurringId){
    const r = DATA.recurring.find(r=>r.id===e.recurringId);
    if(r && !r.affectsAvg) return true;
  }
  // Virtual recurring entries from getRecurringOccurrences (isRecurring:true + _recurId)
  // or from the legacy getRecurringInstances (_type:'recurring' + _recurId)
  if(e.isRecurring || e._type==='recurring'){
    const r = DATA.recurring.find(r=>r.id===e._recurId);
    if(r && !r.affectsAvg) return true;
  }
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
  const inc = getEinnahmen(von,bis).reduce((s,e)=>s+e.amt,0);
  const out = getAusgaben(von,bis).reduce((s,e)=>s+e.amt,0);
  return inc - out;
}

// Returns fixkosten entries for a date range (manual + recurring fixed costs)
function getFixkosten(von, bis){
  return getAusgaben(von,bis).filter(e=>isFixkostenEntry(e));
}

// Auto-materialize ALL due recurring occurrences (up to today) as real DATA.expenses entries.
// Called on every data load / renderAll. Syncs new entries to the Sheet in one batch.
let _materializingLock = false;
async function autoMaterializeRecurrings(){
  if(_materializingLock) return;
  _materializingLock = true;
  try{ await _doMaterialize(); }finally{ _materializingLock = false; }
}
async function _doMaterialize(){
  if(!DATA.recurring.length) return;
  const todayStr = today();
  // Use a wide range: earliest possible start to today
  const earliest = DATA.recurring.reduce((min,r)=>r.start&&r.start<min?r.start:min, todayStr.slice(0,4)+'-01-01');
  const occurrences = getRecurringOccurrences(earliest, todayStr, true, true);
  if(!occurrences.length) return;

  const newEntries = [];
  for(const occ of occurrences){
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
  renderLohn();
  renderAll();
}

function getZyklusInfo(){
  const {start,end} = getCycleRange();
  const now = new Date();
  const startStr = dateStr(start), endStr = dateStr(end), todayStr = today();
  const lt = CFG.lohnTag||25;
  // Salary: incomes marked as Lohn, OR (backward compat) incomes in first 3 days of cycle without isLohn flag
  const win3 = dateStr(new Date(start.getTime()+2*86400000));
  const lohn = DATA.incomes.filter(e=>{
    if(e.date<startStr||e.date>endStr) return false;
    if(e.isLohn===true) return true;
    if(e.isLohn===undefined||e.isLohn===null) return e.date<=win3; // backward compat
    return false;
  }).reduce((s,e)=>s+e.amt,0);
  // Fixed costs: use the FULL cycle range (capToToday=false) so a Dauerauftrag added on
  // the 16th for the 26th immediately reduces the daily rate — the user doesn't have to
  // wait until the payment date for the budget to reflect it.
  const recurInCycleFull  = getRecurringOccurrences(startStr, endStr, false, true);
  // Variable spending still uses today-capped recurring (only realised transactions count).
  const recurInCycleToday = getRecurringOccurrences(startStr, endStr, true, true);
  const fixKosten = [
    ...DATA.expenses.filter(e=>e.date>=startStr&&e.date<=endStr&&isFixkostenEntry(e)),
    ...recurInCycleFull.filter(e=>isFixkostenEntry(e))
  ].reduce((s,e)=>s+e.amt,0);
  // Previous cycle carryover
  const prevEnd = new Date(start.getTime()-86400000);
  const prevStart = prevEnd.getDate()>=lt
    ? new Date(prevEnd.getFullYear(),prevEnd.getMonth(),lt)
    : new Date(prevEnd.getFullYear(),prevEnd.getMonth()-1,lt);
  const prevStartStr=dateStr(prevStart), prevEndStr=dateStr(prevEnd);
  const prevWin3=dateStr(new Date(prevStart.getTime()+2*86400000));
  const prevLohn=DATA.incomes.filter(e=>{
    if(e.date<prevStartStr||e.date>prevEndStr) return false;
    if(e.isLohn===true) return true;
    if(e.isLohn===undefined||e.isLohn===null) return e.date<=prevWin3;
    return false;
  }).reduce((s,e)=>s+e.amt,0);
  const prevRecur = getRecurringOccurrences(prevStartStr, prevEndStr, true, true);
  const prevFixKosten = [...DATA.expenses.filter(e=>e.date>=prevStartStr&&e.date<=prevEndStr&&isFixkostenEntry(e)),...prevRecur.filter(e=>isFixkostenEntry(e))].reduce((s,e)=>s+e.amt,0);
  const prevVarSpent  = [...DATA.expenses.filter(e=>e.date>=prevStartStr&&e.date<=prevEndStr&&!isFixkostenEntry(e)),...prevRecur.filter(e=>!isFixkostenEntry(e))].reduce((s,e)=>s+e.amt,0);
  const prevCarryover = prevLohn>0 ? (prevLohn - prevFixKosten - prevVarSpent) : 0;
  // Use dynamic Sparziele monthly total if goals exist, fallback to CFG.mSparziel
  const sparMonthly = (typeof sparTotalMonthly==='function' && DATA.sparziele.length>0) ? sparTotalMonthly() : 0;
  const mSparziel = sparMonthly > 0 ? sparMonthly : (CFG.mSparziel||0);
  const cycleDays   = Math.round((end-start)/86400000)+1;
  const daysElapsed = Math.min(Math.round((now-start)/86400000)+1, cycleDays);
  const daysLeft    = cycleDays - daysElapsed;
  const varBudget   = lohn - fixKosten + prevCarryover - mSparziel;
  // varSpent: non-fixkosten manual expenses + non-fixkosten recurring realised today or earlier
  const varSpent = [
    ...DATA.expenses.filter(e=>e.date>=startStr&&e.date<=todayStr&&!isFixkostenEntry(e)),
    ...recurInCycleToday.filter(e=>!isFixkostenEntry(e))
  ].reduce((s,e)=>s+e.amt,0);
  const varRemaining= varBudget - varSpent;
  const dailyRate   = daysLeft>0 ? varRemaining/daysLeft : null;
  return {start,end,startStr,endStr,lohn,fixKosten,varBudget,cycleDays,daysElapsed,daysLeft,varSpent,varRemaining,dailyRate,hasSalary:lohn>0,prevCarryover,mSparziel};
}

// Returns parent category name of a given category (empty string if top-level)
function parentOf(catName){ const c=DATA.categories.find(c=>c.name===catName); return c?c.parent:''; }

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
  const total = [...expEntries,...recur].reduce((s,e)=>s+e.amt,0);
  return {avg:daysInPrev>0?total/daysInPrev:0, prevMo, prevYr};
}
// Avg daily variable spend for a full year
function avgDailyVarSpendYear(yr){
  const now = new Date();
  const isCurrentYear = yr === now.getFullYear();
  const fixCats = new Set(DATA.recurring.filter(r=>r.active&&!r.affectsAvg).map(r=>r.cat));
  const total = DATA.expenses.filter(e=>{
    const d=new Date(e.date+'T12:00:00');
    return d.getFullYear()===yr && !fixCats.has(e.cat) && !e.excludeAvg && !e.isFixkosten;
  }).reduce((s,e)=>s+e.amt,0);
  const daysElapsed = isCurrentYear
    ? Math.floor((now - new Date(yr,0,1))/86400000)+1
    : (new Date(yr+1,0,1)-new Date(yr,0,1))/86400000;
  return daysElapsed>0 ? total/daysElapsed : 0;
}
function fmtDate(s){ if(!s)return ''; const d=new Date(s+'T12:00:00'); return d.toLocaleDateString('de-CH',{day:'numeric',month:'short',year:'numeric'}); }
function fmtAmt(n){ return (Math.abs(n)).toLocaleString('de-CH',{minimumFractionDigits:2,maximumFractionDigits:2}); }

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
function catColor(name){ const c=DATA.categories.find(c=>c.name===name); return c?c.color:'#888'; }
function catEmoji(name){
  const cat = DATA.categories.find(c=>c.name===name);
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
  return getGroupExpenses(groupId).reduce((s,e)=>s+e.amt,0);
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
    const sd = typeof e.splitData==='string' ? JSON.parse(e.splitData) : e.splitData;
    const payer = sd.payerId || CFG.userName;
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
  const me = CFG.userName||'';
  return parts[me]!==undefined ? parts[me] : expense.amt;
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

