/**
 * Dark/light theme preference.
 *
 * This is deliberately kept separate from AppState (Store.ts) - it's a
 * local UI preference, not part of the optical table document, so it must
 * never be written into a saved .gaussian file or travel with one when
 * loaded. It gets its own tiny localStorage-backed store instead, applied
 * to <html data-theme="..."> for styles.css to key off of.
 */

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'gaussianlab.theme.v1';

const listeners = new Set<() => void>();

function readStoredTheme(): Theme | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === 'light' || raw === 'dark' ? raw : null;
  } catch {
    return null;
  }
}

function applyThemeToDocument(theme: Theme): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

// Dark by default until the user explicitly picks a theme in Settings.
let currentTheme: Theme = readStoredTheme() ?? 'dark';
// Applied at module load (before React renders) so there's no flash of the
// wrong theme on first paint.
applyThemeToDocument(currentTheme);

export function getTheme(): Theme {
  return currentTheme;
}

export function setTheme(theme: Theme): void {
  if (theme === currentTheme) {
    return;
  }
  currentTheme = theme;
  applyThemeToDocument(theme);
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage can be unavailable (quota exceeded, private browsing); the
    // theme still applies for this session, it just won't persist.
  }
  listeners.forEach((listener) => listener());
}

export function toggleTheme(): void {
  setTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
