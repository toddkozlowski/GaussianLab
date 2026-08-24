import { describe, it, expect } from 'vitest';
import { runModeMatchSolver, rankSolutions, getMovableLenses, MAX_OPTIMIZER_LENSES } from './solverService';
import { resolveAppState } from './stateResolver';
import {
  createSourceComponent,
  createLensThinComponent,
  createCavityFPComponent,
  createTargetComponent,
  createCustomObjectComponent,
  createFlatMirrorComponent,
} from './componentFactories';
import { DEFAULT_APP_STATE } from './defaultState';
import { ConcreteBeamPropagationEngine } from '../../math/propagation';
import { solveTwoMirrorEigenmode } from '../../math/cavity';
import type { AppState, OptimiserSolution } from './schema';
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

  it('never proposes a lens position inside a cavity mirror span even when every candidate scores 0% overlap (score-tie edge case)', () => {
    // objective() returns exactly 0 both for an invalid placement (inside the
    // cavity) and for a valid placement that genuinely achieves ~0% overlap -
    // those look identical by score alone. A stub engine that reports no
    // measurable beam anywhere forces every candidate in the search window to
    // score 0, which is exactly the condition under which an invalid
    // candidate could tie a valid one and slip through without a hard,
    // score-independent legality filter on the final candidate set.
    const zeroOverlapEngine = {
      propagateBeam: () => ({
        profile: [],
        waists: [],
        qAtComponent: {},
        qFinal: { re: 0, im: 1e-6 },
        cavityOverlap: {},
      }),
    };

    const source = createSourceComponent({}, { x: 50, y: 300 });
    const cavity = createCavityFPComponent({}, { x: 150, y: 300 });
    cavity.length = 100;
    cavity.r1 = 500;
    cavity.r2 = 500;
    const lens = createLensThinComponent({}, { x: 250, y: 300 });
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
    const m2Z = m1Z! + cavity.length;

    const solutions = runModeMatchSolver(state, zeroOverlapEngine, 5);

    for (const solution of solutions) {
      const trialPosition = solution.lensPositions[lens.id];
      const trialState = resolveAppState(
        {
          ...state,
          components: { ...state.components, [lens.id]: { ...lens, position: trialPosition } },
        },
        zeroOverlapEngine,
      );
      const lensZ = getPathZ(trialState, lens.id);
      expect(lensZ).not.toBeNull();
      expect(lensZ! <= m1Z! || lensZ! >= m2Z).toBe(true);
    }
  });

  it('never proposes a lens position inside a custom object\'s thickness span', () => {
    const source = createSourceComponent({}, { x: 50, y: 300 });
    const customObject = createCustomObjectComponent({}, { x: 150, y: 300 });
    customObject.thickness = 100;
    // The lens starts well downstream of the object, but its +/-200mm search
    // window overlaps the object's [100, 200] span, so the solver must
    // actively exclude that region rather than happening to avoid it.
    const lens = createLensThinComponent({}, { x: 350, y: 300 });
    const target = createTargetComponent({}, { x: 600, y: 300 });
    target.waistRadius = 0.3;

    let state: AppState = {
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: {
        [source.id]: source,
        [customObject.id]: customObject,
        [lens.id]: lens,
        [target.id]: target,
      },
      targetMode: { kind: 'target', targetComponentId: target.id },
    };
    state = resolveAppState(state, engine, cavitySolver);

    const frontZ = getPathZ(state, customObject.id);
    expect(frontZ).not.toBeNull();
    const backZ = frontZ! + customObject.thickness;
    expect(frontZ).toBeCloseTo(100, 6);
    expect(backZ).toBeCloseTo(200, 6);

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
      expect(lensZ! <= frontZ! || lensZ! >= backZ).toBe(true);
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

describe('runModeMatchSolver avoidCollisions toggle', () => {
  it('keeps solutions clear of the proximity threshold when on, but not when off', () => {
    const source = createSourceComponent({}, { x: 50, y: 300 });
    const lens = createLensThinComponent({}, { x: 250, y: 300 });
    const target = createTargetComponent({}, { x: 600, y: 300 });
    target.waistRadius = 0.3;

    let baseState: AppState = {
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: { [source.id]: source, [lens.id]: lens, [target.id]: target },
      targetMode: { kind: 'target', targetComponentId: target.id },
    };
    baseState = resolveAppState(baseState, engine, cavitySolver);
    baseState = { ...baseState, optimiser: { ...baseState.optimiser, avoidCollisions: false } };

    // Find the unconstrained optimum first, then plant a stationary marker
    // exactly there - that turns the previously-best spot into a "too close"
    // zone for the next runs.
    const baseline = runModeMatchSolver(baseState, engine, 5);
    expect(baseline.length).toBeGreaterThan(0);
    const bestPosition = baseline[0].lensPositions[lens.id];

    const obstacle = createTargetComponent({}, { ...bestPosition });
    let obstructedState: AppState = {
      ...baseState,
      components: { ...baseState.components, [obstacle.id]: obstacle },
    };
    obstructedState = resolveAppState(obstructedState, engine, cavitySolver);

    const distanceToObstacle = (solution: OptimiserSolution) => {
      const pos = solution.lensPositions[lens.id];
      return Math.hypot(pos.x - obstacle.position.x, pos.y - obstacle.position.y);
    };

    const withAvoidance = runModeMatchSolver(
      { ...obstructedState, optimiser: { ...obstructedState.optimiser, avoidCollisions: true } },
      engine,
      5,
    );
    expect(withAvoidance.length).toBeGreaterThan(0);
    for (const solution of withAvoidance) {
      expect(distanceToObstacle(solution)).toBeGreaterThanOrEqual(10);
    }

    const withoutAvoidance = runModeMatchSolver(
      { ...obstructedState, optimiser: { ...obstructedState.optimiser, avoidCollisions: false } },
      engine,
      5,
    );
    expect(withoutAvoidance.length).toBeGreaterThan(0);
    const closestWithout = Math.min(...withoutAvoidance.map(distanceToObstacle));
    expect(closestWithout).toBeLessThan(10);
  });

  it('honors the table\'s configured minComponentSpacingMm, not a hardcoded threshold', () => {
    const source = createSourceComponent({}, { x: 50, y: 300 });
    const lens = createLensThinComponent({}, { x: 250, y: 300 });
    const target = createTargetComponent({}, { x: 600, y: 300 });
    target.waistRadius = 0.3;

    let baseState: AppState = {
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: { [source.id]: source, [lens.id]: lens, [target.id]: target },
      targetMode: { kind: 'target', targetComponentId: target.id },
      optimiser: { ...DEFAULT_APP_STATE.optimiser, avoidCollisions: false },
    };
    baseState = resolveAppState(baseState, engine, cavitySolver);

    const baseline = runModeMatchSolver(baseState, engine, 5);
    expect(baseline.length).toBeGreaterThan(0);
    const bestPosition = baseline[0].lensPositions[lens.id];

    const obstacle = createTargetComponent({}, { ...bestPosition });
    let obstructedState: AppState = {
      ...baseState,
      optimiser: { ...baseState.optimiser, avoidCollisions: true },
      components: { ...baseState.components, [obstacle.id]: obstacle },
    };
    obstructedState = resolveAppState(obstructedState, engine, cavitySolver);

    const distanceToObstacle = (solution: OptimiserSolution) =>
      Math.hypot(
        solution.lensPositions[lens.id].x - obstacle.position.x,
        solution.lensPositions[lens.id].y - obstacle.position.y,
      );

    // A much wider configured spacing pushes solutions further away...
    const wideSpacingState: AppState = {
      ...obstructedState,
      table: { ...obstructedState.table, minComponentSpacingMm: 30 },
    };
    const wideSolutions = runModeMatchSolver(wideSpacingState, engine, 5);
    expect(wideSolutions.length).toBeGreaterThan(0);
    for (const solution of wideSolutions) {
      expect(distanceToObstacle(solution)).toBeGreaterThanOrEqual(30);
    }

    // ...while a spacing of exactly 0 disables the check entirely, allowing
    // the optimum to land right on top of the obstacle again.
    const zeroSpacingState: AppState = {
      ...obstructedState,
      table: { ...obstructedState.table, minComponentSpacingMm: 0 },
    };
    const zeroSolutions = runModeMatchSolver(zeroSpacingState, engine, 5);
    expect(zeroSolutions.length).toBeGreaterThan(0);
    expect(Math.min(...zeroSolutions.map(distanceToObstacle))).toBeLessThan(1);
  });
});

describe('runModeMatchSolver manual adjustment ranges', () => {
  it('confines lens placements to the given z-range on a straight path', () => {
    const source = createSourceComponent({}, { x: 50, y: 300 });
    const lens = createLensThinComponent({}, { x: 250, y: 300 });
    const target = createTargetComponent({}, { x: 900, y: 300 });
    target.waistRadius = 0.3;

    let state: AppState = {
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: { [source.id]: source, [lens.id]: lens, [target.id]: target },
      targetMode: { kind: 'target', targetComponentId: target.id },
      optimiser: {
        ...DEFAULT_APP_STATE.optimiser,
        manualRangesEnabled: true,
        manualRanges: [{ id: 'range-1', startZMm: 10, endZMm: 40 }],
      },
    };
    state = resolveAppState(state, engine, cavitySolver);

    const solutions = runModeMatchSolver(state, engine, 5);
    expect(solutions.length).toBeGreaterThan(0);

    for (const solution of solutions) {
      const trialState = resolveAppState(
        {
          ...state,
          components: { ...state.components, [lens.id]: { ...lens, position: solution.lensPositions[lens.id] } },
        },
        engine,
        cavitySolver,
      );
      const z = getPathZ(trialState, lens.id);
      expect(z).not.toBeNull();
      expect(z! >= 10 - 1e-6 && z! <= 40 + 1e-6).toBe(true);
    }
  });

  it('confines a lens to the physical extent of a z-range that bends around a mirror', () => {
    // source(100,300) --right--> mirror(300,300) --135deg--> down --> lens (vertical) --> target
    const source = createSourceComponent({}, { x: 100, y: 300 });
    source.direction = 'right';
    const mirror = createFlatMirrorComponent({}, { x: 300, y: 300 });
    mirror.orientation = 135; // reflects right -> down
    const lens = createLensThinComponent({}, { x: 300, y: 450 });
    const target = createTargetComponent({}, { x: 300, y: 900 });
    target.waistRadius = 0.3;

    // Path z: segment0 (right) = [0,200], segment1 (down, past mirror) = [200, ...].
    // Range [150,250] crosses the mirror; on the lens's own (vertical) segment
    // this maps to physical y in [300, 350].
    let state: AppState = {
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: {
        [source.id]: source,
        [mirror.id]: mirror,
        [lens.id]: lens,
        [target.id]: target,
      },
      targetMode: { kind: 'target', targetComponentId: target.id },
      optimiser: {
        ...DEFAULT_APP_STATE.optimiser,
        manualRangesEnabled: true,
        manualRanges: [{ id: 'range-1', startZMm: 150, endZMm: 250 }],
      },
    };
    state = resolveAppState(state, engine, cavitySolver);

    const solutions = runModeMatchSolver(state, engine, 5);
    expect(solutions.length).toBeGreaterThan(0);

    for (const solution of solutions) {
      const pos = solution.lensPositions[lens.id];
      expect(pos.x).toBeCloseTo(300, 6); // stays on the vertical segment
      expect(pos.y).toBeGreaterThanOrEqual(300 - 1e-6);
      expect(pos.y).toBeLessThanOrEqual(350 + 1e-6);
    }
  });

  it('is a no-op when manualRangesEnabled is false, even if manualRanges is populated', () => {
    const source = createSourceComponent({}, { x: 50, y: 300 });
    const lens = createLensThinComponent({}, { x: 250, y: 300 });
    const target = createTargetComponent({}, { x: 900, y: 300 });
    target.waistRadius = 0.3;

    const baseState: AppState = {
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: { [source.id]: source, [lens.id]: lens, [target.id]: target },
      targetMode: { kind: 'target', targetComponentId: target.id },
    };

    // A deliberately narrow, source-hugging range: x in [50,450] is the
    // default +/-200mm window around the lens's starting x=250, which fully
    // contains this range's x in [60,90] (z==x-50 on this straight path) -
    // so disabling the constraint can only ever do as well or better.
    const narrowRange = { id: 'range-1', startZMm: 10, endZMm: 40 };

    const enabledState = resolveAppState(
      {
        ...baseState,
        optimiser: { ...DEFAULT_APP_STATE.optimiser, manualRangesEnabled: true, manualRanges: [narrowRange] },
      },
      engine,
      cavitySolver,
    );
    const disabledState = resolveAppState(
      {
        ...baseState,
        optimiser: { ...DEFAULT_APP_STATE.optimiser, manualRangesEnabled: false, manualRanges: [narrowRange] },
      },
      engine,
      cavitySolver,
    );

    const enabledSolutions = runModeMatchSolver(enabledState, engine, 5);
    const disabledSolutions = runModeMatchSolver(disabledState, engine, 5);
    expect(enabledSolutions.length).toBeGreaterThan(0);
    expect(disabledSolutions.length).toBeGreaterThan(0);

    const bestEnabled = Math.max(...enabledSolutions.map((s) => s.overlap));
    const bestDisabled = Math.max(...disabledSolutions.map((s) => s.overlap));
    expect(bestDisabled).toBeGreaterThanOrEqual(bestEnabled);
  });
});

describe('runModeMatchSolver wide-range search', () => {
  it('finds a solution requiring a lens move far beyond a local +/-200mm re-centering window', () => {
    // The true optimum for this lens/target combination sits ~890mm from the
    // lens's starting position - well past what three passes of a
    // +/-200mm re-centering window could ever reach (max 600mm total) - and
    // within that reachable 620mm neighbourhood the best achievable overlap
    // is only ~30%, so this can only be found by a first pass that samples
    // the lens's entire collinear region (source to target) up front.
    const source = createSourceComponent({}, { x: 0, y: 300 });
    source.waistRadius = 0.1;
    source.waistOffset = 0;
    const lens = createLensThinComponent({}, { x: 20, y: 300 });
    lens.focalLength = 900;
    const target = createTargetComponent({}, { x: 4000, y: 300 });
    target.waistRadius = 2;

    let state: AppState = {
      ...DEFAULT_APP_STATE,
      table: { ...DEFAULT_APP_STATE.table, width: 4200, height: 600 },
      sourceId: source.id,
      components: { [source.id]: source, [lens.id]: lens, [target.id]: target },
      targetMode: { kind: 'target', targetComponentId: target.id },
    };
    state = resolveAppState(state, engine);

    const solutions = runModeMatchSolver(state, engine, 5);
    expect(solutions.length).toBeGreaterThan(0);

    const best = solutions[0];
    expect(best.overlap).toBeGreaterThan(0.85);

    const movedDistance = Math.abs(best.lensPositions[lens.id].x - lens.position.x);
    expect(movedDistance).toBeGreaterThan(600);
  });
});

describe('runModeMatchSolver lens count cap', () => {
  it('excludes locked and optimiser-disabled lenses from getMovableLenses', () => {
    const source = createSourceComponent({}, { x: 50, y: 300 });
    const movable = createLensThinComponent({}, { x: 150, y: 300 });
    const lockedLens = createLensThinComponent({}, { x: 250, y: 300 });
    lockedLens.locked = true;
    const disabledLens = createLensThinComponent({}, { x: 350, y: 300 });
    disabledLens.optimiserCanMove = false;

    const state: AppState = {
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: {
        [source.id]: source,
        [movable.id]: movable,
        [lockedLens.id]: lockedLens,
        [disabledLens.id]: disabledLens,
      },
    };

    const movableLenses = getMovableLenses(state);
    expect(movableLenses.map((l) => l.id)).toEqual([movable.id]);
  });

  it('refuses to run (returns no solutions) when more than the cap of movable lenses are present', () => {
    const source = createSourceComponent({}, { x: 0, y: 300 });
    const target = createTargetComponent({}, { x: 900, y: 300 });
    target.waistRadius = 0.3;

    const components: AppState['components'] = { [source.id]: source, [target.id]: target };
    for (let i = 0; i < MAX_OPTIMIZER_LENSES + 1; i += 1) {
      const lens = createLensThinComponent(components, { x: 100 + i * 100, y: 300 });
      components[lens.id] = lens;
    }

    let state: AppState = {
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components,
      targetMode: { kind: 'target', targetComponentId: target.id },
    };
    state = resolveAppState(state, engine, cavitySolver);

    expect(getMovableLenses(state).length).toBe(MAX_OPTIMIZER_LENSES + 1);
    expect(runModeMatchSolver(state, engine, 5)).toEqual([]);
  });

  it('runs normally with exactly the cap of movable lenses', () => {
    const source = createSourceComponent({}, { x: 0, y: 300 });
    const target = createTargetComponent({}, { x: 900, y: 300 });
    target.waistRadius = 0.3;

    const components: AppState['components'] = { [source.id]: source, [target.id]: target };
    for (let i = 0; i < MAX_OPTIMIZER_LENSES; i += 1) {
      const lens = createLensThinComponent(components, { x: 100 + i * 100, y: 300 });
      components[lens.id] = lens;
    }

    let state: AppState = {
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components,
      targetMode: { kind: 'target', targetComponentId: target.id },
    };
    state = resolveAppState(state, engine, cavitySolver);

    expect(getMovableLenses(state).length).toBe(MAX_OPTIMIZER_LENSES);
    const solutions = runModeMatchSolver(state, engine, 5);
    expect(solutions.length).toBeGreaterThan(0);
  });
});

describe('runModeMatchSolver cavity intrusion guard', () => {
  it('refuses to run while a component sits inside a cavity\'s mirror span', () => {
    const source = createSourceComponent({}, { x: 0, y: 300 });
    const cavity = createCavityFPComponent({}, { x: 100, y: 300 });
    cavity.length = 100; // M1=100, M2=200
    // Intrudes into the cavity's [100, 200] span.
    const intrudingLens = createLensThinComponent({}, { x: 150, y: 300 });
    // A separate, otherwise-legitimate movable lens elsewhere on the path.
    const movableLens = createLensThinComponent({}, { x: 400, y: 300 });
    const target = createTargetComponent({}, { x: 900, y: 300 });
    target.waistRadius = 0.3;

    let state: AppState = {
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: {
        [source.id]: source,
        [cavity.id]: cavity,
        [intrudingLens.id]: intrudingLens,
        [movableLens.id]: movableLens,
        [target.id]: target,
      },
      targetMode: { kind: 'target', targetComponentId: target.id },
    };
    state = resolveAppState(state, engine, cavitySolver);

    expect(runModeMatchSolver(state, engine, 5)).toEqual([]);
  });
});

describe('runModeMatchSolver sensitivity reporting', () => {
  it('attaches a numeric maxLensSensitivity to every returned solution', () => {
    const source = createSourceComponent({}, { x: 50, y: 300 });
    const lens = createLensThinComponent({}, { x: 250, y: 300 });
    const target = createTargetComponent({}, { x: 600, y: 300 });
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
      expect(typeof solution.maxLensSensitivity === 'number' || solution.maxLensSensitivity === null).toBe(true);
      if (typeof solution.maxLensSensitivity === 'number') {
        expect(solution.maxLensSensitivity).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('rankSolutions', () => {
  function makeSolution(overlap: number, maxLensSensitivity: number | null, id: string): OptimiserSolution {
    return { id, lensPositions: {}, overlap, maxLensSensitivity, summary: '' };
  }

  it('re-ranks a tied 100%-overlap group by ascending sensitivity, leaving lower-overlap solutions in place', () => {
    const solutions = [
      makeSolution(1, 9, 'a'), // 100%, high sensitivity - should move down
      makeSolution(1, 2, 'b'), // 100%, low sensitivity - should move up
      makeSolution(0.8, 0.1, 'c'), // not tied for first - order among these is untouched
      makeSolution(1, 5, 'd'), // 100%, mid sensitivity
      makeSolution(0.5, 0.05, 'e'),
    ];

    const ranked = rankSolutions(solutions);

    expect(ranked.map((s) => s.id)).toEqual(['b', 'd', 'a', 'c', 'e']);
  });

  it('treats a null sensitivity as worst-case, sorting it after every measured value', () => {
    const solutions = [
      makeSolution(1, null, 'unmeasured'),
      makeSolution(1, 3, 'measured'),
    ];

    const ranked = rankSolutions(solutions);

    expect(ranked.map((s) => s.id)).toEqual(['measured', 'unmeasured']);
  });

  it('leaves a single 100% solution and non-tied solutions untouched', () => {
    const solutions = [makeSolution(1, 7, 'only'), makeSolution(0.9, 1, 'second'), makeSolution(0.7, 2, 'third')];

    expect(rankSolutions(solutions).map((s) => s.id)).toEqual(['only', 'second', 'third']);
  });
});
