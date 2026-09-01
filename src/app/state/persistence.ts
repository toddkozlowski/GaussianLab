/**
 * Autosave: keeps the current table layout in localStorage so a page
 * refresh, or closing and reopening the tab, doesn't lose it. Reuses the
 * .gaussian text format so persisted state stays human-inspectable and
 * shares its parsing/validation with file load.
 */

import type { AppState, WaistFitState } from './schema';
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

// The Waist Fit panel's entered points are scratch working data, not part of
// a shareable table layout - kept in their own storage entry (plain JSON,
// not the .gaussian text format) rather than folded into the table
// autosave/file format above, so they survive a page refresh without also
// becoming part of every saved/shared .gaussian file.
const WAIST_FIT_STORAGE_KEY = 'gaussianlab.waistfit.v1';

export function saveWaistFitToStorage(waistFit: WaistFitState): void {
  try {
    window.localStorage.setItem(WAIST_FIT_STORAGE_KEY, JSON.stringify(waistFit));
  } catch {
    // best-effort, same as saveStateToStorage above
  }
}

export function loadWaistFitFromStorage(): WaistFitState | null {
  try {
    const raw = window.localStorage.getItem(WAIST_FIT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.points)) {
      return null;
    }
    return parsed as WaistFitState;
  } catch {
    return null;
  }
}

export function clearWaistFitStorage(): void {
  try {
    window.localStorage.removeItem(WAIST_FIT_STORAGE_KEY);
  } catch {
    // ignore
  }
}
