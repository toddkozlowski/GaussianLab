import { useEffect, useState } from 'react';
import type { AppAction } from '../state/reducer';
import { getGlobalStore } from '../state/Store';

/**
 * React adapter for the framework-agnostic AppStore.
 */
export function useAppStore() {
  const store = getGlobalStore();
  const [state, setState] = useState(() => store.getState());

  useEffect(() => {
    const unsubscribe = store.subscribe((newState) => {
      setState(newState);
    });
    return unsubscribe;
  }, [store]);

  return {
    state,
    dispatch: (action: AppAction) => store.dispatch(action),
    runSolver: (maxSolutions?: number) => store.runSolver(maxSolutions),
    previewSolution: (index: number) => store.previewSolution(index),
    applySolution: (index: number) => store.applySolution(index),
  };
}