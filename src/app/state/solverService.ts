import type { AppState, LensThinComponent, ManualAdjustmentRange, OptimiserSolution } from './schema';
import type { PropagationEngine } from './types/Layer0Interfaces';
import { optimizeGridSearch, optimizeNelderMead, defaultOptimizerConfig } from '../../math/optimizer';
import { resolveAppState } from './stateResolver';
import { computeLiveModeOverlap } from './modeMetrics';
import {
  computeDangerousPairs,
  DANGEROUS_PROXIMITY_THRESHOLD_MM,
  getComponentMovementAxis,
  getComponentPathPosition,
  resolveZRangeExtents,
} from './pathUtils';

/**
 * Hard cap on how many lenses the optimizer will consider at once. Each
 * additional lens multiplies the coarse grid search combinatorially (see
 * gridPts below), so beyond this it risks becoming slow enough to time out
 * a browser tab - the UI refuses to run the optimizer past this point and
 * tells the user to lock the lenses they don't want included.
 */
export const MAX_OPTIMIZER_LENSES = 3;

/** Lenses eligible for the optimizer: movable and not locked out of it. */
export function getMovableLenses(state: AppState): LensThinComponent[] {
  return Object.values(state.components).filter(
    (component): component is LensThinComponent =>
      component.kind === 'lens_thin' && component.optimiserCanMove && !component.locked,
  );
}

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
 *  - it doesn't land inside any custom object's physical thickness (strictly
 *    between its front and back face), since a lens can't physically sit
 *    inside a solid slab.
 */
function isLensPlacementValid(state: AppState, lensId: string): boolean {
  const lensZ = getComponentPathPosition(state.sourceId, state.beamPath, lensId);
  if (lensZ === null || lensZ < 0) {
    return false;
  }

  for (const component of Object.values(state.components)) {
    if (component.kind === 'cavity_fp') {
      const m1Z = getComponentPathPosition(state.sourceId, state.beamPath, component.id);
      if (m1Z === null) {
        continue; // cavity isn't on the path; nothing to restrict against
      }
      const m2Z = m1Z + component.length;
      if (lensZ > m1Z && lensZ < m2Z) {
        return false;
      }
    }

    if (component.kind === 'custom_object') {
      const frontZ = getComponentPathPosition(state.sourceId, state.beamPath, component.id);
      if (frontZ === null) {
        continue; // object isn't on the path; nothing to restrict against
      }
      const backZ = frontZ + component.thickness;
      if (lensZ > frontZ && lensZ < backZ) {
        return false;
      }
    }
  }

  return true;
}

function allLensPlacementsValid(state: AppState, lensIds: string[]): boolean {
  return lensIds.every((id) => isLensPlacementValid(state, id));
}

/**
 * True if moving a lens to this trial position would trigger the same
 * "too close" proximity warning the UI flags elsewhere - i.e. it's within
 * DANGEROUS_PROXIMITY_THRESHOLD_MM of some other component. Only pairs
 * involving a movable lens matter here: the other components don't move
 * during optimization, so any collision between them is unaffected by the
 * candidate lens positions being evaluated.
 */
function hasLensCollision(state: AppState, lensIds: string[]): boolean {
  const dangerousPairs = computeDangerousPairs(
    state.components,
    state.sourceId,
    state.beamPath,
    DANGEROUS_PROXIMITY_THRESHOLD_MM,
  );
  return dangerousPairs.some((pair) => lensIds.includes(pair.aId) || lensIds.includes(pair.bId));
}

/** True if a lens's current beam-path z falls inside any of the given manual ranges. */
function isWithinManualRanges(state: AppState, lensId: string, ranges: ManualAdjustmentRange[]): boolean {
  const lensZ = getComponentPathPosition(state.sourceId, state.beamPath, lensId);
  if (lensZ === null) {
    return false;
  }
  return ranges.some((range) => {
    const lo = Math.min(range.startZMm, range.endZMm);
    const hi = Math.max(range.startZMm, range.endZMm);
    return lensZ >= lo && lensZ <= hi;
  });
}

/**
 * Search bounds (in the lens's own x/y axis) implied by the manual ranges,
 * restricted to whichever segment the lens currently sits on - a range that
 * bends around a mirror only constrains a given lens along the one segment
 * it's actually on. Returns null if none of the ranges reach that segment at
 * all, meaning this lens has nowhere legal to move to.
 */
function manualRangeBoundsForLens(
  state: AppState,
  lensId: string,
  axis: 'x' | 'y',
  ranges: ManualAdjustmentRange[],
): [number, number] | null {
  const segment =
    state.beamPath?.segments.find((s) => s.terminatedByComponentId === lensId) ?? state.beamPath?.segments[0];
  if (!segment) {
    return null;
  }

  let lo = Infinity;
  let hi = -Infinity;
  for (const range of ranges) {
    for (const extent of resolveZRangeExtents(state.beamPath, range.startZMm, range.endZMm)) {
      if (extent.segment !== segment) {
        continue;
      }
      lo = Math.min(lo, extent.pointA[axis], extent.pointB[axis]);
      hi = Math.max(hi, extent.pointA[axis], extent.pointB[axis]);
    }
  }

  return Number.isFinite(lo) && Number.isFinite(hi) && hi > lo ? [lo, hi] : null;
}

/**
 * The full physical stretch a lens can occupy without manual ranges: its own
 * beam-path segment, extended through any adjacent segments that share the
 * same direction. Lenses (and other non-redirecting components) don't bend
 * the path, so a run of same-direction segments is one straight corridor -
 * e.g. from the source all the way to the first mirror or cavity - and a
 * lens's *current* position (which is where its own segment happens to end)
 * shouldn't cap how far it can be searched within that corridor.
 */
function collinearRegionBoundsForLens(state: AppState, lensId: string, axis: 'x' | 'y'): [number, number] | null {
  const segments = state.beamPath?.segments;
  if (!segments || segments.length === 0) {
    return null;
  }

  const found = segments.findIndex((s) => s.terminatedByComponentId === lensId);
  const index = found >= 0 ? found : 0;
  const direction = segments[index].direction;

  let lo = index;
  while (lo > 0 && segments[lo - 1].direction === direction) {
    lo -= 1;
  }
  let hi = index;
  while (hi < segments.length - 1 && segments[hi + 1].direction === direction) {
    hi += 1;
  }

  const start = segments[lo].start[axis];
  const end = segments[hi].end[axis];
  const min = Math.min(start, end);
  const max = Math.max(start, end);
  return max > min ? [min, max] : null;
}

type Candidate = { params: number[]; value: number };

// The search window is only +/-SEARCH_SPAN wide around its center. If the true
// optimum lies further away than that, one pass can only walk partway there -
// which is why clicking "optimize" a second time (starting from the first
// pass's result) used to find a noticeably better solution. Instead, run a
// few passes internally, re-centering the window on the best result each
// time, so the window "walks" toward the optimum in a single call. Extra
// passes only run when the previous one hasn't already converged, so
// well-behaved cases (the common case) still cost a single pass.
const SEARCH_SPAN = 200;
const MAX_OPTIMIZER_PASSES = 3;
const PASS_IMPROVEMENT_EPSILON = 0.0025; // stop re-centering once a pass buys < 0.25% overlap
const NEAR_PERFECT_OVERLAP = 0.999;

export function runModeMatchSolver(
  state: AppState,
  propagationEngine: PropagationEngine,
  maxSolutions: number = 5,
): OptimiserSolution[] {
  const movableLenses = getMovableLenses(state);

  if (!state.targetMode || movableLenses.length === 0 || movableLenses.length > MAX_OPTIMIZER_LENSES) {
    return [];
  }

  // Determine the beam axis for each lens: x for horizontal segments, y for vertical.
  const lensAxes = movableLenses.map((lens) => getComponentMovementAxis(state, lens.id));

  const manualRanges = state.optimiser.manualRangesEnabled ? state.optimiser.manualRanges : [];
  const useManualRanges = manualRanges.length > 0;

  // When manual ranges are given, they ARE the search window - fixed and
  // explicit, not a heuristic to re-center over multiple passes. A lens
  // whose current segment isn't reached by any range has no legal window at
  // all; pin it to its current position so it simply can't move, rather than
  // silently falling back to the default search.
  //
  // Otherwise, pass 0 always casts as wide as physically possible - the
  // lens's whole collinear region (collinearRegionBoundsForLens) - so
  // configurations requiring a large move (including two lenses swapping
  // relative order) are reachable from the first grid search rather than
  // only by manually repositioning first. Later passes narrow to a local
  // +/-SEARCH_SPAN window around the best result so far, for fine
  // refinement, still clamped inside that same region.
  const buildBounds = (centerParams: number[], pass: number): Array<[number, number]> =>
    movableLenses.map((lens, i) => {
      const axis = lensAxes[i] as 'x' | 'y';
      if (useManualRanges) {
        return manualRangeBoundsForLens(state, lens.id, axis, manualRanges) ?? [lens.position[axis], lens.position[axis]];
      }

      const regionBounds = collinearRegionBoundsForLens(state, lens.id, axis);
      if (pass === 0 && regionBounds) {
        return regionBounds;
      }

      const tableMax = axis === 'x' ? state.table.width : state.table.height;
      const [regionLo, regionHi] = regionBounds ?? [0, tableMax];
      const lo = Math.max(regionLo, centerParams[i] - SEARCH_SPAN);
      const hi = Math.min(regionHi, centerParams[i] + SEARCH_SPAN);
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
  const avoidCollisions = state.optimiser.avoidCollisions;
  const objective = (axisValues: number[]) => {
    const trialState = buildTrialState(axisValues);
    if (!allLensPlacementsValid(trialState, lensIds)) {
      return 0;
    }
    if (avoidCollisions && hasLensCollision(trialState, lensIds)) {
      return 0;
    }
    if (useManualRanges && !lensIds.every((id) => isWithinManualRanges(trialState, id, manualRanges))) {
      return 0;
    }
    return computeOverlapScore(trialState);
  };

  // A hard, score-independent legality check. objective() above returns 0 for
  // both an invalid placement (e.g. a lens landed inside a cavity span) and a
  // valid one that genuinely achieves ~0% overlap - those are indistinguishable
  // by score alone. Without this, an invalid candidate could tie a valid one
  // at score 0 and get reported as a "solution". This is applied as a final
  // filter on candidates, never inside the search itself.
  const isValidPlacement = (axisValues: number[]): boolean => {
    const trialState = buildTrialState(axisValues);
    if (!allLensPlacementsValid(trialState, lensIds)) {
      return false;
    }
    if (avoidCollisions && hasLensCollision(trialState, lensIds)) {
      return false;
    }
    return !useManualRanges || lensIds.every((id) => isWithinManualRanges(trialState, id, manualRanges));
  };

  // De-duplicate solutions that converged to the same position (within 2 mm)
  // and return the best `maxSolutions` of them, sorted descending.
  const dedupe = (candidates: Candidate[]): Candidate[] => {
    const unique: Candidate[] = [];
    for (const sol of [...candidates].sort((a, b) => b.value - a.value)) {
      const isDuplicate = unique.some((u) =>
        u.params.every((v, i) => Math.abs(v - sol.params[i]) < 2),
      );
      if (!isDuplicate) unique.push(sol);
      if (unique.length >= maxSolutions) break;
    }
    return unique;
  };

  const gridPts = movableLenses.length === 1 ? 25 : 15;
  const nmConfig = { ...defaultOptimizerConfig, maxIterations: 600, tolerance: 1e-7 };

  let centerParams = movableLenses.map((lens, i) => lens.position[lensAxes[i] as 'x' | 'y']);
  const allCandidates: Candidate[] = [];
  let bestValue = -Infinity;

  // Manual ranges make buildBounds ignore centerParams entirely (the window
  // is fixed), so re-centering across passes would just re-run the same
  // search - one pass is all that can ever help.
  const passLimit = useManualRanges ? 1 : MAX_OPTIMIZER_PASSES;

  for (let pass = 0; pass < passLimit; pass++) {
    const bounds = buildBounds(centerParams, pass);

    // Stage 1: coarse grid search to find candidate regions.
    const gridCandidates = optimizeGridSearch(objective, bounds, gridPts, maxSolutions * 2);

    // Stage 2: refine each grid candidate with Nelder-Mead. Nelder-Mead can
    // wander into (and settle in) an invalid region while exploring - that's
    // fine mid-search, but its final result must pass the hard legality
    // check before it's allowed into the candidate pool.
    const refined: Candidate[] = [];
    for (const candidate of gridCandidates) {
      const sol = optimizeNelderMead(objective, candidate.parameters, bounds, nmConfig, 1);
      if (sol.length > 0 && isValidPlacement(sol[0].parameters)) {
        refined.push({ params: sol[0].parameters, value: sol[0].objectiveValue });
      }
    }

    const validGridCandidates = gridCandidates.filter((c) => isValidPlacement(c.parameters));

    allCandidates.push(
      ...(refined.length > 0
        ? refined
        : validGridCandidates.map((c) => ({ params: c.parameters, value: c.objectiveValue }))),
    );

    const passBest = dedupe(allCandidates)[0];
    if (!passBest) {
      // Nothing legal found in this window (or any prior one) - no point
      // recentering on a result that doesn't exist.
      break;
    }

    if (passBest.value < bestValue + PASS_IMPROVEMENT_EPSILON || passBest.value >= NEAR_PERFECT_OVERLAP) {
      break;
    }

    bestValue = passBest.value;
    centerParams = passBest.params;
  }

  const topSolutions = dedupe(allCandidates);

  const solutions = topSolutions.map((sol, index) => {
    const lensPositions: Record<string, { x: number; y: number }> = {};
    movableLenses.forEach((lens, i) => {
      const axis = lensAxes[i] as 'x' | 'y';
      lensPositions[lens.id] = { ...lens.position, [axis]: sol.params[i] };
    });

    const overlap = clamp01(sol.value);

    // Resolve the trial state once more at this solution's exact positions
    // to read off each lens's position-sensitivity there (attachLensSensitivities
    // runs as part of resolveAppState/buildTrialState), then keep the worst
    // (highest) of them as this solution's headline figure.
    const trialState = buildTrialState(sol.params);
    let maxLensSensitivity: number | null = null;
    for (const lens of movableLenses) {
      const resolvedLens = trialState.components[lens.id];
      const value = resolvedLens?.kind === 'lens_thin' ? resolvedLens.sensitivity : null;
      if (value !== null && (maxLensSensitivity === null || value > maxLensSensitivity)) {
        maxLensSensitivity = value;
      }
    }

    return {
      id: `solution-${index + 1}`,
      lensPositions,
      overlap,
      maxLensSensitivity,
      summary: `Overlap ${(overlap * 100).toFixed(1)}% — ${movableLenses.length} lens`,
    };
  });

  return rankSolutions(solutions);
}

/**
 * Solutions come in already sorted by descending overlap (from dedupe()
 * above). Within the leading run that all read as 100.0% overlap once
 * rounded to the precision shown in the UI, re-rank by ascending
 * position-sensitivity - the flattest (most robust) alignment first -
 * rather than leaving that tie broken by whatever order the search happened
 * to find them in. Solutions below 100% keep their existing relative order.
 */
export function rankSolutions(solutions: OptimiserSolution[]): OptimiserSolution[] {
  const isPerfectOverlap = (solution: OptimiserSolution) => (solution.overlap * 100).toFixed(1) === '100.0';
  const perfect = solutions.filter(isPerfectOverlap);
  const rest = solutions.filter((solution) => !isPerfectOverlap(solution));
  perfect.sort((a, b) => {
    if (a.maxLensSensitivity === null) return b.maxLensSensitivity === null ? 0 : 1;
    if (b.maxLensSensitivity === null) return -1;
    return a.maxLensSensitivity - b.maxLensSensitivity;
  });

  return [...perfect, ...rest];
}