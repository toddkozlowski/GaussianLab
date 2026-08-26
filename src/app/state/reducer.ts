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
  WaistFitResult,
} from './schema';
import { DEFAULT_OPTIMISER_STATE, DEFAULT_WAIST_FIT_STATE } from './defaultState';

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
  | { type: 'SET_AVOID_COLLISIONS'; payload: { avoidCollisions: boolean } }
  | { type: 'SET_MANUAL_RANGES_ENABLED'; payload: { enabled: boolean } }
  | { type: 'ADD_MANUAL_RANGE'; payload: {} }
  | { type: 'UPDATE_MANUAL_RANGE'; payload: { id: string; updates: Partial<{ startZMm: number; endZMm: number }> } }
  | { type: 'REMOVE_MANUAL_RANGE'; payload: { id: string } }
  | { type: 'CLEAR_SOLVER_SNAPSHOT'; payload: {} }
  | {
      type: 'UPDATE_WAIST_FIT_POINT';
      payload: { id: string; updates: Partial<{ zMm: number | null; waistRadiusMm: number | null }> };
    }
  | { type: 'SET_WAIST_FIT_SHOW_ON_PATH'; payload: { show: boolean } }
  | { type: 'SET_WAIST_FIT_RESULT'; payload: { result: WaistFitResult | null } }
  | { type: 'RESET_STATE' }
  | { type: 'LOAD_STATE'; payload: AppState };

function createDefaultManualRange(): { id: string; startZMm: number; endZMm: number } {
  return { id: `manual-range-${crypto.randomUUID()}`, startZMm: 0, endZMm: 100 };
}

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

      // Only one beam source is supported at a time for now, so the
      // starting source can't be deleted - there would be nothing left to
      // build a beam path from. Revisit once multi-source support lands.
      if (state.components[id]?.kind === 'source') {
        return state;
      }

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

    case 'SET_AVOID_COLLISIONS': {
      const { avoidCollisions } = action.payload;
      return {
        ...state,
        optimiser: {
          ...state.optimiser,
          avoidCollisions,
        },
      };
    }

    case 'SET_MANUAL_RANGES_ENABLED': {
      const { enabled } = action.payload;
      // Surface one empty range as soon as the toggle is switched on, rather
      // than requiring an extra click on "+" before there's anything to edit.
      const manualRanges =
        enabled && state.optimiser.manualRanges.length === 0
          ? [createDefaultManualRange()]
          : state.optimiser.manualRanges;
      return {
        ...state,
        optimiser: {
          ...state.optimiser,
          manualRangesEnabled: enabled,
          manualRanges,
        },
      };
    }

    case 'ADD_MANUAL_RANGE': {
      return {
        ...state,
        optimiser: {
          ...state.optimiser,
          manualRanges: [...state.optimiser.manualRanges, createDefaultManualRange()],
        },
      };
    }

    case 'UPDATE_MANUAL_RANGE': {
      const { id, updates } = action.payload;
      return {
        ...state,
        optimiser: {
          ...state.optimiser,
          manualRanges: state.optimiser.manualRanges.map((range) =>
            range.id === id ? { ...range, ...updates } : range,
          ),
        },
      };
    }

    case 'REMOVE_MANUAL_RANGE': {
      const { id } = action.payload;
      return {
        ...state,
        optimiser: {
          ...state.optimiser,
          manualRanges: state.optimiser.manualRanges.filter((range) => range.id !== id),
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

    case 'UPDATE_WAIST_FIT_POINT': {
      const { id, updates } = action.payload;
      const index = state.waistFit.points.findIndex((point) => point.id === id);
      if (index < 0) {
        return state;
      }

      const updatedPoint = { ...state.waistFit.points[index], ...updates };
      let points = state.waistFit.points.map((point, i) => (i === index ? updatedPoint : point));

      // Once the last row gets any value, append a fresh blank row beneath
      // it - a spreadsheet-style auto-growing list, so there's always room
      // to keep entering more samples without an explicit "add row" click.
      const isLastRow = index === points.length - 1;
      const hasAnyValue = updatedPoint.zMm !== null || updatedPoint.waistRadiusMm !== null;
      if (isLastRow && hasAnyValue) {
        points = [...points, { id: `waist-fit-row-${crypto.randomUUID()}`, zMm: null, waistRadiusMm: null }];
      }

      return {
        ...state,
        waistFit: {
          ...state.waistFit,
          points,
          result: null, // any point edit invalidates a previously computed fit
        },
      };
    }

    case 'SET_WAIST_FIT_SHOW_ON_PATH': {
      return {
        ...state,
        waistFit: {
          ...state.waistFit,
          showOnBeamPath: action.payload.show,
        },
      };
    }

    case 'SET_WAIST_FIT_RESULT': {
      return {
        ...state,
        waistFit: {
          ...state.waistFit,
          result: action.payload.result,
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
        optimiser: DEFAULT_OPTIMISER_STATE,
        waistFit: DEFAULT_WAIST_FIT_STATE,
      };
    }

    case 'LOAD_STATE': {
      // Wholesale replace state with a loaded table (e.g. from a .gaussian
      // file). Derived fields (beamPath, propagationResult, eigenmodes) get
      // recomputed by stateResolver right after this, same as any dispatch.
      return action.payload;
    }

    default:
      return state;
  }
}
