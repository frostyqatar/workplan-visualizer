import {
  theme, currentDensity, todayOn, autoWrap, autoSort,
  spacingScale, hiddenMonthsLeft, currentView, currentColorPalette,
  projects, editingProjectId, editingTitleProjectId,
  openMenuElement, openMenuProjectId,
  _skipDateCancel, _skipTitleCancel,
  setTheme, setCurrentDensity, setTodayOn, setAutoWrap, setAutoSort,
  setSpacingScale, setHiddenMonthsLeft, setCurrentColorPalette,
  setOpenMenuElement, setOpenMenuProjectId,
  colorPalettes
} from './state.js';
import { id, clamp, cssNum } from './utils.js';
import { getCurrentPalette, getProjectColor, cancelDateEdit, cancelTitleEdit, scrollToProjectAndEdit, editProjectDates, duplicateProject, deleteProject } from './projects.js';
import { saveProjectsToStorage } from './storage.js';

// Will be set by app.js
let _fullRender = null;
let _renderTimeline = null;
export function setFullRender(fn) { _fullRender = fn; }
export function setRenderTimeline(fn) { _renderTimeline = fn; }

/* =============== Theme =============== */
export function toggleTheme() {
  const newTheme = (theme === 'dark') ? 'light' : 'dark';
  setTheme(newTheme);
  localStorage.setItem('wpTheme', newTheme);
  applyTheme(newTheme);
  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    btn.textContent = (newTheme === 'dark') ? '☀️ Light' : '🌙 Dark';
    btn.setAttribute('aria-label', (newTheme === 'dark') ? 'Switch to light mode' : 'Switch to dark mode');
  }
}

export function applyTheme(t) {
  document.body.classList.toggle('dark', t === 'dark');
}

/* =============== Density =============== */
export function setDensity(value) {
  setCurrentDensity(value === 'compact' ? 'compact' : 'comfortable');
  syncDensityButtons();
  if (_renderTimeline) _renderTimeline();
}

export function syncDensityButtons() {
  const compact = document.getElementById('densityCompactBtn');
  const comfort = document.getElementById('densityComfortBtn');
  if (compact && comfort) {
    compact.classList.toggle('active', currentDensity === 'compact');
    comfort.classList.toggle('active', currentDensity === 'comfortable');
  }
}

/* =============== Controls =============== */
export function adjustNodeHeight(delta) {
  let h = cssNum('--node-height', '36') + delta;
  h = clamp(h, 20, 120);
  document.documentElement.style.setProperty('--node-height', h + 'px');
  if (_renderTimeline) _renderTimeline();
}

export function adjustTextSize(delta) {
  let f = cssNum('--node-font-size', '0.8') + delta;
  f = clamp(f, 0.6, 1.6);
  document.documentElement.style.setProperty('--node-font-size', f + 'rem');
  if (_renderTimeline) _renderTimeline();
}

export function squeezeSpacing() {
  setSpacingScale(clamp(spacingScale - 0.1, 0, 2));
  if (_renderTimeline) _renderTimeline();
}

export function breezeSpacing() {
  setSpacingScale(clamp(spacingScale + 0.1, 0.6, 2));
  if (_renderTimeline) _renderTimeline();
}

export function toggleAutosort() {
  setAutoSort(!autoSort);
  const btn = id('toggleAutosortBtn');
  if (btn) btn.textContent = `Autosort: ${autoSort ? 'On' : 'Off'}`;
  if (_renderTimeline) _renderTimeline();
}

export function toggleWrap() {
  setAutoWrap(!autoWrap);
  const btn = id('toggleWrapBtn');
  if (btn) btn.textContent = autoWrap ? 'Wrap: On' : 'Wrap: Off';
  if (_renderTimeline) _renderTimeline();
}

export function toggleTodayLine() {
  setTodayOn(!todayOn);
  // Import dynamically to avoid circular deps
  const line = document.getElementById('todayLine');
  if (line) line.style.display = todayOn ? 'block' : 'none';
  const btn = id('toggleTodayBtn');
  if (btn) btn.textContent = todayOn ? 'Today: On' : 'Today: Off';
  // positionTodayLine is handled by timeline module via renderTimeline
  if (_renderTimeline) _renderTimeline();
}

/* =============== Messages =============== */
export function showLoading(b) {
  const el = id('loading');
  if (el) el.style.display = b ? 'block' : 'none';
}

export function showError(m) {
  const el = id('errorMessage');
  if (!el) return alert(m);
  el.textContent = m;
  el.style.display = 'block';
  setTimeout(hideMessages, 5000);
}

export function showSuccess(m) {
  const el = id('successMessage');
  if (!el) return console.info(m);
  el.textContent = m;
  el.style.display = 'block';
  setTimeout(hideMessages, 3000);
}

export function hideMessages() {
  const err = id('errorMessage');
  const suc = id('successMessage');
  if (err) err.style.display = 'none';
  if (suc) suc.style.display = 'none';
}

/* =============== API Key Modal =============== */
export function showApiKeyModal() {
  id('apiKeyModal').style.display = 'block';
}

/* =============== Palette preview =============== */
export function renderPalettePreview() {
  const host = document.getElementById('palettePreview');
  if (!host) return;
  const pal = getCurrentPalette();
  host.innerHTML = pal.slice(0, 6).map(c => `<span class="sw" style="background:${c}"></span>`).join('');
}

export function saveColorPalette() {
  localStorage.setItem('workplanColorPalette', currentColorPalette);
}

export function loadColorPalette() {
  const stored = localStorage.getItem('workplanColorPalette');
  if (stored) {
    setCurrentColorPalette(stored);
    const sel = id('colorPalette');
    if (sel) sel.value = stored;
  }
  renderPalettePreview();
}

export function updateColorPalette() {
  const val = id('colorPalette')?.value;
  if (!val) return;
  if (val === 'custom') { showCustomColorModal(); return; }
  setCurrentColorPalette(val);
  projects.forEach((p, i) => p.color = getProjectColor(i));
  saveColorPalette();
  saveProjectsToStorage();
  if (_renderTimeline) _renderTimeline();
  renderPalettePreview();
}

/* =============== Custom palettes =============== */
export function showCustomColorModal() {
  id('customColorModal').style.display = 'block';
  loadExistingCustomPalettes();
}

export function closeCustomColorModal() {
  id('customColorModal').style.display = 'none';
  const sel = id('colorPalette');
  if (sel) sel.value = currentColorPalette;
}

function loadExistingCustomPalettes() {
  const container = id('existingCustomPalettes');
  const custom = JSON.parse(localStorage.getItem('customColorPalettes') || '{}');
  if (!container) return;
  if (Object.keys(custom).length === 0) { container.innerHTML = ''; return; }
  container.innerHTML = '<h4 style="margin:1rem 0 0.5rem 0;color:var(--primary-blue);">Existing Custom Palettes:</h4>';
  Object.entries(custom).forEach(([key, colors]) => {
    const name = key.replace('custom_', '');
    const div = document.createElement('div');
    div.className = 'custom-palette-item';
    div.innerHTML = `
      <span>${name}</span>
      <div class="custom-palette-colors">
        ${colors.map(c => `<div class="custom-color-dot" style="background:${c}"></div>`).join('')}
      </div>
      <button class="delete-custom-palette" data-action="delete-palette" data-key="${key}">Delete</button>
    `;
    container.appendChild(div);
  });
}

export function saveCustomPalette() {
  const name = id('paletteName')?.value.trim();
  if (!name) return showError('Enter a name for your custom palette.');
  const colors = [id('color1')?.value, id('color2')?.value, id('color3')?.value, id('color4')?.value].map(c => c || '#cccccc');
  const all = JSON.parse(localStorage.getItem('customColorPalettes') || '{}');
  const key = 'custom_' + name.toLowerCase().replace(/\s+/g, '_');
  all[key] = colors;
  localStorage.setItem('customColorPalettes', JSON.stringify(all));
  loadCustomPalettes();
  setCurrentColorPalette(key);
  const sel = id('colorPalette');
  if (sel) sel.value = key;
  projects.forEach((p, i) => p.color = getProjectColor(i));
  closeCustomColorModal();
  saveColorPalette();
  saveProjectsToStorage();
  if (_renderTimeline) _renderTimeline();
  showSuccess(`Custom palette "${name}" created and applied!`);
  renderPalettePreview();
}

export function deleteCustomPalette(key) {
  if (!confirm('Delete this custom palette?')) return;
  const all = JSON.parse(localStorage.getItem('customColorPalettes') || '{}');
  delete all[key];
  localStorage.setItem('customColorPalettes', JSON.stringify(all));
  if (currentColorPalette === key) {
    setCurrentColorPalette('mckinsey');
    saveColorPalette();
    projects.forEach((p, i) => p.color = getProjectColor(i));
    saveProjectsToStorage();
    if (_renderTimeline) _renderTimeline();
  }
  loadCustomPalettes();
  loadExistingCustomPalettes();
  showSuccess('Custom palette deleted.');
  renderPalettePreview();
}

export function loadCustomPalettes() {
  const select = id('colorPalette');
  if (!select) return;
  const all = JSON.parse(localStorage.getItem('customColorPalettes') || '{}');
  Array.from(select.options).forEach(opt => { if (opt.value.startsWith('custom_')) opt.remove(); });
  const createOpt = select.querySelector('option[value="custom"]');
  Object.keys(all).forEach(key => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = key.replace('custom_', '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    select.insertBefore(opt, createOpt);
  });
}

/* =============== Context menu — Bug Fix 1.5: remove { once: true } =============== */
export function openContextMenu(e, barEl, project) {
  e.preventDefault();
  e.stopPropagation();
  closeContextMenu();

  const menu = id('nodeContextMenu');
  if (!menu) return;
  const palette = getCurrentPalette();
  const colorSwatches = palette.map(c => `<div class="color-swatch" data-color="${c}" style="background:${c}" tabindex="0" role="button" aria-label="Set color to ${c}"></div>`).join('');

  menu.innerHTML = `
    <div class="ctx-section">
      <div class="ctx-title">Actions</div>
      <div class="ctx-item" data-action="edit-name" tabindex="0">Edit name</div>
      <div class="ctx-item" data-action="edit-dates" tabindex="0">Edit dates</div>
      <div class="ctx-item" data-action="edit-desc" tabindex="0">Edit description</div>
    </div>
    <div class="ctx-sep"></div>
    <div class="ctx-section">
      <div class="ctx-title">Color</div>
      <div class="ctx-row">${colorSwatches}
        <label class="ctx-item" style="padding:4px 6px;">Custom <input type="color" id="ctxColorPicker" style="margin-left:6px;"></label>
      </div>
    </div>
    <div class="ctx-sep"></div>
    <div class="ctx-section">
      <div class="ctx-title">Milestone</div>
      <div class="ctx-row">
        <div class="ctx-item" data-marker="star" tabindex="0">★ Star</div>
        <div class="ctx-item" data-marker="flag" tabindex="0">⚑ Flag</div>
        <div class="ctx-item" data-marker="exclamation" tabindex="0">❗ Important</div>
        <div class="ctx-item" data-marker="none" tabindex="0">✕ Clear</div>
      </div>
    </div>
    <div class="ctx-sep"></div>
    <div class="ctx-section">
      <div class="ctx-item" data-action="duplicate" tabindex="0">Duplicate</div>
      <div class="ctx-item" data-action="delete" style="color:#c62828;" tabindex="0">Delete</div>
    </div>
  `;

  menu.classList.remove('hidden');
  const vw = window.innerWidth, vh = window.innerHeight;
  const rect = menu.getBoundingClientRect();
  let x = e.clientX, y = e.clientY;
  if (x + rect.width > vw) x = vw - rect.width - 8;
  if (y + rect.height > vh) y = vh - rect.height - 8;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  // Click handler
  menu.onclick = (ev) => {
    ev.stopPropagation();
    const target = ev.target;
    const action = target.getAttribute('data-action');
    const swatch = target.closest('.color-swatch');
    const marker = target.getAttribute('data-marker');

    if (action === 'edit-name') {
      scrollToProjectAndEdit(project.id);
      closeContextMenu();
      return;
    }
    if (action === 'edit-dates') {
      const listEl = document.querySelector(`[data-project-id="${project.id}"] .project-dates`);
      if (listEl) listEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => editProjectDates(project.id), 250);
      closeContextMenu();
      return;
    }
    if (action === 'edit-desc') {
      const newDesc = prompt('Description:', project.description || '');
      if (newDesc !== null) {
        project.description = newDesc.trim();
        saveProjectsToStorage();
        if (_fullRender) _fullRender();
      }
      closeContextMenu();
      return;
    }
    if (action === 'duplicate') { duplicateProject(project.id); closeContextMenu(); return; }
    if (action === 'delete') { deleteProject(project.id); closeContextMenu(); return; }

    if (swatch) {
      const color = swatch.getAttribute('data-color');
      project.color = color;
      saveProjectsToStorage();
      if (_fullRender) _fullRender();
      closeContextMenu();
      return;
    }
    if (target.id === 'ctxColorPicker') return;
    if (marker) {
      project.marker = (marker === 'none') ? null : marker;
      saveProjectsToStorage();
      if (_renderTimeline) _renderTimeline();
      closeContextMenu();
    }
  };

  // Bug Fix 1.5: Color picker — remove { once: true }
  const picker = document.getElementById('ctxColorPicker');
  if (picker) {
    picker.addEventListener('change', (ce) => {
      project.color = ce.target.value;
      saveProjectsToStorage();
      if (_fullRender) _fullRender();
      closeContextMenu();
    });
  }

  // Keyboard navigation for context menu
  const items = menu.querySelectorAll('[tabindex="0"]');
  let focusIdx = -1;
  menu.addEventListener('keydown', (ke) => {
    if (ke.key === 'ArrowDown') {
      ke.preventDefault();
      focusIdx = (focusIdx + 1) % items.length;
      items[focusIdx]?.focus();
    } else if (ke.key === 'ArrowUp') {
      ke.preventDefault();
      focusIdx = (focusIdx - 1 + items.length) % items.length;
      items[focusIdx]?.focus();
    } else if (ke.key === 'Enter') {
      items[focusIdx]?.click();
    } else if (ke.key === 'Escape') {
      closeContextMenu();
    }
  });

  // Focus first item
  if (items.length) { focusIdx = 0; items[0].focus(); }
}

export function closeContextMenu() {
  const menu = id('nodeContextMenu');
  if (menu) { menu.classList.add('hidden'); menu.innerHTML = ''; menu.onclick = null; }
}

/* =============== Semicircle quick menu =============== */
export function showSemicircleMenu(bar, project) {
  closeSemicircleMenu();
  const menu = document.createElement('div');
  menu.className = 'semicircle-menu';
  menu.innerHTML = `
    <button class="icon-btn" title="Star" data-marker="star">★</button>
    <button class="icon-btn" title="Flag" data-marker="flag">⚑</button>
    <button class="icon-btn" title="Important" data-marker="exclamation">❗</button>
    <button class="icon-btn" title="Clear" data-marker="none">✕</button>
  `;
  menu.style.cssText = 'position:absolute;top:-44px;right:-44px;z-index:1002;';
  menu.querySelectorAll('.icon-btn').forEach(btn => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      const marker = btn.getAttribute('data-marker');
      project.marker = (marker === 'none') ? null : marker;
      saveProjectsToStorage();
      if (_renderTimeline) _renderTimeline();
      closeSemicircleMenu();
    };
  });
  bar.appendChild(menu);
  setOpenMenuElement(bar);
  setOpenMenuProjectId(project.id);
  setTimeout(() => document.addEventListener('mousedown', handleMenuOutsideClick, { once: true }), 0);
}

function closeSemicircleMenu() {
  if (openMenuElement) {
    const menu = openMenuElement.querySelector('.semicircle-menu');
    if (menu) menu.remove();
  }
  setOpenMenuProjectId(null);
  setOpenMenuElement(null);
}

function handleMenuOutsideClick(e) {
  if (openMenuElement && !openMenuElement.contains(e.target)) closeSemicircleMenu();
}

/* =============== Help Modal → now User Guide (Phase 5) =============== */
export function showHelpModal() {
  const m = document.getElementById('helpModal');
  if (m) m.style.display = 'block';
}
export function closeHelpModal() {
  const m = document.getElementById('helpModal');
  if (m) m.style.display = 'none';
}

/* =============== Import Modal =============== */
export function closeImportModal() {
  id('importModal').style.display = 'none';
  if (id('importData')) id('importData').value = '';
}

/* =============== Bug Fix 1.9: changeSaveLocation stub =============== */
export function changeSaveLocation() {
  showError('Not yet implemented — use Export Data to save your projects.');
}

/* =============== Window click handler — Bug Fix 1.1 =============== */
export function handleWindowClick(ev) {
  const apiModal = id('apiKeyModal');
  const importModal = id('importModal');
  const customColorModal = id('customColorModal');
  const helpModal = id('helpModal');
  const guideModal = id('guideModal');

  if (ev.target === apiModal) apiModal.style.display = 'none';
  if (ev.target === importModal) closeImportModal();
  if (ev.target === customColorModal) closeCustomColorModal();
  if (ev.target === helpModal) closeHelpModal();
  if (ev.target === guideModal && guideModal) guideModal.style.display = 'none';

  // Bug Fix 1.1: check skip flags before cancelling edits
  if (editingProjectId && !_skipDateCancel && !ev.target.closest('.project-dates.editing') && !ev.target.closest('.date-edit-btn')) {
    cancelDateEdit();
  }
  if (editingTitleProjectId && !_skipTitleCancel && !ev.target.closest('.project-name.editing') && !ev.target.closest('.title-edit-btn')) {
    cancelTitleEdit();
  }
}

/* =============== Guide Modal (Phase 5) =============== */
export function showGuideModal() {
  const m = id('guideModal');
  if (m) m.style.display = 'block';
}
export function closeGuideModal() {
  const m = id('guideModal');
  if (m) m.style.display = 'none';
}
