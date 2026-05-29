// ═══════════════════════════════════════════════════════════════
// portfolio.js — Legacy-Stub
// ═══════════════════════════════════════════════════════════════
// Die ursprüngliche Aktien-Logik ist komplett ersetzt durch die
// AI-Berater-Module:
//   - js/aiberater.js       (Portfolio + State + Save)
//   - js/aiberater-coach.js (Claude-Chat)
//   - js/aiberater-tax.js   (Saxo-CSV + Steuer-Übersicht)
//
// Diese Datei bleibt nur, damit Skripte/HTML, die noch alte
// Funktionsnamen referenzieren (z.B. der Aktien-Type-Button im
// Eingabe-Tab), nicht crashen. Alle Aufrufe sind No-Ops.

(function () {
  var noopList = [
    'sdataLoad', 'sdataSave', 'syncKurseSheet', 'fetchStockPrice',
    'refreshAllPrices', 'renderAktien', 'renderAktienTabelle',
    'renderAktienCharts', 'renderAktienDashboardTop',
    'renderAktienSummaryBar', 'renderAktienFxRates',
    'setAktienView', 'setAktienTabView', 'setAktienTradeType',
    'openNewAktieModal', 'updateAktienTotal',
    'saveAktienTradeFromEingabe', 'saveAktie', 'fetchYahooSearch',
    'renderAktienTradeForm',
  ];
  noopList.forEach(function (fn) {
    if (typeof window[fn] === 'undefined') window[fn] = function () {};
  });

  if (typeof window.SDATA === 'undefined') window.SDATA = { stocks: [], trades: [] };
  if (typeof window.PDATA === 'undefined') window.PDATA = { verlauf: [] };
  if (typeof window.stockPriceCache === 'undefined') window.stockPriceCache = {};
  if (typeof window.fxRateCache === 'undefined') window.fxRateCache = {};
})();
