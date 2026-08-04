import { describe, it, expect } from 'vitest';
import { serializeAppState, parseAppState, GAUSSIAN_FILE_EXTENSION } from './fileFormat';
import {
  createSourceComponent,
  createFlatMirrorComponent,
  createLensThinComponent,
  createCavityFPComponent,
  createTargetComponent,
  createBeamStopComponent,
} from './componentFactories';
import { DEFAULT_APP_STATE } from './defaultState';
import type { AppState, CavityFPComponent } from './schema';

function buildRichState(): AppState {
  const source = createSourceComponent({}, { x: 50, y: 300 });
  source.wavelength = 1064;
  source.waistRadius = 0.25;
  source.waistOffset = -12.5;

  const mirror = createFlatMirrorComponent({}, { x: 300, y: 300 });
  mirror.orientation = 135;
  mirror.locked = true;

  const lens = createLensThinComponent({}, { x: 400, y: 300 });
  lens.focalLength = 75;
  lens.optimiserCanMove = false;

  const cavity = createCavityFPComponent({}, { x: 500, y: 300 });
  cavity.length = 150;
  cavity.r1 = 200;
  cavity.r2 = Number.POSITIVE_INFINITY; // flat mirror
  cavity.showProjection = true;

  const target = createTargetComponent({}, { x: 800, y: 300 });
  target.waistRadius = 0.6;
  target.showProjection = true;

  const beamStop = createBeamStopComponent({}, { x: 900, y: 300 });
  beamStop.locked = true;

  return {
    ...DEFAULT_APP_STATE,
    table: {
      width: 1200,
      height: 700,
      gridStandard: 'imperial',
      snapToGrid: false,
      axisCaptureThreshold: 12.5,
    },
    sourceId: source.id,
    components: {
      [source.id]: source,
      [mirror.id]: mirror,
      [lens.id]: lens,
      [cavity.id]: cavity,
      [target.id]: target,
      [beamStop.id]: beamStop,
    },
    targetMode: { kind: 'cavity', cavityComponentId: cavity.id },
  };
}

describe('.gaussian file format', () => {
  it('uses the documented file extension', () => {
    expect(GAUSSIAN_FILE_EXTENSION).toBe('.gaussian');
  });

  it('is a human-readable plain-text format with labelled sections and units', () => {
    const state = buildRichState();
    const text = serializeAppState(state);

    // Sniff-testable without loading it: section headers show kind + label,
    // and values carry unit suffixes.
    expect(text).toContain('[table]');
    expect(text).toContain('[source S1]');
    expect(text).toContain('[mirror_flat M1]');
    expect(text).toContain('[lens_thin L1]');
    expect(text).toContain('[cavity_fp FP1]');
    expect(text).toContain('[target T1]');
    expect(text).toContain('[beam_stop BS1]');
    expect(text).toContain('width_mm');
    expect(text).toContain('wavelength_nm');
    expect(text).toContain('focal_length_mm');
    expect(text).not.toContain('{'); // not JSON
  });

  it('round-trips a full table (all component kinds, cavity target mode) exactly', () => {
    const state = buildRichState();
    const text = serializeAppState(state);
    const loaded = parseAppState(text);

    expect(loaded.table).toEqual(state.table);
    expect(loaded.sourceId).toBe(state.sourceId);
    expect(loaded.targetMode).toEqual(state.targetMode);
    expect(Object.keys(loaded.components).sort()).toEqual(Object.keys(state.components).sort());

    for (const id of Object.keys(state.components)) {
      const original = state.components[id];
      const restored = loaded.components[id];
      if (original.kind === 'cavity_fp') {
        // eigenmode is derived, not persisted; everything else must match.
        const { eigenmode: _omit, ...rest } = original;
        expect(restored).toMatchObject(rest);
        expect((restored as CavityFPComponent).eigenmode).toBeNull();
      } else {
        expect(restored).toEqual(original);
      }
    }
  });

  it('round-trips an Infinity radius (flat cavity mirror) as literal Infinity', () => {
    const cavity = createCavityFPComponent({}, { x: 100, y: 100 });
    cavity.r1 = Number.POSITIVE_INFINITY;
    cavity.r2 = 50;
    const source = createSourceComponent({}, { x: 0, y: 100 });

    const state: AppState = {
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: { [source.id]: source, [cavity.id]: cavity },
    };

    const text = serializeAppState(state);
    expect(text).toContain('r1_mm = Infinity');

    const loaded = parseAppState(text);
    const restoredCavity = loaded.components[cavity.id] as CavityFPComponent;
    expect(restoredCavity.r1).toBe(Number.POSITIVE_INFINITY);
    expect(restoredCavity.r2).toBe(50);
  });

  it('round-trips a "target" kind targetMode', () => {
    const source = createSourceComponent({}, { x: 0, y: 0 });
    const target = createTargetComponent({}, { x: 100, y: 0 });
    const state: AppState = {
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: { [source.id]: source, [target.id]: target },
      targetMode: { kind: 'target', targetComponentId: target.id },
    };

    const loaded = parseAppState(serializeAppState(state));
    expect(loaded.targetMode).toEqual({ kind: 'target', targetComponentId: target.id });
  });

  it('round-trips a null targetMode as "none"', () => {
    const source = createSourceComponent({}, { x: 0, y: 0 });
    const state: AppState = {
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: { [source.id]: source },
      targetMode: null,
    };

    const text = serializeAppState(state);
    expect(text).toContain('target_mode = none');
    expect(parseAppState(text).targetMode).toBeNull();
  });

  it('does not depend on labels being unique for correct identity resolution', () => {
    const source = createSourceComponent({}, { x: 0, y: 0 });
    const targetA = createTargetComponent({}, { x: 100, y: 0 });
    const targetB = createTargetComponent({}, { x: 200, y: 0 });
    targetA.label = 'dup';
    targetB.label = 'dup';
    targetB.waistRadius = 0.9;

    const state: AppState = {
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: { [source.id]: source, [targetA.id]: targetA, [targetB.id]: targetB },
      targetMode: { kind: 'target', targetComponentId: targetB.id },
    };

    const loaded = parseAppState(serializeAppState(state));
    expect(loaded.components[targetA.id]).toEqual(targetA);
    expect(loaded.components[targetB.id]).toEqual(targetB);
    expect(loaded.targetMode).toEqual({ kind: 'target', targetComponentId: targetB.id });
  });

  it('throws a clear error when the [table] section is missing', () => {
    expect(() => parseAppState('[source S1]\nid = source-1\nlabel = S1\n')).toThrow(/\[table\]/);
  });

  it('resets derived and transient state (beamPath, propagationResult, optimiser, selection) on load', () => {
    const source = createSourceComponent({}, { x: 0, y: 0 });
    const state: AppState = {
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: { [source.id]: source },
      selectedComponentId: source.id,
    };

    const loaded = parseAppState(serializeAppState(state));
    expect(loaded.beamPath).toBeNull();
    expect(loaded.propagationResult).toBeNull();
    expect(loaded.selectedComponentId).toBeNull();
    expect(loaded.optimiser.solutions).toEqual([]);
  });
});
