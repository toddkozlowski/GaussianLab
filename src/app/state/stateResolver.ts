/**
 * State Resolver / Orchestrator
 *
 * After the reducer produces a new state, this layer recomputes all derived state:
 * - Beam path (using beamPathResolver, pure geometry)
 * - Propagation result (calling Layer 0 if available)
 * - Cavity eigenmode (calling Layer 0 if available)
 *
 * This layer decouples state mutations (reducer) from side effects (physics calls).
 */

import type {
  AppState,
  BeamPath,
  PropagationResult,
  CavityFPComponent,
  LensThinComponent,
  CavityEigenmode,
} from './schema';
import { resolveBeamPath } from './beamPathResolver';
import type { PropagationEngine, CavitySolver } from './types/Layer0Interfaces';
import { getComponentMovementAxis } from './pathUtils';
import { computeLiveModeOverlap } from './modeMetrics';

/**
 * Resolve all derived state in an AppState.
 * Call this after every reducer dispatch.
 *
 * @param state The state from the reducer
 * @param propagationEngine Optional Layer 0 propagation function; if undefined, PropagationResult = null
 * @param cavitySolver Optional Layer 0 cavity solver; if undefined, cavities have null eigenmode
 * @returns Updated state with beamPath, propagationResult and per-lens sensitivity filled
 */
export function resolveAppState(
  state: AppState,
  propagationEngine?: PropagationEngine,
  cavitySolver?: CavitySolver
): AppState {
  const resolved = resolveCoreState(state, propagationEngine, cavitySolver);
  return {
    ...resolved,
    components: attachLensSensitivities(resolved, propagationEngine),
  };
}

/**
 * Beam path + propagation + cavity eigenmodes only - the part of resolution
 * that's safe to call again on a perturbed trial state (e.g. from
 * attachLensSensitivities below) without recursing into sensitivity
 * computation itself.
 */
function resolveCoreState(
  state: AppState,
  propagationEngine?: PropagationEngine,
  cavitySolver?: CavitySolver
): AppState {
  // Step 1: Recompute beam path (pure geometry)
  const beamPath = resolveBeamPath(state);

  let propagationResult: PropagationResult | null = null;
  let solvedCavities: Record<string, CavityEigenmode | null> = {};

  // Step 2: If beam path is valid and we have a propagation engine, call it
  if (beamPath?.isValid && propagationEngine) {
    propagationResult = propagationEngine.propagateBeam({
      q0: sourceQ0(state), // Compute initial q from source
      wavelengthMetres: sourceWavelengthMetres(state),
      segments: beamPathToSegments(state, beamPath),
      componentZMap: beamPathToZMap(beamPath),
    });
  }

  // Step 3: Solve cavities (if cavity solver is available)
  if (cavitySolver && state.sourceId) {
    const source = state.components[state.sourceId];
    if (source?.kind === 'source') {
      const wavelengthNm = source.wavelength;
      for (const [id, component] of Object.entries(state.components)) {
        if (component.kind === 'cavity_fp') {
          const cavity = component as CavityFPComponent;
          solvedCavities[id] = cavitySolver.solveEigenmode(cavity, wavelengthNm);
        }
      }
    }
  }

  // Step 4: Update cavity eigenmodes in the component list
  let updatedComponents = { ...state.components };
  for (const [id, eigenmode] of Object.entries(solvedCavities)) {
    const cavity = updatedComponents[id];
    if (cavity && cavity.kind === 'cavity_fp') {
      const cavityComponent = cavity as CavityFPComponent;
      updatedComponents[id] = {
        ...cavityComponent,
        eigenmode,
      };
    }
  }

  // Step 5: Return updated state
  return {
    ...state,
    components: updatedComponents,
    beamPath,
    propagationResult,
  };
}

// Half-step (mm) used for the central-difference curvature estimate below.
// Small enough to stay local to the current position, large enough to stay
// well clear of floating-point noise in the overlap calculation.
const SENSITIVITY_STEP_MM = 0.5;

/**
 * Recompute each lens's position-sensitivity (see LensThinComponent.sensitivity)
 * against the just-resolved state. No-op (nulls everything out) when there's
 * no propagation engine or no target mode to measure overlap against.
 */
function attachLensSensitivities(
  state: AppState,
  propagationEngine?: PropagationEngine,
): AppState['components'] {
  const components = { ...state.components };

  for (const [id, component] of Object.entries(state.components)) {
    if (component.kind !== 'lens_thin') {
      continue;
    }
    const sensitivity =
      propagationEngine && state.targetMode ? computeLensSensitivity(state, id, propagationEngine) : null;
    components[id] = { ...(component as LensThinComponent), sensitivity };
  }

  return components;
}

/**
 * Curvature (second derivative) of overlap % with respect to this lens's
 * position along its beam axis, evaluated at its current position via a
 * central finite difference: two extra (cheap) propagations, reusing the
 * already-solved cavity eigenmodes rather than re-solving them, since
 * nudging a lens doesn't change any cavity's geometry.
 */
function computeLensSensitivity(
  state: AppState,
  lensId: string,
  propagationEngine: PropagationEngine,
): number | null {
  const lens = state.components[lensId];
  if (!lens || lens.kind !== 'lens_thin') {
    return null;
  }

  const axis = getComponentMovementAxis(state, lensId);
  const h = SENSITIVITY_STEP_MM;

  const overlapAtOffset = (offsetMm: number): number | null => {
    const perturbedComponents = {
      ...state.components,
      [lensId]: {
        ...lens,
        position: { ...lens.position, [axis]: lens.position[axis] + offsetMm },
      },
    };
    const perturbedState = resolveCoreState({ ...state, components: perturbedComponents }, propagationEngine);
    return computeLiveModeOverlap(perturbedState);
  };

  const oMinus = overlapAtOffset(-h);
  const oCenter = computeLiveModeOverlap(state);
  const oPlus = overlapAtOffset(h);

  if (oMinus === null || oCenter === null || oPlus === null) {
    return null;
  }

  const secondDerivative = (oPlus - 2 * oCenter + oMinus) / (h * h); // overlap fraction per mm^2
  return Math.abs(secondDerivative) * 100; // -> %/mm^2
}

/**
 * Extract initial complex beam parameter from the source component.
 * Uses the waistRadius and waistOffset to compute q0 = -waistOffset + i*zR.
 * See optics-math.skill.md §Source for derivation.
 */
function sourceQ0(state: AppState): { re: number; im: number } {
  if (!state.sourceId) {
    return { re: 0, im: 1e-6 }; // Default stub
  }

  const source = state.components[state.sourceId];
  if (!source || source.kind !== 'source') {
    return { re: 0, im: 1e-6 };
  }

  const wavelengthMm = source.wavelength * 1e-6; // nm → mm
  const zR = (Math.PI * source.waistRadius * source.waistRadius) / wavelengthMm;

  return {
    re: -source.waistOffset,
    im: zR,
  };
}

/**
 * Extract wavelength in metres (SI units) from the source component.
 */
function sourceWavelengthMetres(state: AppState): number {
  if (!state.sourceId) {
    return 1064e-9; // Default 1064 nm
  }

  const source = state.components[state.sourceId];
  if (!source || source.kind !== 'source') {
    return 1064e-9;
  }

  return source.wavelength * 1e-9; // nm → metres
}

/**
 * Convert a BeamPath into a list of propagation segments for Layer 0.
 * This maps the geometric segments to their corresponding ABCD matrices.
 * (The actual matrix computation happens in Layer 0.)
 */
function beamPathToSegments(state: AppState, beamPath: BeamPath): any[] {
  return beamPath.segments.map((segment) => {
    const distance = Math.max(0, segment.zEnd - segment.zStart);
    const terminatedId = segment.terminatedByComponentId;
    const terminated = terminatedId ? state.components[terminatedId] : null;

    // Segment matrix is free-space only. Component transforms are applied at boundaries.
    const matrix = {
      A: 1,
      B: distance,
      C: 0,
      D: 1,
    };

    return {
      distance,
      abcdMatrix: matrix,
      componentId: terminatedId,
      componentKind: terminated?.kind ?? null,
      lensFocalLengthMm: terminated?.kind === 'lens_thin' ? terminated.focalLength : undefined,
      cavityEigenmode: terminated?.kind === 'cavity_fp' ? terminated.eigenmode : undefined,
      cavityLengthMm: terminated?.kind === 'cavity_fp' ? terminated.length : undefined,
      cavityCouplingThreshold: terminated?.kind === 'cavity_fp' ? 0.25 : undefined,
      customObjectIndexOfRefraction: terminated?.kind === 'custom_object' ? terminated.indexOfRefraction : undefined,
      customObjectThicknessMm: terminated?.kind === 'custom_object' ? terminated.thickness : undefined,
    };
  });
}

/**
 * Create a z-position map from component IDs to their positions along the unfolded path.
 */
function beamPathToZMap(beamPath: BeamPath): Record<string, number> {
  const zMap: Record<string, number> = {};

  for (const segment of beamPath.segments) {
    if (segment.terminatedByComponentId) {
      zMap[segment.terminatedByComponentId] = segment.zEnd;
    }
  }

  return zMap;
}
