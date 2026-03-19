// ═══════════════════════════════════════════════════════════════
// MODULE: DEVICE DETECTION & PLATFORM ADAPTATION
// Provides App.Device with isIOS, isAndroid, isDesktop, isStandalone
// Handles Android back-gesture via history.pushState / popstate
// Syncs theme-color meta tag with current design
// ═══════════════════════════════════════════════════════════════

const Device = (() => {
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';

  const isIOS = /iPhone|iPad|iPod/.test(ua) ||
    (platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const isAndroid = /Android/.test(ua);

  const isMobile = isIOS || isAndroid || /Mobile|webOS/.test(ua);

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
    || document.referrer.includes('android-app://');

  // Desktop = not mobile OR wide viewport (covers desktop browsers on any OS)
  let isDesktop = !isMobile;

  // Re-evaluate on resize (tablet in landscape, etc.)
  function _checkDesktop() {
    isDesktop = !isMobile && window.innerWidth >= 1024;
    document.body.classList.toggle('is-desktop', isDesktop);
    document.body.classList.toggle('is-mobile', isMobile);
  }

  // ── Platform classes on body ──
  function init() {
    const b = document.body;
    if (isIOS) b.classList.add('is-ios');
    if (isAndroid) b.classList.add('is-android');
    if (isStandalone) b.classList.add('is-standalone');
    _checkDesktop();
    window.addEventListener('resize', _checkDesktop);
    _initHistoryNav();
  }

  // ═════════════════════════════════════════════════════════════
  // HISTORY-BASED BACK NAVIGATION (Android gesture + browser back)
  // Pushes a state on every tab switch / modal open.
  // On popstate: close modal → go to previous tab → stay in app.
  // ═════════════════════════════════════════════════════════════
  const _navStack = []; // stack of {type:'tab'|'modal', id:string}

  function pushNav(type, id) {
    _navStack.push({ type, id });
    history.pushState({ ftNav: true, type, id }, '');
  }

  function _initHistoryNav() {
    // Push initial state so first "back" doesn't exit
    history.replaceState({ ftNav: true, type: 'tab', id: 'home' }, '');

    window.addEventListener('popstate', (e) => {
      const entry = _navStack.pop();
      if (!entry) {
        // Nothing left on our stack — push state back to prevent exit
        history.pushState({ ftNav: true, type: 'tab', id: 'home' }, '');
        return;
      }

      if (entry.type === 'modal') {
        // Close the most recently opened modal/overlay
        _closeTopModal(entry.id);
      } else if (entry.type === 'menu') {
        closeMenuOverlay();
      } else if (entry.type === 'monthview') {
        closeMonthView();
      } else if (entry.type === 'aktiedetail') {
        closeAktieDetail();
      } else if (entry.type === 'tab' && entry.id !== 'home') {
        goTab('home');
      }
      // If we consumed the event, ensure there's always a base state
      if (_navStack.length === 0) {
        history.replaceState({ ftNav: true, type: 'tab', id: 'home' }, '');
      }
    });
  }

  function _closeTopModal(id) {
    // Try specific modal ID first
    const el = document.getElementById(id);
    if (el && el.classList.contains('show')) {
      el.classList.remove('show');
      return;
    }
    // Fallback: close any visible modal-overlay
    const open = document.querySelector('.modal-overlay.show');
    if (open) { open.classList.remove('show'); return; }
    // Fallback: close menu overlay
    const menu = document.getElementById('menu-overlay');
    if (menu && menu.classList.contains('open')) { closeMenuOverlay(); return; }
    // Nothing to close — go home
    if (typeof currentTab !== 'undefined' && currentTab !== 'home') {
      goTab('home');
    }
  }

  // ═════════════════════════════════════════════════════════════
  // THEME-COLOR META TAG SYNC
  // Updates <meta name="theme-color"> to match current design
  // ═════════════════════════════════════════════════════════════
  function syncThemeColor() {
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    if (!metas.length) return;
    const isLight = document.documentElement.dataset.theme === 'light';
    let color;
    if (typeof BG_PRESETS !== 'undefined' && CFG.bgPreset && BG_PRESETS[CFG.bgPreset]) {
      color = BG_PRESETS[CFG.bgPreset].color;
    } else {
      color = isLight ? '#F4F4F7' : '#0D0D0F';
    }
    // Update all theme-color metas (the one without media and the light-scheme one)
    metas.forEach(m => m.setAttribute('content', color));
  }

  // ═════════════════════════════════════════════════════════════
  // DESKTOP SIDEBAR
  // Renders left-column navigation for desktop layouts
  // ═════════════════════════════════════════════════════════════
  const _sidebarTabs = [
    { id:'home',           icon:'<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>', label:'Home' },
    { id:'eingabe',        icon:'<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>', label:'Eingabe' },
    { id:'verlauf',        icon:'<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>', label:'Verlauf' },
    { id:'dashboard',      icon:'<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>', label:'Jahresübersicht' },
    { id:'lohn',           icon:'<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>', label:'Lohn & Einnahmen' },
    { id:'sparen',         icon:'<path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2"/><path d="M2 9.1C1.8 6.6 3.1 4.7 5.3 4"/>', label:'Sparen & Planen' },
    { id:'kategorien',     icon:'<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>', label:'Kategorien' },
    { id:'dauerauftraege', icon:'<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.08-4.36"/>', label:'Daueraufträge' },
    { id:'aktien',         icon:'<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>', label:'Aktien', needsAktien:true },
    { id:'einstellungen',  icon:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>', label:'Einstellungen' },
  ];

  function renderSidebar() {
    const el = document.getElementById('desktop-sidebar');
    if (!el) return;
    const activeTab = (typeof currentTab !== 'undefined') ? currentTab : 'home';
    const tabs = _sidebarTabs.filter(t => !t.needsAktien || (typeof CFG !== 'undefined' && CFG.aktienEnabled));

    el.innerHTML = `
      <div class="sidebar-logo">
        <div class="logo-circle">₣</div>
        <div class="sidebar-brand">F-Tracker</div>
      </div>
      <nav class="sidebar-nav">
        ${tabs.map(t => `
          <button class="sidebar-nav-btn${t.id === activeTab ? ' active' : ''}" onclick="goTab('${t.id}');Device.renderSidebar()">
            <svg viewBox="0 0 24 24">${t.icon}</svg>
            ${t.label}
          </button>
        `).join('')}
      </nav>
      <div class="sidebar-summary" id="sidebar-summary"></div>
    `;
  }

  return {
    get isIOS() { return isIOS; },
    get isAndroid() { return isAndroid; },
    get isDesktop() { return isDesktop; },
    get isMobile() { return isMobile; },
    get isStandalone() { return isStandalone; },
    init,
    pushNav,
    syncThemeColor,
    renderSidebar,
  };
})();
