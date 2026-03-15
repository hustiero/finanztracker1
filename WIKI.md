# ₣ TRACKER — Entwickler-Wiki

> Vollständige Dokumentation aller Funktionen, Datenstrukturen und des System-Handlings.
> Stand: März 2026 · Branch `claude/tab-pinning-menu-Gf4m2`

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

*Generiert aus `/home/user/finanztracker1/index.html` — Branch `claude/tab-pinning-menu-Gf4m2`*
