import type { AppState, OptimiserSolution } from './schema';
import type { PropagationEngine } from './types/Layer0Interfaces';
import { optimizeGridSearch, optimizeNelderMead, defaultOptimizerConfig } from '../../math/optimizer';
import { resolveAppState } from './stateResolver';
import { computeLiveModeOverlap } from './modeMetrics';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function computeOverlapScore(state: AppState): number {
  return clamp01(computeLiveModeOverlap(state) ?? 0);
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

  const objective = (axisValues: number[]) => computeOverlapScore(buildTrialState(axisValues));

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