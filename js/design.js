// ═══════════════════════════════════════════════════════════════
// MODULE: HINTERGRUNDBILD + GLASSMORPHISM
// CFG keys: bgPreset, glassEnabled, glassBlur, glassAlpha
// BG image data stored separately in localStorage ('ft_bg_image')
// ═══════════════════════════════════════════════════════════════

// Preset background gradients (displayed as CSS gradient on body)
const BG_PRESETS = {
  // Dark presets
  aurora:   { label:'Aurora',   color:'#0d1a2e', gradient:'radial-gradient(ellipse 80% 60% at 20% 15%, #1a0a3e 0%, transparent 55%), radial-gradient(ellipse 60% 70% at 80% 80%, #0d2b2a 0%, transparent 55%), radial-gradient(ellipse 100% 100% at 50% 50%, #0a0a18 0%, #080810 100%)' },
  midnight: { label:'Midnight', color:'#080820', gradient:'radial-gradient(ellipse 70% 50% at 50% 0%, #1a1a4e 0%, transparent 65%), linear-gradient(180deg, #080820 0%, #0a0a2a 100%)' },
  forest:   { label:'Wald',     color:'#0a1a0e', gradient:'radial-gradient(ellipse 80% 60% at 30% 40%, #0d2a14 0%, transparent 65%), linear-gradient(160deg, #050e07 0%, #0f1f0e 100%)' },
  sunset:   { label:'Sunset',   color:'#2a1008', gradient:'radial-gradient(ellipse 70% 50% at 50% 0%, #3d1505 0%, transparent 55%), radial-gradient(ellipse 60% 40% at 80% 80%, #2a0a20 0%, transparent 55%), linear-gradient(160deg, #1a0808 0%, #2a100a 100%)' },
  ocean:    { label:'Ozean',    color:'#020d1e', gradient:'radial-gradient(ellipse 70% 50% at 20% 30%, #022a4e 0%, transparent 60%), radial-gradient(ellipse 60% 60% at 80% 70%, #01102a 0%, transparent 60%), linear-gradient(180deg, #010810 0%, #010d1e 100%)' },
  slate:    { label:'Slate',    color:'#0f1220', gradient:'radial-gradient(ellipse 60% 50% at 30% 20%, #1e2030 0%, transparent 55%), linear-gradient(160deg, #0d0f18 0%, #181a28 100%)' },
  // Light presets
  sky:      { label:'Sky',      color:'#c8e8f5', gradient:'radial-gradient(ellipse 80% 60% at 30% 20%, #b8d8f0 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 75% 85%, #d0e8f8 0%, transparent 55%), linear-gradient(160deg, #d4ecf8 0%, #e8f4fc 100%)' },
  blossom:  { label:'Blossom',  color:'#f5d8e8', gradient:'radial-gradient(ellipse 70% 50% at 25% 20%, #f0c0d8 0%, transparent 55%), radial-gradient(ellipse 60% 60% at 80% 80%, #e8d0f0 0%, transparent 55%), linear-gradient(160deg, #f8e0ec 0%, #f0e4f8 100%)' },
  sand:     { label:'Sand',     color:'#f0e8d0', gradient:'radial-gradient(ellipse 70% 50% at 40% 30%, #e8d8b8 0%, transparent 55%), linear-gradient(160deg, #f4ece0 0%, #ede4d4 100%)' },
  // Light counterparts of dark presets
  'aurora-light':   { label:'Aurora Hell',   color:'#d8e0f8', gradient:'radial-gradient(ellipse 80% 60% at 20% 15%, #c8b8f0 0%, transparent 55%), radial-gradient(ellipse 60% 70% at 80% 80%, #b8e8e0 0%, transparent 55%), radial-gradient(ellipse 100% 100% at 50% 50%, #e0e0f8 0%, #eeeef8 100%)' },
  'midnight-light': { label:'Midnight Hell', color:'#d0d0f0', gradient:'radial-gradient(ellipse 70% 50% at 50% 0%, #c0c0e8 0%, transparent 65%), linear-gradient(180deg, #d8d8f0 0%, #e4e4f8 100%)' },
  'forest-light':   { label:'Wald Hell',     color:'#d8f0dc', gradient:'radial-gradient(ellipse 80% 60% at 30% 40%, #b8e0c0 0%, transparent 65%), linear-gradient(160deg, #e0f4e4 0%, #d0ecd4 100%)' },
  'sunset-light':   { label:'Sunset Hell',   color:'#f8e0d0', gradient:'radial-gradient(ellipse 70% 50% at 50% 0%, #f0c8a0 0%, transparent 55%), radial-gradient(ellipse 60% 40% at 80% 80%, #f0d0e0 0%, transparent 55%), linear-gradient(160deg, #f8e8dc 0%, #f4dcd0 100%)' },
  'ocean-light':    { label:'Ozean Hell',    color:'#d0e8f8', gradient:'radial-gradient(ellipse 70% 50% at 20% 30%, #a8d4f0 0%, transparent 60%), radial-gradient(ellipse 60% 60% at 80% 70%, #c0daf0 0%, transparent 60%), linear-gradient(180deg, #d8ecf8 0%, #e0f0fc 100%)' },
  'slate-light':    { label:'Slate Hell',    color:'#e0e2ec', gradient:'radial-gradient(ellipse 60% 50% at 30% 20%, #d0d4e4 0%, transparent 55%), linear-gradient(160deg, #dcdee8 0%, #e8eaf0 100%)' },
};

// Font color presets — auto-applied with background presets
const FONT_COLOR_PRESETS = {
  standard:{ label:'Standard', primary:'#F0F0F5', secondary:'#9090A0', tertiary:'#5A5A6A' },
  warm:    { label:'Warm',     primary:'#FFF5E6', secondary:'#C8A882', tertiary:'#8A7060' },
  cool:    { label:'Kühl',     primary:'#E8F0FF', secondary:'#8AA0C0', tertiary:'#5A6A88' },
  mint:    { label:'Mint',     primary:'#E8FFF0', secondary:'#80C8A0', tertiary:'#507060' },
  light:   { label:'Hell',     primary:'#1A1A22', secondary:'#404050', tertiary:'#606070' },
};
// Map background presets to recommended font colors
const BG_FONT_MAP = {
  aurora:'cool', midnight:'cool', forest:'mint', sunset:'warm',
  ocean:'cool', slate:'standard',
  sky:'light', blossom:'light', sand:'light',
  'aurora-light':'light', 'midnight-light':'light', 'forest-light':'light',
  'sunset-light':'light', 'ocean-light':'light', 'slate-light':'light',
};

function applyFontColors(){
  const b = document.body;
  const c = CFG.fontColors || {};
  const hasCustom = !!(c.primary || c.secondary || c.tertiary);
  b.classList.toggle('has-custom-font', hasCustom);
  if(c.primary)   b.style.setProperty('--text',  c.primary);
  else b.style.removeProperty('--text');
  if(c.secondary) b.style.setProperty('--text2', c.secondary);
  else b.style.removeProperty('--text2');
  if(c.tertiary)  b.style.setProperty('--text3', c.tertiary);
  else b.style.removeProperty('--text3');
}
function setFontColorPreset(key){
  const p = FONT_COLOR_PRESETS[key];
  if(!p) return;
  CFG.fontColor = key;
  CFG.fontColors = {primary:p.primary, secondary:p.secondary, tertiary:p.tertiary};
  CFG.designPackageId = '_custom'; CFG.designPackage = null;
  cfgSave(); autoSyncProfile();
  applyFontColors();
  renderFontColorUI();
}
function setFontColorCustom(which, val){
  if(!CFG.fontColors) CFG.fontColors = {};
  CFG.fontColors[which] = val;
  CFG.fontColor = 'custom';
  cfgSave(); autoSyncProfile();
  applyFontColors();
}
function resetFontColors(){
  CFG.fontColor = '';
  CFG.fontColors = {};
  cfgSave(); autoSyncProfile();
  applyFontColors();
  renderFontColorUI();
}
function renderFontColorUI(){
  const grid = document.getElementById('font-color-presets');
  if(!grid) return;
  const cur = CFG.fontColor || '';
  grid.innerHTML = Object.entries(FONT_COLOR_PRESETS).map(([key,p])=>{
    const isActive = cur===key;
    return `<div onclick="setFontColorPreset('${key}')" style="
      height:32px;border-radius:6px;cursor:pointer;
      background:${key==='light'?'#f0f0f5':'#1a1a22'};
      border:2px solid ${isActive?'var(--accent)':'transparent'};
      display:flex;align-items:center;justify-content:center;
      font-size:9px;font-weight:600;color:${p.primary};
      transition:border .15s">${p.label}</div>`;
  }).join('');
  // Update custom pickers
  const fc = CFG.fontColors || {};
  const fp = document.getElementById('fc-primary');
  if(fp) fp.value = fc.primary || '#F0F0F5';
  const fs = document.getElementById('fc-secondary');
  if(fs) fs.value = fc.secondary || '#9090A0';
  const ft = document.getElementById('fc-tertiary');
  if(ft) ft.value = fc.tertiary || '#5A5A6A';
}

// ═══════════════════════════════════════════════════════════════
// ACCENT COLOR — customizable highlight / switch / active color
// ═══════════════════════════════════════════════════════════════
const ACCENT_PRESETS = [
  {label:'Lime',    dark:'#C8F53C', light:'#1B5FE8'},
  {label:'Blau',    dark:'#60A5FA', light:'#2563EB'},
  {label:'Cyan',    dark:'#22D3EE', light:'#0891B2'},
  {label:'Grün',    dark:'#3DDB96', light:'#059669'},
  {label:'Pink',    dark:'#F472B6', light:'#DB2777'},
  {label:'Violett', dark:'#A78BFA', light:'#7C3AED'},
  {label:'Orange',  dark:'#FB923C', light:'#EA580C'},
  {label:'Rot',     dark:'#FF4D6D', light:'#DC2626'},
  {label:'Gold',    dark:'#FFD166', light:'#B45309'},
  {label:'Weiss',   dark:'#E0E0E8', light:'#333340'},
];

function applyAccentColor(){
  const root = document.documentElement;
  const isLight = root.dataset.theme === 'light';
  // When no custom accent is set, use the Lime preset's mode-appropriate default
  // rather than letting the CSS fallback always use the dark-mode value.
  const c = CFG.accentColor || (isLight ? ACCENT_PRESETS[0].light : ACCENT_PRESETS[0].dark);
  root.style.setProperty('--accent', c);
  root.style.setProperty('--accent2', _darkenHex(c, 20));
  root.style.setProperty('--glow-accent', c + '0F');
}

function setAccentColor(color){
  CFG.accentColor = color || '';
  CFG.designPackageId = '_custom'; CFG.designPackage = null;
  cfgSave(); autoSyncProfile();
  applyAccentColor();
  // Auto-update btn-text contrast unless manually overridden
  if(!CFG.btnTextColorManual) applyDesignVars();
  renderAccentColorUI();
}
function resetAccentColor(){
  CFG.accentColor = '';
  cfgSave(); autoSyncProfile();
  applyAccentColor();
  renderAccentColorUI();
}
function renderAccentColorUI(){
  const grid = document.getElementById('accent-color-presets');
  if(!grid) return;
  const isLight = document.documentElement.dataset.theme === 'light';
  const cur = CFG.accentColor || '';
  grid.innerHTML = ACCENT_PRESETS.map(p => {
    const c = isLight ? p.light : p.dark;
    const isActive = cur === c;
    return `<div onclick="setAccentColor('${c}')" style="
      width:100%;height:30px;border-radius:6px;cursor:pointer;
      background:${c};
      border:2px solid ${isActive ? 'var(--text)' : 'transparent'};
      display:flex;align-items:center;justify-content:center;
      font-size:8px;font-weight:700;color:${_contrastText(c)};
      transition:border .15s">${p.label}</div>`;
  }).join('');
  const picker = document.getElementById('accent-custom-picker');
  if(picker) picker.value = cur || (isLight ? '#1B5FE8' : '#C8F53C');
}
function _contrastText(hex){
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return (r*0.299 + g*0.587 + b*0.114) > 150 ? '#000' : '#fff';
}
function _darkenHex(hex, amt){
  let r = Math.max(0, parseInt(hex.slice(1,3),16) - amt);
  let g = Math.max(0, parseInt(hex.slice(3,5),16) - amt);
  let b = Math.max(0, parseInt(hex.slice(5,7),16) - amt);
  return '#' + [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
}

// ═══════════════════════════════════════════════════════════════
// TEXT GLOW INTENSITY — 0 (off) to 100 (full)
// ═══════════════════════════════════════════════════════════════
function applyTextGlow(){
  const v = (CFG.textGlow ?? 100) / 100;
  document.documentElement.style.setProperty('--text-glow-intensity', v.toFixed(2));
}
function updateTextGlow(val){
  CFG.textGlow = +val;
  cfgSave();
  applyTextGlow();
  const lbl = document.getElementById('text-glow-val');
  if(lbl) lbl.textContent = val + '%';
}

// Check if backdrop-filter is supported
const GLASS_SUPPORTED = CSS.supports('backdrop-filter','blur(1px)') || CSS.supports('-webkit-backdrop-filter','blur(1px)');

function _getBgImageData(){ return localStorage.getItem('ft_bg_image')||''; }
function _saveBgImageData(d){ if(d) localStorage.setItem('ft_bg_image',d); else localStorage.removeItem('ft_bg_image'); }

// Apply background image + glass to DOM
function applyAppBackground(){
  const body = document.body;
  const html = document.documentElement;
  const imgData = _getBgImageData();
  const hasBg = !!(imgData || CFG.bgPreset);
  let bgValue = '';
  if(imgData){
    bgValue = `url("${imgData.replace(/"/g,'')}")`;
  } else if(CFG.bgPreset && BG_PRESETS[CFG.bgPreset]){
    bgValue = BG_PRESETS[CFG.bgPreset].gradient;
  }
  body.style.backgroundImage = bgValue;
  // Sync html element so overscroll areas show the same background (no white flash)
  html.style.backgroundImage = bgValue;
  html.style.backgroundSize = hasBg ? 'cover' : '';
  html.style.backgroundPosition = hasBg ? 'center' : '';
  html.style.backgroundAttachment = hasBg ? 'fixed' : '';
  body.classList.toggle('has-bg-image', hasBg);
  // Glass requires both glassEnabled AND a background to show through
  const glassOn = CFG.glassEnabled && GLASS_SUPPORTED && hasBg;
  body.classList.toggle('glass-on', glassOn);
  body.classList.toggle('glass-clean', glassOn && !!CFG.glassClean);
  _updateGlassCssVars();
  _applyBgBlur();
  applyAccentColor();
  applyDesignVars();
  applyTextGlow();
  if(typeof Device !== 'undefined') Device.syncThemeColor();
}

// Set CSS variables from CFG
function _updateGlassCssVars(){
  const root = document.documentElement;
  const blur = CFG.glassBlur||12;
  const alpha = (CFG.glassAlpha||12)/100;
  root.style.setProperty('--glass-blur', blur+'px');
  root.style.setProperty('--glass-alpha', alpha.toFixed(3));
  root.style.setProperty('--glass-nav-alpha', Math.min(alpha*1.5, 0.92).toFixed(3));
  root.style.setProperty('--glass-bar-alpha', Math.min(alpha*1.3, 0.92).toFixed(3));
  root.style.setProperty('--glass-border-alpha', Math.min(alpha*0.8, 0.35).toFixed(3));
  // Boost text contrast when glass opacity is high
  if(document.body.classList.contains('glass-on')){
    const isLight = root.dataset.theme==='light';
    // As alpha increases, text needs more contrast against the glass background
    // Dark mode: glass-rgb is dark → push text lighter
    // Light mode: glass-rgb is light → push text darker
    if(alpha > 0.20){
      const boost = Math.min((alpha - 0.20) * 2.5, 1); // 0→1 as alpha 20%→60%
      if(isLight){
        // Darken text
        const t1 = Math.round(24 - boost * 20);
        const t2 = Math.round(80 - boost * 50);
        const t3 = Math.round(144 - boost * 60);
        root.style.setProperty('--text', `rgb(${t1},${t1},${t1+6})`);
        root.style.setProperty('--text2', `rgb(${t2},${t2},${t2+14})`);
        root.style.setProperty('--text3', `rgb(${t3},${t3},${t3+12})`);
      } else {
        // Lighten text
        const t1 = Math.round(240 + boost * 15);
        const t2 = Math.round(144 + boost * 80);
        const t3 = Math.round(90 + boost * 100);
        root.style.setProperty('--text', `rgb(${Math.min(t1,255)},${Math.min(t1,255)},${Math.min(t1+5,255)})`);
        root.style.setProperty('--text2', `rgb(${Math.min(t2,240)},${Math.min(t2,240)},${Math.min(t2+16,255)})`);
        root.style.setProperty('--text3', `rgb(${Math.min(t3,200)},${Math.min(t3,200)},${Math.min(t3+16,216)})`);
      }
    } else {
      // Reset to default
      root.style.removeProperty('--text');
      root.style.removeProperty('--text2');
      root.style.removeProperty('--text3');
    }
  } else {
    root.style.removeProperty('--text');
    root.style.removeProperty('--text2');
    root.style.removeProperty('--text3');
  }
}

// Select a preset (or '' to clear)
function setBgPreset(key){
  CFG.bgPreset = key;
  CFG.designPackageId = '_custom'; CFG.designPackage = null; // manual override
  _saveBgImageData(''); // clear custom image when choosing preset
  // Auto-apply matching font color preset
  const fcKey = BG_FONT_MAP[key];
  if(fcKey && FONT_COLOR_PRESETS[fcKey]){
    const p = FONT_COLOR_PRESETS[fcKey];
    CFG.fontColor = fcKey;
    CFG.fontColors = {primary:p.primary, secondary:p.secondary, tertiary:p.tertiary};
    applyFontColors();
  }
  cfgSave(); autoSyncProfile();
  applyAppBackground();
  renderErscheinungsbild();
  renderFontColorUI();
}

// Clear all backgrounds
function clearBgImage(){
  CFG.bgPreset = '';
  CFG.bgImgBlur = 0;
  CFG.designPackageId = '_custom'; CFG.designPackage = null;
  _saveBgImageData('');
  cfgSave(); autoSyncProfile();
  applyAppBackground();
  renderErscheinungsbild();
}

// Trigger file picker
function triggerBgUpload(){
  document.getElementById('bg-file-input')?.click();
}

// Load selected image file — resize to max 1200px to stay within localStorage limits
function loadBgFile(input){
  const file = input.files?.[0]; if(!file) return;
  const img = new Image();
  img.onload = () => {
    const MAX = 1200;
    let w = img.width, h = img.height;
    if(w > MAX || h > MAX){
      const scale = MAX / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    const data = canvas.toDataURL('image/jpeg', 0.8);
    try{
      _saveBgImageData(data);
    }catch(e){
      toast('Bild zu gross für lokalen Speicher','err');
      input.value = '';
      URL.revokeObjectURL(img.src);
      return;
    }
    CFG.bgPreset = '';
    CFG.designPackageId = '_custom'; CFG.designPackage = null;
    cfgSave(); autoSyncProfile();
    applyAppBackground();
    renderErscheinungsbild();
    input.value = '';
    URL.revokeObjectURL(img.src);
  };
  img.onerror = () => { toast('Bild konnte nicht geladen werden','err'); input.value = ''; };
  img.src = URL.createObjectURL(file);
}

// Toggle glass effect
function toggleGlass(){
  if(!GLASS_SUPPORTED){ toast('Gerät unterstützt backdrop-filter nicht','err'); return; }
  CFG.glassEnabled = !CFG.glassEnabled;
  if(!CFG.glassEnabled) CFG.glassClean = false;
  CFG.designPackageId = '_custom'; CFG.designPackage = null;
  cfgSave(); autoSyncProfile();
  applyAppBackground();
  renderErscheinungsbild();
}
function toggleGlassClean(){
  CFG.glassClean = !CFG.glassClean;
  document.body.classList.toggle('glass-clean', CFG.glassClean && CFG.glassEnabled);
  cfgSave(); autoSyncProfile();
  renderErscheinungsbild();
}

// Update blur from slider
function updateGlassBlur(val){
  CFG.glassBlur = +val;
  cfgSave();
  _updateGlassCssVars();
  const lbl = document.getElementById('glass-blur-val');
  if(lbl) lbl.textContent = val+'px';
}

// Update alpha from slider
function updateGlassAlpha(val){
  CFG.glassAlpha = +val;
  cfgSave();
  _updateGlassCssVars();
  const lbl = document.getElementById('glass-alpha-val');
  if(lbl) lbl.textContent = val+'%';
}

// Update background image blur from slider
function updateBgBlur(val){
  CFG.bgImgBlur = +val;
  cfgSave();
  _applyBgBlur();
  const lbl = document.getElementById('bg-blur-val');
  if(lbl) lbl.textContent = val+'px';
}
function _applyBgBlur(){
  const blur = CFG.bgImgBlur||0;
  document.documentElement.style.setProperty('--bg-img-blur', blur+'px');
  document.body.classList.toggle('bg-blurred', blur>0);
}

// ═══════════════════════════════════════════════════════════════
// GLASS INTENSITY — combined single slider for quick tweaks
// Maps 0-100 to blur (2-30) + alpha (2-80)
// ═══════════════════════════════════════════════════════════════
function _glassIntensityFromCfg(){
  // Reverse-map current blur+alpha to a 0-100 intensity value
  const blur = CFG.glassBlur || 12;
  const alpha = CFG.glassAlpha || 12;
  // Weighted average: blur contributes 40%, alpha 60%
  const blurPct = (blur - 2) / (30 - 2) * 100;
  const alphaPct = (alpha - 2) / (80 - 2) * 100;
  return Math.round(blurPct * 0.4 + alphaPct * 0.6);
}
function updateGlassIntensity(val){
  // Map 0-100 to blur and alpha ranges
  const t = val / 100;
  const blur = Math.round(2 + t * (30 - 2));
  const alpha = Math.round(2 + t * (80 - 2));
  CFG.glassBlur = blur;
  CFG.glassAlpha = alpha;
  cfgSave();
  _updateGlassCssVars();
  // Sync expert sliders if visible
  const blurSlider = document.getElementById('glass-blur-slider');
  if(blurSlider) blurSlider.value = blur;
  const blurVal = document.getElementById('glass-blur-val');
  if(blurVal) blurVal.textContent = blur+'px';
  const alphaSlider = document.getElementById('glass-alpha-slider');
  if(alphaSlider) alphaSlider.value = alpha;
  const alphaVal = document.getElementById('glass-alpha-val');
  if(alphaVal) alphaVal.textContent = alpha+'%';
  // Update intensity label
  const lbl = document.getElementById('glass-intensity-val');
  if(lbl) lbl.textContent = val+'%';
}

// Render the Erscheinungsbild section in settings
function renderErscheinungsbild(){
  const grid = document.getElementById('bg-preset-grid'); if(!grid) return;
  const currentPreset = CFG.bgPreset||'';
  const hasCustom = !!_getBgImageData();

  grid.innerHTML = Object.entries(BG_PRESETS).map(([key, p])=>{
    const isActive = !hasCustom && currentPreset===key;
    const isLightBg = key.includes('-light') || ['sky','blossom','sand'].includes(key);
    const txtColor = isLightBg ? 'rgba(30,30,40,0.85)' : 'rgba(255,255,255,0.75)';
    const txtShadow = isLightBg ? '0 1px 3px rgba(255,255,255,.5)' : '0 1px 3px rgba(0,0,0,.8)';
    return `<div onclick="setBgPreset('${key}')" style="
      height:52px;border-radius:var(--r2);cursor:pointer;
      background:${p.gradient};
      border:2px solid ${isActive?'var(--accent)':'transparent'};
      transition:border .15s;position:relative;overflow:hidden">
      <div style="position:absolute;bottom:4px;left:0;right:0;text-align:center;font-size:10px;font-weight:600;color:${txtColor};text-shadow:${txtShadow}">${p.label}</div>
    </div>`;
  }).join('');

  // Glass toggle (quick tweaks)
  const sw = document.getElementById('glass-enabled-sw');
  if(sw) sw.classList.toggle('on', !!CFG.glassEnabled);

  // Glass intensity slider (quick tweaks)
  const intensitySlider = document.getElementById('glass-intensity-slider');
  if(intensitySlider) intensitySlider.value = _glassIntensityFromCfg();
  const intensityVal = document.getElementById('glass-intensity-val');
  if(intensityVal) intensityVal.textContent = _glassIntensityFromCfg()+'%';

  // Expert: blur/alpha sliders
  const blurSlider = document.getElementById('glass-blur-slider');
  if(blurSlider) blurSlider.value = CFG.glassBlur||12;
  const blurVal = document.getElementById('glass-blur-val');
  if(blurVal) blurVal.textContent = (CFG.glassBlur||12)+'px';

  const alphaSlider = document.getElementById('glass-alpha-slider');
  if(alphaSlider) alphaSlider.value = CFG.glassAlpha||12;
  const alphaVal = document.getElementById('glass-alpha-val');
  if(alphaVal) alphaVal.textContent = (CFG.glassAlpha||12)+'%';

  const cleanSw = document.getElementById('glass-clean-sw');
  if(cleanSw) cleanSw.classList.toggle('on', !!CFG.glassClean);

  // Hint if glass not supported
  if(!GLASS_SUPPORTED){
    if(sw) sw.style.opacity='0.4';
  }

  // Background image blur slider (only visible when custom image is set)
  const bgBlurSection = document.getElementById('bg-blur-section');
  if(bgBlurSection) bgBlurSection.style.display = hasCustom ? '' : 'none';
  const bgBlurSlider = document.getElementById('bg-blur-slider');
  if(bgBlurSlider) bgBlurSlider.value = CFG.bgImgBlur||0;
  const bgBlurVal = document.getElementById('bg-blur-val');
  if(bgBlurVal) bgBlurVal.textContent = (CFG.bgImgBlur||0)+'px';
  // Text glow slider
  const glowSlider = document.getElementById('text-glow-slider');
  if(glowSlider) glowSlider.value = CFG.textGlow ?? 100;
  const glowVal = document.getElementById('text-glow-val');
  if(glowVal) glowVal.textContent = (CFG.textGlow ?? 100) + '%';

  renderFontColorUI();
  renderAccentColorUI();
  renderDesignVarsUI();
  renderDesignPackages();
  updateDesignSummary();
}

function renderEinstellungen(){
  renderErscheinungsbild();
  const urlEl = document.getElementById('s-url2');
  if(urlEl) urlEl.value = CFG.scriptUrl||'';
  const nameEl = document.getElementById('s-username');
  if(nameEl) nameEl.value = CFG.userName||'';
  updateThemeSegUI();
  const aktEnabledSw = document.getElementById('aktien-enabled-sw');
  if(aktEnabledSw) aktEnabledSw.classList.toggle('on', !!CFG.aktienEnabled);
  const aktBilanzRow = document.getElementById('aktien-bilanz-row');
  if(aktBilanzRow) aktBilanzRow.style.display = CFG.aktienEnabled ? '' : 'none';
  const aktBilanzSw = document.getElementById('aktien-bilanz-sw');
  if(aktBilanzSw) aktBilanzSw.classList.toggle('on', !!CFG.aktienInBilanz);
  const oevEnabledSw = document.getElementById('oev-enabled-sw');
  if(oevEnabledSw) oevEnabledSw.classList.toggle('on', !!CFG.oevEnabled);
  const oevSubRows = document.getElementById('oev-settings-subrows');
  if(oevSubRows) oevSubRows.style.display = CFG.oevEnabled ? '' : 'none';
  if(CFG.oevEnabled && typeof renderOevSettings==='function') renderOevSettings();
  const currSel = document.getElementById('s-currency');
  if(currSel) currSel.value = curr();

  // Account-Bereich
  const isAccountMode = !!(CFG.sessionToken && CFG.adminUrl);
  const accSection = document.getElementById('settings-account-section');
  const urlSection = document.getElementById('settings-url-section');
  if(accSection) accSection.style.display = isAccountMode ? '' : 'none';
  if(urlSection) urlSection.style.display = isAccountMode ? 'none' : '';
  if(isAccountMode){
    const nameD = document.getElementById('settings-auth-name');
    if(nameD) nameD.textContent = CFG.authUser||'–';
    const roleD = document.getElementById('settings-auth-role');
    if(roleD) roleD.textContent = CFG.authRole==='admin' ? '👑 Admin' : 'Benutzer';
    const adminLink = document.getElementById('settings-admin-link');
    if(adminLink) adminLink.style.display = CFG.authRole==='admin' ? '' : 'none';
  }
  // Render notification settings as part of Einstellungen tab
  if(typeof renderNotifSettings === 'function') renderNotifSettings();
}

// ═══════════════════════════════════════════════════════════════
// DESIGN PACKAGES — bundled presets (bg + glass + fonts + theme)
// ═══════════════════════════════════════════════════════════════
const DESIGN_PACKAGES = {
  // ── Dark themes ──
  aurora:    { label:'Aurora',    theme:'dark',  bg:'aurora',   glass:true, blur:12, alpha:12, clean:false, font:'cool',     accent:'' },
  midnight:  { label:'Midnight',  theme:'dark',  bg:'midnight', glass:true, blur:14, alpha:15, clean:false, font:'cool',     accent:'' },
  forest:    { label:'Wald',      theme:'dark',  bg:'forest',   glass:true, blur:12, alpha:12, clean:false, font:'mint',     accent:'#3DDB96' },
  sunset:    { label:'Sunset',    theme:'dark',  bg:'sunset',   glass:true, blur:12, alpha:14, clean:false, font:'warm',     accent:'#FB923C' },
  ocean:     { label:'Ozean',     theme:'dark',  bg:'ocean',    glass:true, blur:14, alpha:12, clean:false, font:'cool',     accent:'#60A5FA' },
  slate:     { label:'Slate',     theme:'dark',  bg:'slate',    glass:true, blur:10, alpha:10, clean:false, font:'standard', accent:'' },
  minimal:   { label:'Minimal',   theme:'dark',  bg:'',         glass:false,blur:12, alpha:12, clean:false, font:'standard', accent:'' },
  // ── Light themes ──
  'aurora-light':   { label:'Aurora',    theme:'light', bg:'aurora-light',   glass:true, blur:12, alpha:14, clean:false, font:'light', accent:'#7C3AED' },
  'midnight-light': { label:'Midnight',  theme:'light', bg:'midnight-light', glass:true, blur:14, alpha:16, clean:false, font:'light', accent:'#2563EB' },
  'forest-light':   { label:'Wald',      theme:'light', bg:'forest-light',   glass:true, blur:12, alpha:14, clean:false, font:'light', accent:'#059669' },
  'sunset-light':   { label:'Sunset',    theme:'light', bg:'sunset-light',   glass:true, blur:12, alpha:14, clean:false, font:'light', accent:'#EA580C' },
  'ocean-light':    { label:'Ozean',     theme:'light', bg:'ocean-light',    glass:true, blur:14, alpha:14, clean:false, font:'light', accent:'#2563EB' },
  'slate-light':    { label:'Slate',     theme:'light', bg:'slate-light',    glass:true, blur:10, alpha:12, clean:false, font:'light', accent:'' },
  sky:       { label:'Sky',       theme:'light', bg:'sky',      glass:true, blur:12, alpha:12, clean:false, font:'light',    accent:'' },
  blossom:   { label:'Blossom',   theme:'light', bg:'blossom',  glass:true, blur:12, alpha:14, clean:false, font:'light',    accent:'#DB2777' },
  sand:      { label:'Sand',      theme:'light', bg:'sand',     glass:true, blur:10, alpha:10, clean:false, font:'light',    accent:'' },
  hell:      { label:'Hell',      theme:'light', bg:'',         glass:false,blur:12, alpha:12, clean:false, font:'light',    accent:'' },
};

function applyDesignPackage(pkgId){
  const pkg = DESIGN_PACKAGES[pkgId];
  if(!pkg) return;
  CFG.designPackageId = pkgId;
  CFG.designPackage = null; // not a custom package
  // Apply theme
  CFG.themeMode = pkg.theme;
  applyThemeMode();
  updateThemeSegUI();
  // Apply background
  CFG.bgPreset = pkg.bg;
  localStorage.removeItem('ft_bg_image'); // clear custom image
  // Apply glass
  CFG.glassEnabled = pkg.glass;
  CFG.glassBlur = pkg.blur;
  CFG.glassAlpha = pkg.alpha;
  CFG.glassClean = pkg.clean;
  // Apply font colors
  const fc = FONT_COLOR_PRESETS[pkg.font];
  if(fc){
    CFG.fontColor = pkg.font;
    CFG.fontColors = {primary:fc.primary, secondary:fc.secondary, tertiary:fc.tertiary};
  }
  // Apply accent color from package (or reset to default)
  CFG.accentColor = pkg.accent || '';
  CFG.textGlow = 100;
  CFG.btnTextColor = '';
  CFG.btnTextColorManual = false;
  CFG.cardBgColor = '';
  CFG.navBgColor = '';
  CFG.panelBgColor = '';
  cfgSave(); autoSyncProfile();
  applyFontColors();
  applyAppBackground();
  renderDesignPackages();
  renderErscheinungsbild();
}

// Current filter for design studio: 'all', 'dark', 'light'
let _designFilter = 'all';

function setDesignFilter(filter){
  _designFilter = filter;
  renderDesignPackages();
  // Update filter tab UI
  document.querySelectorAll('.ds-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
}

function _buildMockupSVG(pkg){
  const isLight = pkg.theme === 'light';
  const fc = FONT_COLOR_PRESETS[pkg.font] || FONT_COLOR_PRESETS.standard;
  const accent = pkg.accent || (isLight ? '#1B5FE8' : '#C8F53C');
  const cardBg = isLight ? 'rgba(255,255,255,0.55)' : 'rgba(20,20,26,0.55)';
  const navBg = isLight ? 'rgba(255,255,255,0.7)' : 'rgba(15,15,18,0.7)';
  const textCol = fc.primary;
  const textCol2 = fc.secondary;
  // Mini app mockup: top bar, 2 cards, nav bar
  return `<svg viewBox="0 0 120 160" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block">
    <!-- Top bar -->
    <rect x="0" y="0" width="120" height="22" rx="0" fill="${navBg}"/>
    <text x="10" y="15" font-size="8" font-weight="600" fill="${textCol}" font-family="system-ui">Home</text>
    <circle cx="106" cy="11" r="4" fill="${accent}" opacity="0.6"/>
    <!-- Card 1 -->
    <rect x="8" y="28" width="104" height="38" rx="6" fill="${cardBg}"/>
    <text x="16" y="42" font-size="6" fill="${textCol2}" font-family="system-ui">Bilanz</text>
    <text x="16" y="56" font-size="10" font-weight="700" fill="${textCol}" font-family="system-ui">2'450.00</text>
    <rect x="76" y="36" width="28" height="12" rx="3" fill="${accent}" opacity="0.8"/>
    <!-- Card 2 -->
    <rect x="8" y="72" width="104" height="28" rx="6" fill="${cardBg}"/>
    <rect x="16" y="80" width="32" height="5" rx="2" fill="${accent}" opacity="0.5"/>
    <rect x="16" y="88" width="50" height="4" rx="2" fill="${textCol2}" opacity="0.3"/>
    <!-- Bar chart hint -->
    <rect x="8" y="106" width="104" height="26" rx="6" fill="${cardBg}"/>
    <rect x="16" y="116" width="8" height="10" rx="1" fill="${accent}" opacity="0.4"/>
    <rect x="28" y="112" width="8" height="14" rx="1" fill="${accent}" opacity="0.6"/>
    <rect x="40" y="118" width="8" height="8" rx="1" fill="${accent}" opacity="0.3"/>
    <rect x="52" y="110" width="8" height="16" rx="1" fill="${accent}" opacity="0.7"/>
    <rect x="64" y="114" width="8" height="12" rx="1" fill="${accent}" opacity="0.5"/>
    <!-- Nav bar -->
    <rect x="0" y="138" width="120" height="22" rx="0" fill="${navBg}"/>
    <circle cx="20" cy="149" r="3" fill="${accent}"/>
    <circle cx="45" cy="149" r="3" fill="${textCol2}" opacity="0.3"/>
    <circle cx="75" cy="149" r="3" fill="${textCol2}" opacity="0.3"/>
    <circle cx="100" cy="149" r="3" fill="${textCol2}" opacity="0.3"/>
  </svg>`;
}

function renderDesignPackages(){
  const grid = document.getElementById('design-pkg-grid');
  if(!grid) return;
  const cur = CFG.designPackageId || '';
  const entries = Object.entries(DESIGN_PACKAGES).filter(([id, pkg]) => {
    if(_designFilter === 'dark') return pkg.theme === 'dark';
    if(_designFilter === 'light') return pkg.theme === 'light';
    return true;
  });
  grid.innerHTML = entries.map(([id, pkg])=>{
    const isActive = cur === id;
    const preset = BG_PRESETS[pkg.bg];
    const bgStyle = preset
      ? `background:${preset.gradient}`
      : (pkg.theme==='light' ? 'background:#e8e8f0' : 'background:#1a1a22');
    const isLight = pkg.theme === 'light';
    const nameColor = isLight ? 'rgba(30,30,40,0.9)' : 'rgba(255,255,255,0.9)';
    const nameShadow = isLight ? '0 1px 3px rgba(255,255,255,.5)' : '0 1px 4px rgba(0,0,0,.7)';
    const badgeLabel = isLight ? 'Hell' : 'Dunkel';
    const badgeBg = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.12)';
    const badgeColor = isLight ? 'rgba(30,30,40,0.7)' : 'rgba(255,255,255,0.7)';
    return `<div class="design-pkg-card${isActive?' active':''}" onclick="applyDesignPackage('${id}')">
      <div class="design-pkg-preview" style="${bgStyle}">
        <div class="design-pkg-mockup">${_buildMockupSVG(pkg)}</div>
        <div class="design-pkg-check"><svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:#fff;fill:none;stroke-width:3"><polyline points="20 6 9 17 4 12"/></svg></div>
      </div>
      <div class="design-pkg-info">
        <span class="design-pkg-name" style="color:${nameColor};text-shadow:${nameShadow}">${pkg.label}</span>
        <span class="design-pkg-badge" style="background:${badgeBg};color:${badgeColor}">${badgeLabel}</span>
      </div>
    </div>`;
  }).join('');
}

// Migrate old flat design fields into a custom design package object
function migrateOldDesignToPkg(){
  // Only called if no designPackageId/designPackage set — check if user had custom settings
  const hasBg = !!(CFG.bgPreset || localStorage.getItem('ft_bg_image'));
  const hasGlass = !!CFG.glassEnabled;
  const hasFont = !!(CFG.fontColor && CFG.fontColor !== 'standard');
  if(!hasBg && !hasGlass && !hasFont) return null;
  // Check if settings match a known package
  for(const [id, pkg] of Object.entries(DESIGN_PACKAGES)){
    if(pkg.bg === (CFG.bgPreset||'') && pkg.glass === !!CFG.glassEnabled &&
       pkg.font === (CFG.fontColor||'standard') && !localStorage.getItem('ft_bg_image')){
      CFG.designPackageId = id;
      cfgSave();
      return null; // matched a known package, no custom needed
    }
  }
  // Return a custom snapshot
  return {
    bg: CFG.bgPreset||'',
    glass: !!CFG.glassEnabled,
    blur: CFG.glassBlur||12,
    alpha: CFG.glassAlpha||12,
    clean: !!CFG.glassClean,
    font: CFG.fontColor||'standard',
    fontColors: CFG.fontColors||{},
    theme: CFG.themeMode||'dark',
  };
}

// ═══════════════════════════════════════════════════════════════
// DESIGN VARIABLES — btn-text, card-bg, nav-bg, panel-bg
// ═══════════════════════════════════════════════════════════════

/**
 * Apply all design variables from CFG to CSS custom properties.
 * Called from applyAppBackground() so every theme change picks them up.
 */
function applyDesignVars(){
  const root = document.documentElement;
  // Button text color
  if(CFG.btnTextColor){
    root.style.setProperty('--btn-text', CFG.btnTextColor);
    root.style.setProperty('--btn-text-muted', CFG.btnTextColor);
  } else {
    // Auto-contrast from accent color
    const accent = getComputedStyle(root).getPropertyValue('--accent').trim() || '#C8F53C';
    const auto = _contrastText(accent);
    root.style.setProperty('--btn-text', auto);
    root.style.setProperty('--btn-text-muted', auto);
  }
  // Card background
  if(CFG.cardBgColor) root.style.setProperty('--card-bg', CFG.cardBgColor);
  else root.style.removeProperty('--card-bg');
  // Nav background
  if(CFG.navBgColor) root.style.setProperty('--nav-bg', CFG.navBgColor);
  else root.style.removeProperty('--nav-bg');
  // Panel background
  if(CFG.panelBgColor) root.style.setProperty('--panel-bg', CFG.panelBgColor);
  else root.style.removeProperty('--panel-bg');
}

// ── Setters & resetters ──────────────────────────────────────
function setBtnTextColor(color){
  CFG.btnTextColor = color || '';
  CFG.btnTextColorManual = !!color;
  CFG.designPackageId = '_custom'; CFG.designPackage = null;
  cfgSave(); autoSyncProfile();
  applyDesignVars();
  renderDesignVarsUI();
}
function resetBtnTextColor(){
  CFG.btnTextColor = '';
  CFG.btnTextColorManual = false;
  cfgSave(); autoSyncProfile();
  applyDesignVars();
  renderDesignVarsUI();
}
function setCardBgColor(color){
  CFG.cardBgColor = color || '';
  CFG.designPackageId = '_custom'; CFG.designPackage = null;
  cfgSave(); autoSyncProfile();
  applyDesignVars();
  renderDesignVarsUI();
}
function resetCardBgColor(){
  CFG.cardBgColor = '';
  cfgSave(); autoSyncProfile();
  applyDesignVars();
  renderDesignVarsUI();
}
function setPanelBgColor(color){
  CFG.panelBgColor = color || '';
  CFG.designPackageId = '_custom'; CFG.designPackage = null;
  cfgSave(); autoSyncProfile();
  applyDesignVars();
  renderDesignVarsUI();
}
function resetPanelBgColor(){
  CFG.panelBgColor = '';
  cfgSave(); autoSyncProfile();
  applyDesignVars();
  renderDesignVarsUI();
}

function renderDesignVarsUI(){
  // Button text color picker
  const btnPicker = document.getElementById('dv-btn-text-picker');
  if(btnPicker) btnPicker.value = CFG.btnTextColor || _contrastText(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()||'#C8F53C');
  const btnLabel = document.getElementById('dv-btn-text-label');
  if(btnLabel) btnLabel.textContent = CFG.btnTextColor ? 'Manuell' : 'Auto-Kontrast';
  // Card bg picker
  const cardPicker = document.getElementById('dv-card-bg-picker');
  if(cardPicker) cardPicker.value = CFG.cardBgColor || '#1C1C21';
  // Panel bg picker
  const panelPicker = document.getElementById('dv-panel-bg-picker');
  if(panelPicker) panelPicker.value = CFG.panelBgColor || '#1C1C21';
}

function toggleAktienEnabled(){
  CFG.aktienEnabled = !CFG.aktienEnabled;
  cfgSave();
  autoSyncProfile();
  // If disabling: remove aktien from pinnedTabs and homeWidgets
  if(!CFG.aktienEnabled){
    CFG.pinnedTabs = (CFG.pinnedTabs||[]).filter(k=>k!=='aktien');
    const aktienWidgetKeys = ['aktienPortfolio','aktienWert','aktienPnl','aktienTop','aktienVerteilung','aktienPosition','aktienDashboard'];
    if(CFG.homeWidgets) CFG.homeWidgets = CFG.homeWidgets.filter(k=>!aktienWidgetKeys.includes(k));
    cfgSave();
    if(currentTab==='aktien') goTab('home');
  }
  renderEinstellungen();
  renderNav();
  if(currentTab==='home') renderHome();
  // Show/hide Aktien tab button in eingabe
  const aktBtn = document.getElementById('type-akt');
  if(aktBtn) aktBtn.style.display = CFG.aktienEnabled ? '' : 'none';
  if(!CFG.aktienEnabled && currentEntryType==='aktien') setType('ausgabe');
}

function toggleOevEnabled(){
  CFG.oevEnabled = !CFG.oevEnabled;
  cfgSave();
  autoSyncProfile();
  if(!CFG.oevEnabled){
    CFG.pinnedTabs = (CFG.pinnedTabs||[]).filter(k=>k!=='oev');
    cfgSave();
    if(currentTab==='oev') goTab('home');
  }
  renderEinstellungen();
  renderNav();
  if(currentTab==='home') renderHome();
}

