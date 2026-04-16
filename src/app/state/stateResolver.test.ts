import { describe, it, expect, vi } from 'vitest';
import { resolveAppState } from './stateResolver';
import { createSourceComponent, createLensThinComponent, createCavityFPComponent } from './componentFactories';
import { DEFAULT_APP_STATE } from './defaultState';
import type { PropagationEngine, CavitySolver } from './types/Layer0Interfaces';
import type { CavityFPComponent } from './schema';

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
      }),
    };

    resolveAppState(state, mockEngine, undefined);
    expect((mockEngine.propagateBeam as any).mock.calls).toHaveLength(1);
    const callArgs = (mockEngine.propagateBeam as any).mock.calls[0][0];
    expect(callArgs.wavelengthMetres).toBeCloseTo(532e-9, 15);
  });
});
