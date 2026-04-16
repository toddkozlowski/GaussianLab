import { describe, it, expect, vi } from 'vitest';
import { AppStore } from './Store';
import { createSourceComponent, createLensThinComponent } from './componentFactories';
import { DEFAULT_APP_STATE } from './defaultState';
import type { AppAction } from './reducer';

describe('AppStore', () => {
  it('initializes with the provided state', () => {
    const store = new AppStore(DEFAULT_APP_STATE);
    expect(store.getState()).toEqual(DEFAULT_APP_STATE);
  });

  it('dispatches an action and updates state', () => {
    const store = new AppStore(DEFAULT_APP_STATE);
    const lens = createLensThinComponent();

    const action: AppAction = {
      type: 'ADD_COMPONENT',
      payload: lens,
    };

    store.dispatch(action);
    const newState = store.getState();

    expect(newState.components[lens.id]).toEqual(lens);
    expect(newState).not.toBe(DEFAULT_APP_STATE); // State is immutable
  });

  it('notifies subscribers when state changes', () => {
    const store = new AppStore(DEFAULT_APP_STATE);
    const listener = vi.fn();

    store.subscribe(listener);

    const lens = createLensThinComponent();
    const action: AppAction = {
      type: 'ADD_COMPONENT',
      payload: lens,
    };

    store.dispatch(action);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(store.getState());
  });

  it('notifies multiple subscribers', () => {
    const store = new AppStore(DEFAULT_APP_STATE);
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    store.subscribe(listener1);
    store.subscribe(listener2);

    const lens = createLensThinComponent();
    const action: AppAction = {
      type: 'ADD_COMPONENT',
      payload: lens,
    };

    store.dispatch(action);
    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes when unsubscribe function is called', () => {
    const store = new AppStore(DEFAULT_APP_STATE);
    const listener = vi.fn();

    const unsubscribe = store.subscribe(listener);
    unsubscribe();

    const lens = createLensThinComponent();
    const action: AppAction = {
      type: 'ADD_COMPONENT',
      payload: lens,
    };

    store.dispatch(action);
    expect(listener).not.toHaveBeenCalled();
  });

  it('multiple dispatches notify subscribers each time', () => {
    const store = new AppStore(DEFAULT_APP_STATE);
    const listener = vi.fn();

    store.subscribe(listener);

    const lens1 = createLensThinComponent();
    const lens2 = createLensThinComponent();

    store.dispatch({ type: 'ADD_COMPONENT', payload: lens1 });
    expect(listener).toHaveBeenCalledTimes(1);

    store.dispatch({ type: 'ADD_COMPONENT', payload: lens2 });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('allows setting propagation engine after initialization', () => {
    const store = new AppStore(DEFAULT_APP_STATE);
    const engine = {
      propagateBeam: vi.fn().mockReturnValue({
        profile: [],
        waists: [],
        qAtComponent: {},
        qFinal: { re: 0, im: 1e-6 },
      }),
    };

    store.setPropagationEngine(engine);

    const source = createSourceComponent();
    source.position = { x: 100, y: 300 };
    source.direction = 'right';

    store.dispatch({
      type: 'ADD_COMPONENT',
      payload: source,
    });

    store.dispatch({
      type: 'SET_SOURCE_ID',
      payload: { sourceId: source.id },
    });

    // After setting source, propagation engine should be called
    expect(engine.propagateBeam).toHaveBeenCalled();
  });

  it('allows setting cavity solver after initialization', () => {
    const store = new AppStore(DEFAULT_APP_STATE);
    const solver = {
      solveEigenmode: vi.fn().mockReturnValue(null),
    };

    store.setCavitySolver(solver);

    const source = createSourceComponent();
    const cavity = {
      id: 'cavity-1',
      kind: 'cavity_fp' as const,
      position: { x: 300, y: 300 },
      locked: false,
      label: 'FP1',
      length: 100,
      r1: 100,
      r2: 100,
      direction: 'right' as const,
      eigenmode: null,
    };

    store.dispatch({
      type: 'ADD_COMPONENT',
      payload: source,
    });

    store.dispatch({
      type: 'SET_SOURCE_ID',
      payload: { sourceId: source.id },
    });

    store.dispatch({
      type: 'ADD_COMPONENT',
      payload: cavity,
    });

    // After setting source and adding cavity, solver should be called
    expect(solver.solveEigenmode).toHaveBeenCalled();
  });

  it('maintains store state across multiple subscribers', () => {
    const store = new AppStore(DEFAULT_APP_STATE);
    const states: typeof DEFAULT_APP_STATE[] = [];

    store.subscribe((state) => states.push(state));
    store.subscribe((state) => states.push(state));

    const lens = createLensThinComponent();
    store.dispatch({
      type: 'ADD_COMPONENT',
      payload: lens,
    });

    // Both subscribers should have received the same state
    expect(states).toHaveLength(2);
    expect(states[0]).toEqual(states[1]);
  });

  it('does not notify listeners if no action is dispatched', () => {
    const store = new AppStore(DEFAULT_APP_STATE);
    const listener = vi.fn();

    store.subscribe(listener);
    // No dispatch
    expect(listener).not.toHaveBeenCalled();
  });
});
