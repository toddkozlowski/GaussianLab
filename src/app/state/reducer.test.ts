import { describe, it, expect } from 'vitest';
import { appStateReducer, type AppAction } from './reducer';
import { createSourceComponent, createLensThinComponent, createFlatMirrorComponent } from './componentFactories';
import { DEFAULT_APP_STATE } from './defaultState';
import type { LensThinComponent, OpticalComponent } from './schema';

describe('appStateReducer', () => {
  it('adds a component to the state', () => {
    const source = createSourceComponent();
    const action: AppAction = {
      type: 'ADD_COMPONENT',
      payload: source,
    };

    const newState = appStateReducer(DEFAULT_APP_STATE, action);
    expect(newState.components[source.id]).toEqual(source);
    expect(newState.sourceId).toBeNull(); // Not automatically set
  });

  it('removes a component from the state', () => {
    const lens = createLensThinComponent();
    const state = {
      ...DEFAULT_APP_STATE,
      components: { [lens.id]: lens },
    };

    const action: AppAction = {
      type: 'REMOVE_COMPONENT',
      payload: { id: lens.id },
    };

    const newState = appStateReducer(state, action);
    expect(newState.components[lens.id]).toBeUndefined();
  });

  it('does not remove the source component - only one source is supported at a time', () => {
    const source = createSourceComponent();
    const state = {
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: { [source.id]: source },
    };

    const action: AppAction = {
      type: 'REMOVE_COMPONENT',
      payload: { id: source.id },
    };

    const newState = appStateReducer(state, action);
    expect(newState.components[source.id]).toEqual(source);
    expect(newState.sourceId).toBe(source.id);
  });

  it('removes a non-source component without clearing sourceId', () => {
    const source = createSourceComponent();
    const lens = createLensThinComponent();
    const state = {
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: { [source.id]: source, [lens.id]: lens },
    };

    const action: AppAction = {
      type: 'REMOVE_COMPONENT',
      payload: { id: lens.id },
    };

    const newState = appStateReducer(state, action);
    expect(newState.components[lens.id]).toBeUndefined();
    expect(newState.sourceId).toBe(source.id); // Unchanged
    expect(newState.components[source.id]).toBeDefined();
  });

  it('updates a component in place', () => {
    const lens = createLensThinComponent();
    const state = {
      ...DEFAULT_APP_STATE,
      components: { [lens.id]: lens },
    };

    const action: AppAction = {
      type: 'UPDATE_COMPONENT',
      payload: {
        id: lens.id,
        updates: {
          focalLength: 200,
          position: { x: 500, y: 500 },
        } as Partial<OpticalComponent>,
      },
    };

    const newState = appStateReducer(state, action);
    const updated = newState.components[lens.id] as LensThinComponent;
    expect(updated.focalLength).toBe(200);
    expect(updated.position).toEqual({ x: 500, y: 500 });
    expect(updated.label).toBe(lens.label); // Other fields unchanged
  });

  it('sets the source ID when a valid source component exists', () => {
    const source = createSourceComponent();
    const state = {
      ...DEFAULT_APP_STATE,
      components: { [source.id]: source },
      sourceId: null,
    };

    const action: AppAction = {
      type: 'SET_SOURCE_ID',
      payload: { sourceId: source.id },
    };

    const newState = appStateReducer(state, action);
    expect(newState.sourceId).toBe(source.id);
  });

  it('ignores SET_SOURCE_ID if the component is not a source', () => {
    const lens = createLensThinComponent();
    const state = {
      ...DEFAULT_APP_STATE,
      components: { [lens.id]: lens },
      sourceId: null,
    };

    const action: AppAction = {
      type: 'SET_SOURCE_ID',
      payload: { sourceId: lens.id },
    };

    const newState = appStateReducer(state, action);
    expect(newState.sourceId).toBeNull(); // Unchanged; lens is not a source
  });

  it('clears source ID when set to null', () => {
    const source = createSourceComponent();
    const state = {
      ...DEFAULT_APP_STATE,
      components: { [source.id]: source },
      sourceId: source.id,
    };

    const action: AppAction = {
      type: 'SET_SOURCE_ID',
      payload: { sourceId: null },
    };

    const newState = appStateReducer(state, action);
    expect(newState.sourceId).toBeNull();
  });

  it('updates table configuration', () => {
    const action: AppAction = {
      type: 'UPDATE_TABLE_CONFIG',
      payload: {
        width: 2000,
        snapToGrid: false,
      },
    };

    const newState = appStateReducer(DEFAULT_APP_STATE, action);
    expect(newState.table.width).toBe(2000);
    expect(newState.table.snapToGrid).toBe(false);
    expect(newState.table.height).toBe(DEFAULT_APP_STATE.table.height); // Unchanged
  });

  it('sets the target mode', () => {
    const action: AppAction = {
      type: 'SET_TARGET_MODE',
      payload: {
        targetMode: {
          kind: 'target',
          targetComponentId: 'target-1',
        },
      },
    };

    const newState = appStateReducer(DEFAULT_APP_STATE, action);
    expect(newState.targetMode?.kind).toBe('target');
    if (newState.targetMode?.kind === 'target') {
      expect(newState.targetMode.targetComponentId).toBe('target-1');
    }
  });

  it('clears target mode', () => {
    const state = {
      ...DEFAULT_APP_STATE,
      targetMode: {
        kind: 'target' as const,
        targetComponentId: 'target-1',
      },
    };

    const action: AppAction = {
      type: 'SET_TARGET_MODE',
      payload: { targetMode: null },
    };

    const newState = appStateReducer(state, action);
    expect(newState.targetMode).toBeNull();
  });

  it('sets selected component ID', () => {
    const lens = createLensThinComponent();
    const state = {
      ...DEFAULT_APP_STATE,
      components: { [lens.id]: lens },
    };

    const action: AppAction = {
      type: 'SET_SELECTED_COMPONENT',
      payload: { componentId: lens.id },
    };

    const newState = appStateReducer(state, action);
    expect(newState.selectedComponentId).toBe(lens.id);
  });

  it('clears selected component ID', () => {
    const lens = createLensThinComponent();
    const state = {
      ...DEFAULT_APP_STATE,
      components: { [lens.id]: lens },
      selectedComponentId: lens.id,
    };

    const action: AppAction = {
      type: 'SET_SELECTED_COMPONENT',
      payload: { componentId: null },
    };

    const newState = appStateReducer(state, action);
    expect(newState.selectedComponentId).toBeNull();
  });

  it('locks a component', () => {
    const lens = createLensThinComponent();
    const state = {
      ...DEFAULT_APP_STATE,
      components: { [lens.id]: lens },
    };

    const action: AppAction = {
      type: 'LOCK_COMPONENT',
      payload: { id: lens.id, locked: true },
    };

    const newState = appStateReducer(state, action);
    expect(newState.components[lens.id].locked).toBe(true);
  });

  it('unlocks a component', () => {
    const lens = createLensThinComponent();
    lens.locked = true;
    const state = {
      ...DEFAULT_APP_STATE,
      components: { [lens.id]: lens },
    };

    const action: AppAction = {
      type: 'LOCK_COMPONENT',
      payload: { id: lens.id, locked: false },
    };

    const newState = appStateReducer(state, action);
    expect(newState.components[lens.id].locked).toBe(false);
  });

  it('sets solver status', () => {
    const action: AppAction = {
      type: 'SET_SOLVER_STATUS',
      payload: 'running',
    };

    const newState = appStateReducer(DEFAULT_APP_STATE, action);
    expect(newState.optimiser.status).toBe('running');
  });

  it('resets the entire state', () => {
    const source = createSourceComponent();
    const lens = createLensThinComponent();
    const state = {
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: { [source.id]: source, [lens.id]: lens },
      selectedComponentId: lens.id,
      targetMode: {
        kind: 'target' as const,
        targetComponentId: 'target-1',
      },
    };

    const action: AppAction = {
      type: 'RESET_STATE',
    };

    const newState = appStateReducer(state, action);
    expect(newState.components).toEqual({});
    expect(newState.sourceId).toBeNull();
    expect(newState.selectedComponentId).toBeNull();
    expect(newState.targetMode).toBeNull();
    expect(newState.optimiser.status).toBe('idle');
    expect(newState.optimiser.solutions).toEqual([]);
  });

  it('replaces the whole state wholesale on LOAD_STATE (e.g. loading a .gaussian file)', () => {
    const existingLens = createLensThinComponent();
    const currentState = {
      ...DEFAULT_APP_STATE,
      components: { [existingLens.id]: existingLens },
      selectedComponentId: existingLens.id,
    };

    const loadedSource = createSourceComponent();
    const loadedState = {
      ...DEFAULT_APP_STATE,
      sourceId: loadedSource.id,
      components: { [loadedSource.id]: loadedSource },
    };

    const action: AppAction = { type: 'LOAD_STATE', payload: loadedState };
    const newState = appStateReducer(currentState, action);

    expect(newState).toBe(loadedState);
    expect(newState.components).toEqual({ [loadedSource.id]: loadedSource });
    expect(newState.components[existingLens.id]).toBeUndefined();
  });

  it('maintains immutability when updating', () => {
    const source = createSourceComponent();
    const state = {
      ...DEFAULT_APP_STATE,
      components: { [source.id]: source },
    };

    const action: AppAction = {
      type: 'UPDATE_COMPONENT',
      payload: {
        id: source.id,
        updates: { waistRadius: 0.1 },
      },
    };

    const newState = appStateReducer(state, action);
    expect(state.components[source.id]).not.toBe(newState.components[source.id]);
    expect(state.components).not.toBe(newState.components);
    expect(state).not.toBe(newState);
  });

  describe('waist fit actions', () => {
    it('updates the targeted point without touching the others', () => {
      const state = DEFAULT_APP_STATE;
      const targetId = state.waistFit.points[1].id;

      const action: AppAction = {
        type: 'UPDATE_WAIST_FIT_POINT',
        payload: { id: targetId, updates: { zMm: 50 } },
      };
      const newState = appStateReducer(state, action);

      expect(newState.waistFit.points[1]).toMatchObject({ id: targetId, zMm: 50, waistRadiusMm: null });
      expect(newState.waistFit.points[0]).toEqual(state.waistFit.points[0]);
    });

    it('appends a fresh blank row once the last row gets a value', () => {
      const state = DEFAULT_APP_STATE;
      const lastRow = state.waistFit.points[state.waistFit.points.length - 1];
      expect(state.waistFit.points).toHaveLength(5);

      const action: AppAction = {
        type: 'UPDATE_WAIST_FIT_POINT',
        payload: { id: lastRow.id, updates: { zMm: 100 } },
      };
      const newState = appStateReducer(state, action);

      expect(newState.waistFit.points).toHaveLength(6);
      const appendedRow = newState.waistFit.points[5];
      expect(appendedRow.zMm).toBeNull();
      expect(appendedRow.waistRadiusMm).toBeNull();
      expect(appendedRow.id).not.toBe(lastRow.id);
    });

    it('does not append a row when a non-last row is edited', () => {
      const state = DEFAULT_APP_STATE;
      const firstRow = state.waistFit.points[0];

      const action: AppAction = {
        type: 'UPDATE_WAIST_FIT_POINT',
        payload: { id: firstRow.id, updates: { zMm: 10 } },
      };
      const newState = appStateReducer(state, action);

      expect(newState.waistFit.points).toHaveLength(5);
    });

    it('clears a previously computed fit result whenever a point is edited', () => {
      const state = {
        ...DEFAULT_APP_STATE,
        waistFit: { ...DEFAULT_APP_STATE.waistFit, result: { zMm: 10, waistRadiusMm: 0.2 } },
      };

      const action: AppAction = {
        type: 'UPDATE_WAIST_FIT_POINT',
        payload: { id: state.waistFit.points[0].id, updates: { zMm: 5 } },
      };
      const newState = appStateReducer(state, action);

      expect(newState.waistFit.result).toBeNull();
    });

    it('toggles showOnBeamPath', () => {
      const state = DEFAULT_APP_STATE;
      const action: AppAction = { type: 'SET_WAIST_FIT_SHOW_ON_PATH', payload: { show: false } };
      const newState = appStateReducer(state, action);
      expect(newState.waistFit.showOnBeamPath).toBe(false);
    });

    it('stores a computed fit result', () => {
      const state = DEFAULT_APP_STATE;
      const result = { zMm: 42, waistRadiusMm: 0.15 };
      const action: AppAction = { type: 'SET_WAIST_FIT_RESULT', payload: { result } };
      const newState = appStateReducer(state, action);
      expect(newState.waistFit.result).toEqual(result);
    });

    it('resets waistFit back to its default on RESET_STATE', () => {
      const state = {
        ...DEFAULT_APP_STATE,
        waistFit: {
          points: [{ id: 'x', zMm: 1, waistRadiusMm: 2 }],
          showOnBeamPath: false,
          result: { zMm: 1, waistRadiusMm: 0.1 },
        },
      };

      const newState = appStateReducer(state, { type: 'RESET_STATE' });
      expect(newState.waistFit).toEqual(DEFAULT_APP_STATE.waistFit);
    });
  });
});
