import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  clearStoredState,
  clearWaistFitStorage,
  loadStateFromStorage,
  loadWaistFitFromStorage,
  saveStateToStorage,
  saveWaistFitToStorage,
} from './persistence';
import { createInitialAppState, createLensThinComponent } from './componentFactories';
import { DEFAULT_WAIST_FIT_STATE } from './defaultState';

describe('persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns null when nothing has been saved yet', () => {
    expect(loadStateFromStorage()).toBeNull();
  });

  it('round-trips a table layout through storage', () => {
    const state = createInitialAppState();
    const lens = createLensThinComponent(state.components, { x: 200, y: 300 });
    state.components[lens.id] = lens;

    saveStateToStorage(state);
    const loaded = loadStateFromStorage();

    expect(loaded).not.toBeNull();
    expect(loaded?.table).toEqual(state.table);
    expect(Object.keys(loaded?.components ?? {})).toEqual(Object.keys(state.components));
    expect(loaded?.components[lens.id]).toMatchObject({ kind: 'lens_thin', position: { x: 200, y: 300 } });
  });

  it('clears the saved layout so a later load finds nothing', () => {
    saveStateToStorage(createInitialAppState());
    expect(loadStateFromStorage()).not.toBeNull();

    clearStoredState();
    expect(loadStateFromStorage()).toBeNull();
  });

  it('is best-effort: a storage failure on save is swallowed, not thrown', () => {
    const spy = vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() => saveStateToStorage(createInitialAppState())).not.toThrow();

    spy.mockRestore();
  });
});

describe('waist fit persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns null when nothing has been saved yet', () => {
    expect(loadWaistFitFromStorage()).toBeNull();
  });

  it('round-trips the waist fit points, toggle, and result through storage - kept separate from the table autosave', () => {
    const waistFit = {
      points: [
        { id: 'a', zMm: 10, waistRadiusMm: 0.2 },
        { id: 'b', zMm: null, waistRadiusMm: null },
      ],
      showOnBeamPath: false,
      result: { zMm: 12, waistRadiusMm: 0.18 },
    };

    saveWaistFitToStorage(waistFit);
    expect(loadWaistFitFromStorage()).toEqual(waistFit);

    // Doesn't touch (or get restored from) the separate table autosave entry.
    expect(loadStateFromStorage()).toBeNull();
  });

  it('clears the saved points so a later load finds nothing', () => {
    saveWaistFitToStorage(DEFAULT_WAIST_FIT_STATE);
    expect(loadWaistFitFromStorage()).not.toBeNull();

    clearWaistFitStorage();
    expect(loadWaistFitFromStorage()).toBeNull();
  });

  it('returns null for malformed stored JSON rather than throwing', () => {
    window.localStorage.setItem('gaussianlab.waistfit.v1', '{not valid json');
    expect(loadWaistFitFromStorage()).toBeNull();
  });

  it('is best-effort: a storage failure on save is swallowed, not thrown', () => {
    const spy = vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() => saveWaistFitToStorage(DEFAULT_WAIST_FIT_STATE)).not.toThrow();

    spy.mockRestore();
  });
});
