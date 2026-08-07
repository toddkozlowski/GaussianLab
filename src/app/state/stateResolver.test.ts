import { describe, it, expect, vi } from 'vitest';
import { resolveAppState } from './stateResolver';
import {
  createSourceComponent,
  createLensThinComponent,
  createCavityFPComponent,
  createTargetComponent,
} from './componentFactories';
import { DEFAULT_APP_STATE } from './defaultState';
import { ConcreteBeamPropagationEngine } from '../../math/propagation';
import { computeLiveModeOverlap } from './modeMetrics';
import type { PropagationEngine, CavitySolver } from './types/Layer0Interfaces';
import type { CavityFPComponent, LensThinComponent } from './schema';

describe('stateResolver', () => {
  it('returns null beamPath if no source is placed', () => {
    const state = {
      ...DEFAULT_APP_STATE,
      sourceId: null,
    };

    const resolved = resolveAppState(state);
    expect(resolved.beamPath).toBeNull();
    expect(resolved.propagationResult).toBeNull();
  });

  it('resolves beamPath without propagation engine', () => {
    const source = createSourceComponent();
    source.position = { x: 100, y: 300 };
    source.direction = 'right';

    const state = {
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: { [source.id]: source },
    };

    const resolved = resolveAppState(state, undefined, undefined);
    expect(resolved.beamPath).not.toBeNull();
    expect(resolved.beamPath?.isValid).toBe(true);
    expect(resolved.propagationResult).toBeNull(); // No engine provided
  });

  it('calls propagation engine when available and beamPath is valid', () => {
    const source = createSourceComponent();
    source.position = { x: 100, y: 300 };
    source.direction = 'right';

    const state = {
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: { [source.id]: source },
    };

    const mockEngine: PropagationEngine = {
      propagateBeam: vi.fn().mockReturnValue({
        profile: [{ z: 0, w: 0.05 }],
        waists: [],
        qAtComponent: {},
        qFinal: { re: 0, im: 1e-6 },
        cavityOverlap: {},
      }),
    };

    const resolved = resolveAppState(state, mockEngine, undefined);
    expect(mockEngine.propagateBeam).toHaveBeenCalled();
    expect(resolved.propagationResult).not.toBeNull();
  });

  it('does not call propagation engine if beamPath is invalid', () => {
    const state = {
      ...DEFAULT_APP_STATE,
      sourceId: 'nonexistent',
      components: {},
    };

    const mockEngine: PropagationEngine = {
      propagateBeam: vi.fn(),
    };

    const resolved = resolveAppState(state, mockEngine, undefined);
    expect(mockEngine.propagateBeam).not.toHaveBeenCalled();
    expect(resolved.propagationResult).toBeNull();
  });

  it('calls cavity solver for cavity components', () => {
    const source = createSourceComponent();
    source.wavelength = 1064;

    const cavity = createCavityFPComponent();
    cavity.length = 100;
    cavity.r1 = 100;
    cavity.r2 = 100;

    const state = {
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: {
        [source.id]: source,
        [cavity.id]: cavity,
      },
    };

    const mockSolver: CavitySolver = {
      solveEigenmode: vi.fn().mockReturnValue({
        waistRadius: 0.05,
        waistPositionFromM1: 50,
        stabilityProduct: 0.5,
        isStable: true,
      }),
    };

    const resolved = resolveAppState(state, undefined, mockSolver);
    expect(mockSolver.solveEigenmode).toHaveBeenCalledWith(cavity, 1064);
    const resolvedCavity = resolved.components[cavity.id] as CavityFPComponent;
    expect(resolvedCavity.eigenmode).not.toBeNull();
  });

  it('sets cavity eigenmode to null if solver fails', () => {
    const source = createSourceComponent();
    const cavity = createCavityFPComponent();

    const state = {
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: {
        [source.id]: source,
        [cavity.id]: cavity,
      },
    };

    const mockSolver: CavitySolver = {
      solveEigenmode: vi.fn().mockReturnValue(null), // Cavity unstable
    };

    const resolved = resolveAppState(state, undefined, mockSolver);
    const resolvedCavity = resolved.components[cavity.id] as CavityFPComponent;
    expect(resolvedCavity.eigenmode).toBeNull();
  });

  it('preserves non-cavity components unchanged', () => {
    const source = createSourceComponent();
    const lens = createLensThinComponent();

    const state = {
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: {
        [source.id]: source,
        [lens.id]: lens,
      },
    };

    const resolved = resolveAppState(state, undefined, undefined);
    expect(resolved.components[source.id]).toEqual(source);
    expect(resolved.components[lens.id]).toEqual(lens);
  });

  it('handles multiple cavities', () => {
    const source = createSourceComponent();
    const cavity1 = createCavityFPComponent();
    const cavity2 = createCavityFPComponent();

    const state = {
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: {
        [source.id]: source,
        [cavity1.id]: cavity1,
        [cavity2.id]: cavity2,
      },
    };

    const mockSolver: CavitySolver = {
      solveEigenmode: vi.fn().mockReturnValue({
        waistRadius: 0.05,
        waistPositionFromM1: 50,
        stabilityProduct: 0.5,
        isStable: true,
      }),
    };

    const resolved = resolveAppState(state, undefined, mockSolver);
    expect(mockSolver.solveEigenmode).toHaveBeenCalledTimes(2);
    const resolvedCavity1 = resolved.components[cavity1.id] as CavityFPComponent;
    const resolvedCavity2 = resolved.components[cavity2.id] as CavityFPComponent;
    expect(resolvedCavity1.eigenmode).not.toBeNull();
    expect(resolvedCavity2.eigenmode).not.toBeNull();
  });

  it('extracts source wavelength in correct units', () => {
    const source = createSourceComponent();
    source.wavelength = 532; // nm (green)

    const state = {
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: { [source.id]: source },
    };

    const mockEngine: PropagationEngine = {
      propagateBeam: vi.fn().mockReturnValue({
        profile: [],
        waists: [],
        qAtComponent: {},
        qFinal: { re: 0, im: 1e-6 },
        cavityOverlap: {},
      }),
    };

    resolveAppState(state, mockEngine, undefined);
    expect((mockEngine.propagateBeam as any).mock.calls).toHaveLength(1);
    const callArgs = (mockEngine.propagateBeam as any).mock.calls[0][0];
    expect(callArgs.wavelengthMetres).toBeCloseTo(532e-9, 15);
  });

  describe('lens position sensitivity', () => {
    const engine = new ConcreteBeamPropagationEngine();

    it('is null when there is no propagation engine', () => {
      const source = createSourceComponent({}, { x: 50, y: 300 });
      const lens = createLensThinComponent({}, { x: 250, y: 300 });
      const target = createTargetComponent({}, { x: 600, y: 300 });

      const state = {
        ...DEFAULT_APP_STATE,
        sourceId: source.id,
        components: { [source.id]: source, [lens.id]: lens, [target.id]: target },
        targetMode: { kind: 'target' as const, targetComponentId: target.id },
      };

      const resolved = resolveAppState(state);
      expect((resolved.components[lens.id] as LensThinComponent).sensitivity).toBeNull();
    });

    it('is null when there is no target mode', () => {
      const source = createSourceComponent({}, { x: 50, y: 300 });
      const lens = createLensThinComponent({}, { x: 250, y: 300 });

      const state = {
        ...DEFAULT_APP_STATE,
        sourceId: source.id,
        components: { [source.id]: source, [lens.id]: lens },
      };

      const resolved = resolveAppState(state, engine);
      expect((resolved.components[lens.id] as LensThinComponent).sensitivity).toBeNull();
    });

    it('reports a finite, non-negative %/mm^2 value matching an independent finite-difference estimate', () => {
      const source = createSourceComponent({}, { x: 50, y: 300 });
      const lens = createLensThinComponent({}, { x: 250, y: 300 });
      const target = createTargetComponent({}, { x: 600, y: 300 });
      target.waistRadius = 0.3;

      const state = {
        ...DEFAULT_APP_STATE,
        sourceId: source.id,
        components: { [source.id]: source, [lens.id]: lens, [target.id]: target },
        targetMode: { kind: 'target' as const, targetComponentId: target.id },
      };

      const resolved = resolveAppState(state, engine);
      const resolvedLens = resolved.components[lens.id] as LensThinComponent;

      expect(resolvedLens.sensitivity).not.toBeNull();
      expect(Number.isFinite(resolvedLens.sensitivity!)).toBe(true);
      expect(resolvedLens.sensitivity!).toBeGreaterThanOrEqual(0);

      // Cross-check with the same central finite-difference recipe, driven
      // independently through the public resolveAppState/computeLiveModeOverlap
      // API rather than the resolver's own internals.
      const h = 0.5;
      const overlapAtOffset = (offsetMm: number) => {
        const perturbed = {
          ...resolved.components,
          [lens.id]: {
            ...resolvedLens,
            position: { ...resolvedLens.position, x: resolvedLens.position.x + offsetMm },
          },
        };
        const perturbedState = resolveAppState({ ...resolved, components: perturbed }, engine);
        return computeLiveModeOverlap(perturbedState)!;
      };

      const oMinus = overlapAtOffset(-h);
      const oCenter = computeLiveModeOverlap(resolved)!;
      const oPlus = overlapAtOffset(h);
      const expected = Math.abs((oPlus - 2 * oCenter + oMinus) / (h * h)) * 100;

      expect(resolvedLens.sensitivity!).toBeCloseTo(expected, 6);
    });
  });
});
