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
  getRecurringOccurrences, getRecurringInstances,
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
  // Sparziele
  getSparzieleNonTax, getSparTax, sparGoalPct, sparTotalMonthly,
  // Home widgets
  getHomeWidgets,
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
  // IndexedDB + Sync Queue (Step 3)
  IDB, syncQueue, queueSync, processQueue,
  // Event Bus + Render Scheduler (Step 8)
  AppBus, markDirty, flushRender, RENDER_FN_MAP,
  // Master load
  loadAll, launchApp, checkSheets,
  // Auto-materialization
  autoMaterializeRecurrings,
  // Entry CRUD
  saveEntryOrRecurring, saveEntry, updateEntry, deleteEntry,
  // Recurring CRUD
  saveRecurring, updateRecurring, deleteRecurring,
  // Category CRUD
  addCategory, updateCategory, deleteCategory,
  // Oberkategorien CRUD
  createOberkategorie, renameOberkategoriePrompt, confirmDeleteOberkategorie,
  // Sparziele CRUD
  saveSparGoal, deleteSparGoal, addToSparGoal,
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
  // Rendering helpers (Step 2)
  h, fromTemplate,
  // Form helpers (Step 5)
  fillForm, readForm, clearForm,
  // Master render
  renderAll,
  // Page renderers
  renderHome, renderDashboard, renderVerlauf, renderLohn,
  renderSparen, renderCategories, renderRecurring, renderAktien,
  renderEinstellungen, renderMonat, renderNav, renderMonthView,
  renderOberkategorien, renderMenuOverlay, renderNotifications,
  renderErscheinungsbild, renderAdmin,
  // Widget renderers
  renderWidgetContent, renderWidgetGreeting, renderWidgetVerlaufZeitraum,
  renderWidgetLohnzyklus, renderWidgetTagesavg, renderWidgetTopKategorien,
  renderWidgetMonatverlauf, renderWidgetHeuteAusgaben, renderWidgetSparquote,
  renderWidgetMonatSummary, renderWidgetMonatKategorien, renderWidgetKontostand,
  renderWidgetJahresSparquote, renderWidgetJahresKategorien, renderWidgetMonatsverlaufJahr,
  renderWidgetSparzieleOverview,
  renderWidgetAktienPortfolio, renderWidgetAktienWert, renderWidgetAktienPnl,
  renderWidgetAktienTop, renderWidgetAktienVerteilung, renderWidgetAktienPosition,
  renderWidgetAktienDashboard,
  // Aktien sub-renderers
  renderAktienCharts, renderAktienDashboardTop, renderAktienList,
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
  prevDashYear, nextDashYear, prevMvMonth, nextMvMonth,
  openMonthView, closeMonthView, openMonthViewAt,
  // Modals
  openModal, closeModal, openGenericModal, closeGenericModal,
  openEditModal, openMaterializeModal, openRecModal, openCatModal,
  openSparGoalModal, openSparGoalDetail, openSparziel, openAvgConfig,
  openNewAktieModal, openEditAktieModal, openAktieDetail, closeAktieDetail,
  openTradeModal, openAddAktieFlow, openAktieDetailFromFlow,
  openNewAktieModalFromEingabe,
  // Toast & status
  toast, setLoader, setSyncStatus,
  // Form helpers
  setType, fillDropdown, fillAllDropdowns, fillParentDropdown,
  selectColor, buildEmojiGrid, esc,
  toggleRecurringFields, updateRecurToggleUI,
  toggleLohnField, updateLohnToggleUI,
  setAktienTradeType, updateAktienTotal,
  // Verlauf navigation
  verlaufSetType, verlaufOpenKat, verlaufOpenKatFromEl, verlaufGoBack,
  verlaufToggleL3Search, toggleVerlaufFilter, toggleVerlaufCatSort,
  setVerlaufZeitraum, setVerlaufCustomRange, setVerlaufSearch,
  renderVerlaufFilterSummary, verlaufCalcSummary,
  // Home widgets management
  toggleHomeEdit, addWidget, removeWidget, moveWidget,
  saveHomeWidgets, setHomeKontoMonths,
  // Dashboard
  setDashboardMonths,
  // Lohn
  setLohnMonths, toggleFixkosten,
  // Notifications
  checkDueRecurrings, checkAllNotifications, renderNotifSettings,
  toggleNotifSetting, updateNotifBadge, toggleNotifOverlay,
  closeNotifOverlay, dismissNotif, openNotifDetail,
  // Misc UI
  updatePageSub, gotoSetupStep, resetLoginForm, generateAppIcon,
  togglePwVis, toggleSettingsGroup, toggleCustomizeSection, updateDesignSummary,
  renderFontColorUI,
  // Aktien views
  setAktienView, setAktienTabView, deleteAktie,
  // Admin
  copyInviteLink, toggleCodeGs, copyCodeGs, toggleAdminCodeGs,
  setAdminDefaultBg, toggleAdminDefaultGlass, saveAdminDefaultDesign,
});

// ── App.Design: theme, background, glassmorphism, fonts ───────
Object.assign(App.Design, {
  applyThemeMode, setThemeMode, updateThemeSegUI,
  toggleTheme, updateThemeLabel,
  applyAppBackground, setBgPreset, clearBgImage, triggerBgUpload, loadBgFile,
  toggleGlass, toggleGlassClean, updateGlassBlur, updateGlassAlpha, updateBgBlur,
  applyFontColors, setFontColorPreset, setFontColorCustom, resetFontColors,
  applyDesignPackage, renderDesignPackages, migrateOldDesignToPkg,
});

// ── Render scheduler map (Step 8) ─────────────────────────────
// Now that all render functions are defined, wire up the map.
RENDER_FN_MAP = {
  home:          renderHome,
  verlauf:       renderVerlauf,
  dashboard:     renderDashboard,
  lohn:          renderLohn,
  kategorien:    renderCategories,
  dauerauftraege:renderRecurring,
  sparen:        renderSparen,
  aktien:        renderAktien,
  einstellungen: renderEinstellungen,
  nav:           renderNav,
  dropdowns:     fillAllDropdowns,
};
