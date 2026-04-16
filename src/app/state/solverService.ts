import type { AppState, OptimiserSolution } from './schema';
import type { PropagationEngine } from './types/Layer0Interfaces';
import { optimizeGridSearch } from '../../math/optimizer';
import { calculateModeOverlapAtWaists } from '../../math/overlap';
import { resolveAppState } from './stateResolver';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function nearestProfileWidth(state: AppState, zMm: number): number | null {
  const profile = state.propagationResult?.profile;
  if (!profile || profile.length === 0) {
    return null;
  }

  let nearest = profile[0];
  let nearestDistance = Math.abs(nearest.z - zMm);

  for (let i = 1; i < profile.length; i += 1) {
    const point = profile[i];
    const distance = Math.abs(point.z - zMm);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = point;
    }
  }

  return nearest.w;
}

function computeOverlapScore(state: AppState): number {
  if (!state.targetMode || !state.propagationResult) {
    return 0;
  }

  if (state.targetMode.kind === 'manual') {
    const beamW = nearestProfileWidth(state, state.targetMode.waistZ);
    if (beamW === null) {
      return 0;
    }
    return clamp01(calculateModeOverlapAtWaists(Math.max(0.05, beamW), Math.max(0.05, state.targetMode.waistRadius)));
  }

  const cavity = state.components[state.targetMode.cavityComponentId];
  if (!cavity || cavity.kind !== 'cavity_fp' || !cavity.eigenmode) {
    return 0;
  }

  const z = state.beamPath?.segments.find((segment) => segment.terminatedByComponentId === cavity.id)?.zEnd;
  if (z === undefined) {
    return 0;
  }

  const beamW = nearestProfileWidth(state, z);
  if (beamW === null) {
    return 0;
  }

  return clamp01(calculateModeOverlapAtWaists(Math.max(0.05, beamW), Math.max(0.05, cavity.eigenmode.waistRadius)));
}

export function runModeMatchSolver(
  state: AppState,
  propagationEngine: PropagationEngine,
  maxSolutions: number = 5
): OptimiserSolution[] {
  const movableLenses = Object.values(state.components).filter(
    (component) => component.kind === 'lens_thin' && component.optimiserCanMove && !component.locked
  );

  if (!state.targetMode || movableLenses.length === 0) {
    return [];
  }

  const bounds: Array<[number, number]> = movableLenses.map((lens) => {
    const span = 150;
    const minX = Math.max(0, lens.position.x - span);
    const maxX = Math.min(state.table.width, lens.position.x + span);
    return [minX, Math.max(minX + 1, maxX)];
  });

  const objective = (xPositions: number[]) => {
    let trialState: AppState = {
      ...state,
      components: { ...state.components },
    };

    movableLenses.forEach((lens, index) => {
      trialState.components[lens.id] = {
        ...lens,
        position: {
          x: xPositions[index],
          y: lens.position.y,
        },
      };
    });

    trialState = resolveAppState(trialState, propagationEngine);
    return computeOverlapScore(trialState);
  };

  const rawSolutions = optimizeGridSearch(objective, bounds, 7, maxSolutions);

  return rawSolutions.map((solution, index) => {
    const lensPositions: Record<string, { x: number; y: number }> = {};
    movableLenses.forEach((lens, lensIndex) => {
      lensPositions[lens.id] = {
        x: solution.parameters[lensIndex],
        y: lens.position.y,
      };
    });

    const overlap = clamp01(solution.objectiveValue);
    return {
      id: `solution-${index + 1}`,
      lensPositions,
      overlap,
      summary: `Overlap ${(overlap * 100).toFixed(1)}% using ${movableLenses.length} movable lens/lenses`,
    };
  });
}