// ═══════════════════════════════════════════════════
// AI-Berater Mount-Glue (ersetzt das alte Portfolio-Modul)
//
// Der Aktien-Tab ist jetzt ein eingebetteter React-Mount-Point. Diese Datei
// ist nur ein dünner Wrapper, der:
//   1) das React-Bundle (window.AIB) bei Tab-Aktivierung mountet,
//   2) Session/Auth-Props aus finanztracker's CFG übergibt,
//   3) bei Token-Refresh/Login-Wechsel die Props aktualisiert.
//
// Falls das Bundle (aiberater/assets/aiberater.js) noch nicht geladen ist,
// zeigt diese Logik einen Hinweis im #aiberater-status statt eines blanken
// Screens.
//
// Quellen des React-Bundles liegen in aiberater-src/ (sub-project mit eigenem
// package.json + Vite). Build via:  cd aiberater-src && npm run build
// ═══════════════════════════════════════════════════

(function () {
  let mountedOnce = false;

  function buildProps() {
    var token = (typeof CFG !== 'undefined' && CFG.sessionToken) ? CFG.sessionToken : '';
    var adminUrl = (typeof CFG !== 'undefined' && (CFG.adminUrl || CFG.url)) ? (CFG.adminUrl || CFG.url) : '';
    var username = '';
    if (typeof CFG !== 'undefined') username = CFG.authUser || CFG.userName || '';
    var apiKey = '';
    var finnhubKey = '';
    if (typeof CFG !== 'undefined') {
      apiKey = CFG.anthropicApiKey || CFG.aibAnthropicKey || '';
      finnhubKey = CFG.finnhubKey || CFG.aibFinnhubKey || '';
    }
    return { adminUrl: adminUrl, token: token, username: username, apiKey: apiKey, finnhubKey: finnhubKey };
  }

  function showStatus(msg) {
    var el = document.getElementById('aiberater-status');
    var root = document.getElementById('aiberater-root');
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.style.display = 'block';
      if (root) root.style.display = 'none';
    } else {
      el.style.display = 'none';
      if (root) root.style.display = '';
    }
  }

  var mountAttempts = 0;
  var MAX_MOUNT_ATTEMPTS = 60; // ~12s @ 200ms

  function mountIfReady() {
    if (typeof window === 'undefined') return;
    if (!window.AIB || typeof window.AIB.mount !== 'function') {
      mountAttempts++;
      if (mountAttempts >= MAX_MOUNT_ATTEMPTS) {
        showStatus('Konnte AI-Berater-Bundle nicht laden. Prüfe ob aiberater/assets/aiberater.js erreichbar ist (F12 → Network) und Service-Worker nicht eine alte Version cached (F12 → Application → Service Workers → Unregister, dann Reload).');
        return;
      }
      showStatus('Lade AI-Berater… (' + mountAttempts + '/' + MAX_MOUNT_ATTEMPTS + ')');
      setTimeout(mountIfReady, 200);
      return;
    }
    var props = buildProps();
    if (!props.adminUrl || !props.token) {
      showStatus('Bitte zuerst im finanztracker anmelden, dann Aktien-Tab erneut öffnen.');
      return;
    }
    mountAttempts = 0;
    showStatus('');
    if (!mountedOnce) {
      window.AIB.mount(Object.assign({ embedded: true }, props));
      mountedOnce = true;
    } else {
      window.AIB.updateProps(Object.assign({ embedded: true }, props));
    }
  }

  // Hook: jedesmal wenn der Aktien-Tab aktiv wird → mount/update Props.
  function patchGoTab() {
    if (typeof window.goTab !== 'function') {
      setTimeout(patchGoTab, 100);
      return;
    }
    if (window._goTabPatched) return;
    var orig = window.goTab;
    window.goTab = function (name) {
      var result = orig.apply(this, arguments);
      if (name === 'aktien') {
        setTimeout(mountIfReady, 50);
      }
      return result;
    };
    window._goTabPatched = true;
  }

  function autoMountOnLoad() {
    var tab = document.getElementById('tab-aktien');
    if (tab && tab.style.display !== 'none') mountIfReady();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      patchGoTab();
      autoMountOnLoad();
    });
  } else {
    patchGoTab();
    autoMountOnLoad();
  }

  // Stubs für alte portfolio.js-Funktionen, die woanders aufgerufen werden
  // könnten. No-ops, damit nichts crasht.
  var noopList = [
    'sdataLoad', 'sdataSave', 'syncKurseSheet', 'fetchStockPrice',
    'refreshAllPrices', 'renderAktien', 'renderAktienTabelle',
    'renderAktienCharts', 'renderAktienDashboardTop', 'renderAktienSummaryBar',
    'renderAktienFxRates', 'setAktienView', 'setAktienTabView',
    'setAktienTradeType', 'openNewAktieModal', 'updateAktienTotal',
    'saveAktienTradeFromEingabe', 'saveAktie', 'fetchYahooSearch',
  ];
  noopList.forEach(function (fn) {
    if (typeof window[fn] === 'undefined') window[fn] = function () {};
  });

  // Datenobjekte als no-op stubs.
  if (typeof window.SDATA === 'undefined') window.SDATA = { stocks: [], trades: [] };
  if (typeof window.PDATA === 'undefined') window.PDATA = { verlauf: [] };
  if (typeof window.stockPriceCache === 'undefined') window.stockPriceCache = {};
  if (typeof window.fxRateCache === 'undefined') window.fxRateCache = {};
})();
