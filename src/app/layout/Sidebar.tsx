import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { useAppStore } from '../adapters/useAppStore';
import {
  createBeamStopComponent,
  createCavityFPComponent,
  createCustomObjectComponent,
  createFlatMirrorComponent,
  createLensThinComponent,
  createTargetComponent,
} from '../state/componentFactories';
import type { AppState, CardinalDirection, MirrorOrientation, OpticalComponent, Point2d, TargetMode } from '../state/schema';
import {
  computeCavityIntrusions,
  computeDangerousPairs,
  getComponentPathPosition,
  getMovableLenses,
  moveComponentToPathZ,
  parseCavityRadius,
  MAX_OPTIMIZER_LENSES,
} from '../state';
import { snapPointToGrid } from '../state/snapToGrid';
import { GAUSSIAN_FILE_EXTENSION, parseAppState, serializeAppState } from '../state/fileFormat';
import { NumericField } from '../../ui/shared/NumericField';
import { HelpPopout } from '../../ui/shared/HelpPopout';
import { SettingsModal } from './SettingsModal';
import { HelpModal } from './HelpModal';
import { useTheme } from '../adapters/useTheme';
import circlePlusIcon from '../../../icons/circle-plus.svg';
import trashIcon from '../../../icons/trash-2.svg';

/**
 * Which orientation to give a newly-added mirror so its reflective face
 * actually faces the beam it's dropped onto, rather than always defaulting
 * to 45 regardless of the beam's direction there (which would present the
 * mirror's substrate/back side to the beam instead of its coating whenever
 * the beam wasn't already travelling 'right').
 *
 * Each orientation's reflective coating only faces two of the four cardinal
 * directions (see SUBSTRATE_DIRECTION and reflectDirection's table in
 * beamPathResolver.ts) - this picks one of that pair for each incoming
 * direction, consistently turning the beam the same rotational way
 * (right->up->left->down->right) so the result is always a genuine
 * front-face reflection.
 */
export const DEFAULT_MIRROR_ORIENTATION: Record<CardinalDirection, MirrorOrientation> = {
  right: 45,
  up: 135,
  left: 225,
  down: 315,
};

function defaultSaveFileName(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `gaussianlab-table-${stamp}${GAUSSIAN_FILE_EXTENSION}`;
}

/** Trigger a browser download - used when the File System Access API (which
 * lets the user pick a real directory) isn't available in this browser. */
function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function Sidebar() {
  const { state, dispatch, runSolver, applySolution, resetTable } = useAppStore();
  const { theme, toggleTheme } = useTheme();
  const [modeMatchingOpen, setModeMatchingOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const applyLoadedFile = (text: string) => {
    let loaded: AppState;
    try {
      loaded = parseAppState(text);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not read that .gaussian file.');
      return;
    }
    dispatch({ type: 'LOAD_STATE', payload: loaded });
  };

  const handleSave = async () => {
    const content = serializeAppState(state);
    const suggestedName = defaultSaveFileName();

    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName,
          types: [
            {
              description: 'GaussianLab table',
              accept: { 'text/plain': [GAUSSIAN_FILE_EXTENSION] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          window.alert(`Could not save the file: ${error.message}`);
        }
      }
      return;
    }

    // Fallback for browsers without the File System Access API: this can
    // still let the user name the file (and, depending on browser settings,
    // choose where it goes), just via the browser's own save dialog.
    downloadTextFile(suggestedName, content);
  };

  const handleLoad = async () => {
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [
            {
              description: 'GaussianLab table',
              accept: { 'text/plain': [GAUSSIAN_FILE_EXTENSION] },
            },
          ],
          multiple: false,
        });
        const file = await handle.getFile();
        applyLoadedFile(await file.text());
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          window.alert(`Could not open the file: ${error.message}`);
        }
      }
      return;
    }

    fileInputRef.current?.click();
  };

  const handleClearTable = () => {
    const confirmed = window.confirm(
      'Clear the table? This removes every component and cannot be undone.',
    );
    if (confirmed) {
      resetTable();
    }
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    file.text().then(applyLoadedFile);
  };

  // Both cavities and target objects can serve as a mode-matching target,
  // and both are valid selections for the auto-optimizer.
  const targetableComponents = useMemo(
    () =>
      Object.values(state.components).filter(
        (component) => component.kind === 'cavity_fp' || component.kind === 'target'
      ),
    [state.components]
  );

  const dangerousPairs = useMemo(
    () => computeDangerousPairs(state.components, state.sourceId, state.beamPath, state.table.minComponentSpacingMm),
    [state.components, state.sourceId, state.beamPath, state.table.minComponentSpacingMm],
  );

  const movableLensCount = useMemo(() => getMovableLenses(state).length, [state.components]);
  const tooManyMovableLenses = movableLensCount > MAX_OPTIMIZER_LENSES;
  const cavityIntrusions = useMemo(
    () => computeCavityIntrusions(state.components, state.sourceId, state.beamPath),
    [state.components, state.sourceId, state.beamPath],
  );
  const hasCavityIntrusion = cavityIntrusions.length > 0;
  const cavityIntrusionMessagesByComponent = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const intrusion of cavityIntrusions) {
      map[intrusion.cavityId] = map[intrusion.cavityId] ?? [];
      map[intrusion.cavityId].push(`${intrusion.intruderLabel} sits inside this cavity's mirror span.`);
      map[intrusion.intruderId] = map[intrusion.intruderId] ?? [];
      map[intrusion.intruderId].push(`This component sits inside ${intrusion.cavityLabel}'s mirror span.`);
    }
    return map;
  }, [cavityIntrusions]);
  const proximityByComponent = useMemo(() => {
    const map: Record<string, Array<{ otherLabel: string; distanceMm: number }>> = {};
    for (const pair of dangerousPairs) {
      map[pair.aId] = map[pair.aId] ?? [];
      map[pair.bId] = map[pair.bId] ?? [];
      map[pair.aId].push({ otherLabel: pair.bLabel, distanceMm: pair.distanceMm });
      map[pair.bId].push({ otherLabel: pair.aLabel, distanceMm: pair.distanceMm });
    }
    return map;
  }, [dangerousPairs]);

  const orderedComponents = useMemo(() => getOrderedComponents(state), [state]);
  const hasSolvedSource = !!state.sourceId && state.components[state.sourceId]?.kind === 'source';
  const defaultPlacement = getDefaultPlacement(state);
  // Source and mirror positions are freely grid-snapped (see Canvas.normalizePosition);
  // lens/cavity/target/beam-stop instead prioritize sitting on the beam axis, so their
  // defaultPlacement.position is left as computed rather than snapped here too.
  const gridSnappedDefaultPosition = state.table.snapToGrid
    ? snapPointToGrid(defaultPlacement.position, state.table.gridStandard)
    : defaultPlacement.position;

  const addMirror = () => {
    const mirror = createFlatMirrorComponent(state.components, gridSnappedDefaultPosition);
    // Face the mirror's reflective coating toward the beam it's landing on,
    // rather than always defaulting to 45 (see DEFAULT_MIRROR_ORIENTATION).
    mirror.orientation = DEFAULT_MIRROR_ORIENTATION[defaultPlacement.direction];
    dispatch({ type: 'ADD_COMPONENT', payload: mirror });
    dispatch({ type: 'SET_SELECTED_COMPONENT', payload: { componentId: mirror.id } });
  };

  const addLens = () => {
    const lens = createLensThinComponent(state.components, defaultPlacement.position);
    dispatch({ type: 'ADD_COMPONENT', payload: lens });
    dispatch({ type: 'SET_SELECTED_COMPONENT', payload: { componentId: lens.id } });
  };

  const addCavity = () => {
    const cavity = createCavityFPComponent(state.components, defaultPlacement.position);
    // Orient the cavity to match the beam it's being dropped onto, rather
    // than always defaulting to horizontal.
    cavity.direction = defaultPlacement.direction;
    dispatch({ type: 'ADD_COMPONENT', payload: cavity });
    dispatch({ type: 'SET_SELECTED_COMPONENT', payload: { componentId: cavity.id } });
  };

  const addTarget = () => {
    const target = createTargetComponent(state.components, defaultPlacement.position);
    dispatch({ type: 'ADD_COMPONENT', payload: target });
    dispatch({ type: 'SET_SELECTED_COMPONENT', payload: { componentId: target.id } });
  };

  const addBeamStop = () => {
    const beamStop = createBeamStopComponent(state.components, defaultPlacement.position);
    dispatch({ type: 'ADD_COMPONENT', payload: beamStop });
    dispatch({ type: 'SET_SELECTED_COMPONENT', payload: { componentId: beamStop.id } });
  };

  const addCustomObject = () => {
    const customObject = createCustomObjectComponent(state.components, defaultPlacement.position);
    dispatch({ type: 'ADD_COMPONENT', payload: customObject });
    dispatch({ type: 'SET_SELECTED_COMPONENT', payload: { componentId: customObject.id } });
  };

  // Selecting a component from the dropdown implicitly primes it as the
  // mode-matching target - there's no separate confirmation step.
  const selectTargetMode = (componentId: string) => {
    const component = state.components[componentId];
    if (!component) {
      dispatch({ type: 'SET_TARGET_MODE', payload: { targetMode: null } });
      return;
    }

    let targetMode: TargetMode;
    if (component.kind === 'cavity_fp') {
      targetMode = { kind: 'cavity', cavityComponentId: component.id };
    } else if (component.kind === 'target') {
      targetMode = { kind: 'target', targetComponentId: component.id };
    } else {
      return;
    }

    dispatch({ type: 'SET_TARGET_MODE', payload: { targetMode } });
  };

  const selectedTargetId =
    state.targetMode?.kind === 'cavity'
      ? state.targetMode.cavityComponentId
      : state.targetMode?.kind === 'target'
        ? state.targetMode.targetComponentId
        : '';

  return (
    <aside
      className="sidebar"
      aria-label="Simulation controls"
      style={{
        gridTemplateRows: modeMatchingOpen
          ? 'auto minmax(160px, 1fr) minmax(160px, 1fr)'
          : 'auto minmax(280px, 1.35fr) auto',
      }}
    >
      <section className="panel file-toolbar-panel">
        <div className="file-toolbar">
          <span className="file-toolbar-label">Table file</span>
          <div className="file-toolbar-actions">
            <button type="button" onClick={handleSave}>Save</button>
            <button type="button" onClick={handleLoad}>Load</button>
            <button type="button" onClick={() => setSettingsOpen(true)}>Settings</button>
            <button type="button" onClick={() => setHelpOpen(true)}>Help</button>
            <button
              type="button"
              className="icon-button danger-button"
              aria-label="Clear table"
              title="Clear table"
              onClick={handleClearTable}
            >
              <img className="icon-glyph" src={trashIcon} alt="" />
            </button>
            <label className="theme-toggle-group" title="Toggle dark mode">
              <span className="switch">
                <input
                  type="checkbox"
                  checked={theme === 'dark'}
                  onChange={toggleTheme}
                  aria-label="Toggle dark mode"
                />
                <span className="switch-track">
                  <span className="switch-thumb" />
                </span>
              </span>
              <span className="theme-toggle-label">Dark Mode</span>
            </label>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={GAUSSIAN_FILE_EXTENSION}
            style={{ display: 'none' }}
            onChange={handleFileInputChange}
          />
        </div>
      </section>

      <section className="panel component-panel">
        <header className="panel-header">
          <div>
            <h3>Beam Path Components</h3>
          </div>
          <HelpPopout summaryAriaLabel="Open help">
            Select a row to focus the same component on the canvas. Edit values inline.
          </HelpPopout>
        </header>
        <div className="panel-body component-table-panel">
          <div className="component-toolbar">
            <button type="button" onClick={addMirror}>+ Mirror</button>
            <button type="button" onClick={addLens}>+ Lens</button>
            <button type="button" onClick={addCavity}>+ Cavity</button>
            <button type="button" onClick={addTarget}>+ Target</button>
            <button type="button" onClick={addBeamStop}>+ Beam Stop</button>
            <button type="button" onClick={addCustomObject}>+ Custom Object</button>
          </div>
          <div className="component-table-wrap">
            <table className="component-table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Type</th>
                  <th><ColumnTitle title="Z" unit="mm" /></th>
                  <th><ColumnTitle title="ΔZ" unit="mm" /></th>
                  <th>Property</th>
                  <th><ColumnTitle title="Sensitivity" unit="%/mm²" /></th>
                  <th className="icon-col"></th>
                  <th className="icon-col"></th>
                  <th className="icon-col"></th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Tracks the previous row's path position as the rows render in
                  // path order, so each row's Delta Z cell can measure from it.
                  // Captured into a per-row const (rowPreviousPathPosition) below,
                  // since this outer `let` is shared/mutated across iterations and
                  // would otherwise be stale by the time an onChange handler runs.
                  let previousPathPosition: number | null = null;
                  return orderedComponents.map((component) => {
                  const isSelected = state.selectedComponentId === component.id;
                  const pathPosition = getComponentPathPosition(state.sourceId, state.beamPath, component.id);
                  const rowPreviousPathPosition = previousPathPosition;
                  if (pathPosition !== null) {
                    previousPathPosition = pathPosition;
                  }
                  const warnings = proximityByComponent[component.id] ?? [];
                  const isUnstableCavity =
                    component.kind === 'cavity_fp' && hasSolvedSource && component.eigenmode === null;
                  const warningMessages = [
                    ...warnings.map(
                      (entry) => `${component.label} is ${entry.distanceMm.toFixed(3)} mm from ${entry.otherLabel}`,
                    ),
                    ...(isUnstableCavity
                      ? [
                          `${component.label} is unstable: the cavity geometry (mirror curvatures and length) does not satisfy the resonator stability condition.`,
                        ]
                      : []),
                    ...(cavityIntrusionMessagesByComponent[component.id] ?? []),
                  ];
                  return (
                    <tr
                      key={component.id}
                      className={isSelected ? 'selected' : undefined}
                      onClick={() => dispatch({ type: 'SET_SELECTED_COMPONENT', payload: { componentId: component.id } })}
                    >
                      <td>
                        <input
                          className="label-cell-input"
                          value={component.label}
                          disabled={component.locked}
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
                      <td>{renderZCell(component, pathPosition, state, dispatch)}</td>
                      <td>
                        {renderDeltaZCell(component, pathPosition, rowPreviousPathPosition, state, dispatch)}
                      </td>
                      <td>{renderPropertyCell(component, dispatch, isSelected)}</td>
                      <td>
                        <span className="sensitivity-cell">{formatSensitivity(component)}</span>
                      </td>
                      <td className="icon-col">
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
                      <td className="icon-col">
                        {component.kind !== 'source' && (
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
                        )}
                      </td>
                      <td className="icon-col">
                        {warningMessages.length > 0 && (
                          <button
                            type="button"
                            className="icon-button warning-button"
                            aria-label="Show warnings"
                            onClick={(event) => {
                              event.stopPropagation();
                              window.alert(warningMessages.join('\n'));
                            }}
                          >
                            <WarningTriangleIcon />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="panel mode-matching-panel">
        <header className={modeMatchingOpen ? 'panel-header' : 'panel-header panel-header--collapsed'}>
          <button
            type="button"
            className="mode-matching-header-toggle"
            aria-expanded={modeMatchingOpen}
            onClick={() => setModeMatchingOpen((open) => !open)}
          >
            <h3>Mode Matching</h3>
            <ChevronCircleIcon direction={modeMatchingOpen ? 'down' : 'up'} />
          </button>
        </header>
        {modeMatchingOpen && (
          <div className="panel-body">
            <div className="stack">
              <label>
                Target
                <select
                  value={selectedTargetId}
                  onChange={(event) => selectTargetMode(event.target.value)}
                >
                  <option value="">Select cavity or target...</option>
                  {targetableComponents.map((component) => (
                    <option key={component.id} value={component.id}>
                      {component.label} ({component.kind === 'cavity_fp' ? 'cavity' : 'target'})
                    </option>
                  ))}
                </select>
              </label>

              <label className="mode-matching-inline-toggle">
                <input
                  type="checkbox"
                  checked={state.optimiser.avoidCollisions}
                  onChange={(event) =>
                    dispatch({
                      type: 'SET_AVOID_COLLISIONS',
                      payload: { avoidCollisions: event.target.checked },
                    })
                  }
                />
                Avoid collisions
              </label>

              <label className="mode-matching-inline-toggle">
                <input
                  type="checkbox"
                  checked={state.optimiser.manualRangesEnabled}
                  onChange={(event) =>
                    dispatch({
                      type: 'SET_MANUAL_RANGES_ENABLED',
                      payload: { enabled: event.target.checked },
                    })
                  }
                />
                Manual adjustment ranges
              </label>

              {state.optimiser.manualRangesEnabled && (
                <div className="manual-range-list">
                  {state.optimiser.manualRanges.map((range) => (
                    <div className="manual-range-row" key={range.id}>
                      <label className="manual-range-field">
                        Start (mm)
                        <NumericField
                          value={range.startZMm}
                          onCommit={(value) =>
                            dispatch({
                              type: 'UPDATE_MANUAL_RANGE',
                              payload: { id: range.id, updates: { startZMm: value } },
                            })
                          }
                        />
                      </label>
                      <label className="manual-range-field">
                        Stop (mm)
                        <NumericField
                          value={range.endZMm}
                          onCommit={(value) =>
                            dispatch({
                              type: 'UPDATE_MANUAL_RANGE',
                              payload: { id: range.id, updates: { endZMm: value } },
                            })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="icon-button danger-button"
                        aria-label="Remove tuning range"
                        onClick={() => dispatch({ type: 'REMOVE_MANUAL_RANGE', payload: { id: range.id } })}
                      >
                        <img className="icon-glyph" src={trashIcon} alt="" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Add another tuning range"
                    onClick={() => dispatch({ type: 'ADD_MANUAL_RANGE', payload: {} })}
                  >
                    <img className="icon-glyph" src={circlePlusIcon} alt="" />
                  </button>
                </div>
              )}

              {hasCavityIntrusion && (
                <div className="optimizer-warning">
                  <WarningTriangleIcon />
                  <span>
                    {cavityIntrusions.map((intrusion) => (
                      <span key={`${intrusion.cavityId}-${intrusion.intruderId}`} className="optimizer-warning-line">
                        {intrusion.intruderLabel} sits inside {intrusion.cavityLabel}'s mirror span.
                      </span>
                    ))}{' '}
                    Mode matching solutions are only calculated for cavities that aren't occupied by other
                    components - a real cavity could have a lens or glass plate inside it, but modelling that
                    is outside this tool's scope for now. Move the component(s) above outside the cavity (or
                    move/shorten the cavity) to resume mode matching and the optimizer.
                  </span>
                </div>
              )}

              {!hasCavityIntrusion && tooManyMovableLenses && (
                <div className="optimizer-warning">
                  <WarningTriangleIcon />
                  <span>
                    {movableLensCount} movable lenses found, but the optimizer only considers up to{' '}
                    {MAX_OPTIMIZER_LENSES} at a time - more than that is too computationally intensive and can
                    time out the browser. Lock the lenses you don't want included in this solve (via the lock
                    icon in the component table) to bring the count down to {MAX_OPTIMIZER_LENSES}.
                  </span>
                </div>
              )}

              <button type="button" onClick={() => runSolver(5)} disabled={tooManyMovableLenses || hasCavityIntrusion}>
                Run optimizer
              </button>

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
                        <th><ColumnTitle title="Max sensitivity" unit="%/mm²" /></th>
                        <th>Apply</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.optimiser.solutions.map((solution, index) => (
                        <tr key={solution.id}>
                          <td>{index + 1}</td>
                          <td>{(solution.overlap * 100).toFixed(1)}%</td>
                          <td className="solution-summary-cell">{solution.summary}</td>
                          <td className="solution-sensitivity-cell">
                            {solution.maxLensSensitivity === null ? '—' : formatFixed3(solution.maxLensSensitivity)}
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

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </aside>
  );
}

/** A two-line column header: the title, with its unit on a second line below. */
function ColumnTitle({ title, unit }: { title: string; unit: string }) {
  return (
    <span className="column-title">
      <span>{title}</span>
      <span className="column-title-unit">({unit})</span>
    </span>
  );
}

/** Wraps a Prop-column input/select with its parameter symbol and unit, e.g. "f=" ... "mm". */
function PropField({
  prefix,
  suffix,
  children,
}: {
  prefix: string;
  suffix?: string;
  children: ReactNode;
}) {
  return (
    <span className="prop-field">
      <span className="prop-field-affix">{prefix}</span>
      {children}
      {suffix && <span className="prop-field-affix">{suffix}</span>}
    </span>
  );
}

/**
 * The Z column is editable for every kind except mirrors: typing a new value
 * slides the component to that position along the beam path (mirrors are
 * excluded because repositioning one also reshapes every downstream segment,
 * so a single z isn't a well-defined edit for them).
 */
function renderZCell(
  component: OpticalComponent,
  pathPosition: number | null,
  state: AppState,
  dispatch: ReturnType<typeof useAppStore>['dispatch'],
) {
  if (component.kind === 'mirror_flat') {
    return <span className="path-position-cell">{formatPathPosition(pathPosition)}</span>;
  }

  const commitZ = (value: number) => {
    const position = moveComponentToPathZ(state, component.id, value);
    if (position) {
      dispatch({ type: 'UPDATE_COMPONENT', payload: { id: component.id, updates: { position } } });
    }
  };

  return (
    <NumericField
      className="z-cell-input"
      disabled={component.locked}
      value={pathPosition}
      placeholder={pathPosition === null ? 'off-path' : undefined}
      onCommit={commitZ}
    />
  );
}

/**
 * Delta Z reports the gap along the beam path from the previous row (source,
 * mirror, or anything else with its own path position). It mirrors the Z
 * column's editability: mirrors stay read-only (see renderZCell), and there's
 * nothing to measure from for the very first on-path row, so both render a
 * plain span instead of an input. Editing it re-targets this component's
 * absolute Z to `previousPathPosition + typed value`, through the same
 * moveComponentToPathZ path the Z column itself uses.
 */
function renderDeltaZCell(
  component: OpticalComponent,
  pathPosition: number | null,
  previousPathPosition: number | null,
  state: AppState,
  dispatch: ReturnType<typeof useAppStore>['dispatch'],
) {
  const deltaZ =
    pathPosition !== null && previousPathPosition !== null ? pathPosition - previousPathPosition : null;

  if (component.kind === 'mirror_flat') {
    const text = pathPosition === null ? 'off-path' : deltaZ === null ? '—' : formatFixed3(deltaZ);
    return <span className="path-position-cell">{text}</span>;
  }

  if (previousPathPosition === null) {
    return <span className="path-position-cell">—</span>;
  }

  const commitDeltaZ = (value: number) => {
    const position = moveComponentToPathZ(state, component.id, previousPathPosition + value);
    if (position) {
      dispatch({ type: 'UPDATE_COMPONENT', payload: { id: component.id, updates: { position } } });
    }
  };

  return (
    <NumericField
      className="delta-z-cell-input"
      disabled={component.locked}
      value={deltaZ}
      placeholder={pathPosition === null ? 'off-path' : undefined}
      onCommit={commitDeltaZ}
    />
  );
}

/**
 * The Property column normally shows just the one field most worth seeing
 * at a glance. Kinds with more than one (source, cavity, custom object) get
 * the rest stacked in as extra lines while selected, rather than all the
 * time, to keep unselected rows compact.
 */
function renderPropertyCell(
  component: OpticalComponent,
  dispatch: ReturnType<typeof useAppStore>['dispatch'],
  isSelected: boolean,
) {
  if (component.kind === 'source') {
    const waistField = (
      <PropField key="w0" prefix="w₀=" suffix="um">
        <NumericField
          disabled={component.locked}
          value={component.waistRadius * 1000}
          format={(value) => String(Math.round(value))}
          onCommit={(value) =>
            dispatch({
              type: 'UPDATE_COMPONENT',
              payload: { id: component.id, updates: { waistRadius: Math.max(1, value) / 1000 } },
            })
          }
        />
      </PropField>
    );

    if (!isSelected) {
      return waistField;
    }

    return (
      <div className="property-cell-stack">
        {waistField}
        <PropField key="z0" prefix="z₀=" suffix="mm">
          <NumericField
            disabled={component.locked}
            value={component.waistOffset}
            onCommit={(value) =>
              dispatch({
                type: 'UPDATE_COMPONENT',
                payload: { id: component.id, updates: { waistOffset: round3(value) } },
              })
            }
          />
        </PropField>
        <PropField key="lambda" prefix="λ=" suffix="nm">
          <NumericField
            disabled={component.locked}
            value={component.wavelength}
            onCommit={(value) =>
              dispatch({
                type: 'UPDATE_COMPONENT',
                payload: { id: component.id, updates: { wavelength: Math.max(1, value) } },
              })
            }
          />
        </PropField>
      </div>
    );
  }

  if (component.kind === 'lens_thin') {
    return (
      <PropField prefix="f=" suffix="mm">
        <NumericField
          disabled={component.locked}
          value={component.focalLength}
          onCommit={(value) =>
            dispatch({
              type: 'UPDATE_COMPONENT',
              payload: { id: component.id, updates: { focalLength: value } },
            })
          }
        />
      </PropField>
    );
  }

  if (component.kind === 'mirror_flat') {
    return (
      <PropField prefix="θ=" suffix="°">
        <select
          value={component.orientation}
          disabled={component.locked}
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
      </PropField>
    );
  }

  if (component.kind === 'target') {
    return (
      <PropField prefix="w₀=" suffix="um">
        <NumericField
          disabled={component.locked}
          value={component.waistRadius * 1000}
          format={(value) => String(Math.round(value))}
          onCommit={(value) =>
            dispatch({
              type: 'UPDATE_COMPONENT',
              payload: { id: component.id, updates: { waistRadius: Math.max(1, value) / 1000 } },
            })
          }
        />
      </PropField>
    );
  }

  if (component.kind === 'beam_stop') {
    return null;
  }

  if (component.kind === 'custom_object') {
    const indexField = (
      <PropField key="n" prefix="n=">
        <NumericField
          disabled={component.locked}
          value={component.indexOfRefraction}
          onCommit={(value) =>
            dispatch({
              type: 'UPDATE_COMPONENT',
              payload: { id: component.id, updates: { indexOfRefraction: Math.max(0.01, value) } },
            })
          }
        />
      </PropField>
    );

    if (!isSelected) {
      return indexField;
    }

    return (
      <div className="property-cell-stack">
        {indexField}
        <PropField key="t" prefix="t=" suffix="mm">
          <NumericField
            disabled={component.locked}
            value={component.thickness}
            onCommit={(value) =>
              dispatch({
                type: 'UPDATE_COMPONENT',
                payload: { id: component.id, updates: { thickness: Math.max(0.001, round3(value)) } },
              })
            }
          />
        </PropField>
      </div>
    );
  }

  // Only cavity_fp remains.
  const lengthField = (
    <PropField key="L" prefix="L=" suffix="mm">
      <NumericField
        disabled={component.locked}
        value={component.length}
        onCommit={(value) =>
          dispatch({
            type: 'UPDATE_COMPONENT',
            payload: { id: component.id, updates: { length: Math.max(1, value) } },
          })
        }
      />
    </PropField>
  );

  if (!isSelected) {
    return lengthField;
  }

  return (
    <div className="property-cell-stack">
      {lengthField}
      <PropField key="r1" prefix="R1=" suffix="mm">
        <NumericField
          disabled={component.locked}
          value={component.r1}
          parse={parseCavityRadius}
          placeholder="Infinity"
          onCommit={(value) =>
            dispatch({
              type: 'UPDATE_COMPONENT',
              payload: { id: component.id, updates: { r1: Number.isFinite(value) ? round3(value) : value } },
            })
          }
        />
      </PropField>
      <PropField key="r2" prefix="R2=" suffix="mm">
        <NumericField
          disabled={component.locked}
          value={component.r2}
          parse={parseCavityRadius}
          placeholder="Infinity"
          onCommit={(value) =>
            dispatch({
              type: 'UPDATE_COMPONENT',
              payload: { id: component.id, updates: { r2: Number.isFinite(value) ? round3(value) : value } },
            })
          }
        />
      </PropField>
    </div>
  );
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function shortKind(kind: OpticalComponent['kind']) {
  if (kind === 'source') return 'src';
  if (kind === 'mirror_flat') return 'mir';
  if (kind === 'lens_thin') return 'lens';
  if (kind === 'target') return 'tgt';
  if (kind === 'beam_stop') return 'stop';
  if (kind === 'custom_object') return 'obj';
  return 'cav';
}

function formatFixed3(value: number): string {
  if (!Number.isFinite(value)) {
    return '';
  }
  return value.toFixed(3);
}

// Inline (rather than <img src="...svg">) so the locked state can recolor the
// stroke via currentColor - an <img>-loaded SVG can't be restyled from the
// embedding page's CSS.
function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg
      className={locked ? 'icon-glyph lock-icon-locked' : 'icon-glyph'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      {locked ? <path d="M7 11V7a5 5 0 0 1 10 0v4" /> : <path d="M7 11V7a5 5 0 0 1 9.9-1" />}
    </svg>
  );
}

// Inline for the same reason as LockIcon above: only an inline <svg> picks up
// the amber warning color via currentColor - as an <img>, this rendered
// black regardless of theme, which read as invisible "dark-on-dark" against
// a dark-mode button background.
function WarningTriangleIcon() {
  return (
    <svg
      className="icon-glyph warning-icon-glyph"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

// Inline for the same reason as LockIcon/WarningTriangleIcon above: only an
// inline <svg> picks up currentColor, so this rendered black-on-black in
// dark mode as an <img>.
function ChevronCircleIcon({ direction }: { direction: 'up' | 'down' }) {
  return (
    <svg
      className="icon-glyph"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d={direction === 'up' ? 'm8 14 4-4 4 4' : 'm16 10-4 4-4-4'} />
    </svg>
  );
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

function formatPathPosition(value: number | null): string {
  return value === null ? 'off-path' : formatFixed3(value);
}

/** Only lenses carry a position-sensitivity figure; everything else is blank. */
function formatSensitivity(component: OpticalComponent): string {
  if (component.kind !== 'lens_thin' || component.sensitivity === null) {
    return '—'; // em dash
  }
  return formatFixed3(component.sensitivity);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getDefaultPlacement(state: AppState): { position: Point2d; direction: CardinalDirection } {
  const fallback: { position: Point2d; direction: CardinalDirection } = {
    position: {
      x: state.table.width * 0.5,
      y: state.table.height * 0.5,
    },
    direction: 'right',
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
    return {
      position: clampToTable(moveAlong(segment.start, segment.direction, offsetMm), state),
      direction: segment.direction,
    };
  }

  const currentSegment = path.segments[lastHitIndex.index];
  const downstreamSegment = path.segments[lastHitIndex.index + 1];
  const direction = downstreamSegment?.direction ?? currentSegment.direction;

  // currentSegment.end is the last-hit component's own position - which for
  // a cavity is its input mirror (M1). The cavity's entire mirror span
  // [M1, M2] is off-limits (see computeCavityIntrusions), so a new
  // component must default to *after* the output mirror (M2), not just
  // offsetMm past M1 where it would land inside the resonator.
  const lastComponent = lastHitIndex.segment.terminatedByComponentId
    ? state.components[lastHitIndex.segment.terminatedByComponentId]
    : null;
  const originPoint =
    lastComponent?.kind === 'cavity_fp'
      ? moveAlong(currentSegment.end, direction, lastComponent.length)
      : currentSegment.end;

  return {
    position: clampToTable(moveAlong(originPoint, direction, offsetMm), state),
    direction,
  };
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
