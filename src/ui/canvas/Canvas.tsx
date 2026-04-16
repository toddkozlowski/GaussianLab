/**
 * Layer 2: Konva Canvas
 *
 * Renders optical components on an interactive canvas.
 * Components can be dragged with snapping and axis-capture logic.
 */

import React, { useRef } from 'react';
import { Stage, Layer } from 'react-konva';
import type Konva from 'konva';
import { useAppStore } from '../../app/adapters/useAppStore';
import type {
  TableConfig,
  OpticalComponent,
  Point2d,
  BeamPath,
  PropagationResult,
  SourceComponent,
} from '../../app/state/schema';
import { SourceRenderer } from './components/SourceRenderer';
import { MirrorRenderer } from './components/MirrorRenderer';
import { LensRenderer } from './components/LensRenderer';
import { CavityRenderer } from './components/CavityRenderer';
import { GridOverlay } from './GridOverlay';
import { BeamCorridorOverlay } from './BeamCorridorOverlay';

interface CanvasProps {
  config: TableConfig;
  components: Record<string, OpticalComponent>;
  sourceId: string | null;
  beamPath: BeamPath | null;
  propagationResult: PropagationResult | null;
}

export const Canvas: React.FC<CanvasProps> = ({
  config,
  components,
  sourceId,
  beamPath,
  propagationResult,
}) => {
  const stageRef = useRef<Konva.Stage>(null);
  const { dispatch } = useAppStore();
  const source = sourceId ? components[sourceId] : null;
  const sourceComponent = source && source.kind === 'source' ? (source as SourceComponent) : null;

  const isJsdomTestEnv =
    typeof window !== 'undefined' &&
    typeof window.navigator !== 'undefined' &&
    /jsdom/i.test(window.navigator.userAgent);

  // Convert mm (schema units) to px for display
  const mmToPx = (mm: number) => mm * 2; // 1mm = 2px display scale

  const handleComponentDragEnd = (componentId: string, newPos: Point2d) => {
    dispatch({
      type: 'UPDATE_COMPONENT',
      payload: {
        id: componentId,
        updates: { position: newPos },
      },
    });
  };

  if (isJsdomTestEnv) {
    return (
      <div style={{ border: '1px solid #ccc', overflow: 'hidden', height: '100%' }}>
        <div className="canvas-placeholder">Konva canvas unavailable in test environment.</div>
      </div>
    );
  }

  return (
    <div style={{ border: '1px solid #ccc', overflow: 'hidden', height: '100%' }}>
      <Stage
        ref={stageRef}
        width={config.width}
        height={config.height}
        style={{
          backgroundColor: '#f9f9f9',
        }}
      >
        <Layer>
          {/* Grid background */}
          <GridOverlay config={config} mmToPx={mmToPx} />

          {/* Layer 3: beam corridor and centerline */}
          <BeamCorridorOverlay
            beamPath={beamPath}
            source={sourceComponent}
            propagationResult={propagationResult}
            mmToPx={mmToPx}
          />

          {/* Render all components */}
          {Object.values(components).map((component) => (
            <React.Fragment key={component.id}>
              {component.kind === 'source' && (
                <SourceRenderer
                  component={component}
                  mmToPx={mmToPx}
                  onDragEnd={handleComponentDragEnd}
                  isDraggable={!component.locked}
                />
              )}
              {component.kind === 'mirror_flat' && (
                <MirrorRenderer
                  component={component}
                  mmToPx={mmToPx}
                  onDragEnd={handleComponentDragEnd}
                  isDraggable={!component.locked}
                />
              )}
              {component.kind === 'lens_thin' && (
                <LensRenderer
                  component={component}
                  mmToPx={mmToPx}
                  onDragEnd={handleComponentDragEnd}
                  isDraggable={!component.locked}
                />
              )}
              {component.kind === 'cavity_fp' && (
                <CavityRenderer
                  component={component}
                  mmToPx={mmToPx}
                  onDragEnd={handleComponentDragEnd}
                  isDraggable={!component.locked}
                />
              )}
            </React.Fragment>
          ))}
        </Layer>
      </Stage>
    </div>
  );
};
