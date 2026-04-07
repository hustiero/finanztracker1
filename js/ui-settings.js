/* ui-settings.js: Dynamic Nav + Settings Tab — split from js/ui.js */

// ═══════════════════════════════════════════════════════════════
// MODULE: DYNAMIC NAV
// ═══════════════════════════════════════════════════════════════
const NAV_LABELS = {
  dashboard:'Jahresüb.', verlauf:'Verlauf', monat:'Monat', aktien:'Aktien', lohn:'Lohn',
  dauerauftraege:'Aufträge', kategorien:'Kat.', einstellungen:'Einst.', groups:'Gruppen', sparen:'Sparen', oev:'ÖV'
};

function renderNav(){
  const pinned = CFG.pinnedTabs || [];
  [1,2,3].forEach(i=>{
    const key = pinned[i-1];
    const btn = document.getElementById('nav-slot'+i+'-btn');
    if(!btn) return;
    if(!key){ btn.style.display='none'; return; }
    btn.style.display='';
    btn.onclick = ()=>goTab(key);
    const tab = PINNABLE_TABS ? PINNABLE_TABS.find(t=>t.key===key) : null;
    const svgEl = btn.querySelector('svg');
    if(svgEl && tab) svgEl.innerHTML = tab.icon;
    const lblEl = btn.querySelector('span');
    if(lblEl) lblEl.textContent = NAV_LABELS[key]||key;
  });
  // Desktop sidebar
  if(typeof Device !== 'undefined') Device.renderSidebar();
}

// ═══════════════════════════════════════════════════════════════
// MODULE: SETTINGS TAB
// ═══════════════════════════════════════════════════════════════
function applySettings2(){
  CFG.scriptUrl = document.getElementById('s-url2').value.trim();
  CFG.demo = false;
  cfgSave();
  location.reload();
}

function setThemeMode(mode){
  CFG.themeMode = mode; // '' = dark, 'light' = light, 'auto' = auto
  cfgSave();
  applyThemeMode();
  updateThemeSegUI();
}

function applyThemeMode(){
  let effective = CFG.themeMode || '';
  if(effective === 'auto'){
    // Use system preference, fallback to time-based (6–20 = light)
    if(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches){
      effective = 'light';
    } else if(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches){
      effective = '';
    } else {
      const h = new Date().getHours();
      effective = (h >= 6 && h < 20) ? 'light' : '';
    }
  }
  document.documentElement.dataset.theme = effective;
  CFG.theme = effective;
  // Re-apply accent color so mode-dependent presets (e.g. Lime dark vs light) update
  if(typeof applyAccentColor === 'function') applyAccentColor();
  // Sync meta theme-color and desktop sidebar
  if(typeof Device !== 'undefined') Device.syncThemeColor();
}

function updateThemeSegUI(){
  const mode = CFG.themeMode || '';
  const order = ['dark','auto','light'];
  order.forEach((m,i)=>{
    const btn = document.getElementById('theme-btn-'+m);
    if(!btn) return;
    const isActive = (m==='dark' && mode==='') || (m==='auto' && mode==='auto') || (m==='light' && mode==='light');
    btn.style.background = isActive ? 'var(--accent)' : 'transparent';
    btn.style.color = isActive ? 'var(--bg0)' : 'var(--text2)';
    btn.style.fontWeight = isActive ? '600' : '400';
    // Only round corners on the edge buttons, not middle
    if(i===0) btn.style.borderRadius = '6px 0 0 6px';
    else if(i===order.length-1) btn.style.borderRadius = '0 6px 6px 0';
    else btn.style.borderRadius = '0';
  });
  const sub = document.getElementById('theme-mode-sub');
  if(sub) sub.textContent = mode==='auto' ? 'Wechselt automatisch je nach System/Tageszeit' : mode==='light' ? 'Helles Design' : 'Dunkles Design';
}

// Listen for system theme changes when in auto mode
if(window.matchMedia){
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ()=>{
    if(CFG.themeMode==='auto') applyThemeMode();
  });
}

function toggleSettingsGroup(id){
  const body = document.getElementById(id);
  if(!body) return;
  const btn = body.previousElementSibling;
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  body.style.display = isOpen ? 'none' : '';
  if(btn) btn.classList.toggle('open', !isOpen);
  // When opening the layout section, ensure design package previews are rendered
  if(id === 'sg-layout' && !isOpen){
    if(typeof renderDesignPackages === 'function') renderDesignPackages();
  }
}

// Toggle the "Weitere Optionen" expert customize section in settings
function toggleCustomizeSection(){
  const sec = document.getElementById('customize-section');
  if(!sec) return;
  const isOpen = sec.style.display !== 'none';
  sec.style.display = isOpen ? 'none' : '';
  const btn = document.getElementById('customize-toggle-btn');
  if(btn){
    const gearIcon = '<svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
    const chevronIcon = '<svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2"><polyline points="6 9 12 15 18 9"/></svg>';
    btn.innerHTML = isOpen ? gearIcon + ' Weitere Optionen' : chevronIcon + ' Weniger anzeigen';
  }
}

// Update the design summary text shown in quick tweaks area
function updateDesignSummary(){
  const el = document.getElementById('design-summary');
  if(!el) return;
  const pkgId = CFG.designPackageId;
  const pkg = typeof DESIGN_PACKAGES!=='undefined' && DESIGN_PACKAGES[pkgId];
  if(pkg){
    const mode = pkg.theme === 'light' ? 'Hell' : 'Dunkel';
    el.textContent = pkg.label + ' · ' + mode;
  } else if(CFG.designPackage){
    el.textContent = 'Benutzerdefiniert';
  } else {
    const parts = [];
    const hasImg = !!localStorage.getItem('ft_bg_image');
    if(hasImg) parts.push('Eigenes Bild');
    else if(CFG.bgPreset && BG_PRESETS[CFG.bgPreset]) parts.push(BG_PRESETS[CFG.bgPreset].label);
    else parts.push('Standard');
    if(CFG.glassEnabled) parts.push('Glass');
    el.textContent = parts.join(' · ');
  }
}

