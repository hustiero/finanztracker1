# FinanzTracker — Developer Notes

PWA split into three files — no build tools required.
Backend is a Google Apps Script (`CFG.url`).

---

## File Structure

| File | Contents | Lines |
|------|----------|-------|
| `index.html` | HTML structure only (setup, app shell, modals, templates) | ~1 450 |
| `style.css` | All CSS (tokens, layout, components, glassmorphism, utilities) | ~1 390 |
| `app.js` | All JavaScript (namespace, data, IO, rendering, UI) | ~7 300 |
| `manifest.json` | PWA manifest (standalone, portrait) | ~20 |

## Architecture

| Area | Location |
|------|----------|
| CSS tokens & reset | `style.css` lines ~1–60 |
| Layout & nav CSS | `style.css` lines ~61–150 |
| Component CSS | `style.css` lines ~151–1100 |
| Glassmorphism | `style.css` lines ~860–1100 |
| Utility classes | `style.css` lines ~1370–1390 |
| Setup/login screens | `index.html` `<div id="setup">` |
| Main app shell | `index.html` `<div id="app">` |
| Tab pages | `index.html` `<div id="tab-*" class="tab-page">` |
| Bottom nav | `index.html` `<nav id="nav">` |
| JS namespace | `app.js` `App.Data`, `App.IO`, `App.UI` |
| JS config & IDB | `app.js` `CFG`, `IDB`, `syncQueue` |
| JS form helpers | `app.js` `fillForm()`, `readForm()`, `clearForm()` |

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

## Daueraufträge (Recurring) — Auto-Materialization

Recurring definitions live in `DATA.recurring`. On every app load / `renderAll()`,
`autoMaterializeRecurrings()` converts all due occurrences (date ≤ today) into
real `DATA.expenses` entries (with `recurringId` set). These are synced to the
Google Sheet `Ausgaben` tab in one batch.

**Key rules:**
- Past/today occurrences are **real bookings** in `DATA.expenses` — they count
  everywhere (Verlauf, Dashboard, Lohnzyklus, etc.) like any manual expense.
- Future occurrences (date > today) remain **virtual** — generated on-the-fly
  by `getRecurringOccurrences(start, end, capToToday=false, skipMaterialized=true)`.
- `getRecurringOccurrences(..., skipMaterialized=true)` checks `DATA.expenses`
  for entries with matching `recurringId + date` and skips them to avoid
  double-counting.
- The central helper `getAusgaben(von, bis)` returns `DATA.expenses` entries
  plus any remaining virtual recurring occurrences (for future projections).
- Notifications for Daueraufträge are **informational** (`dauerauftrag_info`),
  not confirmation-based. No manual approval needed.

**Materialized entry fields:**
```javascript
{id, date, what, cat, amt, note, recurringId: <Dauerauftrag-ID>, isFixkosten: bool}
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
