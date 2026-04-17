/**
 * Layer 2: Konva Canvas
 *
 * Renders optical components on an interactive canvas.
 * Components can be dragged with snapping and axis-capture logic.
 */

import React, { useRef } from 'react';
import { Stage, Layer, Group, Rect } from 'react-konva';
import type Konva from 'konva';
import { useAppStore } from '../../app/adapters/useAppStore';
import type {
  TableConfig,
  OpticalComponent,
  Point2d,
  BeamPath,
  PropagationResult,
  SourceComponent,
  CardinalDirection,
  MirrorOrientation,
} from '../../app/state/schema';
import { SourceRenderer } from './components/SourceRenderer';
import { MirrorRenderer } from './components/MirrorRenderer';
import { LensRenderer } from './components/LensRenderer';
import { CavityRenderer } from './components/CavityRenderer';
import { GridOverlay } from './GridOverlay';
import { BeamCorridorOverlay } from './BeamCorridorOverlay';
import { snapPointToGrid } from '../../app/state/snapToGrid';

interface CanvasProps {
  config: TableConfig;
  components: Record<string, OpticalComponent>;
  sourceId: string | null;
  beamPath: BeamPath | null;
  propagationResult: PropagationResult | null;
  hoveredZMm: number | null;
  onHoverZMm: (zMm: number | null) => void;
}

export const Canvas: React.FC<CanvasProps> = ({
  config,
  components,
  sourceId,
  beamPath,
  propagationResult,
  hoveredZMm,
  onHoverZMm,
}) => {
  const stageRef = useRef<Konva.Stage>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const { state, dispatch } = useAppStore();
  const [viewportSize, setViewportSize] = React.useState({ width: 960, height: 420 });
  const source = sourceId ? components[sourceId] : null;
  const sourceComponent = source && source.kind === 'source' ? (source as SourceComponent) : null;
  const selected = state.selectedComponentId ? state.components[state.selectedComponentId] : null;

  const isJsdomTestEnv =
    typeof window !== 'undefined' &&
    typeof window.navigator !== 'undefined' &&
    /jsdom/i.test(window.navigator.userAgent);

  React.useEffect(() => {
    const element = viewportRef.current;
    if (!element) {
      return;
    }

    const update = () => {
      setViewportSize({
        width: Math.max(320, element.clientWidth),
        height: Math.max(240, element.clientHeight),
      });
    };

    update();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const tablePadding = 24;
  const usableWidth = Math.max(100, viewportSize.width - tablePadding * 2);
  const usableHeight = Math.max(100, viewportSize.height - tablePadding * 2);
  const tableScale = Math.min(usableWidth / config.width, usableHeight / config.height, 1.45);

  const mmToPx = React.useCallback((mm: number) => mm * tableScale, [tableScale]);

  const clampToTableCenter = React.useCallback(
    (point: Point2d): Point2d => ({
      x: Math.max(0, Math.min(config.width, point.x)),
      y: Math.max(0, Math.min(config.height, point.y)),
    }),
    [config.height, config.width]
  );

  const nearestBeamAxisSnap = React.useCallback(
    (point: Point2d): Point2d => {
      if (!beamPath || !beamPath.isValid || beamPath.segments.length === 0) {
        return point;
      }

      let best = point;
      let bestScore = Number.POSITIVE_INFINITY;

      for (const segment of beamPath.segments) {
        const isHorizontal = segment.direction === 'left' || segment.direction === 'right';
        const snapped: Point2d = isHorizontal
          ? { x: point.x, y: segment.start.y }
          : { x: segment.start.x, y: point.y };

        const transverse = isHorizontal
          ? Math.abs(point.y - segment.start.y)
          : Math.abs(point.x - segment.start.x);
        const longitudinal = isHorizontal
          ? distanceToRange(point.x, Math.min(segment.start.x, segment.end.x), Math.max(segment.start.x, segment.end.x))
          : distanceToRange(point.y, Math.min(segment.start.y, segment.end.y), Math.max(segment.start.y, segment.end.y));
        const score = transverse * 10 + longitudinal;

        if (score < bestScore) {
          bestScore = score;
          best = snapped;
        }
      }

      return best;
    },
    [beamPath]
  );

  const normalizePosition = React.useCallback(
    (component: OpticalComponent, rawPos: Point2d): Point2d => {
      let next = clampToTableCenter(rawPos);

      if (!config.snapToGrid) {
        return next;
      }

      if (component.kind === 'source' || component.kind === 'mirror_flat') {
        next = snapPointToGrid(next, config.gridStandard);
      } else if (component.kind === 'lens_thin' || component.kind === 'cavity_fp') {
        next = nearestBeamAxisSnap(next);
      }

      return clampToTableCenter(next);
    },
    [clampToTableCenter, config.gridStandard, config.snapToGrid, nearestBeamAxisSnap]
  );

  const handleComponentDragEnd = (componentId: string, newPos: Point2d) => {
    const component = components[componentId];
    if (!component) {
      return;
    }

    const normalized = normalizePosition(component, newPos);
    dispatch({
      type: 'UPDATE_COMPONENT',
      payload: {
        id: componentId,
        updates: { position: normalized },
      },
    });
  };

  const selectComponent = (componentId: string) => {
    dispatch({ type: 'SET_SELECTED_COMPONENT', payload: { componentId } });
  };

  const rotateDirection = (direction: CardinalDirection, clockwise: boolean): CardinalDirection => {
    const sequence: CardinalDirection[] = ['right', 'down', 'left', 'up'];
    const index = sequence.indexOf(direction);
    const next = clockwise ? (index + 1) % 4 : (index + 3) % 4;
    return sequence[next];
  };

  const rotateMirror = (orientation: MirrorOrientation, clockwise: boolean): MirrorOrientation => {
    const sequence: MirrorOrientation[] = [45, 135, 225, 315];
    const index = sequence.indexOf(orientation);
    const next = clockwise ? (index + 1) % 4 : (index + 3) % 4;
    return sequence[next];
  };

  const rotateSelected = (clockwise: boolean) => {
    if (!selected) {
      return;
    }

    if (selected.kind === 'mirror_flat') {
      dispatch({
        type: 'UPDATE_COMPONENT',
        payload: {
          id: selected.id,
          updates: { orientation: rotateMirror(selected.orientation, clockwise) },
        },
      });
      return;
    }

    if (selected.kind === 'source') {
      dispatch({
        type: 'UPDATE_COMPONENT',
        payload: {
          id: selected.id,
          updates: { direction: rotateDirection(selected.direction, clockwise) },
        },
      });
      return;
    }

    if (selected.kind === 'cavity_fp') {
      dispatch({
        type: 'UPDATE_COMPONENT',
        payload: {
          id: selected.id,
          updates: { direction: rotateDirection(selected.direction, clockwise) },
        },
      });
    }
  };

  if (isJsdomTestEnv) {
    return (
      <div style={{ border: '1px solid #ccc', overflow: 'hidden', height: '100%' }}>
        <div className="canvas-placeholder">Konva canvas unavailable in test environment.</div>
      </div>
    );
  }

  const selectedOverlayPos = selected
    ? {
        left: tablePadding + mmToPx(selected.position.x) + 12,
        top: tablePadding + mmToPx(selected.position.y) - 12,
      }
    : null;

  return (
    <div ref={viewportRef} className="table-canvas-shell">
      <Stage
        ref={stageRef}
        width={viewportSize.width}
        height={viewportSize.height}
        style={{
          backgroundColor: '#3b4249',
        }}
        onMouseDown={(event) => {
          if (event.target === event.target.getStage()) {
            dispatch({ type: 'SET_SELECTED_COMPONENT', payload: { componentId: null } });
          }
        }}
        onMouseMove={() => {
          const stage = stageRef.current;
          if (!stage || !beamPath || !beamPath.isValid) {
            return;
          }

          const pointer = stage.getPointerPosition();
          if (!pointer) {
            return;
          }

          const pointMm = {
            x: (pointer.x - tablePadding) / tableScale,
            y: (pointer.y - tablePadding) / tableScale,
          };

          if (
            pointMm.x < 0 ||
            pointMm.y < 0 ||
            pointMm.x > config.width ||
            pointMm.y > config.height
          ) {
            return;
          }

          const nearest = nearestZOnPath(beamPath, pointMm);
          const thresholdMm = 12;
          onHoverZMm(nearest && nearest.distanceMm <= thresholdMm ? nearest.zMm : null);
        }}
        onMouseLeave={() => onHoverZMm(null)}
      >
        <Layer>
          <Rect x={0} y={0} width={viewportSize.width} height={viewportSize.height} fill="#3b4249" listening={false} />

          <Group x={tablePadding} y={tablePadding}>
            <GridOverlay config={config} mmToPx={mmToPx} />

            <BeamCorridorOverlay
              beamPath={beamPath}
              source={sourceComponent}
              propagationResult={propagationResult}
              mmToPx={mmToPx}
              hoveredZMm={hoveredZMm}
            />

            {Object.values(components).map((component) => (
              <React.Fragment key={component.id}>
                {component.kind === 'source' && (
                  <SourceRenderer
                    component={component}
                    mmToPx={mmToPx}
                    onDragEnd={handleComponentDragEnd}
                    onSelect={selectComponent}
                    isDraggable={!component.locked}
                    isSelected={state.selectedComponentId === component.id}
                  />
                )}
                {component.kind === 'mirror_flat' && (
                  <MirrorRenderer
                    component={component}
                    mmToPx={mmToPx}
                    onDragEnd={handleComponentDragEnd}
                    onSelect={selectComponent}
                    isDraggable={!component.locked}
                    isSelected={state.selectedComponentId === component.id}
                  />
                )}
                {component.kind === 'lens_thin' && (
                  <LensRenderer
                    component={component}
                    mmToPx={mmToPx}
                    onDragEnd={handleComponentDragEnd}
                    onSelect={selectComponent}
                    isDraggable={!component.locked}
                    isSelected={state.selectedComponentId === component.id}
                  />
                )}
                {component.kind === 'cavity_fp' && (
                  <CavityRenderer
                    component={component}
                    mmToPx={mmToPx}
                    onDragEnd={handleComponentDragEnd}
                    onSelect={selectComponent}
                    isDraggable={!component.locked}
                    isSelected={state.selectedComponentId === component.id}
                  />
                )}
              </React.Fragment>
            ))}
          </Group>
        </Layer>
      </Stage>

      {selected && selectedOverlayPos && (
        <div className="canvas-selection-popover" style={{ left: selectedOverlayPos.left, top: selectedOverlayPos.top }}>
          <div className="canvas-selection-header">{selected.label}</div>
          {(selected.kind === 'mirror_flat' || selected.kind === 'source' || selected.kind === 'cavity_fp') && (
            <div className="canvas-selection-rotate-row">
              <button type="button" onClick={() => rotateSelected(false)}>
                Rotate -90
              </button>
              <button type="button" onClick={() => rotateSelected(true)}>
                Rotate +90
              </button>
            </div>
          )}

          {selected.kind === 'source' && (
            <div className="canvas-source-editor">
              <label>
                Waist r (um)
                <input
                  type="number"
                  step={1}
                  value={Math.round(selected.waistRadius * 1000)}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value)) {
                      dispatch({
                        type: 'UPDATE_COMPONENT',
                        payload: {
                          id: selected.id,
                          updates: { waistRadius: Math.max(1, value) / 1000 },
                        },
                      });
                    }
                  }}
                />
              </label>
              <label>
                Waist z (mm)
                <input
                  type="number"
                  step={0.1}
                  value={selected.waistOffset}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value)) {
                      dispatch({
                        type: 'UPDATE_COMPONENT',
                        payload: {
                          id: selected.id,
                          updates: { waistOffset: value },
                        },
                      });
                    }
                  }}
                />
              </label>
              <label>
                lambda (nm)
                <input
                  type="number"
                  step={1}
                  value={selected.wavelength}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value)) {
                      dispatch({
                        type: 'UPDATE_COMPONENT',
                        payload: {
                          id: selected.id,
                          updates: { wavelength: Math.max(1, value) },
                        },
                      });
                    }
                  }}
                />
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function distanceToRange(value: number, min: number, max: number): number {
  if (value < min) {
    return min - value;
  }
  if (value > max) {
    return value - max;
  }
  return 0;
}

function nearestZOnPath(
  beamPath: BeamPath,
  point: Point2d
): { zMm: number; distanceMm: number } | null {
  let best: { zMm: number; distanceMm: number } | null = null;

  for (const segment of beamPath.segments) {
    const projection = projectPointToSegment(point, segment.start, segment.end);
    const zMm = segment.zStart + (segment.zEnd - segment.zStart) * projection.t;
    const candidate = {
      zMm,
      distanceMm: projection.distance,
    };

    if (!best || candidate.distanceMm < best.distanceMm) {
      best = candidate;
    }
  }

  return best;
}

function projectPointToSegment(
  point: Point2d,
  start: Point2d,
  end: Point2d
): { t: number; distance: number } {
  const vx = end.x - start.x;
  const vy = end.y - start.y;
  const lengthSq = vx * vx + vy * vy;
  if (lengthSq < 1e-9) {
    const dx = point.x - start.x;
    const dy = point.y - start.y;
    return { t: 0, distance: Math.sqrt(dx * dx + dy * dy) };
  }

  const wx = point.x - start.x;
  const wy = point.y - start.y;
  const rawT = (wx * vx + wy * vy) / lengthSq;
  const t = Math.max(0, Math.min(1, rawT));
  const px = start.x + t * vx;
  const py = start.y + t * vy;
  const dx = point.x - px;
  const dy = point.y - py;

  return { t, distance: Math.sqrt(dx * dx + dy * dy) };
}
