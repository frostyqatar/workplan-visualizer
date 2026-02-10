import {
  apiKey, currentYear, currentView, currentQuarter,
  setApiKey
} from './state.js';
import { id, parseLocalDate, formatDateISO } from './utils.js';
import { getCurrentQuarter } from './state.js';
import { addProject } from './projects.js';
import { showError, showSuccess, showLoading, hideMessages, showApiKeyModal } from './ui.js';
import { parseProjectsLocal } from './dateParser.js';

/* =============== Process user input =============== */
export function handleEnterKey(e) { if (e.key === 'Enter') processProject(); }

export function processProject() {
  const input = id('projectInput')?.value.trim();
  if (!input) return;
  hideMessages();

  // Try local parsing first (Phase 2: AI-optional)
  const locallyParsed = parseProjectsLocal(input);
  if (locallyParsed.length) {
    locallyParsed.forEach(addProject);
    if (id('projectInput')) id('projectInput').value = '';
    showSuccess(`Added ${locallyParsed.length} project${locallyParsed.length > 1 ? 's' : ''}.`);
    return;
  }

  // Fall back to AI
  if (!apiKey) { showApiKeyModal(); return; }
  showLoading(true);
  callGeminiAPI(input);
}

function getCurrentQuarterDates() {
  const q = currentView === 'quarter' ? currentQuarter : getCurrentQuarter();
  const map = { 1: [0, 2], 2: [3, 5], 3: [6, 8], 4: [9, 11] };
  const [sm, em] = map[q];
  const s = new Date(currentYear, sm, 1);
  const e = new Date(currentYear, em + 1, 0);
  return { start: formatDateISO(s), end: formatDateISO(e) };
}

/* =============== Gemini API — Bug Fix 1.6: specific error messages =============== */
async function callGeminiAPI(input) {
  const quarterDates = getCurrentQuarterDates();
  const prompt = `You are a project parser. Return JSON array of projects {name,startDate,endDate,description?}. Use ISO dates. Context quarterStart=${quarterDates.start} quarterEnd=${quarterDates.end}. Text: ${input}`;

  try {
    let response;
    try {
      response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
    } catch (networkErr) {
      throw new Error('Network error — check your internet connection.');
    }

    // Specific HTTP error messages
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Invalid API key. Please update your Gemini API key.');
      } else if (response.status === 429) {
        throw new Error('Rate limited — please wait a moment and try again.');
      } else if (response.status >= 500) {
        throw new Error('Gemini server error — please try again later.');
      }
      throw new Error(`API Error: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();
    if (data.error) throw new Error(`API Error: ${data.error.message}`);

    // Extract text from response
    let text = '';
    if (data.candidates?.[0]?.content) {
      text = data.candidates[0].content.parts[0].text || '';
    } else if (data.output?.[0]) {
      text = data.output[0].content || '';
    } else if (data.result) {
      text = JSON.stringify(data.result);
    }

    if (!text.trim()) {
      throw new Error('Empty AI response — try rephrasing your input.');
    }

    // Clean and parse JSON
    let cleaned = text.replace(/[\u2018\u2019\u201C\u201D]/g, '"').replace(/\r/g, '\n');
    const arrMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (!arrMatch) throw new Error('No JSON found in AI response.');
    cleaned = arrMatch[0];

    let arr;
    try { arr = JSON.parse(cleaned); } catch (e) { throw new Error('Failed to parse AI JSON response.'); }
    if (!Array.isArray(arr)) arr = [arr];

    let added = 0;
    arr.forEach(p => {
      if (!p.name || !p.startDate || !p.endDate) return;
      const s = parseLocalDate(p.startDate);
      const e = parseLocalDate(p.endDate);
      if (!s || !e) return;
      addProject({
        name: p.name,
        startDate: formatDateISO(s),
        endDate: formatDateISO(e),
        description: p.description || ''
      });
      added++;
    });

    if (id('projectInput')) id('projectInput').value = '';
    hideMessages();
    if (added) {
      showSuccess(`Added ${added} project${added > 1 ? 's' : ''}.`);
    } else {
      showError('No valid projects found — check your date format or try rephrasing.');
    }
  } catch (err) {
    console.error(err);
    showError(err.message);
  } finally {
    showLoading(false);
  }
}

/* =============== API key management =============== */
export function saveApiKey() {
  const key = id('apiKeyInput')?.value.trim();
  if (key) {
    setApiKey(key);
    localStorage.setItem('geminiApiKey', key);
    id('apiKeyModal').style.display = 'none';
    if (id('projectInput')?.value.trim()) processProject();
  }
}
