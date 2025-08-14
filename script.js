/* Workplan Visualizer - script.js
   Rewritten: single-file, zoom + fixed context menu + other UX improvements
*/

/* =============== State =============== */
let currentYear = new Date().getFullYear();
let currentQuarter = getCurrentQuarter();
let currentView = 'year';
let projects = [];
let apiKey = localStorage.getItem('geminiApiKey');
let currentColorPalette = 'mckinsey';
let projectOrder = [];
let editingProjectId = null;
let editingTitleProjectId = null;
let openMenuProjectId = null;
let openMenuElement = null;

let autoWrap = false;      // Wrap text and auto-size node heights
let spacingScale = 1;      // 0.6–2.0 squeeze/breeze multiplier affecting row gap and top padding
let todayOn = false;       // Today line toggle
let hiddenMonthsLeft = 0;  // Zoom: number of months hidden from the left in Year view (0-13)

/* =============== Palettes =============== */
const colorPalettes = {
  mckinsey: ['#003f5c', '#2f4b7c', '#665191', '#a05195', '#d45087', '#f95d6a', '#ff7c43', '#ffa600'],
  bcg: ['#00594e', '#009988', '#66b2b2', '#004d47', '#7a9b92', '#003a36', '#4d7c78', '#80b3ad'],
  bain: ['#c41e3a', '#8b0000', '#ff6b6b', '#004d5c', '#2d5a87', '#4682b4', '#6495ed', '#b0c4de'],
  deloitte: ['#006400', '#228b22', '#32cd32', '#7cfc00', '#008b8b', '#20b2aa', '#48d1cc', '#00ced1'],
  pwc: ['#ff8c00', '#ff7f50', '#ffa500', '#ffd700', '#4169e1', '#1e90ff', '#00bfff', '#87ceeb'],
  kpmg: ['#00338d', '#0066cc', '#3399ff', '#66b3ff', '#1a5490', '#2d6ea3', '#4080b6', '#5392c9'],
  ey: ['#ffe600', '#ffcc00', '#ffb300', '#ff9900', '#2e2e2e', '#4d4d4d', '#666666', '#808080'],
  accenture: ['#a100ff', '#7b00cc', '#5500aa', '#9933ff', '#b366ff', '#cc99ff', '#e6ccff', '#4d0080']
};

/* =============== Utils =============== */
function clamp(n, min, max) { return Math.min(Math.max(n, min), max); }
function cssNum(varName, fallback) {
  const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  const parsed = parseFloat(val);
  return isNaN(parsed) ? parseFloat(fallback) : parsed;
}
function debounce(fn, ms) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
}
function id(v) { return document.getElementById(v); }

function getCurrentQuarter() {
  const now = new Date(); const m = now.getMonth();
  return m <= 2 ? 1 : m <= 5 ? 2 : m <= 8 ? 3 : 4;
}

/* =============== Init =============== */
function init() {
  updatePeriodDisplay();
  loadProjectsFromStorage();
  loadColorPalette();
  loadCustomPalettes();
  renderProjects();
  renderTimeline();

  // Add Zoom +/- controls (injected by JS so it integrates with existing layout)
  const zoomHost =
    document.querySelector('.year-navigation') ||
    document.querySelector('.timeline-header') ||
    document.querySelector('.controls-section') ||
    document.body;
  if (zoomHost && !document.getElementById('zoomControls')) {
    const wrap = document.createElement('div');
    wrap.id = 'zoomControls';
    wrap.style.display = 'flex';
    wrap.style.gap = '8px';
    wrap.style.alignItems = 'center';
    wrap.style.marginLeft = '8px';
    wrap.innerHTML = `
      <button id="zoomOutBtn" class="nav-arrow" title="Zoom out">🔍−</button>
      <button id="zoomInBtn" class="nav-arrow" title="Zoom in">🔍+</button>
    `;
    zoomHost.insertBefore(wrap, zoomHost.firstChild);

    const maxHidden = 13; // allow hiding up to 13 months (14-month canvas -> keep at least 1 month visible)
    id('zoomInBtn').onclick = () => {
      if (currentView !== 'year') setView('year');
      hiddenMonthsLeft = Math.min(hiddenMonthsLeft + 1, maxHidden);
      renderTimeline();
    };
    id('zoomOutBtn').onclick = () => {
      hiddenMonthsLeft = Math.max(hiddenMonthsLeft - 1, 0);
      renderTimeline();
    };
  }

  initializeProjectListDragAndDrop();

  // Keep layout robust on resize/zoom
  window.addEventListener('resize', debounce(() => {
    if (todayOn) positionTodayLine();
    renderTimeline();
  }, 120));

  // Close context menu on global actions
  ['scroll', 'click', 'resize'].forEach(ev =>
    window.addEventListener(ev, () => closeContextMenu(), { passive: true })
  );
}

/* =============== Controls =============== */
function adjustNodeHeight(delta) {
  let h = cssNum('--node-height', '36') + delta;
  h = clamp(h, 20, 120);
  document.documentElement.style.setProperty('--node-height', h + 'px');
  renderTimeline();
}

function adjustTextSize(delta) {
  let f = cssNum('--node-font-size', '0.8') + delta;
  f = clamp(f, 0.6, 1.6);
  document.documentElement.style.setProperty('--node-font-size', f + 'rem');
  renderTimeline();
}

function squeezeSpacing() { spacingScale = clamp(spacingScale - 0.1, 0.6, 2); renderTimeline(); }
function breezeSpacing() { spacingScale = clamp(spacingScale + 0.1, 0.6, 2); renderTimeline(); }

function toggleWrap() {
  autoWrap = !autoWrap;
  const btn = id('toggleWrapBtn');
  if (btn) btn.textContent = autoWrap ? 'Wrap: On' : 'Wrap: Off';
  renderTimeline();
}

/* =============== Today line =============== */
function ensureTodayLineElement() {
  const content = id('timelineContent');
  if (!content) return null;
  let el = id('todayLine');
  if (!el) {
    el = document.createElement('div');
    el.id = 'todayLine';
    el.className = 'today-line';
    content.appendChild(el);
  }
  return el;
}

function toggleTodayLine() {
  todayOn = !todayOn;
  const line = ensureTodayLineElement();
  if (!line) return;
  line.style.display = todayOn ? 'block' : 'none';
  const btn = id('toggleTodayBtn');
  if (btn) btn.textContent = todayOn ? 'Today: On' : 'Today: Off';
  if (todayOn) positionTodayLine();
}

function positionTodayLine() {
  const content = id('timelineContent');
  const line = ensureTodayLineElement();
  if (!content || !line) return;

  const { startDate, endDate, totalDuration } = getCurrentViewWindow();
  const today = new Date();
  if (today < startDate || today > endDate) { line.style.display = 'none'; return; }
  if (todayOn) line.style.display = 'block';

  const frac = clamp((today - startDate) / totalDuration, 0, 1);
  line.style.left = (frac * 100) + '%';
}

/* =============== View helpers =============== */
function getCurrentViewWindow() {
  let startDate, endDate, fullWidth;
  if (currentView === 'quarter') {
    let startMonth, endMonth;
    if (currentQuarter === 1) { startMonth = 0; endMonth = 2; }
    else if (currentQuarter === 2) { startMonth = 3; endMonth = 5; }
    else if (currentQuarter === 3) { startMonth = 6; endMonth = 8; }
    else { startMonth = 9; endMonth = 11; }
    startDate = new Date(currentYear, startMonth, 1);
    endDate = new Date(currentYear, endMonth + 1, 0);
    fullWidth = 600;
  } else {
    // Year view: start at Nov of previous year + hiddenMonthsLeft months (zoom)
    startDate = new Date(currentYear - 1, 10 + hiddenMonthsLeft, 1);
    endDate = new Date(currentYear, 11, 31);
    fullWidth = 1400;
  }
  return { startDate, endDate, fullWidth, totalDuration: endDate - startDate };
}

function setView(view) {
  currentView = view;
  document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
  if (view === 'year') id('yearBtn')?.classList.add('active');
  else { id('quarterBtn')?.classList.add('active'); currentQuarter = getCurrentQuarter(); }
  updatePeriodDisplay();
  renderTimeline();
}

function navigatePeriod(direction) {
  if (currentView === 'year') currentYear += direction;
  else {
    currentQuarter += direction;
    if (currentQuarter > 4) { currentQuarter = 1; currentYear += 1; }
    else if (currentQuarter < 1) { currentQuarter = 4; currentYear -= 1; }
  }
  updatePeriodDisplay();
  renderTimeline();
}

function updatePeriodDisplay() {
  const el = id('currentPeriod');
  if (el) el.textContent = currentView === 'year' ? currentYear : `Q${currentQuarter} ${currentYear}`;
}

/* =============== Timeline =============== */
function renderTimeline() {
  const monthsContainer = id('timelineMonths');
  const contentContainer = id('timelineContent');
  if (!monthsContainer || !contentContainer) return;

  let months, startDate, endDate;

  if (currentView === 'quarter') {
    let quarterMonths, startMonth, endMonth;
    if (currentQuarter === 1) { quarterMonths = ['Jan','Feb','Mar']; startMonth = 0; endMonth = 2; }
    else if (currentQuarter === 2) { quarterMonths = ['Apr','May','Jun']; startMonth = 3; endMonth = 5; }
    else if (currentQuarter === 3) { quarterMonths = ['Jul','Aug','Sep']; startMonth = 6; endMonth = 8; }
    else { quarterMonths = ['Oct','Nov','Dec']; startMonth = 9; endMonth = 11; }

    months = quarterMonths.map(m => `${m} ${currentYear}`);
    startDate = new Date(currentYear, startMonth, 1);
    endDate = new Date(currentYear, endMonth + 1, 0);
    monthsContainer.style.minWidth = '600px';
    contentContainer.style.minWidth = '600px';
  } else {
    // Build month labels from the zoomed start to Dec current year
    const start = new Date(currentYear - 1, 10 + hiddenMonthsLeft, 1);
    const end = new Date(currentYear, 11, 1);
    const labels = [];
    let iter = new Date(start);
    while (iter <= end) {
      labels.push(iter.toLocaleString('en-US', { month: 'short' }) + ' ' + iter.getFullYear());
      iter = new Date(iter.getFullYear(), iter.getMonth() + 1, 1);
    }
    months = labels;
    startDate = start;
    endDate = new Date(currentYear, 11, 31);
    monthsContainer.style.minWidth = '1400px';
    contentContainer.style.minWidth = '1400px';
  }

  const totalDuration = endDate - startDate;
  monthsContainer.innerHTML = months.map(month => `<div class="month-label">${month}</div>`).join('');
  contentContainer.querySelectorAll('.project-bar').forEach(el => el.remove());

  // Build visible projects and calculate positions
  const visibleProjects = projects.filter(p => !(p.endDate < startDate || p.startDate > endDate));
  const projectPositions = calculateProjectPositions(visibleProjects, startDate, totalDuration);
  const maxRow = projectPositions.length ? Math.max(...projectPositions.map(p => p.row)) : 0;

  const contentWidthPx =
    contentContainer.clientWidth ||
    parseFloat(getComputedStyle(contentContainer).minWidth) ||
    (currentView === 'quarter' ? 600 : 1400);

  const createdBars = [];
  const nodeHeightPx = cssNum('--node-height', '36');
  const baseTopMin = 12;              // minimal padding above first row
  const baseTop = Math.max(baseTopMin, Math.round(24 + 24 * spacingScale));  // squeeze/breeze affects top padding
  const baseRowHeight = 45;           // logical row height before scaling
  const minGap = 8;
  const uniformRowHeight = Math.max(Math.round(baseRowHeight * spacingScale), nodeHeightPx + minGap);

  // Create bars
  projectPositions.forEach(({ project, row, left, width }) => {
    const bar = document.createElement('div');
    bar.className = 'project-bar';
    bar.dataset.projectId = project.id;
    bar.style.backgroundColor = project.color;
    bar.style.left = left + '%';
    bar.style.width = width + '%';
    bar.style.position = 'absolute';

    // Content
    if (autoWrap) {
      bar.classList.add('project-bar-multiline');
      bar.textContent = project.name;
    } else {
      const actualWidth = (width / 100) * contentWidthPx;
      if (actualWidth > 120) {
        bar.classList.add('project-bar-multiline');
        bar.innerHTML = wrapTextForWidth(project.name, actualWidth - 16);
      } else {
        bar.textContent = project.name;
      }
    }

    bar.title = `${project.name}\n${project.startDate.toDateString()} - ${project.endDate.toDateString()}\nDrag to change dates`;

    // Drag
    addDragListeners(bar, project, startDate, totalDuration);

    // Double-click semicircle menu
    bar.addEventListener('dblclick', (e) => {
      e.preventDefault(); e.stopPropagation();
      closeSemicircleMenu();
      openMenuProjectId = project.id;
      openMenuElement = bar;
      showSemicircleMenu(bar, project);
    });

    // Right-click context menu
    bar.addEventListener('contextmenu', (e) => openContextMenu(e, bar, project));

    // Marker icon
    if (project.marker) {
      const iconSpan = document.createElement('span');
      iconSpan.className = 'icon-marker';
      iconSpan.innerHTML = getMarkerIconHTML(project.marker);
      bar.appendChild(iconSpan);
    }

    contentContainer.appendChild(bar);
    createdBars.push({ el: bar, row });
  });

  // Layout rows
  if (autoWrap) {
    const rows = maxRow + 1;
    const rowHeights = Array(rows).fill(0);
    createdBars.forEach(({ el, row }) => {
      const h = el.offsetHeight || nodeHeightPx;
      rowHeights[row] = Math.max(rowHeights[row], h);
    });

    const gap = Math.max(4, Math.round(10 * spacingScale));
    const rowTops = [];
    let accTop = baseTop;
    for (let r = 0; r < rows; r++) {
      rowTops[r] = accTop;
      accTop += rowHeights[r] + gap;
    }
    createdBars.forEach(({ el, row }) => { el.style.top = rowTops[row] + 'px'; });

    const baseBottom = 100;
    const totalHeight = accTop + baseBottom;
    contentContainer.style.minHeight = Math.max(350, totalHeight) + 'px';
  } else {
    const baseBottom = 100;
    const timelineHeight = Math.max(350, (maxRow + 1) * uniformRowHeight + baseBottom + baseTop);
    contentContainer.style.minHeight = timelineHeight + 'px';
    createdBars.forEach(({ el, row }) => { el.style.top = (baseTop + row * uniformRowHeight) + 'px'; });
  }

  ensureTodayLineElement();
  if (todayOn) positionTodayLine();
}

// Overlap-aware position calculation
function calculateProjectPositions(visibleProjects, startDate, totalDuration) {
  if (visibleProjects.length === 0) return [];
  const projectPositions = [];
  const occupiedRows = [];

  const sorted = [...visibleProjects].sort((a, b) => {
    const aStart = Math.max(a.startDate.getTime(), startDate.getTime());
    const bStart = Math.max(b.startDate.getTime(), startDate.getTime());
    if (aStart === bStart) return a.endDate - b.endDate;
    return aStart - bStart;
  });

  sorted.forEach(project => {
    const projectStart = project.startDate < startDate ? startDate : project.startDate;
    const projectEnd = project.endDate > new Date(startDate.getTime() + totalDuration) ? new Date(startDate.getTime() + totalDuration) : project.endDate;
    if (projectEnd <= projectStart) return;

    const startPercent = ((projectStart - startDate) / totalDuration) * 100;
    const endPercent = ((projectEnd - startDate) / totalDuration) * 100;
    const width = Math.max(endPercent - startPercent, 3);

    // Find first free row
    let row = 0;
    for (;;) {
      if (!occupiedRows[row]) occupiedRows[row] = [];
      const buffer = 0.5;
      const overlap = occupiedRows[row].some(o => !(endPercent <= (o.start - buffer) || startPercent >= (o.end + buffer)));
      if (!overlap) { occupiedRows[row].push({ start: startPercent, end: endPercent }); break; }
      row++;
    }

    projectPositions.push({ project, row, left: Math.max(startPercent, 0), width });
  });

  return projectPositions;
}

/* =============== Node drag (robust) =============== */
function addDragListeners(projectBar, project, viewStartDate, totalDuration) {
  const onPointerDown = (e) => {
    if (e.button !== 0) return; // left click only
    const container = projectBar.parentElement;
    const startX = e.clientX;
    const startLeft = parseFloat(projectBar.style.left) || 0;
    const containerWidth = container.offsetWidth;

    projectBar.classList.add('dragging');
    document.body.style.cursor = 'grabbing';

    const onPointerMove = (ev) => {
      const deltaX = ev.clientX - startX;
      const deltaPercent = (deltaX / containerWidth) * 100;
      const newLeft = clamp(startLeft + deltaPercent, 0, 100 - 3); // keep inside
      projectBar.style.left = newLeft + '%';
    };

    const onPointerUp = (ev) => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp, true);
      projectBar.classList.remove('dragging');
      document.body.style.cursor = 'default';

      // Commit new dates
      const newLeftPercent = parseFloat(projectBar.style.left);
      const projectDuration = project.endDate - project.startDate;
      const newStartTime = viewStartDate.getTime() + (newLeftPercent / 100) * totalDuration;
      project.startDate = new Date(newStartTime);
      project.endDate = new Date(newStartTime + projectDuration);
      saveProjectsToStorage();
      renderProjects();
      renderTimeline();
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp, true);
  };

  projectBar.addEventListener('pointerdown', onPointerDown);
}

/* =============== Text wrapping helper (2-line heuristic) =============== */
function wrapTextForWidth(text, maxWidth) {
  if (maxWidth < 80) return text;
  const words = text.split(' ');
  if (words.length === 1) return text;
  const mid = Math.ceil(words.length / 2);
  return `${words.slice(0, mid).join(' ')}<br>${words.slice(mid).join(' ')}`;
}

/* =============== Projects list (with quick add) =============== */
function renderProjects() {
  const container = id('projectsList');
  if (!container) return;

  const sorted = [...projects].sort((a, b) => projectOrder.indexOf(a.id) - projectOrder.indexOf(b.id));
  const listHtml = sorted.map(project => `
    <div class="project-item" style="border-left-color:${project.color}" data-project-id="${project.id}">
      <div class="drag-handle">⋮⋮</div>
      <div class="project-info">
        <div class="project-name ${editingTitleProjectId === project.id ? 'editing' : ''}"
             onclick="editProjectTitle(${project.id})" title="Click to edit name">
          ${editingTitleProjectId === project.id ? '' : project.name}
        </div>
        <div class="project-dates ${editingProjectId === project.id ? 'editing' : ''}"
             onclick="editProjectDates(${project.id})" title="Click to edit dates">
          ${editingProjectId === project.id ? '' : `${project.startDate.toDateString()} - ${project.endDate.toDateString()}`}
        </div>
        ${project.description ? `<div>${project.description}</div>` : ''}
      </div>
      <div class="project-actions">
        <button class="duplicate-btn" onclick="duplicateProject(${project.id})" title="Duplicate project">⎘</button>
        <button class="delete-btn" onclick="deleteProject(${project.id})" title="Delete project">×</button>
      </div>
    </div>
  `).join('');

  container.innerHTML = `
    <h3>All Projects (${projects.length}) - Click names or dates to edit | Drag to reorder</h3>
    <div class="quick-add">
      <input id="qaName" type="text" placeholder="Project name">
      <input id="qaStart" type="date">
      <input id="qaEnd" type="date">
      <input id="qaDesc" type="text" placeholder="Description (optional)">
      <button class="btn-primary" onclick="addProjectFromList()">Add Project</button>
    </div>
    ${projects.length ? listHtml : '<p style="text-align:center;color:#666;">No projects yet. Use Send above or Add Project here.</p>'}
  `;

  // Make each project draggable in the list
  sorted.forEach(project => {
    const el = document.querySelector(`[data-project-id="${project.id}"]`);
    if (el) makeProjectDraggable(el, project.id);
  });
}

function addProjectFromList() {
  const name = id('qaName')?.value.trim() || '';
  const start = id('qaStart')?.value;
  const end = id('qaEnd')?.value;
  const desc = id('qaDesc')?.value.trim() || '';
  if (!name || !start || !end) { showError('Please enter name, start, and end.'); return; }
  addProject({ name, startDate: start, endDate: end, description: desc });
  if (id('qaName')) id('qaName').value = '';
  if (id('qaStart')) id('qaStart').value = '';
  if (id('qaEnd')) id('qaEnd').value = '';
  if (id('qaDesc')) id('qaDesc').value = '';
  showSuccess('Project added.');
}

/* =============== CRUD and storage =============== */
function addProject(data) {
  const project = {
    id: Date.now() + Math.random(),
    name: data.name,
    startDate: new Date(data.startDate),
    endDate: new Date(data.endDate),
    description: data.description || '',
    color: getProjectColor(projects.length),
    order: projects.length,
    marker: null
  };
  projects.push(project);
  projectOrder.push(project.id);
  reorderAndUpdateProjects();
  saveProjectsToStorage();
  renderProjects();
  renderTimeline();
}

function getCurrentPalette() {
  if (currentColorPalette.startsWith('custom_')) {
    const custom = JSON.parse(localStorage.getItem('customColorPalettes') || '{}');
    return custom[currentColorPalette] || colorPalettes.mckinsey;
  }
  return colorPalettes[currentColorPalette] || colorPalettes.mckinsey;
}
function getProjectColor(index) { const palette = getCurrentPalette(); return palette[index % palette.length]; }

function updateColorPalette() {
  const val = id('colorPalette')?.value;
  if (!val) return;
  if (val === 'custom') { showCustomColorModal(); return; }
  currentColorPalette = val;
  projects.forEach((p, i) => p.color = getProjectColor(i));
  saveColorPalette();
  saveProjectsToStorage();
  renderTimeline();
}

function deleteProject(id) {
  if (!confirm('Delete this project?')) return;
  projects = projects.filter(p => p.id !== id);
  projectOrder = projectOrder.filter(pid => pid !== id);
  projects.forEach((p, i) => { p.color = getProjectColor(i); });
  saveProjectsToStorage();
  renderProjects();
  renderTimeline();
  showSuccess('Project deleted.');
}

function duplicateProject(id) {
  const base = projects.find(p => p.id === id);
  if (!base) return;
  const dup = {
    id: Date.now() + Math.random(),
    name: base.name + ' (Copy)',
    startDate: new Date(base.startDate),
    endDate: new Date(base.endDate),
    description: base.description,
    color: getProjectColor(projects.length),
    order: projects.length,
    marker: base.marker || null
  };
  projects.push(dup);
  projectOrder.push(dup.id);
  saveProjectsToStorage();
  renderProjects();
  renderTimeline();
  showSuccess('Duplicated.');
}

function reorderAndUpdateProjects() {
  projects.sort((a, b) => projectOrder.indexOf(a.id) - projectOrder.indexOf(b.id));
  projects.forEach((p, i) => { p.color = getProjectColor(i); p.order = i; });
}

/* Title and date editing */
function editProjectTitle(projectId) {
  if (editingTitleProjectId && editingTitleProjectId !== projectId) cancelTitleEdit();
  if (editingProjectId && editingProjectId !== projectId) cancelDateEdit();

  editingTitleProjectId = projectId;
  const el = document.querySelector(`[data-project-id="${projectId}"] .project-name`);
  const p = projects.find(x => x.id === projectId);
  if (!el || !p) return;

  el.innerHTML = `
    <div class="editing" onclick="event.stopPropagation()">
      <input type="text" class="title-input" id="titleInput-${projectId}" value="${escapeHtml(p.name)}" onclick="event.stopPropagation()" onkeypress="handleTitleKeyPress(event, ${projectId})">
      <div class="title-edit-buttons">
        <button class="title-edit-btn" onclick="event.stopPropagation(); saveTitleEdit(${projectId})">Save</button>
        <button class="title-edit-btn cancel" onclick="event.stopPropagation(); cancelTitleEdit()">Cancel</button>
      </div>
    </div>`;
  el.classList.add('editing');

  setTimeout(() => { const input = id(`titleInput-${projectId}`); if (input) { input.focus(); input.select(); } }, 50);
}
function handleTitleKeyPress(e, idv) { if (e.key === 'Enter') saveTitleEdit(idv); else if (e.key === 'Escape') cancelTitleEdit(); }
function saveTitleEdit(idv) {
  const input = id(`titleInput-${idv}`);
  if (!input) return showError('Title input missing.');
  const val = input.value.trim(); if (!val) return showError('Project name cannot be empty.');
  const p = projects.find(x => x.id === idv); if (p) { p.name = val; editingTitleProjectId = null; saveProjectsToStorage(); renderProjects(); renderTimeline(); showSuccess('Name updated.'); }
}
function cancelTitleEdit() { editingTitleProjectId = null; renderProjects(); }

function editProjectDates(idv) {
  if (editingProjectId && editingProjectId !== idv) cancelDateEdit();
  if (editingTitleProjectId && editingTitleProjectId !== idv) cancelTitleEdit();

  editingProjectId = idv;
  const el = document.querySelector(`[data-project-id="${idv}"] .project-dates`);
  const p = projects.find(x => x.id === idv);
  if (!el || !p) return;

  const s = p.startDate.toISOString().split('T')[0];
  const e = p.endDate.toISOString().split('T')[0];
  el.innerHTML = `
    <div class="editing" onclick="event.stopPropagation()">
      <input type="date" class="date-input" id="startDate-${idv}" value="${s}" onclick="event.stopPropagation()">
      <span> to </span>
      <input type="date" class="date-input" id="endDate-${idv}" value="${e}" onclick="event.stopPropagation()">
      <div class="date-edit-buttons">
        <button class="date-edit-btn" onclick="event.stopPropagation(); saveDateEdit(${idv})">Save</button>
        <button class="date-edit-btn cancel" onclick="event.stopPropagation(); cancelDateEdit()">Cancel</button>
      </div>
    </div>`;
  el.classList.add('editing');
  setTimeout(() => id(`startDate-${idv}`)?.focus(), 50);
}
function saveDateEdit(idv) {
  const s = id(`startDate-${idv}`)?.value;
  const e = id(`endDate-${idv}`)?.value;
  if (!s || !e) return showError('Enter both start and end.');
  const sD = new Date(s), eD = new Date(e);
  if (sD >= eD) return showError('End must be after start.');
  const p = projects.find(x => x.id === idv);
  if (p) { p.startDate = sD; p.endDate = eD; saveProjectsToStorage(); renderProjects(); renderTimeline(); showSuccess('Dates updated.'); }
  editingProjectId = null;
}
function cancelDateEdit() { editingProjectId = null; renderProjects(); }

/* =============== Drag & drop in All Projects =============== */
function initializeProjectListDragAndDrop() {
  document.addEventListener('dragover', (e) => { e.preventDefault(); });
  document.addEventListener('drop', (e) => { e.preventDefault(); document.getElementById('drag-placeholder')?.remove(); });
}
function makeProjectDraggable(el, idv) {
  el.draggable = true;
  el.addEventListener('dragstart', (e) => {
    el.classList.add('dragging');
    e.dataTransfer.setData('text/plain', idv);
    e.dataTransfer.effectAllowed = 'move';
    const ph = document.createElement('div');
    ph.className = 'project-item'; ph.style.opacity = '0.5'; ph.style.border = '2px dashed var(--blue-80)';
    ph.innerHTML = '<div style="text-align:center;color:var(--blue-80);">Drop here</div>'; ph.id = 'drag-placeholder';
    setTimeout(() => { el.style.display = 'none'; }, 0);
  });
  el.addEventListener('dragend', () => {
    el.classList.remove('dragging'); el.style.display = 'flex';
    document.getElementById('drag-placeholder')?.remove();
  });
  el.addEventListener('dragover', (e) => {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    const after = getDragAfterElement(el.parentNode, e.clientY);
    const ph = document.getElementById('drag-placeholder') || createPlaceholder();
    if (after == null) el.parentNode.appendChild(ph); else el.parentNode.insertBefore(ph, after);
  });
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    const draggedId = +e.dataTransfer.getData('text/plain');
    const ph = document.getElementById('drag-placeholder');
    if (ph && draggedId) {
      const itemsBefore = Array.from(el.parentNode.children)
        .slice(0, Array.from(el.parentNode.children).indexOf(ph))
        .filter(c => c.dataset.projectId).length;
      const oldIndex = projectOrder.indexOf(draggedId);
      if (oldIndex !== -1) projectOrder.splice(oldIndex, 1);
      projectOrder.splice(itemsBefore, 0, draggedId);
      reorderAndUpdateProjects();
      saveProjectsToStorage();
      renderProjects();
      renderTimeline();
      showSuccess('Project order updated!');
      ph.remove();
    }
  });
}
function createPlaceholder() {
  const ph = document.createElement('div');
  ph.className = 'project-item'; ph.style.opacity = '0.5'; ph.style.border = '2px dashed var(--blue-80)';
  ph.style.background = 'transparent'; ph.innerHTML = '<div style="text-align:center;color:var(--blue-80);padding:1rem;">Drop here</div>';
  ph.id = 'drag-placeholder'; return ph;
}
function getDragAfterElement(container, y) {
  const els = [...container.querySelectorAll('.project-item:not(.dragging):not(#drag-placeholder)')];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect(); const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

/* =============== Context menu on nodes =============== */
function openContextMenu(e, barEl, project) {
  e.preventDefault();
  e.stopPropagation();
  closeContextMenu();

  const menu = id('nodeContextMenu');
  if (!menu) return;
  const palette = getCurrentPalette();
  const colorSwatches = palette.map(c => `<div class="color-swatch" data-color="${c}" style="background:${c}"></div>`).join('');
  menu.innerHTML = `
    <div class="ctx-section">
      <div class="ctx-title">Actions</div>
      <div class="ctx-item" data-action="edit-name">Edit name</div>
      <div class="ctx-item" data-action="edit-dates">Edit dates</div>
      <div class="ctx-item" data-action="edit-desc">Edit description</div>
    </div>
    <div class="ctx-sep"></div>
    <div class="ctx-section">
      <div class="ctx-title">Color</div>
      <div class="ctx-row">${colorSwatches}</div>
    </div>
    <div class="ctx-sep"></div>
    <div class="ctx-section">
      <div class="ctx-title">Milestone</div>
      <div class="ctx-row">
        <div class="ctx-item" data-marker="star">★ Star</div>
        <div class="ctx-item" data-marker="flag">⚑ Flag</div>
        <div class="ctx-item" data-marker="exclamation">❗ Important</div>
        <div class="ctx-item" data-marker="none">✕ Clear</div>
      </div>
    </div>
    <div class="ctx-sep"></div>
    <div class="ctx-section">
      <div class="ctx-item" data-action="duplicate">Duplicate</div>
      <div class="ctx-item" data-action="delete" style="color:#c62828;">Delete</div>
    </div>
  `;

  // Position
  menu.classList.remove('hidden');
  const vw = window.innerWidth, vh = window.innerHeight;
  const rect = menu.getBoundingClientRect();
  let x = e.clientX, y = e.clientY;
  if (x + rect.width > vw) x = vw - rect.width - 8;
  if (y + rect.height > vh) y = vh - rect.height - 8;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  // Single assignment to prevent multiple listeners
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
      if (listEl) listEl.scrollIntoView({ behavior:'smooth', block:'center' });
      setTimeout(() => editProjectDates(project.id), 250);
      closeContextMenu();
      return;
    }
    if (action === 'edit-desc') {
      const newDesc = prompt('Description:', project.description || '');
      if (newDesc !== null) {
        project.description = newDesc.trim();
        saveProjectsToStorage();
        renderProjects(); renderTimeline();
      }
      closeContextMenu();
      return;
    }
    if (action === 'duplicate') { duplicateProject(project.id); closeContextMenu(); return; }
    if (action === 'delete') { deleteProject(project.id); closeContextMenu(); return; }

    if (swatch) {
      const color = swatch.getAttribute('data-color');
      project.color = color;
      saveProjectsToStorage(); renderTimeline(); renderProjects();
      closeContextMenu();
      return;
    }
    if (marker) {
      project.marker = (marker === 'none') ? null : marker;
      saveProjectsToStorage(); renderTimeline();
      closeContextMenu();
    }
  };
}
function closeContextMenu() {
  const menu = id('nodeContextMenu');
  if (menu) { menu.classList.add('hidden'); menu.innerHTML = ''; menu.onclick = null; }
}

/* =============== API-driven "Send" (stubbed parser) =============== */
function handleEnterKey(e) { if (e.key === 'Enter') processProject(); }

function processProject() {
  const input = id('projectInput')?.value.trim();
  if (!input) return;
  if (!apiKey) { showApiKeyModal(); return; }
  showLoading(true); hideMessages();
  callGeminiAPI(input);
}

function getCurrentQuarterDates() {
  const q = currentView === 'quarter' ? currentQuarter : getCurrentQuarter();
  const map = {1:[0,2],2:[3,5],3:[6,8],4:[9,11]};
  const [sm, em] = map[q];
  const s = new Date(currentYear, sm, 1);
  const e = new Date(currentYear, em + 1, 0);
  return { start: s.toISOString().split('T')[0], end: e.toISOString().split('T')[0] };
}

// Example safe implementation; adjust endpoint & parsing to your model's response shape
async function callGeminiAPI(input) {
  const quarterDates = getCurrentQuarterDates();
  const prompt = `You are a project parser. Return JSON array of projects {name,startDate,endDate,description?}. Use ISO dates. Context quarterStart=${quarterDates.start} quarterEnd=${quarterDates.end}. Text: ${input}`;

  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    if (!response.ok) throw new Error(`API Error: ${response.status} - ${response.statusText}`);
    const data = await response.json();
    if (data.error) throw new Error(`API Error: ${data.error.message}`);

    // Try to extract candidate text (model dependent)
    let text = '';
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      text = data.candidates[0].content.parts[0].text || '';
    } else if (data.output && data.output[0]) {
      text = data.output[0].content || '';
    } else if (data.result) {
      text = JSON.stringify(data.result);
    }

    // Clean and attempt to parse JSON blob from text
    let cleaned = text.replace(/[\u2018\u2019\u201C\u201D]/g, '"').replace(/\r/g, '\n');
    // Try to extract first JSON array/object
    const arrMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (!arrMatch) throw new Error('No JSON found in AI response.');
    cleaned = arrMatch[0];
    let arr;
    try { arr = JSON.parse(cleaned); } catch (e) { throw new Error('Failed to parse AI JSON response.'); }

    if (!Array.isArray(arr)) arr = [arr];
    let added = 0;
    arr.forEach(p => {
      if (!p.name || !p.startDate || !p.endDate) return;
      const s = new Date(p.startDate), e = new Date(p.endDate);
      if (isNaN(s) || isNaN(e)) return;
      addProject({
        name: p.name,
        startDate: s.toISOString().split('T')[0],
        endDate: e.toISOString().split('T')[0],
        description: p.description || ''
      });
      added++;
    });

    if (id('projectInput')) id('projectInput').value = '';
    hideMessages();
    if (added) showSuccess(`Added ${added} project${added>1 ? 's' : ''}.`); else showError('No valid projects found.');
  } catch (err) {
    console.error(err);
    showError('API call failed: ' + err.message);
  } finally {
    showLoading(false);
  }
}

/* =============== Export / Import / Storage =============== */
async function downloadPNG() {
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
    const canvas = await html2canvas(grid, {
      backgroundColor: '#ffffff',
      width: contentWidth, height: contentHeight,
      windowWidth: contentWidth, windowHeight: contentHeight,
      scrollX: 0, scrollY: 0, scale: Math.min(2, (4096 / Math.max(contentWidth, contentHeight)) || 1),
      useCORS: true
    });
    const a = document.createElement('a');
    const period = id('currentPeriod')?.textContent?.trim().replace(/\s+/g, '_') || 'timeline';
    a.download = `${period}_${new Date().toISOString().slice(0,10)}.png`;
    a.href = canvas.toDataURL('image/png', 1.0);
    a.click();
  } catch (e) {
    console.error(e); showError('Failed to download PNG.');
  } finally {
    grid.style.overflow = prev.overflow; grid.style.width = prev.width; grid.style.height = prev.height;
    document.body.classList.remove('exporting');
  }
}

function exportData() {
  const data = {
    version: '1.1',
    exportDate: new Date().toISOString(),
    currentYear, currentQuarter, colorPalette: currentColorPalette, projectOrder,
    projects: projects.map(p => ({
      id: p.id, name: p.name, startDate: p.startDate.toISOString().split('T')[0],
      endDate: p.endDate.toISOString().split('T')[0], description: p.description, color: p.color, order: p.order, marker: p.marker || null
    }))
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `workplan-export-${new Date().toISOString().slice(0,10)}.json`; a.click();
  showSuccess('Exported.');
}

function showImportModal() { id('importModal').style.display = 'block'; }
function closeImportModal() { id('importModal').style.display = 'none'; id('importData').value=''; }
function handleFileImport(e) {
  const file = e.target.files?.[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { id('importData').value = reader.result; showImportModal(); };
  reader.readAsText(file);
}
function importProjects() {
  const str = id('importData')?.value.trim();
  if (!str) return showError('Paste JSON to import.');
  try {
    const data = JSON.parse(str);
    if (!Array.isArray(data.projects)) throw new Error('Invalid data');
    projects = [];
    projectOrder = [];
    data.projects.forEach(p => {
      projects.push({
        id: p.id || Date.now() + Math.random(),
        name: p.name,
        startDate: new Date(p.startDate),
        endDate: new Date(p.endDate),
        description: p.description || '',
        color: p.color || getProjectColor(projects.length),
        order: p.order || projects.length,
        marker: p.marker || null
      });
      projectOrder.push(projects[projects.length - 1].id);
    });

    if (Array.isArray(data.projectOrder)) projectOrder = data.projectOrder;
    if (data.currentYear) currentYear = data.currentYear;
    if (data.currentQuarter) currentQuarter = data.currentQuarter;
    if (data.colorPalette) { currentColorPalette = data.colorPalette; id('colorPalette') && (id('colorPalette').value = currentColorPalette); saveColorPalette(); }

    reorderAndUpdateProjects(); updatePeriodDisplay(); saveProjectsToStorage();
    renderProjects(); renderTimeline(); closeImportModal(); showSuccess(`Imported ${projects.length} projects.`);
  } catch (e) {
    console.error(e); showError('Failed to import JSON.');
  }
}

function clearAllProjects() {
  if (!confirm('Delete all projects?')) return;
  projects = []; projectOrder = [];
  saveProjectsToStorage(); renderProjects(); renderTimeline();
  showSuccess('All projects cleared.');
}

function saveProjectsToStorage() {
  const data = {
    projects: projects.map(p => ({
      id: p.id, name: p.name,
      startDate: p.startDate.toISOString().split('T')[0],
      endDate: p.endDate.toISOString().split('T')[0],
      description: p.description, color: p.color, order: p.order, marker: p.marker || null
    })), currentYear, currentQuarter, projectOrder
  };
  localStorage.setItem('workplanProjects', JSON.stringify(data));
}

function loadProjectsFromStorage() {
  const stored = localStorage.getItem('workplanProjects');
  if (!stored) return;
  try {
    const data = JSON.parse(stored);
    projects = data.projects.map(p => ({
      id: p.id, name: p.name, startDate: new Date(p.startDate), endDate: new Date(p.endDate),
      description: p.description, color: p.color || getProjectColor(0), order: p.order || 0, marker: p.marker || null
    }));
    projectOrder = Array.isArray(data.projectOrder) ? data.projectOrder : projects.map(p => p.id);
    if (data.currentYear) currentYear = data.currentYear;
    if (data.currentQuarter) currentQuarter = data.currentQuarter;
    updatePeriodDisplay(); renderProjects(); renderTimeline();
  } catch (e) { console.error('Load error:', e); }
}

function saveColorPalette() { localStorage.setItem('workplanColorPalette', currentColorPalette); }
function loadColorPalette() {
  const stored = localStorage.getItem('workplanColorPalette');
  if (stored) { currentColorPalette = stored; if (id('colorPalette')) id('colorPalette').value = currentColorPalette; }
}

/* =============== Misc UI / Helpers =============== */
function showApiKeyModal() { id('apiKeyModal').style.display = 'block'; }
function saveApiKey() {
  const key = id('apiKeyInput')?.value.trim();
  if (key) {
    apiKey = key; localStorage.setItem('geminiApiKey', key);
    id('apiKeyModal').style.display = 'none';
    if (id('projectInput')?.value.trim()) processProject();
  }
}

function showLoading(b) { if (id('loading')) id('loading').style.display = b ? 'block' : 'none'; }
function showError(m) { const el = id('errorMessage'); if (!el) return alert(m); el.textContent = m; el.style.display = 'block'; setTimeout(hideMessages, 5000); }
function showSuccess(m) { const el = id('successMessage'); if (!el) return console.info(m); el.textContent = m; el.style.display = 'block'; setTimeout(hideMessages, 3000); }
function hideMessages() { id('errorMessage') && (id('errorMessage').style.display = 'none'); id('successMessage') && (id('successMessage').style.display = 'none'); }

function scrollToProjectAndEdit(idv) {
  const el = document.querySelector(`[data-project-id="${idv}"]`);
  if (!el) return showError('Project not found.');
  if (editingTitleProjectId) cancelTitleEdit();
  if (editingProjectId) cancelDateEdit();
  el.scrollIntoView({ behavior:'smooth', block:'center', inline:'nearest' });
  setTimeout(() => { editProjectTitle(idv); }, 350);
}

function getMarkerIconHTML(marker) {
  if (marker === 'star') return '★';
  if (marker === 'flag') return '⚑';
  if (marker === 'exclamation') return '❗';
  return '';
}

/* Semicircle quick menu */
function showSemicircleMenu(bar, project) {
  closeSemicircleMenu();
  const menu = document.createElement('div');
  menu.className = 'semicircle-menu';
  menu.innerHTML = `
    <button class="icon-btn" title="Star" data-marker="star">★</button>
    <button class="icon-btn" title="Flag" data-marker="flag">⚑</button>
    <button class="icon-btn" title="Important" data-marker="exclamation">❗</button>
    <button class="icon-btn" title="Clear" data-marker="none">✕</button>
  `;
  menu.style.position = 'absolute'; menu.style.top = '-44px'; menu.style.right = '-44px'; menu.style.zIndex = 1002;
  menu.querySelectorAll('.icon-btn').forEach(btn => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      const marker = btn.getAttribute('data-marker');
      project.marker = (marker === 'none') ? null : marker;
      saveProjectsToStorage(); renderTimeline(); closeSemicircleMenu();
    };
  });
  bar.appendChild(menu);
  openMenuElement = bar;
  openMenuProjectId = project.id;
  setTimeout(() => document.addEventListener('mousedown', handleMenuOutsideClick, { once: true }), 0);
}
function closeSemicircleMenu() {
  if (openMenuElement) {
    const menu = openMenuElement.querySelector('.semicircle-menu');
    if (menu) menu.remove();
  }
  openMenuProjectId = null; openMenuElement = null;
}
function handleMenuOutsideClick(e) { if (openMenuElement && !openMenuElement.contains(e.target)) closeSemicircleMenu(); }

/* Close modals + editing when clicking outside */
window.onclick = function(ev) {
  const apiModal = id('apiKeyModal');
  const importModal = id('importModal');
  const customColorModal = id('customColorModal');
  if (ev.target === apiModal) apiModal.style.display = 'none';
  if (ev.target === importModal) closeImportModal();
  if (ev.target === customColorModal) closeCustomColorModal?.();
  if (editingProjectId && !ev.target.closest('.project-dates.editing') && !ev.target.closest('.date-edit-btn')) cancelDateEdit();
  if (editingTitleProjectId && !ev.target.closest('.project-name.editing') && !ev.target.closest('.title-edit-btn')) cancelTitleEdit();
};

/* Custom palettes */
function showCustomColorModal() { id('customColorModal').style.display = 'block'; loadExistingCustomPalettes(); }
function closeCustomColorModal() { id('customColorModal').style.display = 'none'; id('colorPalette') && (id('colorPalette').value = currentColorPalette); }
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
      <button class="delete-custom-palette" onclick="deleteCustomPalette('${key}')">Delete</button>
    `;
    container.appendChild(div);
  });
}
function saveCustomPalette() {
  const name = id('paletteName')?.value.trim();
  if (!name) return showError('Enter a name for your custom palette.');
  const colors = [id('color1')?.value, id('color2')?.value, id('color3')?.value, id('color4')?.value].map(c => c || '#cccccc');
  const all = JSON.parse(localStorage.getItem('customColorPalettes') || '{}');
  const key = 'custom_' + name.toLowerCase().replace(/\s+/g, '_');
  all[key] = colors; localStorage.setItem('customColorPalettes', JSON.stringify(all));
  loadCustomPalettes(); currentColorPalette = key; id('colorPalette') && (id('colorPalette').value = key);
  projects.forEach((p, i) => p.color = getProjectColor(i));
  closeCustomColorModal(); saveColorPalette(); saveProjectsToStorage(); renderTimeline();
  showSuccess(`Custom palette "${name}" created and applied!`);
}
function deleteCustomPalette(key) {
  if (!confirm('Delete this custom palette?')) return;
  const all = JSON.parse(localStorage.getItem('customColorPalettes') || '{}');
  delete all[key]; localStorage.setItem('customColorPalettes', JSON.stringify(all));
  if (currentColorPalette === key) {
    currentColorPalette = 'mckinsey'; saveColorPalette();
    projects.forEach((p,i) => p.color = getProjectColor(i));
    saveProjectsToStorage(); renderTimeline();
  }
  loadCustomPalettes(); loadExistingCustomPalettes(); showSuccess('Custom palette deleted.');
}
function loadCustomPalettes() {
  const select = id('colorPalette');
  if (!select) return;
  const all = JSON.parse(localStorage.getItem('customColorPalettes') || '{}');
  Array.from(select.options).forEach(opt => { if (opt.value.startsWith('custom_')) opt.remove(); });
  const createOpt = select.querySelector('option[value="custom"]');
  Object.keys(all).forEach(key => {
    const opt = document.createElement('option');
    opt.value = key; opt.textContent = key.replace('custom_', '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    select.insertBefore(opt, createOpt);
  });
}

/* Utilities */
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, function (m) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]; });
}

/* Init on load */
document.addEventListener('DOMContentLoaded', init);
