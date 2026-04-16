/**
 * Application Store (State Machine)
 *
 * Combines reducer + resolver into a single pub/sub store.
 * All state mutations flow through dispatch():
 *   1. Reducer transforms state
 *   2. Resolver recomputes derived state
 *   3. Subscribers are notified
 *
 * This is the single source of truth that all UI layers (Layer 2-5) use.
 */

import type { AppState } from './schema';
import type { AppAction } from './reducer';
import { appStateReducer } from './reducer';
import { resolveAppState } from './stateResolver';
import type { PropagationEngine, CavitySolver } from './types/Layer0Interfaces';
import { runModeMatchSolver } from './solverService';

export type StateListener = (state: AppState) => void;

/**
 * AppStore — the central state machine.
 *
 * All components should dispatch actions through this store, not mutate state directly.
 * The store auto-recomputes derived state and notifies all subscribers.
 */
export class AppStore {
  private state: AppState;
  private listeners: Set<StateListener> = new Set();
  private propagationEngine?: PropagationEngine;
  private cavitySolver?: CavitySolver;

  constructor(
    initialState: AppState,
    propagationEngine?: PropagationEngine,
    cavitySolver?: CavitySolver
  ) {
    this.propagationEngine = propagationEngine;
    this.cavitySolver = cavitySolver;
    this.state = resolveAppState(initialState, this.propagationEngine, this.cavitySolver);
  }

  /**
   * Dispatch an action to transform the state.
   * This is the only way to mutate state (besides initialization).
   */
  dispatch(action: AppAction): void {
    // Step 1: Apply reducer
    let newState = appStateReducer(this.state, action);

    // Step 2: Resolve derived state
    newState = resolveAppState(newState, this.propagationEngine, this.cavitySolver);

    // Step 3: Update internal state
    this.state = newState;

    // Step 4: Notify all subscribers
    this.notifyListeners();
  }

  /**
   * Get the current application state.
   */
  getState(): AppState {
    return this.state;
  }

  /**
   * Subscribe to state changes.
   * Returns an unsubscribe function.
   */
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Set the propagation engine (used when Layer 0 becomes available).
   */
  setPropagationEngine(engine: PropagationEngine): void {
    this.propagationEngine = engine;
  }

  /**
   * Set the cavity solver (used when Layer 0 becomes available).
   */
  setCavitySolver(solver: CavitySolver): void {
    this.cavitySolver = solver;
  }

  /**
   * Run mode-matching optimizer using the current state.
   */
  runSolver(maxSolutions: number = 5): void {
    this.dispatch({ type: 'SET_SOLVER_STATUS', payload: 'running' });

    try {
      if (!this.propagationEngine) {
        throw new Error('Propagation engine is not configured');
      }

      const solutions = runModeMatchSolver(this.state, this.propagationEngine, maxSolutions);
      this.dispatch({ type: 'UPDATE_SOLVER_SOLUTIONS', payload: solutions });
      this.dispatch({ type: 'SET_SOLVER_STATUS', payload: solutions.length > 0 ? 'solved' : 'failed' });
    } catch {
      this.dispatch({ type: 'UPDATE_SOLVER_SOLUTIONS', payload: [] });
      this.dispatch({ type: 'SET_SOLVER_STATUS', payload: 'failed' });
    }
  }

  /**
   * Preview one optimizer solution by applying its lens positions.
   */
  previewSolution(index: number): void {
    const solution = this.state.optimiser.solutions[index];
    if (!solution) {
      return;
    }

    this.dispatch({ type: 'SET_SOLVER_PREVIEW_INDEX', payload: { index } });
    Object.entries(solution.lensPositions).forEach(([id, position]) => {
      this.dispatch({ type: 'UPDATE_COMPONENT', payload: { id, updates: { position } } });
    });
  }

  /**
   * Apply one optimizer solution and clear preview index.
   */
  applySolution(index: number): void {
    const solution = this.state.optimiser.solutions[index];
    if (!solution) {
      return;
    }

    Object.entries(solution.lensPositions).forEach(([id, position]) => {
      this.dispatch({ type: 'UPDATE_COMPONENT', payload: { id, updates: { position } } });
    });
    this.dispatch({ type: 'SET_SOLVER_PREVIEW_INDEX', payload: { index: null } });
  }

  /**
   * Notify all listeners of state change.
   */
  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

// Global store instance
let globalStore: AppStore | null = null;

/**
 * Initialize the global store. Should be called once during app startup.
 */
export function initializeStore(
  initialState: AppState,
  propagationEngine?: PropagationEngine,
  cavitySolver?: CavitySolver
): AppStore {
  globalStore = new AppStore(initialState, propagationEngine, cavitySolver);
  return globalStore;
}

/**
 * Get or initialize the global store.
 */
export function getGlobalStore(): AppStore {
  if (!globalStore) {
    throw new Error('Store not initialized. Call initializeStore() first.');
  }
  return globalStore;
}
