import { useMemo, useState } from 'react';
import { useAppStore } from '../adapters/useAppStore';
import {
  createCavityFPComponent,
  createFlatMirrorComponent,
  createLensThinComponent,
  createSourceComponent,
} from '../state/componentFactories';
import type { AppState, CardinalDirection, Point2d } from '../state/schema';

export function Sidebar() {
  const { state, dispatch, runSolver, previewSolution, applySolution } = useAppStore();
  const [manualWaistRadiusUm, setManualWaistRadiusUm] = useState(400);
  const [manualWaistZ, setManualWaistZ] = useState(300);
  const [selectedCavityId, setSelectedCavityId] = useState<string>('');
  const [modeMatchingOpen, setModeMatchingOpen] = useState(true);

  const selected = state.selectedComponentId ? state.components[state.selectedComponentId] : null;
  const cavities = useMemo(
    () => Object.values(state.components).filter((component) => component.kind === 'cavity_fp'),
    [state.components]
  );

  const defaultPlacement = getDefaultPlacement(state);

  const addSource = () => {
    const source = createSourceComponent(state.components, defaultPlacement);
    dispatch({ type: 'ADD_COMPONENT', payload: source });
    dispatch({ type: 'SET_SOURCE_ID', payload: { sourceId: source.id } });
    dispatch({ type: 'SET_SELECTED_COMPONENT', payload: { componentId: source.id } });
  };

  const addMirror = () => {
    const mirror = createFlatMirrorComponent(state.components, defaultPlacement);
    dispatch({ type: 'ADD_COMPONENT', payload: mirror });
    dispatch({ type: 'SET_SELECTED_COMPONENT', payload: { componentId: mirror.id } });
  };

  const addLens = () => {
    const lens = createLensThinComponent(state.components, defaultPlacement);
    dispatch({ type: 'ADD_COMPONENT', payload: lens });
    dispatch({ type: 'SET_SELECTED_COMPONENT', payload: { componentId: lens.id } });
  };

  const addCavity = () => {
    const cavity = createCavityFPComponent(state.components, defaultPlacement);
    dispatch({ type: 'ADD_COMPONENT', payload: cavity });
    dispatch({ type: 'SET_SELECTED_COMPONENT', payload: { componentId: cavity.id } });
  };

  const setManualTarget = () => {
    dispatch({
      type: 'SET_TARGET_MODE',
      payload: {
        targetMode: {
          kind: 'manual',
          waistRadius: Math.max(1, manualWaistRadiusUm) / 1000,
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
              <label>
                X (mm)
                <input
                  type="number"
                  value={selected.position.x}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value)) {
                      dispatch({
                        type: 'UPDATE_COMPONENT',
                        payload: {
                          id: selected.id,
                          updates: {
                            position: {
                              ...selected.position,
                              x: clamp(value, 0, state.table.width),
                            },
                          },
                        },
                      });
                    }
                  }}
                />
              </label>
              <label>
                Y (mm)
                <input
                  type="number"
                  value={selected.position.y}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value)) {
                      dispatch({
                        type: 'UPDATE_COMPONENT',
                        payload: {
                          id: selected.id,
                          updates: {
                            position: {
                              ...selected.position,
                              y: clamp(value, 0, state.table.height),
                            },
                          },
                        },
                      });
                    }
                  }}
                />
              </label>

              {selected.kind === 'source' && (
                <>
                  <label>
                    Direction
                    <select
                      value={selected.direction}
                      onChange={(event) =>
                        dispatch({
                          type: 'UPDATE_COMPONENT',
                          payload: {
                            id: selected.id,
                            updates: { direction: event.target.value as CardinalDirection },
                          },
                        })
                      }
                    >
                      <option value="right">right</option>
                      <option value="down">down</option>
                      <option value="left">left</option>
                      <option value="up">up</option>
                    </select>
                  </label>
                  <label>
                    Waist radius (um)
                    <input
                      type="number"
                      step={1}
                      value={Math.round(selected.waistRadius * 1000)}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (Number.isFinite(value)) {
                          dispatch({
                            type: 'UPDATE_COMPONENT',
                            payload: { id: selected.id, updates: { waistRadius: Math.max(1, value) / 1000 } },
                          });
                        }
                      }}
                    />
                  </label>
                  <label>
                    Waist offset (mm)
                    <input
                      type="number"
                      step={0.1}
                      value={selected.waistOffset}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (Number.isFinite(value)) {
                          dispatch({
                            type: 'UPDATE_COMPONENT',
                            payload: { id: selected.id, updates: { waistOffset: value } },
                          });
                        }
                      }}
                    />
                  </label>
                  <label>
                    Wavelength (nm)
                    <input
                      type="number"
                      value={selected.wavelength}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (Number.isFinite(value)) {
                          dispatch({
                            type: 'UPDATE_COMPONENT',
                            payload: { id: selected.id, updates: { wavelength: Math.max(1, value) } },
                          });
                        }
                      }}
                    />
                  </label>
                </>
              )}

              {selected.kind === 'lens_thin' && (
                <>
                  <label>
                    Focal length (mm)
                    <input
                      type="number"
                      value={selected.focalLength}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (Number.isFinite(value)) {
                          dispatch({
                            type: 'UPDATE_COMPONENT',
                            payload: { id: selected.id, updates: { focalLength: value } },
                          });
                        }
                      }}
                    />
                  </label>
                  <label>
                    Optimiser can move
                    <select
                      value={selected.optimiserCanMove ? 'yes' : 'no'}
                      onChange={(event) =>
                        dispatch({
                          type: 'UPDATE_COMPONENT',
                          payload: {
                            id: selected.id,
                            updates: { optimiserCanMove: event.target.value === 'yes' },
                          },
                        })
                      }
                    >
                      <option value="yes">yes</option>
                      <option value="no">no</option>
                    </select>
                  </label>
                </>
              )}

              {selected.kind === 'mirror_flat' && (
                <label>
                  Orientation (deg)
                  <select
                    value={selected.orientation}
                    onChange={(event) =>
                      dispatch({
                        type: 'UPDATE_COMPONENT',
                        payload: {
                          id: selected.id,
                          updates: {
                            orientation: Number(event.target.value) as 45 | 135 | 225 | 315,
                          },
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
              )}

              {selected.kind === 'cavity_fp' && (
                <>
                  <label>
                    Direction
                    <select
                      value={selected.direction}
                      onChange={(event) =>
                        dispatch({
                          type: 'UPDATE_COMPONENT',
                          payload: {
                            id: selected.id,
                            updates: { direction: event.target.value as CardinalDirection },
                          },
                        })
                      }
                    >
                      <option value="right">right</option>
                      <option value="down">down</option>
                      <option value="left">left</option>
                      <option value="up">up</option>
                    </select>
                  </label>
                  <label>
                    Length (mm)
                    <input
                      type="number"
                      value={selected.length}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (Number.isFinite(value)) {
                          dispatch({
                            type: 'UPDATE_COMPONENT',
                            payload: { id: selected.id, updates: { length: Math.max(1, value) } },
                          });
                        }
                      }}
                    />
                  </label>
                  <label>
                    R1 (mm)
                    <input
                      type="number"
                      value={Number.isFinite(selected.r1) ? selected.r1 : ''}
                      placeholder="Infinity"
                      onChange={(event) => {
                        const raw = event.target.value;
                        if (raw.trim() === '') {
                          dispatch({
                            type: 'UPDATE_COMPONENT',
                            payload: { id: selected.id, updates: { r1: Number.POSITIVE_INFINITY } },
                          });
                          return;
                        }
                        const value = Number(raw);
                        if (Number.isFinite(value)) {
                          dispatch({
                            type: 'UPDATE_COMPONENT',
                            payload: { id: selected.id, updates: { r1: value } },
                          });
                        }
                      }}
                    />
                  </label>
                  <label>
                    R2 (mm)
                    <input
                      type="number"
                      value={Number.isFinite(selected.r2) ? selected.r2 : ''}
                      placeholder="Infinity"
                      onChange={(event) => {
                        const raw = event.target.value;
                        if (raw.trim() === '') {
                          dispatch({
                            type: 'UPDATE_COMPONENT',
                            payload: { id: selected.id, updates: { r2: Number.POSITIVE_INFINITY } },
                          });
                          return;
                        }
                        const value = Number(raw);
                        if (Number.isFinite(value)) {
                          dispatch({
                            type: 'UPDATE_COMPONENT',
                            payload: { id: selected.id, updates: { r2: value } },
                          });
                        }
                      }}
                    />
                  </label>
                </>
              )}

              {selected && state.propagationResult && (
                <p className="muted">
                  Beam radius at component: {beamRadiusAtComponent(state, selected.id)?.toFixed(4) ?? 'n/a'} mm
                </p>
              )}
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
          <button type="button" onClick={() => setModeMatchingOpen((open) => !open)}>
            {modeMatchingOpen ? 'Hide' : 'Show'}
          </button>
        </header>
        {modeMatchingOpen && (
        <div className="panel-body">
          <div className="stack">
            <label>
              Manual waist radius (um)
              <input
                type="number"
                value={manualWaistRadiusUm}
                min={1}
                step={1}
                onChange={(event) => setManualWaistRadiusUm(Number(event.target.value))}
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
        )}
      </section>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h3>Run Diagnostics</h3>
            <p>Collapsed by default to keep workspace focused.</p>
          </div>
        </header>
        <div className="panel-body">
          <details>
            <summary>Show path/overlap/solver</summary>
            <ul className="list">
              <li>
                Path: {!state.sourceId
                  ? 'No source placed'
                  : state.beamPath?.isValid
                    ? `${state.beamPath.segments.length} segment(s)`
                    : state.beamPath?.invalidReason ?? 'Invalid path'}
              </li>
              <li>
                Overlap: {state.optimiser.solutions.length > 0
                  ? `${(state.optimiser.solutions[0].overlap * 100).toFixed(1)}%`
                  : state.targetMode
                    ? 'Pending solve'
                    : 'Target unset'}
              </li>
              <li>Solver: {state.optimiser.status}</li>
            </ul>
          </details>
        </div>
      </section>
    </aside>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getDefaultPlacement(state: AppState): Point2d {
  const fallback = {
    x: state.table.width * 0.5,
    y: state.table.height * 0.5,
  };

  const path = state.beamPath;
  if (!path || !path.isValid || path.segments.length === 0) {
    return fallback;
  }

  const lastHitIndex = [...path.segments]
    .map((segment, index) => ({ segment, index }))
    .reverse()
    .find((entry) => entry.segment.terminatedByComponentId && entry.segment.termination === 'component');

  const offsetMm = 60;
  if (!lastHitIndex) {
    const segment = path.segments[0];
    return clampToTable(moveAlong(segment.start, segment.direction, offsetMm), state);
  }

  const currentSegment = path.segments[lastHitIndex.index];
  const downstreamSegment = path.segments[lastHitIndex.index + 1];
  const direction = downstreamSegment?.direction ?? currentSegment.direction;
  return clampToTable(moveAlong(currentSegment.end, direction, offsetMm), state);
}

function moveAlong(origin: Point2d, direction: CardinalDirection, distance: number): Point2d {
  if (direction === 'right') {
    return { x: origin.x + distance, y: origin.y };
  }
  if (direction === 'left') {
    return { x: origin.x - distance, y: origin.y };
  }
  if (direction === 'down') {
    return { x: origin.x, y: origin.y + distance };
  }
  return { x: origin.x, y: origin.y - distance };
}

function clampToTable(point: Point2d, state: AppState): Point2d {
  return {
    x: clamp(point.x, 0, state.table.width),
    y: clamp(point.y, 0, state.table.height),
  };
}

function beamRadiusAtComponent(state: AppState, componentId: string): number | null {
  const z = state.beamPath?.segments.find((segment) => segment.terminatedByComponentId === componentId)?.zEnd;
  if (z === undefined) {
    return null;
  }

  const profile = state.propagationResult?.profile;
  if (!profile || profile.length === 0) {
    return null;
  }

  let nearest = profile[0];
  let nearestDistance = Math.abs(profile[0].z - z);
  for (let i = 1; i < profile.length; i += 1) {
    const candidate = profile[i];
    const distance = Math.abs(candidate.z - z);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }

  return nearest.w;
}
