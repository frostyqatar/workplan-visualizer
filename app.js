/* =============== Workplan Visualizer — Entry Point =============== */
import {
  theme, currentView, hiddenMonthsLeft, todayOn, filterQuery,
  setHiddenMonthsLeft, setFilterQuery
} from './modules/state.js';
import { id, debounce, clamp } from './modules/utils.js';
import { renderTimeline, setView, navigatePeriod, resetZoom, updatePeriodDisplay, positionTodayLine, setFullRender as setTimelineFullRender } from './modules/timeline.js';
import { renderProjects, addProjectFromList, editProjectTitle, editProjectDates, saveTitleEdit, cancelTitleEdit, saveDateEdit, cancelDateEdit, duplicateProject, deleteProject, clearAllProjects, initializeProjectListDragAndDrop, scrollToProjectAndEdit, setFullRender as setProjectsFullRender } from './modules/projects.js';
import { loadProjectsFromStorage, saveProjectsToStorage, exportData, downloadPNG, showImportModal, closeImportModal, importProjects, handleFileImport } from './modules/storage.js';
import { processProject, handleEnterKey, saveApiKey } from './modules/api.js';
import {
  toggleTheme, applyTheme, setDensity, syncDensityButtons,
  adjustNodeHeight, adjustTextSize, squeezeSpacing, breezeSpacing,
  toggleWrap, toggleAutosort, toggleTodayLine,
  showHelpModal, closeHelpModal, showGuideModal, closeGuideModal,
  showApiKeyModal, renderPalettePreview, loadColorPalette, loadCustomPalettes,
  updateColorPalette, showCustomColorModal, closeCustomColorModal,
  saveCustomPalette, deleteCustomPalette,
  closeContextMenu, changeSaveLocation,
  handleWindowClick,
  setFullRender as setUIFullRender, setRenderTimeline as setUIRenderTimeline
} from './modules/ui.js';

/* =============== fullRender: resolves circular deps =============== */
function fullRender() {
  renderProjects();
  renderTimeline();
  updatePeriodDisplay();
}

// Wire fullRender into modules that need it
setTimelineFullRender(fullRender);
setProjectsFullRender(fullRender);
setUIFullRender(fullRender);
setUIRenderTimeline(renderTimeline);

/* =============== Init =============== */
function init() {
  updatePeriodDisplay();
  loadProjectsFromStorage();
  loadColorPalette();
  loadCustomPalettes();
  renderProjects();
  renderTimeline();

  // Apply theme
  applyTheme(theme);
  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) {
    themeBtn.textContent = (theme === 'dark') ? '☀️ Light' : '🌙 Dark';
    themeBtn.setAttribute('aria-label', (theme === 'dark') ? 'Switch to light mode' : 'Switch to dark mode');
  }

  syncDensityButtons();

  // Filter hookup
  const filterInput = document.getElementById('filterInput');
  if (filterInput) {
    filterInput.value = filterQuery;
    filterInput.addEventListener('input', debounce((e) => {
      setFilterQuery((e.target.value || '').toLowerCase());
      renderProjects();
      renderTimeline();
    }, 150));
  }

  // Zoom controls
  const zoomHost = document.querySelector('.year-navigation') || document.querySelector('.timeline-header') || document.body;
  if (zoomHost && !document.getElementById('zoomControls')) {
    const wrap = document.createElement('div');
    wrap.id = 'zoomControls';
    wrap.style.cssText = 'display:flex;gap:8px;align-items:center;margin-left:8px;';
    wrap.innerHTML = `
      <button id="zoomOutBtn" class="nav-arrow" title="Zoom out">🔍−</button>
      <button id="zoomInBtn" class="nav-arrow" title="Zoom in">🔍+</button>
    `;
    zoomHost.insertBefore(wrap, zoomHost.firstChild);

    id('zoomInBtn').addEventListener('click', () => {
      if (currentView !== 'year') setView('year');
      setHiddenMonthsLeft(Math.min(hiddenMonthsLeft + 1, 13));
      renderTimeline();
    });
    id('zoomOutBtn').addEventListener('click', () => {
      setHiddenMonthsLeft(Math.max(hiddenMonthsLeft - 1, 0));
      renderTimeline();
    });
  }

  initializeProjectListDragAndDrop();

  // Resize handler
  window.addEventListener('resize', debounce(() => {
    if (todayOn) positionTodayLine();
    renderTimeline();
  }, 120));

  // Close context menu on global actions
  ['scroll', 'click', 'resize'].forEach(ev =>
    window.addEventListener(ev, () => closeContextMenu(), { passive: true })
  );

  // Window click handler (close modals + editing)
  window.addEventListener('click', handleWindowClick);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const tag = (e.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (e.key === 'w' || e.key === 'W') toggleWrap();
    if (e.key === 't' || e.key === 'T') toggleTodayLine();
    if (e.key === 'y' || e.key === 'Y') setView('year');
    if (e.key === 'q' || e.key === 'Q') setView('quarter');
    if (e.key === 'ArrowLeft') navigatePeriod(-1);
    if (e.key === 'ArrowRight') navigatePeriod(1);
    if (e.key === '+') { if (currentView !== 'year') setView('year'); setHiddenMonthsLeft(Math.min(hiddenMonthsLeft + 1, 13)); renderTimeline(); }
    if (e.key === '-') { setHiddenMonthsLeft(Math.max(hiddenMonthsLeft - 1, 0)); renderTimeline(); }
    if (e.key === '?') showHelpModal();
  });

  // Event delegation for dynamic elements
  setupEventDelegation();
}

/* =============== Event delegation (replaces inline onclick) =============== */
function setupEventDelegation() {
  // Header actions
  document.querySelector('.header-actions')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.id === 'themeToggleBtn') toggleTheme();
    else if (btn.id === 'densityCompactBtn') setDensity('compact');
    else if (btn.id === 'densityComfortBtn') setDensity('comfortable');
    else if (btn.textContent.includes('Help')) showHelpModal();
    else if (btn.textContent.includes('Save Location')) changeSaveLocation();
    else if (btn.textContent.includes('Guide')) showGuideModal();
  });

  // Color palette change
  id('colorPalette')?.addEventListener('change', updateColorPalette);

  // Main input
  id('projectInput')?.addEventListener('keypress', handleEnterKey);

  // Send button + API key button
  document.querySelector('.input-section')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.classList.contains('send-btn')) processProject();
    else if (btn.textContent.includes('API Key')) showApiKeyModal();
  });

  // Timeline header navigation
  document.querySelector('.year-navigation')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-arrow');
    if (!btn) return;
    if (btn.textContent.includes('←')) navigatePeriod(-1);
    else if (btn.textContent.includes('→')) navigatePeriod(1);
  });

  // View selector
  document.querySelector('.view-selector')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.view-btn');
    if (!btn) return;
    if (btn.id === 'yearBtn') setView('year');
    else if (btn.id === 'quarterBtn') setView('quarter');
  });

  // Controls section
  document.querySelector('.controls-section')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const text = btn.textContent;

    if (text.includes('− Node')) adjustNodeHeight(-4);
    else if (text.includes('+ Node')) adjustNodeHeight(4);
    else if (text.includes('− Text')) adjustTextSize(-0.1);
    else if (text.includes('+ Text')) adjustTextSize(0.1);
    else if (text.includes('Squeeze')) squeezeSpacing();
    else if (text.includes('Breeze')) breezeSpacing();
    else if (btn.id === 'toggleWrapBtn') toggleWrap();
    else if (btn.id === 'toggleAutosortBtn') toggleAutosort();
    else if (btn.id === 'toggleTodayBtn') toggleTodayLine();
    else if (text.includes('Download PNG')) downloadPNG();
    else if (text.includes('Export Data')) exportData();
    else if (text.includes('Import Data')) showImportModal();
    else if (text.includes('Reset Zoom')) resetZoom();
    else if (text.includes('Clear All')) clearAllProjects();
  });

  // Projects list delegation (dynamic content)
  id('projectsList')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const projectId = btn.dataset.id ? +btn.dataset.id : null;

    e.stopPropagation();

    switch (action) {
      case 'quick-add': addProjectFromList(); break;
      case 'edit-title': if (projectId) editProjectTitle(projectId); break;
      case 'edit-dates': if (projectId) editProjectDates(projectId); break;
      case 'save-title': if (projectId) saveTitleEdit(projectId); break;
      case 'cancel-title': cancelTitleEdit(); break;
      case 'save-dates': if (projectId) saveDateEdit(projectId); break;
      case 'cancel-dates': cancelDateEdit(); break;
      case 'duplicate': if (projectId) duplicateProject(projectId); break;
      case 'delete': if (projectId) deleteProject(projectId); break;
      case 'clear-filter': {
        setFilterQuery('');
        const filterInput = id('filterInput');
        if (filterInput) filterInput.value = '';
        renderProjects();
        renderTimeline();
        break;
      }
    }
  });

  // API Key modal
  id('apiKeyModal')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn?.classList.contains('btn-primary')) saveApiKey();
  });

  // Import modal
  id('importModal')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.textContent.includes('Cancel')) closeImportModal();
    else if (btn.textContent.includes('Import')) importProjects(fullRender);
  });

  // Custom color modal
  id('customColorModal')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.textContent.includes('Cancel')) closeCustomColorModal();
    else if (btn.textContent.includes('Save Palette')) saveCustomPalette();
    else if (btn.dataset.action === 'delete-palette') deleteCustomPalette(btn.dataset.key);
  });

  // Help modal close
  id('helpModal')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn?.classList.contains('btn-primary')) closeHelpModal();
  });

  // Guide modal close
  id('guideModal')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn?.dataset.action === 'close-guide') closeGuideModal();
    if (e.target === id('guideModal')) closeGuideModal();
  });

  // File input
  id('fileInput')?.addEventListener('change', handleFileImport);
}

/* =============== Start =============== */
document.addEventListener('DOMContentLoaded', init);
