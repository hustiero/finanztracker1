// ═══════════════════════════════════════════════════════════════
// NAMESPACE WIRING — App.Data & App.IO
// All functions remain global (backward compat). The App object
// provides a structured namespace for new code & future modules.
// ═══════════════════════════════════════════════════════════════

// ── App.Data: pure data retrieval, calculation, formatting ────
Object.assign(App.Data, {
  // Utilities
  genId, today, dateStr,
  // Date/cycle helpers
  getCycleRange, getMonthsBetween,
  // Recurring expansion
  getRecurringOccurrences,
  // Core data access
  getAusgaben, getEinnahmen, getNetto, getFixkosten,
  isFixkostenEntry, toggleFixkostenKat,
  // Budget / Lohnzyklus
  getZyklusInfo,
  // Averages
  avgDailyVarSpend, avgDailyVarSpendPrevComp, avgDailyVarSpendYear,
  // Category helpers
  parentOf, catColor, catEmoji, getOberkategorien, randomCatColor,
  // Formatting & normalization
  fmtDate, fmtAmt, normalizeDate, normalizeAmt,
  // Search & filter
  sucheTransaktionen, verlaufFilterEntries,
  // Aggregation
  getKategorienMitEintraegen, getKategorieDetails, buildMonthlyBarData,
  getBookedYears,
  // Aktien — data/calculation
  aktieColor, calcPosition, getDurchschnittsPreis,
  getAktuellerKurs, getCachedStock,
  getFxRate, hasFxRate, toUserCurrency,
  getPositionsWert, getGesamtPortfoliowert,
  getGewinnVerlust, getGesamtGewinnVerlust,
  getPortfolioTodayChange,
  normalizeTickerForGF,
  fmtPrice, fmtQty,
});

// ── App.IO: storage, API calls, sync, import/export ───────────
Object.assign(App.IO, {
  // Config persistence
  cfgSave, cfgLoad, curr,
  // Sheets API
  apiCall, apiGet, apiAppend, apiUpdate, apiFindRow, apiGetMeta,
  // Data cache
  dataCacheSave, dataCacheLoad, dataCacheLoadIDB,
  // IndexedDB + Sync Queue
  IDB, syncQueue, queueSync, processQueue,
  // Event Bus + Render Scheduler
  AppBus, markDirty, flushRender, RENDER_FN_MAP,
  // Master load
  loadAll, launchApp, checkSheets,
  // Auto-materialization
  autoMaterializeRecurrings,
  // Entry CRUD
  saveEntry, updateEntry, deleteEntry,
  // Recurring CRUD
  saveRecurring, updateRecurring, deleteRecurring,
  // Category CRUD
  addCategory, updateCategory, deleteCategory,
  // Oberkategorien CRUD
  createOberkategorie, renameOberkategoriePrompt, confirmDeleteOberkategorie,
  // Aktien trade
  saveAktienTradeFromEingabe,
  // Profile sync
  syncProfileToSheet, autoSyncProfile, loadProfileFromSheet,
  _profileExportable, _profileApply,
  // Export / Import
  exportProfileJSON, importProfileJSON, downloadBlankTemplate,
  // Stocks IO
  sdataLoad, sdataSave,
  syncKurseSheet, fetchStockPrice,
  loadPortfolioVerlauf, appendPortfolioSnapshot,
  // UI sync indicator
  setSyncStatus,
});

// ── App.UI: rendering, modals, navigation, form helpers ───────
Object.assign(App.UI, {
  h, fromTemplate,
  fillForm, readForm, clearForm,
  // Master render
  renderAll,
  // Page renderers
  renderHome, renderVerlauf, renderLohn,
  renderCategories, renderRecurring, renderAktien,
  renderEinstellungen, renderNav,
  renderOberkategorien, renderMenuOverlay, renderNotifications,
  renderErscheinungsbild, renderAdmin,
  // Home render helpers (curated Wiedereinstieg-Dashboard)
  renderWidgetGreeting, renderWidgetLohnzyklus, renderWidgetTopKategorien,
  startGreetingClock,
  // Aktien sub-renderers
  renderAktienCharts, renderAktienDashboardTop, renderAktienList, renderFxRates,
  renderAktienTradeForm, renderAktienTabelle,
  renderAktieDetail, renderAdminDesignPresets,
  // User management
  openUserManagement, closeUserManagement, refreshUserList, filterUsers,
  // Charts
  buildBarChart, buildBalanceChart,
  buildPortfolioPieChart, buildPreisVergleichChart, buildPortfolioVerlauf,
  buildMonthlyBarData,
  // Navigation
  goTab, openMenuOverlay, closeMenuOverlay, toggleMenuEditMode,
  openFabMenu, closeFabMenu, pinTab, unpinTab,
  // Modals
  openModal, closeModal, openGenericModal, closeGenericModal,
  openEditModal, openMaterializeModal, openRecModal, openCatModal,
  openAvgConfig,
  openNewAktieModal, openEditAktieModal, openAktieDetail, closeAktieDetail,
  openTradeModal, openAddAktieFlow, openAktieDetailFromFlow,
  openNewAktieModalFromEingabe,
  // Toast & status
  toast, setLoader, setSyncStatus,
  // Form helpers
  setType, fillDropdown, fillAllDropdowns, fillParentDropdown,
  selectColor, buildEmojiGrid, esc,
  toggleLohnField, updateLohnToggleUI,
  // Verlauf navigation
  verlaufSetType, verlaufOpenKat, verlaufOpenKatFromEl, verlaufGoBack,
  verlaufToggleL3Search, toggleVerlaufFilter, toggleVerlaufCatSort,
  setVerlaufZeitraum, setVerlaufCustomRange, setVerlaufSearch,
  renderVerlaufFilterSummary, verlaufCalcSummary,
  // Lohn + Abos subtab
  setLohnMonths, toggleFixkosten, toggleAboForm,
  // Notifications
  checkDueRecurrings, checkAllNotifications, renderNotifSettings,
  toggleNotifSetting, updateNotifBadge, toggleNotifOverlay,
  closeNotifOverlay, dismissNotif, openNotifDetail,
  // Misc UI
  updatePageSub, gotoSetupStep, resetLoginForm, generateAppIcon,
  togglePwVis, toggleSettingsGroup, toggleCustomizeSection, updateDesignSummary,
  renderFontColorUI, renderAccentColorUI,
  // Aktien views
  setAktienView, setAktienTabView, deleteAktie,
  // Admin
  copyInviteLink, toggleCodeGs, copyCodeGs, toggleAdminCodeGs, copyAdminCodeGs,
  adminSetScriptUrl, adminApproveUser, adminRejectUser,
  adminResetPw, adminDeleteUser, adminToggleRole,
  setAdminDefaultBg, toggleAdminDefaultGlass, saveAdminDefaultDesign, setAdminAccentColor,
});

// ── App.Device: platform detection, history nav, sidebar ──────
App.Device = Device;

// ── App.Design: theme, background, glassmorphism, fonts ───────
Object.assign(App.Design, {
  applyThemeMode, setThemeMode, updateThemeSegUI,
  toggleTheme, updateThemeLabel,
  applyAppBackground, setBgPreset, clearBgImage, triggerBgUpload, loadBgFile,
  toggleGlass, toggleGlassClean, updateGlassBlur, updateGlassAlpha, updateBgBlur,
  applyFontColors, setFontColorPreset, setFontColorCustom, resetFontColors,
  applyDesignPackage, renderDesignPackages, migrateOldDesignToPkg,
  applyAccentColor, setAccentColor, resetAccentColor, renderAccentColorUI,
  applyTextGlow, updateTextGlow,
  applyDesignVars, renderDesignVarsUI,
  setBtnTextColor, resetBtnTextColor,
  setCardBgColor, resetCardBgColor,
  setPanelBgColor, resetPanelBgColor,
});

// ── Render scheduler map ──────────────────────────────────────
RENDER_FN_MAP = {
  home:          renderHome,
  verlauf:       renderVerlauf,
  lohn:          renderLohn,
  kategorien:    renderCategories,
  dauerauftraege:renderRecurring,
  aktien:        renderAktien,
  einstellungen: renderEinstellungen,
  admin:         renderAdmin,
  nav:           renderNav,
  dropdowns:     fillAllDropdowns,
};

// ── Network status detection ───────────────────────────────────
window.addEventListener('offline', () => {
  setSyncStatus('error');
  toast('Keine Internetverbindung', 'err');
});
window.addEventListener('online', () => {
  if(!CFG.demo){ setSyncStatus('syncing'); loadAll(); }
  else setSyncStatus('demo');
});
