let currentYear = 2025;
let currentQuarter = getCurrentQuarter();
let currentView = 'year';
let projects = [];
let apiKey = localStorage.getItem('geminiApiKey');
let currentColorPalette = 'mckinsey';
let editingProjectId = null;
let editingTitleProjectId = null;
let draggedProject = null;
let dragStartX = 0;
let dragStartLeft = 0;
let projectOrder = []; // Track the order of projects

// Professional consulting color palettes
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

// Add to global state
let openMenuProjectId = null;
let openMenuElement = null;

function init() {
    updatePeriodDisplay();
    renderTimeline();
    renderProjects();
    loadProjectsFromStorage();
    loadColorPalette();
    loadCustomPalettes();
    initializeProjectListDragAndDrop();
}

function getCurrentQuarter() {
    const now = new Date();
    const month = now.getMonth();
    if (month >= 0 && month <= 2) return 1;
    if (month >= 3 && month <= 5) return 2;
    if (month >= 6 && month <= 8) return 3;
    return 4;
}

function handleEnterKey(event) {
    if (event.key === 'Enter') {
        processProject();
    }
}

function processProject() {
    const input = document.getElementById('projectInput').value.trim();
    if (!input) return;

    if (!apiKey) {
        showApiKeyModal();
        return;
    }

    showLoading(true);
    hideMessages();
    
    callGeminiAPI(input);
}

function getCurrentQuarterDates() {
    const quarter = currentView === 'quarter' ? currentQuarter : getCurrentQuarter();
    let startMonth, endMonth;
    
    if (quarter === 1) {
        startMonth = 0; endMonth = 2;
    } else if (quarter === 2) {
        startMonth = 3; endMonth = 5;
    } else if (quarter === 3) {
        startMonth = 6; endMonth = 8;
    } else {
        startMonth = 9; endMonth = 11;
    }
    
    const startDate = new Date(currentYear, startMonth, 1);
    const endDate = new Date(currentYear, endMonth + 1, 0);
    
    return {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
    };
}

async function callGeminiAPI(input) {
    const quarterDates = getCurrentQuarterDates();
    const prompt = `You are a project parser that can handle multiple projects in one input. Parse this text and return ONLY a valid JSON array of project objects.

IMPORTANT: Look for multiple projects separated by commas, "and", or listed separately. Each project should be a separate object.

Each project object should have exactly this structure:
{
"name": "project name",
"startDate": "YYYY-MM-DD",
"endDate": "YYYY-MM-DD", 
"description": "brief description"
}

Rules:
- Current year is ${currentYear}
- Current date is ${new Date().toISOString().split('T')[0]}
- If NO DATES are specified for a project, use current quarter dates: start "${quarterDates.start}", end "${quarterDates.end}"
- If year is not specified, assume current year (${currentYear})
- Convert relative dates like "July 24th" to "${currentYear}-07-24"
- Convert "Q1 2025" to "2025-01-01" to "2025-03-31", "Q2 2025" to "2025-04-01" to "2025-06-30", etc.
- If only month is given, use first day of month for start, last day for end
- Always return valid dates in YYYY-MM-DD format
- Return ONLY the JSON array, no explanations
- If there's only one project, still return it as an array with one object

Examples:
- "Project X" -> [{"name": "Project X", "startDate": "${quarterDates.start}", "endDate": "${quarterDates.end}", "description": ""}]
- "Marketing campaign, Sales analysis" -> [{"name": "Marketing campaign", ...}, {"name": "Sales analysis", ...}]
- "Robin from Jan to Sept, CC tasks Q4 2025, Zaynab Q3 2026" -> [{"name": "Robin", "startDate": "${currentYear}-01-01", "endDate": "${currentYear}-09-30", ...}, {"name": "CC tasks", "startDate": "2025-10-01", "endDate": "2025-12-31", ...}, {"name": "Zaynab", "startDate": "2026-07-01", "endDate": "2026-09-30", ...}]

Input: "${input}"`;

    try {
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-goog-api-key': apiKey
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }]
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();
        
        if (data.error) {
            throw new Error(`API Error: ${data.error.message}`);
        }
        
        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            const text = data.candidates[0].content.parts[0].text;
            console.log('AI Response:', text);
            
            let cleanedText = text.replace(/```json\n?|\n?```/g, '').trim();
            cleanedText = cleanedText.replace(/^[^\[]*(\[.*\])[^\]]*$/s, '$1');
            
            try {
                const projectsData = JSON.parse(cleanedText);
                
                if (!Array.isArray(projectsData)) {
                    throw new Error('AI response is not an array');
                }
                
                let addedCount = 0;
                projectsData.forEach(projectData => {
                    if (!projectData.name || !projectData.startDate || !projectData.endDate) {
                        console.warn('Missing required fields in project:', projectData);
                        return;
                    }
                    
                    const startDate = new Date(projectData.startDate);
                    const endDate = new Date(projectData.endDate);
                    
                    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                        console.warn('Invalid dates in project:', projectData);
                        return;
                    }
                    
                    addProject(projectData);
                    addedCount++;
                });
                
                document.getElementById('projectInput').value = '';
                hideMessages();
                
                if (addedCount > 0) {
                    showSuccess(`Successfully added ${addedCount} project${addedCount > 1 ? 's' : ''}!`);
                } else {
                    showError('No valid projects found in the input.');
                }
                
            } catch (parseError) {
                console.error('Parse Error:', parseError, 'Text:', cleanedText);
                showError('Failed to parse AI response. Please try rephrasing your input.');
            }
        } else {
            showError('No valid response from AI. Please check your API key.');
        }
    } catch (error) {
        console.error('API Error:', error);
        showError('API call failed: ' + error.message);
    }
    
    showLoading(false);
}

function addProject(projectData) {
    const project = {
        id: Date.now() + Math.random(),
        name: projectData.name,
        startDate: new Date(projectData.startDate),
        endDate: new Date(projectData.endDate),
        description: projectData.description || '',
        color: getProjectColor(projects.length),
        order: projects.length, // Add order property
        marker: null // New: marker icon ("star"|"flag"|"exclamation")
    };
    
    projects.push(project);
    projectOrder.push(project.id);
    reorderAndUpdateProjects();
    saveProjectsToStorage();
    renderProjects();
    renderTimeline();
}

function getProjectColor(index) {
    const palette = getCurrentPalette();
    return palette[index % palette.length];
}

function getCurrentPalette() {
    if (currentColorPalette.startsWith('custom_')) {
        const customPalettes = JSON.parse(localStorage.getItem('customColorPalettes') || '{}');
        return customPalettes[currentColorPalette] || colorPalettes.mckinsey;
    }
    return colorPalettes[currentColorPalette] || colorPalettes.mckinsey;
}

function updateColorPalette() {
    const selectedValue = document.getElementById('colorPalette').value;
    
    if (selectedValue === 'custom') {
        showCustomColorModal();
        return;
    }
    
    currentColorPalette = selectedValue;
    // Reassign colors to existing projects
    projects.forEach((project, index) => {
        project.color = getProjectColor(index);
    });
    saveColorPalette();
    saveProjectsToStorage();
    renderTimeline();
}

function showCustomColorModal() {
    const modal = document.getElementById('customColorModal');
    modal.style.display = 'block';
    loadExistingCustomPalettes();
}

function closeCustomColorModal() {
    document.getElementById('customColorModal').style.display = 'none';
    // Reset color palette selector to the current value if user cancelled
    document.getElementById('colorPalette').value = currentColorPalette;
}

function loadExistingCustomPalettes() {
    const container = document.getElementById('existingCustomPalettes');
    const customPalettes = JSON.parse(localStorage.getItem('customColorPalettes') || '{}');
    
    if (Object.keys(customPalettes).length === 0) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = '<h4 style="margin: 1rem 0 0.5rem 0; color: var(--primary-blue);">Existing Custom Palettes:</h4>';
    
    Object.entries(customPalettes).forEach(([key, colors]) => {
        const paletteName = key.replace('custom_', '');
        const paletteDiv = document.createElement('div');
        paletteDiv.className = 'custom-palette-item';
        paletteDiv.innerHTML = `
            <span>${paletteName}</span>
            <div class="custom-palette-colors">
                ${colors.map(color => `<div class="custom-color-dot" style="background-color: ${color}"></div>`).join('')}
            </div>
            <button class="delete-custom-palette" onclick="deleteCustomPalette('${key}')">Delete</button>
        `;
        container.appendChild(paletteDiv);
    });
}

function saveCustomPalette() {
    const name = document.getElementById('paletteName').value.trim();
    if (!name) {
        showError('Please enter a name for your custom palette.');
        return;
    }
    
    const colors = [
        document.getElementById('color1').value,
        document.getElementById('color2').value,
        document.getElementById('color3').value,
        document.getElementById('color4').value
    ];
    
    const customPalettes = JSON.parse(localStorage.getItem('customColorPalettes') || '{}');
    const paletteKey = 'custom_' + name.toLowerCase().replace(/\s+/g, '_');
    customPalettes[paletteKey] = colors;
    
    localStorage.setItem('customColorPalettes', JSON.stringify(customPalettes));
    
    // Update the dropdown
    loadCustomPalettes();
    
    // Set this as the current palette
    currentColorPalette = paletteKey;
    document.getElementById('colorPalette').value = paletteKey;
    
    // Apply to existing projects
    projects.forEach((project, index) => {
        project.color = getProjectColor(index);
    });
    
    closeCustomColorModal();
    saveColorPalette();
    saveProjectsToStorage();
    renderTimeline();
    showSuccess(`Custom palette "${name}" created and applied!`);
}

function deleteCustomPalette(key) {
    if (confirm('Are you sure you want to delete this custom palette?')) {
        const customPalettes = JSON.parse(localStorage.getItem('customColorPalettes') || '{}');
        delete customPalettes[key];
        localStorage.setItem('customColorPalettes', JSON.stringify(customPalettes));
        
        // If this was the current palette, switch to McKinsey
        if (currentColorPalette === key) {
            currentColorPalette = 'mckinsey';
            saveColorPalette();
            projects.forEach((project, index) => {
                project.color = getProjectColor(index);
            });
            saveProjectsToStorage();
            renderTimeline();
        }
        
        loadCustomPalettes();
        loadExistingCustomPalettes();
        showSuccess('Custom palette deleted.');
    }
}

function loadCustomPalettes() {
    const select = document.getElementById('colorPalette');
    const customPalettes = JSON.parse(localStorage.getItem('customColorPalettes') || '{}');
    
    // Remove existing custom options
    const options = Array.from(select.options);
    options.forEach(option => {
        if (option.value.startsWith('custom_')) {
            option.remove();
        }
    });
    
    // Add custom palettes before the "Create Custom Palette" option
    const createOption = select.querySelector('option[value="custom"]');
    Object.entries(customPalettes).forEach(([key, colors]) => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = key.replace('custom_', '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        select.insertBefore(option, createOption);
    });
}

function deleteProject(projectId) {
    if (confirm('Are you sure you want to delete this project?')) {
        projects = projects.filter(p => p.id !== projectId);
        projectOrder = projectOrder.filter(id => id !== projectId);
        // Reassign colors after deletion
        projects.forEach((project, index) => {
            project.color = getProjectColor(index);
        });
        saveProjectsToStorage();
        renderProjects();
        renderTimeline();
        showSuccess('Project deleted successfully.');
    }
}

function duplicateProject(projectId) {
    const originalProject = projects.find(p => p.id === projectId);
    if (!originalProject) return;
    
    const duplicatedProject = {
        id: Date.now() + Math.random(),
        name: originalProject.name + ' (Copy)',
        startDate: new Date(originalProject.startDate),
        endDate: new Date(originalProject.endDate),
        description: originalProject.description,
        color: getProjectColor(projects.length),
        order: projects.length
    };
    
    projects.push(duplicatedProject);
    projectOrder.push(duplicatedProject.id);
    saveProjectsToStorage();
    renderProjects();
    renderTimeline();
    showSuccess(`Duplicated "${originalProject.name}" successfully.`);
}

// Enhanced positioning system for overlapping projects
function calculateProjectPositions(visibleProjects, startDate, totalDuration) {
    if (visibleProjects.length === 0) return [];
    
    const projectPositions = [];
    const occupiedRows = [];
    
    // Sort projects by start date, then by end date for consistent positioning
    const sortedProjects = [...visibleProjects].sort((a, b) => {
        const aStart = new Date(Math.max(a.startDate.getTime(), startDate.getTime()));
        const bStart = new Date(Math.max(b.startDate.getTime(), startDate.getTime()));
        if (aStart.getTime() === bStart.getTime()) {
            return a.endDate.getTime() - b.endDate.getTime();
        }
        return aStart.getTime() - bStart.getTime();
    });
    
    sortedProjects.forEach(project => {
        const projectStart = Math.max(project.startDate, startDate);
        const projectEnd = Math.min(project.endDate, new Date(startDate.getTime() + totalDuration));
        
        // Skip if project doesn't overlap with view period
        if (projectEnd <= projectStart) return;
        
        const startPercent = ((projectStart - startDate) / totalDuration) * 100;
        const endPercent = ((projectEnd - startDate) / totalDuration) * 100;
        const width = Math.max(endPercent - startPercent, 3); // Minimum 3% width
        
        // Find the first available row for this project
        let row = 0;
        let foundRow = false;
        
        while (!foundRow) {
            if (!occupiedRows[row]) {
                occupiedRows[row] = [];
            }
            
            // Check for overlaps in this row with a small buffer
            const buffer = 0.5; // 0.5% buffer between projects
            const hasOverlap = occupiedRows[row].some(occupiedProject => {
                return !(endPercent <= (occupiedProject.start - buffer) || 
                        startPercent >= (occupiedProject.end + buffer));
            });
            
            if (!hasOverlap) {
                // This row is available
                occupiedRows[row].push({
                    start: startPercent,
                    end: endPercent,
                    project: project
                });
                foundRow = true;
            } else {
                row++;
            }
        }
        
        projectPositions.push({
            project: project,
            row: row,
            left: Math.max(startPercent, 0),
            width: width
        });
    });
    
    return projectPositions;
}

function reorderAndUpdateProjects() {
    // Sort projects based on the projectOrder array
    projects.sort((a, b) => {
        const indexA = projectOrder.indexOf(a.id);
        const indexB = projectOrder.indexOf(b.id);
        return indexA - indexB;
    });
    
    // Reassign colors based on new order
    projects.forEach((project, index) => {
        project.color = getProjectColor(index);
        project.order = index;
    });
}

function editProjectTitle(projectId) {
    if (editingTitleProjectId && editingTitleProjectId !== projectId) {
        cancelTitleEdit();
    }
    if (editingProjectId && editingProjectId !== projectId) {
        cancelDateEdit();
    }
    
    editingTitleProjectId = projectId;
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    
    const titleElement = document.querySelector(`[data-project-id="${projectId}"] .project-name`);
    if (!titleElement) return;
    
    titleElement.innerHTML = `
        <div class="editing" onclick="event.stopPropagation()">
            <input type="text" class="title-input" id="titleInput-${projectId}" value="${project.name}" onclick="event.stopPropagation()" onkeypress="handleTitleKeyPress(event, ${projectId})">
            <div class="title-edit-buttons">
                <button class="title-edit-btn" onclick="event.stopPropagation(); saveTitleEdit(${projectId})">Save</button>
                <button class="title-edit-btn cancel" onclick="event.stopPropagation(); cancelTitleEdit()">Cancel</button>
            </div>
        </div>
    `;
    titleElement.classList.add('editing');
    
    // Focus and select all text
    setTimeout(() => {
        const input = document.getElementById(`titleInput-${projectId}`);
        if (input) {
            input.focus();
            input.select();
        }
    }, 100);
}

function handleTitleKeyPress(event, projectId) {
    if (event.key === 'Enter') {
        saveTitleEdit(projectId);
    } else if (event.key === 'Escape') {
        cancelTitleEdit();
    }
}

function saveTitleEdit(projectId) {
    const titleInput = document.getElementById(`titleInput-${projectId}`);
    
    if (!titleInput) {
        showError('Title input not found.');
        return;
    }
    
    const newTitle = titleInput.value.trim();
    
    if (!newTitle) {
        showError('Project name cannot be empty.');
        return;
    }
    
    const project = projects.find(p => p.id === projectId);
    if (project) {
        project.name = newTitle;
        editingTitleProjectId = null; // Reset editing state first
        saveProjectsToStorage();
        renderProjects();
        renderTimeline();
        showSuccess('Project name updated successfully.');
    }
}

function cancelTitleEdit() {
    editingTitleProjectId = null;
    renderProjects();
}

function editProjectDates(projectId) {
    if (editingProjectId && editingProjectId !== projectId) {
        cancelDateEdit();
    }
    if (editingTitleProjectId && editingTitleProjectId !== projectId) {
        cancelTitleEdit();
    }
    
    editingProjectId = projectId;
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    
    const datesElement = document.querySelector(`[data-project-id="${projectId}"] .project-dates`);
    if (!datesElement) return;
    
    const startDateStr = project.startDate.toISOString().split('T')[0];
    const endDateStr = project.endDate.toISOString().split('T')[0];
    
    datesElement.innerHTML = `
        <div class="editing" onclick="event.stopPropagation()">
            <input type="date" class="date-input" id="startDate-${projectId}" value="${startDateStr}" onclick="event.stopPropagation()">
            <span> to </span>
            <input type="date" class="date-input" id="endDate-${projectId}" value="${endDateStr}" onclick="event.stopPropagation()">
            <div class="date-edit-buttons">
                <button class="date-edit-btn" onclick="event.stopPropagation(); saveDateEdit(${projectId})">Save</button>
                <button class="date-edit-btn cancel" onclick="event.stopPropagation(); cancelDateEdit()">Cancel</button>
            </div>
        </div>
    `;
    datesElement.classList.add('editing');
    
    // Focus on first input
    setTimeout(() => {
        document.getElementById(`startDate-${projectId}`).focus();
    }, 100);
}

function saveDateEdit(projectId) {
    const startDateInput = document.getElementById(`startDate-${projectId}`);
    const endDateInput = document.getElementById(`endDate-${projectId}`);
    
    if (!startDateInput || !endDateInput) {
        showError('Date inputs not found.');
        return;
    }
    
    const startDateValue = startDateInput.value;
    const endDateValue = endDateInput.value;
    
    if (!startDateValue || !endDateValue) {
        showError('Please enter both start and end dates.');
        return;
    }
    
    const startDate = new Date(startDateValue);
    const endDate = new Date(endDateValue);
    
    if (startDate >= endDate) {
        showError('End date must be after start date.');
        return;
    }
    
    const project = projects.find(p => p.id === projectId);
    if (project) {
        project.startDate = startDate;
        project.endDate = endDate;
        saveProjectsToStorage();
        renderProjects();
        renderTimeline();
        showSuccess('Project dates updated successfully.');
    }
    
    editingProjectId = null;
}

function cancelDateEdit() {
    editingProjectId = null;
    renderProjects();
}

function setView(view) {
    currentView = view;
    document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
    
    if (view === 'year') {
        document.getElementById('yearBtn').classList.add('active');
    } else {
        document.getElementById('quarterBtn').classList.add('active');
        currentQuarter = getCurrentQuarter(); // Reset to current quarter when switching to quarter view
    }
    
    updatePeriodDisplay();
    renderTimeline();
}

function navigatePeriod(direction) {
    if (currentView === 'year') {
        currentYear += direction;
    } else {
        currentQuarter += direction;
        if (currentQuarter > 4) {
            currentQuarter = 1;
            currentYear += 1;
        } else if (currentQuarter < 1) {
            currentQuarter = 4;
            currentYear -= 1;
        }
    }
    updatePeriodDisplay();
    renderTimeline();
}

function updatePeriodDisplay() {
    const periodElement = document.getElementById('currentPeriod');
    if (currentView === 'year') {
        periodElement.textContent = currentYear;
    } else {
        periodElement.textContent = `Q${currentQuarter} ${currentYear}`;
    }
}

function renderTimeline() {
    const monthsContainer = document.getElementById('timelineMonths');
    const contentContainer = document.getElementById('timelineContent');
    
    let months, startDate, endDate, totalDuration;
    
    if (currentView === 'quarter') {
        // Show specific quarter
        let quarterMonths;
        let startMonth, endMonth;
        
        if (currentQuarter === 1) {
            quarterMonths = ['Jan', 'Feb', 'Mar'];
            startMonth = 0; endMonth = 2;
        } else if (currentQuarter === 2) {
            quarterMonths = ['Apr', 'May', 'Jun'];
            startMonth = 3; endMonth = 5;
        } else if (currentQuarter === 3) {
            quarterMonths = ['Jul', 'Aug', 'Sep'];
            startMonth = 6; endMonth = 8;
        } else {
            quarterMonths = ['Oct', 'Nov', 'Dec'];
            startMonth = 9; endMonth = 11;
        }
        
        months = quarterMonths.map(month => `${month} ${currentYear}`);
        startDate = new Date(currentYear, startMonth, 1);
        endDate = new Date(currentYear, endMonth + 1, 0);
        monthsContainer.style.minWidth = '600px';
        contentContainer.style.minWidth = '600px';
        
    } else {
        // Show 14-month view: Nov-Dec of last year + Jan-Dec of current year
        months = [
            `Nov ${currentYear - 1}`, `Dec ${currentYear - 1}`,
            'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
        ].map((month, index) => {
            if (index >= 2) return `${month} ${currentYear}`;
            return month;
        });
        
        startDate = new Date(currentYear - 1, 10, 1); // Nov 1st of last year
        endDate = new Date(currentYear, 11, 31); // Dec 31st of current year
        monthsContainer.style.minWidth = '1400px';
        contentContainer.style.minWidth = '1400px';
    }
    
    totalDuration = endDate - startDate;
    
    monthsContainer.innerHTML = months.map(month => 
        `<div class="month-label">${month}</div>`
    ).join('');

    // Clear existing projects
    const existingProjects = contentContainer.querySelectorAll('.project-bar');
    existingProjects.forEach(p => p.remove());

    // Filter projects that overlap with the current view period
    const visibleProjects = projects.filter(project => 
        !(project.endDate < startDate || project.startDate > endDate)
    );

    // Calculate smart positions for overlapping projects
    const projectPositions = calculateProjectPositions(visibleProjects, startDate, totalDuration);
    
    // Calculate timeline height based on number of rows needed
    const maxRow = Math.max(0, ...projectPositions.map(p => p.row));
    const rowHeight = 45; // Height per row
    const baseHeight = 100; // Base padding
    const timelineHeight = Math.max(350, (maxRow + 1) * rowHeight + baseHeight);
    contentContainer.style.minHeight = timelineHeight + 'px';

    // Render projects with smart positioning
    projectPositions.forEach(({ project, row, left, width }) => {
        const projectBar = document.createElement('div');
        projectBar.className = 'project-bar';
        projectBar.dataset.projectId = project.id;
        projectBar.style.backgroundColor = project.color;
        projectBar.style.left = left + '%';
        projectBar.style.width = width + '%';
        projectBar.style.top = (50 + row * rowHeight) + 'px';
        projectBar.style.position = 'absolute';
        
        // Smart text handling based on width
        const actualWidth = (width / 100) * (currentView === 'quarter' ? 600 : 1400);
        if (actualWidth > 120) {
            // Wide enough for multiline text
            projectBar.classList.add('project-bar-multiline');
            projectBar.innerHTML = wrapTextForWidth(project.name, actualWidth - 16);
        } else {
            // Single line with ellipsis
            projectBar.textContent = project.name;
        }
        
        projectBar.title = `${project.name}\n${project.startDate.toDateString()} - ${project.endDate.toDateString()}\nDrag to change dates`;
        
        // Add drag event listeners
        addDragListeners(projectBar, project, startDate, totalDuration);
        
        // Add double-click event for menu
        projectBar.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Remove any open menu
            closeSemicircleMenu();
            // Show menu for this bar
            openMenuProjectId = project.id;
            openMenuElement = projectBar;
            showSemicircleMenu(projectBar, project);
        });
        
        // Render marker icon if set
        if (project.marker) {
            const iconSpan = document.createElement('span');
            iconSpan.className = 'icon-marker';
            iconSpan.innerHTML = getMarkerIconHTML(project.marker);
            projectBar.appendChild(iconSpan);
        }
        
        contentContainer.appendChild(projectBar);
    });
}

function wrapTextForWidth(text, maxWidth) {
    if (maxWidth < 80) return text;
    
    const words = text.split(' ');
    if (words.length === 1) return text; // Single word, no wrapping needed
    
    // Simple word wrapping for 2 lines max
    const midPoint = Math.ceil(words.length / 2);
    const firstLine = words.slice(0, midPoint).join(' ');
    const secondLine = words.slice(midPoint).join(' ');
    
    return `${firstLine}<br>${secondLine}`;
}

function addDragListeners(projectBar, project, viewStartDate, totalDuration) {
    let isDragging = false;
    let startX = 0;
    let startLeft = 0;

    projectBar.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX;
        startLeft = parseFloat(projectBar.style.left);
        projectBar.classList.add('dragging');
        document.body.style.cursor = 'grabbing';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const deltaX = e.clientX - startX;
        const deltaPercent = (deltaX / projectBar.parentElement.offsetWidth) * 100;
        const newLeft = Math.max(0, Math.min(90, startLeft + deltaPercent));
        
        projectBar.style.left = newLeft + '%';
    });

    document.addEventListener('mouseup', (e) => {
        if (!isDragging) return;
        
        isDragging = false;
        projectBar.classList.remove('dragging');
        document.body.style.cursor = 'default';
        
        // Calculate new dates
        const newLeftPercent = parseFloat(projectBar.style.left);
        const projectDuration = project.endDate - project.startDate;
        const newStartTime = viewStartDate.getTime() + (newLeftPercent / 100) * totalDuration;
        const newStartDate = new Date(newStartTime);
        const newEndDate = new Date(newStartTime + projectDuration);
        
        // Update project dates
        project.startDate = newStartDate;
        project.endDate = newEndDate;
        
        // Save and re-render
        saveProjectsToStorage();
        renderProjects();
        renderTimeline();
        
    });
}

function initializeProjectListDragAndDrop() {
    let draggedElement = null;
    let draggedProjectId = null;
    let placeholder = null;

    document.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    document.addEventListener('drop', (e) => {
        e.preventDefault();
        if (placeholder && placeholder.parentNode) {
            placeholder.parentNode.removeChild(placeholder);
        }
    });
}

function makeProjectDraggable(projectElement, projectId) {
    projectElement.draggable = true;
    
    projectElement.addEventListener('dragstart', (e) => {
        projectElement.classList.add('dragging');
        e.dataTransfer.setData('text/plain', projectId);
        e.dataTransfer.effectAllowed = 'move';
        
        // Create placeholder
        const placeholder = document.createElement('div');
        placeholder.className = 'project-item';
        placeholder.style.opacity = '0.5';
        placeholder.style.border = '2px dashed var(--blue-80)';
        placeholder.innerHTML = '<div style="text-align: center; color: var(--blue-80);">Drop here</div>';
        placeholder.id = 'drag-placeholder';
        
        setTimeout(() => {
            projectElement.style.display = 'none';
        }, 0);
    });
    
    projectElement.addEventListener('dragend', (e) => {
        projectElement.classList.remove('dragging');
        projectElement.style.display = 'flex';
        
        const placeholder = document.getElementById('drag-placeholder');
        if (placeholder) {
            placeholder.remove();
        }
    });
    
    projectElement.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        
        const afterElement = getDragAfterElement(projectElement.parentNode, e.clientY);
        const draggedId = e.dataTransfer.getData('text/plain');
        const draggedElement = document.querySelector(`[data-project-id="${draggedId}"]`);
        
        if (afterElement == null) {
            const placeholder = document.getElementById('drag-placeholder') || createPlaceholder();
            projectElement.parentNode.appendChild(placeholder);
        } else {
            const placeholder = document.getElementById('drag-placeholder') || createPlaceholder();
            projectElement.parentNode.insertBefore(placeholder, afterElement);
        }
    });
    
    projectElement.addEventListener('drop', (e) => {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData('text/plain');
        const placeholder = document.getElementById('drag-placeholder');
        
        if (placeholder && draggedId) {
            // Get the new position
            const allItems = Array.from(projectElement.parentNode.children)
                .filter(child => child.dataset.projectId && child !== placeholder);
            const placeholderIndex = Array.from(projectElement.parentNode.children).indexOf(placeholder);
            
            // Update project order
            const draggedProject = projects.find(p => p.id == draggedId);
            if (draggedProject) {
                // Remove from current position
                const oldIndex = projectOrder.indexOf(draggedProject.id);
                projectOrder.splice(oldIndex, 1);
                
                // Insert at new position
                let newIndex = placeholderIndex;
                // Adjust for the placeholder
                const itemsBefore = Array.from(projectElement.parentNode.children)
                    .slice(0, placeholderIndex)
                    .filter(child => child.dataset.projectId).length;
                newIndex = itemsBefore;
                
                projectOrder.splice(newIndex, 0, draggedProject.id);
                
                // Reorder and update
                reorderAndUpdateProjects();
                saveProjectsToStorage();
                renderProjects();
                renderTimeline();
                showSuccess('Project order updated!');
            }
            
            placeholder.remove();
        }
    });
}

function createPlaceholder() {
    const placeholder = document.createElement('div');
    placeholder.className = 'project-item';
    placeholder.style.opacity = '0.5';
    placeholder.style.border = '2px dashed var(--blue-80)';
    placeholder.style.background = 'transparent';
    placeholder.innerHTML = '<div style="text-align: center; color: var(--blue-80); padding: 1rem;">Drop here</div>';
    placeholder.id = 'drag-placeholder';
    return placeholder;
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.project-item:not(.dragging):not(#drag-placeholder)')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function showApiKeyModal() {
    document.getElementById('apiKeyModal').style.display = 'block';
}

function saveApiKey() {
    const key = document.getElementById('apiKeyInput').value.trim();
    if (key) {
        apiKey = key;
        localStorage.setItem('geminiApiKey', key);
        document.getElementById('apiKeyModal').style.display = 'none';
        document.getElementById('apiKeyInput').value = '';
        if (document.getElementById('projectInput').value.trim()) {
            processProject();
        }
    }
}

function renderProjects() {
    const container = document.getElementById('projectsList');
    
    if (projects.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666;">No projects added yet. Use the input above to add your first project!</p>';
        return;
    }

    // Sort projects by the projectOrder
    const sortedProjects = [...projects].sort((a, b) => {
        const indexA = projectOrder.indexOf(a.id);
        const indexB = projectOrder.indexOf(b.id);
        return indexA - indexB;
    });

    container.innerHTML = '<h3>All Projects (' + projects.length + ') - Click names or dates to edit | Drag to reorder</h3>' + 
        sortedProjects.map(project => `
            <div class="project-item" style="border-left-color: ${project.color};" data-project-id="${project.id}">
                <div class="drag-handle">⋮⋮</div>
                <div class="project-info">
                    <div class="project-name ${editingTitleProjectId === project.id ? 'editing' : ''}" 
                         onclick="editProjectTitle(${project.id})" 
                         title="Click to edit name">
                        ${editingTitleProjectId === project.id ? '' : project.name}
                    </div>
                    <div class="project-dates ${editingProjectId === project.id ? 'editing' : ''}" 
                         onclick="editProjectDates(${project.id})" 
                         title="Click to edit dates">
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
    
    // Make each project item draggable
    sortedProjects.forEach(project => {
        const projectElement = document.querySelector(`[data-project-id="${project.id}"]`);
        if (projectElement) {
            makeProjectDraggable(projectElement, project.id);
        }
    });
}

function downloadPNG() {
    const element = document.getElementById('timelineGrid');
    let startDate, endDate, totalDuration, fullWidth;
    if (currentView === 'quarter') {
        let startMonth, endMonth;
        if (currentQuarter === 1) {
            startMonth = 0; endMonth = 2;
        } else if (currentQuarter === 2) {
            startMonth = 3; endMonth = 5;
        } else if (currentQuarter === 3) {
            startMonth = 6; endMonth = 8;
        } else {
            startMonth = 9; endMonth = 11;
        }
        startDate = new Date(currentYear, startMonth, 1);
        endDate = new Date(currentYear, endMonth + 1, 0);
        fullWidth = 600;
    } else {
        startDate = new Date(currentYear - 1, 10, 1);
        endDate = new Date(currentYear, 11, 31);
        fullWidth = 1400;
    }
    totalDuration = endDate - startDate;
    const visibleProjects = projects.filter(project => 
        !(project.endDate < startDate || project.startDate > endDate)
    );
    if (visibleProjects.length === 0) {
        showError('No projects visible in current view to capture.');
        return;
    }
    const projectPositions = calculateProjectPositions(visibleProjects, startDate, totalDuration);
    const maxRow = Math.max(0, ...projectPositions.map(p => p.row));
    const optimalHeight = Math.max(400, (maxRow + 1) * 45 + 150);

    // Store original styles for restoration
    const originalStyles = new Map();
    const timelineContent = document.getElementById('timelineContent');
    const monthsContainer = document.getElementById('timelineMonths');

    // Save original styles
    originalStyles.set('element-overflow', element.style.overflow);
    originalStyles.set('element-width', element.style.width);
    originalStyles.set('timelineContent-minHeight', timelineContent.style.minHeight);
    originalStyles.set('timelineContent-width', timelineContent.style.width);
    originalStyles.set('monthsContainer-minWidth', monthsContainer.style.minWidth);
    originalStyles.set('monthsContainer-width', monthsContainer.style.width);

    // Set styles for full capture
    element.style.overflow = 'visible';
    element.style.width = fullWidth + 'px';
    timelineContent.style.minHeight = optimalHeight + 'px';
    timelineContent.style.width = fullWidth + 'px';
    monthsContainer.style.minWidth = fullWidth + 'px';
    monthsContainer.style.width = fullWidth + 'px';

    // Enhance styles for screenshot
    enhanceStylesForScreenshot(originalStyles);
    element.offsetHeight;

    html2canvas(element, {
        backgroundColor: '#ffffff',
        scale: 2,
        width: fullWidth,
        height: optimalHeight,
        scrollX: 0,
        scrollY: 0,
        useCORS: true,
        allowTaint: true,
        logging: false,
        removeContainer: true,
        foreignObjectRendering: false,
        imageTimeout: 15000,
        onclone: (clonedDoc) => {
            const clonedBars = clonedDoc.querySelectorAll('.project-bar');
            clonedBars.forEach(bar => {
                bar.style.whiteSpace = 'normal';
                bar.style.wordWrap = 'break-word';
                bar.style.textAlign = 'center';
                bar.style.justifyContent = 'center';
            });
        }
    }).then(canvas => {
        // Restore original styles
        restoreOriginalStyles(originalStyles);
        element.style.overflow = originalStyles.get('element-overflow') || '';
        element.style.width = originalStyles.get('element-width') || '';
        timelineContent.style.minHeight = originalStyles.get('timelineContent-minHeight') || '';
        timelineContent.style.width = originalStyles.get('timelineContent-width') || '';
        monthsContainer.style.minWidth = originalStyles.get('monthsContainer-minWidth') || '';
        monthsContainer.style.width = originalStyles.get('monthsContainer-width') || '';
        const link = document.createElement('a');
        link.download = `workplan-${currentView}-${currentYear}-${new Date().toISOString().split('T')[0]}.png`;
        link.href = canvas.toDataURL('image/png', 1.0);
        link.click();
        showSuccess('High-quality timeline downloaded as PNG!');
    }).catch(error => {
        restoreOriginalStyles(originalStyles);
        element.style.overflow = originalStyles.get('element-overflow') || '';
        element.style.width = originalStyles.get('element-width') || '';
        timelineContent.style.minHeight = originalStyles.get('timelineContent-minHeight') || '';
        timelineContent.style.width = originalStyles.get('timelineContent-width') || '';
        monthsContainer.style.minWidth = originalStyles.get('monthsContainer-minWidth') || '';
        monthsContainer.style.width = originalStyles.get('monthsContainer-width') || '';
        console.error('Download failed:', error);
        showError('Failed to download PNG. Please try again.');
    });
}

function enhanceStylesForScreenshot(originalStyles) {
    // Enhance timeline background for better visibility
    const timelineContent = document.getElementById('timelineContent');
    const timelineGrid = document.getElementById('timelineGrid');
    
    // Store and update timeline background
    originalStyles.set('timelineContent-bg', timelineContent.style.backgroundColor);
    originalStyles.set('timelineGrid-bg', timelineGrid.style.backgroundColor);
    timelineContent.style.backgroundColor = '#f8f9fa';
    timelineGrid.style.backgroundColor = '#ffffff';
    
    // Enhance project bars for screenshot
    const projectBars = document.querySelectorAll('.project-bar');
    projectBars.forEach((bar, index) => {
        const barId = `bar-${index}`;
        
        // Store original styles
        originalStyles.set(`${barId}-fontSize`, bar.style.fontSize);
        originalStyles.set(`${barId}-fontWeight`, bar.style.fontWeight);
        originalStyles.set(`${barId}-backgroundColor`, bar.style.backgroundColor);
        originalStyles.set(`${barId}-boxShadow`, bar.style.boxShadow);
        originalStyles.set(`${barId}-innerHTML`, bar.innerHTML);
        
        // Make background colors more vibrant for screenshot
        const currentBg = bar.style.backgroundColor;
        if (currentBg) {
            bar.style.backgroundColor = darkenColor(currentBg, 0.15);
        }
        
        // Enhanced shadow for better visibility
        bar.style.boxShadow = '0 3px 12px rgba(0, 0, 0, 0.4)';
        bar.style.fontWeight = 'bold';
        
        // Ensure text wrapping is maintained
        bar.style.whiteSpace = 'normal';
        bar.style.wordWrap = 'break-word';
        bar.style.textAlign = 'center';
        bar.style.justifyContent = 'center';
        bar.style.alignItems = 'center';
    });
    
    // Enhance month labels
    const monthLabels = document.querySelectorAll('.month-label');
    monthLabels.forEach((label, index) => {
        const labelId = `label-${index}`;
        originalStyles.set(`${labelId}-fontWeight`, label.style.fontWeight);
        originalStyles.set(`${labelId}-backgroundColor`, label.style.backgroundColor);
        
        label.style.fontWeight = 'bold';
        label.style.backgroundColor = '#e9ecef';
    });
    
    // Enhance quarter indicators
    const quarterIndicators = document.querySelectorAll('.quarter-indicator');
    quarterIndicators.forEach((indicator, index) => {
        const indId = `ind-${index}`;
        originalStyles.set(`${indId}-opacity`, indicator.style.opacity);
        indicator.style.opacity = '0.08'; // Slightly more visible but still subtle
    });
}

function restoreOriginalStyles(originalStyles) {
    // Restore timeline backgrounds
    const timelineContent = document.getElementById('timelineContent');
    const timelineGrid = document.getElementById('timelineGrid');
    
    timelineContent.style.backgroundColor = originalStyles.get('timelineContent-bg') || '';
    timelineGrid.style.backgroundColor = originalStyles.get('timelineGrid-bg') || '';
    
    // Restore project bars
    const projectBars = document.querySelectorAll('.project-bar');
    projectBars.forEach((bar, index) => {
        const barId = `bar-${index}`;
        bar.style.fontSize = originalStyles.get(`${barId}-fontSize`) || '';
        bar.style.fontWeight = originalStyles.get(`${barId}-fontWeight`) || '';
        bar.style.backgroundColor = originalStyles.get(`${barId}-backgroundColor`) || '';
        bar.style.boxShadow = originalStyles.get(`${barId}-boxShadow`) || '';
        
        // Restore original HTML content
        const originalHTML = originalStyles.get(`${barId}-innerHTML`);
        if (originalHTML) {
            bar.innerHTML = originalHTML;
        }
    });
    
    // Restore month labels
    const monthLabels = document.querySelectorAll('.month-label');
    monthLabels.forEach((label, index) => {
        const labelId = `label-${index}`;
        label.style.fontWeight = originalStyles.get(`${labelId}-fontWeight`) || '';
        label.style.backgroundColor = originalStyles.get(`${labelId}-backgroundColor`) || '';
    });
    
    // Restore quarter indicators
    const quarterIndicators = document.querySelectorAll('.quarter-indicator');
    quarterIndicators.forEach((indicator, index) => {
        const indId = `ind-${index}`;
        indicator.style.opacity = originalStyles.get(`${indId}-opacity`) || '';
    });
}

function darkenColor(color, amount) {
    // Convert RGB color to darker version
    if (color.startsWith('rgb')) {
        const matches = color.match(/\d+/g);
        if (matches && matches.length >= 3) {
            const r = Math.max(0, parseInt(matches[0]) - Math.round(255 * amount));
            const g = Math.max(0, parseInt(matches[1]) - Math.round(255 * amount));
            const b = Math.max(0, parseInt(matches[2]) - Math.round(255 * amount));
            return `rgb(${r}, ${g}, ${b})`;
        }
    } else if (color.startsWith('#')) {
        // Handle hex colors
        const hex = color.replace('#', '');
        const r = Math.max(0, parseInt(hex.substr(0, 2), 16) - Math.round(255 * amount));
        const g = Math.max(0, parseInt(hex.substr(2, 2), 16) - Math.round(255 * amount));
        const b = Math.max(0, parseInt(hex.substr(4, 2), 16) - Math.round(255 * amount));
        return `rgb(${r}, ${g}, ${b})`;
    }
    return color; // Return original if can't parse
}

function exportData() {
    const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        currentYear: currentYear,
        currentQuarter: currentQuarter,
        colorPalette: currentColorPalette,
        projectOrder: projectOrder,
        projects: projects.map(p => ({
            id: p.id,
            name: p.name,
            startDate: p.startDate.toISOString().split('T')[0],
            endDate: p.endDate.toISOString().split('T')[0],
            description: p.description,
            color: p.color,
            order: p.order
        }))
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `workplan-export-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    showSuccess('Project data exported successfully!');
}

function showImportModal() {
    document.getElementById('importModal').style.display = 'block';
}

function closeImportModal() {
    document.getElementById('importModal').style.display = 'none';
    document.getElementById('importData').value = '';
}

function importProjects() {
    const jsonData = document.getElementById('importData').value.trim();
    
    if (!jsonData) {
        showError('Please paste JSON data to import.');
        return;
    }
    
    try {
        const importData = JSON.parse(jsonData);
        
        if (!importData.projects || !Array.isArray(importData.projects)) {
            throw new Error('Invalid data format');
        }
        
        // Clear existing projects and import new ones
        projects = [];
        projectOrder = [];
        
        importData.projects.forEach(projectData => {
            const project = {
                id: projectData.id || Date.now() + Math.random(),
                name: projectData.name,
                startDate: new Date(projectData.startDate),
                endDate: new Date(projectData.endDate),
                description: projectData.description || '',
                color: projectData.color || getProjectColor(projects.length),
                order: projectData.order || projects.length
            };
            projects.push(project);
            projectOrder.push(project.id);
        });
        
        // Import project order if available
        if (importData.projectOrder && Array.isArray(importData.projectOrder)) {
            projectOrder = importData.projectOrder;
        }
        
        if (importData.currentYear) {
            currentYear = importData.currentYear;
        }
        
        if (importData.currentQuarter) {
            currentQuarter = importData.currentQuarter;
        }
        
        if (importData.colorPalette) {
            currentColorPalette = importData.colorPalette;
            document.getElementById('colorPalette').value = currentColorPalette;
            saveColorPalette();
        }
        
        reorderAndUpdateProjects();
        updatePeriodDisplay();
        saveProjectsToStorage();
        renderProjects();
        renderTimeline();
        closeImportModal();
        showSuccess(`Successfully imported ${projects.length} projects!`);
        
    } catch (error) {
        console.error('Import failed:', error);
        showError('Failed to import data. Please check the JSON format.');
    }
}

function clearAllProjects() {
    if (confirm('Are you sure you want to delete all projects? This cannot be undone.')) {
        projects = [];
        projectOrder = [];
        saveProjectsToStorage();
        renderProjects();
        renderTimeline();
        showSuccess('All projects cleared.');
    }
}

function saveProjectsToStorage() {
    const data = {
        projects: projects.map(p => ({
            id: p.id,
            name: p.name,
            startDate: p.startDate.toISOString().split('T')[0],
            endDate: p.endDate.toISOString().split('T')[0],
            description: p.description,
            color: p.color,
            order: p.order
        })),
        currentYear: currentYear,
        currentQuarter: currentQuarter,
        projectOrder: projectOrder
    };
    localStorage.setItem('workplanProjects', JSON.stringify(data));
}

function loadProjectsFromStorage() {
    const stored = localStorage.getItem('workplanProjects');
    if (stored) {
        try {
            const data = JSON.parse(stored);
            projects = data.projects.map(p => {
                // Ensure robust date parsing
                let startDate, endDate;
                try {
                    startDate = new Date(p.startDate);
                    endDate = new Date(p.endDate);
                    
                    // Validate dates
                    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                        throw new Error('Invalid dates');
                    }
                } catch (dateError) {
                    console.warn('Invalid dates for project:', p.name, 'Using current date as fallback');
                    const now = new Date();
                    startDate = new Date(now);
                    endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days later
                }
                
                return {
                    id: p.id,
                    name: p.name,
                    startDate: startDate,
                    endDate: endDate,
                    description: p.description,
                    color: p.color || getProjectColor(0),
                    order: p.order || 0
                };
            });
            
            if (data.projectOrder && Array.isArray(data.projectOrder)) {
                projectOrder = data.projectOrder;
            } else {
                // Create project order from existing projects
                projectOrder = projects.map(p => p.id);
            }
            
            if (data.currentYear) {
                currentYear = data.currentYear;
            }
            if (data.currentQuarter) {
                currentQuarter = data.currentQuarter;
            }
            updatePeriodDisplay();
            renderProjects();
            renderTimeline();
        } catch (error) {
            console.error('Failed to load projects from storage:', error);
        }
    }
}

function saveColorPalette() {
    localStorage.setItem('workplanColorPalette', currentColorPalette);
}

function loadColorPalette() {
    const stored = localStorage.getItem('workplanColorPalette');
    if (stored) {
        currentColorPalette = stored;
        document.getElementById('colorPalette').value = currentColorPalette;
    }
}

function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
}

function showError(message) {
    const errorEl = document.getElementById('errorMessage');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
    setTimeout(hideMessages, 5000);
}

function showSuccess(message) {
    const successEl = document.getElementById('successMessage');
    successEl.textContent = message;
    successEl.style.display = 'block';
    setTimeout(hideMessages, 3000);
}

function hideMessages() {
    document.getElementById('errorMessage').style.display = 'none';
    document.getElementById('successMessage').style.display = 'none';
}

function scrollToProjectAndEdit(projectId) {
    // First scroll to the project in the "All Projects" section
    const projectElement = document.querySelector(`[data-project-id="${projectId}"]`);
    if (!projectElement) {
        showError('Project not found in list.');
        return;
    }
    
    // Cancel any existing editing
    if (editingTitleProjectId) cancelTitleEdit();
    if (editingProjectId) cancelDateEdit();
    
    // Smooth scroll to the project
    projectElement.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center',
        inline: 'nearest'
    });
    
    // Wait for the scroll to complete, then activate title editing
    setTimeout(() => {
        // Highlight the project briefly
        projectElement.style.transform = 'scale(1.02)';
        projectElement.style.boxShadow = '0 8px 25px rgba(14, 75, 145, 0.3)';
        projectElement.style.transition = 'all 0.3s ease';
        
        setTimeout(() => {
            projectElement.style.transform = 'scale(1)';
            projectElement.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.1)';
            // Start title editing
            editProjectTitle(projectId);
        }, 400);
    }, 600);
}

function getMarkerIconHTML(marker) {
    if (marker === 'star') return '★';
    if (marker === 'flag') return '⚑';
    if (marker === 'exclamation') return '❗';
    return '';
}
function showSemicircleMenu(bar, project) {
    closeSemicircleMenu();
    const menu = document.createElement('div');
    menu.className = 'semicircle-menu';
    menu.innerHTML = `
        <button class="icon-btn" title="Star" data-marker="star">★</button>
        <button class="icon-btn" title="Flag" data-marker="flag">⚑</button>
        <button class="icon-btn" title="Exclamation" data-marker="exclamation">❗</button>
        <button class="icon-btn" title="Clear" data-marker="none">✕</button>
    `;
    menu.style.position = 'absolute';
    menu.style.top = '-44px';
    menu.style.right = '-44px';
    menu.style.zIndex = 1002;
    menu.querySelectorAll('.icon-btn').forEach(btn => {
        btn.onclick = (ev) => {
            ev.stopPropagation();
            const marker = btn.getAttribute('data-marker');
            if (marker === 'none') {
                project.marker = null;
            } else {
                project.marker = marker;
            }
            saveProjectsToStorage();
            renderTimeline();
            closeSemicircleMenu();
        };
    });
    bar.appendChild(menu);
    setTimeout(() => {
        document.addEventListener('mousedown', handleMenuOutsideClick, { once: true });
    }, 0);
}
function closeSemicircleMenu() {
    if (openMenuElement) {
        const menu = openMenuElement.querySelector('.semicircle-menu');
        if (menu) menu.remove();
    }
    openMenuProjectId = null;
    openMenuElement = null;
}
function handleMenuOutsideClick(e) {
    if (openMenuElement && !openMenuElement.contains(e.target)) {
        closeSemicircleMenu();
    }
}

// Close modals when clicking outside
window.onclick = function(event) {
    const apiModal = document.getElementById('apiKeyModal');
    const importModal = document.getElementById('importModal');
    const customColorModal = document.getElementById('customColorModal');
    
    if (event.target === apiModal) {
        apiModal.style.display = 'none';
    }
    if (event.target === importModal) {
        closeImportModal();
    }
    if (event.target === customColorModal) {
        closeCustomColorModal();
    }
    
    // Close editing if clicking outside
    if (editingProjectId && !event.target.closest('.project-dates.editing') && !event.target.closest('.date-edit-btn')) {
        cancelDateEdit();
    }
    if (editingTitleProjectId && !event.target.closest('.project-name.editing') && !event.target.closest('.title-edit-btn')) {
        cancelTitleEdit();
    }
}

// Initialize the application
init();