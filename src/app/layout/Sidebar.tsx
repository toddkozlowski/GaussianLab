import { useMemo, useState } from 'react';
import { useAppStore } from '../adapters/useAppStore';
import {
  createCavityFPComponent,
  createFlatMirrorComponent,
  createLensThinComponent,
  createSourceComponent,
} from '../state/componentFactories';

export function Sidebar() {
  const { state, dispatch, runSolver, previewSolution, applySolution } = useAppStore();
  const [manualWaistRadius, setManualWaistRadius] = useState(0.05);
  const [manualWaistZ, setManualWaistZ] = useState(300);
  const [selectedCavityId, setSelectedCavityId] = useState<string>('');

  const selected = state.selectedComponentId ? state.components[state.selectedComponentId] : null;
  const cavities = useMemo(
    () => Object.values(state.components).filter((component) => component.kind === 'cavity_fp'),
    [state.components]
  );

  const addSource = () => {
    const source = createSourceComponent(state.components, { x: 80, y: state.table.height / 2 });
    dispatch({ type: 'ADD_COMPONENT', payload: source });
    dispatch({ type: 'SET_SOURCE_ID', payload: { sourceId: source.id } });
  };

  const addMirror = () => {
    const mirror = createFlatMirrorComponent(state.components, { x: 280, y: state.table.height / 2 });
    dispatch({ type: 'ADD_COMPONENT', payload: mirror });
  };

  const addLens = () => {
    const lens = createLensThinComponent(state.components, { x: 420, y: state.table.height / 2 });
    dispatch({ type: 'ADD_COMPONENT', payload: lens });
  };

  const addCavity = () => {
    const cavity = createCavityFPComponent(state.components, { x: 620, y: state.table.height / 2 });
    dispatch({ type: 'ADD_COMPONENT', payload: cavity });
  };

  const setManualTarget = () => {
    dispatch({
      type: 'SET_TARGET_MODE',
      payload: {
        targetMode: {
          kind: 'manual',
          waistRadius: Math.max(0.01, manualWaistRadius),
          waistZ: Math.max(0, manualWaistZ),
        },
      },
    });
  };

  const setCavityTarget = () => {
    if (!selectedCavityId) {
      return;
    }
    dispatch({
      type: 'SET_TARGET_MODE',
      payload: {
        targetMode: {
          kind: 'cavity',
          cavityComponentId: selectedCavityId,
        },
      },
    });
  };

  return (
    <aside className="sidebar" aria-label="Simulation controls">
      <section className="panel">
        <header className="panel-header">
          <div>
            <h3>Component Palette</h3>
            <p>Source, flat mirror, thin lens, and cavity controls land here first.</p>
          </div>
        </header>
        <div className="panel-body">
          <div className="stack">
            <button type="button" onClick={addSource}>Add source</button>
            <button type="button" onClick={addMirror}>Add flat mirror</button>
            <button type="button" onClick={addLens}>Add thin lens</button>
            <button type="button" onClick={addCavity}>Add cavity</button>
          </div>
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h3>Selected Component</h3>
            <p>Inspector forms are added once the reducer and schema exist.</p>
          </div>
        </header>
        <div className="panel-body">
          {selected ? (
            <div className="stack">
              <p className="muted">{selected.label} ({selected.kind})</p>
              <button
                type="button"
                onClick={() => dispatch({ type: 'LOCK_COMPONENT', payload: { id: selected.id, locked: !selected.locked } })}
              >
                {selected.locked ? 'Unlock' : 'Lock'} component
              </button>
            </div>
          ) : (
            <p className="muted">No component selected.</p>
          )}
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h3>Mode Matching</h3>
            <p>Set a target and run solver explicitly.</p>
          </div>
        </header>
        <div className="panel-body">
          <div className="stack">
            <label>
              Manual waist radius (mm)
              <input
                type="number"
                value={manualWaistRadius}
                min={0.01}
                step={0.01}
                onChange={(event) => setManualWaistRadius(Number(event.target.value))}
              />
            </label>
            <label>
              Manual waist z (mm)
              <input
                type="number"
                value={manualWaistZ}
                min={0}
                step={10}
                onChange={(event) => setManualWaistZ(Number(event.target.value))}
              />
            </label>
            <button type="button" onClick={setManualTarget}>Use manual target</button>

            <label>
              Cavity target
              <select
                value={selectedCavityId}
                onChange={(event) => setSelectedCavityId(event.target.value)}
              >
                <option value="">Select cavity...</option>
                {cavities.map((cavity) => (
                  <option key={cavity.id} value={cavity.id}>{cavity.label}</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={setCavityTarget} disabled={!selectedCavityId}>Use cavity target</button>

            <button type="button" onClick={() => runSolver(5)}>Run optimizer</button>

            {state.optimiser.solutions.length === 0 ? (
              <p className="muted">No solutions yet.</p>
            ) : (
              <div className="stack">
                {state.optimiser.solutions.map((solution, index) => (
                  <div key={solution.id} className="status-pill">
                    <strong>#{index + 1} {(solution.overlap * 100).toFixed(1)}%</strong>
                    <span>{solution.summary}</span>
                    <div className="stack">
                      <button type="button" onClick={() => previewSolution(index)}>Preview</button>
                      <button type="button" onClick={() => applySolution(index)}>Apply</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h3>Implementation Notes</h3>
            <p>Phase 0 scaffold is in place; physics and resolver code remain isolated for the next step.</p>
          </div>
        </header>
        <div className="panel-body">
          <ul className="list">
            <li>State stays in mm and nm.</li>
            <li>Kernel converts to SI internally.</li>
            <li>Beam encounter order is geometric, never insertion order.</li>
          </ul>
        </div>
      </section>
    </aside>
  );
}
