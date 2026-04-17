/**
 * Layer 0 Interface Contracts
 *
 * Defines the contracts that Layer 0 (math kernel) must fulfill.
 * These types are used by Layer 1 to orchestrate derived state computation.
 *
 * Layer 0 is imported ONLY by stateResolver.ts to invoke computation.
 * Layer 1 does not assume Layer 0 is implemented; it accepts these as optional
 * dependencies and stubs them if not provided.
 */

import type { ComplexNumber, PropagationResult, CavityEigenmode } from '../schema';
import type { BeamPath } from '../schema';
import type { CavityFPComponent } from '../schema';
import type { ComponentKind } from '../schema';

/**
 * ABCD matrix representation for a single optical element.
 * See optics-math.skill.md for matrix conventions.
 */
export interface ABCDMatrix {
  A: number;
  B: number; // in mm (not normalized)
  C: number; // in 1/mm (not normalized)
  D: number;
}

/**
 * Segment of the beam path between two components or events.
 * AbcdSegment is used to package the propagation through a single segment.
 */
export interface PropagationSegment {
  /** Distance along this segment in mm. */
  distance: number;

  /** ABCD matrix for this segment (e.g., free space, lens, cavity) */
  abcdMatrix: ABCDMatrix;

  /** Component ID responsible for this segment, if any. */
  componentId: string | null;

  /** Kind of component encountered at the end of the segment. */
  componentKind?: ComponentKind | null;

  /** Thin lens focal length when componentKind is lens_thin. */
  lensFocalLengthMm?: number;

  /** Cavity eigenmode at M1 when componentKind is cavity_fp. */
  cavityEigenmode?: CavityEigenmode | null;

  /** Physical cavity length used to project cavity output mode. */
  cavityLengthMm?: number;

  /** Minimum overlap needed to treat cavity as coupled mode output. */
  cavityCouplingThreshold?: number;
}

/**
 * Input to the beam propagation engine.
 * Produced by stateResolver after beamPathResolver runs.
 */
export interface PropagationEngineInput {
  /** Source beam parameter at the source origin position. */
  q0: ComplexNumber;

  /** Wavelength in SI units (metres). */
  wavelengthMetres: number;

  /** Ordered list of propagation segments along the beam path. */
  segments: PropagationSegment[];

  /** Component ID to z-position mapping for overlap calculations. */
  componentZMap: Record<string, number>;
}

/**
 * Gaussian beam propagation engine (Layer 0 responsibility).
 * Traces a Gaussian beam through an ABCD optical system.
 */
export interface PropagationEngine {
  /**
   * Propagate the input beam through the segment sequence.
   *
   * Returns the propagated beam profile (w vs z) and the complex
   * beam parameter at each component.
   *
   * @param input PropagationEngineInput
   * @returns PropagationResult with profile, waists, qAtComponent, qFinal
   */
  propagateBeam(input: PropagationEngineInput): PropagationResult;
}

/**
 * Cavity eigenmode solver (Layer 0 responsibility).
 * Solves for the self-consistent mode inside a Fabry-Pérot cavity.
 */
export interface CavitySolver {
  /**
   * Solve the eigenmode of a Fabry-Pérot cavity.
   *
   * @param cavity CavityFPComponent with length, r1, r2
   * @param wavelengthNm Wavelength in nanometres
   * @returns CavityEigenmode with waist radius, position, stability; or null if unstable
   */
  solveEigenmode(cavity: CavityFPComponent, wavelengthNm: number): CavityEigenmode | null;
}

/**
 * Mode overlap integral calculator (Layer 0 responsibility).
 * Computes overlap between propagated beam and target mode.
 */
export interface ModeOverlapCalculator {
  /**
   * Calculate overlap between the propagated beam (as represented in the
   * propgation result) and a target mode (manual waist or cavity eigenmode).
   *
   * @param targetMode User-specified or cavity eigenmode
   * @param propagationResult Propagated beam output
   * @param componentZMap Mapping of component ID to z-position for cavity mode offset
   * @returns Overlap integral, 0–1 (1 = perfect match)
   */
  calculateOverlap(propagationResult: PropagationResult, componentZMap: Record<string, number>): number;
}

/**
 * Optimizer (Layer 0 responsibility, used by Layer 5).
 * Searches for lens positions that maximize mode overlap.
 */
export interface Optimizer {
  /**
   * Optimize lens positions to maximize mode overlap with target.
   *
   * @param initialState AppState
   * @param freeParameterLensIds Lens IDs available for movement
   * @param maxIterations Search budget
   * @returns List of solutions in order of descending overlap
   */
  optimize(
    initialState: any, // AppState (avoid circular dependency)
    freeParameterLensIds: string[],
    maxIterations: number
  ): any[]; // OptimiserSolution[]
}
