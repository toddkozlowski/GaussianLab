export type CardinalDirection = 'right' | 'left' | 'up' | 'down';

export type MirrorOrientation = 45 | 135 | 225 | 315;

export type ComponentKind = 'source' | 'mirror_flat' | 'lens_thin' | 'cavity_fp';

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
}

export type OpticalComponent =
  | SourceComponent
  | FlatMirrorComponent
  | LensThinComponent
  | CavityFPComponent;

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
}

export type TargetMode =
  | {
      kind: 'manual';
      waistRadius: number;
      waistZ: number;
    }
  | {
      kind: 'cavity';
      cavityComponentId: string;
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
