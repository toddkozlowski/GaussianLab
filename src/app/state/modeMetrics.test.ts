import { describe, it, expect } from 'vitest';
import { computeLiveModeOverlap } from './modeMetrics';
import {
  createSourceComponent,
  createCavityFPComponent,
  createTargetComponent,
  createLensThinComponent,
} from './componentFactories';
import { DEFAULT_APP_STATE } from './defaultState';
import type { AppState, BeamSegment, CavityFPComponent } from './schema';

describe('computeLiveModeOverlap', () => {
  it('reports the true measured input-vs-eigenmode overlap for a cavity target, not the trivial forced-output match', () => {
    // Regression test: once a beam couples into a cavity, the propagated
    // beam downstream is *forced* onto the cavity's own eigenmode - so
    // comparing that forced output against the (identical) target mode
    // would always read 100%. The live overlap must instead reflect the
    // actual measured coupling between the incoming beam and the cavity.
    const source = createSourceComponent();
    source.wavelength = 1064;

    const cavity = createCavityFPComponent({}, { x: 200, y: 0 });
    (cavity as CavityFPComponent).length = 100;
    (cavity as CavityFPComponent).eigenmode = {
      waistRadius: 0.05,
      waistPositionFromM1: 50,
      stabilityProduct: 0.5,
      isStable: true,
    };

    const segment: BeamSegment = {
      direction: 'right',
      start: { x: 0, y: 0 },
      end: { x: 200, y: 0 },
      zStart: 0,
      zEnd: 200,
      terminatedByComponentId: cavity.id,
      termination: 'component',
    };

    const state: AppState = {
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: { [source.id]: source, [cavity.id]: cavity },
      beamPath: {
        segments: [segment],
        orderedComponentIds: [cavity.id],
        totalLength: 200,
        isValid: true,
        invalidReason: null,
      },
      targetMode: { kind: 'cavity', cavityComponentId: cavity.id },
      propagationResult: {
        // qFinal exactly matches the cavity's own eigenmode - simulating the
        // forced downstream substitution. If the buggy output-vs-target
        // comparison were still in play, this alone would read ~100%.
        profile: [{ z: 200, w: 0.05, gouyPhaseDeg: 0 }],
        waists: [],
        qAtComponent: {},
        qFinal: { re: -50, im: (Math.PI * 0.05 * 0.05) / (1064e-6) },
        cavityOverlap: { [cavity.id]: 0.42 },
      },
    };

    expect(computeLiveModeOverlap(state)).toBeCloseTo(0.42, 9);
  });

  it('returns null for a cavity target the beam never reached', () => {
    const source = createSourceComponent();
    const cavity = createCavityFPComponent({}, { x: 200, y: 0 });
    (cavity as CavityFPComponent).eigenmode = {
      waistRadius: 0.05,
      waistPositionFromM1: 50,
      stabilityProduct: 0.5,
      isStable: true,
    };

    const state: AppState = {
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: { [source.id]: source, [cavity.id]: cavity },
      targetMode: { kind: 'cavity', cavityComponentId: cavity.id },
      propagationResult: {
        profile: [{ z: 50, w: 0.05, gouyPhaseDeg: 0 }],
        waists: [],
        qAtComponent: {},
        qFinal: { re: 0, im: 1e-3 },
        cavityOverlap: {}, // beam never encountered the cavity
      },
    };

    expect(computeLiveModeOverlap(state)).toBeNull();
  });

  it('evaluates the beam at a target object\'s own position, not the final propagated output', () => {
    // Regression test: a target object is a pure reference point that can
    // sit anywhere along the path, including upstream of other components.
    // The overlap must compare against the beam's state *at the target*
    // (qAtComponent), not whatever the beam looks like at the very end of
    // the path after further components (e.g. a lens) have reshaped it.
    const source = createSourceComponent();
    source.wavelength = 1064;

    const target = createTargetComponent({}, { x: 100, y: 0 });
    target.waistRadius = 0.05;

    const lens = createLensThinComponent({}, { x: 200, y: 0 });

    const targetSegment: BeamSegment = {
      direction: 'right',
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
      zStart: 0,
      zEnd: 100,
      terminatedByComponentId: target.id,
      termination: 'component',
    };
    const lensSegment: BeamSegment = {
      direction: 'right',
      start: { x: 100, y: 0 },
      end: { x: 200, y: 0 },
      zStart: 100,
      zEnd: 200,
      terminatedByComponentId: lens.id,
      termination: 'component',
    };

    const zR = (Math.PI * 0.05 * 0.05) / (1064e-6);

    const state: AppState = {
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: { [source.id]: source, [target.id]: target, [lens.id]: lens },
      beamPath: {
        segments: [targetSegment, lensSegment],
        orderedComponentIds: [target.id, lens.id],
        totalLength: 200,
        isValid: true,
        invalidReason: null,
      },
      targetMode: { kind: 'target', targetComponentId: target.id },
      propagationResult: {
        profile: [{ z: 200, w: 0.05, gouyPhaseDeg: 0 }],
        waists: [],
        qAtComponent: {
          // Beam sits exactly at its own waist right at the target -> perfect match.
          [target.id]: { re: 0, im: zR },
          // Wildly different further downstream, after the lens reshapes it.
          [lens.id]: { re: 500, im: 1e-6 },
        },
        // If the (incorrect) final-output-based comparison were still used,
        // this would drag the overlap down toward 0.
        qFinal: { re: 500, im: 1e-6 },
        cavityOverlap: {},
      },
    };

    expect(computeLiveModeOverlap(state)).toBeCloseTo(1, 6);
  });

  it('returns null for a target object the beam never reached', () => {
    const source = createSourceComponent();
    const target = createTargetComponent({}, { x: 200, y: 0 });

    const state: AppState = {
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: { [source.id]: source, [target.id]: target },
      targetMode: { kind: 'target', targetComponentId: target.id },
      propagationResult: {
        profile: [{ z: 50, w: 0.05, gouyPhaseDeg: 0 }],
        waists: [],
        qAtComponent: {}, // beam never reached the target
        qFinal: { re: 0, im: 1e-3 },
        cavityOverlap: {},
      },
    };

    expect(computeLiveModeOverlap(state)).toBeNull();
  });
});
