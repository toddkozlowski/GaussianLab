import { useMemo, useState } from 'react';
import { useAppStore } from '../adapters/useAppStore';
import {
  createCavityFPComponent,
  createFlatMirrorComponent,
  createLensThinComponent,
  createSourceComponent,
} from '../state/componentFactories';
import type { AppState, CardinalDirection, OpticalComponent, Point2d } from '../state/schema';
import chevronDownIcon from '../../../icons/circle-chevron-down.svg';
import chevronUpIcon from '../../../icons/circle-chevron-up.svg';
import helpIcon from '../../../icons/circle-question-mark.svg';
import lockIcon from '../../../icons/lock.svg';
import lockOpenIcon from '../../../icons/lock-open.svg';
import trashIcon from '../../../icons/trash-2.svg';

interface SidebarProps {
  showTargetProfile: boolean;
  onToggleTargetProfile: (value: boolean) => void;
}

export function Sidebar({ showTargetProfile, onToggleTargetProfile }: SidebarProps) {
  const { state, dispatch, runSolver, previewSolution, applySolution } = useAppStore();
  const [manualWaistRadiusUm, setManualWaistRadiusUm] = useState(400);
  const [manualWaistZ, setManualWaistZ] = useState(300);
  const [selectedCavityId, setSelectedCavityId] = useState<string>('');
  const [modeMatchingOpen, setModeMatchingOpen] = useState(false);

  const cavities = useMemo(
    () => Object.values(state.components).filter((component) => component.kind === 'cavity_fp'),
    [state.components]
  );

  const orderedComponents = useMemo(() => getOrderedComponents(state), [state]);
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
            <h3>Beam Path Components</h3>
          </div>
          <details className="help-popout">
            <summary aria-label="Open help">
              <img className="icon-glyph" src={helpIcon} alt="" />
            </summary>
            <div>
              Select a row to focus the same component on the canvas. Edit values inline.
            </div>
          </details>
        </header>
        <div className="panel-body component-table-panel">
          <div className="component-toolbar">
            <button type="button" onClick={addSource}>+ Source</button>
            <button type="button" onClick={addMirror}>+ Mirror</button>
            <button type="button" onClick={addLens}>+ Lens</button>
            <button type="button" onClick={addCavity}>+ Cavity</button>
          </div>
          <div className="component-table-wrap">
            <table className="component-table">
              <thead>
                <tr>
                  <th>Lbl</th>
                  <th>Kind</th>
                  <th>Z</th>
                  <th>Prop</th>
                  <th>Lock</th>
                  <th>Del</th>
                </tr>
              </thead>
              <tbody>
                {orderedComponents.map((component) => {
                  const isSelected = state.selectedComponentId === component.id;
                  const pathPosition = getComponentPathPosition(state, component.id);
                  return (
                    <tr
                      key={component.id}
                      className={isSelected ? 'selected' : undefined}
                      onClick={() => dispatch({ type: 'SET_SELECTED_COMPONENT', payload: { componentId: component.id } })}
                    >
                      <td>
                        <input
                          value={component.label}
                          onChange={(event) => {
                            event.stopPropagation();
                            dispatch({
                              type: 'UPDATE_COMPONENT',
                              payload: { id: component.id, updates: { label: event.target.value } },
                            });
                          }}
                        />
                      </td>
                      <td>{shortKind(component.kind)}</td>
                      <td>
                        <span className="path-position-cell">{formatPathPosition(pathPosition)}</span>
                      </td>
                      <td>{renderPropertyCell(component, dispatch)}</td>
                      <td>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={component.locked ? 'Unlock component' : 'Lock component'}
                          onClick={(event) => {
                            event.stopPropagation();
                            const locked = !component.locked;
                            dispatch({ type: 'LOCK_COMPONENT', payload: { id: component.id, locked } });
                            if (component.kind === 'lens_thin') {
                              dispatch({
                                type: 'UPDATE_COMPONENT',
                                payload: {
                                  id: component.id,
                                  updates: { optimiserCanMove: !locked },
                                },
                              });
                            }
                          }}
                        >
                          <LockIcon locked={component.locked} />
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="icon-button danger-button"
                          aria-label="Delete component"
                          onClick={(event) => {
                            event.stopPropagation();
                            dispatch({ type: 'REMOVE_COMPONENT', payload: { id: component.id } });
                          }}
                        >
                          <img className="icon-glyph" src={trashIcon} alt="" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h3>Mode Matching</h3>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={modeMatchingOpen ? 'Collapse mode matching' : 'Expand mode matching'}
            onClick={() => setModeMatchingOpen((open) => !open)}
          >
            <img className="icon-glyph" src={modeMatchingOpen ? chevronUpIcon : chevronDownIcon} alt="" />
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
                  value={formatFixed3(manualWaistZ)}
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

              <label>
                Show target mode profile
                <input
                  type="checkbox"
                  checked={showTargetProfile}
                  onChange={(event) => onToggleTargetProfile(event.target.checked)}
                />
              </label>

              <button type="button" onClick={() => runSolver(5)}>Run optimizer</button>

              {state.optimiser.solutions.length === 0 ? (
                <p className="muted">No solutions yet.</p>
              ) : (
                <div className="solution-table-wrap">
                  <table className="solution-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Overlap</th>
                        <th>Summary</th>
                        <th>Preview</th>
                        <th>Apply</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.optimiser.solutions.map((solution, index) => (
                        <tr key={solution.id}>
                          <td>{index + 1}</td>
                          <td>{(solution.overlap * 100).toFixed(1)}%</td>
                          <td className="solution-summary-cell">{solution.summary}</td>
                          <td>
                            <button type="button" onClick={() => previewSolution(index)}>Preview</button>
                          </td>
                          <td>
                            <button type="button" onClick={() => applySolution(index)}>Apply</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </aside>
  );
}

function renderPropertyCell(
  component: OpticalComponent,
  dispatch: ReturnType<typeof useAppStore>['dispatch']
) {
  if (component.kind === 'source') {
    return (
      <input
        type="number"
        value={Math.round(component.waistRadius * 1000)}
        onChange={(event) => {
          event.stopPropagation();
          const value = Number(event.target.value);
          if (Number.isFinite(value)) {
            dispatch({
              type: 'UPDATE_COMPONENT',
              payload: { id: component.id, updates: { waistRadius: Math.max(1, value) / 1000 } },
            });
          }
        }}
      />
    );
  }

  if (component.kind === 'lens_thin') {
    return (
      <input
        type="number"
        value={formatFixed3(component.focalLength)}
        onChange={(event) => {
          event.stopPropagation();
          const value = Number(event.target.value);
          if (Number.isFinite(value)) {
            dispatch({
              type: 'UPDATE_COMPONENT',
              payload: { id: component.id, updates: { focalLength: value } },
            });
          }
        }}
      />
    );
  }

  if (component.kind === 'mirror_flat') {
    return (
      <select
        value={component.orientation}
        onChange={(event) => {
          event.stopPropagation();
          dispatch({
            type: 'UPDATE_COMPONENT',
            payload: { id: component.id, updates: { orientation: Number(event.target.value) as 45 | 135 | 225 | 315 } },
          });
        }}
      >
        <option value={45}>45</option>
        <option value={135}>135</option>
        <option value={225}>225</option>
        <option value={315}>315</option>
      </select>
    );
  }

  return (
    <input
      type="number"
      value={formatFixed3(component.length)}
      onChange={(event) => {
        event.stopPropagation();
        const value = Number(event.target.value);
        if (Number.isFinite(value)) {
          dispatch({
            type: 'UPDATE_COMPONENT',
            payload: { id: component.id, updates: { length: Math.max(1, value) } },
          });
        }
      }}
    />
  );
}

function shortKind(kind: OpticalComponent['kind']) {
  if (kind === 'source') return 'src';
  if (kind === 'mirror_flat') return 'mir';
  if (kind === 'lens_thin') return 'lens';
  return 'cav';
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

function LockIcon({ locked }: { locked: boolean }) {
  return <img className="icon-glyph" src={locked ? lockIcon : lockOpenIcon} alt="" />;
}

function getOrderedComponents(state: AppState): OpticalComponent[] {
  const ids = new Set<string>();
  const ordered: OpticalComponent[] = [];

  if (state.sourceId && state.components[state.sourceId]) {
    ids.add(state.sourceId);
    ordered.push(state.components[state.sourceId]);
  }

  for (const id of state.beamPath?.orderedComponentIds ?? []) {
    if (!ids.has(id) && state.components[id]) {
      ids.add(id);
      ordered.push(state.components[id]);
    }
  }

  for (const component of Object.values(state.components)) {
    if (!ids.has(component.id)) {
      ids.add(component.id);
      ordered.push(component);
    }
  }

  return ordered;
}

function getComponentPathPosition(state: AppState, componentId: string): number | null {
  if (state.sourceId === componentId) {
    return 0;
  }

  const segment = state.beamPath?.segments.find((entry) => entry.terminatedByComponentId === componentId);
  return segment ? round3(segment.zEnd) : null;
}

function formatPathPosition(value: number | null): string {
  return value === null ? 'off-path' : formatFixed3(value);
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
  if (direction === 'right') return { x: origin.x + distance, y: origin.y };
  if (direction === 'left') return { x: origin.x - distance, y: origin.y };
  if (direction === 'down') return { x: origin.x, y: origin.y + distance };
  return { x: origin.x, y: origin.y - distance };
}

function clampToTable(point: Point2d, state: AppState): Point2d {
  return {
    x: clamp(point.x, 0, state.table.width),
    y: clamp(point.y, 0, state.table.height),
  };
}
