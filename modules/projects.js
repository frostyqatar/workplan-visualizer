import {
  projects, projectOrder, editingProjectId, editingTitleProjectId,
  currentColorPalette, colorPalettes, filterQuery,
  _skipDateCancel, _skipTitleCancel,
  setProjects, setProjectOrder, setEditingProjectId, setEditingTitleProjectId,
  setSkipDateCancel, setSkipTitleCancel
} from './state.js';
import { id, escapeHtml, parseLocalDate, formatDateISO } from './utils.js';
import { saveProjectsToStorage } from './storage.js';
import { showError, showSuccess } from './ui.js';

// Will be set by app.js
let _fullRender = null;
export function setFullRender(fn) { _fullRender = fn; }

/* =============== Palette helpers =============== */
export function getCurrentPalette() {
  if (currentColorPalette.startsWith('custom_')) {
    const custom = JSON.parse(localStorage.getItem('customColorPalettes') || '{}');
    return custom[currentColorPalette] || colorPalettes.mckinsey;
  }
  return colorPalettes[currentColorPalette] || colorPalettes.mckinsey;
}

export function getProjectColor(index) {
  const palette = getCurrentPalette();
  return palette[index % palette.length];
}

/* =============== CRUD =============== */
export function addProject(data) {
  const project = {
    id: Date.now() + Math.random(),
    name: data.name,
    startDate: parseLocalDate(data.startDate),
    endDate: parseLocalDate(data.endDate),
    description: data.description || '',
    color: getProjectColor(projects.length),
    order: projects.length,
    marker: null,
    rowIndex: Number.isInteger(data.rowIndex) ? data.rowIndex : 0
  };
  projects.push(project);
  projectOrder.push(project.id);
  reorderAndUpdateProjects();
  saveProjectsToStorage();
  if (_fullRender) _fullRender();
}

export function deleteProject(projectId) {
  if (!confirm('Delete this project?')) return;
  setProjects(projects.filter(p => p.id !== projectId));
  setProjectOrder(projectOrder.filter(pid => pid !== projectId));
  projects.forEach((p, i) => { p.color = getProjectColor(i); });
  saveProjectsToStorage();
  if (_fullRender) _fullRender();
  showSuccess('Project deleted.');
}

export function duplicateProject(projectId) {
  const base = projects.find(p => p.id === projectId);
  if (!base) return;
  const dup = {
    id: Date.now() + Math.random(),
    name: base.name + ' (Copy)',
    startDate: new Date(base.startDate),
    endDate: new Date(base.endDate),
    description: base.description,
    color: getProjectColor(projects.length),
    order: projects.length,
    marker: base.marker || null,
    rowIndex: Number.isInteger(base.rowIndex) ? base.rowIndex : 0
  };
  projects.push(dup);
  projectOrder.push(dup.id);
  saveProjectsToStorage();
  if (_fullRender) _fullRender();
  showSuccess('Duplicated.');
}

export function reorderAndUpdateProjects() {
  projects.sort((a, b) => projectOrder.indexOf(a.id) - projectOrder.indexOf(b.id));
  projects.forEach((p, i) => { p.color = getProjectColor(i); p.order = i; });
}

export function clearAllProjects() {
  if (!confirm('Delete all projects?')) return;
  setProjects([]);
  setProjectOrder([]);
  saveProjectsToStorage();
  if (_fullRender) _fullRender();
  showSuccess('All projects cleared.');
}

/* =============== Quick-add form — Bug Fix 1.7: date validation =============== */
export function addProjectFromList() {
  const nameEl = id('qaName');
  const startEl = id('qaStart');
  const endEl = id('qaEnd');
  const descEl = id('qaDesc');

  const name = nameEl?.value.trim() || '';
  const start = startEl?.value;
  const end = endEl?.value;
  const desc = descEl?.value.trim() || '';

  // Clear previous errors
  [nameEl, startEl, endEl].forEach(el => { if (el) el.classList.remove('input-error'); });

  if (!name) { if (nameEl) nameEl.classList.add('input-error'); showError('Please enter a project name.'); return; }
  if (!start) { if (startEl) startEl.classList.add('input-error'); showError('Please enter a start date.'); return; }
  if (!end) { if (endEl) endEl.classList.add('input-error'); showError('Please enter an end date.'); return; }

  const sD = parseLocalDate(start);
  const eD = parseLocalDate(end);
  if (sD > eD) {
    if (startEl) startEl.classList.add('input-error');
    if (endEl) endEl.classList.add('input-error');
    showError('End date must be on or after start date.');
    return;
  }

  addProject({ name, startDate: start, endDate: end, description: desc });
  if (nameEl) nameEl.value = '';
  if (startEl) startEl.value = '';
  if (endEl) endEl.value = '';
  if (descEl) descEl.value = '';
  showSuccess('Project added.');
}

/* =============== Project list rendering — Bug Fix 1.8: filter feedback =============== */
export function renderProjects() {
  const container = id('projectsList');
  if (!container) return;

  // Save quick-add form values before re-render (Bug Fix 1.1)
  const savedQaName = id('qaName')?.value || '';
  const savedQaStart = id('qaStart')?.value || '';
  const savedQaEnd = id('qaEnd')?.value || '';
  const savedQaDesc = id('qaDesc')?.value || '';

  const sorted = [...projects]
    .sort((a, b) => projectOrder.indexOf(a.id) - projectOrder.indexOf(b.id))
    .filter(p => !filterQuery || p.name.toLowerCase().includes(filterQuery) || (p.description || '').toLowerCase().includes(filterQuery));

  const totalCount = projects.length;
  const filteredCount = sorted.length;
  const isFiltered = !!filterQuery;

  const listHtml = sorted.map(project => `
    <div class="project-item" style="border-left-color:${project.color}" data-project-id="${project.id}">
      <div class="drag-handle" aria-label="Drag to reorder">&#8942;&#8942;</div>
      <div class="project-info">
        <div class="project-name ${editingTitleProjectId === project.id ? 'editing' : ''}"
             data-action="edit-title" data-id="${project.id}" title="Click to edit name">
          ${editingTitleProjectId === project.id ? '' : escapeHtml(project.name)}
        </div>
        <div class="project-dates ${editingProjectId === project.id ? 'editing' : ''}"
             data-action="edit-dates" data-id="${project.id}" title="Click to edit dates">
          ${editingProjectId === project.id ? '' : `${project.startDate.toDateString()} - ${project.endDate.toDateString()}`}
        </div>
        ${project.description ? `<div>${escapeHtml(project.description)}</div>` : ''}
      </div>
      <div class="project-actions">
        <button class="duplicate-btn" data-action="duplicate" data-id="${project.id}" title="Duplicate project" aria-label="Duplicate project">&#9112;</button>
        <button class="delete-btn" data-action="delete" data-id="${project.id}" title="Delete project" aria-label="Delete project">&times;</button>
      </div>
    </div>
  `).join('');

  // Bug Fix 1.8: differentiate empty states
  let emptyMessage;
  if (totalCount === 0) {
    emptyMessage = `
      <div class="empty-state">
        <h4>Welcome to Workplan Visualizer!</h4>
        <p>Add your first project using the input above. Try these formats:</p>
        <ul>
          <li><strong>Robin Jan-Sept</strong> — month range</li>
          <li><strong>Task Q1-Q3 2025</strong> — quarter range</li>
          <li><strong>Task 12/12-24/12</strong> — compact date range</li>
          <li><strong>Task, 2025-01-15, 2025-03-31</strong> — CSV format</li>
        </ul>
      </div>`;
  } else if (isFiltered && filteredCount === 0) {
    emptyMessage = `
      <div class="empty-state">
        <p>No projects match "<strong>${escapeHtml(filterQuery)}</strong>".</p>
        <a href="#" class="clear-filter-link" data-action="clear-filter">Clear filter</a>
      </div>`;
  } else {
    emptyMessage = '';
  }

  // Header with count
  const countText = isFiltered
    ? `${filteredCount} of ${totalCount} projects shown`
    : `${totalCount} project${totalCount !== 1 ? 's' : ''}`;

  container.innerHTML = `
    <h3>All Projects (${countText}) — Click names or dates to edit | Drag to reorder
      ${isFiltered ? ' <a href="#" class="clear-filter-link" data-action="clear-filter" style="font-size:0.85rem;margin-left:8px;">Clear filter</a>' : ''}
    </h3>
    <div class="quick-add">
      <input id="qaName" type="text" placeholder="Project name">
      <input id="qaStart" type="date">
      <input id="qaEnd" type="date">
      <input id="qaDesc" type="text" placeholder="Description (optional)">
      <button class="btn-primary" data-action="quick-add">Add Project</button>
    </div>
    ${emptyMessage || listHtml}
  `;

  // Restore quick-add form values (Bug Fix 1.1)
  const qaName = id('qaName');
  const qaStart = id('qaStart');
  const qaEnd = id('qaEnd');
  const qaDesc = id('qaDesc');
  if (qaName) qaName.value = savedQaName;
  if (qaStart) qaStart.value = savedQaStart;
  if (qaEnd) qaEnd.value = savedQaEnd;
  if (qaDesc) qaDesc.value = savedQaDesc;

  // Populate editing UI if active
  if (editingTitleProjectId) {
    const p = projects.find(x => x.id === editingTitleProjectId);
    const el = document.querySelector(`[data-project-id="${editingTitleProjectId}"] .project-name`);
    if (el && p) renderTitleEditUI(el, p);
  }
  if (editingProjectId) {
    const p = projects.find(x => x.id === editingProjectId);
    const el = document.querySelector(`[data-project-id="${editingProjectId}"] .project-dates`);
    if (el && p) renderDateEditUI(el, p);
  }

  // Make list items draggable
  sorted.forEach(project => {
    const el = container.querySelector(`[data-project-id="${project.id}"]`);
    if (el) makeProjectDraggable(el, project.id);
  });
}

/* =============== Title editing =============== */
export function editProjectTitle(projectId) {
  if (editingTitleProjectId && editingTitleProjectId !== projectId) cancelTitleEdit();
  if (editingProjectId && editingProjectId !== projectId) cancelDateEdit();

  setEditingTitleProjectId(projectId);
  const el = document.querySelector(`[data-project-id="${projectId}"] .project-name`);
  const p = projects.find(x => x.id === projectId);
  if (!el || !p) return;

  renderTitleEditUI(el, p);
}

function renderTitleEditUI(el, p) {
  el.innerHTML = `
    <div class="editing">
      <input type="text" class="title-input" id="titleInput-${p.id}" value="${escapeHtml(p.name)}">
      <div class="title-edit-buttons">
        <button class="title-edit-btn" data-action="save-title" data-id="${p.id}">Save</button>
        <button class="title-edit-btn cancel" data-action="cancel-title">Cancel</button>
      </div>
    </div>`;
  el.classList.add('editing');
  setTimeout(() => {
    const editingDiv = el.querySelector('.editing');
    const input = id(`titleInput-${p.id}`);

    // Stop propagation on the editing div itself, but not on buttons
    if (editingDiv) {
      editingDiv.addEventListener('click', (e) => {
        // Let button clicks through, stop everything else
        if (e.target.tagName !== 'BUTTON') {
          e.stopPropagation();
        }
      });
    }

    if (input) {
      input.focus(); input.select();
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveTitleEdit(p.id);
        else if (e.key === 'Escape') cancelTitleEdit();
      });
      input.addEventListener('click', (e) => e.stopPropagation());
    }
  }, 50);
}

export function saveTitleEdit(projectId) {
  setSkipTitleCancel(true);
  setTimeout(() => setSkipTitleCancel(false), 0);

  const input = id(`titleInput-${projectId}`);
  if (!input) return showError('Title input missing.');
  const val = input.value.trim();
  if (!val) return showError('Project name cannot be empty.');
  const p = projects.find(x => x.id === projectId);
  if (p) {
    p.name = val;
    setEditingTitleProjectId(null);
    saveProjectsToStorage();
    if (_fullRender) _fullRender();
    showSuccess('Name updated.');
  }
}

export function cancelTitleEdit() {
  setEditingTitleProjectId(null);
  renderProjects();
}

/* =============== Date editing — Bug Fix 1.1: race condition =============== */
export function editProjectDates(projectId) {
  if (editingProjectId && editingProjectId !== projectId) cancelDateEdit();
  if (editingTitleProjectId && editingTitleProjectId !== projectId) cancelTitleEdit();

  setEditingProjectId(projectId);
  const el = document.querySelector(`[data-project-id="${projectId}"] .project-dates`);
  const p = projects.find(x => x.id === projectId);
  if (!el || !p) return;

  renderDateEditUI(el, p);
}

function renderDateEditUI(el, p) {
  const s = formatDateISO(p.startDate); // Bug Fix 1.2: local dates
  const e = formatDateISO(p.endDate);
  el.innerHTML = `
    <div class="editing">
      <input type="date" class="date-input" id="startDate-${p.id}" value="${s}">
      <span> to </span>
      <input type="date" class="date-input" id="endDate-${p.id}" value="${e}">
      <div class="date-edit-buttons">
        <button class="date-edit-btn" data-action="save-dates" data-id="${p.id}">Save</button>
        <button class="date-edit-btn cancel" data-action="cancel-dates">Cancel</button>
      </div>
    </div>`;
  el.classList.add('editing');
  setTimeout(() => {
    const editingDiv = el.querySelector('.editing');
    const startInput = id(`startDate-${p.id}`);
    const endInput = id(`endDate-${p.id}`);

    // Stop propagation on the editing div itself, but not on buttons
    if (editingDiv) {
      editingDiv.addEventListener('click', (e) => {
        // Let button clicks through, stop everything else
        if (e.target.tagName !== 'BUTTON') {
          e.stopPropagation();
        }
      });
    }

    if (startInput) {
      startInput.focus();
      startInput.addEventListener('click', (e) => e.stopPropagation());
    }
    if (endInput) {
      endInput.addEventListener('click', (e) => e.stopPropagation());
    }
  }, 50);
}

export function saveDateEdit(projectId) {
  // Bug Fix 1.1: Set skip flag to prevent window.onclick from cancelling
  setSkipDateCancel(true);
  setTimeout(() => setSkipDateCancel(false), 0);

  setEditingProjectId(null);

  const s = id(`startDate-${projectId}`)?.value;
  const e = id(`endDate-${projectId}`)?.value;

  if (!s || !e) {
    renderProjects();
    return showError('Enter both start and end.');
  }

  const sD = parseLocalDate(s); // Bug Fix 1.2: local dates
  const eD = parseLocalDate(e);

  if (sD > eD) {
    renderProjects();
    return showError('End must be on or after start.');
  }

  const p = projects.find(x => x.id === projectId);
  if (p) {
    p.startDate = sD;
    p.endDate = eD;
    saveProjectsToStorage();
    if (_fullRender) _fullRender();
    showSuccess('Dates updated.');
  }
}

export function cancelDateEdit() {
  setEditingProjectId(null);
  renderProjects();
}

/* =============== List drag & drop =============== */
export function initializeProjectListDragAndDrop() {
  document.addEventListener('dragover', (e) => { e.preventDefault(); });
  document.addEventListener('drop', (e) => { e.preventDefault(); document.getElementById('drag-placeholder')?.remove(); });
}

function makeProjectDraggable(el, projectId) {
  el.draggable = true;
  el.addEventListener('dragstart', (e) => {
    el.classList.add('dragging');
    e.dataTransfer.setData('text/plain', projectId);
    e.dataTransfer.effectAllowed = 'move';
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
      const children = Array.from(el.parentNode.children);
      const phIndex = children.indexOf(ph);
      const itemsBefore = children.slice(0, phIndex).filter(c => c.dataset.projectId).length;
      const oldIndex = projectOrder.indexOf(draggedId);
      if (oldIndex !== -1) projectOrder.splice(oldIndex, 1);
      projectOrder.splice(itemsBefore, 0, draggedId);
      reorderAndUpdateProjects();
      saveProjectsToStorage();
      if (_fullRender) _fullRender();
      showSuccess('Project order updated!');
      ph.remove();
    }
  });
}

function createPlaceholder() {
  const ph = document.createElement('div');
  ph.className = 'project-item'; ph.style.opacity = '0.5'; ph.style.border = '2px dashed var(--blue-80)';
  ph.style.background = 'transparent';
  ph.innerHTML = '<div style="text-align:center;color:var(--blue-80);padding:1rem;">Drop here</div>';
  ph.id = 'drag-placeholder';
  return ph;
}

function getDragAfterElement(container, y) {
  const els = [...container.querySelectorAll('.project-item:not(.dragging):not(#drag-placeholder)')];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

/* =============== Scroll to project =============== */
export function scrollToProjectAndEdit(projectId) {
  const el = document.querySelector(`[data-project-id="${projectId}"]`);
  if (!el) return showError('Project not found.');
  if (editingTitleProjectId) cancelTitleEdit();
  if (editingProjectId) cancelDateEdit();
  el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  setTimeout(() => { editProjectTitle(projectId); }, 350);
}
