import type {
  CavityFPComponent,
  FlatMirrorComponent,
  LensThinComponent,
  OpticalComponent,
  Point2d,
  SourceComponent,
} from './schema';
import type { AppState, TableConfig } from './schema';

function buildComponentId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function countComponentsByKind(
  components: Record<string, OpticalComponent>,
  kind: OpticalComponent['kind'],
) {
  return Object.values(components).filter((component) => component.kind === kind).length;
}

function nextLabel(prefix: string, count: number) {
  return `${prefix}${count + 1}`;
}

export function createSourceComponent(
  components: Record<string, OpticalComponent> = {},
  position: Point2d = { x: 0, y: 0 },
): SourceComponent {
  return {
    id: buildComponentId('source'),
    kind: 'source',
    position,
    locked: false,
    label: nextLabel('S', countComponentsByKind(components, 'source')),
    direction: 'right',
    waistRadius: 0.05,
    waistOffset: 0,
    wavelength: 1064,
  };
}

export function createFlatMirrorComponent(
  components: Record<string, OpticalComponent> = {},
  position: Point2d = { x: 0, y: 0 },
): FlatMirrorComponent {
  return {
    id: buildComponentId('mirror-flat'),
    kind: 'mirror_flat',
    position,
    locked: false,
    label: nextLabel('M', countComponentsByKind(components, 'mirror_flat')),
    orientation: 45,
  };
}

export function createLensThinComponent(
  components: Record<string, OpticalComponent> = {},
  position: Point2d = { x: 0, y: 0 },
): LensThinComponent {
  return {
    id: buildComponentId('lens-thin'),
    kind: 'lens_thin',
    position,
    locked: false,
    label: nextLabel('L', countComponentsByKind(components, 'lens_thin')),
    focalLength: 100,
    optimiserCanMove: true,
  };
}

export function createCavityFPComponent(
  components: Record<string, OpticalComponent> = {},
  position: Point2d = { x: 0, y: 0 },
): CavityFPComponent {
  return {
    id: buildComponentId('cavity-fp'),
    kind: 'cavity_fp',
    position,
    locked: false,
    label: nextLabel('FP', countComponentsByKind(components, 'cavity_fp')),
    length: 100,
    r1: Number.POSITIVE_INFINITY,
    r2: 100,
    direction: 'right',
    eigenmode: null,
  };
}

/**
 * Create initial app state with default table config and a source component
 */
export function createInitialAppState(): AppState {
  const tableConfig: TableConfig = {
    width: 1200,
    height: 600,
    gridStandard: 'metric',
    snapToGrid: true,
    axisCaptureThreshold: 10, // 10mm threshold
  };

  const source = createSourceComponent({}, { x: 50, y: 300 });

  return {
    table: tableConfig,
    components: {
      [source.id]: source,
    },
    sourceId: source.id,
    beamPath: null,
    propagationResult: null,
    targetMode: null,
    optimiser: {
      status: 'idle',
      solutions: [],
      previewedSolutionIndex: null,
      preRunSnapshot: null,
      snapshotValid: false,
    },
    selectedComponentId: null,
  };
}
