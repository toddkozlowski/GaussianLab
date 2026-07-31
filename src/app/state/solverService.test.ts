import { describe, it, expect } from 'vitest';
import { runModeMatchSolver } from './solverService';
import { resolveAppState } from './stateResolver';
import {
  createSourceComponent,
  createLensThinComponent,
  createCavityFPComponent,
  createTargetComponent,
} from './componentFactories';
import { DEFAULT_APP_STATE } from './defaultState';
import { ConcreteBeamPropagationEngine } from '../../math/propagation';
import { solveTwoMirrorEigenmode } from '../../math/cavity';
import type { AppState } from './schema';
import type { CavitySolver } from './types/Layer0Interfaces';

const engine = new ConcreteBeamPropagationEngine();

const cavitySolver: CavitySolver = {
  solveEigenmode(cavity, wavelengthNm) {
    const lengthM = cavity.length * 1e-3;
    const wavelengthM = wavelengthNm * 1e-9;
    const eigenmode = solveTwoMirrorEigenmode(lengthM, cavity.r1 * 1e-3, cavity.r2 * 1e-3, wavelengthM);
    if (!eigenmode) {
      return null;
    }
    return {
      waistRadius: eigenmode.waistRadiusM * 1e3,
      waistPositionFromM1: eigenmode.waistPositionInCavityM * 1e3,
      stabilityProduct: eigenmode.g1 * eigenmode.g2,
      isStable: eigenmode.isStable,
    };
  },
};

function getPathZ(state: AppState, componentId: string): number | null {
  const segment = state.beamPath?.segments.find((s) => s.terminatedByComponentId === componentId);
  return segment ? segment.zEnd : null;
}

describe('runModeMatchSolver position constraints', () => {
  it('never proposes a lens position inside a cavity mirror span', () => {
    const source = createSourceComponent({}, { x: 50, y: 300 });
    const cavity = createCavityFPComponent({}, { x: 150, y: 300 });
    cavity.length = 100;
    cavity.r1 = 500;
    cavity.r2 = 500;
    // The lens starts well downstream of the cavity, but its +/-200mm search
    // window overlaps the cavity's [100, 200] span, so the solver must
    // actively exclude that region rather than happening to avoid it.
    const lens = createLensThinComponent({}, { x: 350, y: 300 });
    const target = createTargetComponent({}, { x: 600, y: 300 });
    target.waistRadius = 0.3;

    let state: AppState = {
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: {
        [source.id]: source,
        [cavity.id]: cavity,
        [lens.id]: lens,
        [target.id]: target,
      },
      targetMode: { kind: 'target', targetComponentId: target.id },
    };
    state = resolveAppState(state, engine, cavitySolver);

    const m1Z = getPathZ(state, cavity.id);
    expect(m1Z).not.toBeNull();
    const m2Z = m1Z! + cavity.length;
    expect(m1Z).toBeCloseTo(100, 6);
    expect(m2Z).toBeCloseTo(200, 6);

    const solutions = runModeMatchSolver(state, engine, 5);
    expect(solutions.length).toBeGreaterThan(0);

    for (const solution of solutions) {
      const trialPosition = solution.lensPositions[lens.id];
      const trialState = resolveAppState(
        {
          ...state,
          components: { ...state.components, [lens.id]: { ...lens, position: trialPosition } },
        },
        engine,
        cavitySolver,
      );
      const lensZ = getPathZ(trialState, lens.id);
      expect(lensZ).not.toBeNull();
      expect(lensZ! <= m1Z! || lensZ! >= m2Z).toBe(true);
    }
  });

  it('never proposes a lens position upstream of the source (z < 0)', () => {
    const source = createSourceComponent({}, { x: 50, y: 300 });
    // Starting close to the source so the +/-200mm search window dips below
    // the source's own position, into "behind the source" territory.
    const lens = createLensThinComponent({}, { x: 100, y: 300 });
    const target = createTargetComponent({}, { x: 400, y: 300 });
    target.waistRadius = 0.3;

    let state: AppState = {
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: { [source.id]: source, [lens.id]: lens, [target.id]: target },
      targetMode: { kind: 'target', targetComponentId: target.id },
    };
    state = resolveAppState(state, engine, cavitySolver);

    const solutions = runModeMatchSolver(state, engine, 5);
    expect(solutions.length).toBeGreaterThan(0);

    for (const solution of solutions) {
      const trialPosition = solution.lensPositions[lens.id];
      expect(trialPosition.x).toBeGreaterThanOrEqual(source.position.x);
    }
  });
});
