import { useAppStore } from '../adapters/useAppStore';
import { Canvas } from '../../ui/canvas/Canvas';

interface CanvasPaneProps {
  hoveredZMm: number | null;
  onHoverZMm: (zMm: number | null) => void;
}

export function CanvasPane({ hoveredZMm, onHoverZMm }: CanvasPaneProps) {
  const { state } = useAppStore();

  return (
    <section className="panel canvas-panel" aria-label="Optical table canvas">
      <div className="panel-body panel-body-canvas">
        <Canvas
          config={state.table}
          components={state.components}
          sourceId={state.sourceId}
          beamPath={state.beamPath}
          propagationResult={state.propagationResult}
          hoveredZMm={hoveredZMm}
          onHoverZMm={onHoverZMm}
        />
      </div>
    </section>
  );
}
