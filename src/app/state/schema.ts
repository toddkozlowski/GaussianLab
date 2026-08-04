export type CardinalDirection = 'right' | 'left' | 'up' | 'down';

export type MirrorOrientation = 45 | 135 | 225 | 315;

export type ComponentKind = 'source' | 'mirror_flat' | 'lens_thin' | 'cavity_fp' | 'target' | 'beam_stop';

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

export type OpticalComponent =
  | SourceComponent
  | FlatMirrorComponent
  | LensThinComponent
  | CavityFPComponent
  | TargetComponent
  | BeamStopComponent;

export interface TableConfig {
  width: number;
  height: number;
  gridStandard: GridStandard;
  snapToGrid: boolean;
  axisCaptureThreshold: number;
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
  profile: Array<{ z: number; w: number }>;
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
  summary: string;
}

export interface OptimiserState {
  status: SolverStatus;
  solutions: OptimiserSolution[];
  previewedSolutionIndex: number | null;
  preRunSnapshot: Record<string, Point2d> | null;
  snapshotValid: boolean;
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
