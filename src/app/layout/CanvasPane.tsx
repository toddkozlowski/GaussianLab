import { useAppStore } from '../adapters/useAppStore';
import { Canvas } from '../../ui/canvas/Canvas';

export function CanvasPane() {
  const { state } = useAppStore();

  return (
    <section className="panel" aria-labelledby="table-canvas-title">
      <header className="panel-header">
        <div>
          <h2 id="table-canvas-title">Optical Table</h2>
          <p>Drag components to reposition. Grid snapping enabled.</p>
        </div>
      </header>
      <div className="panel-body panel-body-canvas">
        <Canvas
          config={state.table}
          components={state.components}
          sourceId={state.sourceId}
          beamPath={state.beamPath}
          propagationResult={state.propagationResult}
        />
      </div>
    </section>
  );
}
