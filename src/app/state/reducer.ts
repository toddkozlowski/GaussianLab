/**
 * State Reducer
 *
 * Pure state transformation logic. No Layer 0 imports, no UI dependencies.
 * Handles component creation, deletion, updates, and configuration changes.
 *
 * This reducer is called before stateResolver, which recomputes derived fields.
 */

import type {
  AppState,
  OpticalComponent,
  SourceComponent,
  TableConfig,
  TargetMode,
  CardinalDirection,
  GridStandard,
} from './schema';

/**
 * All possible actions that can be dispatched to update AppState.
 */
export type AppAction =
  | { type: 'ADD_COMPONENT'; payload: OpticalComponent }
  | { type: 'REMOVE_COMPONENT'; payload: { id: string } }
  | { type: 'UPDATE_COMPONENT'; payload: { id: string; updates: Partial<OpticalComponent> } }
  | { type: 'SET_SOURCE_ID'; payload: { sourceId: string | null } }
  | { type: 'UPDATE_TABLE_CONFIG'; payload: Partial<TableConfig> }
  | { type: 'SET_TARGET_MODE'; payload: { targetMode: TargetMode | null } }
  | { type: 'SET_SELECTED_COMPONENT'; payload: { componentId: string | null } }
  | { type: 'LOCK_COMPONENT'; payload: { id: string; locked: boolean } }
  | { type: 'UPDATE_SOLVER_SOLUTIONS'; payload: any[] } // OptimiserSolution[]
  | { type: 'SET_SOLVER_STATUS'; payload: 'idle' | 'running' | 'solved' | 'failed' }
  | { type: 'SET_SOLVER_PREVIEW_INDEX'; payload: { index: number | null } }
  | { type: 'CLEAR_SOLVER_SNAPSHOT'; payload: {} }
  | { type: 'RESET_STATE' };

/**
 * Reduce an action into a new AppState.
 * Does NOT recompute derived state (beamPath, propagationResult).
 * That is handled by stateResolver.
 */
export function appStateReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'ADD_COMPONENT': {
      const component = action.payload;
      return {
        ...state,
        components: {
          ...state.components,
          [component.id]: component,
        },
      };
    }

    case 'REMOVE_COMPONENT': {
      const { id } = action.payload;
      const { [id]: removed, ...remaining } = state.components;

      // If the removed component was the source, clear sourceId
      let sourceId = state.sourceId;
      if (sourceId === id) {
        sourceId = null;
      }

      return {
        ...state,
        components: remaining,
        sourceId,
        selectedComponentId: state.selectedComponentId === id ? null : state.selectedComponentId,
      };
    }

    case 'UPDATE_COMPONENT': {
      const { id, updates } = action.payload;
      const component = state.components[id];
      if (!component) {
        return state; // Component not found; no change
      }

      // Safely merge updates while preserving type
      const updated = { ...component };
      for (const [key, value] of Object.entries(updates)) {
        (updated as any)[key] = value;
      }

      return {
        ...state,
        components: {
          ...state.components,
          [id]: updated,
        },
      };
    }

    case 'SET_SOURCE_ID': {
      const { sourceId } = action.payload;
      // Validate: if sourceId is set, it must refer to a source component
      if (sourceId && state.components[sourceId]?.kind !== 'source') {
        return state; // Invalid source; no change
      }
      return {
        ...state,
        sourceId,
      };
    }

    case 'UPDATE_TABLE_CONFIG': {
      const updates = action.payload;
      return {
        ...state,
        table: {
          ...state.table,
          ...updates,
        },
      };
    }

    case 'SET_TARGET_MODE': {
      const { targetMode } = action.payload;
      return {
        ...state,
        targetMode,
      };
    }

    case 'SET_SELECTED_COMPONENT': {
      const { componentId } = action.payload;
      return {
        ...state,
        selectedComponentId: componentId,
      };
    }

    case 'LOCK_COMPONENT': {
      const { id, locked } = action.payload;
      const component = state.components[id];
      if (!component) {
        return state;
      }

      return {
        ...state,
        components: {
          ...state.components,
          [id]: {
            ...component,
            locked,
          },
        },
      };
    }

    case 'UPDATE_SOLVER_SOLUTIONS': {
      return {
        ...state,
        optimiser: {
          ...state.optimiser,
          solutions: action.payload,
          previewedSolutionIndex: null, // Clear preview when new solutions arrive
        },
      };
    }

    case 'SET_SOLVER_STATUS': {
      return {
        ...state,
        optimiser: {
          ...state.optimiser,
          status: action.payload,
        },
      };
    }

    case 'SET_SOLVER_PREVIEW_INDEX': {
      const { index } = action.payload;
      return {
        ...state,
        optimiser: {
          ...state.optimiser,
          previewedSolutionIndex: index,
        },
      };
    }

    case 'CLEAR_SOLVER_SNAPSHOT': {
      return {
        ...state,
        optimiser: {
          ...state.optimiser,
          preRunSnapshot: null,
          snapshotValid: false,
        },
      };
    }

    case 'RESET_STATE': {
      // Return to a blank slate (user asked to reset the table)
      // This will be replaced with DEFAULT_APP_STATE import if needed
      return {
        ...state,
        components: {},
        sourceId: null,
        selectedComponentId: null,
        targetMode: null,
        optimiser: {
          status: 'idle',
          solutions: [],
          previewedSolutionIndex: null,
          preRunSnapshot: null,
          snapshotValid: false,
        },
      };
    }

    default:
      return state;
  }
}
