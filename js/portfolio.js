// ── State ────────────────────────────────────────────────────────────────────
const STOCKS_KEY = 'ft_stocks_v1';
let SDATA = { stocks: [], trades: [] };
let PDATA = { verlauf: [] };          // [{date, total}] from Portfolio-Verlauf sheet

let aktienView    = 'aktiv';          // 'aktiv' | 'historisch'
let aktienTabView = 'karten';         // 'karten' | 'tabelle' | 'charts'
let aktienTradeTyp = 'kauf';          // 'kauf' | 'verkauf'
let currentAktieId = null;
let stockPriceCache = {};             // ticker → { price, prevClose, currency, ts, stale }
let fxRateCache     = {};             // "USDEUR" → rate

// ── Persistence ──────────────────────────────────────────────────────────────
function sdataLoad() {
  try { const s = localStorage.getItem(STOCKS_KEY); if (s) SDATA = JSON.parse(s); }
  catch { SDATA = { stocks: [], trades: [] }; }
}
function sdataSave() { localStorage.setItem(STOCKS_KEY, JSON.stringify(SDATA)); }

// ── Format helpers ───────────────────────────────────────────────────────────
function fmtPrice(n) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtQty(n) {
  if (n == null) return '0';
  return n === Math.floor(n) ? n.toFixed(0) : parseFloat(n.toFixed(6)).toString();
}

// ── Color palette ─────────────────────────────────────────────────────────────
const AKTIE_PALETTE = ['#6dd5fa','#f7971e','#a18cd1','#fd7f6f','#b8e994','#f9ca24','#6c5ce7','#fd79a8','#00cec9','#e17055'];
function aktieColor(stockId) {
  const i = SDATA.stocks.findIndex(s => s.id === stockId);
  return AKTIE_PALETTE[(i >= 0 ? i : 0) % AKTIE_PALETTE.length];
}

// ── P&L display helpers ───────────────────────────────────────────────────────
function pnlClass(amt) { return amt == null ? 'aktie-pnl-na' : amt >= 0 ? 'aktie-pnl-pos' : 'aktie-pnl-neg'; }
function pnlSign(amt)  { return amt != null && amt >= 0 ? '+' : ''; }

// ── Ticker normalisation ─────────────────────────────────────────────────────
const _GF_SUFFIX_MAP = { '.ST': 'STO:', '.SW': 'VTX:', '.DE': 'FRA:', '.L': 'LON:', '.PA': 'EPA:', '.TO': 'TSE:', '.AS': 'AMS:' };
const _YH_PREFIX_MAP = { 'VTX:': '.SW', 'FRA:': '.DE', 'LON:': '.L', 'EPA:': '.PA', 'TSE:': '.TO', 'AMS:': '.AS', 'NASDAQ:': '', 'NYSE:': '', 'STO:': '.ST' };

function normalizeTickerForGF(t) {
  t = t.trim().toUpperCase();
  for (const [sfx, pfx] of Object.entries(_GF_SUFFIX_MAP))
    if (t.endsWith(sfx)) return pfx + t.slice(0, -sfx.length);
  return t;
}
function normalizeTickerForYahoo(t) {
  t = t.trim().toUpperCase();
  for (const [pfx, sfx] of Object.entries(_YH_PREFIX_MAP))
    if (t.startsWith(pfx)) return t.slice(pfx.length) + sfx;
  return t;
}

// ── FX helpers ───────────────────────────────────────────────────────────────
function getFxRate(fromCurr) {
  const uc = curr().toUpperCase();
  if (!fromCurr || fromCurr.toUpperCase() === uc) return 1;
  const pair = `${fromCurr.toUpperCase()}${uc}`;
  if (fxRateCache[pair]) return fxRateCache[pair];
  const rev = `${uc}${fromCurr.toUpperCase()}`;
  if (fxRateCache[rev]) return 1 / fxRateCache[rev];
  console.warn(`No FX rate for ${pair}`);
  return 1;
}
function hasFxRate(fromCurr) {
  if (!fromCurr) return true;
  const fc = fromCurr.toUpperCase(), uc = curr().toUpperCase();
  return fc === uc || !!fxRateCache[`${fc}${uc}`];
}
function toUserCurrency(amount, fromCurr) { return amount * getFxRate(fromCurr); }

// ── Price cache accessors ────────────────────────────────────────────────────
function getCachedStock(ticker) {
  if (!ticker) return null;
  return stockPriceCache[ticker.toUpperCase()] || stockPriceCache[normalizeTickerForGF(ticker)] || null;
}
function getAktuellerKurs(ticker) { return getCachedStock(ticker)?.price ?? null; }

// resolveLive — central helper used by all renderers
// Returns live price + FX info for one stock so callers don't repeat this pattern
function resolveLive(ticker, stockCurr) {
  const live    = ticker ? getCachedStock(ticker) : null;
  const sc      = (live?.currency || stockCurr || '').toUpperCase();
  const uc      = curr().toUpperCase();
  const needsFx = sc && sc !== uc;
  const fxOk    = !needsFx || hasFxRate(sc);   // false → FX rate not yet loaded
  const fxRate  = needsFx ? getFxRate(sc) : 1;  // getFxRate returns 1 when missing
  const lp      = live?.price ?? null;
  const lpUser  = (lp != null && fxOk) ? lp * fxRate : null; // null when FX unknown
  return { live, lp, lpUser, sc, needsFx, fxOk, fxRate };
}

// ── Position calculation ──────────────────────────────────────────────────────
function calcPosition(stockId) {
  const trades = SDATA.trades
    .filter(t => t.stockId === stockId && !t.deleted)
    .sort((a, b) => a.date.localeCompare(b.date));
  let qty = 0, totalCost = 0;
  for (const t of trades) {
    if (t.type === 'kauf') {
      totalCost += t.qty * t.price + (t.courtage || 0);
      qty += t.qty;
    } else {
      totalCost -= t.qty * (qty > 0 ? totalCost / qty : 0);
      qty -= t.qty;
    }
  }
  qty = Math.round(qty * 1e6) / 1e6;
  if (qty < 0) qty = 0;
  return { qty, avgPrice: qty > 0.0001 ? totalCost / qty : 0, totalCost };
}
function getDurchschnittsPreis(stockId) { return calcPosition(stockId).avgPrice; }

// ── Portfolio values ──────────────────────────────────────────────────────────
function getPositionsWertRaw(stockId) {
  const { qty, totalCost } = calcPosition(stockId);
  const s = SDATA.stocks.find(s => s.id === stockId);
  const { lp, lpUser, sc } = resolveLive(s?.ticker, s?.currency);
  const isFxApprox = sc && sc !== curr().toUpperCase() && !hasFxRate(sc);
  const value = lp != null && qty > 0.0001
    ? qty * lpUser
    : toUserCurrency(totalCost, s?.currency);
  return { value, isFxApprox };
}
function getPositionsWert(stockId) { return getPositionsWertRaw(stockId).value; }

function getGesamtPortfoliowert() {
  let total = 0;
  for (const s of SDATA.stocks) {
    const raw = getPositionsWertRaw(s.id);
    if (raw.isFxApprox && calcPosition(s.id).qty > 0.0001) return null;
    total += raw.value;
  }
  return total;
}

// ── P&L ──────────────────────────────────────────────────────────────────────
function getGewinnVerlust(stockId) {
  const pos = calcPosition(stockId);
  const s   = SDATA.stocks.find(s => s.id === stockId);
  if (!s || pos.qty < 0.0001) return { amt: 0, pct: 0, hasLive: false };
  const { lp, fxRate, fxOk } = resolveLive(s.ticker, s.currency);
  if (lp == null || !fxOk) return { amt: 0, pct: 0, hasLive: false };
  return {
    amt:     (lp - pos.avgPrice) * pos.qty * fxRate,
    pct:     pos.avgPrice > 0 ? (lp / pos.avgPrice - 1) * 100 : 0,
    hasLive: true,
  };
}

function getGesamtGewinnVerlust() {
  let amt = 0, cost = 0, hasAny = false, fxMissing = false;
  for (const s of SDATA.stocks) {
    const pos = calcPosition(s.id);
    if (pos.qty < 0.0001) continue;
    const { lp, fxRate, sc } = resolveLive(s.ticker, s.currency);
    if (!lp) continue;
    if (!hasFxRate(sc)) { fxMissing = true; continue; }
    amt  += (lp - pos.avgPrice) * pos.qty * fxRate;
    cost += pos.totalCost * fxRate;
    hasAny = true;
  }
  if (fxMissing) return { amt: 0, pct: 0, hasLive: false };
  return { amt, pct: cost > 0 ? amt / cost * 100 : 0, hasLive: hasAny };
}

// ── Kurse-Cache (Sheet persistence) ──────────────────────────────────────────
let _kurseCacheLoaded = false;

async function loadKurseCache() {
  if (CFG.demo || (!CFG.scriptUrl && !CFG.sessionToken)) return;
  try {
    const res = await apiGet('Kurse-Cache!A2:F200');
    const now = Date.now();
    for (const [ticker, price, prevClose, currency, fxRate, updatedAt] of (res.values || [])) {
      if (!ticker || (!price && !fxRate)) continue;
      const ts  = updatedAt ? new Date(updatedAt).getTime() : 0;
      const age = ts ? now - ts : Infinity;
      if (ticker.startsWith('CURRENCY:')) {
        const key = ticker.slice('CURRENCY:'.length);
        if (!fxRateCache[key] && fxRate && age < 48 * 3600_000)
          fxRateCache[key] = parseFloat(fxRate);
      } else if (!stockPriceCache[ticker] && price) {
        stockPriceCache[ticker] = {
          price: parseFloat(price),
          prevClose: prevClose ? parseFloat(prevClose) : null,
          currency: currency || '',
          ts: ts || now,
          stale: age > 86_400_000,
        };
      }
    }
  } catch { /* sheet may not exist yet */ }
}

async function saveKurseCache() {
  if (CFG.demo || (!CFG.scriptUrl && !CFG.sessionToken)) return;
  try {
    await apiCall({ action: 'ensureSheet', sheet: 'Kurse-Cache', headers: JSON.stringify(['Ticker','Price','PrevClose','Currency','FxRate','UpdatedAt']) });
    const now  = new Date().toISOString();
    const rows = [
      ...Object.entries(stockPriceCache)
        .filter(([, d]) => d?.price)
        .map(([t, d]) => [t, d.price, d.prevClose ?? '', d.currency || '', '', new Date(d.ts).toISOString()]),
      ...Object.entries(fxRateCache).map(([k, r]) => [`CURRENCY:${k}`, '', '', '', r, now]),
    ];
    if (!rows.length) return;
    const padded = [...rows, ...Array(Math.max(0, 50 - rows.length)).fill(['','','','','',''])];
    await apiUpdate(`Kurse-Cache!A2:F${padded.length + 1}`, padded);
  } catch (e) { console.warn('saveKurseCache:', e); }
}

// ── Write fresh prices back to Aktien sheet (columns G=Kurs, H=FX-Rate, I=Aktualisiert) ─
// Called after syncKurseSheet() so the sheet acts as a persistent price cache.
// On next app start, io.js reads these columns → instant display, no GOOGLEFINANCE needed.
async function writeKursesToAktienSheet() {
  if (CFG.demo || (!CFG.scriptUrl && !CFG.sessionToken) || !SDATA.stocks.length) return;
  const uc  = curr().toUpperCase();
  const now = new Date().toISOString();
  const rows = SDATA.stocks.map(s => {
    const tk      = s.ticker ? normalizeTickerForGF(s.ticker) : null;
    const cached  = tk ? stockPriceCache[tk] : null;
    const sc      = (cached?.currency || s.currency || '').toUpperCase();
    const fxRate  = sc && sc !== uc ? (fxRateCache[sc + uc] || '') : '';
    return cached?.price
      ? [cached.price, fxRate, now]
      : ['', '', ''];
  });
  if (!rows.length) return;
  try {
    await apiUpdate(`Aktien!G2:I${rows.length + 1}`, rows);
    // Clear stale flag now that sheet is up to date
    for (const s of SDATA.stocks) {
      const tk = s.ticker ? normalizeTickerForGF(s.ticker) : null;
      if (tk && stockPriceCache[tk]) stockPriceCache[tk].stale = false;
    }
  } catch (e) { console.warn('writeKursesToAktienSheet:', e); }
}

// ── Portfolio-Verlauf ─────────────────────────────────────────────────────────
async function loadPortfolioVerlauf() {
  if (CFG.demo || (!CFG.scriptUrl && !CFG.sessionToken)) { PDATA.verlauf = []; return; }
  try {
    const res = await apiGet('Portfolio-Verlauf!A2:B500');
    PDATA.verlauf = (res.values || [])
      .filter(r => r[0] && parseFloat(r[1]) > 0)
      .map(r => ({ date: String(r[0]).slice(0, 10), total: parseFloat(r[1]) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch { PDATA.verlauf = []; }
}

async function appendPortfolioSnapshot() {
  if (CFG.demo || (!CFG.scriptUrl && !CFG.sessionToken)) return;
  const total = getGesamtPortfoliowert();
  if (!total || total <= 0) return;
  const todayStr = today();
  try {
    await apiCall({ action: 'ensureSheet', sheet: 'Portfolio-Verlauf', headers: JSON.stringify(['Datum','Gesamt']) });
    const last = PDATA.verlauf[PDATA.verlauf.length - 1];
    if (last?.date === todayStr) {
      const res2 = await apiGet('Portfolio-Verlauf!A:A');
      const idx  = (res2.values || []).findIndex(r => String(r[0]).slice(0, 10) === todayStr);
      if (idx > 0) await apiUpdate(`Portfolio-Verlauf!B${idx + 1}:B${idx + 1}`, [[total]]);
      last.total = total;
    } else {
      await apiAppend('Portfolio-Verlauf', [[todayStr, total]]);
      PDATA.verlauf.push({ date: todayStr, total });
    }
  } catch { /* silent */ }
}

// ── GOOGLEFINANCE price sync ──────────────────────────────────────────────────
let _syncKurseRunning = null;

async function syncKurseSheet(extraTickers = []) {
  if (CFG.demo || (!CFG.scriptUrl && !CFG.sessionToken)) return;
  if (_syncKurseRunning) { await _syncKurseRunning; return; }
  _syncKurseRunning = _doSyncKurse(extraTickers);
  try { await _syncKurseRunning; } finally { _syncKurseRunning = null; }
}

async function _doSyncKurse(extraTickers) {
  const uc      = curr().toUpperCase();
  const tickers = SDATA.stocks.filter(s => s.ticker).map(s => normalizeTickerForGF(s.ticker));
  const fxNeeded = [...new Set(SDATA.stocks.map(s => (s.currency || '').toUpperCase()))]
    .filter(c => c && c !== uc).map(c => `CURRENCY:${c}${uc}`);
  const all = [...new Set([...tickers, ...fxNeeded, ...extraTickers.map(t => t.toUpperCase())])];
  if (!all.length) return;

  try {
    const res = await apiCall({ action: 'fetchPrices', tickers: JSON.stringify(all) });
    if (!res.prices) return;

    const newCurrencies = new Set();
    for (const [ticker, data] of Object.entries(res.prices)) {
      if (!data.price || data.price <= 0) continue;
      if (ticker.startsWith('CURRENCY:')) {
        fxRateCache[ticker.slice('CURRENCY:'.length)] = data.price;
      } else {
        stockPriceCache[ticker] = { price: data.price, prevClose: data.prevClose || null, currency: data.currency || '', ts: Date.now() };
        const c = (data.currency || '').toUpperCase();
        if (c && c !== uc) newCurrencies.add(c);
      }
    }

    // Second pass: FX for currencies reported by GOOGLEFINANCE but not yet cached
    const missingFx = [...newCurrencies]
      .filter(c => !fxRateCache[`${c}${uc}`])
      .map(c => `CURRENCY:${c}${uc}`);
    if (missingFx.length) {
      const r2 = await apiCall({ action: 'fetchPrices', tickers: JSON.stringify(missingFx) });
      for (const [t, d] of Object.entries(r2.prices || {}))
        if (t.startsWith('CURRENCY:') && d.price > 0)
          fxRateCache[t.slice('CURRENCY:'.length)] = d.price;
    }

    // Auto-correct stock currency from GOOGLEFINANCE-reported value
    let fixed = false;
    for (const s of SDATA.stocks) {
      const reported = (getCachedStock(s.ticker)?.currency || '').toUpperCase();
      if (reported && reported !== (s.currency || '').toUpperCase()) { s.currency = reported; fixed = true; }
    }
    if (fixed) sdataSave();
  } catch (e) { console.warn('syncKurseSheet:', e); }
}

// ── Single-ticker price fetch (modal test + detail refresh) ───────────────────
async function fetchStockPrice(ticker) {
  if (!ticker) return null;
  const key   = ticker.toUpperCase();
  const gfKey = normalizeTickerForGF(key);
  const cached = stockPriceCache[key] || stockPriceCache[gfKey];
  if (cached && (Date.now() - cached.ts) < 7 * 60_000) return cached;

  // Primary: GOOGLEFINANCE via Apps Script
  if (!CFG.demo && (CFG.scriptUrl || CFG.sessionToken)) {
    await syncKurseSheet([gfKey]);
    let res = stockPriceCache[key] || stockPriceCache[gfKey];
    if (!res) {
      await new Promise(r => setTimeout(r, 2000));
      await syncKurseSheet([gfKey]);
      res = stockPriceCache[key] || stockPriceCache[gfKey];
    }
    if (res) return res;
  }

  // Fallback: Yahoo Finance via CORS proxy (demo / no backend)
  const yahooTicker = normalizeTickerForYahoo(gfKey);
  const yahooUrl    = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=1d&range=1d`;
  for (const proxy of [
    `https://api.allorigins.win/get?url=${encodeURIComponent(yahooUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`,
  ]) {
    try {
      const r = await fetch(proxy, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      let json = await r.json();
      if (typeof json?.contents === 'string') json = JSON.parse(json.contents);
      const meta = json?.chart?.result?.[0]?.meta;
      if (!meta?.regularMarketPrice) continue;
      const result = { price: meta.regularMarketPrice, prevClose: meta.chartPreviousClose ?? meta.previousClose ?? null, currency: meta.currency || '', ts: Date.now() };
      stockPriceCache[key] = result;
      return result;
    } catch { /* try next proxy */ }
  }
  return null;
}

// ── View state toggles ────────────────────────────────────────────────────────
function setAktienView(v) {
  aktienView = v;
  document.getElementById('aktien-btn-aktiv').className = 'type-btn' + (v === 'aktiv' ? ' active expense' : '');
  document.getElementById('aktien-btn-hist').className  = 'type-btn' + (v === 'historisch' ? ' active income' : '');
  renderAktien();
}
function setAktienTabView(v) { aktienTabView = v; renderAktien(); }
function setAktienTradeType(t) {
  aktienTradeTyp = t;
  document.getElementById('at-kauf-btn').className = 'type-btn' + (t === 'kauf' ? ' active' : '');
  document.getElementById('at-verk-btn').className = 'type-btn' + (t === 'verkauf' ? ' active' : '');
}

// ── Eingabe-Tab trade form ────────────────────────────────────────────────────
function renderAktienTradeForm() {
  const sel = document.getElementById('at-stock'); if (!sel) return;
  sel.innerHTML = '<option value="">— Aktie wählen —</option>' +
    SDATA.stocks.map(s => {
      const pos = calcPosition(s.id);
      return `<option value="${s.id}">${esc(s.title)}${s.ticker ? ' (' + esc(s.ticker) + ')' : ''} · ${fmtQty(pos.qty)} Stk.</option>`;
    }).join('');
  const dateEl = document.getElementById('at-date');
  if (dateEl && !dateEl.value) dateEl.value = today();
  updateAktienTotal();
}

function updateAktienTotal() {
  const qty   = parseFloat(document.getElementById('at-qty')?.value) || 0;
  const price = parseFloat(document.getElementById('at-price')?.value) || 0;
  const el    = document.getElementById('at-total');
  const stock = SDATA.stocks.find(s => s.id === document.getElementById('at-stock')?.value);
  const tc    = stock?.currency || curr();
  if (el) el.value = qty * price > 0 ? `${tc} ${fmtAmt(qty * price)}` : '';
}

function openNewAktieModalFromEingabe() { openNewAktieModal(); }

async function saveAktienTradeFromEingabe() {
  const stockId = document.getElementById('at-stock')?.value;
  if (!stockId) { toast('Bitte Aktie wählen', 'err'); return; }
  const qty   = parseFloat(document.getElementById('at-qty')?.value) || 0;
  const price = parseFloat(document.getElementById('at-price')?.value) || 0;
  const date  = document.getElementById('at-date')?.value || today();
  const note  = document.getElementById('at-note')?.value.trim() || '';
  if (qty <= 0)   { toast('Anzahl erforderlich', 'err'); return; }
  if (price <= 0) { toast('Preis erforderlich', 'err'); return; }
  const id    = genId('T');
  const trade = { id, stockId, type: aktienTradeTyp, qty, price, date, note };
  SDATA.trades.push(trade);
  if (!CFG.demo) {
    setSyncStatus('syncing');
    try {
      await apiAppend('Trades', [[id, stockId, aktienTradeTyp, qty, price, date, note]]);
      setSyncStatus('online');
    } catch (e) { setSyncStatus('error'); toast('Sync-Fehler: ' + e.message, 'err'); return; }
  }
  document.getElementById('at-qty').value = '';
  document.getElementById('at-price').value = '';
  document.getElementById('at-note').value = '';
  document.getElementById('at-total').value = '';
  toast('Trade gespeichert');
  renderAktienTradeForm();
}

// ── Today-change helper ───────────────────────────────────────────────────────
function getPortfolioTodayChange() {
  let totalChange = 0, hasData = false;
  for (const s of SDATA.stocks) {
    const pos = calcPosition(s.id); if (pos.qty < 0.0001) continue;
    const c = s.ticker ? getCachedStock(s.ticker) : null;
    if (!c?.price || !c?.prevClose) continue;
    totalChange += (c.price - c.prevClose) * pos.qty * getFxRate(c.currency || s.currency);
    hasData = true;
  }
  return { amt: totalChange, hasData };
}

// ── Dashboard top strip ───────────────────────────────────────────────────────
function renderAktienDashboardTop() {
  const dashEl  = document.getElementById('aktien-dashboard-top');
  if (!dashEl) return;
  const active   = SDATA.stocks.filter(s => calcPosition(s.id).qty > 0.0001);
  if (!active.length) { dashEl.innerHTML = ''; return; }
  const total    = getGesamtPortfoliowert();
  const gv       = getGesamtGewinnVerlust();
  const todayChg = getPortfolioTodayChange();
  const posCount = active.length;
  const gvColor  = gv.hasLive ? (gv.amt >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--text2)';
  const gvSign   = gv.amt >= 0 ? '+' : '';
  const tColor   = !todayChg.hasData ? 'var(--text2)' : todayChg.amt >= 0 ? 'var(--green)' : 'var(--red)';
  const tSign    = todayChg.amt >= 0 ? '+' : '';
  const tArrow   = !todayChg.hasData ? '' : todayChg.amt >= 0 ? ' ▲' : ' ▼';
  dashEl.innerHTML = `
  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);margin:12px 16px 6px;padding:14px">
    <div style="font-size:10px;font-weight:700;letter-spacing:.08em;color:var(--text3);margin-bottom:10px;text-transform:uppercase">Portfolio-Übersicht</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0">
      <div style="padding:6px 0;border-bottom:1px solid var(--border);padding-right:12px">
        <div class="t-label">Portfolio-Wert</div>
        <div style="font-family:'DM Mono',monospace;font-size:15px;font-weight:700;margin-top:2px;color:${total === null ? 'var(--text3)' : 'inherit'}">${total === null ? 'Kurs wird geladen…' : curr() + ' ' + fmtAmt(total)}</div>
      </div>
      <div style="padding:6px 0;border-bottom:1px solid var(--border);padding-left:12px;border-left:1px solid var(--border)">
        <div class="t-label">Heute</div>
        <div style="font-family:'DM Mono',monospace;font-size:15px;font-weight:700;margin-top:2px;color:${tColor}">${todayChg.hasData ? tSign + curr() + ' ' + fmtAmt(Math.abs(todayChg.amt)) + tArrow : '—'}</div>
      </div>
      <div style="padding:6px 0;padding-right:12px;margin-top:4px">
        <div class="t-label">Gesamt G/V</div>
        <div style="font-family:'DM Mono',monospace;font-size:15px;font-weight:700;margin-top:2px;color:${gvColor}">${gv.hasLive ? gvSign + curr() + ' ' + fmtAmt(Math.abs(gv.amt)) + ' (' + gvSign + gv.pct.toFixed(1) + '%)' : '—'}</div>
      </div>
      <div style="padding:6px 0;padding-left:12px;border-left:1px solid var(--border);margin-top:4px">
        <div class="t-label">Positionen</div>
        <div style="font-family:'DM Mono',monospace;font-size:15px;font-weight:700;margin-top:2px">${posCount} Aktie${posCount !== 1 ? 'n' : ''}</div>
      </div>
    </div>
  </div>`;
}

// ── FX rates strip ────────────────────────────────────────────────────────────
function renderFxRates() {
  const el = document.getElementById('aktien-fx-rates');
  if (!el) return;
  const uc = curr().toUpperCase();
  const foreign = [...new Set(
    SDATA.stocks
      .filter(s => calcPosition(s.id).qty > 0.0001)
      .map(s => (getCachedStock(s.ticker)?.currency || s.currency || '').toUpperCase())
      .filter(c => c && c !== uc)
  )].sort();
  if (!foreign.length) { el.innerHTML = ''; return; }
  const rows = foreign.map(fc => {
    const rate = fxRateCache[fc + uc];
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:12px;color:var(--text2)">1 ${fc} →</span>
      <span style="font-family:'DM Mono',monospace;font-size:12px;color:${rate ? 'var(--text)' : 'var(--text3)'}">${rate ? fmtPrice(rate) + ' ' + uc : 'Laden…'}</span>
    </div>`;
  }).join('');
  el.innerHTML = `
  <div style="margin:0 16px 10px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:12px 14px">
    <div style="font-size:10px;font-weight:700;letter-spacing:.08em;color:var(--text3);margin-bottom:6px;text-transform:uppercase">Wechselkurse</div>
    ${rows}
  </div>`;
}

// ── Charts ────────────────────────────────────────────────────────────────────
function buildPortfolioPieChart(stocks) {
  const data = stocks.map(s => ({ label: s.ticker || s.title, value: getPositionsWert(s.id), color: aktieColor(s.id) })).filter(d => d.value > 0);
  const total = data.reduce((a, d) => a + d.value, 0);
  if (!total || !data.length) return '';
  const cx = 90, cy = 90, r = 75;
  let angle = -Math.PI / 2;
  const slices = data.map(d => {
    const frac = d.value / total, sweep = frac * 2 * Math.PI, ea = angle + sweep, la = frac > 0.5 ? 1 : 0;
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(ea),   y2 = cy + r * Math.sin(ea);
    const path = frac > 0.9999
      ? `M${cx - r},${cy} A${r},${r} 0 1 1 ${cx + r},${cy} A${r},${r} 0 1 1 ${cx - r},${cy}`
      : `M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${la} 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`;
    angle = ea;
    return { ...d, path, pct: (frac * 100).toFixed(1) };
  });
  return `
  <div class="widget-title">Portfolio-Verteilung</div>
  <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
    <svg viewBox="0 0 180 180" height="140" class="flex-shrink-0">
      ${slices.map(s => `<path d="${s.path}" fill="${s.color}" stroke="var(--bg0)" stroke-width="2"/>`).join('')}
    </svg>
    <div>${slices.map(s => `
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:12px">
        <span style="width:10px;height:10px;border-radius:3px;background:${s.color};flex-shrink:0"></span>
        <span class="t-text2">${esc(s.label)}</span>
        <span style="color:var(--text3);margin-left:auto;font-family:'DM Mono',monospace">${s.pct}%</span>
      </div>`).join('')}
    </div>
  </div>`;
}

function buildPreisVergleichChart(stocks) {
  const items = stocks.filter(s => s.pos.qty > 0.0001).map(s => {
    const { lp, fxRate, sc, needsFx } = resolveLive(s.ticker, s.currency);
    const isFxApprox = needsFx && !hasFxRate(sc);
    return { label: s.ticker || s.title, avg: s.pos.avgPrice * fxRate, live: lp != null ? lp * fxRate : null, color: aktieColor(s.id), origCurr: needsFx ? sc : '', isFxApprox };
  }).filter(d => d.avg > 0);
  if (!items.length) return '';
  const maxVal = Math.max(...items.flatMap(d => [d.avg, d.live || 0])) || 1;
  const gap = 12;
  return `
  <div class="widget-title">Ø Kaufpreis vs. Kurs (${curr()})</div>
  <div style="overflow-x:auto">
    ${items.map(d => `
    <div style="margin-bottom:${gap}px">
      <div style="font-size:11px;color:var(--text2);margin-bottom:3px;display:flex;justify-content:space-between">
        <span>${esc(d.label)}${d.origCurr ? ` <span style="font-size:9px;color:var(--text3)">${d.origCurr}</span>` : ''}</span>
        ${d.live != null ? `<span style="color:${d.live >= d.avg ? 'var(--green)' : 'var(--red)'};font-family:'DM Mono',monospace;font-size:10px">${d.live >= d.avg ? '↑' : '↓'} ${fmtPrice(d.live)}</span>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">
        <div style="display:flex;align-items:center;gap:6px">
          <div style="font-size:9px;color:var(--text3);width:52px;text-align:right">Ø Kauf</div>
          <div style="flex:1;height:10px;background:var(--bg3);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${(d.avg / maxVal * 100).toFixed(1)}%;background:${d.color};border-radius:3px;opacity:.8"></div>
          </div>
          <div style="font-size:10px;font-family:'DM Mono',monospace;color:var(--text3);min-width:50px">${d.isFxApprox ? '≈ ' : ''}${fmtPrice(d.avg)}</div>
        </div>
        ${d.live != null ? `
        <div style="display:flex;align-items:center;gap:6px">
          <div style="font-size:9px;color:var(--text3);width:52px;text-align:right">Live</div>
          <div style="flex:1;height:10px;background:var(--bg3);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${(d.live / maxVal * 100).toFixed(1)}%;background:${d.live >= d.avg ? 'var(--green)' : 'var(--red)'};border-radius:3px"></div>
          </div>
          <div style="font-size:10px;font-family:'DM Mono',monospace;min-width:50px;color:${d.live >= d.avg ? 'var(--green)' : 'var(--red)'}">${d.isFxApprox ? '≈ ' : ''}${fmtPrice(d.live)}</div>
        </div>` : `<div style="font-size:9px;color:var(--text3);padding-left:58px">Kein Live-Kurs</div>`}
      </div>
    </div>`).join('')}
  </div>`;
}

function buildPortfolioVerlauf() {
  const W = 300, H = 110, padL = 48, padR = 8, padT = 8, padB = 22;
  const cW = W - padL - padR, cH = H - padT - padB;

  if (PDATA.verlauf.length >= 2) {
    const pts = [...PDATA.verlauf];
    const todayStr = today(), curVal = getGesamtPortfoliowert();
    if (pts[pts.length - 1].date === todayStr && curVal != null && curVal > 0) pts[pts.length - 1].total = curVal;
    else if (curVal != null && curVal > 0) pts.push({ date: todayStr, total: curVal });
    const startD = new Date(pts[0].date + 'T12:00:00');
    const totDays = Math.max(1, Math.round((new Date(pts[pts.length - 1].date + 'T12:00:00') - startD) / 86400000));
    const mapX = d => padL + (Math.round((new Date(d + 'T12:00:00') - startD) / 86400000) / totDays) * cW;
    const minV = Math.min(...pts.map(p => p.total), 0), maxV = Math.max(...pts.map(p => p.total), 1), range = maxV - minV || 1;
    const mapY = v => padT + cH - ((v - minV) / range) * cH;
    const poly = pts.map(p => `${mapX(p.date).toFixed(1)},${mapY(p.total).toFixed(1)}`).join(' ');
    const area = `M${mapX(pts[0].date).toFixed(1)},${mapY(minV)} ` + pts.map(p => `L${mapX(p.date).toFixed(1)},${mapY(p.total).toFixed(1)}`).join(' ') + ` L${mapX(pts[pts.length - 1].date).toFixed(1)},${mapY(minV)} Z`;
    const fmtL = v => Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v).toString();
    const yLbls = [[minV, 'var(--text3)', fmtL(minV)], [maxV, 'var(--green)', fmtL(maxV)]].map(([v, c, l]) => `<text x="2" y="${mapY(v).toFixed(1)}" font-size="8" fill="${c}" dominant-baseline="middle" font-family="DM Mono,monospace">${l}</text>`);
    const xLbls = [0, Math.floor(pts.length / 2), pts.length - 1].map(i => { const p = pts[i]; if (!p) return ''; const d = new Date(p.date + 'T12:00:00'); return `<text x="${mapX(p.date).toFixed(1)}" y="${H - 4}" font-size="8" fill="var(--text3)" text-anchor="middle" font-family="DM Mono,monospace">${d.getDate()}.${d.getMonth() + 1}.</text>`; });
    const latestVal = pts[pts.length - 1].total, firstVal = pts[0].total;
    const totalReturn = firstVal > 0 ? (latestVal - firstVal) / firstVal * 100 : 0;
    const retColor = totalReturn >= 0 ? 'var(--green)' : 'var(--red)';
    return `
    <div class="widget-title">Portfolio-Verlauf (Marktwert)</div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
      <span style="font-size:20px;font-weight:700;font-family:'DM Mono',monospace">${curr()} ${fmtAmt(latestVal)}</span>
      <span style="font-size:12px;color:${retColor};font-family:'DM Mono',monospace">${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(1)}% ges.</span>
    </div>
    <svg viewBox="0 0 ${W} ${H}" height="${H}" class="w-full">
      <defs><linearGradient id="pvGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--green)" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="var(--green)" stop-opacity="0.02"/>
      </linearGradient></defs>
      <path d="${area}" fill="url(#pvGrad)"/>
      <polyline points="${poly}" fill="none" stroke="var(--green)" stroke-width="2" stroke-linejoin="round"/>
      ${yLbls.join('')}${xLbls.join('')}
    </svg>`;
  }

  if (!SDATA.trades.length) return '';
  const trades = [...SDATA.trades].sort((a, b) => a.date.localeCompare(b.date));
  const firstDate = trades[0].date, lastDate = today();
  let cumCost = 0;
  const pts = [{ date: firstDate, cost: 0 }];
  trades.forEach(t => { cumCost += t.type === 'kauf' ? t.total : -(t.total || 0); pts.push({ date: t.date, cost: Math.max(0, cumCost) }); });
  if (pts[pts.length - 1].date !== lastDate) pts.push({ date: lastDate, cost: Math.max(0, cumCost) });
  const startD = new Date(firstDate + 'T12:00:00');
  const totDays = Math.max(1, Math.round((new Date(lastDate + 'T12:00:00') - startD) / 86400000));
  const mapX = d => padL + (Math.round((new Date(d + 'T12:00:00') - startD) / 86400000) / totDays) * cW;
  const maxCost = Math.max(...pts.map(p => p.cost), 1);
  const mapY = v => padT + cH - (v / maxCost) * cH;
  const poly = pts.map(p => `${mapX(p.date).toFixed(1)},${mapY(p.cost).toFixed(1)}`).join(' ');
  const area = `M${mapX(pts[0].date).toFixed(1)},${mapY(0)} ` + pts.map(p => `L${mapX(p.date).toFixed(1)},${mapY(p.cost).toFixed(1)}`).join(' ') + ` L${mapX(pts[pts.length - 1].date).toFixed(1)},${mapY(0)} Z`;
  const curVal = getGesamtPortfoliowert();
  const valLine = curVal != null && curVal > 0 && curVal !== cumCost ? `<line x1="${mapX(lastDate).toFixed(1)}" y1="${mapY(0).toFixed(1)}" x2="${mapX(lastDate).toFixed(1)}" y2="${mapY(Math.min(curVal, maxCost)).toFixed(1)}" stroke="var(--green)" stroke-width="1.5" stroke-dasharray="3,2"/>` : '';
  const yLbls = [[0, 'var(--text3)', '0'], [maxCost, 'var(--accent)', maxCost >= 1000 ? (maxCost / 1000).toFixed(0) + 'k' : Math.round(maxCost).toString()]].map(([v, c, l]) => `<text x="2" y="${mapY(v).toFixed(1)}" font-size="8" fill="${c}" dominant-baseline="middle" font-family="DM Mono,monospace">${l}</text>`);
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
    ${valLine}${yLbls.join('')}
  </svg>`;
}

function renderAktienCharts(stocks) {
  const el = document.getElementById('aktien-charts');
  if (!el) return;
  const active = stocks.filter(s => s.pos.qty > 0.0001);
  if (!active.length) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="section pt-0"><div class="card" style="padding:14px">${buildPortfolioPieChart(active)}</div></div>
    <div class="section pt-0"><div class="card" style="padding:14px">${buildPreisVergleichChart(active)}</div></div>
    <div class="section pt-0"><div class="card" style="padding:14px">${buildPortfolioVerlauf()}</div></div>`;
}

function renderAktienTabelle(stocks) {
  const el = document.getElementById('aktien-tabelle');
  if (!el) return;
  const active = stocks.filter(s => s.pos.qty > 0.0001);
  if (!active.length) { el.innerHTML = ''; return; }
  el.innerHTML = `
  <div style="padding:0 16px 12px;overflow-x:auto">
    <table class="trade-tbl" style="min-width:420px">
      <thead><tr><th>Ticker</th><th>Anzahl</th><th>Ø Kauf</th><th>Kurs live</th><th>+/- %</th><th>Wert (${curr()})</th></tr></thead>
      <tbody>${active.map(s => {
        const { lp, lpUser, sc, needsFx, fxOk } = resolveLive(s.ticker, s.currency);
        const gv       = getGewinnVerlust(s.id);
        const wertRaw  = getPositionsWertRaw(s.id);
        const color    = !gv.hasLive ? 'var(--text)' : gv.pct >= 0 ? 'var(--green)' : 'var(--red)';
        const isStale  = getCachedStock(s.ticker)?.stale;
        // Only show CHF conversion when FX rate is confirmed
        const liveTxt  = lp != null
          ? (needsFx
              ? (fxOk ? `${fmtPrice(lpUser)} (${fmtPrice(lp)} ${sc})` : `${fmtPrice(lp)} ${sc}`)
              : fmtPrice(lpUser))
          : '—';
        return `<tr style="cursor:pointer" onclick="openAktieDetail('${s.id}')">
          <td><div class="t-bold">${esc(s.ticker || s.title)}</div>
              <div class="t-muted-sm">${esc(s.title)}${needsFx ? ' · ' + sc : ''}</div></td>
          <td class="t-mono">${fmtQty(s.pos.qty)}</td>
          <td class="t-mono">${fmtPrice(s.pos.avgPrice)}</td>
          <td style="font-family:'DM Mono',monospace;color:${lpUser != null ? (isStale ? 'var(--text3)' : color) : 'var(--text3)'};font-size:11px">${liveTxt}${isStale ? ' ⚑' : ''}</td>
          <td style="font-family:'DM Mono',monospace;color:${color};font-weight:600">${gv.hasLive ? pnlSign(gv.amt) + gv.pct.toFixed(1) + '%' : '—'}</td>
          <td class="t-mono-bold" style="${wertRaw.isFxApprox ? 'color:var(--text3)' : ''}">${wertRaw.isFxApprox ? '≈ ' : ''}${fmtAmt(wertRaw.value)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>
  </div>`;
}

// ── Main renderAktien ─────────────────────────────────────────────────────────
let _renderAktienRunning = false;

async function renderAktien() {
  if (_renderAktienRunning) return;
  _renderAktienRunning = true;
  try { await _renderAktienInner(); } finally { _renderAktienRunning = false; }
}

async function _renderAktienInner() {
  if (!_kurseCacheLoaded) { _kurseCacheLoaded = true; await loadKurseCache(); }

  renderAktienDashboardTop();
  renderFxRates();

  const positions   = SDATA.stocks.map(s => ({ ...s, pos: calcPosition(s.id) }));
  const activeStocks = positions.filter(s => s.pos.qty > 0.0001 || !SDATA.trades.some(t => t.stockId === s.id));
  const histStocks   = positions.filter(s => s.pos.qty <= 0.0001 && SDATA.trades.some(t => t.stockId === s.id));
  const show         = aktienView === 'aktiv' ? activeStocks : histStocks;

  const listEl    = document.getElementById('aktien-list');
  const summaryEl = document.getElementById('aktien-summary-bar');
  const tabelleEl = document.getElementById('aktien-tabelle');
  const chartsEl  = document.getElementById('aktien-charts');

  ['karten', 'tabelle', 'charts'].forEach(v => {
    const btn = document.getElementById('aktien-view-' + v);
    if (btn) btn.className = 'filter-chip' + (aktienTabView === v ? ' active' : '');
  });

  if (!show.length) {
    listEl.innerHTML = `<div class="empty"><div class="empty-icon"><svg viewBox="0 0 24 24" style="width:40px;height:40px;stroke:var(--border2);fill:none;stroke-width:1.5"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg></div><div class="empty-text">${aktienView === 'aktiv' ? 'Keine aktiven Positionen' : 'Keine historischen Positionen'}</div></div>`;
    summaryEl.innerHTML = '';
    if (tabelleEl) tabelleEl.innerHTML = '';
    if (chartsEl) chartsEl.innerHTML = '';
    return;
  }

  if (listEl)    listEl.style.display    = aktienTabView === 'karten'   ? '' : 'none';
  if (tabelleEl) tabelleEl.style.display = aktienTabView === 'tabelle'  ? '' : 'none';
  if (chartsEl)  chartsEl.style.display  = aktienTabView === 'charts'   ? '' : 'none';

  if (aktienTabView === 'karten')  renderAktienList(show, listEl, summaryEl);
  else summaryEl.innerHTML = '';
  if (aktienTabView === 'tabelle') renderAktienTabelle(show);
  if (aktienTabView === 'charts')  renderAktienCharts(show);

  // Prices come from Aktien sheet (loaded on app start) — no auto-fetch here.
  // Use the ↻ button (refreshAllPrices) to get fresh quotes from GOOGLEFINANCE.
}

async function refreshAllPrices() {
  const btn = document.getElementById('aktien-refresh-btn');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  Object.keys(stockPriceCache).forEach(k => { if (stockPriceCache[k]) stockPriceCache[k].stale = true; });

  // Primary: GOOGLEFINANCE via Apps Script (batch)
  await syncKurseSheet();
  const stillMissing = SDATA.stocks.some(s => {
    if (!s.ticker) return false;
    const c = getCachedStock(s.ticker);
    return !c || c.stale;
  });
  if (stillMissing) { await new Promise(r => setTimeout(r, 2000)); await syncKurseSheet(); }

  // Fallback: Yahoo Finance for any stock that still has no fresh price
  const noPrice = SDATA.stocks.filter(s => {
    if (!s.ticker) return false;
    const c = getCachedStock(s.ticker);
    return !c || c.stale;
  });
  if (noPrice.length) await Promise.allSettled(noPrice.map(s => fetchStockPrice(s.ticker)));

  await writeKursesToAktienSheet();
  await appendPortfolioSnapshot();
  await renderAktien();
  if (btn) { btn.disabled = false; btn.textContent = '↻'; }
}

// ── Card list ─────────────────────────────────────────────────────────────────
function renderAktienList(stocks, listEl, summaryEl) {
  let totalPnl = 0, hasPnl = false, totalWert = 0;
  listEl.innerHTML = stocks.map(s => {
    const { lp, lpUser, sc, needsFx, fxOk, fxRate } = resolveLive(s.ticker, s.currency);
    let pnlAmt = null, pnlPct = null;
    // Only compute P&L when FX rate is confirmed — otherwise value would be wrong
    if (lpUser != null && fxOk && s.pos.qty > 0.0001) {
      pnlAmt  = (lpUser - s.pos.avgPrice * fxRate) * s.pos.qty;
      pnlPct  = s.pos.avgPrice > 0 ? (lp / s.pos.avgPrice - 1) * 100 : 0;
      totalPnl += pnlAmt; hasPnl = true;
    }
    const wertRaw = getPositionsWertRaw(s.id);
    totalWert += wertRaw.value;
    const pc      = pnlClass(pnlAmt);
    const ps      = pnlSign(pnlAmt);
    const isStale = getCachedStock(s.ticker)?.stale;
    // Show CHF conversion only when FX rate is available
    const liveLabel = lp != null
      ? (needsFx
          ? (fxOk ? `${fmtPrice(lp)} ${sc} · ${curr()} ${fmtPrice(lpUser)}` : `${fmtPrice(lp)} ${sc}`)
          : `${fmtPrice(lp)} ${sc}`)
      : null;
    return `
    <div class="aktie-card" onclick="openAktieDetail('${s.id}')">
      <div class="aktie-card-top">
        <div>
          <div class="aktie-name">${esc(s.title)}</div>
          <div class="aktie-isin">${esc(s.isin || '')}${s.ticker ? ' · ' + esc(s.ticker) : ''}</div>
        </div>
        <div class="aktie-qty-badge">${fmtQty(s.pos.qty)} Stk.</div>
      </div>
      <div class="aktie-card-bottom">
        <div class="aktie-stat"><div class="aktie-stat-lbl">Ø Kaufpreis</div>
          <div class="aktie-stat-val">${fmtPrice(s.pos.avgPrice)} ${s.currency || ''}</div></div>
        ${liveLabel != null ? `
        <div class="aktie-stat"><div class="aktie-stat-lbl" ${isStale ? 'style="color:var(--text3)"' : ''}>${isStale ? 'Letzter Kurs (veraltet)' : 'Kurs live'}</div>
          <div class="aktie-stat-val" ${isStale ? 'style="font-size:11px;color:var(--text3)"' : 'style="font-size:11px"'}>${esc(liveLabel)}</div></div>
        ${pnlAmt != null ? `
        <div class="aktie-stat"><div class="aktie-stat-lbl">P&amp;L</div>
          <div class="aktie-stat-val ${pc}">${ps}${curr()} ${fmtAmt(Math.abs(pnlAmt))} (${ps}${pnlPct?.toFixed(1)}%)</div></div>` : ''}
        ` : s.ticker ? `<div class="aktie-stat"><div class="aktie-stat-lbl">Kurs live</div>
          <div class="aktie-stat-val aktie-pnl-na">Laden…</div></div>` : ''}
        <div class="aktie-stat"><div class="aktie-stat-lbl">Wert (${curr()})</div>
          <div class="aktie-stat-val" style="${wertRaw.isFxApprox ? 'color:var(--text3)' : ''}">${wertRaw.isFxApprox ? '≈ ' : ''} ${curr()} ${fmtAmt(wertRaw.value)}</div></div>
      </div>
    </div>`;
  }).join('');

  if (aktienView === 'aktiv') {
    const pc2 = totalPnl >= 0 ? 'aktie-pnl-pos' : 'aktie-pnl-neg';
    const ps2 = totalPnl >= 0 ? '+' : '';
    summaryEl.innerHTML = `
    <div class="aktie-summary-card">
      <div class="aktie-stat"><div class="aktie-stat-lbl">Depotwert (${curr()})</div>
        <div class="aktie-stat-val" style="font-size:16px;font-weight:700">${curr()} ${fmtAmt(totalWert)}</div></div>
      ${hasPnl ? `<div class="aktie-stat"><div class="aktie-stat-lbl">Gesamt P&amp;L</div>
        <div class="aktie-stat-val ${pc2}">${ps2}${curr()} ${fmtAmt(Math.abs(totalPnl))}</div></div>` : ''}
      <div class="aktie-stat"><div class="aktie-stat-lbl">Positionen</div>
        <div class="aktie-stat-val">${stocks.length}</div></div>
    </div>`;
  } else { summaryEl.innerHTML = ''; }
}

// ── Detail view ───────────────────────────────────────────────────────────────
function openAktieDetail(stockId) {
  currentAktieId = stockId;
  const s = SDATA.stocks.find(s => s.id === stockId);
  if (!s) return;
  document.getElementById('aktie-detail-title').textContent = s.title;
  renderAktieDetail(stockId);
  document.getElementById('aktie-detail').classList.add('open');
  Device.pushNav('aktiedetail', 'aktie-detail');
}

function closeAktieDetail() {
  document.getElementById('aktie-detail').classList.remove('open');
  currentAktieId = null;
  renderAktien();
}

function renderAktieDetail(stockId) {
  const s = SDATA.stocks.find(s => s.id === stockId);
  if (!s) return;
  const trades = SDATA.trades.filter(t => t.stockId === stockId).sort((a, b) => b.date.localeCompare(a.date));
  const pos    = calcPosition(stockId);
  const { lp, lpUser, sc, needsFx, fxOk, fxRate } = resolveLive(s.ticker, s.currency);
  const live   = s.ticker ? getCachedStock(s.ticker) : null;
  let pnlAmt = null, pnlPct = null;
  if (lpUser != null && fxOk && pos.qty > 0.0001) {
    pnlAmt = (lpUser - pos.avgPrice * fxRate) * pos.qty;
    pnlPct = pos.avgPrice > 0 ? (lp / pos.avgPrice - 1) * 100 : 0;
  }
  const pc   = pnlClass(pnlAmt);
  const ps   = pnlSign(pnlAmt);
  const wert = getPositionsWert(stockId);

  document.getElementById('aktie-detail-content').innerHTML = `
  <div class="section">
    <div class="aktie-summary-card" style="margin:0;flex-wrap:wrap;gap:16px">
      <div class="aktie-stat"><div class="aktie-stat-lbl">ISIN</div>
        <div style="font-size:12px;font-family:'DM Mono',monospace;color:var(--text)">${esc(s.isin || '—')}</div></div>
      <div class="aktie-stat"><div class="aktie-stat-lbl">Anzahl</div>
        <div class="aktie-stat-val">${fmtQty(pos.qty)} Stk.</div></div>
      <div class="aktie-stat"><div class="aktie-stat-lbl">Ø Kaufpreis</div>
        <div class="aktie-stat-val">${fmtPrice(pos.avgPrice)} ${s.currency || ''}</div></div>
      <div class="aktie-stat"><div class="aktie-stat-lbl">Einstand</div>
        <div class="aktie-stat-val">${fmtPrice(pos.totalCost)} ${s.currency || ''}</div></div>
      <div class="aktie-stat"><div class="aktie-stat-lbl">Wert (${curr()})</div>
        <div class="aktie-stat-val" style="font-weight:700">${curr()} ${fmtAmt(wert)}</div></div>
      ${lp != null ? `
      <div class="aktie-stat"><div class="aktie-stat-lbl" style="${live?.stale ? 'color:var(--text3)' : ''}">${live?.stale ? 'Letzter Kurs (veraltet)' : 'Kurs live'}</div>
        <div class="aktie-stat-val" style="${live?.stale ? 'color:var(--text3)' : ''}">
          ${needsFx
            ? (fxOk ? `${fmtPrice(lp)} ${sc} · ${curr()} ${fmtPrice(lpUser)}` : `${fmtPrice(lp)} ${sc}`)
            : fmtPrice(lpUser) + ' ' + curr()}
        </div>
        ${live?.stale && live?.ts ? `<div style="font-size:10px;color:var(--text3);margin-top:2px">Stand: ${fmtDate(new Date(live.ts))}</div>` : ''}
      </div>
      ${pnlAmt != null ? `<div class="aktie-stat"><div class="aktie-stat-lbl">P&amp;L (${curr()})</div>
        <div class="aktie-stat-val ${pc}">${ps}${curr()} ${fmtAmt(Math.abs(pnlAmt))} (${ps}${pnlPct?.toFixed(1)}%)</div></div>` : ''}`
      : s.ticker ? `<div class="aktie-stat"><div class="aktie-stat-lbl">Kurs live</div>
        <div class="aktie-stat-val aktie-pnl-na" style="cursor:pointer" onclick="refreshStockPrice('${s.id}')">Laden…</div></div>` : ''}
    </div>
  </div>
  <div class="section pt-0">
    <div class="section-title">Trade-Historie</div>
    ${!trades.length ? `<div class="empty" style="padding:16px 0"><div class="empty-text">Noch keine Trades</div></div>` : `
    <div class="trade-tbl-wrap">
      <table class="trade-tbl">
        <thead><tr><th>Datum</th><th>Art</th><th>Stk.</th><th>Preis/Stk.</th><th>Währung</th><th>Courtage</th><th>Gesamt</th><th></th></tr></thead>
        <tbody>${trades.map(t => `
          <tr>
            <td style="white-space:nowrap">${fmtDate(t.date)}</td>
            <td><span class="${t.type === 'kauf' ? 't-kauf' : 't-verk'}">${t.type === 'kauf' ? 'Kauf' : 'Verkauf'}</span></td>
            <td>${fmtQty(t.qty)}</td>
            <td class="t-mono">${fmtPrice(t.price)}</td>
            <td>${esc(t.currency || s.currency || '')}</td>
            <td class="t-mono">${fmtPrice(t.courtage || 0)}</td>
            <td class="t-mono-bold">${fmtPrice(t.total)}</td>
            <td><button onclick="deleteTrade('${t.id}')" style="background:none;color:var(--text3);font-size:14px;padding:2px 6px;border:none;cursor:pointer;line-height:1">×</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`}
  </div>`;

  if (s.ticker) {
    const c = getCachedStock(s.ticker);
    if (!c || c.stale || (Date.now() - (c.ts || 0)) > 7 * 60_000) {
      fetchStockPrice(s.ticker).then(p => { if (p && currentAktieId === stockId) renderAktieDetail(stockId); });
    }
  }
}

async function refreshStockPrice(stockId) {
  const s = SDATA.stocks.find(s => s.id === stockId);
  if (!s?.ticker) return;
  const key = s.ticker.toUpperCase();
  delete stockPriceCache[key];
  delete stockPriceCache[normalizeTickerForGF(key)];
  await fetchStockPrice(s.ticker);
  renderAktieDetail(stockId);
}

// ── CRUD: Stocks ──────────────────────────────────────────────────────────────
function openNewAktieModal() {
  clearForm('na', ['title', 'isin', 'ticker']);
  fillForm('na', { currency: 'USD' });
  const res = document.getElementById('na-ticker-result');
  if (res) res.textContent = '—';
  openModal('new-aktie-modal');
}

async function testTickerFromNew() {
  const ticker = document.getElementById('na-ticker').value.trim().toUpperCase();
  const res    = document.getElementById('na-ticker-result');
  if (!ticker) { if (res) res.textContent = 'Kein Ticker'; return; }
  if (res) { res.textContent = 'Lädt…'; res.style.color = 'var(--text3)'; }
  delete stockPriceCache[ticker];
  const data = await fetchStockPrice(ticker);
  if (res) {
    if (data?.price) {
      res.textContent = `${fmtPrice(data.price)} ${data.currency}`;
      res.style.color = 'var(--green)';
      if (data.currency) {
        const sel = document.getElementById('na-currency');
        const opt = sel && [...sel.options].find(o => o.value.toUpperCase() === data.currency.toUpperCase());
        if (opt) sel.value = opt.value;
      }
    } else { res.textContent = 'Kein Kurs'; res.style.color = 'var(--red)'; }
  }
}

function saveNewAktie() {
  const f = readForm('na', ['title', 'isin', 'ticker', 'currency']);
  const title = f.title.trim();
  if (!title) { toast('Titel erforderlich', 'err'); return; }
  const s = { id: 'st_' + Date.now(), title, isin: f.isin.trim().toUpperCase(), ticker: f.ticker.trim().toUpperCase(), currency: f.currency };
  SDATA.stocks.push(s);
  sdataSave();
  if (!CFG.demo && (CFG.scriptUrl || CFG.sessionToken)) {
    apiAppend('Aktien', [[s.id, s.title, s.isin, s.ticker, s.currency, '', '', '', '']])
      .catch(e => toast('Aktie Sheet-Sync: ' + e.message, 'err'));
    // Fetch price for the new ticker and write it to the sheet
    if (s.ticker) syncKurseSheet([normalizeTickerForGF(s.ticker)]).then(() => writeKursesToAktienSheet());
  }
  closeModal('new-aktie-modal');
  toast('✓ Aktie hinzugefügt', 'ok');
  renderAktien();
}

function openEditAktieModal(stockId) {
  const s = SDATA.stocks.find(s => s.id === stockId);
  if (!s) return;
  fillForm('ea', { id: s.id, title: s.title || '', isin: s.isin || '', ticker: s.ticker || '', currency: s.currency || 'USD' });
  const res = document.getElementById('ea-ticker-result');
  if (res) { res.textContent = '—'; res.style.color = 'var(--text3)'; }
  openModal('edit-aktie-modal');
}

async function testTickerFromEdit() {
  const ticker = document.getElementById('ea-ticker').value.trim().toUpperCase();
  const res    = document.getElementById('ea-ticker-result');
  if (!ticker) { if (res) res.textContent = 'Kein Ticker'; return; }
  if (res) { res.textContent = 'Lädt…'; res.style.color = 'var(--text3)'; }
  delete stockPriceCache[ticker];
  const data = await fetchStockPrice(ticker);
  if (res) {
    if (data?.price) {
      res.textContent = `${fmtPrice(data.price)} ${data.currency}`;
      res.style.color = 'var(--green)';
      if (data.currency) {
        const sel = document.getElementById('ea-currency');
        const opt = sel && [...sel.options].find(o => o.value.toUpperCase() === data.currency.toUpperCase());
        if (opt) sel.value = opt.value;
      }
    } else { res.textContent = 'Kein Kurs'; res.style.color = 'var(--red)'; }
  }
}

function saveEditAktie() {
  const f = readForm('ea', ['id', 'title', 'isin', 'ticker', 'currency']);
  const title = f.title.trim();
  if (!title) { toast('Titel erforderlich', 'err'); return; }
  const s = SDATA.stocks.find(s => s.id === f.id);
  if (!s) { toast('Aktie nicht gefunden', 'err'); return; }
  const oldTicker = s.ticker;
  s.title = title; s.isin = f.isin.trim().toUpperCase(); s.ticker = f.ticker.trim().toUpperCase(); s.currency = f.currency;
  sdataSave();
  const tickerChanged = oldTicker !== s.ticker;
  if (tickerChanged && oldTicker) delete stockPriceCache[normalizeTickerForGF(oldTicker)];
  if (!CFG.demo && (CFG.scriptUrl || CFG.sessionToken)) {
    apiFindRow('Aktien', f.id).then(row => {
      if (row) apiUpdate(`Aktien!B${row}:E${row}`, [[s.title, s.isin, s.ticker, s.currency]]);
    }).catch(e => toast('Sheet-Sync: ' + e.message, 'err'));
    // If ticker changed, fetch fresh price for new ticker and write back to sheet
    if (tickerChanged && s.ticker)
      syncKurseSheet([normalizeTickerForGF(s.ticker)]).then(() => writeKursesToAktienSheet());
  }
  closeModal('edit-aktie-modal');
  toast('✓ Aktie aktualisiert', 'ok');
  document.getElementById('aktie-detail-title').textContent = s.title;
  renderAktieDetail(f.id);
  renderAktien();
}

function deleteAktie(stockId) {
  if (!confirm('Aktie und alle Trades löschen?')) return;
  if (!CFG.demo && (CFG.scriptUrl || CFG.sessionToken)) {
    apiFindRow('Aktien', stockId).then(row => { if (row) apiUpdate(`Aktien!F${row}:F${row}`, [['1']]); }).catch(() => {});
    SDATA.trades.filter(t => t.stockId === stockId).forEach(t => {
      apiFindRow('Trades', t.id).then(row => { if (row) apiUpdate(`Trades!J${row}:J${row}`, [['1']]); }).catch(() => {});
    });
  }
  SDATA.stocks = SDATA.stocks.filter(s => s.id !== stockId);
  SDATA.trades = SDATA.trades.filter(t => t.stockId !== stockId);
  sdataSave();
  closeAktieDetail();
  toast('✓ Aktie gelöscht', 'ok');
}

// ── CRUD: Trades ──────────────────────────────────────────────────────────────
function openTradeModal(type) {
  if (!currentAktieId) return;
  const s = SDATA.stocks.find(s => s.id === currentAktieId);
  fillForm('tm', { stockid: currentAktieId, type, date: today(), currency: s?.currency || 'USD' });
  clearForm('tm', ['qty', 'price', 'courtage']);
  fillForm('trade-modal', { $title: type === 'kauf' ? 'Kauf erfassen' : 'Verkauf erfassen' });
  fillForm('tm-total', { $display: '—' });
  openModal('trade-modal');
}

function updateTradeTotal() {
  const f       = readForm('tm', ['qty', 'price', 'courtage', 'currency', 'type']);
  const qty     = parseFloat(f.qty) || 0;
  const price   = parseFloat(f.price) || 0;
  const courtage= parseFloat(f.courtage) || 0;
  const total   = f.type === 'kauf' ? qty * price + courtage : qty * price - courtage;
  fillForm('tm-total', { $display: qty > 0 && price > 0 ? `${f.currency} ${fmtPrice(total)}` : '—' });
}

function saveTrade() {
  const f        = readForm('tm', ['stockid', 'type', 'date', 'qty', 'price', 'currency', 'courtage']);
  const qty      = parseFloat(f.qty);
  const price    = parseFloat(f.price);
  const courtage = parseFloat(f.courtage) || 0;
  if (!f.date)        { toast('Datum erforderlich', 'err'); return; }
  if (!qty || qty <= 0)   { toast('Anzahl erforderlich', 'err'); return; }
  if (!price || price <= 0) { toast('Preis erforderlich', 'err'); return; }
  const total = f.type === 'kauf' ? qty * price + courtage : qty * price - courtage;
  const tr    = { id: 'tr_' + Date.now(), stockId: f.stockid, type: f.type, date: f.date, qty, price, currency: f.currency, courtage, total };
  SDATA.trades.push(tr);
  sdataSave();
  if (!CFG.demo && (CFG.scriptUrl || CFG.sessionToken)) {
    apiAppend('Trades', [[tr.id, tr.stockId, tr.type, tr.date, tr.qty, tr.price, tr.currency, tr.courtage, tr.total, '']]).catch(e => toast('Trade Sheet-Sync: ' + e.message, 'err'));
  }
  closeModal('trade-modal');
  const pos = calcPosition(f.stockid);
  toast(f.type === 'verkauf' && pos.qty <= 0.0001 ? 'Vollständig verkauft → Historisch' : '✓ Trade gespeichert', 'ok');
  renderAktieDetail(f.stockid);
}

function deleteTrade(tradeId) {
  if (!confirm('Trade löschen?')) return;
  if (!CFG.demo && CFG.scriptUrl) {
    apiFindRow('Trades', tradeId).then(row => { if (row) apiUpdate(`Trades!J${row}:J${row}`, [['1']]); }).catch(() => {});
  }
  SDATA.trades = SDATA.trades.filter(t => t.id !== tradeId);
  sdataSave();
  renderAktieDetail(currentAktieId);
  toast('✓ Trade gelöscht', 'ok');
}

// ── Dashboard widget ──────────────────────────────────────────────────────────
function renderWidgetAktienDashboard() {
  const active   = SDATA.stocks.filter(s => calcPosition(s.id).qty > 0.0001);
  const total    = getGesamtPortfoliowert();
  const gv       = getGesamtGewinnVerlust();
  const todayChg = getPortfolioTodayChange();
  const posCount = active.length;
  if (!posCount) return `<div><div class="widget-title">Aktien-Dashboard</div><div class="t-muted">Keine aktiven Positionen.</div></div>`;
  const gvColor = gv.hasLive ? (gv.amt >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--text2)';
  const gvSign  = gv.amt >= 0 ? '+' : '';
  const tColor  = !todayChg.hasData ? 'var(--text2)' : todayChg.amt >= 0 ? 'var(--green)' : 'var(--red)';
  const tSign   = todayChg.amt >= 0 ? '+' : '';
  const tArrow  = !todayChg.hasData ? '' : todayChg.amt >= 0 ? ' ▲' : ' ▼';
  return `<div>
    <div class="widget-title mb-10">Aktien-Dashboard</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0">
      <div style="padding:8px 0;border-bottom:1px solid var(--border);padding-right:12px">
        <div class="t-label">Portfolio-Wert</div>
        <div style="font-family:'DM Mono',monospace;font-size:15px;font-weight:700;margin-top:2px">${curr()} ${fmtAmt(total)}</div>
      </div>
      <div style="padding:8px 0;border-bottom:1px solid var(--border);padding-left:12px;border-left:1px solid var(--border)">
        <div class="t-label">Heute</div>
        <div style="font-family:'DM Mono',monospace;font-size:15px;font-weight:700;margin-top:2px;color:${tColor}">${todayChg.hasData ? tSign + curr() + ' ' + fmtAmt(Math.abs(todayChg.amt)) + tArrow : '—'}</div>
      </div>
      <div style="padding:8px 0;padding-right:12px;margin-top:2px">
        <div class="t-label">Gesamt G/V</div>
        <div style="font-family:'DM Mono',monospace;font-size:15px;font-weight:700;margin-top:2px;color:${gvColor}">${gv.hasLive ? gvSign + curr() + ' ' + fmtAmt(Math.abs(gv.amt)) + ' (' + gvSign + gv.pct.toFixed(1) + '%)' : '—'}</div>
      </div>
      <div style="padding:8px 0;padding-left:12px;border-left:1px solid var(--border);margin-top:2px">
        <div class="t-label">Positionen</div>
        <div style="font-family:'DM Mono',monospace;font-size:15px;font-weight:700;margin-top:2px">${posCount} Aktie${posCount !== 1 ? 'n' : ''}</div>
      </div>
    </div>
  </div>`;
}
