# ₣ TRACKER — Entwickler-Wiki

> Vollständige Dokumentation aller Funktionen, Datenstrukturen und des System-Handlings.
> Stand: März 2026 · Branch `claude/stocks-settings-toggle-pOwg7`

---

## Inhaltsverzeichnis

1. [Architektur-Übersicht](#1-architektur-übersicht)
2. [Globale Zustandsvariablen](#2-globale-zustandsvariablen)
3. [Datenmodelle](#3-datenmodelle)
4. [API-Schicht / Google Sheets](#4-api-schicht--google-sheets)
5. [Authentifizierung](#5-authentifizierung)
6. [Datenpersistenz & Caching](#6-datenpersistenz--caching)
7. [Kern-Berechnungsfunktionen](#7-kern-berechnungsfunktionen)
8. [Daueraufträge (Recurring)](#8-daueraufträge-recurring)
9. [Widget-System](#9-widget-system)
10. [Tab-Render-Funktionen](#10-tab-render-funktionen)
11. [Modal-System & Dateneingabe](#11-modal-system--dateneingabe)
12. [Aktien-Modul](#12-aktien-modul)
13. [Navigation & UI-Helpers](#13-navigation--ui-helpers)
14. [Hilfsfunktionen](#14-hilfsfunktionen)
15. [Datenfluss-Übersicht](#15-datenfluss-übersicht)
16. [Aktien: Dashboard, Toggle & UX](#16-aktien-dashboard-toggle--ux)
17. [Verlauf: 3-Ebenen-Navigation](#17-verlauf-3-ebenen-navigation)
18. [Verlauf: Zeitraum-Filter](#18-verlauf-zeitraum-filter)
19. [Kategorie-Verwaltung: Oberkategorien](#19-kategorie-verwaltung-oberkategorien)
20. [Eingabe-Screen: 3-Tab-Switch & Aktien-Trade](#20-eingabe-screen-3-tab-switch--aktien-trade)
21. [Hintergrundbild & Glassmorphism](#21-hintergrundbild--glassmorphism)

---

## 1. Architektur-Übersicht

₣ TRACKER ist eine **Single-File HTML-Anwendung** — die gesamte App (HTML, CSS, JavaScript) befindet sich in einer einzigen `index.html`. Es gibt kein Build-System, keine externen Abhängigkeiten und keinen Backend-Server (ausser Google Apps Script).

```
index.html
├── <style>          CSS (CSS-Variablen für Dark/Light Theme)
├── <div id="app">   Gesamte App-UI (Tabs, Modals, Nav)
└── <script>         Alle JS-Module inline
    ├── Konfiguration & Zustand   (CFG, DATA, SDATA)
    ├── API-Schicht               (apiCall, apiGet, apiAppend …)
    ├── Datennormalisierung       (normalizeDate, normalizeAmt)
    ├── Berechnungen              (getZyklusInfo, avgDailyVarSpend …)
    ├── Daueraufträge             (getRecurringOccurrences, materialisiere…)
    ├── Widget-System             (WIDGET_CATALOG, renderWidgetContent …)
    ├── Tab-Renderer              (renderHome, renderLohn, renderMonat …)
    ├── Modals & Dateneingabe     (openEditModal, updateEntry …)
    ├── Aktien-Modul              (calcPosition, fetchStockPrice …)
    └── UI-Helpers & Navigation   (goTab, fmtAmt, today …)
```

### Betriebsmodi

| Modus | Beschreibung |
|-------|-------------|
| **Script-URL** | Einzel-Benutzer, öffentliches Google Sheet per Apps Script URL |
| **Account-Modus** | Mehrbenutzer, Authentifizierung via Admin-Server (JWT-Token) |
| **Demo-Modus** | Offline, alle Daten nur im localStorage |

---

## 2. Globale Zustandsvariablen

### `CFG` — Benutzer-Konfiguration

```javascript
let CFG = {
  scriptUrl:      '',     // Google Apps Script URL (Script-URL-Modus)
  adminUrl:       '',     // Admin-Server URL (Account-Modus)
  sessionToken:   '',     // Sitzungs-Token (Account-Modus)
  authUser:       '',     // Eingeloggter Benutzername
  authRole:       '',     // Rolle: 'user' | 'admin'
  demo:           false,  // Demo-Modus aktiv
  lohnTag:        25,     // Tag des Lohneingangs (1–28)
  sparziel:       0,      // Jahres-Sparziel (CHF)
  mSparziel:      0,      // Monats-Sparziel (CHF)
  pinnedTabs:     [],     // Angepinnte Tabs in der Navbar
  notifSettings:  {},     // Benachrichtigungs-Einstellungen
  homeWidgets:    null,   // Widget-Reihenfolge auf Home (null = Default)
  userName:       '',     // Anzeigename für Begrüssung
  fixkostenKats:  [],     // Kategorienamen, die als Fixkosten gelten
  aktienInBilanz: false,  // Depot-Wert in Jahres-Sparquote einrechnen
  widgetAktienPosId: '',  // Ausgewählte Aktie für Einzelposition-Widget
};
```

**Persistenz:** `cfgSave()` → `localStorage['ft_v4']` · `cfgLoad()` → liest aus localStorage

### `DATA` — Finanzdaten (aus Google Sheets)

```javascript
const DATA = {
  expenses:   [],  // Ausgaben-Einträge
  incomes:    [],  // Einnahmen-Einträge
  recurring:  [],  // Daueraufträge
  categories: [],  // Kategorien
};
```

### `SDATA` — Aktien-Daten (nur localStorage)

```javascript
let SDATA = {
  stocks: [],  // Aktien/Positionen
  trades: [],  // Käufe und Verkäufe
};
```

**Persistenz:** `sdataSave()` → `localStorage['ft_stocks_v1']` · `sdataLoad()` → liest aus localStorage

### UI-Zustandsvariablen

| Variable | Typ | Beschreibung |
|----------|-----|-------------|
| `currentTab` | `string` | Aktiver Tab (`'home'`, `'lohn'`, `'monat'`, `'dashboard'`, `'aktien'`) |
| `mvMonth` | `number` | Angezeigter Monat im Monats-Tab (0–11) |
| `mvYear` | `number` | Angezeigtes Jahr im Monats-Tab |
| `dashYear` | `number` | Angezeigtes Jahr im Jahresübersicht-Tab |
| `aktienView` | `string` | `'aktiv'` oder `'historisch'` |
| `aktienTabView` | `string` | `'karten'` / `'tabelle'` / `'charts'` |
| `homeKontoMonths` | `number` | Zeitraum für Kontostand-Widget (1/3/6/12) |
| `homeEditMode` | `boolean` | Widget-Bearbeitungsmodus auf Home |
| `stockPriceCache` | `object` | `{ticker: {price, currency, ts}}` — 5-Minuten-Cache |

---

## 3. Datenmodelle

### Ausgabe (`expenses[]`)

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `id` | `string` | Eindeutige ID (Prefix `'A'`) |
| `date` | `string` | `YYYY-MM-DD` |
| `what` | `string` | Bezeichnung |
| `cat` | `string` | Kategoriename |
| `amt` | `number` | Betrag (CHF) |
| `note` | `string` | Notiz (optional) |
| `recurringId` | `string` | Verknüpfung zum Dauerauftrag (wenn materialisiert) |
| `isFixkosten` | `boolean` | Als Fixkosten markiert |
| `excludeAvg` | `boolean` | Aus Ø-Tagesausgabe ausgeschlossen |

### Einnahme (`incomes[]`)

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `id` | `string` | Eindeutige ID (Prefix `'E'`) |
| `date` | `string` | `YYYY-MM-DD` |
| `what` | `string` | Bezeichnung |
| `cat` | `string` | Kategoriename |
| `amt` | `number` | Betrag (CHF) |
| `note` | `string` | Notiz |
| `isLohn` | `boolean` | Lohneingang (für Lohnzyklus-Berechnung) |

### Dauerauftrag (`recurring[]`)

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `id` | `string` | Eindeutige ID (Prefix `'D'`) |
| `what` | `string` | Bezeichnung |
| `cat` | `string` | Kategorie |
| `amt` | `number` | Betrag pro Vorkommen |
| `interval` | `string` | `'monatlich'` / `'wöchentlich'` / `'zweiwöchentlich'` / `'jährlich'` / `'quartalsweise'` |
| `day` | `number` | Tag des Monats (1–31) für monatlich; Wochentag für wöchentlich |
| `note` | `string` | Notiz |
| `active` | `boolean` | Aktiv/Inaktiv-Schalter |
| `startDate` | `string` | Erstes Vorkommen (`YYYY-MM-DD`) |
| `endDate` | `string` | Letztes Vorkommen (leer = unbegrenzt) |
| `affectsAvg` | `boolean` | **Kritisch:** `false` → wird als Fixkosten behandelt, aus Ø-Berechnung ausgeschlossen |

### Kategorie (`categories[]`)

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `id` | `string` | Eindeutige ID |
| `name` | `string` | Kategoriename |
| `type` | `string` | `'ausgabe'` oder `'einnahme'` |
| `color` | `string` | Hex-Farbe (`#RRGGBB`) |
| `sort` | `number` | Sortierreihenfolge |
| `parent` | `string` | Elternkategorie-Name (für Hierarchie) |

### Aktie (`stocks[]`)

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `id` | `string` | Eindeutige ID |
| `title` | `string` | Name der Aktie |
| `isin` | `string` | ISIN-Nummer |
| `ticker` | `string` | Börsensymbol (z. B. `'AAPL'`) |
| `currency` | `string` | `'CHF'` / `'EUR'` / `'USD'` / `'GBP'` / … |

### Trade (`trades[]`)

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `id` | `string` | Eindeutige ID |
| `stockId` | `string` | Verweis auf `stocks[].id` |
| `type` | `string` | `'kauf'` oder `'verkauf'` |
| `date` | `string` | `YYYY-MM-DD` |
| `qty` | `number` | Anzahl Anteile (auch Bruchteile) |
| `price` | `number` | Preis pro Anteil |
| `currency` | `string` | Handelswährung |
| `courtage` | `number` | Transaktionsgebühren |
| `total` | `number` | Gesamtbetrag (inkl. Gebühren) |

---

## 4. API-Schicht / Google Sheets

### Sheet-Struktur

| Sheet | Spalten | Beschreibung |
|-------|---------|-------------|
| `Ausgaben` | A: ID · B: Datum · C: Was · D: Kategorie · E: Betrag · F: Notiz · G: DauerauftragID · H: Fixkosten (1/0) | Ausgaben |
| `Einnahmen` | A: ID · B: Datum · C: Was · D: Kategorie · E: Betrag · F: Notiz · G: – · H: isLohn (1/0) | Einnahmen |
| `Daueraufträge` | A: ID · B: Was · C: Kategorie · D: Betrag · E: Intervall · F: Tag · G: Notiz · H: Aktiv · I: Start · J: Ende · K: affectsAvg | Wiederkehrende Ausgaben |
| `Kategorien` | A: ID · B: Name · C: Typ · D: Farbe · E: Sortierung · F: Eltern | Kategorien |
| `Aktien` | A: ID · B: Name · C: ISIN · D: Ticker · E: Währung | Aktien |
| `Trades` | A: ID · B: AktieID · C: Typ · D: Datum · E: Anzahl · F: Preis · G: Währung · H: Courtage · I: Total | Transaktionen |
| `Einstellungen` | A1: Key · B1: JSON | Profil-Sync |

### API-Funktionen

```javascript
apiCall(params)              // Basisfunktion — sendet GET/POST an Script- oder Admin-URL
apiGet(range)                // Liest Sheet-Bereich, z. B. 'Ausgaben!A2:H5000'
apiAppend(sheet, values)     // Fügt Zeilen ans Ende hinzu (2D-Array)
apiUpdate(range, values)     // Überschreibt Zellbereich
apiFindRow(sheet, id)        // Sucht Zeile anhand ID (Spalte A), gibt 1-Index zurück
apiGetMeta()                 // Gibt Sheet-Metadaten zurück (Liste aller Tabs)
```

**Antwortformat:**
```javascript
{ values: [[...], [...]], error: null }  // success
{ values: null, error: "Fehlermeldung" } // error
```

### Daten laden: `loadAll()`

1. **Cache-Prüfung** (`dataCacheLoad()`) — localStorage, TTL 5 Minuten
2. **Paralleler Fetch** aller Sheets via `Promise.allSettled()`
3. **Normalisierung** — `normalizeDate()`, `normalizeAmt()` für jeden Eintrag
4. **Fallback** — bei Netzwerkfehler werden gecachte Daten verwendet
5. **Cache-Update** (`dataCacheSave()`) nach erfolgreichem Load

### Live-Kurse: `fetchStockPrice(ticker)`

- Quelle: Yahoo Finance API (`query1.finance.yahoo.com/v8/finance/chart/`)
- Cache: 5 Minuten in `stockPriceCache[ticker]`
- Gibt zurück: `{ price: number, currency: string, ts: timestamp }`

---

## 5. Authentifizierung

### Script-URL-Modus (Einzel-Benutzer)

- Kein Login erforderlich
- Apps Script als Web App für alle zugänglich deployen
- URL in Einstellungen eintragen

### Account-Modus (Mehrbenutzer)

```javascript
doAuthLogin(user, password, adminUrl)
// → POST ?action=login&user=X&hash=SHA256(pw)
// → setzt CFG.sessionToken, authUser, authRole, adminUrl

doAuthSignup(user, password, passwordConfirm, adminUrl)
// → POST ?action=signup&user=X&hash=SHA256(pw)

doLogout()
// → POST ?action=logout&token=X (fire-and-forget)
// → löscht CFG-Felder, lädt Seite neu

doChangePw(newPassword)
// → POST ?action=change_pw&token=X&newHash=SHA256(pw)
```

**Session-Handling:**
- Token wird mit jeder API-Anfrage mitgesendet
- Antwort `'Sitzung abgelaufen'` → automatischer Re-Login-Dialog
- Token im localStorage gespeichert (via `cfgSave()`)

---

## 6. Datenpersistenz & Caching

| Funktion | Speichert | localStorage-Key |
|----------|-----------|-----------------|
| `cfgSave()` | CFG-Objekt | `'ft_v4'` |
| `cfgLoad()` | — | liest `'ft_v4'` |
| `sdataSave()` | SDATA (Aktien + Trades) | `'ft_stocks_v1'` |
| `sdataLoad()` | — | liest `'ft_stocks_v1'` |
| `dataCacheSave()` | DATA (Expenses/Incomes/…) | `'ft_data_cache'` |
| `dataCacheLoad()` | — | liest `'ft_data_cache'` (TTL 5 min) |

### Profil-Sync (geräteübergreifend)

```javascript
syncProfileToSheet()
// → schreibt Profil-JSON in Einstellungen!A1:B1
// → Felder: userName, theme, lohnTag, sparziel, mSparziel,
//           pinnedTabs, homeWidgets, notifSettings

loadProfileFromSheet()
// → liest Einstellungen!A1:B1
// → überschreibt CFG-Felder (ignoriert scriptUrl/sessionToken)

autoSyncProfile()
// → debounced 3s, silent update nach Einstellungsänderungen
```

**Export/Import:**
```javascript
exportProfileJSON()  // → Download als ft-profil.json
importProfileJSON()  // → File-Picker, mergt ins CFG
```

---

## 7. Kern-Berechnungsfunktionen

### `getCycleRange()`

Berechnet Start und Ende des aktuellen Lohnzyklus.

```
Rückgabe: { start: Date, end: Date, startStr: 'YYYY-MM-DD', endStr: 'YYYY-MM-DD' }
```

- Start: `CFG.lohnTag` des aktuellen (oder vorherigen) Monats
- Ende: `CFG.lohnTag - 1` des Folgemonats

### `getZyklusInfo()`

Vollständige Lohnzyklus-Berechnung. Wird von Lohn-Tab, Lohnzyklus-Widget und Sparquote-Widget verwendet.

```javascript
{
  start, end, startStr, endStr,  // Zyklus-Grenzen (Date + String)
  lohn,                          // Lohneingänge im Zyklus (isLohn=true)
  fixKosten,                     // Fixkosten im Zyklus
  prevCarryover,                 // Übertrag aus Vormonat
  mSparziel,                     // Monatliches Sparziel
  cycleDays,                     // Gesamttage im Zyklus
  daysElapsed,                   // Vergangene Tage
  daysLeft,                      // Verbleibende Tage
  varBudget,                     // Verfügbares Budget (lohn - fix - ziel + carryover)
  varSpent,                      // Bisherige variable Ausgaben
  varRemaining,                  // Verbleibendes Budget (negativ = überzogen)
  dailyRate,                     // CHF/Tag (varRemaining / daysLeft)
  hasSalary,                     // Boolean: Lohn erfasst?
  progQuota,                     // Zyklusfortschritt 0.0–1.0
}
```

**Fixkosten-Logik:** Ein Eintrag gilt als Fixkosten wenn:
1. `e.isFixkosten === true` (Flag am Eintrag), ODER
2. `CFG.fixkostenKats.includes(e.cat)` (Kategorie als Fixkosten markiert), ODER
3. `recurringId` verweist auf Dauerauftrag mit `affectsAvg = false`

### `isFixkostenEntry(e)`

Zentrale Funktion zur Fixkosten-Prüfung — verwendet obige drei Kriterien.

### `avgDailyVarSpend(mo, yr, daysElapsed)`

Durchschnittliche tägliche variable Ausgaben für einen Monat.

```
= Summe(variable Ausgaben im Monat) / daysElapsed
```

- Schließt Fixkosten und `excludeAvg=true`-Einträge aus
- Inkludiert variable Daueraufträge (affectsAvg = true)

### `avgDailyVarSpendYear(yr)`

Jahres-Durchschnitt der täglichen variablen Ausgaben.

- Aktuelles Jahr: Tage bis heute
- Vergangene Jahre: alle 365/366 Tage

### `avgDailyVarSpendPrevComp(mo, yr)`

Gibt Vergleichswert zum Vormonat zurück: `{ avg, prevMo }` — für Ø-Tagesausgabe-Delta-Anzeige.

### `buildTagesavgCard(mo, yr)`

Gemeinsamer Render-Helper für Ø-Tagesausgabe. Wird verwendet von:
- `renderWidgetTagesavg()`
- `renderWidgetMonatSummary(mo, yr)` (intern)

```
Rückgabe: HTML-String mit .stats-grid / .stat-card Struktur
```

### `getAusgaben(von, bis, kategorien, inclDauerauftraege)`

Zentrale Abfragefunktion für Ausgaben.

```javascript
getAusgaben('2025-01-01', '2025-01-31')
// → [...DATA.expenses im Zeitraum, ...virtuelle Dauerauftrag-Einträge]
```

### `getEinnahmen(von, bis)`

Einnahmen im Zeitraum.

### `getNetto(von, bis)`

Einnahmen minus Ausgaben im Zeitraum.

### `getFixkosten(von, bis)`

Nur Fixkosten-Einträge im Zeitraum (via `isFixkostenEntry()`).

### `buildBalanceChart(months)`

Erstellt SVG-Liniendiagramm des kumulativen Kontostands.

- Verwendet `getNetto()` pro Monat (kumuliert)
- Gibt `<svg>` HTML-String zurück
- Geteilt von `renderWidgetKontostand()` und Jahresübersicht-Tab

---

## 8. Daueraufträge (Recurring)

### Expansion: `getRecurringOccurrences(startStr, endStr)`

Expandiert alle aktiven Daueraufträge in einem Zeitraum zu virtuellen Ausgaben-Objekten.

```javascript
// Rückgabe: Array von synthetischen Ausgaben-Objekten
{
  id: 'recurId_r_2025-01-25',  // Pseudo-ID
  _recurId: 'D001',             // Verweis auf Dauerauftrag
  date: '2025-01-25',
  what: 'Miete',
  cat: 'Wohnen',
  amt: 1500,
  isFixkosten: true,            // = !r.affectsAvg
  isRecurring: true,            // Marker
}
```

**Unterstützte Intervalle:**

| Intervall | Vorkommen |
|-----------|-----------|
| `monatlich` | Jeden Monat am konfigurierten Tag |
| `wöchentlich` | Jeden konfigurierten Wochentag |
| `zweiwöchentlich` | Alle 2 Wochen |
| `jährlich` | Einmal pro Jahr |
| `quartalsweise` | Alle 3 Monate |

Alle Vorkommen werden auf `today()` gekappt — nur bereits fällige Termine erscheinen.

### Virtualisierung: `getRecurringInstances(startStr, endStr)`

Wie `getRecurringOccurrences()`, filtert aber bereits materialisierte Einträge aus (`DATA.expenses.some(e => e.recurringId === r._recurId && e.date === date)`).

Wird in:
- `renderMonat()` — aktueller Monat
- `buildDayGroup()` — für "DA"-Badge-Anzeige

### Materialisierung: `materialisiereDauerauftrag(recurId, date, amt, what, cat, note)`

Erstellt einen echten `DATA.expenses`-Eintrag aus einem virtuellen Dauerauftrag-Vorkommen.

```
1. Duplikat-Prüfung: DATA.expenses.some(e => e.recurringId === recurId && e.date === date)
2. Erstellt Eintrag mit genId('A'), recurringId-Verknüpfung, isFixkosten-Flag
3. Fügt zu DATA.expenses hinzu
4. Sync: apiAppend('Ausgaben', [[id, date, what, cat, amt, note, recurId, isFixk?'1':'0']])
5. Re-render
```

**Aufruf via UI:** Klick auf virtuelle Dauerauftrag-Zeile im Monats-Tab → `openMaterializeModal()` → Benutzer bestätigt/editiert → `updateEntry()` → `materialisiereDauerauftrag()`

### Auto-Materialisierung: `materialisiereDauerauftraege(mo, yr)`

Für vergangene Monate (nicht aktueller Monat): Materialisiert automatisch alle überfälligen Daueraufträge beim ersten Aufruf des Monats-Tabs.

### Fixkosten-Kategorien: `toggleFixkostenKat(cat)`

Fügt Kategorie zu `CFG.fixkostenKats` hinzu oder entfernt sie. Aktualisiert CFG, speichert, re-rendert.

---

## 9. Widget-System

### Widget-Katalog

```javascript
const WIDGET_CATALOG = [
  { key, label, sub }  // sub = Kurzbeschreibung für Widget-Auswahl
];
```

| Key | Label | Daten-Zeitraum |
|-----|-------|---------------|
| `greeting` | Begrüssung | Heute |
| `lohnzyklus` | Lohnzyklus | Aktueller Lohnzyklus |
| `tagesavg` | Ø Tagesausgaben | Laufender Monat |
| `topKategorien` | Top Kategorien (Zyklus) | Aktueller Lohnzyklus |
| `monatsverlauf` | Monatsverlauf (6 Mo.) | Letzte 6 Monate |
| `heuteAusgaben` | Heutige Ausgaben | Heute |
| `sparquote` | Zyklus-Sparquote | Aktueller Lohnzyklus |
| `monatSummary` | Monats-Zusammenfassung | Aktueller Monat |
| `monatKategorien` | Monats-Kategorien | Aktueller Monat |
| `kontostand` | Kontostand-Verlauf | 1/3/6/12 Monate (konfigurierbar) |
| `jahresSparquote` | Jahres-Sparquote | Laufendes Jahr |
| `jahresKategorien` | Jahres-Kategorien | Laufendes Jahr |
| `monatsverlaufJahr` | Monatsverlauf Jahr | Laufendes Jahr |
| `aktienPortfolio` | Aktienportfolio | Aktuell |
| `aktienWert` | Portfolio-Wert | Aktuell |
| `aktienPnl` | Depot Gewinn/Verlust | Aktuell |
| `aktienTop` | Top-Performer | Aktuell |
| `aktienVerteilung` | Portfolio-Verteilung | Aktuell |
| `aktienPosition` | Einzelposition | Konfigurierbar |

**Standard-Widgets:** `['greeting', 'heuteAusgaben', 'lohnzyklus', 'topKategorien', 'tagesavg']`

### Widget-Dispatcher

```javascript
function renderWidgetContent(key) {
  switch(key) {
    case 'greeting':          return renderWidgetGreeting();
    case 'lohnzyklus':        return renderWidgetLohnzyklus();
    case 'monatSummary':      return renderWidgetMonatSummary();     // (mo, yr)
    case 'monatKategorien':   return renderWidgetMonatKategorien();  // (mo, yr, limit)
    case 'jahresSparquote':   return renderWidgetJahresSparquote();  // (yr)
    case 'jahresKategorien':  return renderWidgetJahresKategorien(); // (yr)
    case 'monatsverlaufJahr': return renderWidgetMonatsverlaufJahr();// (yr)
    // ... weitere
  }
}
```

### Widget-Funktionen (alle)

#### Allgemein

| Funktion | Zeigt |
|----------|-------|
| `renderWidgetGreeting()` | Zeitbasierte Begrüssung + Datum |
| `renderWidgetLohnzyklus()` | Budget, Ausgaben, Tagesrate, Fortschrittsbalken |
| `renderWidgetTagesavg()` | Ø CHF/Tag (via `buildTagesavgCard`) |
| `renderWidgetHeuteAusgaben()` | Heutige Buchungen + Budget-Vergleich |
| `renderWidgetSparquote()` | Sparquote im Lohnzyklus (%, CHF, Fortschrittsbalken) |
| `renderWidgetTopKategorien()` | Top 5 Kategorien im Lohnzyklus (horizontale Balken) |
| `renderWidgetMonatverlauf()` | Ausgaben-Balken letzte 6 Monate |

#### Parametrisiert — Home und Reiter teilen denselben Code

| Funktion | Parameter | Verwendet in |
|----------|-----------|-------------|
| `renderWidgetMonatSummary(mo, yr)` | Optional: Monat + Jahr | Home-Widget + `renderMonat()` |
| `renderWidgetMonatKategorien(mo, yr, limit=5)` | Optional: Monat, Jahr, Anzahl | Home-Widget + `renderMonat()` (8 Kategorien) |
| `renderWidgetJahresSparquote(yr)` | Optional: Jahr | Home-Widget + `renderDashboard()` |
| `renderWidgetJahresKategorien(yr)` | Optional: Jahr | Home-Widget + `renderDashboard()` |
| `renderWidgetMonatsverlaufJahr(yr)` | Optional: Jahr | Home-Widget + `renderDashboard()` |

> **Prinzip:** Jede Kennzahl existiert genau einmal im Code. Reiter rufen die Widget-Funktionen mit Parametern auf.

#### Aktien-Widgets

| Funktion | Zeigt |
|----------|-------|
| `renderWidgetAktienPortfolio()` | Alle aktiven Positionen mit P&L |
| `renderWidgetAktienWert()` | Gesamtwert Depot (prominente Zahl) |
| `renderWidgetAktienPnl()` | Gesamt-P&L in CHF und % |
| `renderWidgetAktienTop()` | Aktie mit höchstem prozentualen Gewinn |
| `renderWidgetAktienVerteilung()` | SVG-Tortendiagramm: Portfolio-Gewichtung |
| `renderWidgetAktienPosition()` | Detailansicht einer Aktie (via `CFG.widgetAktienPosId`) |

### Home-Widget-Verwaltung

```javascript
getHomeWidgets()
// → CFG.homeWidgets || DEFAULT_HOME_WIDGETS

renderHome()
// 1. getHomeWidgets() → Widget-Liste
// 2. Für jedes Widget: renderWidgetContent(key) → HTML
// 3. Edit-Modus: Auf/Ab-Buttons, Löschen-Button, Widget-Katalog unten
```

**Edit-Modus aktivieren:** Stift-Button auf Home → `homeEditMode = true` → `renderHome()`

**Widget hinzufügen:** Klick auf Widget im Katalog → `addHomeWidget(key)` → `cfgSave()` → `renderHome()`

**Widget entfernen:** Löschen-Button → `removeHomeWidget(key)` → `cfgSave()` → `renderHome()`

**Reihenfolge:** Auf/Ab-Pfeile → `moveHomeWidget(key, dir)` → `cfgSave()` → `renderHome()`

---

## 10. Tab-Render-Funktionen

### `renderHome()`

Rendert den Home-Tab mit aktiven Widgets. Jedes Widget wird in einem `.card`-Container angezeigt.

### `renderLohn()`

**Lohn-Tab** — Salary-Cycle-Management:

1. **Zyklus-Karte:** Datum, Lohn, Fixkosten, Übertrag, Sparziel, Budget, Ausgaben, Restbudget, Tagesrate, Fortschrittsbalken
2. **Lohn-Chart:** SVG-Balkendiagramm der monatlichen Einnahmen (1/3/6/12 Monate)
3. **Transaktionsliste:** Alle Buchungen im Zyklus mit Lohn/Fix-Badges, Fixkosten-Toggle
4. **Fixkosten-Kategorien:** Automatisch (aus Daueraufträgen) + manuell (via Toggle)

### `renderMonat()`

**Monats-Tab** — detaillierte Monatsansicht:

1. **Navigation:** Vor/Zurück-Pfeile für Monat/Jahr
2. **Monats-Zusammenfassung:** `renderWidgetMonatSummary(mo, yr)` — 3-Stat-Grid + Ø-Tagesausgabe
3. **Heute/Woche** (nur aktueller Monat): Ausgaben heute + diese Woche
4. **Kategorien:** `renderWidgetMonatKategorien(mo, yr, 8)` — Top 8 mit Parent-Rollup
5. **Tagesgruppen:** Chronologisch absteigend, via `buildDayGroup()` — inkl. virtueller Daueraufträge mit "DA"-Badge
6. **Auto-Materialisierung:** Vergangene Monate → `materialisiereDauerauftraege(mo, yr)`

### `renderDashboard()`

**Jahresübersicht-Tab:**

1. **Jahres-Navigation:** Vor/Zurück durch gebuchte Jahre
2. **Heute/Woche** (nur aktuelles Jahr)
3. **Kontostand-Verlauf:** SVG-Liniendiagramm (1/3/6/12 Monate)
4. **Ø Tagesausgabe:** Jahres-Durchschnitt mit Vorjahres-Vergleich
5. **Lohn % Einnahmen:** Anteil Lohn an Gesamteinnahmen
6. **Jahres-Sparquote:** `renderWidgetJahresSparquote(dashYear)`
7. **Top Kategorien:** `renderWidgetJahresKategorien(dashYear)`
8. **Monatsverlauf:** `renderWidgetMonatsverlaufJahr(dashYear)`

### `renderAktien()` (async)

**Aktien-Tab** — 3 Ansichten:

| Ansicht | Inhalt |
|---------|--------|
| **Karten** | Aktien-Cards mit Position, P&L, Live-Kurs |
| **Tabelle** | HTML-Tabelle: Ticker, Anzahl, Ø-Kaufpreis, Live, +/- %, Wert |
| **Charts** | SVG-Torte (Gewichtung) + SVG-Balken (Kaufpreis vs. Live) + SVG-Linie (investiertes Kapital) |

**Ablauf:**
1. `calcPosition()` für alle Aktien
2. Filter: aktive (qty > 0) vs. historisch
3. Synchrones Rendering der aktuellen Ansicht
4. Asynchrones Fetch aller Live-Kurse (`fetchStockPrice`)
5. Re-Rendering nach Kurs-Update

---

## 11. Modal-System & Dateneingabe

### Eingabe-Modal (`#edit-modal`)

Wird für Neue Einträge, Bearbeiten und Dauerauftrag-Buchungen verwendet.

```javascript
openNewEntry(type)
// → leert Formular, setzt type ('expense'|'income'), öffnet Modal

openEditModal(id, type)
// → füllt Formular mit bestehendem Eintrag, öffnet Modal

openMaterializeModal(recurId, date)
// → prüft ob bereits materialisiert
// → wenn ja: openEditModal() des vorhandenen Eintrags
// → wenn nein: Formular mit Dauerauftrag-Daten vorausfüllen
//              Modal-Titel: 'Dauerauftrag buchen'
//              dataset.recurringId setzen

closeModal(id)
// → entfernt 'show'-Klasse vom Modal-Element
```

### `updateEntry()`

Zentrale Speicher-Funktion. Liest Formular-Daten und führt eine von drei Aktionen aus:

```
1. Neuer Eintrag aus Dauerauftrag:
   → dataset.recurringId vorhanden + keine ID
   → materialisiereDauerauftrag(recurId, date, amt, what, cat, note)

2. Neuer Standalone-Eintrag:
   → keine ID im Formular
   → genId() + DATA.expenses/incomes.push() + apiAppend()

3. Bestehenden Eintrag bearbeiten:
   → ID vorhanden
   → Eintrag in DATA-Array aktualisieren + apiUpdate()
```

Nach Speichern: Toast-Meldung anzeigen → Modal schliessen → `renderAll()`

### `deleteEntry(id, type)`

Löscht Eintrag aus DATA-Array und sendet Lösch-Flag ans Sheet (setzt Feld auf `'DELETE'`).

### `buildDayGroup(ds, dExp, dInc, dRec)`

Render-Helper für eine Tagesgruppe in Monats- und Verlaufs-Ansicht.

- `ds`: Datum-String
- `dExp`: Ausgaben des Tages
- `dInc`: Einnahmen des Tages
- `dRec`: Virtuelle Dauerauftrag-Vorkommen des Tages

Virtuelle Daueraufträge erscheinen mit ↻-Icon, "DA"-Badge, Transparenz 65% und rufen `openMaterializeModal()` auf Klick auf.

---

## 12. Aktien-Modul

### Positions-Berechnung

```javascript
calcPosition(stockId)
// → iteriert alle Trades chronologisch
// Kauf: qty += trade.qty; totalCost += trade.qty * trade.price + courtage
// Verkauf: qty -= trade.qty; totalCost -= anteiliger Einstandspreis
// Rückgabe: { qty, totalCost, avgPrice }

getDurchschnittsPreis(stockId)
// → calcPosition(stockId).avgPrice

getAktuellerKurs(ticker)
// → stockPriceCache[ticker]?.price ?? null

getPositionsWert(stockId)
// → qty × livePrice (falls verfügbar), sonst totalCost

getGesamtPortfoliowert()
// → Summe getPositionsWert() aller Aktien

getGewinnVerlust(stockId)
// → { amt: (live - avg) * qty, pct: (live/avg - 1) * 100, hasLive: boolean }

getGesamtGewinnVerlust()
// → Gesamt-P&L aller Positionen mit Live-Kurs
```

### Charts (SVG, inline)

| Funktion | Diagramm-Typ |
|----------|-------------|
| `buildPortfolioPieChart(stocks)` | SVG-Torte: Gewichtung nach Positionswert |
| `buildPreisVergleichChart(stocks)` | SVG-Balken: Ø-Kaufpreis vs. Live-Kurs |
| `buildPortfolioVerlauf()` | SVG-Linie/Fläche: kumuliertes investiertes Kapital |

### Farb-Palette

```javascript
const AKTIE_PALETTE = [
  '#6dd5fa','#f7971e','#a18cd1','#fd7f6f',
  '#b8e994','#f9ca24','#6c5ce7','#fd79a8','#00cec9','#e17055'
];
function aktieColor(stockId)  // → Farbe basierend auf Index in SDATA.stocks
```

---

## 13. Navigation & UI-Helpers

### Tab-Navigation

```javascript
goTab(tab)
// → setzt currentTab
// → blendet anderen Tab aus, zeigt neuen ein
// → ruft render-Funktion des Tabs auf
// Sonderfall: Home in Edit-Modus → Edit-Modus deaktivieren statt navigieren

setAktienView(v)      // 'aktiv' | 'historisch' → renderAktien()
setAktienTabView(v)   // 'karten' | 'tabelle' | 'charts' → renderAktien()
```

### Monats-Navigation

```javascript
prevMvMonth()   // mvMonth--, Jahres-Wrap, renderMonat()
nextMvMonth()   // mvMonth++, Jahres-Wrap, renderMonat() (max: aktueller Monat)
openMonthViewAt(mo, yr)  // setzt mvMonth+mvYear, öffnet Monat-Ansicht
```

### Toast-Benachrichtigungen

```javascript
showToast(message, type='success')
// → z-index: 650 (über FAB-Button)
// → Auto-Hide nach 2.5 Sekunden
// → Typen: 'success' (grün), 'error' (rot)
```

**Achtung:** FAB/Plus-Button hat `z-index: 650` — Toast liegt darüber damit er sichtbar bleibt.

### Theme

```javascript
toggleThemeSwitch()
// → wechselt document.documentElement.dataset.theme zwischen '' und 'light'
// → speichert in CFG.theme via cfgSave()
```

### Kontostand-Chart-Periode

```javascript
setHomeKontoMonths(m)      // m ∈ {1,3,6,12} → renderHome()
setDashboardMonths(m)      // m ∈ {1,3,6,12} → renderDashboard()
```

---

## 14. Hilfsfunktionen

### ID-Generierung

```javascript
genId(prefix)
// → prefix + (Date.now().toString(36) + random).toUpperCase()
// → z.B. 'A2P4KJX9E'
```

### Datum-Funktionen

```javascript
today()            // → 'YYYY-MM-DD' (aktuelles Datum)
dateStr(date)      // → 'YYYY-MM-DD' aus Date-Objekt
fmtDate(s)         // → '3. Dez 2024' (deutsches Format)
normalizeDate(s)   // → 'YYYY-MM-DD' aus beliebigem Format
                   //   Unterstützt: Sheets-Seriennummer, ISO, DD.MM.YYYY, DD/MM/YYYY
```

### Betrag-Funktionen

```javascript
fmtAmt(n)          // → '1'234.50' (Schweizer Format)
normalizeAmt(s)    // → Number aus beliebigem Format
                   //   Unterstützt: 1'234.50, 1.234,50, 1234.50
fmtPrice(n)        // → für Aktienpreise (mehr Nachkommastellen)
fmtQty(n)          // → Anzahl Aktien-Anteile
```

### Kategorie-Helpers

```javascript
catColor(cat)      // → Hex-Farbe der Kategorie (aus DATA.categories)
catEmoji(cat)      // → Emoji der Kategorie (falls definiert)
parentOf(cat)      // → Elternkategorie-Name (aus DATA.categories)
esc(s)             // → HTML-escaped String (XSS-Schutz)
```

### Jahr-Navigation

```javascript
getBookedYears()   // → Array aller Jahre mit Buchungen (aus DATA.expenses + DATA.incomes)
prevDashYear()     // → dashYear--, renderDashboard()
nextDashYear()     // → dashYear++, renderDashboard()
```

---

## 15. Datenfluss-Übersicht

### App-Start

```
index.html laden
  → cfgLoad()           // CFG aus localStorage
  → sdataLoad()         // Aktien-Daten aus localStorage
  → launchApp()
      → CFG.scriptUrl?  → loadAll() → renderAll()
      → CFG.demo?       → Demo-Daten laden → renderAll()
      → sonst           → Setup-Screen zeigen
```

### Neuer Eintrag (Ausgabe)

```
Plus-Button → openNewEntry('expense')
  → Formular ausfüllen
  → updateEntry()
      → genId('A') + DATA.expenses.push()
      → apiAppend('Ausgaben', [[id, date, what, cat, amt, note, '', isFixk]])
      → showToast('Gespeichert')
      → renderAll()
```

### Dauerauftrag wird fällig

```
renderMonat() [aktueller Monat]
  → getRecurringInstances(s, e)          // virtuelle Einträge
  → buildDayGroup(ds, ..., mRecVirtual)  // DA-Badge anzeigen

  Benutzer klickt DA-Eintrag
  → openMaterializeModal(recurId, date)
  → Formular bestätigen/editieren
  → updateEntry()
      → materialisiereDauerauftrag(recurId, date, ...)
          → DATA.expenses.push() + apiAppend()
```

### Vergangener Monat wird geöffnet

```
renderMonat() [vergangener Monat]
  → materialisiereDauerauftraege(mo, yr)  // Auto-Materialisierung aller fälligen DA
  → Alle Buchungen bereits als echte Einträge → kein DA-Badge
```

### Aktien Live-Kurs

```
renderAktien()
  → calcPosition() für alle Stocks [synchron]
  → Initiales Rendering mit gecachten/keinen Kursen
  → fetchStockPrice(ticker) für jede Aktie [async, parallel]
  → stockPriceCache[ticker] = { price, currency, ts }
  → Re-Rendering der aktiven Ansicht mit aktuellen Kursen
```

### Widget aus Reiter referenziert

```
renderDashboard()
  → renderWidgetJahresSparquote(dashYear)  // gleiche Funktion wie Home-Widget
  → renderWidgetJahresKategorien(dashYear)
  → renderWidgetMonatsverlaufJahr(dashYear)

renderMonat()
  → renderWidgetMonatSummary(mo, yr)      // inkl. buildTagesavgCard()
  → renderWidgetMonatKategorien(mo, yr, 8)
```

---

## 16. Dateneingabe & Bearbeitung

### Neuer Eintrag speichern

```javascript
setType(t)
// → wechselt zwischen 'ausgabe' und 'einnahme'
// → blendet relevante Felder ein/aus (Dauerauftrag-Toggle für Ausgabe, Lohn-Toggle für Einnahme)

saveEntryOrRecurring()
// → Router: bei recurringMode + Ausgabe → saveRecurring()
// → sonst → saveEntry()

saveEntry()
// → erstellt Eintrag in DATA.expenses/incomes
// → setzt isLohn-Flag wenn lohnMode aktiv
// → apiAppend('Ausgaben'|'Einnahmen', [...]) — async
// → renderAll()
```

### Dauerauftrag anlegen/bearbeiten

```javascript
saveRecurring(prefix)
// → liest Formularfelder mit Prefix (FAB-Form oder Dauerauftrag-Tab)
// → erstellt {id, what, cat, amt, interval, day, note, active, start, endDate, affectsAvg}
// → apiAppend('Daueraufträge', [...])

openRecModal(id)
// → füllt Bearbeitungs-Modal mit bestehendem Dauerauftrag

updateRecurring()
// → aktualisiert DATA.recurring-Eintrag + Sheet

deleteRecurring()
// → Soft-Delete: setzt active = false im Sheet
```

### Kategorien verwalten

```javascript
addCategory()
// → auto-vergibt Farbe aus PRESET_COLORS-Palette
// → apiAppend('Kategorien', [...])

openCatModal(id)
// → füllt Modal (inkl. Farb-Grid, Eltern-Dropdown)

selectColor(el, color)
// → aktualisiert Farbauswahl im Modal

updateCategory()
// → aktualisiert Kategorie in DATA.categories
// → updated ALLE Einträge (expenses/incomes/recurring) die alten Namen tragen
// → Sheet-Sync

deleteCategory()
// → verhindert Löschen wenn Kategorie in Verwendung
```

### Eintrag löschen

```javascript
deleteEntry()
// → Soft-Delete: setzt Spalte G auf '1' im Sheet
// → entfernt aus lokalem DATA-Array
// → Rollback bei Netzwerkfehler
```

---

## 17. Verlauf-Tab

### `renderVerlauf()`

Transaktionsliste mit Filter- und Suchfunktion.

**Aufbau:**
1. **Filter-Chips:** Alle / Ausgaben / Einnahmen / + alle Kategorien
2. **Kategorie-Balkendiagramm** (30 Tage, optional)
3. **Kombinierte Liste:** Manuelle Einträge + virtuelle Daueraufträge (12 Monate Rückblick)
4. **Datumsgruppen:** chronologisch absteigend via `buildDayGroup()`
5. **Virtuelle Daueraufträge:** mit ↻-Icon, gedämpfte Deckkraft
6. **Suche:** nur sichtbar im Alle-Filter

**State-Variablen:**

| Variable | Beschreibung |
|----------|-------------|
| `verlaufFilter` | Aktiver Filter (`'alle'` / `'ausgaben'` / `'einnahmen'` / Kategoriename) |
| `verlaufSearch` | Suchtext |
| `verlaufChartMonths` | Zeitraum für Kategorie-Chart |

```javascript
setVerlaufFilter(f)   // → verlaufFilter = f → renderVerlauf()
```

---

## 18. Kategorien-Tab

### `renderCategories()`

Kategorien-Verwaltung UI.

- Getrennt nach Typ (Ausgabe / Einnahme)
- Elternkategorien zuerst, Kindkategorien eingerückt
- Zeigt Verwendungsanzahl pro Kategorie
- Klick öffnet Bearbeitungs-Modal (`openCatModal(id)`)

---

## 19. Benachrichtigungs-System

### Benachrichtigungs-Typen (`NOTIF_TYPES`)

| Key | Beschreibung | Standard |
|-----|-------------|---------|
| `dailyReport` | Tägliche Ausgaben-Zusammenfassung | Ein |
| `overspend` | Budget überschritten | Ein |
| `monthEnd` | Monatsbericht am 1. des Folgemonats | Ein |
| `cycleStart` | Lohnzyklus gestartet | Ein |
| `budgetWarning` | 80% des Budgets aufgebraucht | Ein |
| `bigExpense` | Ausgabe über CHF 200 Schwellenwert | Aus |
| `weeklyReport` | Sonntags-Rückblick | Aus |

### Benachrichtigungs-Objekt

```javascript
{
  id: string,           // Eindeutiger Key
  type: string,         // Typ aus NOTIF_TYPES
  date: string,         // YYYY-MM-DD
  title: string,
  body: string,
  dismissed: boolean,
  confirmed: boolean,
  recurId?: string,     // Für Dauerauftrag-Benachrichtigungen
}
```

### Funktionen

```javascript
checkDueRecurrings()
// → Erstellt Benachrichtigung wenn Dauerauftrag fällig (r.day === heutiger Tag)

checkAllNotifications()
// → Führt alle Prüfungen aus: daily, overspend, monthEnd,
//   cycleStart, budgetWarning, bigExpense, weeklyReport

notifOn(key)
// → Prüft ob Benachrichtigungs-Typ aktiv (respektiert Defaults)

updateNotifBadge()
// → Aktualisiert Zähler-Badge in der Navbar

renderNotifications()
// → Zeigt Benachrichtigungs-Liste im Overlay

renderNotifSettings()
// → Einstellungs-UI mit Ein/Aus-Schaltern pro Typ

toggleNotifSetting(key)
// → Typ aktivieren/deaktivieren → CFG.notifSettings speichern
```

---

## 20. Tab-Pinning / Mehr-Menü

### Pinbare Tabs (`PINNABLE_TABS`)

Alle Tabs können in die untere Navigationsleiste gepinnt werden (max. 2 Slots neben Home).

```javascript
// Verfügbare Tabs:
['eingabe', 'verlauf', 'lohn', 'monat', 'dashboard', 'aktien', 'kategorien', 'dauerauftraege', 'einstellungen', 'admin']
```

### Funktionen

```javascript
openMenuOverlay()        // → öffnet Mehr-Menü
closeMenuOverlay()       // → schliesst Mehr-Menü
toggleMenuEditMode()     // → wechselt zwischen Normal-Ansicht und Pin-Verwaltung

renderMenuOverlay()
// → Rendert Menü dynamisch
// → Normal-Modus: Tabs als Listeneinträge + "Anpassen"-Button
// → Edit-Modus: Tabs mit Pin-/Unpin-Buttons

pinTab(key)
// → Fügt Tab zu CFG.pinnedTabs hinzu (max. 2)
// → cfgSave() + Nav neu rendern

unpinTab(key)
// → Entfernt aus CFG.pinnedTabs
// → cfgSave() + Nav neu rendern
```

### Navbar-Struktur

```
[Home]  [Slot 1]  [Slot 2]  [Mehr ...]
         ↑                    ↑
    CFG.pinnedTabs[0]     öffnet Overlay
```

---

## 21. Aktien-Verwaltung (CRUD)

### Neue Aktie hinzufügen

```javascript
openNewAktieModal()
// → leert Formular (Titel, ISIN, Ticker, Währung)

saveNewAktie()
// → erstellt Stock-Objekt mit genId('st_')
// → SDATA.stocks.push() + sdataSave()
// → Sync zu 'Aktien'-Sheet wenn verbunden (apiAppend)
// → renderAktien()
```

### Trade erfassen

```javascript
openTradeModal(type)
// → type: 'kauf' oder 'verk'
// → füllt Typ-Feld vor, öffnet Modal

saveTrade()
// → erstellt Trade mit genId('tr_')
// → berechnet total (qty × price ± courtage)
// → SDATA.trades.push() + sdataSave()
// → Sync zu 'Trades'-Sheet
// → calcPosition() aktualisiert automatisch

deleteTrade(id)
// → entfernt aus SDATA.trades + sdataSave() + Sheet-Sync
```

### Aktie-Detail-Ansicht

```javascript
openAktieDetail(stockId)
// → setzt currentAktieId
// → renderAktieDetail(stockId)
// → öffnet #aktie-detail-Modal

renderAktieDetail(stockId)
// → zeigt: ISIN, Anzahl, Ø-Preis, Einstandswert, Live-Kurs, P&L
// → Trade-Verlaufs-Tabelle (chronologisch)
// → fetchStockPrice() im Hintergrund

refreshStockPrice(stockId)
// → löscht Cache-Eintrag für Ticker
// → fetchStockPrice() + re-render
```

---

## 22. Excel-Export

```javascript
exportExcel()
// → verwendet SheetJS XLSX-Library (via CDN)
// → Erstellt 3 Arbeitsblätter:
//     'Ausgaben'      – alle Ausgaben, neueste zuerst
//     'Einnahmen'     – alle Einnahmen, neueste zuerst
//     'Daueraufträge' – alle Daueraufträge
// → Auto-Spaltenbreite
// → Download als 'Finanzen_YYYY-MM-DD.xlsx'
```

---

## 23. Business Rules

### Lohnzyklus-Logik

- Konfigurierbarer Starttag (`CFG.lohnTag`, Standard: 25)
- Läuft von Lohnttag bis (Lohntag − 1) des Folgemonats
- Lohneingang erkannt durch: `isLohn = true` ODER ersten 3 Tagen des Zyklus (Rückwärts-Kompatibilität)
- Verfolgt: Fixkosten, variables Budget, Übertrag, Tagesrate

### Fixkosten-Prüfung (Priorität)

```
1. entry.isFixkosten === true
2. CFG.fixkostenKats.includes(entry.cat)
3. Dauerauftrag mit affectsAvg === false
→ isFixkostenEntry(e) prüft alle drei
```

### Dauerauftrag-Materialisierung

- Virtuelle Einträge werden **on-demand** expandiert (`getRecurringOccurrences`)
- **Manuell:** Benutzer klickt DA-Badge → `openMaterializeModal()` → bestätigen
- **Auto:** Vergangener Monat wird geöffnet → `materialisiereDauerauftraege(mo, yr)`
- **Duplikat-Schutz:** `DATA.expenses.some(e => e.recurringId === id && e.date === date)`
- Materialisierte Einträge erhalten `recurringId`-Feld in Spalte G des Sheets

### Aktien-Positionsberechnung

- FIFO-ähnlich mit gewichtetem Durchschnittspreis
- Käufe: `qty += trade.qty; totalCost += qty * price + courtage`
- Verkäufe: reduzieren qty, totalCost anteilig
- Bruchteile werden unterstützt
- Negative qty wird auf 0 geklemmt
- P&L nur angezeigt wenn Live-Kurs verfügbar

### Duplikat-Verhinderung beim Laden

- Ausgaben/Einnahmen: Einträge mit Spalte G = `'1'` werden als gelöscht übersprungen
- Daueraufträge: Einträge mit `active = '0'` werden als inaktiv geladen (aber nicht angezeigt)
- Kategorien: Einträge ohne Name werden übersprungen

---

## 24. Entwickler-Hinweise

### Performance

| Massnahme | Detail |
|-----------|--------|
| **5-Minuten-Daten-Cache** | `dataCacheLoad()` vermeidet redundante API-Calls |
| **3s-debounced Profil-Sync** | `autoSyncProfile()` sammelt Änderungen |
| **Live-Kurs-Hintergrund-Fetch** | Stock-Preise werden nach initialem Rendering geladen |
| **Virtuelle Daueraufträge** | Werden on-demand berechnet, nicht persistiert |

### Fehlerbehandlung

| Fehler | Verhalten |
|--------|-----------|
| Netzwerkfehler | `setSyncStatus('error')`, gecachte Daten verwenden |
| Session abgelaufen | `CFG.sessionToken` löschen, Session-Expired-Toast |
| Sheet-Struktur fehlt | `checkSheets()` prüft beim Verbinden, zeigt Anleitung |
| Rollback | `deleteEntry()` stellt lokalen Eintrag wieder her bei API-Fehler |

### Demo-Modus

- `CFG.demo = true` → überspringt alle Sheet-API-Aufrufe
- `loadDemo()` lädt Testdaten
- Toast-Meldungen ergänzt mit `"(Demo)"`
- Ideal für Präsentationen und Onboarding

### Sicherheit

- `esc(s)` — HTML-Escape für alle Benutzereingaben in Templates (XSS-Schutz)
- Passwörter werden **client-seitig** mit SHA-256 gehasht vor dem Senden
- Session-Token nur in Account-Modus, nie im Script-URL-Modus
- Keine sensiblen Daten in URLs

### HTML-IDs Referenz (wichtigste)

| ID | Beschreibung |
|----|-------------|
| `#tab-home` | Home-Widget-Container |
| `#tab-lohn` | Lohn-Tab-Container |
| `#monat-content` | Monat-Tab-Inhalt |
| `#dashboard-content` | Jahresübersicht-Inhalt |
| `#tab-aktien` | Aktien-Tab-Container |
| `#edit-modal` | Eintrag bearbeiten/erstellen |
| `#rec-modal` | Dauerauftrag bearbeiten |
| `#cat-modal` | Kategorie bearbeiten |
| `#month-view` | Monats-Kalender-Modal |
| `#notif-overlay` | Benachrichtigungs-Panel |
| `#aktie-detail` | Aktien-Detail-Panel |
| `#aktien-list` | Aktien-Karten-Container |
| `#aktien-tabelle` | Aktien-Tabellen-Container |
| `#aktien-charts` | Aktien-Charts-Container |
| `#menu-overlay` | Mehr-Menü-Overlay |
| `#nav` | Untere Navigationsleiste |
| `#sync-status` | Sync-Indikator oben rechts |
| `#notif-badge` | Benachrichtigungs-Zähler |

---

---

## 16. Aktien: Dashboard, Toggle & UX

Dieses Kapitel beschreibt alle Erweiterungen aus dem Feature-Branch `claude/stocks-settings-toggle-pOwg7`.

### 16.1 Aktien aktivieren (Toggle)

**Zweck:** Aktien-Tab, -Widgets und Plus-Menü-Eintrag sind standardmässig ausgeblendet. Nutzer aktivieren das Feature explizit in den Einstellungen.

**CFG-Feld:** `aktienEnabled: false` (Standard)

**Settings-UI:** Einstellungen → Sektion „Aktien" → Toggle „Aktien aktivieren"

```javascript
CFG.aktienEnabled  // boolean, steuert Sichtbarkeit aller Aktien-Features
```

**Effekte beim Deaktivieren:**
- `CFG.pinnedTabs` wird um `'aktien'` bereinigt
- `CFG.homeWidgets` wird um alle Aktien-Widget-Keys bereinigt
- Falls Aktien-Tab aktiv → Redirect zu Home
- Navigation und Mehr-Menü aktualisieren sich sofort

**Effekte beim Aktivieren:**
- Aktien-Tab erscheint im Mehr-Menü und ist anheftbar
- Aktien-Widgets sind im Widget-Katalog verfügbar
- FAB zeigt Speed-Dial mit „Aktie / Trade erfassen"

**Funktion:** `toggleAktienEnabled()` — kümmert sich um alle Seiteneffekte

**Profil-Sync:** `aktienEnabled` wird wie alle anderen Profil-Einstellungen per `syncProfileToSheet()` gespeichert.

---

### 16.2 Aktien-Dashboard (Tab-Top + Widget)

**Tab-Dashboard:** Wird als erste Karte im Aktien-Tab angezeigt (über Aktiv/Historisch-Toggle). ID: `#aktien-dashboard-top`. Renderfunktion: `renderAktienDashboardTop()`.

**Inhalt:**
| Feld | Quelle |
|------|--------|
| Portfolio-Wert | `getGesamtPortfoliowert()` |
| Heute (Tagesveränderung) | `getPortfolioTodayChange()` |
| Gesamt G/V | `getGesamtGewinnVerlust()` |
| Positionen | Anzahl aktiver Stocks |

**Tagesveränderung:** Berechnet aus `stockPriceCache[ticker].prevClose` (aus Yahoo Finance `meta.chartPreviousClose`). Farbkodierung: grün/rot je nach Vorzeichen.

**Widget:** Key `aktienDashboard` — zeigt die gleichen 4 Kennzahlen als Home-Widget. Callable als `aktienDashboard` im Widget-Katalog.

**Einzelwidgets (bestehend):**
- `aktienWert` → Portfolio-Wert (prominent)
- `aktienPnl` → Gesamt G/V

---

### 16.3 fetchStockPrice — prevClose

`fetchStockPrice(ticker)` speichert jetzt zusätzlich `prevClose` (Schlusskurs Vortag):

```javascript
stockPriceCache[ticker] = {
  price:     meta.regularMarketPrice,
  prevClose: meta.chartPreviousClose ?? meta.previousClose ?? null,
  currency:  meta.currency,
  ts:        Date.now()
}
```

`getPortfolioTodayChange()` iteriert über alle aktiven Positionen und berechnet:
```
change += (price - prevClose) * qty * fxRate
```

---

### 16.4 FAB Speed-Dial (Aktien aktiviert)

Wenn `CFG.aktienEnabled === true`, öffnet der FAB-Button ein Speed-Dial-Overlay (statt direkt zu `eingabe` zu navigieren).

**HTML:** `#fab-speed-dial` — fixe Positionierung über der Navigationsleiste

**Optionen:**
1. „Ausgabe / Einnahme" → `goTab('eingabe')`
2. „Aktie / Trade erfassen" → `openAddAktieFlow()`

**Funktionen:** `openFabMenu()`, `closeFabMenu()`

**Flow `openAddAktieFlow()`:**
- Öffnet Modal `#aktie-flow-modal`
- Zeigt bestehende Aktien (klickbar → öffnet Detail + Trade-Modal)
- Button „Neue Aktie hinzufügen" → `openNewAktieModal()`
- `openAktieDetailFromFlow(stockId)` navigiert zu Aktien-Tab und öffnet Detail

---

### 16.5 Aktien-Stammdaten bearbeiten

**Button „Bearbeiten"** in der Aktien-Detailansicht (neben „Löschen").

**Modal:** `#edit-aktie-modal`

**Felder:**
- Titel
- ISIN (optional)
- Ticker (mit Hint-Text für Google Finance, z.B. `AAPL`, `NESN.SW`, `GOOGL`)
- Basis-Währung
- **„Kurs abrufen testen"** Button → ruft `fetchStockPrice` auf und zeigt Kurs sofort an

**Funktionen:**
- `openEditAktieModal(stockId)` — füllt Modal aus Stock-Objekt
- `testTickerFromEdit()` / `testTickerFromNew()` — testet Ticker live
- `saveEditAktie()` — aktualisiert Stock-Objekt, invalidiert Preiscache bei Ticker-Änderung, synct zu Google Sheet

**Sheet-Sync:** `apiUpdate(Aktien!B{row}:E{row}, [[title, isin, ticker, currency]])`

---

### 16.6 renderHome — Aktien-Widget-Filter

Wenn `CFG.aktienEnabled === false`, werden Aktien-Widgets weder angezeigt noch im Katalog angeboten:

```javascript
const aktienWidgetKeys = ['aktienDashboard','aktienPortfolio','aktienWert','aktienPnl',
                          'aktienTop','aktienVerteilung','aktienPosition'];
const visibleCatalog = CFG.aktienEnabled
  ? WIDGET_CATALOG
  : WIDGET_CATALOG.filter(w => !aktienWidgetKeys.includes(w.key));
```

---

### 16.7 Mehr-Menü — Aktien-Tab-Filter

`renderMenuOverlay()` filtert den Aktien-Tab heraus, wenn `!CFG.aktienEnabled`:

```javascript
const visibleTabs = PINNABLE_TABS.filter(t => t.key !== 'aktien' || CFG.aktienEnabled);
```

---

---

## 17. Verlauf: 3-Ebenen-Navigation

### 17.1 Überblick und Navigationszustand

Der Verlauf-Tab verwendet eine dreistufige Navigation mit zugehörigen State-Variablen:

```javascript
let verlaufType = 'alle';       // 'alle' | 'ausgaben' | 'einnahmen'
let verlaufKat  = null;         // null = L1/L2 aktiv | string = L3 aktiv
let verlaufL3SearchVis = false; // Suche in L3 ein-/ausgeblendet
let verlaufSearch = '';         // aktueller Suchstring (alle Ebenen)
```

| Zustand | Ebene | Beschreibung |
|---------|-------|--------------|
| `verlaufKat === null && verlaufType === 'alle'` | L1 | Alle Einträge chronologisch |
| `verlaufKat === null && verlaufType !== 'alle'` | L2 | Kategorieliste für gewählten Typ |
| `verlaufKat !== null` | L3 | Kategorie-Detailansicht |

---

### 17.2 Navigationsfunktionen

```javascript
function verlaufSetType(t)
```
- Wechselt den Typ-Filter (`'alle'`, `'ausgaben'`, `'einnahmen'`)
- Setzt `verlaufKat = null`, `verlaufL3SearchVis = false`, `verlaufSearch = ''`
- Aktualisiert aktive Klasse auf den Typ-Buttons (`#v-btn-alle`, `#v-btn-ausgaben`, `#v-btn-einnahmen`)
- Ruft `renderVerlauf()` auf

```javascript
function verlaufOpenKat(name)
```
- Öffnet L3 für die übergebene Kategorie
- Setzt `verlaufKat = name`, `verlaufL3SearchVis = false`, `verlaufSearch = ''`
- Ruft `renderVerlauf()` auf

```javascript
function verlaufOpenKatFromEl(el)
```
- Wrapper für `verlaufOpenKat(el.dataset.kat)`
- Wird als `onclick`-Handler auf `.card-row`-Elementen gesetzt, um Sonderzeichen in Kategorienamen sicher zu übergeben (via `data-kat`-Attribut statt inline-JS-String-Escaping)

```javascript
function verlaufGoBack()
```
- Kehrt von L3 nach L2 zurück (oder von L2 nach L1 bei `verlaufType === 'alle'`)
- Setzt `verlaufKat = null`, `verlaufL3SearchVis = false`, `verlaufSearch = ''`
- Ruft `renderVerlauf()` auf

```javascript
function verlaufToggleL3Search()
```
- Toggelt `verlaufL3SearchVis`
- Blendet `#verlauf-search-wrap` ein/aus
- Fokussiert das Suchfeld bei Einblendung

```javascript
function setVerlaufSearch(val)
```
- Setzt `verlaufSearch = val`
- Ruft `renderVerlauf()` auf

---

### 17.3 Datenfunktionen

```javascript
function sucheTransaktionen(query, entries)
```
- **Zweck:** Universelle Suche über eine Eintrags-Liste
- **Datenquelle:** Beliebiges Array von Eintrags-Objekten (Ausgaben, Einnahmen oder gemischt)
- **Suchfelder:** `what` (Bezeichnung), `cat` (Kategorie), `note` (Notiz), `amt` (Betrag als String), `date` (Datum als String)
- **Rückgabe:** Gefiltertes Array mit denselben Objekten
- **Groß-/Kleinschreibung:** Invariant (`.toLowerCase()`)

```javascript
function getKategorienMitEintraegen(typ)
```
- **Zweck:** Aggregiert alle Einträge nach Kategorie für L2-Ansicht
- **Parameter:** `typ` — `'ausgaben'` oder `'einnahmen'`
- **Datenquelle:** `DATA.expenses` / `DATA.incomes` + `getRecurringInstances()` für den aktuellen Monat
- **Rückgabe:** `[{ name, total, count }]`, absteigend nach `total` sortiert
- **Filtert** Kategorien ohne Einträge heraus (mind. 1 Eintrag erforderlich)

```javascript
function getKategorieDetails(kat, von, bis)
```
- **Zweck:** Detailstatistiken für eine einzelne Kategorie (L3-Statistikblock)
- **Parameter:** `kat` — Kategoriename; `von`/`bis` — ISO-Datums-Strings (optional, Standard: alle)
- **Datenquelle:** `DATA.expenses` / `DATA.incomes` je nach `verlaufType`; schließt wiederkehrende Einträge via `getRecurringInstances()` ein
- **Rückgabe:**
  ```javascript
  {
    total,        // Gesamtbetrag der Kategorie
    count,        // Anzahl Einträge
    avgPerMonth,  // Ø pro Monat (total / Monate im Zeitraum)
    pct,          // Anteil am Gesamtbetrag des Typs (0–100)
    entries       // vollständiges gefiltertes Eintrags-Array
  }
  ```

```javascript
function getMonthsBetween(a, b)
```
- **Zweck:** Hilfsfunktion — Anzahl voller Monate zwischen zwei ISO-Datums-Strings
- **Rückgabe:** `number` (mind. 1)

```javascript
function buildMonthlyBarData(kat, typ)
```
- **Zweck:** Baut SVG-Balkendiagramm (12 Monate) für L3-Statistikblock
- **Datenquelle:** `DATA.expenses` / `DATA.incomes` je nach `typ`, gefiltert auf `kat`
- **Rückgabe:** SVG-String mit 12 Balken, farblich kodiert via `catColor(kat)`
- **Achsenbeschriftung:** Monatskürzel (Jan–Dez) unter jedem Balken

---

### 17.4 Render-Funktionen

```javascript
function renderVerlauf()
```
- **Zweck:** Haupt-Dispatcher — bestimmt aktive Ebene und delegiert
- **Steuerung:**
  - Zeigt/versteckt `#verlauf-l3-bar` (Zurück-Button + Kategorietitel + Suche-Icon) je nach Ebene
  - Setzt `#verlauf-l3-title` auf aktuellen Kategorienamen
  - Zeigt/versteckt `#verlauf-search-wrap` (L1/L2: immer sichtbar; L3: per Toggle)
  - Blendet je genau einen der drei Content-Bereiche ein: `#verlauf-l1-content`, `#verlauf-l2-content`, `#verlauf-l3-content`
  - Delegiert an `renderVerlaufL1()`, `renderVerlaufL2()` oder `renderVerlaufL3()`

```javascript
function renderVerlaufEntryGroups(entries)
```
- **Zweck:** Gemeinsamer Renderer für chronologisch gruppierte Einträge (nach Datum)
- **Datenquelle:** Beliebiges Eintrags-Array (bereits gefiltert und sortiert)
- **Format:** Datums-Header (`fmtDate(date)`) gefolgt von `.card-row`-Elementen
- **Jede Zeile:** Icon (Emoji via `catEmoji`) + Body (`what` / `cat` + `note`) + Amount (`fmtAmt`) + Chevron (tippbar → `openEditEntry(id, typ)`)

```javascript
function renderVerlaufL1()
```
- **Zweck:** L1-Ansicht — alle Einträge chronologisch mit Suche
- **Datenquelle:** `DATA.expenses` + `DATA.incomes` (+ Recurring), zusammengeführt und nach Datum absteigend sortiert
- **Suche:** `sucheTransaktionen(verlaufSearch, allEntries)`
- **Ausgabe in:** `#verlauf-l1-content`

```javascript
function renderVerlaufL2()
```
- **Zweck:** L2-Ansicht — Kategorieübersicht mit Mini-Fortschrittsbalken
- **Datenquelle:** `getKategorienMitEintraegen(verlaufType)`
- **Suche:** Filtert Kategorienamen via `verlaufSearch`
- **Jede Kategorie:**
  - `.card-row` mit `data-kat`-Attribut (Sonderzeichen-sicher) + `onclick="verlaufOpenKatFromEl(this)"`
  - Icon (`catEmoji(name)`) + Name + Eintragsanzahl
  - Mini-Fortschrittsbalken (Breite = Anteil relativ zur größten Kategorie)
  - Gesamtbetrag rechts + Chevron
- **Ausgabe in:** `#verlauf-l2-content`

```javascript
function renderVerlaufL3()
```
- **Zweck:** L3-Ansicht — Statistikblock + Eintrags-Liste für eine Kategorie
- **Datenquelle:** `getKategorieDetails(verlaufKat)` + `buildMonthlyBarData(verlaufKat, verlaufType)`
- **Statistikblock (3-Spalten-Grid):**
  - Gesamtbetrag
  - Ø pro Monat
  - Anzahl Einträge
  - Horizontaler Anteil-Balken (volle Breite, Prozentanzeige)
  - 12-Monats-SVG-Balkendiagramm
- **Trennlinie** zwischen Statistikblock und Eintrags-Liste
- **Eintrags-Liste:** `renderVerlaufEntryGroups(gefilterte Einträge)` mit `sucheTransaktionen(verlaufSearch, details.entries)`
- **Ausgabe in:** `#verlauf-l3-content`

---

### 17.5 HTML-Struktur (`#tab-verlauf`)

```html
<div id="tab-verlauf" class="tab-page">
  <div style="padding:12px 16px 0">
    <!-- Typ-Umschalter (immer sichtbar) -->
    <div id="verlauf-type-bar" class="type-toggle">
      <button id="v-btn-alle"      onclick="verlaufSetType('alle')">Alle</button>
      <button id="v-btn-ausgaben"  onclick="verlaufSetType('ausgaben')">Ausgaben</button>
      <button id="v-btn-einnahmen" onclick="verlaufSetType('einnahmen')">Einnahmen</button>
    </div>
    <!-- L3-Navigationsleiste (nur auf L3 sichtbar) -->
    <div id="verlauf-l3-bar">
      <button onclick="verlaufGoBack()">← Zurück</button>
      <span id="verlauf-l3-title"></span>
      <button onclick="verlaufToggleL3Search()" id="verlauf-l3-search-btn">🔍</button>
    </div>
    <!-- Suchfeld (L1/L2: immer; L3: per Toggle) -->
    <div class="verlauf-search-wrap" id="verlauf-search-wrap">
      <input id="verlauf-search" oninput="setVerlaufSearch(this.value)" placeholder="Suchen…">
    </div>
  </div>
  <!-- Inhaltscontainer (je genau einer sichtbar) -->
  <div id="verlauf-l1-content"></div>
  <div id="verlauf-l2-content" style="display:none"></div>
  <div id="verlauf-l3-content" style="display:none"></div>
</div>
```

---

### 17.6 Suchverhalten je Ebene

| Ebene | Sichtbarkeit Suche | Was wird durchsucht |
|-------|--------------------|---------------------|
| L1 (Alle) | Immer sichtbar | Bezeichnung, Kategorie, Notiz, Betrag, Datum aller Einträge |
| L2 (Kategorien) | Immer sichtbar | Kategorienamen |
| L3 (Detail) | Per 🔍-Toggle | Bezeichnung, Kategorie, Notiz, Betrag, Datum — nur Einträge der gewählten Kategorie |

---

---

## 18. Verlauf: Zeitraum-Filter

### 18.1 Zustandsvariablen

```javascript
let verlaufZeitraumMode = 'monat'; // 'woche'|'monat'|'jahr'|'custom'
let verlaufVonCustom = '';         // ISO-Datum bei 'custom'
let verlaufBisCustom = '';         // ISO-Datum bei 'custom'
let verlaufFilterOpen = false;     // Filter-Panel auf-/zugeklappt
```

### 18.2 Funktionen

```javascript
function verlaufGetRange()
```
- Berechnet `{von, bis}` aus aktuellem `verlaufZeitraumMode`
- Woche: Montag bis heute · Monat: 1. des Monats bis heute · Jahr: 1.1. bis heute · Custom: `verlaufVonCustom`/`verlaufBisCustom`
- Rückgabe: `{von: 'YYYY-MM-DD'|'', bis: 'YYYY-MM-DD'|''}`

```javascript
function verlaufGetRangeLabel()
```
- Gibt menschenlesbaren Label zurück (z.B. `«März 2026»`, `«Diese Woche»`, `«2026»`)

```javascript
function toggleVerlaufFilter()
```
- Toggelt `verlaufFilterOpen`, zeigt/versteckt `#verlauf-filter-panel`
- Dreht Chevron-Icon `#verlauf-filter-chevron`
- Bei Öffnen: ruft `renderVerlaufFilterSummary()` auf

```javascript
function setVerlaufZeitraum(mode)
```
- Setzt `verlaufZeitraumMode`, aktualisiert Button-Klassen (`#vzm-woche/monat/jahr/custom`)
- Zeigt/versteckt `#vzm-custom-dates` bei 'custom'
- Ruft `renderVerlaufFilterSummary()` und `renderVerlauf()` auf

```javascript
function setVerlaufCustomRange()
```
- Liest `#verlauf-von-input` / `#verlauf-bis-input` aus
- Setzt `verlaufVonCustom` / `verlaufBisCustom`
- Ruft `renderVerlaufFilterSummary()` und `renderVerlauf()` auf

```javascript
function verlaufFilterEntries(entries)
```
- **Zweck:** Filtert ein Eintrags-Array nach dem aktuellen Zeitraum
- **Datenquelle:** Beliebiges Array mit `.date`-Eigenschaft (ISO-String)
- **Verwendet:** in `renderVerlaufL1()`, `renderVerlaufL3()`, `getKategorienMitEintraegen()`
- **Rückgabe:** Gefiltertes Array

```javascript
function verlaufCalcSummary()
```
- **Zweck:** Berechnet Gesamt-Ausgaben, -Einnahmen, Netto und Top-5-Segmente für Donut-Chart
- **Datenquelle:** `DATA.expenses` / `DATA.incomes`, gefiltert via `verlaufGetRange()`
- **Rückgabe:** `{ausgaben, einnahmen, netto, segments, top5, weitereAmt}`
  - `segments`: `[{name, amt, color}]` — Top 5 + optional "Weitere" (grau)

```javascript
function buildDonutSVG(segments, total, size=100)
```
- **Zweck:** Erzeugt SVG-Donut-Ring (nur äusserer Ring) aus Segmenten
- **Parameter:** `segments` — Array mit `{name, amt, color}`; `total` — Gesamtbetrag; `size` — Pixel
- **Algorithmus:** Berechnet Bogenpfade via `M … A … L … A … Z` (Donut-Pfad-Technik)
- **Rückgabe:** SVG-String

```javascript
function renderVerlaufFilterSummary()
```
- Schreibt in `#verlauf-filter-summary`: Donut + Ausgaben/Einnahmen/Netto + Top-5-Legende mit farbigen Dots + horizontalen Balken

### 18.3 HTML-Struktur

```html
<div id="verlauf-filter-bar">
  <button id="verlauf-filter-toggle" onclick="toggleVerlaufFilter()">
    Zeitraum: <span id="verlauf-filter-label">Dieser Monat</span>
    <svg id="verlauf-filter-chevron">▾</svg>
  </button>
  <div id="verlauf-filter-panel" style="display:none">
    <div class="type-toggle">
      <button id="vzm-woche">Woche</button>
      <button id="vzm-monat" class="type-btn active">Monat</button>
      <button id="vzm-jahr">Jahr</button>
      <button id="vzm-custom">Eigener</button>
    </div>
    <div id="vzm-custom-dates" style="display:none">
      <input id="verlauf-von-input" type="date" onchange="setVerlaufCustomRange()">
      <input id="verlauf-bis-input" type="date" onchange="setVerlaufCustomRange()">
    </div>
    <div id="verlauf-filter-summary"><!-- Donut + KPIs --></div>
  </div>
</div>
```

### 18.4 Home-Widget `verlaufZeitraum`

- **Key:** `verlaufZeitraum`
- **Render-Funktion:** `renderWidgetVerlaufZeitraum()`
- **Inhalt:** Kompakter Donut (80px) + Ausgaben / Einnahmen / Netto
- **Klick:** `goTab('verlauf')` — öffnet Verlauf mit aktuellem Filter

---

## 19. Kategorie-Verwaltung: Oberkategorien

### 19.1 Überblick

Oberkategorien sind Kategorien ohne `parent`-Feld. Sie können direkt im `tab-kategorien` erstellt, umbenannt und gelöscht werden.

### 19.2 Funktionen

```javascript
function getOberkategorien(typ)
```
- **Parameter:** `typ` — `'ausgabe'` oder `'einnahme'`
- **Rückgabe:** Array aller Kategorien ohne Parent (gefiltert nach Typ, ohne DELETED)

```javascript
function renderOberkategorien()
```
- Rendert in `#okt-ausgabe-list` / `#okt-einnahme-list`
- Pro Oberkategorie: Name + Anzahl Unterkategorien + Buttons "Umbenennen" / "Löschen"
- Wird automatisch von `renderCategories()` aufgerufen

```javascript
async function createOberkategorie()
```
- Liest `#new-okt-name` + `#new-okt-type`
- Erstellt neue Kategorie ohne Parent-Referenz
- Sheet-Sync: `apiAppend('Kategorien', [[id, name, typ, color, sort, '']])`
- Ruft `renderCategories()` + `fillAllDropdowns()` auf

```javascript
async function renameOberkategoriePrompt(id)
```
- Öffnet `prompt()` mit aktuellem Namen
- Aktualisiert `cat.name` und alle `sub.parent`-Referenzen
- Sheet-Sync: `apiUpdate('Kategorien!A{row}:F{row}', ...)`

```javascript
function deleteOberkategorieModal(id)
```
- Zeigt Bestätigungs-Dialog mit Optionen für Unterkategorie-Zuweisung
- Bei vorhandenen Unterkategorien: `prompt()` für Fallback-Oberkategorie
- Delegiert an `confirmDeleteOberkategorie(id, fallbackParent)`

```javascript
async function confirmDeleteOberkategorie(id, fallbackParent)
```
- Markiert Oberkategorie als DELETED
- Setzt `sub.parent = fallbackParent` für alle Unterkategorien (leer = eigenständig)
- Sheet-Sync: markiert Oberkategorie als DELETED, aktualisiert alle Unterkategorie-Rows

### 19.3 Datenmodell (Kategorien-Sheet)

| Spalte | Inhalt |
|--------|--------|
| A | `id` |
| B | `name` |
| C | `type` (ausgabe/einnahme) |
| D | `color` (Hex) |
| E | `sort` (Reihenfolge) |
| F | `parent` (Name der Oberkategorie, leer = Oberkategorie selbst) |

---

## 20. Eingabe-Screen: 3-Tab-Switch & Aktien-Trade

### 20.1 3-Tab-Switch

Der Eingabe-Tab zeigt nun bis zu drei Tabs:

| Button | ID | Sichtbar wenn |
|--------|-----|---------------|
| `− Ausgabe` | `#type-aus` | Immer |
| `+ Einnahme` | `#type-ein` | Immer |
| `▲ Aktien` | `#type-akt` | `CFG.aktienEnabled === true` |

- Sichtbarkeit des Aktien-Buttons wird gesetzt in: `fillAllDropdowns()` (beim Datenladen) und `toggleAktienEnabled()` (bei Settings-Änderung)
- `setType('aktien')` schaltet Standard-Formular aus (`#eingabe-standard-section`) und Aktien-Formular ein (`#eingabe-aktien-section`)

### 20.2 FAB-Vereinfachung

- FAB zeigt bei allen Nicht-Eingabe-Tabs: Plus-Icon → direkt `goTab('eingabe')`
- FAB zeigt bei Eingabe-Tab: X-Icon → `goTab('home')` (Schliessen)
- Speed-Dial-Popup wurde entfernt; `openFabMenu()` ist ein Alias für `goTab('eingabe')`

### 20.3 Aktien-Trade-Formular

**HTML:** `#eingabe-aktien-section` (initial `display:none`)

**Felder:**

| Feld | ID | Typ |
|------|----|-----|
| Kauf/Verkauf-Toggle | `#at-kauf-btn` / `#at-verk-btn` | Buttons |
| Aktie | `#at-stock` | `<select>` (aus `SDATA.stocks`) |
| Datum | `#at-date` | `type="date"` |
| Anzahl | `#at-qty` | `type="number"` |
| Preis/Stück | `#at-price` | `type="number"` |
| Total | `#at-total` | Readonly — `qty × price` |
| Notiz | `#at-note` | Text |

**Funktionen:**

```javascript
function setAktienTradeType(t)  // 'kauf'|'verkauf' — aktualisiert aktienTradeTyp und Button-Klassen
function renderAktienTradeForm() // Befüllt #at-stock mit aktiven Positionen + Stückzahlen
function updateAktienTotal()     // Rechnet qty × price → #at-total
function openNewAktieModalFromEingabe() // Öffnet bestehendes Neue-Aktie-Modal
async function saveAktienTradeFromEingabe() // Speichert Trade in SDATA.trades + Sheet
```

**Sheet-Sync:** `apiAppend('Trades', [[id, stockId, typ, qty, price, date, note]])`

---

---

## 21. Hintergrundbild & Glassmorphism

### 21.1 Überblick

Der Effekt besteht aus zwei Schichten:
1. **Hintergrundbild** — CSS-Gradient-Preset oder hochgeladenes Bild auf `body`
2. **Glassmorphism** — `backdrop-filter: blur()` auf Cards, Nav und Top-Bar

### 21.2 CFG-Schlüssel

| Key | Typ | Default | Beschreibung |
|-----|-----|---------|-------------|
| `bgPreset` | string | `''` | Key aus `BG_PRESETS` oder leer |
| `glassEnabled` | boolean | `false` | Glassmorphism ein/aus |
| `glassBlur` | number | `12` | Blur-Stärke in px (4–20) |
| `glassAlpha` | number | `12` | Transparenz in % (5–40) |

Das Hintergrundbild (hochgeladene Datei, Base64) wird **separat** in `localStorage('ft_bg_image')` gespeichert und **nicht** ins Google Sheet synchronisiert (zu gross). Nur `bgPreset` wird synchronisiert.

### 21.3 CSS-Variablen

```css
:root {
  --glass-rgb:          15,15,18;   /* Dark mode: dunkler Tint */
  --glass-blur:         12px;       /* Blur-Stärke (via JS gesetzt) */
  --glass-alpha:        0.120;      /* Card-Transparenz (via JS) */
  --glass-nav-alpha:    0.220;      /* Nav (alpha × 1.8, via JS) */
  --glass-bar-alpha:    0.160;      /* Top-Bar (alpha × 1.4, via JS) */
  --glass-border-alpha: 0.150;      /* Border (alpha × 1.2, via JS) */
}
[data-theme="light"] {
  --glass-rgb: 255,255,255;         /* Light mode: weisslicher Tint */
}
```

### 21.4 CSS-Klassen

| Klasse | Gesetzt auf | Bedeutung |
|--------|-------------|-----------|
| `body.has-bg-image` | `body` | Hintergrundbild aktiv (Preset oder Upload) |
| `body.glass-on` | `body` | Glassmorphism aktiv (nur wenn `GLASS_SUPPORTED`) |

**Betroffene Elemente bei `body.glass-on`:**
- `.card`, `.widget-card` — Kacheln mit Glass-Effekt
- `#nav` — Bottom-Navigationsleiste
- `.top-bar` — Header-Leiste
- `.type-toggle` — Tab-Switch-Elemente

### 21.5 Preset-Hintergründe

Definiert in `const BG_PRESETS`:

| Key | Label | Charakter |
|-----|-------|-----------|
| `aurora` | Aurora | Blau-Grün-Lila Radial-Gradienten |
| `midnight` | Midnight | Tiefes Dunkelblau |
| `forest` | Wald | Dunkelgrün |
| `sunset` | Sunset | Warm Orange-Violett |
| `ocean` | Ozean | Tiefseeblau |
| `slate` | Slate | Neutral Dunkelblau-Grau |

Jeder Preset hat: `{ label, color, gradient }` — `gradient` ist ein CSS-Gradient-String.

### 21.6 Funktionen

```javascript
function applyAppBackground()
```
- Setzt `body.style.backgroundImage` aus `_getBgImageData()` oder `BG_PRESETS[CFG.bgPreset].gradient`
- Toggelt `body.has-bg-image` und `body.glass-on`
- Ruft `_updateGlassCssVars()` auf
- Wird aufgerufen: bei DOMContentLoaded, nach Preset-Wechsel, nach Upload, nach `_profileApply()`

```javascript
function _updateGlassCssVars()
```
- Setzt alle `--glass-*` CSS-Variablen auf `document.documentElement` aus `CFG.glassBlur` / `CFG.glassAlpha`

```javascript
function setBgPreset(key)        // Preset wählen, Custom-Bild löschen, applyAppBackground()
function clearBgImage()          // Alles zurücksetzen auf Standard-Gradient
function triggerBgUpload()       // Öffnet #bg-file-input (hidden file picker)
function loadBgFile(input)       // Liest FileReader → Base64 → localStorage → applyAppBackground()
function toggleGlass()           // Toggelt CFG.glassEnabled; prüft GLASS_SUPPORTED
function updateGlassBlur(val)    // Setzt CFG.glassBlur, aktualisiert CSS-Var + Label live
function updateGlassAlpha(val)   // Setzt CFG.glassAlpha, aktualisiert CSS-Var + Label live
function renderErscheinungsbild() // Rendert Preset-Grid + Toggle + Slider in Settings
```

### 21.7 Performance-Fallback

```javascript
const GLASS_SUPPORTED = CSS.supports('backdrop-filter','blur(1px)')
                     || CSS.supports('-webkit-backdrop-filter','blur(1px)');
```
- `toggleGlass()` zeigt Fehler-Toast wenn `!GLASS_SUPPORTED`
- `@media (prefers-reduced-motion: reduce)` deaktiviert `backdrop-filter` automatisch und erhöht Opacity auf 0.70

### 21.8 Settings-HTML

Der Abschnitt „Erscheinungsbild" in `tab-einstellungen` enthält:
- `#bg-preset-grid` — 3-Spalten-Grid, via `renderErscheinungsbild()` befüllt
- `#bg-file-input` — versteckter `<input type="file" accept="image/*">`
- `#glass-enabled-sw` — Toggle für Glassmorphism
- `#glass-sliders` — Blur + Transparenz-Slider (nur sichtbar wenn `glassEnabled`)
- `#glass-blur-slider` / `#glass-alpha-slider` — Range-Inputs (4–20 / 5–40)

---

*Generiert aus `/home/user/finanztracker1/index.html` — Branch `claude/stocks-settings-toggle-pOwg7`*
