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
import { TargetRenderer } from './components/TargetRenderer';
import { BeamStopRenderer } from './components/BeamStopRenderer';
import { CustomObjectRenderer } from './components/CustomObjectRenderer';
import { CavityStabilityDiagram } from './components/CavityStabilityDiagram';
import { GridOverlay } from './GridOverlay';
import { BeamCorridorOverlay } from './BeamCorridorOverlay';
import { TuningRangeOverlay } from './TuningRangeOverlay';
import { snapPointToGrid, gridSpacingMm } from '../../app/state/snapToGrid';
import { parseCavityRadius } from '../../app/state/cavityRadius';
import { NumericField } from '../shared/NumericField';
import lockIcon from '../../../icons/lock.svg';
import lockOpenIcon from '../../../icons/lock-open.svg';
import eyeIcon from '../../../icons/eye.svg';
import eyeOffIcon from '../../../icons/eye-off.svg';
import rotateCcwIcon from '../../../icons/rotate-ccw.svg';
import rotateCwIcon from '../../../icons/rotate-cw.svg';
import trashIcon from '../../../icons/trash-2.svg';
import zoomInIcon from '../../../icons/zoom-in.svg';
import zoomOutIcon from '../../../icons/zoom-out.svg';
import fullscreenIcon from '../../../icons/fullscreen.svg';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 6;

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
  const selectionCardWidthWithStability = 452;
  const stageRef = useRef<Konva.Stage>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const { state, dispatch } = useAppStore();
  const [viewportSize, setViewportSize] = React.useState({ width: 960, height: 420 });
  const [showStability, setShowStability] = React.useState(false);
  // Camera transform for zoom/pan: an additional scale+offset layered on top
  // of tableScale's fit-to-viewport sizing, applied to the Stage itself
  // rather than baked into mmToPx, so component geometry math stays simple.
  const [view, setView] = React.useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = React.useState(false);
  // Freezes the camera transform (pan + zoom) independent of locking
  // individual components - defaults unlocked so existing pan/zoom behavior
  // is unchanged until the user opts in.
  const [viewLocked, setViewLocked] = React.useState(false);
  const source = sourceId ? components[sourceId] : null;
  const sourceComponent = source && source.kind === 'source' ? (source as SourceComponent) : null;
  const selected = state.selectedComponentId ? state.components[state.selectedComponentId] : null;
  const isSelectedOnPath =
    !!selected && (beamPath?.segments.some((segment) => segment.terminatedByComponentId === selected.id) ?? false);

  // Collapse the stability panel whenever the selection changes, rather than
  // leaving it expanded (and pinned to a stale cardHeight) for whatever gets
  // selected next.
  React.useEffect(() => {
    setShowStability(false);
  }, [state.selectedComponentId]);
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

  // Converts between "content space" (the tablePadding + mmToPx pixel space
  // every renderer already works in) and "screen space" (actual pixels
  // within the viewport, after the Stage's own pan/zoom transform).
  const toScreenPx = React.useCallback(
    (contentPx: Point2d): Point2d => ({
      x: view.x + contentPx.x * view.scale,
      y: view.y + contentPx.y * view.scale,
    }),
    [view]
  );

  const toContentPx = React.useCallback(
    (screenPx: Point2d): Point2d => ({
      x: (screenPx.x - view.x) / view.scale,
      y: (screenPx.y - view.y) / view.scale,
    }),
    [view]
  );

  const zoomAround = React.useCallback((anchorScreenPx: Point2d, factor: number) => {
    setView((prev) => {
      const anchorContentX = (anchorScreenPx.x - prev.x) / prev.scale;
      const anchorContentY = (anchorScreenPx.y - prev.y) / prev.scale;
      const nextScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev.scale * factor));
      return {
        scale: nextScale,
        x: anchorScreenPx.x - anchorContentX * nextScale,
        y: anchorScreenPx.y - anchorContentY * nextScale,
      };
    });
  }, []);

  const resetView = React.useCallback(() => setView({ x: 0, y: 0, scale: 1 }), []);

  const handleWheel = (event: Konva.KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault();
    if (viewLocked) {
      return;
    }
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!pointer) {
      return;
    }

    if (event.evt.ctrlKey || event.evt.metaKey) {
      // Pinch-zoom gesture (reported by browsers as ctrl+wheel) or explicit
      // ctrl/cmd+scroll: zoom centered on the pointer.
      const zoomFactor = Math.exp(-event.evt.deltaY * 0.0025);
      zoomAround(pointer, zoomFactor);
    } else {
      // Plain wheel/two-finger scroll: pan.
      setView((prev) => ({ ...prev, x: prev.x - event.evt.deltaX, y: prev.y - event.evt.deltaY }));
    }
  };

  const handleStageMouseDown = (event: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current;
    if (!stage || event.target !== stage) {
      return;
    }

    const startClientX = event.evt.clientX;
    const startClientY = event.evt.clientY;
    const startView = view;
    let didPan = false;

    const handleWindowMouseMove = (moveEvent: MouseEvent) => {
      if (viewLocked) {
        return;
      }
      const dx = moveEvent.clientX - startClientX;
      const dy = moveEvent.clientY - startClientY;
      if (!didPan && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        didPan = true;
        setIsPanning(true);
      }
      if (didPan) {
        setView({ x: startView.x + dx, y: startView.y + dy, scale: startView.scale });
      }
    };

    const handleWindowMouseUp = () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
      setIsPanning(false);
      if (!didPan) {
        dispatch({ type: 'SET_SELECTED_COMPONENT', payload: { componentId: null } });
      }
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
  };

  const clampToTableCenter = React.useCallback(
    (point: Point2d): Point2d => ({
      x: Math.max(0, Math.min(config.width, point.x)),
      y: Math.max(0, Math.min(config.height, point.y)),
    }),
    [config.height, config.width]
  );

  // Finds the beam segment nearest to `point` and, only if `point` is within
  // `thresholdMm` of that segment's axis (transversely), returns the point
  // projected onto the axis. Otherwise returns null: the object is too far
  // from the beam to be considered part of the path, and must keep its own
  // dragged-to position rather than being forced back onto the beam.
  const nearestBeamAxisSnap = React.useCallback(
    (point: Point2d, thresholdMm: number): { position: Point2d; direction: CardinalDirection } | null => {
      if (!beamPath || !beamPath.isValid || beamPath.segments.length === 0) {
        return null;
      }

      let best: Point2d | null = null;
      let bestDirection: CardinalDirection | null = null;
      let bestTransverse = Number.POSITIVE_INFINITY;
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
          bestTransverse = transverse;
          best = snapped;
          bestDirection = segment.direction;
        }
      }

      if (best === null || bestDirection === null || bestTransverse > thresholdMm) {
        return null;
      }

      return { position: best, direction: bestDirection };
    },
    [beamPath]
  );

  const normalizePosition = React.useCallback(
    (component: OpticalComponent, rawPos: Point2d): { position: Point2d; direction: CardinalDirection | null } => {
      let next = clampToTableCenter(rawPos);

      if (!config.snapToGrid) {
        return { position: next, direction: null };
      }

      if (component.kind === 'source' || component.kind === 'mirror_flat') {
        next = snapPointToGrid(next, config.gridStandard);
        return { position: clampToTableCenter(next), direction: null };
      }

      if (
        component.kind === 'lens_thin' ||
        component.kind === 'cavity_fp' ||
        component.kind === 'target' ||
        component.kind === 'beam_stop' ||
        component.kind === 'custom_object'
      ) {
        // Only snap onto the beam axis while the drag stays within the same
        // capture distance the physics engine uses to decide whether this
        // object is actually part of the beam path (beamPathResolver.ts).
        // Beyond that, the object keeps its own dragged-to position and
        // drops out of the beam entirely.
        const thresholdMm =
          component.kind === 'cavity_fp' ? gridSpacingMm(config.gridStandard) : config.axisCaptureThreshold;
        const snapped = nearestBeamAxisSnap(next, thresholdMm);
        if (snapped) {
          // A cavity's visual orientation should always match the beam it
          // just snapped onto, rather than whatever it was rotated to before.
          return { position: clampToTableCenter(snapped.position), direction: snapped.direction };
        }
      }

      return { position: clampToTableCenter(next), direction: null };
    },
    [clampToTableCenter, config.axisCaptureThreshold, config.gridStandard, config.snapToGrid, nearestBeamAxisSnap]
  );

  const dispatchNormalizedPosition = (componentId: string, component: OpticalComponent, newPos: Point2d) => {
    const normalized = normalizePosition(component, newPos);
    if (component.kind === 'cavity_fp' && normalized.direction) {
      dispatch({
        type: 'UPDATE_COMPONENT',
        payload: {
          id: componentId,
          updates: { position: normalized.position, direction: normalized.direction },
        },
      });
      return;
    }

    dispatch({
      type: 'UPDATE_COMPONENT',
      payload: {
        id: componentId,
        updates: { position: normalized.position },
      },
    });
  };

  const handleComponentDragEnd = (componentId: string, newPos: Point2d) => {
    const component = components[componentId];
    if (!component) {
      return;
    }
    dispatchNormalizedPosition(componentId, component, newPos);
  };

  const handleComponentDragMove = (componentId: string, newPos: Point2d) => {
    const component = components[componentId];
    if (!component) {
      return;
    }
    dispatchNormalizedPosition(componentId, component, newPos);
  };

  const getSnappedDragPositionPx = React.useCallback(
    (component: OpticalComponent, rawPx: Point2d): Point2d => {
      // dragBoundFunc receives/returns absolute (screen) pixels, which no
      // longer match content pixels once the Stage has its own pan/zoom.
      const contentPx = toContentPx(rawPx);
      const widthPx = viewportSize.width - tablePadding * 2;
      const heightPx = viewportSize.height - tablePadding * 2;
      const pointMm = {
        x: (contentPx.x - tablePadding) / tableScale,
        y: (contentPx.y - tablePadding) / tableScale,
      };
      const normalized = normalizePosition(component, pointMm).position;
      const clampedContentPx = {
        x: Math.max(tablePadding, Math.min(tablePadding + widthPx, tablePadding + mmToPx(normalized.x))),
        y: Math.max(tablePadding, Math.min(tablePadding + heightPx, tablePadding + mmToPx(normalized.y))),
      };
      return toScreenPx(clampedContentPx);
    },
    [mmToPx, normalizePosition, tablePadding, tableScale, toContentPx, toScreenPx, viewportSize.height, viewportSize.width]
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

  const stabilityPanelOpen = selected?.kind === 'cavity_fp' && showStability;

  const selectedOverlayPos = selected
    ? getSelectionPopoverPosition({
        componentPx: toScreenPx({
          x: tablePadding + mmToPx(selected.position.x),
          y: tablePadding + mmToPx(selected.position.y),
        }),
        viewportSize,
        cardWidth: stabilityPanelOpen ? selectionCardWidthWithStability : selectionCardWidth,
        cardHeight: getSelectionCardHeight(selected.kind) + (stabilityPanelOpen ? 120 : 0),
        marginPx: 12,
      })
    : null;

  return (
    <div ref={viewportRef} className="table-canvas-shell">
      <Stage
        ref={stageRef}
        width={viewportSize.width}
        height={viewportSize.height}
        x={view.x}
        y={view.y}
        scaleX={view.scale}
        scaleY={view.scale}
        style={{
          backgroundColor: '#3b4249',
          cursor: isPanning ? 'grabbing' : 'default',
        }}
        onWheel={handleWheel}
        onMouseDown={handleStageMouseDown}
        onMouseMove={() => {
          const stage = stageRef.current;
          if (!stage || !beamPath || !beamPath.isValid) {
            return;
          }

          const pointer = stage.getPointerPosition();
          if (!pointer) {
            return;
          }

          const contentPx = toContentPx(pointer);
          const pointMm = {
            x: (contentPx.x - tablePadding) / tableScale,
            y: (contentPx.y - tablePadding) / tableScale,
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

            <TuningRangeOverlay
              beamPath={beamPath}
              manualRanges={state.optimiser.manualRangesEnabled ? state.optimiser.manualRanges : []}
              gridStandard={config.gridStandard}
              mmToPx={mmToPx}
            />

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
                    spacingMm={gridSpacingMm(config.gridStandard)}
                    onDragMove={handleComponentDragMove}
                    onDragEnd={handleComponentDragEnd}
                    onSelect={selectComponent}
                    isDraggable={!component.locked}
                    isSelected={state.selectedComponentId === component.id}
                    getSnappedDragPositionPx={getSnappedDragPositionPx}
                  />
                )}
                {component.kind === 'mirror_flat' && (
                  <MirrorRenderer
                    component={component}
                    mmToPx={mmToPx}
                    onDragMove={handleComponentDragMove}
                    onDragEnd={handleComponentDragEnd}
                    onSelect={selectComponent}
                    isDraggable={!component.locked}
                    isSelected={state.selectedComponentId === component.id}
                    getSnappedDragPositionPx={getSnappedDragPositionPx}
                  />
                )}
                {component.kind === 'lens_thin' && (
                  <LensRenderer
                    component={component}
                    mmToPx={mmToPx}
                    onDragMove={handleComponentDragMove}
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
                    onDragMove={handleComponentDragMove}
                    onDragEnd={handleComponentDragEnd}
                    onSelect={selectComponent}
                    isDraggable={!component.locked}
                    isSelected={state.selectedComponentId === component.id}
                    getSnappedDragPositionPx={getSnappedDragPositionPx}
                    wavelengthNm={sourceComponent?.wavelength ?? 1064}
                  />
                )}
                {component.kind === 'target' && (
                  <TargetRenderer
                    component={component}
                    mmToPx={mmToPx}
                    onDragMove={handleComponentDragMove}
                    onDragEnd={handleComponentDragEnd}
                    onSelect={selectComponent}
                    isDraggable={!component.locked}
                    isSelected={state.selectedComponentId === component.id}
                    getSnappedDragPositionPx={getSnappedDragPositionPx}
                  />
                )}
                {component.kind === 'beam_stop' && (
                  <BeamStopRenderer
                    component={component}
                    mmToPx={mmToPx}
                    onDragMove={handleComponentDragMove}
                    onDragEnd={handleComponentDragEnd}
                    onSelect={selectComponent}
                    isDraggable={!component.locked}
                    isSelected={state.selectedComponentId === component.id}
                    getSnappedDragPositionPx={getSnappedDragPositionPx}
                  />
                )}
                {component.kind === 'custom_object' && (
                  <CustomObjectRenderer
                    component={component}
                    mmToPx={mmToPx}
                    onDragMove={handleComponentDragMove}
                    onDragEnd={handleComponentDragEnd}
                    onSelect={selectComponent}
                    isDraggable={!component.locked}
                    isSelected={state.selectedComponentId === component.id}
                    axisDirection={lensAxisDirection(beamPath, component.id, component.position)}
                    getSnappedDragPositionPx={getSnappedDragPositionPx}
                  />
                )}
              </React.Fragment>
            ))}
          </Group>
        </Layer>
      </Stage>

      <div className="canvas-zoom-controls">
        <button
          type="button"
          className="icon-button"
          aria-label="Zoom out"
          disabled={viewLocked}
          onClick={() => zoomAround({ x: viewportSize.width / 2, y: viewportSize.height / 2 }, 1 / 1.25)}
        >
          <img className="icon-glyph" src={zoomOutIcon} alt="" />
        </button>
        <span className="canvas-zoom-readout">{Math.round(view.scale * 100)}%</span>
        <button
          type="button"
          className="icon-button"
          aria-label="Zoom in"
          disabled={viewLocked}
          onClick={() => zoomAround({ x: viewportSize.width / 2, y: viewportSize.height / 2 }, 1.25)}
        >
          <img className="icon-glyph" src={zoomInIcon} alt="" />
        </button>
        <button type="button" className="icon-button" aria-label="Reset view" title="Reset view" onClick={resetView}>
          <img className="icon-glyph" src={fullscreenIcon} alt="" />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={viewLocked ? 'Unlock table view' : 'Lock table view'}
          title={viewLocked ? 'Unlock table view (allow pan/zoom)' : 'Lock table view (prevent pan/zoom)'}
          onClick={() => setViewLocked((locked) => !locked)}
        >
          <img className="icon-glyph" src={viewLocked ? lockIcon : lockOpenIcon} alt="" />
        </button>
      </div>

      {selected && selectedOverlayPos && (
        <div
          className={stabilityPanelOpen ? 'canvas-selection-popover canvas-selection-popover--wide' : 'canvas-selection-popover'}
          style={{ left: selectedOverlayPos.left, top: selectedOverlayPos.top }}
        >
          <div className="canvas-selection-topbar">
            <div className="canvas-selection-header">{selected.label}</div>
            <div className="canvas-selection-topbar-actions">
              {(selected.kind === 'cavity_fp' || selected.kind === 'target') && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label={selected.showProjection ? 'Hide mode projection' : 'Show mode projection'}
                  onClick={() =>
                    dispatch({
                      type: 'UPDATE_COMPONENT',
                      payload: { id: selected.id, updates: { showProjection: !selected.showProjection } },
                    })
                  }
                >
                  <img className="icon-glyph" src={selected.showProjection ? eyeIcon : eyeOffIcon} alt="" />
                </button>
              )}
              <button
                type="button"
                className="icon-button"
                aria-label={selected.locked ? 'Unlock component' : 'Lock component'}
                onClick={toggleLockSelected}
              >
                <img className="icon-glyph" src={selected.locked ? lockIcon : lockOpenIcon} alt="" />
              </button>
              {selected.kind !== 'source' && (
                <button type="button" className="icon-button danger-button" aria-label="Delete component" onClick={deleteSelected}>
                  <img className="icon-glyph" src={trashIcon} alt="" />
                </button>
              )}
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
              <NumericField
                value={selected.position.x}
                onCommit={(value) => updateCanvasPosition(dispatch, config, selected.id, selected.position, 'x', value)}
              />
            </label>
            <label>
              Y (mm)
              <NumericField
                value={selected.position.y}
                onCommit={(value) => updateCanvasPosition(dispatch, config, selected.id, selected.position, 'y', value)}
              />
            </label>
          </div>
          <div className="canvas-selection-actions">
            {(selected.kind === 'mirror_flat' ||
              selected.kind === 'source' ||
              (selected.kind === 'cavity_fp' && !isSelectedOnPath)) && (
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
                <NumericField
                  value={selected.waistRadius * 1000}
                  format={(value) => String(Math.round(value))}
                  onCommit={(value) =>
                    dispatch({
                      type: 'UPDATE_COMPONENT',
                      payload: {
                        id: selected.id,
                        updates: { waistRadius: Math.max(1, value) / 1000 },
                      },
                    })
                  }
                />
              </label>
              <label>
                Waist z (mm)
                <NumericField
                  value={selected.waistOffset}
                  onCommit={(value) =>
                    dispatch({
                      type: 'UPDATE_COMPONENT',
                      payload: {
                        id: selected.id,
                        updates: { waistOffset: round3(value) },
                      },
                    })
                  }
                />
              </label>
              <label>
                lambda (nm)
                <NumericField
                  value={selected.wavelength}
                  onCommit={(value) =>
                    dispatch({
                      type: 'UPDATE_COMPONENT',
                      payload: {
                        id: selected.id,
                        updates: { wavelength: Math.max(1, value) },
                      },
                    })
                  }
                />
              </label>
            </div>
          )}

          {selected.kind === 'lens_thin' && (
            <div className="canvas-source-editor">
              <label>
                Focal length (mm)
                <NumericField
                  value={selected.focalLength}
                  onCommit={(value) =>
                    dispatch({
                      type: 'UPDATE_COMPONENT',
                      payload: { id: selected.id, updates: { focalLength: round3(value) } },
                    })
                  }
                />
              </label>
            </div>
          )}

          {selected.kind === 'custom_object' && (
            <div className="canvas-source-editor">
              <label>
                Index of refraction
                <NumericField
                  value={selected.indexOfRefraction}
                  onCommit={(value) =>
                    dispatch({
                      type: 'UPDATE_COMPONENT',
                      payload: { id: selected.id, updates: { indexOfRefraction: Math.max(0.01, round3(value)) } },
                    })
                  }
                />
              </label>
              <label>
                Thickness (mm)
                <NumericField
                  value={selected.thickness}
                  onCommit={(value) =>
                    dispatch({
                      type: 'UPDATE_COMPONENT',
                      payload: { id: selected.id, updates: { thickness: Math.max(0.001, round3(value)) } },
                    })
                  }
                />
              </label>
            </div>
          )}

          {selected.kind === 'target' && (
            <div className="canvas-source-editor">
              <label>
                Waist r (um)
                <NumericField
                  value={selected.waistRadius * 1000}
                  format={(value) => String(Math.round(value))}
                  onCommit={(value) =>
                    dispatch({
                      type: 'UPDATE_COMPONENT',
                      payload: { id: selected.id, updates: { waistRadius: Math.max(1, value) / 1000 } },
                    })
                  }
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
            <div className="canvas-cavity-body">
              <div className="canvas-source-editor">
                <label>
                  Length (mm)
                  <NumericField
                    value={selected.length}
                    onCommit={(value) =>
                      dispatch({
                        type: 'UPDATE_COMPONENT',
                        payload: { id: selected.id, updates: { length: round3(Math.max(1, value)) } },
                      })
                    }
                  />
                </label>
                <div className="canvas-radius-pair">
                  <label>
                    RoC1 (mm)
                    <div className="canvas-radius-row">
                      <NumericField
                        className="canvas-radius-input"
                        value={selected.r1}
                        parse={parseCavityRadius}
                        placeholder="Infinity"
                        onCommit={(value) => updateCavityRadius(dispatch, selected.id, 'r1', value)}
                      />
                      <label className="canvas-radius-flat-toggle">
                        <input
                          type="checkbox"
                          checked={!Number.isFinite(selected.r1)}
                          onChange={(event) =>
                            updateCavityRadius(dispatch, selected.id, 'r1', event.target.checked ? Number.POSITIVE_INFINITY : 100)
                          }
                        />
                        flat
                      </label>
                    </div>
                  </label>
                  <label>
                    RoC2 (mm)
                    <div className="canvas-radius-row">
                      <NumericField
                        className="canvas-radius-input"
                        value={selected.r2}
                        parse={parseCavityRadius}
                        placeholder="Infinity"
                        onCommit={(value) => updateCavityRadius(dispatch, selected.id, 'r2', value)}
                      />
                      <label className="canvas-radius-flat-toggle">
                        <input
                          type="checkbox"
                          checked={!Number.isFinite(selected.r2)}
                          onChange={(event) =>
                            updateCavityRadius(dispatch, selected.id, 'r2', event.target.checked ? Number.POSITIVE_INFINITY : 100)
                          }
                        />
                        flat
                      </label>
                    </div>
                  </label>
                </div>
                <button
                  type="button"
                  className="cavity-stability-toggle"
                  onClick={() => setShowStability((open) => !open)}
                >
                  {showStability ? 'Hide Stability' : 'See Stability'}
                </button>
              </div>
              {showStability && (
                <CavityStabilityDiagram lengthMm={selected.length} r1Mm={selected.r1} r2Mm={selected.r2} />
              )}
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
  value: number
) {
  dispatch({
    type: 'UPDATE_COMPONENT',
    payload: { id: componentId, updates: { [key]: Number.isFinite(value) ? round3(value) : value } },
  });
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function getSelectionCardHeight(kind: OpticalComponent['kind']) {
  if (kind === 'source') return 270;
  if (kind === 'cavity_fp') return 290;
  if (kind === 'custom_object') return 250;
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
