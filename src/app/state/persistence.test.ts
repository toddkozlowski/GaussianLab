import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearStoredState, loadStateFromStorage, saveStateToStorage } from './persistence';
import { createInitialAppState, createLensThinComponent } from './componentFactories';

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
