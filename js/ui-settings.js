/* ui-settings.js: Dynamic Nav + Settings Tab — split from js/ui.js */

// ═══════════════════════════════════════════════════════════════
// MODULE: DYNAMIC NAV
// ═══════════════════════════════════════════════════════════════
const NAV_LABELS = {
  dashboard:'Jahresüb.', verlauf:'Verlauf', monat:'Monat', aktien:'Aktien', lohn:'Lohn',
  dauerauftraege:'Aufträge', kategorien:'Kat.', einstellungen:'Einst.',
  groups:'Gruppen', sparen:'Sparen'
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
}

// Toggle the "Anpassen" customize section in settings
function toggleCustomizeSection(){
  const sec = document.getElementById('customize-section');
  if(!sec) return;
  const isOpen = sec.style.display !== 'none';
  sec.style.display = isOpen ? 'none' : '';
  const btn = document.getElementById('customize-toggle-btn');
  if(btn) btn.innerHTML = isOpen
    ? '<svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Anpassen'
    : '<svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2"><polyline points="6 9 12 15 18 9"/></svg> Schliessen';
}

// Update the design summary text shown above the Anpassen button
function updateDesignSummary(){
  const el = document.getElementById('design-summary');
  if(!el) return;
  const pkgId = CFG.designPackageId;
  const pkg = typeof DESIGN_PACKAGES!=='undefined' && DESIGN_PACKAGES[pkgId];
  if(pkg){
    el.textContent = pkg.label + ' — Einzelne Einstellungen unten anpassen';
  } else if(CFG.designPackage){
    el.textContent = 'Benutzerdefiniert — Einzelne Einstellungen unten anpassen';
  } else {
    const parts = [];
    const hasImg = !!localStorage.getItem('ft_bg_image');
    if(hasImg) parts.push('Eigenes Bild');
    else if(CFG.bgPreset && BG_PRESETS[CFG.bgPreset]) parts.push(BG_PRESETS[CFG.bgPreset].label);
    else parts.push('Standard');
    if(CFG.glassEnabled) parts.push('Glass');
    if(CFG.fontColor && CFG.fontColor!=='standard' && FONT_COLOR_PRESETS[CFG.fontColor])
      parts.push(FONT_COLOR_PRESETS[CFG.fontColor].label);
    el.textContent = parts.join(' · ');
  }
}

