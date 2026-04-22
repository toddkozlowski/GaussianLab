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
import lockIcon from '../../../icons/lock.svg';
import lockOpenIcon from '../../../icons/lock-open.svg';
import rotateCcwIcon from '../../../icons/rotate-ccw.svg';
import rotateCwIcon from '../../../icons/rotate-cw.svg';
import trashIcon from '../../../icons/trash-2.svg';

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
  const selectionCardWidth = 224;
  const stageRef = useRef<Konva.Stage>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const { state, dispatch } = useAppStore();
  const [viewportSize, setViewportSize] = React.useState({ width: 960, height: 420 });
  const source = sourceId ? components[sourceId] : null;
  const sourceComponent = source && source.kind === 'source' ? (source as SourceComponent) : null;
  const selected = state.selectedComponentId ? state.components[state.selectedComponentId] : null;
  const hoveredProfilePoint = React.useMemo(
    () => (hoveredZMm === null ? null : nearestProfilePoint(propagationResult?.profile ?? [], hoveredZMm)),
    [hoveredZMm, propagationResult]
  );

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

  const getSnappedDragPositionPx = React.useCallback(
    (component: OpticalComponent, rawPx: Point2d): Point2d => {
      const widthPx = viewportSize.width - tablePadding * 2;
      const heightPx = viewportSize.height - tablePadding * 2;
      const pointMm = {
        x: (rawPx.x - tablePadding) / tableScale,
        y: (rawPx.y - tablePadding) / tableScale,
      };
      const normalized = normalizePosition(component, pointMm);
      return {
        x: Math.max(tablePadding, Math.min(tablePadding + widthPx, tablePadding + mmToPx(normalized.x))),
        y: Math.max(tablePadding, Math.min(tablePadding + heightPx, tablePadding + mmToPx(normalized.y))),
      };
    },
    [mmToPx, normalizePosition, tablePadding, tableScale, viewportSize.height, viewportSize.width]
  );

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

  const toggleLockSelected = () => {
    if (!selected) {
      return;
    }

    const locked = !selected.locked;
    dispatch({ type: 'LOCK_COMPONENT', payload: { id: selected.id, locked } });
    if (selected.kind === 'lens_thin') {
      dispatch({
        type: 'UPDATE_COMPONENT',
        payload: { id: selected.id, updates: { optimiserCanMove: !locked } },
      });
    }
  };

  const deleteSelected = () => {
    if (!selected) {
      return;
    }
    dispatch({ type: 'REMOVE_COMPONENT', payload: { id: selected.id } });
  };

  if (isJsdomTestEnv) {
    return (
      <div style={{ border: '1px solid #ccc', overflow: 'hidden', height: '100%' }}>
        <div className="canvas-placeholder">Konva canvas unavailable in test environment.</div>
      </div>
    );
  }

  const selectedOverlayPos = selected
    ? getSelectionPopoverPosition({
        componentPx: {
          x: tablePadding + mmToPx(selected.position.x),
          y: tablePadding + mmToPx(selected.position.y),
        },
        viewportSize,
        cardWidth: selectionCardWidth,
        cardHeight: getSelectionCardHeight(selected.kind),
        marginPx: 12,
      })
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
                    axisDirection={lensAxisDirection(beamPath, component.id, component.position)}
                    getSnappedDragPositionPx={getSnappedDragPositionPx}
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
          <div className="canvas-selection-topbar">
            <div className="canvas-selection-header">{selected.label}</div>
            <div className="canvas-selection-topbar-actions">
              <button
                type="button"
                className="icon-button"
                aria-label={selected.locked ? 'Unlock component' : 'Lock component'}
                onClick={toggleLockSelected}
              >
                <img className="icon-glyph" src={selected.locked ? lockIcon : lockOpenIcon} alt="" />
              </button>
              <button type="button" className="icon-button danger-button" aria-label="Delete component" onClick={deleteSelected}>
                <img className="icon-glyph" src={trashIcon} alt="" />
              </button>
            </div>
          </div>
          <label>
            Label
            <input
              value={selected.label}
              onChange={(event) =>
                dispatch({
                  type: 'UPDATE_COMPONENT',
                  payload: { id: selected.id, updates: { label: event.target.value } },
                })
              }
            />
          </label>
          <div className="canvas-selection-grid">
            <label>
              X (mm)
              <input
                type="number"
                value={formatFixed3(selected.position.x)}
                onChange={(event) => updateCanvasPosition(dispatch, config, selected.id, selected.position, 'x', Number(event.target.value))}
              />
            </label>
            <label>
              Y (mm)
              <input
                type="number"
                value={formatFixed3(selected.position.y)}
                onChange={(event) => updateCanvasPosition(dispatch, config, selected.id, selected.position, 'y', Number(event.target.value))}
              />
            </label>
          </div>
          <div className="canvas-selection-actions">
            {(selected.kind === 'mirror_flat' || selected.kind === 'source' || selected.kind === 'cavity_fp') && (
              <>
                <button type="button" className="icon-button" aria-label="Rotate counterclockwise" onClick={() => rotateSelected(false)}>
                  <img className="icon-glyph" src={rotateCcwIcon} alt="" />
                </button>
                <button type="button" className="icon-button" aria-label="Rotate clockwise" onClick={() => rotateSelected(true)}>
                  <img className="icon-glyph" src={rotateCwIcon} alt="" />
                </button>
              </>
            )}
          </div>

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
                  value={formatFixed3(selected.waistOffset)}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value)) {
                      dispatch({
                        type: 'UPDATE_COMPONENT',
                        payload: {
                          id: selected.id,
                          updates: { waistOffset: round3(value) },
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
                  value={formatFixed3(selected.wavelength)}
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

          {selected.kind === 'lens_thin' && (
            <div className="canvas-source-editor">
              <label>
                Focal length (mm)
                <input
                  type="number"
                  value={formatFixed3(selected.focalLength)}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value)) {
                      dispatch({
                        type: 'UPDATE_COMPONENT',
                        payload: { id: selected.id, updates: { focalLength: round3(value) } },
                      });
                    }
                  }}
                />
              </label>
            </div>
          )}

          {selected.kind === 'mirror_flat' && (
            <div className="canvas-source-editor">
              <label>
                Orientation
                <select
                  value={selected.orientation}
                  onChange={(event) =>
                    dispatch({
                      type: 'UPDATE_COMPONENT',
                      payload: {
                        id: selected.id,
                        updates: { orientation: Number(event.target.value) as MirrorOrientation },
                      },
                    })
                  }
                >
                  <option value={45}>45</option>
                  <option value={135}>135</option>
                  <option value={225}>225</option>
                  <option value={315}>315</option>
                </select>
              </label>
            </div>
          )}

          {selected.kind === 'cavity_fp' && (
            <div className="canvas-source-editor">
              <label>
                Length (mm)
                <input
                  type="number"
                  value={formatFixed3(selected.length)}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value)) {
                      dispatch({
                        type: 'UPDATE_COMPONENT',
                        payload: { id: selected.id, updates: { length: round3(Math.max(1, value)) } },
                      });
                    }
                  }}
                />
              </label>
              <label>
                R1 (mm)
                <input
                  type="number"
                  value={Number.isFinite(selected.r1) ? formatFixed3(selected.r1) : ''}
                  placeholder="Infinity"
                  onChange={(event) => updateCavityRadius(dispatch, selected.id, 'r1', event.target.value)}
                />
              </label>
              <label>
                R2 (mm)
                <input
                  type="number"
                  value={Number.isFinite(selected.r2) ? formatFixed3(selected.r2) : ''}
                  placeholder="Infinity"
                  onChange={(event) => updateCavityRadius(dispatch, selected.id, 'r2', event.target.value)}
                />
              </label>
            </div>
          )}
        </div>
      )}

      {hoveredProfilePoint && (
        <div className="canvas-hover-card">
          <strong>{formatBeamRadius(hoveredProfilePoint.w)}</strong>
          <span>z = {hoveredProfilePoint.z.toFixed(1)} mm</span>
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

function nearestProfilePoint(profile: Array<{ z: number; w: number }>, zMm: number) {
  if (profile.length === 0) {
    return null;
  }

  let nearest = profile[0];
  let nearestDistance = Math.abs(profile[0].z - zMm);
  for (let i = 1; i < profile.length; i += 1) {
    const candidate = profile[i];
    const distance = Math.abs(candidate.z - zMm);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function formatBeamRadius(radiusMm: number) {
  const radiusUm = radiusMm * 1000;
  if (radiusUm < 1000) {
    return `w = ${radiusUm.toFixed(1)} um`;
  }
  return `w = ${radiusMm.toFixed(4)} mm`;
}

function lensAxisDirection(beamPath: BeamPath | null, componentId: string, position: Point2d): CardinalDirection | null {
  if (!beamPath || !beamPath.isValid) {
    return null;
  }

  const hitSegment = beamPath.segments.find((segment) => segment.terminatedByComponentId === componentId);
  if (hitSegment) {
    return hitSegment.direction;
  }

  const nearest = nearestZOnPath(beamPath, position);
  if (!nearest) {
    return null;
  }

  const segment = beamPath.segments.find((candidate) => nearest.zMm >= candidate.zStart && nearest.zMm <= candidate.zEnd);
  return segment?.direction ?? null;
}

function updateCanvasPosition(
  dispatch: ReturnType<typeof useAppStore>['dispatch'],
  config: TableConfig,
  componentId: string,
  position: Point2d,
  axis: 'x' | 'y',
  value: number
) {
  if (!Number.isFinite(value)) {
    return;
  }

  dispatch({
    type: 'UPDATE_COMPONENT',
    payload: {
      id: componentId,
      updates: {
        position: {
          ...position,
          [axis]: round3(Math.max(0, Math.min(axis === 'x' ? config.width : config.height, value))),
        },
      },
    },
  });
}

function updateCavityRadius(
  dispatch: ReturnType<typeof useAppStore>['dispatch'],
  componentId: string,
  key: 'r1' | 'r2',
  rawValue: string
) {
  if (rawValue.trim() === '') {
    dispatch({
      type: 'UPDATE_COMPONENT',
      payload: { id: componentId, updates: { [key]: Number.POSITIVE_INFINITY } },
    });
    return;
  }

  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return;
  }

  dispatch({
    type: 'UPDATE_COMPONENT',
    payload: { id: componentId, updates: { [key]: round3(value) } },
  });
}

function formatFixed3(value: number): string {
  if (!Number.isFinite(value)) {
    return '';
  }
  return value.toFixed(3);
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function getSelectionCardHeight(kind: OpticalComponent['kind']) {
  if (kind === 'source') return 270;
  if (kind === 'cavity_fp') return 290;
  return 220;
}

function getSelectionPopoverPosition({
  componentPx,
  viewportSize,
  cardWidth,
  cardHeight,
  marginPx,
}: {
  componentPx: Point2d;
  viewportSize: { width: number; height: number };
  cardWidth: number;
  cardHeight: number;
  marginPx: number;
}) {
  const anchorBelow = componentPx.y < viewportSize.height * 0.5;
  const unclampedTop = anchorBelow ? componentPx.y + marginPx : componentPx.y - cardHeight - marginPx;
  return {
    left: Math.max(marginPx, Math.min(viewportSize.width - cardWidth - marginPx, componentPx.x + 12)),
    top: Math.max(marginPx, Math.min(viewportSize.height - cardHeight - marginPx, unclampedTop)),
  };
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
