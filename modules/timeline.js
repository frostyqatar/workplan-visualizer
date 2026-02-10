import {
  currentView, currentYear, currentQuarter, hiddenMonthsLeft,
  projects, autoSort, autoWrap, spacingScale, currentDensity, todayOn,
  filterQuery,
  setCurrentView, setCurrentYear, setCurrentQuarter, setHiddenMonthsLeft
} from './state.js';
import { id, clamp, cssNum, getContrastColor, wrapTextForWidth, getUniformRowHeight, todayMidnight } from './utils.js';
import { saveProjectsToStorage } from './storage.js';
import { openContextMenu } from './ui.js';

// Will be set by app.js to break circular dependency
let _fullRender = null;
export function setFullRender(fn) { _fullRender = fn; }

/* =============== View helpers =============== */
export function getCurrentViewWindow() {
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
    startDate = new Date(currentYear - 1, 10 + hiddenMonthsLeft, 1);
    endDate = new Date(currentYear, 11, 31);
    fullWidth = 1400;
  }
  return { startDate, endDate, fullWidth, totalDuration: endDate - startDate };
}

export function setView(view) {
  setCurrentView(view);
  document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
  if (view === 'year') id('yearBtn')?.classList.add('active');
  else { id('quarterBtn')?.classList.add('active'); setCurrentQuarter(getCurrentQuarterNum()); }
  updatePeriodDisplay();
  renderTimeline();
}

function getCurrentQuarterNum() {
  const m = new Date().getMonth();
  return m <= 2 ? 1 : m <= 5 ? 2 : m <= 8 ? 3 : 4;
}

export function navigatePeriod(direction) {
  if (currentView === 'year') setCurrentYear(currentYear + direction);
  else {
    let q = currentQuarter + direction;
    let y = currentYear;
    if (q > 4) { q = 1; y += 1; }
    else if (q < 1) { q = 4; y -= 1; }
    setCurrentQuarter(q);
    setCurrentYear(y);
  }
  updatePeriodDisplay();
  renderTimeline();
}

export function updatePeriodDisplay() {
  const el = id('currentPeriod');
  if (el) el.textContent = currentView === 'year' ? currentYear : `Q${currentQuarter} ${currentYear}`;
}

export function resetZoom() {
  setHiddenMonthsLeft(0);
  renderTimeline();
}

/* =============== Today line — Bug Fix 1.4 =============== */
export function ensureTodayLineElement() {
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

export function positionTodayLine() {
  const content = id('timelineContent');
  const line = ensureTodayLineElement();
  if (!content || !line) return;

  const { startDate, endDate, totalDuration } = getCurrentViewWindow();
  const today = todayMidnight(); // Bug Fix 1.4: normalize to midnight
  if (today < startDate || today > endDate) { line.style.display = 'none'; return; }
  if (todayOn) line.style.display = 'block';

  const frac = clamp((today - startDate) / totalDuration, 0, 1);
  line.style.left = (frac * 100) + '%';
}

/* =============== Main render =============== */
export function renderTimeline() {
  const monthsContainer = id('timelineMonths');
  const contentContainer = id('timelineContent');
  if (!monthsContainer || !contentContainer) return;

  let months, startDate, endDate;

  if (currentView === 'quarter') {
    let quarterMonths, startMonth, endMonth;
    if (currentQuarter === 1) { quarterMonths = ['Jan', 'Feb', 'Mar']; startMonth = 0; endMonth = 2; }
    else if (currentQuarter === 2) { quarterMonths = ['Apr', 'May', 'Jun']; startMonth = 3; endMonth = 5; }
    else if (currentQuarter === 3) { quarterMonths = ['Jul', 'Aug', 'Sep']; startMonth = 6; endMonth = 8; }
    else { quarterMonths = ['Oct', 'Nov', 'Dec']; startMonth = 9; endMonth = 11; }

    months = quarterMonths.map(m => `${m} ${currentYear}`);
    startDate = new Date(currentYear, startMonth, 1);
    endDate = new Date(currentYear, endMonth + 1, 0);
    monthsContainer.style.minWidth = '600px';
    contentContainer.style.minWidth = '600px';
  } else {
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

  // Bug Fix 1.10: Render dynamic quarter indicators
  renderQuarterIndicators(contentContainer, startDate, endDate, totalDuration);

  // Build visible projects
  const visibleProjects = projects
    .filter(p => !(p.endDate < startDate || p.startDate > endDate))
    .filter(p => !filterQuery || p.name.toLowerCase().includes(filterQuery) || (p.description || '').toLowerCase().includes(filterQuery));
  const projectPositions = calculateProjectPositions(visibleProjects, startDate, totalDuration);
  const maxRow = projectPositions.length ? Math.max(...projectPositions.map(p => p.row)) : 0;

  const contentWidthPx =
    contentContainer.clientWidth ||
    parseFloat(getComputedStyle(contentContainer).minWidth) ||
    (currentView === 'quarter' ? 600 : 1400);

  const createdBars = [];
  const nodeHeightPx = cssNum('--node-height', '36');
  const densityScale = currentDensity === 'compact' ? 0.8 : 1;
  const baseTop = Math.max(0, Math.round((24 + 24 * spacingScale) * densityScale));
  const baseRowHeight = 45;
  const minGap = 2;
  const uniformRowHeight = Math.max(Math.round(baseRowHeight * spacingScale * densityScale), nodeHeightPx + minGap);

  // Create bars
  projectPositions.forEach(({ project, row, left, width, isMilestone }) => {
    const bar = document.createElement('div');
    bar.className = 'project-bar';
    if (isMilestone) bar.classList.add('project-bar-milestone'); // Bug Fix 1.3
    bar.dataset.projectId = project.id;
    bar.dataset.row = String(row);
    bar.style.backgroundColor = project.color;
    bar.style.color = getContrastColor(project.color);
    bar.style.left = left + '%';
    bar.style.width = width + '%';
    bar.style.position = 'absolute';

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

    addDragListeners(bar, project, startDate, totalDuration);

    bar.addEventListener('dblclick', (e) => {
      e.preventDefault(); e.stopPropagation();
      startInlineRename(bar, project);
    });

    bar.addEventListener('contextmenu', (e) => openContextMenu(e, bar, project));

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
    const gap = Math.max(4, Math.round(10 * spacingScale * densityScale));
    const rowTops = [];
    let accTop = baseTop;
    for (let r = 0; r < rows; r++) {
      rowTops[r] = accTop;
      accTop += rowHeights[r] + gap;
    }
    createdBars.forEach(({ el, row }) => { el.style.top = rowTops[row] + 'px'; });
    const totalHeight = accTop + 100;
    contentContainer.style.minHeight = Math.max(350, totalHeight) + 'px';
  } else {
    const timelineHeight = Math.max(350, (maxRow + 1) * uniformRowHeight + 100 + baseTop);
    contentContainer.style.minHeight = timelineHeight + 'px';
    createdBars.forEach(({ el, row }) => { el.style.top = (baseTop + row * uniformRowHeight) + 'px'; });
  }

  ensureTodayLineElement();
  if (todayOn) positionTodayLine();
}

/* =============== Bug Fix 1.10: Dynamic quarter indicators =============== */
function renderQuarterIndicators(container, viewStart, viewEnd, totalDuration) {
  // Remove old indicators
  container.querySelectorAll('.quarter-indicator').forEach(el => el.remove());

  // Calculate which quarters are visible
  const viewStartYear = viewStart.getFullYear();
  const viewEndYear = viewEnd.getFullYear();

  for (let year = viewStartYear; year <= viewEndYear; year++) {
    for (let q = 1; q <= 4; q++) {
      const qStart = new Date(year, (q - 1) * 3, 1);
      const qEnd = new Date(year, q * 3, 0);

      // Skip if quarter is entirely outside view
      if (qEnd < viewStart || qStart > viewEnd) continue;

      const clampedStart = qStart < viewStart ? viewStart : qStart;
      const clampedEnd = qEnd > viewEnd ? viewEnd : qEnd;

      const leftPct = ((clampedStart - viewStart) / totalDuration) * 100;
      const widthPct = ((clampedEnd - clampedStart) / totalDuration) * 100;

      const indicator = document.createElement('div');
      indicator.className = `quarter-indicator q${q}`;
      indicator.style.left = leftPct + '%';
      indicator.style.width = widthPct + '%';
      container.appendChild(indicator);
    }
  }
}

/* =============== Position calculations =============== */
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

    let tempEndDate = new Date(project.endDate);
    const isMilestone = tempEndDate.getTime() <= project.startDate.getTime();
    if (isMilestone) {
      tempEndDate.setDate(tempEndDate.getDate() + 1);
    }

    const viewEnd = new Date(startDate.getTime() + totalDuration);
    const projectEnd = tempEndDate > viewEnd ? viewEnd : tempEndDate;
    if (projectEnd <= projectStart) return;

    const startPercent = ((projectStart - startDate) / totalDuration) * 100;
    const endPercent = ((projectEnd - startDate) / totalDuration) * 100;

    // Bug Fix 1.3: Increase minimum width from 0.2% to 1.5% (~21px)
    const width = Math.max(endPercent - startPercent, 1.5);

    let row = 0;
    if (autoSort) {
      for (;;) {
        if (!occupiedRows[row]) occupiedRows[row] = [];
        const buffer = 0.5;
        const overlap = occupiedRows[row].some(o => !(endPercent <= (o.start - buffer) || startPercent >= (o.end + buffer)));
        if (!overlap) { occupiedRows[row].push({ start: startPercent, end: startPercent + width }); break; }
        row++;
      }
    } else {
      row = Number.isInteger(project.rowIndex) ? project.rowIndex : 0;
    }

    projectPositions.push({ project, row, left: Math.max(startPercent, 0), width, isMilestone });
  });

  return projectPositions;
}

/* =============== Inline rename on bar =============== */
function startInlineRename(bar, project) {
  if (bar.querySelector('.inline-rename')) return;
  const prevHTML = bar.innerHTML;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'inline-rename';
  input.value = project.name;
  Object.assign(input.style, {
    position: 'absolute', left: '4px', right: '4px', top: '50%',
    transform: 'translateY(-50%)', border: '1px solid rgba(0,0,0,0.25)',
    borderRadius: '4px', padding: '2px 6px', fontSize: getComputedStyle(bar).fontSize,
    zIndex: '1003', background: 'rgba(255,255,255,0.95)', color: '#000'
  });
  bar.appendChild(input);
  input.focus(); input.select();

  const commit = () => {
    const v = input.value.trim();
    if (input.parentNode === bar) bar.removeChild(input);
    if (v && v !== project.name) {
      project.name = v;
      saveProjectsToStorage();
      if (_fullRender) _fullRender();
    } else {
      bar.innerHTML = prevHTML;
    }
  };
  const cancel = () => { if (input.parentNode === bar) bar.removeChild(input); };
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') commit();
    if (ev.key === 'Escape') cancel();
  });
  input.addEventListener('blur', commit);
}

/* =============== Drag on timeline bars =============== */
function addDragListeners(projectBar, project, viewStartDate, totalDuration) {
  projectBar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const container = projectBar.parentElement;
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = parseFloat(projectBar.style.left) || 0;
    const containerWidth = container.offsetWidth;
    const startRow = parseInt(projectBar.dataset.row || '0', 10) || 0;
    let deltaY = 0;

    projectBar.classList.add('dragging');
    document.body.style.cursor = 'grabbing';

    const onPointerMove = (ev) => {
      const dx = ev.clientX - startX;
      const percentDelta = (dx / containerWidth) * 100;
      let newLeft = startLeft + percentDelta;
      newLeft = Math.max(0, Math.min(100 - parseFloat(projectBar.style.width), newLeft));
      projectBar.style.left = newLeft + '%';
      deltaY = ev.clientY - startY;
    };

    const onPointerUp = () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      projectBar.classList.remove('dragging');
      document.body.style.cursor = 'default';

      const leftPercent = parseFloat(projectBar.style.left);
      const barWidthPercent = parseFloat(projectBar.style.width);
      const newStartMs = viewStartDate.getTime() + (leftPercent / 100) * totalDuration;
      const newEndMs = viewStartDate.getTime() + ((leftPercent + barWidthPercent) / 100) * totalDuration;
      project.startDate = new Date(newStartMs);
      project.endDate = new Date(newEndMs);

      if (!autoSort) {
        const rowHeight = getUniformRowHeight();
        const rowDelta = Math.round(deltaY / Math.max(1, rowHeight));
        project.rowIndex = Math.max(0, startRow + rowDelta);
      }

      saveProjectsToStorage();
      renderTimeline();
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp, true);
  });
}

/* =============== Marker helpers =============== */
function getMarkerIconHTML(marker) {
  if (marker === 'star') return '★';
  if (marker === 'flag') return '⚑';
  if (marker === 'exclamation') return '❗';
  return '';
}
