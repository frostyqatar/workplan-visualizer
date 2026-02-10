import { currentDensity, spacingScale } from './state.js';

/* =============== DOM helpers =============== */
export function id(v) { return document.getElementById(v); }

export function clamp(n, min, max) { return Math.min(Math.max(n, min), max); }

export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]
  );
}

/* =============== Date utilities — FIX 1.2: timezone-safe =============== */

/**
 * Parse an ISO date string (yyyy-mm-dd) as LOCAL midnight, not UTC.
 * This fixes the off-by-one day bug when the browser is behind UTC.
 */
export function parseLocalDate(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  const str = String(s).trim();
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(str);
  if (m) {
    return new Date(+m[1], +m[2] - 1, +m[3]);
  }
  // Fallback: try native parsing but normalise to local midnight
  const d = new Date(str);
  if (isNaN(d)) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Format a Date to 'yyyy-mm-dd' using LOCAL date parts (not toISOString which is UTC).
 */
export function formatDateISO(d) {
  if (!d || isNaN(d)) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Create a Date at local midnight for today. Fixes bug 1.4 (today line drift).
 */
export function todayMidnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/* =============== CSS helpers =============== */
export function cssNum(varName, fallback) {
  const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  const parsed = parseFloat(val);
  return isNaN(parsed) ? parseFloat(fallback) : parsed;
}

export function getUniformRowHeight() {
  const nodeHeightPx = cssNum('--node-height', '36');
  const densityScale = currentDensity === 'compact' ? 0.8 : 1;
  const baseRowHeight = 45;
  const minGap = 2;
  return Math.max(Math.round(baseRowHeight * spacingScale * densityScale), nodeHeightPx + minGap);
}

/* =============== Text wrapping helper =============== */
export function wrapTextForWidth(text, maxWidth) {
  if (maxWidth < 80) return text;
  const words = text.split(' ');
  if (words.length === 1) return text;
  const mid = Math.ceil(words.length / 2);
  return `${words.slice(0, mid).join(' ')}<br>${words.slice(mid).join(' ')}`;
}

/* =============== Color contrast =============== */
export function getContrastColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#ffffff';
  const num = parseInt(m[1], 16);
  const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
  const lum = 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
  return lum > 0.6 ? '#000000' : '#ffffff';
}
