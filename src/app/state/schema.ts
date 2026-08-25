export type CardinalDirection = 'right' | 'left' | 'up' | 'down';

export type MirrorOrientation = 45 | 135 | 225 | 315;

export type ComponentKind =
  | 'source'
  | 'mirror_flat'
  | 'lens_thin'
  | 'cavity_fp'
  | 'target'
  | 'beam_stop'
  | 'custom_object';

export type GridStandard = 'metric' | 'imperial';

export type SolverStatus = 'idle' | 'running' | 'solved' | 'failed';

export interface ComplexNumber {
  re: number;
  im: number;
}

export interface Point2d {
  x: number;
  y: number;
}

export interface BaseComponent {
  id: string;
  kind: ComponentKind;
  position: Point2d;
  locked: boolean;
  label: string;
}

export interface SourceComponent extends BaseComponent {
  kind: 'source';
  direction: CardinalDirection;
  waistRadius: number;
  waistOffset: number;
  wavelength: number;
}

export interface FlatMirrorComponent extends BaseComponent {
  kind: 'mirror_flat';
  orientation: MirrorOrientation;
}

export interface LensThinComponent extends BaseComponent {
  kind: 'lens_thin';
  focalLength: number;
  optimiserCanMove: boolean;
  /**
   * How sharply the final mode overlap falls off for a small displacement of
   * this lens along the beam axis - the curvature (second derivative) of
   * overlap % with respect to position, in %/mm^2. Derived and recomputed
   * automatically (like a cavity's eigenmode); null when there's no
   * resolvable target mode to measure against.
   */
  sensitivity: number | null;
}

export interface CavityEigenmode {
  waistRadius: number;
  waistPositionFromM1: number;
  stabilityProduct: number;
  isStable: boolean;
}

export interface CavityFPComponent extends BaseComponent {
  kind: 'cavity_fp';
  length: number;
  r1: number;
  r2: number;
  direction: CardinalDirection;
  eigenmode: CavityEigenmode | null;
  /** Show the eigenmode's Gaussian projection across the whole beam profile. */
  showProjection: boolean;
}

/**
 * A pure mode-matching target: marks a desired waist size at a position
 * along the beam path. Unlike a cavity, it does not affect propagation -
 * it is purely a reference point for computing mode overlap.
 */
export interface TargetComponent extends BaseComponent {
  kind: 'target';
  waistRadius: number;
  /** Show this target's Gaussian mode projection across the whole beam profile. */
  showProjection: boolean;
}

/**
 * An opaque beam block: fully absorbs the beam wherever it's placed on the
 * path, terminating propagation right there. It has no optical parameters -
 * it just stops the beam.
 */
export interface BeamStopComponent extends BaseComponent {
  kind: 'beam_stop';
}

/**
 * A flat-faced dielectric slab (e.g. a window or crystal): the beam passes
 * straight through, unaffected in direction. component.position anchors the
 * front face; the back face sits `thickness` further downstream along the
 * beam. Both faces are assumed strictly flat (normal incidence, no lensing).
 * Only affects propagation when indexOfRefraction != 1 - at n=1 it's
 * optically transparent, though its thickness still occupies physical space
 * for collision purposes.
 */
export interface CustomObjectComponent extends BaseComponent {
  kind: 'custom_object';
  indexOfRefraction: number;
  thickness: number;
}

export type OpticalComponent =
  | SourceComponent
  | FlatMirrorComponent
  | LensThinComponent
  | CavityFPComponent
  | TargetComponent
  | BeamStopComponent
  | CustomObjectComponent;

export interface TableConfig {
  width: number;
  height: number;
  gridStandard: GridStandard;
  snapToGrid: boolean;
  axisCaptureThreshold: number;
  /**
   * Minimum allowed distance (mm) between components before the "too close"
   * proximity warning fires - also what the mode-matching optimizer treats
   * as an invalid (colliding) lens placement when "Avoid collisions" is on.
   * User-editable in Settings; 0 disables the check entirely.
   */
  minComponentSpacingMm: number;
  /** Show a marker (and w0 label) at every beam-waist location on the 2D canvas. */
  showWaists: boolean;
}

export interface BeamSegment {
  direction: CardinalDirection;
  start: Point2d;
  end: Point2d;
  zStart: number;
  zEnd: number;
  terminatedByComponentId: string | null;
  termination: 'component' | 'table_boundary' | 'wrong_face';
}

export interface BeamPath {
  segments: BeamSegment[];
  orderedComponentIds: string[];
  totalLength: number;
  isValid: boolean;
  invalidReason: string | null;
}

export interface PropagationWaist {
  z: number;
  w: number;
  componentId: string | null;
}

export interface PropagationResult {
  /**
   * gouyPhaseDeg is the continuously-accumulated (unwrapped) Gouy phase in
   * degrees, tracked along the whole propagation - see propagation.ts for
   * the accumulation rule across lenses/cavities/custom objects.
   */
  profile: Array<{ z: number; w: number; gouyPhaseDeg: number }>;
  waists: PropagationWaist[];
  qAtComponent: Record<string, ComplexNumber>;
  qFinal: ComplexNumber;
  /**
   * Mode overlap (0-1) between the incoming beam and each cavity's eigenmode,
   * measured at the input mirror - independent of whether the beam actually
   * coupled (i.e. not clamped to 1 once past the coupling threshold).
   */
  cavityOverlap: Record<string, number>;
}

export type TargetMode =
  | {
      kind: 'cavity';
      cavityComponentId: string;
    }
  | {
      kind: 'target';
      targetComponentId: string;
    };

export interface OptimiserSolution {
  id: string;
  lensPositions: Record<string, Point2d>;
  overlap: number;
  /** Highest per-lens position-sensitivity (%/mm^2) across this solution's movable lenses, or null if unmeasured. */
  maxLensSensitivity: number | null;
  summary: string;
}

/**
 * A user-defined window, in beam-path z (mm), that the optimizer's movable
 * lenses must stay within. z is measured along the unfolded beam path, so a
 * single range can span across a mirror (i.e. bend a corner) when translated
 * back into physical (x, y) space.
 */
export interface ManualAdjustmentRange {
  id: string;
  startZMm: number;
  endZMm: number;
}

export interface OptimiserState {
  status: SolverStatus;
  solutions: OptimiserSolution[];
  preRunSnapshot: Record<string, Point2d> | null;
  snapshotValid: boolean;
  /**
   * When true (the default), the optimizer discards any lens placement that
   * would trigger a proximity warning against another component - i.e. it
   * won't propose a solution the UI would flag as "too close."
   */
  avoidCollisions: boolean;
  /** When true, movable lenses are confined to manualRanges (see below). */
  manualRangesEnabled: boolean;
  manualRanges: ManualAdjustmentRange[];
}

export interface AppState {
  table: TableConfig;
  components: Record<string, OpticalComponent>;
  sourceId: string | null;
  beamPath: BeamPath | null;
  propagationResult: PropagationResult | null;
  targetMode: TargetMode | null;
  optimiser: OptimiserState;
  selectedComponentId: string | null;
}
