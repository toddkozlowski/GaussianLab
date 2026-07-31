import type { AppState, OptimiserSolution } from './schema';
import type { PropagationEngine } from './types/Layer0Interfaces';
import { optimizeGridSearch, optimizeNelderMead, defaultOptimizerConfig } from '../../math/optimizer';
import { resolveAppState } from './stateResolver';
import { computeLiveModeOverlap } from './modeMetrics';
import { getComponentPathPosition } from './pathUtils';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function computeOverlapScore(state: AppState): number {
  return clamp01(computeLiveModeOverlap(state) ?? 0);
}

/**
 * A candidate lens position only counts as a valid mode-matching solution if:
 *  - it stays on the beam path with a non-negative path position. The ray
 *    tracer never captures a component "behind" the segment it would need to
 *    intercept (distance <= 0), so a lens dragged upstream of the source
 *    simply falls off the path - that IS what z < 0 looks like here.
 *  - it doesn't land inside any cavity's mirror span (strictly between M1
 *    and M2), since a lens can't physically sit inside a resonator.
 */
function isLensPlacementValid(state: AppState, lensId: string): boolean {
  const lensZ = getComponentPathPosition(state.sourceId, state.beamPath, lensId);
  if (lensZ === null || lensZ < 0) {
    return false;
  }

  for (const component of Object.values(state.components)) {
    if (component.kind !== 'cavity_fp') {
      continue;
    }
    const m1Z = getComponentPathPosition(state.sourceId, state.beamPath, component.id);
    if (m1Z === null) {
      continue; // cavity isn't on the path; nothing to restrict against
    }
    const m2Z = m1Z + component.length;
    if (lensZ > m1Z && lensZ < m2Z) {
      return false;
    }
  }

  return true;
}

function allLensPlacementsValid(state: AppState, lensIds: string[]): boolean {
  return lensIds.every((id) => isLensPlacementValid(state, id));
}

export function runModeMatchSolver(
  state: AppState,
  propagationEngine: PropagationEngine,
  maxSolutions: number = 5,
): OptimiserSolution[] {
  const movableLenses = Object.values(state.components).filter(
    (c) => c.kind === 'lens_thin' && c.optimiserCanMove && !c.locked,
  );

  if (!state.targetMode || movableLenses.length === 0) {
    return [];
  }

  // Determine the beam axis for each lens: x for horizontal segments, y for vertical.
  // We look for the segment the lens currently terminates, or fall back to the first segment.
  const lensAxes = movableLenses.map((lens) => {
    const seg =
      state.beamPath?.segments.find((s) => s.terminatedByComponentId === lens.id) ??
      state.beamPath?.segments[0];
    const dir = seg?.direction;
    return dir === 'up' || dir === 'down' ? 'y' : 'x';
  });

  const bounds: Array<[number, number]> = movableLenses.map((lens, i) => {
    const axis = lensAxes[i] as 'x' | 'y';
    const current = lens.position[axis];
    const span = 200;
    const tableMax = axis === 'x' ? state.table.width : state.table.height;
    const lo = Math.max(0, current - span);
    const hi = Math.min(tableMax, current + span);
    return [lo, Math.max(lo + 1, hi)];
  });

  const buildTrialState = (axisValues: number[]): AppState => {
    const components = { ...state.components };
    movableLenses.forEach((lens, i) => {
      const axis = lensAxes[i] as 'x' | 'y';
      components[lens.id] = {
        ...lens,
        position: { ...lens.position, [axis]: axisValues[i] },
      };
    });
    return resolveAppState({ ...state, components }, propagationEngine);
  };

  const lensIds = movableLenses.map((lens) => lens.id);
  const objective = (axisValues: number[]) => {
    const trialState = buildTrialState(axisValues);
    if (!allLensPlacementsValid(trialState, lensIds)) {
      return 0;
    }
    return computeOverlapScore(trialState);
  };

  // Stage 1: coarse grid search to find candidate regions (25 pts/dim for 1 lens, 15 for 2+).
  const gridPts = movableLenses.length === 1 ? 25 : 15;
  const gridCandidates = optimizeGridSearch(objective, bounds, gridPts, maxSolutions * 2);

  // Stage 2: refine each grid candidate with Nelder-Mead.
  const refined: Array<{ params: number[]; value: number }> = [];
  const nmConfig = { ...defaultOptimizerConfig, maxIterations: 600, tolerance: 1e-7 };
  for (const candidate of gridCandidates) {
    const sol = optimizeNelderMead(objective, candidate.parameters, bounds, nmConfig, 1);
    if (sol.length > 0) {
      refined.push({ params: sol[0].parameters, value: sol[0].objectiveValue });
    }
  }

  // De-duplicate solutions that converged to the same position (within 2 mm).
  const unique: typeof refined = [];
  for (const sol of refined.sort((a, b) => b.value - a.value)) {
    const isDuplicate = unique.some((u) =>
      u.params.every((v, i) => Math.abs(v - sol.params[i]) < 2),
    );
    if (!isDuplicate) unique.push(sol);
    if (unique.length >= maxSolutions) break;
  }

  const topSolutions = unique.length > 0 ? unique : gridCandidates.slice(0, maxSolutions).map((c) => ({
    params: c.parameters,
    value: c.objectiveValue,
  }));

  return topSolutions.map((sol, index) => {
    const lensPositions: Record<string, { x: number; y: number }> = {};
    movableLenses.forEach((lens, i) => {
      const axis = lensAxes[i] as 'x' | 'y';
      lensPositions[lens.id] = { ...lens.position, [axis]: sol.params[i] };
    });

    const overlap = clamp01(sol.value);
    return {
      id: `solution-${index + 1}`,
      lensPositions,
      overlap,
      summary: `Overlap ${(overlap * 100).toFixed(1)}% — ${movableLenses.length} lens`,
    };
  });
}