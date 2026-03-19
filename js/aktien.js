// ═══════════════════════════════════════════════════════════════
// MODULE: AKTIEN-TRADE VIA EINGABE-TAB
// ═══════════════════════════════════════════════════════════════
let aktienTradeTyp = 'kauf'; // 'kauf' | 'verkauf'

function setAktienTradeType(t){
  aktienTradeTyp = t;
  document.getElementById('at-kauf-btn').className='type-btn'+(t==='kauf'?' active':'');
  document.getElementById('at-verk-btn').className='type-btn'+(t==='verkauf'?' active':'');
}

function renderAktienTradeForm(){
  // Populate stock dropdown
  const sel = document.getElementById('at-stock'); if(!sel) return;
  const stocks = SDATA.stocks||[];
  sel.innerHTML = `<option value="">— Aktie wählen —</option>` +
    stocks.map(s=>{
      const pos=calcPosition(s.id);
      return `<option value="${s.id}">${esc(s.title)}${s.ticker?' ('+esc(s.ticker)+')':''} · ${fmtQty(pos.qty)} Stk.</option>`;
    }).join('');
  // Set today as default date
  const dateEl = document.getElementById('at-date');
  if(dateEl && !dateEl.value) dateEl.value = today();
  updateAktienTotal();
}

function updateAktienTotal(){
  const qty = parseFloat(document.getElementById('at-qty')?.value)||0;
  const price = parseFloat(document.getElementById('at-price')?.value)||0;
  const total = qty * price;
  const el = document.getElementById('at-total');
  if(el) el.value = total>0 ? `${curr()} ${fmtAmt(total)}` : '';
}

function openNewAktieModalFromEingabe(){
  // Reuse existing new-aktie modal, then return to eingabe
  openNewAktieModal();
}

async function saveAktienTradeFromEingabe(){
  const stockId = document.getElementById('at-stock')?.value;
  if(!stockId){ toast('Bitte Aktie wählen','err'); return; }
  const qty = parseFloat(document.getElementById('at-qty')?.value)||0;
  const price = parseFloat(document.getElementById('at-price')?.value)||0;
  const date = document.getElementById('at-date')?.value || today();
  const note = document.getElementById('at-note')?.value.trim()||'';
  if(qty<=0){ toast('Anzahl erforderlich','err'); return; }
  if(price<=0){ toast('Preis erforderlich','err'); return; }
  const id = genId('T');
  const trade = {id, stockId, type:aktienTradeTyp, qty, price, date, note};
  SDATA.trades.push(trade);
  if(!CFG.demo){
    setSyncStatus('syncing');
    try{
      await apiAppend('Trades',[[id, stockId, aktienTradeTyp, qty, price, date, note]]);
      setSyncStatus('online');
    } catch(e){ setSyncStatus('error'); toast('Sync-Fehler: '+e.message,'err'); return; }
  }
  // Reset form
  document.getElementById('at-qty').value='';
  document.getElementById('at-price').value='';
  document.getElementById('at-note').value='';
  document.getElementById('at-total').value='';
  toast('Trade gespeichert');
  renderAktienTradeForm();
}

// ═══════════════════════════════════════════════════════════════
// MODULE: AKTIEN
// ═══════════════════════════════════════════════════════════════
const STOCKS_KEY = 'ft_stocks_v1';
let SDATA = { stocks:[], trades:[] };
let PDATA = { verlauf:[] }; // [{date, total}] — loaded from Portfolio-Verlauf sheet
let aktienView = 'aktiv';
let currentAktieId = null;
let stockPriceCache = {}; // ticker → { price, currency, ts }
let fxRateCache = {}; // "USDCHF" → rate (to convert from USD to CHF)

function sdataLoad(){
  try{ const s=localStorage.getItem(STOCKS_KEY); if(s) SDATA=JSON.parse(s); }
  catch(e){ SDATA={stocks:[],trades:[]}; }
}
function sdataSave(){ localStorage.setItem(STOCKS_KEY, JSON.stringify(SDATA)); }

// ── GOOGLEFINANCE: Kurse-Sheet Sync ──────────────────────────────────────────
// Writes tickers to Kurse sheet, sets GOOGLEFINANCE formulas, reads back prices + FX rates.
// Falls back to Yahoo Finance if sheet unavailable.
// extraTickers: optional additional tickers to fetch (e.g. ticker being tested before save)
// Normalize ticker from Yahoo format to GOOGLEFINANCE format
function normalizeTickerForGF(t){
  t = t.trim().toUpperCase();
  // Yahoo ".SW" → GOOGLEFINANCE "VTX:" (Swiss Exchange)
  if(t.endsWith('.SW')){ return 'VTX:'+t.replace('.SW',''); }
  // Yahoo ".DE" → GOOGLEFINANCE "FRA:"
  if(t.endsWith('.DE')){ return 'FRA:'+t.replace('.DE',''); }
  // Yahoo ".L" → GOOGLEFINANCE "LON:"
  if(t.endsWith('.L')){ return 'LON:'+t.replace('.L',''); }
  // Yahoo ".PA" → GOOGLEFINANCE "EPA:"
  if(t.endsWith('.PA')){ return 'EPA:'+t.replace('.PA',''); }
  // Yahoo ".TO" → GOOGLEFINANCE "TSE:"
  if(t.endsWith('.TO')){ return 'TSE:'+t.replace('.TO',''); }
  // Yahoo ".AS" → GOOGLEFINANCE "AMS:"
  if(t.endsWith('.AS')){ return 'AMS:'+t.replace('.AS',''); }
  // Already has colon (GOOGLEFINANCE format) or plain US ticker → keep as-is
  return t;
}

// Normalize ticker from GOOGLEFINANCE format (FRA:BMW) → Yahoo Finance format (BMW.DE)
function normalizeTickerForYahoo(t){
  t = t.trim().toUpperCase();
  if(t.startsWith('VTX:')){ return t.replace('VTX:','') + '.SW'; }
  if(t.startsWith('FRA:')){ return t.replace('FRA:','') + '.DE'; }
  if(t.startsWith('LON:')){ return t.replace('LON:','') + '.L'; }
  if(t.startsWith('EPA:')){ return t.replace('EPA:','') + '.PA'; }
  if(t.startsWith('TSE:')){ return t.replace('TSE:','') + '.TO'; }
  if(t.startsWith('AMS:')){ return t.replace('AMS:','') + '.AS'; }
  if(t.startsWith('NASDAQ:')){ return t.replace('NASDAQ:',''); }
  if(t.startsWith('NYSE:')){ return t.replace('NYSE:',''); }
  // Already Yahoo format or plain US ticker → keep as-is
  return t;
}
async function syncKurseSheet(extraTickers=[]){
  if(CFG.demo || (!CFG.scriptUrl && !CFG.sessionToken)) return;
  const tickers = SDATA.stocks.filter(s=>s.ticker).map(s=>normalizeTickerForGF(s.ticker));
  const userCurr = curr().toUpperCase();
  const stockCurrencies = [...new Set(SDATA.stocks.map(s=>(s.currency||'').toUpperCase()))].filter(c=>c&&c!==userCurr);
  const fxTickers = stockCurrencies.map(c=>`CURRENCY:${c}${userCurr}`);
  const allTickers = [...new Set([...tickers, ...fxTickers, ...extraTickers.map(t=>t.toUpperCase())])];
  if(!allTickers.length) return;

  try{
    // Server-side: sets GOOGLEFINANCE formulas, flush(), reads back — all in one call
    const res = await apiCall({action:'fetchPrices', tickers:JSON.stringify(allTickers)});
    if(res.prices){
      for(const [ticker, data] of Object.entries(res.prices)){
        if(!data.price || data.price<=0) continue;
        if(ticker.startsWith('CURRENCY:')){
          fxRateCache[ticker.replace('CURRENCY:','')] = data.price;
        } else {
          stockPriceCache[ticker] = {price:data.price, prevClose:data.prevClose||null, currency:data.currency||'', ts:Date.now()};
        }
      }
    }
  }catch(e){ console.warn('syncKurseSheet error:', e); }
}

// ── Portfolio-Verlauf ─────────────────────────────────────────────────────────
async function loadPortfolioVerlauf(){
  if(CFG.demo || (!CFG.scriptUrl && !CFG.sessionToken)){ PDATA.verlauf=[]; return; }
  try{
    const res = await apiGet('Portfolio-Verlauf!A2:B500');
    PDATA.verlauf = (res.values||[])
      .filter(r=>r[0]&&parseFloat(r[1])>0)
      .map(r=>({date:String(r[0]).slice(0,10), total:parseFloat(r[1])||0}))
      .sort((a,b)=>a.date.localeCompare(b.date));
  }catch(e){ PDATA.verlauf=[]; }
}

async function appendPortfolioSnapshot(){
  if(CFG.demo || (!CFG.scriptUrl && !CFG.sessionToken)) return;
  const total = getGesamtPortfoliowert();
  if(total<=0) return;
  const todayStr = today();
  try{
    await apiCall({action:'ensureSheet', sheet:'Portfolio-Verlauf', headers:JSON.stringify(['Datum','Gesamt'])});
    // Don't duplicate today's entry
    const last = PDATA.verlauf[PDATA.verlauf.length-1];
    if(last && last.date===todayStr){
      // Update today's value in place
      const res2 = await apiGet('Portfolio-Verlauf!A:A');
      const rows2 = res2.values||[];
      const rowIdx = rows2.findIndex(r=>String(r[0]).slice(0,10)===todayStr);
      if(rowIdx>0) await apiUpdate(`Portfolio-Verlauf!B${rowIdx+1}:B${rowIdx+1}`,[[total]]);
      PDATA.verlauf[PDATA.verlauf.length-1].total = total;
    } else {
      await apiAppend('Portfolio-Verlauf',[[todayStr, total]]);
      PDATA.verlauf.push({date:todayStr, total});
    }
  }catch(e){ /* silent */ }
}

// Calculate position: qty held, weighted avg price, total cost
// Deterministic color for a stock by id or index
const AKTIE_PALETTE = ['#6dd5fa','#f7971e','#a18cd1','#fd7f6f','#b8e994','#f9ca24','#6c5ce7','#fd79a8','#00cec9','#e17055'];
function aktieColor(stockId){
  const idx = SDATA.stocks.findIndex(s=>s.id===stockId);
  return AKTIE_PALETTE[(idx>=0?idx:0) % AKTIE_PALETTE.length];
}

// ── Zentrale Aktien-Berechnungsfunktionen (Funktionskatalog, Point 4) ────────

// Gewichteter Durchschnittspreis für eine Position
function getDurchschnittsPreis(stockId){ return calcPosition(stockId).avgPrice; }

// Aktueller Live-Kurs aus Cache (null wenn nicht verfügbar)
function getAktuellerKurs(ticker){
  if(!ticker) return null;
  // Try original key first, then normalized GOOGLEFINANCE key
  const p = stockPriceCache[ticker.toUpperCase()] || stockPriceCache[normalizeTickerForGF(ticker)];
  return p?.price ?? null;
}
function getCachedStock(ticker){
  if(!ticker) return null;
  return stockPriceCache[ticker.toUpperCase()] || stockPriceCache[normalizeTickerForGF(ticker)] || null;
}

// FX conversion helpers
// Returns exchange rate for fromCurrency → curr() (user's currency), or 1 if same/unknown
function getFxRate(fromCurrency){
  if(!fromCurrency) return 1;
  const fc = fromCurrency.toUpperCase(), uc = curr().toUpperCase();
  if(fc === uc) return 1;
  const key = fc + uc;
  return fxRateCache[key] || 1; // fallback 1 = no conversion (rate unknown)
}
// Returns true if FX rate is available for given stock currency
function hasFxRate(fromCurrency){
  if(!fromCurrency) return true;
  const fc = fromCurrency.toUpperCase(), uc = curr().toUpperCase();
  if(fc === uc) return true;
  return !!(fxRateCache[fc + uc]);
}
// Convert an amount from fromCurrency to user's currency
function toUserCurrency(amount, fromCurrency){ return amount * getFxRate(fromCurrency); }

// Positionswert: qty × aktueller Kurs (in user currency), fallback auf Einstand
function getPositionsWert(stockId){
  const pos = calcPosition(stockId);
  const s = SDATA.stocks.find(s=>s.id===stockId);
  const lp = s?.ticker ? getAktuellerKurs(s.ticker) : null;
  if(lp!=null && pos.qty>0.0001){
    const inUserCurr = toUserCurrency(lp, getCachedStock(s.ticker)?.currency || s.currency);
    return pos.qty * inUserCurr;
  }
  return toUserCurrency(pos.totalCost, s?.currency);
}

// Gesamter Portfolio-Marktwert (Summe aller Positionswerte)
function getGesamtPortfoliowert(){
  return SDATA.stocks.reduce((sum,s)=>sum+getPositionsWert(s.id), 0);
}

// Gewinn/Verlust für eine Position {amt, pct, hasLive} — in user currency
function getGewinnVerlust(stockId){
  const pos = calcPosition(stockId);
  const s = SDATA.stocks.find(s=>s.id===stockId);
  if(!s || pos.qty<0.0001) return {amt:0,pct:0,hasLive:false};
  const lp = s.ticker ? getAktuellerKurs(s.ticker) : null;
  if(lp==null) return {amt:0,pct:0,hasLive:false};
  const stockCurr = getCachedStock(s.ticker)?.currency || s.currency;
  const fxRate = getFxRate(stockCurr);
  const lpConverted = lp * fxRate;
  const avgConverted = pos.avgPrice * fxRate;
  const amt = (lpConverted - avgConverted) * pos.qty;
  const pct = pos.avgPrice>0 ? (lp/pos.avgPrice-1)*100 : 0; // % stays in original currency
  return {amt, pct, hasLive:true};
}

// Gesamter Portfolio-GV (Summe aller Positionen mit Live-Kurs) — in user currency
function getGesamtGewinnVerlust(){
  let amt=0, cost=0, hasAny=false;
  SDATA.stocks.forEach(s=>{
    const pos=calcPosition(s.id); if(pos.qty<0.0001) return;
    const lp=s.ticker?getAktuellerKurs(s.ticker):null; if(!lp) return;
    const stockCurr = getCachedStock(s.ticker)?.currency || s.currency;
    const fxRate = getFxRate(stockCurr);
    amt+=(lp-pos.avgPrice)*pos.qty*fxRate; cost+=pos.totalCost*fxRate; hasAny=true;
  });
  return {amt, pct:cost>0?amt/cost*100:0, hasLive:hasAny};
}

function calcPosition(stockId){
  const trades = SDATA.trades.filter(t=>t.stockId===stockId).sort((a,b)=>a.date.localeCompare(b.date));
  let qty=0, totalCost=0;
  for(const t of trades){
    if(t.type==='kauf'){
      totalCost += t.qty * t.price + (t.courtage||0);
      qty += t.qty;
    } else {
      const avg = qty>0 ? totalCost/qty : 0;
      totalCost -= t.qty * avg;
      qty -= t.qty;
    }
  }
  qty = Math.round(qty*1e6)/1e6;
  if(qty < 0) qty = 0;
  return { qty, avgPrice: qty>0.0001 ? totalCost/qty : 0, totalCost: qty>0.0001 ? totalCost : 0 };
}

function fmtPrice(n, ccy){
  if(n==null||isNaN(n)) return '—';
  const dec = ccy==='JPY' ? 0 : 2;
  return n.toLocaleString('de-CH',{minimumFractionDigits:dec,maximumFractionDigits:dec});
}
function fmtQty(n){
  if(n==null) return '0';
  return n===Math.floor(n) ? n.toFixed(0) : parseFloat(n.toFixed(6)).toString();
}

function setAktienView(v){
  aktienView = v;
  document.getElementById('aktien-btn-aktiv').className = 'type-btn'+(v==='aktiv'?' active expense':'');
  document.getElementById('aktien-btn-hist').className = 'type-btn'+(v==='historisch'?' active income':'');
  renderAktien();
}

// Fetches a live price for a single ticker.
// Primary path: GOOGLEFINANCE via Apps Script (syncKurseSheet with extraTicker).
//   Cloud mode is always tried first — it is the only reliable path in browsers.
//   Includes one automatic retry with a 2 s delay so GOOGLEFINANCE formulas have
//   time to resolve before the sheet is read back.
// Fallback: Yahoo Finance via a cascade of public CORS proxies (demo mode / no backend).
//   Each proxy gets up to 8 s before the next is tried.
//   api.allorigins.win wraps the response in { contents: "<json-string>" } which
//   is unwrapped automatically; corsproxy.io forwards the raw JSON.
async function fetchStockPrice(ticker){
  if(!ticker) return null;
  const key = ticker.toUpperCase();
  const gfKey = normalizeTickerForGF(key);

  // Cache check — treat prices as fresh for 7 minutes
  const cached = stockPriceCache[key] || stockPriceCache[gfKey];
  if(cached && (Date.now()-cached.ts) < 7*60*1000) return cached;

  // ── Primary: server-side GOOGLEFINANCE via Apps Script ──────────────────────
  if(!CFG.demo && (CFG.scriptUrl || CFG.sessionToken)){
    await syncKurseSheet([gfKey]);
    let afterSync = stockPriceCache[key] || stockPriceCache[gfKey];
    if(!afterSync){
      // GOOGLEFINANCE formulas may need extra time to resolve; retry once after delay
      await new Promise(r=>setTimeout(r, 2000));
      await syncKurseSheet([gfKey]);
      afterSync = stockPriceCache[key] || stockPriceCache[gfKey];
    }
    if(afterSync) return afterSync;
  }

  // ── Fallback: Yahoo Finance via CORS proxy cascade ───────────────────────────
  const yahooTicker = normalizeTickerForYahoo(gfKey);
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=1d&range=1d`;

  const proxies = [
    // allorigins.win wraps the response body as a JSON string in { contents: "..." }
    `https://api.allorigins.win/get?url=${encodeURIComponent(yahooUrl)}`,
    // corsproxy.io forwards the raw response
    `https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`
  ];

  for(const proxyUrl of proxies){
    try{
      const r = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
      if(!r.ok){
        console.warn(`fetchStockPrice: proxy HTTP ${r.status} — ${proxyUrl}`);
        continue;
      }
      let json = await r.json();
      // Unwrap allorigins.win envelope: { contents: "<json-string>", ... }
      if(typeof json?.contents === 'string'){
        try{ json = JSON.parse(json.contents); }
        catch(e){ console.warn('fetchStockPrice: failed to parse proxy contents:', e); continue; }
      }
      const meta = json?.chart?.result?.[0]?.meta;
      if(!meta?.regularMarketPrice){
        console.warn(`fetchStockPrice: no price in proxy response — ${proxyUrl}`);
        continue;
      }
      const res = {
        price: meta.regularMarketPrice,
        prevClose: meta.chartPreviousClose ?? meta.previousClose ?? null,
        currency: meta.currency || '',
        ts: Date.now()
      };
      stockPriceCache[key] = res;
      return res;
    } catch(e){
      console.warn(`fetchStockPrice: proxy error (${proxyUrl}):`, e.message || e);
    }
  }

  // All sources exhausted — return null without crashing
  return null;
}

// ── Aktien Charts (Point 3) ───────────────────────────────────────────────────

// SVG pie chart of portfolio allocation by current value
function buildPortfolioPieChart(stocks){
  const data = stocks.map(s=>({
    label:s.ticker||s.title, value:getPositionsWert(s.id), color:aktieColor(s.id)
  })).filter(d=>d.value>0);
  const total=data.reduce((s,d)=>s+d.value,0);
  if(total===0||data.length===0) return '';
  const cx=90,cy=90,r=75;
  let angle=-Math.PI/2;
  const slices=data.map(d=>{
    const frac=d.value/total; const sweep=frac*2*Math.PI; const ea=angle+sweep; const la=frac>0.5?1:0;
    const x1=cx+r*Math.cos(angle),y1=cy+r*Math.sin(angle);
    const x2=cx+r*Math.cos(ea),y2=cy+r*Math.sin(ea);
    const path=frac>0.9999?`M${cx-r},${cy} A${r},${r} 0 1 1 ${cx+r},${cy} A${r},${r} 0 1 1 ${cx-r},${cy}`
      :`M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${la} 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`;
    angle=ea;
    return {...d,path,pct:(frac*100).toFixed(1)};
  });
  return `
  <div class="widget-title">Portfolio-Verteilung</div>
  <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
    <svg viewBox="0 0 180 180" height="140" class="flex-shrink-0">
      ${slices.map(s=>`<path d="${s.path}" fill="${s.color}" stroke="var(--bg0)" stroke-width="2"/>`).join('')}
    </svg>
    <div>
      ${slices.map(s=>`
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:12px">
          <span style="width:10px;height:10px;border-radius:3px;background:${s.color};flex-shrink:0"></span>
          <span class="t-text2">${esc(s.label)}</span>
          <span style="color:var(--text3);margin-left:auto;font-family:'DM Mono',monospace">${s.pct}%</span>
        </div>`).join('')}
    </div>
  </div>`;
}

// Bar chart: Ø Kaufpreis vs. Aktueller Kurs per stock (in user currency)
function buildPreisVergleichChart(stocks){
  const items = stocks.filter(s=>s.pos.qty>0.0001).map(s=>{
    const live=s.ticker?getCachedStock(s.ticker):null;
    const lp=live?.price;
    const stockCurr=(live?.currency||s.currency||'').toUpperCase();
    const fxRate=getFxRate(stockCurr);
    return {label:s.ticker||s.title,avg:s.pos.avgPrice*fxRate,live:lp!=null?lp*fxRate:null,color:aktieColor(s.id),origCurr:stockCurr!==curr().toUpperCase()?stockCurr:''};
  }).filter(d=>d.avg>0);
  if(!items.length) return '';
  const maxVal=Math.max(...items.flatMap(d=>[d.avg,d.live||0]))||1;
  const barH=36,gap=12,padL=0,W=300;
  return `
  <div class="widget-title">Ø Kaufpreis vs. Kurs (${curr()})</div>
  <div style="overflow-x:auto">
    ${items.map(d=>`
    <div style="margin-bottom:${gap}px">
      <div style="font-size:11px;color:var(--text2);margin-bottom:3px;display:flex;justify-content:space-between">
        <span>${esc(d.label)}${d.origCurr?` <span style="font-size:9px;color:var(--text3)">${d.origCurr}</span>`:''}</span>
        ${d.live!=null?`<span style="color:${d.live>=d.avg?'var(--green)':'var(--red)'};font-family:'DM Mono',monospace;font-size:10px">${d.live>=d.avg?'↑':'↓'} ${fmtPrice(d.live)}</span>`:''}
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">
        <div style="display:flex;align-items:center;gap:6px">
          <div style="font-size:9px;color:var(--text3);width:52px;text-align:right">Ø Kauf</div>
          <div style="flex:1;height:10px;background:var(--bg3);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${(d.avg/maxVal*100).toFixed(1)}%;background:${d.color};border-radius:3px;opacity:.8"></div>
          </div>
          <div style="font-size:10px;font-family:'DM Mono',monospace;color:var(--text3);min-width:50px">${fmtPrice(d.avg)}</div>
        </div>
        ${d.live!=null?`
        <div style="display:flex;align-items:center;gap:6px">
          <div style="font-size:9px;color:var(--text3);width:52px;text-align:right">Live</div>
          <div style="flex:1;height:10px;background:var(--bg3);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${(d.live/maxVal*100).toFixed(1)}%;background:${d.live>=d.avg?'var(--green)':'var(--red)'};border-radius:3px"></div>
          </div>
          <div style="font-size:10px;font-family:'DM Mono',monospace;min-width:50px;color:${d.live>=d.avg?'var(--green)':'var(--red)'}">${fmtPrice(d.live)}</div>
        </div>`:
        `<div style="font-size:9px;color:var(--text3);padding-left:58px">Kein Live-Kurs</div>`}
      </div>
    </div>`).join('')}
  </div>`;
}

// Portfolio-Verlauf: real market value over time (from Portfolio-Verlauf sheet).
// Fallback: cumulative cost invested from trades.
function buildPortfolioVerlauf(){
  const W=300,H=110,padL=48,padR=8,padT=8,padB=22;
  const cW=W-padL-padR,cH=H-padT-padB;

  // ─ Real history from sheet (preferred) ─
  if(PDATA.verlauf.length>=2){
    const pts=[...PDATA.verlauf];
    // Add current live value as final point if today's entry is there
    const todayStr=today();
    const curVal=getGesamtPortfoliowert();
    if(pts[pts.length-1].date===todayStr && curVal>0) pts[pts.length-1].total=curVal;
    else if(curVal>0) pts.push({date:todayStr,total:curVal});

    const firstDate=pts[0].date, lastDate=pts[pts.length-1].date;
    const startD=new Date(firstDate+'T12:00:00');
    const totDays=Math.max(1,Math.round((new Date(lastDate+'T12:00:00')-startD)/86400000));
    const mapX=d=>{const dy=Math.round((new Date(d+'T12:00:00')-startD)/86400000);return padL+(dy/totDays)*cW;};
    const minV=Math.min(...pts.map(p=>p.total),0);
    const maxV=Math.max(...pts.map(p=>p.total),1);
    const range=maxV-minV||1;
    const mapY=v=>padT+cH-((v-minV)/range)*cH;
    const poly=pts.map(p=>`${mapX(p.date).toFixed(1)},${mapY(p.total).toFixed(1)}`).join(' ');
    const area=`M${mapX(pts[0].date).toFixed(1)},${mapY(minV)} `+pts.map(p=>`L${mapX(p.date).toFixed(1)},${mapY(p.total).toFixed(1)}`).join(' ')+` L${mapX(pts[pts.length-1].date).toFixed(1)},${mapY(minV)} Z`;
    const fmtLbl=v=>Math.abs(v)>=1000?(v/1000).toFixed(1)+'k':Math.round(v).toString();
    const yLabels=[[minV,'var(--text3)',fmtLbl(minV)],[maxV,'var(--green)',fmtLbl(maxV)]].map(([v,c,lbl])=>
      `<text x="2" y="${mapY(v).toFixed(1)}" font-size="8" fill="${c}" dominant-baseline="middle" font-family="DM Mono,monospace">${lbl}</text>`);
    // x-axis labels
    const xLabels=[];
    [0, Math.floor(pts.length/2), pts.length-1].forEach(i=>{
      const p=pts[i]; if(!p) return;
      const d=new Date(p.date+'T12:00:00');
      xLabels.push(`<text x="${mapX(p.date).toFixed(1)}" y="${H-4}" font-size="8" fill="var(--text3)" text-anchor="middle" font-family="DM Mono,monospace">${d.getDate()}.${d.getMonth()+1}.</text>`);
    });
    const latestVal=pts[pts.length-1].total;
    const firstVal=pts[0].total;
    const totalReturn=firstVal>0?(latestVal-firstVal)/firstVal*100:0;
    const retColor=totalReturn>=0?'var(--green)':'var(--red)';
    return `
    <div class="widget-title">Portfolio-Verlauf (Marktwert)</div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
      <span style="font-size:20px;font-weight:700;font-family:'DM Mono',monospace">${curr()} ${fmtAmt(latestVal)}</span>
      <span style="font-size:12px;color:${retColor};font-family:'DM Mono',monospace">${totalReturn>=0?'+':''}${totalReturn.toFixed(1)}% ges.</span>
    </div>
    <svg viewBox="0 0 ${W} ${H}" height="${H}" class="w-full">
      <defs><linearGradient id="pvGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--green)" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="var(--green)" stop-opacity="0.02"/>
      </linearGradient></defs>
      <path d="${area}" fill="url(#pvGrad)"/>
      <polyline points="${poly}" fill="none" stroke="var(--green)" stroke-width="2" stroke-linejoin="round"/>
      ${yLabels.join('')}${xLabels.join('')}
    </svg>`;
  }

  // ─ Fallback: estimated from trade costs ─
  if(!SDATA.trades.length) return '';
  const trades=[...SDATA.trades].sort((a,b)=>a.date.localeCompare(b.date));
  const firstDate=trades[0].date, lastDate=today();
  let cumCost=0;
  const pts=[{date:firstDate,cost:0}];
  trades.forEach(t=>{ cumCost += t.type==='kauf' ? t.total : -(t.total||0); pts.push({date:t.date,cost:Math.max(0,cumCost)}); });
  if(pts[pts.length-1].date!==lastDate) pts.push({date:lastDate,cost:Math.max(0,cumCost)});
  const startD=new Date(firstDate+'T12:00:00');
  const totDays=Math.max(1,Math.round((new Date(lastDate+'T12:00:00')-startD)/86400000));
  const mapX=d=>{const dys=Math.round((new Date(d+'T12:00:00')-startD)/86400000);return padL+(dys/totDays)*cW;};
  const maxCost=Math.max(...pts.map(p=>p.cost),1);
  const mapY=v=>padT+cH-((v/maxCost)*cH);
  const poly=pts.map(p=>`${mapX(p.date).toFixed(1)},${mapY(p.cost).toFixed(1)}`).join(' ');
  const area=`M${mapX(pts[0].date).toFixed(1)},${mapY(0)} `+pts.map(p=>`L${mapX(p.date).toFixed(1)},${mapY(p.cost).toFixed(1)}`).join(' ')+` L${mapX(pts[pts.length-1].date).toFixed(1)},${mapY(0)} Z`;
  const curVal=getGesamtPortfoliowert();
  const valLine=curVal>0&&curVal!==cumCost?`<line x1="${mapX(lastDate).toFixed(1)}" y1="${mapY(0).toFixed(1)}" x2="${mapX(lastDate).toFixed(1)}" y2="${mapY(Math.min(curVal,maxCost)).toFixed(1)}" stroke="var(--green)" stroke-width="1.5" stroke-dasharray="3,2"/>`:'' ;
  const yLabels=[[0,'var(--text3)','0'],[maxCost,'var(--accent)',maxCost>=1000?(maxCost/1000).toFixed(0)+'k':Math.round(maxCost).toString()]].map(([v,c,lbl])=>
    `<text x="2" y="${mapY(v).toFixed(1)}" font-size="8" fill="${c}" dominant-baseline="middle" font-family="DM Mono,monospace">${lbl}</text>`);
  return `
  <div class="widget-title">Investiertes Kapital (Verlauf)</div>
  <div style="font-size:10px;color:var(--text3);margin-bottom:4px">Basiert auf Einstandswerten · Mit jedem Sheet-Sync wird der Marktwert gespeichert</div>
  <svg viewBox="0 0 ${W} ${H}" height="${H}" class="w-full">
    <defs><linearGradient id="invGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.02"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#invGrad)"/>
    <polyline points="${poly}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>
    ${valLine}${yLabels.join('')}
  </svg>`;
}

// Main charts section renderer — called from renderAktienList after price fetch
function renderAktienCharts(stocks){
  const el=document.getElementById('aktien-charts');
  if(!el) return;
  const active=stocks.filter(s=>s.pos.qty>0.0001);
  if(!active.length){ el.innerHTML=''; return; }
  el.innerHTML=`
    <div class="section pt-0">
      <div class="card" style="padding:14px">${buildPortfolioPieChart(active)}</div>
    </div>
    <div class="section pt-0">
      <div class="card" style="padding:14px">${buildPreisVergleichChart(active)}</div>
    </div>
    <div class="section pt-0">
      <div class="card" style="padding:14px">${buildPortfolioVerlauf()}</div>
    </div>`;
}

// Portfolio table view (HTML table)
function renderAktienTabelle(stocks){
  const el=document.getElementById('aktien-tabelle');
  if(!el) return;
  const active=stocks.filter(s=>s.pos.qty>0.0001);
  if(!active.length){ el.innerHTML=''; return; }
  el.innerHTML=`
  <div style="padding:0 16px 12px;overflow-x:auto">
    <table class="trade-tbl" style="min-width:420px">
      <thead><tr>
        <th>Ticker</th><th>Anzahl</th><th>Ø Kauf</th><th>Kurs live</th><th>+/- %</th><th>Wert (${curr()})</th>
      </tr></thead>
      <tbody>${active.map(s=>{
        const live=s.ticker?getCachedStock(s.ticker):null;
        const lp=live?.price;
        const stockCurr=(live?.currency||s.currency||'').toUpperCase();
        const userCurrUC=curr().toUpperCase();
        const needsFx=stockCurr&&stockCurr!==userCurrUC;
        const fxRate=needsFx?getFxRate(stockCurr):1;
        const lpConverted=lp!=null?lp*fxRate:null;
        const gv=getGewinnVerlust(s.id);
        const wert=getPositionsWert(s.id);
        const color=!gv.hasLive?'var(--text)':gv.pct>=0?'var(--green)':'var(--red)';
        const sign=gv.pct>=0?'+':'';
        const liveTxt=lpConverted!=null?(needsFx?`${fmtPrice(lpConverted)} (${fmtPrice(lp)} ${stockCurr})`:fmtPrice(lpConverted)):'—';
        return `<tr style="cursor:pointer" onclick="openAktieDetail('${s.id}')">
          <td><div class="t-bold">${esc(s.ticker||s.title)}</div>
              <div class="t-muted-sm">${esc(s.title)}${stockCurr&&stockCurr!==userCurrUC?' · '+stockCurr:''}</div></td>
          <td class="t-mono">${fmtQty(s.pos.qty)}</td>
          <td class="t-mono">${fmtPrice(s.pos.avgPrice)}</td>
          <td style="font-family:'DM Mono',monospace;color:${lpConverted!=null?color:'var(--text3)'};font-size:11px">${liveTxt}</td>
          <td style="font-family:'DM Mono',monospace;color:${color};font-weight:600">${gv.hasLive?sign+gv.pct.toFixed(1)+'%':'—'}</td>
          <td class="t-mono-bold">${fmtAmt(wert)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>
  </div>`;
}

let aktienTabView='karten'; // 'karten' | 'tabelle' | 'charts'
function setAktienTabView(v){ aktienTabView=v; renderAktien(); }

function renderAktienDashboardTop(){
  const dashEl = document.getElementById('aktien-dashboard-top');
  if(!dashEl) return;
  const active = SDATA.stocks.filter(s=>calcPosition(s.id).qty>0.0001);
  if(!active.length){ dashEl.innerHTML=''; return; }
  const total = getGesamtPortfoliowert();
  const gv = getGesamtGewinnVerlust();
  const todayChg = getPortfolioTodayChange();
  const posCount = active.length;
  const gvColor = gv.hasLive ? (gv.amt>=0?'var(--green)':'var(--red)') : 'var(--text2)';
  const gvSign = gv.amt>=0?'+':'';
  const todayColor = !todayChg.hasData ? 'var(--text2)' : todayChg.amt>=0 ? 'var(--green)' : 'var(--red)';
  const todaySign = todayChg.amt>=0?'+':'';
  const todayArrow = !todayChg.hasData ? '' : todayChg.amt>=0 ? ' ▲' : ' ▼';
  dashEl.innerHTML = `
  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);margin:12px 16px 6px;padding:14px">
    <div style="font-size:10px;font-weight:700;letter-spacing:.08em;color:var(--text3);margin-bottom:10px;text-transform:uppercase">Portfolio-Übersicht</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0">
      <div style="padding:6px 0;border-bottom:1px solid var(--border);padding-right:12px">
        <div class="t-label">Portfolio-Wert</div>
        <div style="font-family:'DM Mono',monospace;font-size:15px;font-weight:700;margin-top:2px">${curr()} ${fmtAmt(total)}</div>
      </div>
      <div style="padding:6px 0;border-bottom:1px solid var(--border);padding-left:12px;border-left:1px solid var(--border)">
        <div class="t-label">Heute</div>
        <div style="font-family:'DM Mono',monospace;font-size:15px;font-weight:700;margin-top:2px;color:${todayColor}">${todayChg.hasData ? todaySign+curr()+' '+fmtAmt(Math.abs(todayChg.amt))+todayArrow : '—'}</div>
      </div>
      <div style="padding:6px 0;padding-right:12px;margin-top:4px">
        <div class="t-label">Gesamt G/V</div>
        <div style="font-family:'DM Mono',monospace;font-size:15px;font-weight:700;margin-top:2px;color:${gvColor}">${gv.hasLive ? gvSign+curr()+' '+fmtAmt(Math.abs(gv.amt))+' ('+gvSign+gv.pct.toFixed(1)+'%)' : '—'}</div>
      </div>
      <div style="padding:6px 0;padding-left:12px;border-left:1px solid var(--border);margin-top:4px">
        <div class="t-label">Positionen</div>
        <div style="font-family:'DM Mono',monospace;font-size:15px;font-weight:700;margin-top:2px">${posCount} Aktie${posCount!==1?'n':''}</div>
      </div>
    </div>
  </div>`;
}

async function renderAktien(){
  renderAktienDashboardTop();
  const positions = SDATA.stocks.map(s=>({ ...s, pos: calcPosition(s.id) }));
  const activeStocks = positions.filter(s => s.pos.qty > 0.0001 || !SDATA.trades.some(t=>t.stockId===s.id));
  const histStocks = positions.filter(s => s.pos.qty <= 0.0001 && SDATA.trades.some(t=>t.stockId===s.id));
  const show = aktienView==='aktiv' ? activeStocks : histStocks;

  const listEl = document.getElementById('aktien-list');
  const summaryEl = document.getElementById('aktien-summary-bar');
  const tabelleEl = document.getElementById('aktien-tabelle');
  const chartsEl = document.getElementById('aktien-charts');

  // Update view-toggle button styles
  ['karten','tabelle','charts'].forEach(v=>{
    const btn=document.getElementById('aktien-view-'+v);
    if(btn) btn.className='filter-chip'+(aktienTabView===v?' active':'');
  });

  if(!show.length){
    listEl.innerHTML = `<div class="empty"><div class="empty-icon"><svg viewBox="0 0 24 24" style="width:40px;height:40px;stroke:var(--border2);fill:none;stroke-width:1.5"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg></div><div class="empty-text">${aktienView==='aktiv'?'Keine aktiven Positionen':'Keine historischen Positionen'}</div></div>`;
    summaryEl.innerHTML = '';
    if(tabelleEl) tabelleEl.innerHTML='';
    if(chartsEl) chartsEl.innerHTML='';
    return;
  }

  // Show/hide sections based on view
  if(listEl) listEl.style.display = aktienTabView==='karten' ? '' : 'none';
  if(tabelleEl) tabelleEl.style.display = aktienTabView==='tabelle' ? '' : 'none';
  if(chartsEl) chartsEl.style.display = aktienTabView==='charts' ? '' : 'none';

  if(aktienTabView==='karten') renderAktienList(show, listEl, summaryEl);
  else summaryEl.innerHTML='';

  if(aktienTabView==='tabelle') renderAktienTabelle(show);
  if(aktienTabView==='charts') renderAktienCharts(show);

  // Fetch live prices in background
  if(aktienView==='aktiv'){
    const toFetch = activeStocks.filter(s=>s.ticker&&!getCachedStock(s.ticker)&&!stockPriceCache[normalizeTickerForGF(s.ticker)]);
    if(toFetch.length){
      await Promise.allSettled(toFetch.map(s=>fetchStockPrice(s.ticker)));
      if(aktienTabView==='karten') renderAktienList(activeStocks, listEl, summaryEl);
      if(aktienTabView==='tabelle') renderAktienTabelle(activeStocks);
      if(aktienTabView==='charts') renderAktienCharts(activeStocks);
    }
  }
}

function renderAktienList(stocks, listEl, summaryEl){
  let totalPnl=0, hasPnl=false, totalWert=0;

  listEl.innerHTML = stocks.map(s=>{
    const live = s.ticker ? getCachedStock(s.ticker) : null;
    const livePrice = live?.price;
    const stockCurr = (live?.currency || s.currency || '').toUpperCase();
    const userCurrUC = curr().toUpperCase();
    const needsFx = stockCurr && stockCurr !== userCurrUC;
    const fxRate = needsFx ? getFxRate(stockCurr) : 1;
    const livePriceConverted = livePrice!=null ? livePrice*fxRate : null;
    let pnlAmt=null, pnlPct=null;
    if(livePriceConverted!=null && s.pos.qty > 0.0001){
      pnlAmt = (livePriceConverted - s.pos.avgPrice*fxRate) * s.pos.qty;
      pnlPct = s.pos.avgPrice > 0 ? (livePrice/s.pos.avgPrice-1)*100 : 0;
      totalPnl += pnlAmt; hasPnl = true;
    }
    const wert = getPositionsWert(s.id);
    totalWert += wert;
    const pc = pnlAmt==null?'aktie-pnl-na':pnlAmt>=0?'aktie-pnl-pos':'aktie-pnl-neg';
    const ps = pnlAmt!=null&&pnlAmt>=0?'+':'';
    // Show "USD 182.50 | CHF 163.20" when currency differs
    const liveLabel = livePrice!=null ? (needsFx
      ? `${fmtPrice(livePrice)} ${stockCurr} · ${curr()} ${fmtPrice(livePrice*fxRate)}`
      : `${fmtPrice(livePrice)} ${stockCurr}`) : null;
    return `
    <div class="aktie-card" onclick="openAktieDetail('${s.id}')">
      <div class="aktie-card-top">
        <div>
          <div class="aktie-name">${esc(s.title)}</div>
          <div class="aktie-isin">${esc(s.isin||'')}${s.ticker?' · '+esc(s.ticker):''}</div>
        </div>
        <div class="aktie-qty-badge">${fmtQty(s.pos.qty)} Stk.</div>
      </div>
      <div class="aktie-card-bottom">
        <div class="aktie-stat"><div class="aktie-stat-lbl">Ø Kaufpreis</div>
          <div class="aktie-stat-val">${fmtPrice(s.pos.avgPrice)} ${s.currency||''}</div></div>
        ${liveLabel!=null?`
        <div class="aktie-stat"><div class="aktie-stat-lbl">Kurs live</div>
          <div class="aktie-stat-val" style="font-size:11px">${esc(liveLabel)}</div></div>
        <div class="aktie-stat"><div class="aktie-stat-lbl">P&amp;L</div>
          <div class="aktie-stat-val ${pc}">${ps}${curr()} ${fmtAmt(Math.abs(pnlAmt||0))} (${ps}${pnlPct?.toFixed(1)}%)</div></div>
        `:s.ticker?`<div class="aktie-stat"><div class="aktie-stat-lbl">Kurs live</div>
          <div class="aktie-stat-val aktie-pnl-na">Laden…</div></div>`:''}
        <div class="aktie-stat"><div class="aktie-stat-lbl">Wert (${curr()})</div>
          <div class="aktie-stat-val">${curr()} ${fmtAmt(wert)}</div></div>
      </div>
    </div>`;
  }).join('');

  if(aktienView==='aktiv'){
    const pc2 = totalPnl>=0?'aktie-pnl-pos':'aktie-pnl-neg';
    const ps2 = totalPnl>=0?'+':'';
    summaryEl.innerHTML = `
    <div class="aktie-summary-card">
      <div class="aktie-stat"><div class="aktie-stat-lbl">Depotwert (${curr()})</div>
        <div class="aktie-stat-val" style="font-size:16px;font-weight:700">${curr()} ${fmtAmt(totalWert)}</div></div>
      ${hasPnl?`<div class="aktie-stat"><div class="aktie-stat-lbl">Gesamt P&amp;L</div>
        <div class="aktie-stat-val ${pc2}">${ps2}${curr()} ${fmtAmt(Math.abs(totalPnl))}</div></div>`:''}
      <div class="aktie-stat"><div class="aktie-stat-lbl">Positionen</div>
        <div class="aktie-stat-val">${stocks.length}</div></div>
    </div>`;
  } else { summaryEl.innerHTML = ''; }
}

function openAktieDetail(stockId){
  currentAktieId = stockId;
  const s = SDATA.stocks.find(s=>s.id===stockId);
  if(!s) return;
  document.getElementById('aktie-detail-title').textContent = s.title;
  renderAktieDetail(stockId);
  document.getElementById('aktie-detail').classList.add('open');
}

function closeAktieDetail(){
  document.getElementById('aktie-detail').classList.remove('open');
  currentAktieId = null;
  renderAktien();
}

function renderAktieDetail(stockId){
  const s = SDATA.stocks.find(s=>s.id===stockId);
  if(!s) return;
  const trades = SDATA.trades.filter(t=>t.stockId===stockId).sort((a,b)=>b.date.localeCompare(a.date));
  const pos = calcPosition(stockId);
  const live = s.ticker ? getCachedStock(s.ticker) : null;
  const lp = live?.price;
  const stockCurr = (live?.currency || s.currency || '').toUpperCase();
  const userCurrUC = curr().toUpperCase();
  const needsFx = stockCurr && stockCurr !== userCurrUC;
  const fxRate = needsFx ? getFxRate(stockCurr) : 1;
  const lpConverted = lp!=null ? lp*fxRate : null;
  let pnlAmt=null, pnlPct=null;
  if(lpConverted!=null && pos.qty>0.0001){
    pnlAmt=(lpConverted-pos.avgPrice*fxRate)*pos.qty;
    pnlPct=pos.avgPrice>0?(lp/pos.avgPrice-1)*100:0;
  }
  const pc = pnlAmt==null?'aktie-pnl-na':pnlAmt>=0?'aktie-pnl-pos':'aktie-pnl-neg';
  const ps = pnlAmt!=null&&pnlAmt>=0?'+':'';
  const wert = getPositionsWert(stockId);

  document.getElementById('aktie-detail-content').innerHTML = `
  <div class="section">
    <div class="aktie-summary-card" style="margin:0;flex-wrap:wrap;gap:16px">
      <div class="aktie-stat"><div class="aktie-stat-lbl">ISIN</div>
        <div style="font-size:12px;font-family:'DM Mono',monospace;color:var(--text)">${esc(s.isin||'—')}</div></div>
      <div class="aktie-stat"><div class="aktie-stat-lbl">Anzahl</div>
        <div class="aktie-stat-val">${fmtQty(pos.qty)} Stk.</div></div>
      <div class="aktie-stat"><div class="aktie-stat-lbl">Ø Kaufpreis</div>
        <div class="aktie-stat-val">${fmtPrice(pos.avgPrice)} ${s.currency||''}</div></div>
      <div class="aktie-stat"><div class="aktie-stat-lbl">Einstand</div>
        <div class="aktie-stat-val">${fmtPrice(pos.totalCost)} ${s.currency||''}</div></div>
      <div class="aktie-stat"><div class="aktie-stat-lbl">Wert (${curr()})</div>
        <div class="aktie-stat-val" style="font-weight:700">${curr()} ${fmtAmt(wert)}</div></div>
      ${lpConverted!=null?`
      <div class="aktie-stat"><div class="aktie-stat-lbl">Kurs live</div>
        <div class="aktie-stat-val">${needsFx?`${fmtPrice(lp)} ${stockCurr} · ${curr()} ${fmtPrice(lpConverted)}`:fmtPrice(lpConverted)+' '+curr()}</div></div>
      <div class="aktie-stat"><div class="aktie-stat-lbl">P&amp;L (${curr()})</div>
        <div class="aktie-stat-val ${pc}">${ps}${curr()} ${fmtAmt(Math.abs(pnlAmt||0))} (${ps}${pnlPct?.toFixed(1)}%)</div></div>`
      : s.ticker ? `<div class="aktie-stat"><div class="aktie-stat-lbl">Kurs live</div>
        <div class="aktie-stat-val aktie-pnl-na" style="cursor:pointer" onclick="refreshStockPrice('${s.id}')">Laden…</div></div>` : ''}
    </div>
  </div>
  <div class="section pt-0">
    <div class="section-title">Trade-Historie</div>
    ${!trades.length ? `<div class="empty" style="padding:16px 0"><div class="empty-text">Noch keine Trades</div></div>` : `
    <div class="trade-tbl-wrap">
      <table class="trade-tbl">
        <thead><tr>
          <th>Datum</th><th>Art</th><th>Stk.</th>
          <th>Preis/Stk.</th><th>Währung</th><th>Courtage</th><th>Gesamt</th><th></th>
        </tr></thead>
        <tbody>${trades.map(t=>`
          <tr>
            <td style="white-space:nowrap">${fmtDate(t.date)}</td>
            <td><span class="${t.type==='kauf'?'t-kauf':'t-verk'}">${t.type==='kauf'?'Kauf':'Verkauf'}</span></td>
            <td>${fmtQty(t.qty)}</td>
            <td class="t-mono">${fmtPrice(t.price)}</td>
            <td>${esc(t.currency||s.currency||'')}</td>
            <td class="t-mono">${fmtPrice(t.courtage||0)}</td>
            <td class="t-mono-bold">${fmtPrice(t.total)}</td>
            <td><button onclick="deleteTrade('${t.id}')" style="background:none;color:var(--text3);font-size:14px;padding:2px 6px;border:none;cursor:pointer;line-height:1">×</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`}
  </div>`;

  // Refresh live price in background
  if(s.ticker) fetchStockPrice(s.ticker).then(p=>{ if(p){ renderAktieDetail(stockId); } });
}

async function refreshStockPrice(stockId){
  const s = SDATA.stocks.find(s=>s.id===stockId);
  if(!s?.ticker) return;
  delete getCachedStock(s.ticker);
  await fetchStockPrice(s.ticker);
  renderAktieDetail(stockId);
}

function openNewAktieModal(){
  clearForm('na', ['title','isin','ticker']);
  fillForm('na', { currency:'USD' });
  const res = document.getElementById('na-ticker-result');
  if(res) res.textContent = '—';
  openModal('new-aktie-modal');
}

async function testTickerFromNew(){
  const ticker = document.getElementById('na-ticker').value.trim().toUpperCase();
  const res = document.getElementById('na-ticker-result');
  if(!ticker){ if(res) res.textContent = 'Kein Ticker'; return; }
  if(res){ res.textContent = 'Lädt…'; res.style.color = 'var(--text3)'; }
  delete stockPriceCache[ticker];
  const data = await fetchStockPrice(ticker);
  if(res){
    if(data?.price){ res.textContent = `${fmtPrice(data.price)} ${data.currency}`; res.style.color = 'var(--green)'; }
    else { res.textContent = 'Kein Kurs'; res.style.color = 'var(--red)'; }
  }
}

function openEditAktieModal(stockId){
  const s = SDATA.stocks.find(s=>s.id===stockId);
  if(!s) return;
  fillForm('ea', { id:s.id, title:s.title||'', isin:s.isin||'', ticker:s.ticker||'', currency:s.currency||'USD' });
  const res = document.getElementById('ea-ticker-result');
  if(res){ res.textContent = '—'; res.style.color = 'var(--text3)'; }
  openModal('edit-aktie-modal');
}

async function testTickerFromEdit(){
  const ticker = document.getElementById('ea-ticker').value.trim().toUpperCase();
  const res = document.getElementById('ea-ticker-result');
  if(!ticker){ if(res) res.textContent = 'Kein Ticker'; return; }
  if(res){ res.textContent = 'Lädt…'; res.style.color = 'var(--text3)'; }
  delete stockPriceCache[ticker];
  const data = await fetchStockPrice(ticker);
  if(res){
    if(data?.price){ res.textContent = `${fmtPrice(data.price)} ${data.currency}`; res.style.color = 'var(--green)'; }
    else { res.textContent = 'Kein Kurs'; res.style.color = 'var(--red)'; }
  }
}

function saveEditAktie(){
  const f = readForm('ea', ['id','title','isin','ticker','currency']);
  const title = f.title.trim();
  if(!title){ toast('Titel erforderlich','err'); return; }
  const s = SDATA.stocks.find(s=>s.id===f.id);
  if(!s){ toast('Aktie nicht gefunden','err'); return; }
  const oldTicker = s.ticker;
  s.title = title;
  s.isin = f.isin.trim().toUpperCase();
  s.ticker = f.ticker.trim().toUpperCase();
  s.currency = f.currency;
  sdataSave();
  // Invalidate price cache if ticker changed
  if(oldTicker && oldTicker !== s.ticker) delete stockPriceCache[oldTicker];
  if(!CFG.demo && (CFG.scriptUrl || CFG.sessionToken)){
    apiFindRow('Aktien',id).then(row=>{
      if(row) apiUpdate(`Aktien!B${row}:E${row}`,[[s.title,s.isin,s.ticker,s.currency]]);
    }).catch(e=>toast('Sheet-Sync: '+e.message,'err'));
  }
  closeModal('edit-aktie-modal');
  toast('✓ Aktie aktualisiert','ok');
  document.getElementById('aktie-detail-title').textContent = s.title;
  renderAktieDetail(id);
  renderAktien();
}

function saveNewAktie(){
  const f = readForm('na', ['title','isin','ticker','currency']);
  const title = f.title.trim();
  if(!title){ toast('Titel erforderlich','err'); return; }
  const s = {
    id: 'st_'+Date.now(),
    title,
    isin: f.isin.trim().toUpperCase(),
    ticker: f.ticker.trim().toUpperCase(),
    currency: f.currency
  };
  SDATA.stocks.push(s);
  sdataSave();
  if(!CFG.demo && (CFG.scriptUrl || CFG.sessionToken)){
    apiAppend('Aktien',[[s.id,s.title,s.isin,s.ticker,s.currency,'']]).catch(e=>toast('Aktie Sheet-Sync: '+e.message,'err'));
  }
  closeModal('new-aktie-modal');
  toast('✓ Aktie hinzugefügt','ok');
  renderAktien();
}

function openTradeModal(type){
  if(!currentAktieId) return;
  const s = SDATA.stocks.find(s=>s.id===currentAktieId);
  fillForm('tm', { stockid:currentAktieId, type, date:today(), currency:s?.currency||'USD' });
  clearForm('tm', ['qty','price','courtage']);
  fillForm('trade-modal', { $title: type==='kauf' ? 'Kauf erfassen' : 'Verkauf erfassen' });
  fillForm('tm-total', { $display:'—' });
  openModal('trade-modal');
}

function updateTradeTotal(){
  const f = readForm('tm', ['qty','price','courtage','currency','type']);
  const qty = parseFloat(f.qty)||0;
  const price = parseFloat(f.price)||0;
  const courtage = parseFloat(f.courtage)||0;
  const total = f.type==='kauf' ? qty*price+courtage : qty*price-courtage;
  fillForm('tm-total', { $display: qty>0&&price>0 ? `${f.currency} ${fmtPrice(total)}` : '—' });
}

function saveTrade(){
  const f = readForm('tm', ['stockid','type','date','qty','price','currency','courtage']);
  const stockId = f.stockid, type = f.type, date = f.date, currency = f.currency;
  const qty = parseFloat(f.qty);
  const price = parseFloat(f.price);
  const courtage = parseFloat(f.courtage)||0;
  if(!date){ toast('Datum erforderlich','err'); return; }
  if(!qty||qty<=0){ toast('Anzahl erforderlich','err'); return; }
  if(!price||price<=0){ toast('Preis erforderlich','err'); return; }
  const total = type==='kauf' ? qty*price+courtage : qty*price-courtage;
  const tr = { id:'tr_'+Date.now(), stockId, type, date, qty, price, currency, courtage, total };
  SDATA.trades.push(tr);
  sdataSave();
  if(!CFG.demo && (CFG.scriptUrl || CFG.sessionToken)){
    apiAppend('Trades',[[tr.id,tr.stockId,tr.type,tr.date,tr.qty,tr.price,tr.currency,tr.courtage,tr.total,'']]).catch(e=>toast('Trade Sheet-Sync: '+e.message,'err'));
  }
  closeModal('trade-modal');
  const pos = calcPosition(stockId);
  if(type==='verkauf' && pos.qty <= 0.0001) toast('Vollständig verkauft → Historisch','ok');
  else toast('✓ Trade gespeichert','ok');
  renderAktieDetail(stockId);
}

function deleteTrade(tradeId){
  if(!confirm('Trade löschen?')) return;
  if(!CFG.demo && CFG.scriptUrl){
    apiFindRow('Trades',tradeId).then(row=>{ if(row) apiUpdate(`Trades!J${row}:J${row}`,[['1']]); }).catch(()=>{});
  }
  SDATA.trades = SDATA.trades.filter(t=>t.id!==tradeId);
  sdataSave();
  renderAktieDetail(currentAktieId);
  toast('✓ Trade gelöscht','ok');
}

function deleteAktie(stockId){
  if(!confirm('Aktie und alle Trades löschen?')) return;
  if(!CFG.demo && (CFG.scriptUrl || CFG.sessionToken)){
    apiFindRow('Aktien',stockId).then(row=>{ if(row) apiUpdate(`Aktien!F${row}:F${row}`,[['1']]); }).catch(()=>{});
    SDATA.trades.filter(t=>t.stockId===stockId).forEach(t=>{
      apiFindRow('Trades',t.id).then(row=>{ if(row) apiUpdate(`Trades!J${row}:J${row}`,[['1']]); }).catch(()=>{});
    });
  }
  SDATA.stocks = SDATA.stocks.filter(s=>s.id!==stockId);
  SDATA.trades = SDATA.trades.filter(t=>t.stockId!==stockId);
  sdataSave();
  closeAktieDetail();
  toast('✓ Aktie gelöscht','ok');
}

