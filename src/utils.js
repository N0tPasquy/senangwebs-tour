/**
 * Shared utility functions for SenangWebs Tour (SWT) runtime
 */

/**
 * Normalizes a scale value to the "x y z" string form for A-Frame entities.
 * Accepts numbers (e.g. 1.5 -> "1.5 1.5 1.5"), single-component strings,
 * or full "x y z" vectors. Falls back to "1 1 1".
 * @param {number|string|null|undefined} value
 * @returns {string}
 */
export function normalizeScale(value) {
  if (value === undefined || value === null || value === '') {
    return '1 1 1';
  }
  if (typeof value === 'number' && isFinite(value)) {
    return `${value} ${value} ${value}`;
  }
  if (typeof value === 'string') {
    const parts = value.trim().split(/\s+/).map(Number);
    if (parts.length >= 1 && parts.every((n) => isFinite(n) && n > 0)) {
      const [x, y = x, z = x] = parts;
      return `${x} ${y} ${z}`;
    }
  }
  return '1 1 1';
}

/**
 * Safe requestAnimationFrame with SSR / worker fallbacks
 */
export const requestAnimFrame =
  (typeof window !== 'undefined' && window.requestAnimationFrame ? (fn) => window.requestAnimationFrame(fn) : null) ||
  (typeof requestAnimationFrame !== 'undefined' ? (fn) => requestAnimationFrame(fn) : null) ||
  ((fn) => setTimeout(fn, 16));

/**
 * Safe cancelAnimationFrame with SSR / worker fallbacks
 */
export const cancelAnimFrame =
  (typeof window !== 'undefined' && window.cancelAnimationFrame ? (id) => window.cancelAnimationFrame(id) : null) ||
  (typeof cancelAnimationFrame !== 'undefined' ? (id) => cancelAnimationFrame(id) : null) ||
  ((id) => clearTimeout(id));

/**
 * Escape a string for safe HTML insertion
 * @param {string} str
 * @returns {string}
 */
export function escapeText(str) {
  return str
    ? String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
    : '';
}
