/**
 * Autosave: keeps the current table layout in localStorage so a page
 * refresh, or closing and reopening the tab, doesn't lose it. Reuses the
 * .gaussian text format so persisted state stays human-inspectable and
 * shares its parsing/validation with file load.
 */

import type { AppState } from './schema';
import { parseAppState, serializeAppState } from './fileFormat';

const STORAGE_KEY = 'gaussianlab.autosave.v1';

export function saveStateToStorage(state: AppState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeAppState(state));
  } catch {
    // Storage can be unavailable (quota exceeded, private browsing); autosave
    // is best-effort and shouldn't block the app.
  }
}

export function loadStateFromStorage(): AppState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? parseAppState(raw) : null;
  } catch {
    return null;
  }
}

export function clearStoredState(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
