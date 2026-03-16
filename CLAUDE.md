# FinanzTracker — Developer Notes

Single-file PWA (`index.html`). All CSS, HTML, and JS live in one file.
Backend is a Google Apps Script (`CFG.url`).

---

## Architecture

| Area | Location |
|------|----------|
| CSS tokens & reset | `<style>` lines ~18–73 |
| Layout & nav CSS | `<style>` lines ~74–140 |
| Component CSS | `<style>` lines ~141–1106 |
| Setup/login screens | `<div id="setup">` |
| Main app shell | `<div id="app">` |
| Tab pages | `<div id="tab-*" class="tab-page">` |
| Bottom nav | `<nav id="nav">` |
| JS | `<script>` at end of `<body>` |

---

## Tab Bar (Bottom Nav)

`#nav` is always `position:fixed; bottom:0` — on every device and display mode.
Safe-area inset is handled via `env(safe-area-inset-bottom)` so the bar
clears the iPhone home indicator when installed as a PWA.

Key CSS variables:
```css
--nav-h: 64px           /* tap-target height, excluding safe area */
--safe-bot: env(safe-area-inset-bottom, 0px)
```

`#content` has `padding-bottom: calc(var(--nav-h) + var(--safe-bot) + 16px)`
so scrollable content is never hidden behind the nav bar.

The FAB (floating action button) is positioned at
`bottom: calc(var(--safe-bot) + var(--nav-h) - 28px)` to sit half-overlapping
the nav bar, matching the screenshot design.

PWA manifest (`manifest.json`) declares `"display": "standalone"` and
`"orientation": "portrait"`. The viewport meta tag includes `viewport-fit=cover`.

---

## Kategorien Tab (`#tab-kategorien`)

Section order (top → bottom) reflects the dependency chain:

1. **Info text** — brief explanation
2. **Ausgaben-Kategorien** (`#cats-ausgabe`) — live list of expense categories
3. **Einnahmen-Kategorien** (`#cats-einnahme`) — live list of income categories
4. **Oberkategorien verwalten** (`#okt-ausgabe-list`, `#okt-einnahme-list`) —
   create/edit parent groups *before* assigning them to sub-categories
5. **Neue Kategorie** — add a sub-category; the "Überkategorie" dropdown
   (`#new-cat-parent`) is populated from the Oberkategorien above

> Oberkategorien **must** come before "Neue Kategorie" because a user needs
> to create a parent group before they can assign a child category to it.

---

## Settings Tab (`#tab-einstellungen`)

Section order:

1. **Account** (hidden unless account-mode) — logout, password change, admin link
2. **Verbindung** — Google Apps Script URL
3. **Profil** — display name for home greeting
4. **Profil-Sync** — push settings to Sheet or export/import JSON
5. **Darstellung** — currency, dark/light theme toggle
6. **Erscheinungsbild** — background presets, custom image, glassmorphism sliders
7. **Aktien** — enable stocks tab; include portfolio in annual savings rate
8. **Navigation** — info about pinning tabs to the bottom nav
9. **Benachrichtigungen** — notification settings
10. **Export** — Excel download
11. **App-Info** — version, reset button

---

## Config object (`CFG`)

Persisted to `localStorage` key `ft_cfg`. Key fields:

| Field | Purpose |
|-------|---------|
| `url` | Google Apps Script exec URL |
| `userName` | Display name |
| `currency` | e.g. `"CHF"` |
| `aktienEnabled` | Show stocks tab |
| `aktienInBilanz` | Include depot in savings rate |
| `darkMode` | Theme toggle |
| `glassEnabled` | Glassmorphism on/off |

---

## Daueraufträge (Recurring) in Verlauf / Ausgaben

Recurring entries (`DATA.recurring`) are **virtual** — they are never stored in
`DATA.expenses`. Instead `getRecurringInstances(startStr, endStr)` generates
synthetic entries on-the-fly for every interval that falls in the date range.
They carry `_type:'recurring'`.

**Every place that aggregates Ausgaben must include recurring:**

| Function | What it does | Fix applied |
|----------|-------------|-------------|
| `getKategorienMitEintraegen('ausgaben')` | L2 category tiles | ✅ merges `getRecurringInstances` before aggregation |
| `renderVerlaufL3()` | Category drilldown entries + stats | ✅ merges recurring for expense categories |
| `buildMonthlyBarData(kat, 'ausgaben')` | 12-month bar chart in L3 | ✅ merges recurring for ausgaben |
| `renderVerlaufL1()` | "Alle" chronological list | already correct (untouched) |

> **Rule:** whenever you query `DATA.expenses` for ausgaben aggregation, also
> call `getRecurringInstances(rangeStart, rangeEnd)` and merge the result.
> Do NOT add recurring to `DATA.expenses` directly.

The date range for the recurring fetch should match the verlauf filter:
```javascript
const {von, bis} = verlaufGetRange();
const rangeStart = von || dateStr(new Date(new Date().getFullYear(), new Date().getMonth()-11, 1));
const rangeEnd   = bis || today();
```

---

## Live Stock Prices (GOOGLEFINANCE)

**Do NOT call Yahoo Finance directly from the browser — CORS blocks it.**

The correct flow uses the Google Apps Script backend:
1. `syncKurseSheet(extraTickers=[])` writes tickers to the `Kurse` sheet,
   sets `=GOOGLEFINANCE(A_n,"price")` formulas, reads back the computed values,
   and populates `stockPriceCache[ticker]`.
2. `fetchStockPrice(ticker)` is the single entry point for callers. It:
   - Returns from `stockPriceCache` if fresh (< 5 min old)
   - Calls `syncKurseSheet([ticker])` to get the price via GOOGLEFINANCE
   - Falls back to Yahoo Finance direct only when no backend is configured
     (demo mode) — this will fail in browsers due to CORS but is kept as a
     last-resort for non-browser / proxy contexts.

**`syncKurseSheet(extraTickers=[])`** accepts an optional array of additional
tickers. This is used when testing a ticker in the "Neue Aktie" modal before
the stock is saved to `SDATA.stocks` (so it wouldn't be picked up by the
normal ticker loop).

GOOGLEFINANCE ticker format (per https://support.google.com/docs/answer/3093281):
- US stocks: `AAPL`, `MSFT` (exchange inferred)
- Explicit exchange: `NASDAQ:AAPL`, `NYSE:GS`
- Swiss stocks: `VTX:NESN`
- FX rates: `CURRENCY:USDCHF`

---

## Common Patterns

- **Tab navigation:** `goTab('home')` — updates `currentTab`, shows/hides `.tab-page` divs, updates `#nav` active state.
- **Saving config:** `cfgSave()` — writes `CFG` to localStorage; call after any mutation.
- **Syncing to Sheet:** `autoSyncProfile()` — debounced push of profile settings to the Google Sheet.
- **Re-render everything:** `renderAll()` — calls all render functions for the current view.
