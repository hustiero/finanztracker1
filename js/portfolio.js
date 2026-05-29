// ═══════════════════════════════════════════════════════════════
// portfolio.js — Legacy-Stub
// ═══════════════════════════════════════════════════════════════
// Die ursprüngliche Aktien-Logik ist komplett ersetzt durch die
// AI-Berater-Module (js/aiberater.js, -coach.js, -tax.js).
//
// Diese Datei ist nur eine No-Op-Hülle, damit Code-Referenzen aus
// init.js (Namespace-Wiring) und io.js (Boot-Lifecycle) nicht in
// ReferenceErrors laufen. Alle gelisteten Funktionen werden als
// No-Ops auf window registriert.

(function () {
  var noopList = [
    // Data layer
    'sdataLoad', 'sdataSave',
    'syncKurseSheet', 'fetchStockPrice', 'refreshAllPrices',
    'loadPortfolioVerlauf', 'appendPortfolioSnapshot',
    'getAktienGesamtwert', 'getAktienGesamtPnl', 'getAktienPnlPct',
    'getAktienPosWert', 'getAktienPosPnl',
    // Renderers
    'renderAktien', 'renderAktienList', 'renderAktienTabelle',
    'renderAktienCharts', 'renderAktienDashboardTop',
    'renderAktienSummaryBar', 'renderAktienFxRates',
    'renderAktienTradeForm', 'renderAktieDetail',
    'renderFxRates',
    // Widgets
    'renderWidgetAktienPortfolio', 'renderWidgetAktienWert',
    'renderWidgetAktienPnl', 'renderWidgetAktienTop',
    'renderWidgetAktienVerteilung', 'renderWidgetAktienPosition',
    'renderWidgetAktienDashboard',
    // Charts
    'buildPortfolioPieChart', 'buildPreisVergleichChart',
    'buildPortfolioVerlauf',
    // Modals + Flow
    'openNewAktieModal', 'openEditAktieModal',
    'openAktieDetail', 'closeAktieDetail',
    'openTradeModal', 'openAddAktieFlow',
    'openAktieDetailFromFlow', 'openNewAktieModalFromEingabe',
    'deleteAktie',
    // View toggles
    'setAktienView', 'setAktienTabView', 'setAktienTradeType',
    'updateAktienTotal',
    // Trade saving (Eingabe-Tab)
    'saveAktienTradeFromEingabe', 'saveAktie',
    // Yahoo search (was im alten Modal)
    'fetchYahooSearch',
  ];
  noopList.forEach(function (fn) {
    if (typeof window[fn] === 'undefined') window[fn] = function () {};
  });

  if (typeof window.SDATA === 'undefined') window.SDATA = { stocks: [], trades: [] };
  if (typeof window.PDATA === 'undefined') window.PDATA = { verlauf: [] };
  if (typeof window.stockPriceCache === 'undefined') window.stockPriceCache = {};
  if (typeof window.fxRateCache === 'undefined') window.fxRateCache = {};
})();
