import {
  projects, projectOrder, currentYear, currentQuarter,
  currentColorPalette, setProjects, setProjectOrder,
  setCurrentYear, setCurrentQuarter, setCurrentColorPalette
} from './state.js';
import { id, parseLocalDate, formatDateISO } from './utils.js';
import { getProjectColor, getCurrentPalette, reorderAndUpdateProjects } from './projects.js';
import { showError, showSuccess, renderPalettePreview, saveColorPalette } from './ui.js';

/* =============== localStorage =============== */
export function saveProjectsToStorage() {
  const data = {
    projects: projects.map(p => ({
      id: p.id, name: p.name,
      startDate: formatDateISO(p.startDate),
      endDate: formatDateISO(p.endDate),
      description: p.description, color: p.color, order: p.order,
      marker: p.marker || null,
      rowIndex: Number.isInteger(p.rowIndex) ? p.rowIndex : 0
    })),
    currentYear, currentQuarter, projectOrder
  };
  localStorage.setItem('workplanProjects', JSON.stringify(data));
}

export function loadProjectsFromStorage() {
  const stored = localStorage.getItem('workplanProjects');
  if (!stored) return;
  try {
    const data = JSON.parse(stored);
    const loaded = data.projects.map(p => ({
      id: p.id, name: p.name,
      startDate: parseLocalDate(p.startDate),
      endDate: parseLocalDate(p.endDate),
      description: p.description,
      color: p.color || getProjectColor(0),
      order: p.order || 0,
      marker: p.marker || null,
      rowIndex: Number.isInteger(p.rowIndex) ? p.rowIndex : 0
    }));
    setProjects(loaded);
    setProjectOrder(Array.isArray(data.projectOrder) ? data.projectOrder : loaded.map(p => p.id));
    if (data.currentYear) setCurrentYear(data.currentYear);
    if (data.currentQuarter) setCurrentQuarter(data.currentQuarter);
  } catch (e) {
    console.error('Load error:', e);
  }
}

/* =============== Export =============== */
export function exportData() {
  const data = {
    version: '1.1',
    exportDate: new Date().toISOString(),
    currentYear, currentQuarter,
    colorPalette: currentColorPalette,
    projectOrder,
    projects: projects.map(p => ({
      id: p.id, name: p.name,
      startDate: formatDateISO(p.startDate),
      endDate: formatDateISO(p.endDate),
      description: p.description, color: p.color, order: p.order,
      marker: p.marker || null,
      rowIndex: Number.isInteger(p.rowIndex) ? p.rowIndex : 0
    }))
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `workplan-export-${formatDateISO(new Date())}.json`;
  a.click();
  showSuccess('Exported.');
}

/* =============== Import =============== */
export function showImportModal() { id('importModal').style.display = 'block'; }
export function closeImportModal() { id('importModal').style.display = 'none'; if (id('importData')) id('importData').value = ''; }

export function handleFileImport(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { if (id('importData')) id('importData').value = reader.result; showImportModal(); };
  reader.readAsText(file);
}

export function importProjects(fullRender) {
  const str = id('importData')?.value.trim();
  if (!str) return showError('Paste JSON to import.');
  try {
    const data = JSON.parse(str);
    if (!Array.isArray(data.projects)) throw new Error('Invalid data');

    const loaded = [];
    const loadedOrder = [];
    data.projects.forEach(p => {
      const proj = {
        id: p.id || Date.now() + Math.random(),
        name: p.name,
        startDate: parseLocalDate(p.startDate),
        endDate: parseLocalDate(p.endDate),
        description: p.description || '',
        color: p.color || getProjectColor(loaded.length),
        order: p.order || loaded.length,
        marker: p.marker || null,
        rowIndex: Number.isInteger(p.rowIndex) ? p.rowIndex : 0
      };
      loaded.push(proj);
      loadedOrder.push(proj.id);
    });

    setProjects(loaded);
    setProjectOrder(Array.isArray(data.projectOrder) ? data.projectOrder : loadedOrder);

    if (data.currentYear) setCurrentYear(data.currentYear);
    if (data.currentQuarter) setCurrentQuarter(data.currentQuarter);
    if (data.colorPalette) {
      setCurrentColorPalette(data.colorPalette);
      const sel = id('colorPalette');
      if (sel) sel.value = data.colorPalette;
      saveColorPalette();
    }

    reorderAndUpdateProjects();
    saveProjectsToStorage();
    fullRender();
    closeImportModal();
    showSuccess(`Imported ${projects.length} projects.`);
  } catch (e) {
    console.error(e);
    showError('Failed to import JSON.');
  }
}

/* =============== Download PNG =============== */
export async function downloadPNG() {
  const grid = id('timelineGrid') || id('timelineContent');
  if (!grid) return;
  document.body.classList.add('exporting');

  const prev = { overflow: grid.style.overflow, width: grid.style.width, height: grid.style.height };
  const contentWidth = grid.scrollWidth;
  const contentHeight = grid.scrollHeight;
  grid.style.overflow = 'visible';
  grid.style.width = contentWidth + 'px';
  grid.style.height = contentHeight + 'px';

  try {
    const choice = prompt('PNG quality: 1=Low, 2=Medium, 3=High, 4=Ultra', '2');
    const q = parseInt((choice || '').trim(), 10);
    const qualityScale = Math.min(Math.max(isNaN(q) ? 2 : q, 1), 4);
    const maxDim = Math.max(contentWidth, contentHeight);
    const autoScale = Math.max(1, Math.min(qualityScale, Math.floor(8192 / Math.max(1, maxDim))));
    const canvas = await html2canvas(grid, {
      backgroundColor: '#ffffff',
      width: contentWidth, height: contentHeight,
      windowWidth: contentWidth, windowHeight: contentHeight,
      scrollX: 0, scrollY: 0, scale: autoScale,
      useCORS: true
    });
    const a = document.createElement('a');
    const period = id('currentPeriod')?.textContent?.trim().replace(/\s+/g, '_') || 'timeline';
    a.download = `${period}_${formatDateISO(new Date())}.png`;
    a.href = canvas.toDataURL('image/png', 1.0);
    a.click();
  } catch (e) {
    console.error(e);
    showError('Failed to download PNG.');
  } finally {
    grid.style.overflow = prev.overflow;
    grid.style.width = prev.width;
    grid.style.height = prev.height;
    document.body.classList.remove('exporting');
  }
}
