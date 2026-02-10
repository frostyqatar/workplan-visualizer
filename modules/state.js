/* =============== State =============== */
export let currentYear = new Date().getFullYear();
export let currentQuarter = getCurrentQuarter();
export let currentView = 'year';
export let projects = [];
export let apiKey = localStorage.getItem('geminiApiKey');
export let currentColorPalette = 'mckinsey';
export let projectOrder = [];
export let editingProjectId = null;
export let editingTitleProjectId = null;
export let openMenuProjectId = null;
export let openMenuElement = null;

export let autoWrap = false;
export let spacingScale = 1;
export let todayOn = false;
export let hiddenMonthsLeft = 0;
export let currentDensity = 'comfortable';
export let theme = localStorage.getItem('wpTheme') || 'light';
export let filterQuery = '';
export let autoSort = true;

// Skip-cancel flags to prevent race conditions between save and window.onclick
export let _skipDateCancel = false;
export let _skipTitleCancel = false;

/* =============== Setters =============== */
export function setCurrentYear(v) { currentYear = v; }
export function setCurrentQuarter(v) { currentQuarter = v; }
export function setCurrentView(v) { currentView = v; }
export function setProjects(v) { projects = v; }
export function setApiKey(v) { apiKey = v; }
export function setCurrentColorPalette(v) { currentColorPalette = v; }
export function setProjectOrder(v) { projectOrder = v; }
export function setEditingProjectId(v) { editingProjectId = v; }
export function setEditingTitleProjectId(v) { editingTitleProjectId = v; }
export function setOpenMenuProjectId(v) { openMenuProjectId = v; }
export function setOpenMenuElement(v) { openMenuElement = v; }
export function setAutoWrap(v) { autoWrap = v; }
export function setSpacingScale(v) { spacingScale = v; }
export function setTodayOn(v) { todayOn = v; }
export function setHiddenMonthsLeft(v) { hiddenMonthsLeft = v; }
export function setCurrentDensity(v) { currentDensity = v; }
export function setTheme(v) { theme = v; }
export function setFilterQuery(v) { filterQuery = v; }
export function setAutoSort(v) { autoSort = v; }
export function setSkipDateCancel(v) { _skipDateCancel = v; }
export function setSkipTitleCancel(v) { _skipTitleCancel = v; }

/* =============== Palettes =============== */
export const colorPalettes = {
  mckinsey: ['#003f5c', '#2f4b7c', '#665191', '#a05195', '#d45087', '#f95d6a', '#ff7c43', '#ffa600'],
  bcg: ['#00594e', '#009988', '#66b2b2', '#004d47', '#7a9b92', '#003a36', '#4d7c78', '#80b3ad'],
  bain: ['#c41e3a', '#8b0000', '#ff6b6b', '#004d5c', '#2d5a87', '#4682b4', '#6495ed', '#b0c4de'],
  deloitte: ['#006400', '#228b22', '#32cd32', '#7cfc00', '#008b8b', '#20b2aa', '#48d1cc', '#00ced1'],
  pwc: ['#ff8c00', '#ff7f50', '#ffa500', '#ffd700', '#4169e1', '#1e90ff', '#00bfff', '#87ceeb'],
  kpmg: ['#00338d', '#0066cc', '#3399ff', '#66b3ff', '#1a5490', '#2d6ea3', '#4080b6', '#5392c9'],
  ey: ['#ffe600', '#ffcc00', '#ffb300', '#ff9900', '#2e2e2e', '#4d4d4d', '#666666', '#808080'],
  accenture: ['#a100ff', '#7b00cc', '#5500aa', '#9933ff', '#b366ff', '#cc99ff', '#e6ccff', '#4d0080']
};

/* =============== Helpers =============== */
export function getCurrentQuarter() {
  const now = new Date();
  const m = now.getMonth();
  return m <= 2 ? 1 : m <= 5 ? 2 : m <= 8 ? 3 : 4;
}
