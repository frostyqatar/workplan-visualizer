import { parseLocalDate, formatDateISO } from './utils.js';
import { currentYear } from './state.js';

/* =============== Month / Quarter lookup =============== */
const MONTH_NAMES = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11
};

function monthIndex(s) {
  const key = s.toLowerCase().trim();
  return key in MONTH_NAMES ? MONTH_NAMES[key] : -1;
}

/* =============== Quarter helpers =============== */
function quarterToDateRange(q, year) {
  const map = { 1: [0, 2], 2: [3, 5], 3: [6, 8], 4: [9, 11] };
  const [sm, em] = map[q] || [0, 2];
  const start = new Date(year, sm, 1);
  const end = new Date(year, em + 1, 0); // last day of end month
  return { start, end };
}

function monthToDateRange(startIdx, endIdx, year) {
  const start = new Date(year, startIdx, 1);
  const end = new Date(year, endIdx + 1, 0);
  return { start, end };
}

/* =============== Individual parsers =============== */

/**
 * Quarter range: "Q1-Q3", "Q1-Q3 2025", "Q4 2025", "Q2"
 */
function tryParseQuarterRange(segment) {
  // Pattern: optional name prefix, then Q\d-Q\d or single Q\d, optional year
  const m = segment.match(/^(.+?)\s+Q([1-4])\s*[-–—to]+\s*Q([1-4])(?:\s+(\d{4}))?\s*$/i)
         || segment.match(/^Q([1-4])\s*[-–—to]+\s*Q([1-4])(?:\s+(\d{4}))?\s*$/i);
  if (m) {
    if (m.length === 5) {
      // has name prefix
      const name = m[1].trim();
      const q1 = +m[2], q2 = +m[3];
      const year = m[4] ? +m[4] : currentYear;
      const { start } = quarterToDateRange(q1, year);
      const { end } = quarterToDateRange(q2, year);
      return { name, startDate: formatDateISO(start), endDate: formatDateISO(end) };
    } else {
      // no name prefix
      const q1 = +m[1], q2 = +m[2];
      const year = m[3] ? +m[3] : currentYear;
      const { start } = quarterToDateRange(q1, year);
      const { end } = quarterToDateRange(q2, year);
      return { name: segment.trim(), startDate: formatDateISO(start), endDate: formatDateISO(end) };
    }
  }

  // Single quarter: "Task Q4 2025" or "Task Q4" or "Q4 2025"
  const single = segment.match(/^(.+?)\s+Q([1-4])(?:\s+(\d{4}))?\s*$/i)
              || segment.match(/^Q([1-4])(?:\s+(\d{4}))?\s*$/i);
  if (single) {
    if (single.length === 4 && single[1] && isNaN(+single[1])) {
      const name = single[1].trim();
      const q = +single[2];
      const year = single[3] ? +single[3] : currentYear;
      const { start, end } = quarterToDateRange(q, year);
      return { name, startDate: formatDateISO(start), endDate: formatDateISO(end) };
    } else {
      const q = +single[1];
      const year = single[2] ? +single[2] : currentYear;
      const { start, end } = quarterToDateRange(q, year);
      return { name: segment.trim(), startDate: formatDateISO(start), endDate: formatDateISO(end) };
    }
  }
  return null;
}

/**
 * Month range: "Robin Jan-Sept", "Robin Jan-Sept 2025", "Jan-Mar"
 */
function tryParseMonthRange(segment) {
  const monthPattern = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  const re = new RegExp(
    `^(.+?)\\s+${monthPattern}\\s*[-–—to]+\\s*${monthPattern}(?:\\s+(\\d{4}))?\\s*$`, 'i'
  );
  const reNoName = new RegExp(
    `^${monthPattern}\\s*[-–—to]+\\s*${monthPattern}(?:\\s+(\\d{4}))?\\s*$`, 'i'
  );

  let m = segment.match(re);
  if (m) {
    const name = m[1].trim();
    const startM = monthIndex(m[2]);
    const endM = monthIndex(m[3]);
    const year = m[4] ? +m[4] : currentYear;
    if (startM === -1 || endM === -1) return null;
    const { start, end } = monthToDateRange(startM, endM, year);
    return { name, startDate: formatDateISO(start), endDate: formatDateISO(end) };
  }

  m = segment.match(reNoName);
  if (m) {
    const startM = monthIndex(m[1]);
    const endM = monthIndex(m[2]);
    const year = m[3] ? +m[3] : currentYear;
    if (startM === -1 || endM === -1) return null;
    const { start, end } = monthToDateRange(startM, endM, year);
    return { name: segment.trim(), startDate: formatDateISO(start), endDate: formatDateISO(end) };
  }
  return null;
}

/**
 * Compact date range: "Task 12/12-24/12" or "Task 12/12/2024-24/12/2024"
 */
function tryParseCompactDateRange(segment) {
  // dd/mm/yyyy-dd/mm/yyyy with optional name prefix
  const full = segment.match(/^(.+?)\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[-–—to]+\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/);
  if (full) {
    const name = full[1].trim();
    const start = new Date(+full[4], +full[3] - 1, +full[2]);
    const end = new Date(+full[7], +full[6] - 1, +full[5]);
    if (isNaN(start) || isNaN(end)) return null;
    return { name, startDate: formatDateISO(start), endDate: formatDateISO(end) };
  }

  // dd/mm-dd/mm (no year = currentYear)
  const short = segment.match(/^(.+?)\s+(\d{1,2})\/(\d{1,2})\s*[-–—to]+\s*(\d{1,2})\/(\d{1,2})\s*$/);
  if (short) {
    const name = short[1].trim();
    const start = new Date(currentYear, +short[3] - 1, +short[2]);
    const end = new Date(currentYear, +short[5] - 1, +short[4]);
    if (isNaN(start) || isNaN(end)) return null;
    return { name, startDate: formatDateISO(start), endDate: formatDateISO(end) };
  }

  // Same patterns without name prefix
  const fullNoName = segment.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[-–—to]+\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/);
  if (fullNoName) {
    const start = new Date(+fullNoName[3], +fullNoName[2] - 1, +fullNoName[1]);
    const end = new Date(+fullNoName[6], +fullNoName[5] - 1, +fullNoName[4]);
    if (isNaN(start) || isNaN(end)) return null;
    return { name: segment.trim(), startDate: formatDateISO(start), endDate: formatDateISO(end) };
  }

  const shortNoName = segment.match(/^(\d{1,2})\/(\d{1,2})\s*[-–—to]+\s*(\d{1,2})\/(\d{1,2})\s*$/);
  if (shortNoName) {
    const start = new Date(currentYear, +shortNoName[2] - 1, +shortNoName[1]);
    const end = new Date(currentYear, +shortNoName[4] - 1, +shortNoName[3]);
    if (isNaN(start) || isNaN(end)) return null;
    return { name: segment.trim(), startDate: formatDateISO(start), endDate: formatDateISO(end) };
  }

  return null;
}

/**
 * CSV: "Name, 2025-01-15, 2025-03-31"
 */
function tryParseCSV(segment) {
  const parts = segment.split(',').map(x => x.trim());
  if (parts.length < 3) return null;
  const startStr = parts[parts.length - 2];
  const endStr = parts[parts.length - 1];
  const s = parseLocalDate(startStr);
  const e = parseLocalDate(endStr);
  const name = parts.slice(0, parts.length - 2).join(', ');
  if (s && e && name) {
    return { name, startDate: formatDateISO(s), endDate: formatDateISO(e) };
  }
  return null;
}

/**
 * ISO range: "Task 2025-01-15 to 2025-03-31" or "Task 2025-01-15 - 2025-03-31"
 */
function tryParseISORange(segment) {
  const m = segment.match(/^(.+?)\s+(\d{4}-\d{1,2}-\d{1,2})\s*[-–—to]+\s*(\d{4}-\d{1,2}-\d{1,2})\s*$/);
  if (m) {
    const name = m[1].trim();
    const s = parseLocalDate(m[2]);
    const e = parseLocalDate(m[3]);
    if (s && e && name) {
      return { name, startDate: formatDateISO(s), endDate: formatDateISO(e) };
    }
  }
  return null;
}

/**
 * Flexible date parser for dd-mm-yyyy, dd/mm/yyyy, ISO, etc.
 */
export function parseDateFlexible(s) {
  if (!s) return null;
  const trimmed = s.trim();

  // ISO yyyy-mm-dd
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);

  // dd-mm-yyyy
  const dmyDash = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(trimmed);
  if (dmyDash) return new Date(+dmyDash[3], +dmyDash[2] - 1, +dmyDash[1]);

  // dd/mm/yyyy
  const dmySlash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (dmySlash) return new Date(+dmySlash[3], +dmySlash[2] - 1, +dmySlash[1]);

  const dt = new Date(trimmed);
  if (!isNaN(dt)) return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  return null;
}

/* =============== Main parser entry point =============== */

/**
 * Parse user input into project objects locally, without AI.
 * Returns array of { name, startDate, endDate, description? }
 */
export function parseProjectsLocal(input) {
  const items = [];

  // Step 1: Try semicolon-separated segments
  const segments = input.split(';').map(s => s.trim()).filter(Boolean);

  if (segments.length >= 1) {
    let parsedFromSegments = 0;
    for (const seg of segments) {
      const result = tryParseSingleSegment(seg);
      if (result) {
        items.push(result);
        parsedFromSegments++;
      }
    }
    if (parsedFromSegments > 0) return items;
  }

  // Step 2: Fall back to multi-line table format
  const tableItems = tryParseMultiLineTable(input);
  if (tableItems.length > 0) return tableItems;

  return items;
}

/**
 * Try all parsers on a single segment in priority order.
 */
function tryParseSingleSegment(segment) {
  return tryParseQuarterRange(segment)
      || tryParseMonthRange(segment)
      || tryParseCompactDateRange(segment)
      || tryParseCSV(segment)
      || tryParseISORange(segment);
}

/**
 * Multi-line table parser (existing behavior): name, startDate, endDate triplets.
 */
function tryParseMultiLineTable(input) {
  const lines = input.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const items = [];
  let i = 0;

  // Skip header lines that aren't followed by two dates
  while (i < lines.length && !parseDateFlexible(lines[i])) {
    const d1 = parseDateFlexible(lines[i + 1]);
    const d2 = parseDateFlexible(lines[i + 2]);
    if (d1 && d2) break;
    i++;
  }

  for (; i < lines.length;) {
    const name = lines[i];
    const s = parseDateFlexible(lines[i + 1]);
    const e = parseDateFlexible(lines[i + 2]);
    if (name && s && e) {
      items.push({ name, startDate: formatDateISO(s), endDate: formatDateISO(e) });
      i += 3;
      continue;
    }
    // Try single-line CSV within multi-line
    const csv = lines[i].split(',').map(x => x.trim());
    if (csv.length >= 3) {
      const s2 = parseDateFlexible(csv[csv.length - 2]);
      const e2 = parseDateFlexible(csv[csv.length - 1]);
      const name2 = csv.slice(0, csv.length - 2).join(', ');
      if (s2 && e2 && name2) {
        items.push({ name: name2, startDate: formatDateISO(s2), endDate: formatDateISO(e2) });
        i += 1;
        continue;
      }
    }
    i++;
  }
  return items;
}
