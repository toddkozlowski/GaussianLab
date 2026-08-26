import type { AppState, OptimiserState, TableConfig, WaistFitPoint, WaistFitState } from './schema';
import { DEFAULT_MIN_COMPONENT_SPACING_MM } from './pathUtils';

const DEFAULT_WAIST_FIT_ROW_COUNT = 5;

function createBlankWaistFitPoints(count: number): WaistFitPoint[] {
  return Array.from({ length: count }, (_, i) => ({ id: `waist-fit-row-${i}`, zMm: null, waistRadiusMm: null }));
}

export const DEFAULT_TABLE_CONFIG: TableConfig = {
  width: 1000,
  height: 600,
  gridStandard: 'metric',
  snapToGrid: true,
  axisCaptureThreshold: 10,
  minComponentSpacingMm: DEFAULT_MIN_COMPONENT_SPACING_MM,
  showWaists: false,
};

export const DEFAULT_OPTIMISER_STATE: OptimiserState = {
  status: 'idle',
  solutions: [],
  preRunSnapshot: null,
  snapshotValid: false,
  avoidCollisions: true,
  manualRangesEnabled: false,
  manualRanges: [],
};

export const DEFAULT_WAIST_FIT_STATE: WaistFitState = {
  points: createBlankWaistFitPoints(DEFAULT_WAIST_FIT_ROW_COUNT),
  showOnBeamPath: true,
  result: null,
};

export const DEFAULT_APP_STATE: AppState = {
  table: DEFAULT_TABLE_CONFIG,
  components: {},
  sourceId: null,
  beamPath: null,
  propagationResult: null,
  targetMode: null,
  optimiser: DEFAULT_OPTIMISER_STATE,
  selectedComponentId: null,
  waistFit: DEFAULT_WAIST_FIT_STATE,
};