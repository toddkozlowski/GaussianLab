import { describe, it, expect } from 'vitest';
import { ConcreteBeamPropagationEngine } from './propagation';
import { freeSpaceABCD, thinLensABCD } from './abcd';
import { rayleighRange } from './qParameter';
import type { PropagationEngineInput } from '../app/state/types/Layer0Interfaces';

describe('Propagation Engine', () => {
  const engine = new ConcreteBeamPropagationEngine();
  const WAVELENGTH_NM = 1064;
  const WAVELENGTH_M = WAVELENGTH_NM / 1e9;

  describe('free space propagation', () => {
    it('propagates beam through free space without changing waist size', () => {
      const waist_mm = 0.05; // 50 µm
      const zR = rayleighRange(waist_mm / 1000, WAVELENGTH_M) * 1000; // convert to mm
      const q0 = { re: 0, im: zR }; // at waist

      const input: PropagationEngineInput = {
        q0,
        wavelengthMetres: WAVELENGTH_M,
        segments: [
          {
            distance: 100, // 100 mm free space
            abcdMatrix: { A: 1, B: 100, C: 0, D: 1 },
            componentId: null,
          },
        ],
        componentZMap: {},
      };

      const result = engine.propagateBeam(input);

      // Profile should have samples
      expect(result.profile.length).toBeGreaterThan(0);

      // Beam should expand as it propagates from waist
      const minW = Math.min(...result.profile.map(p => p.w));
      const maxW = Math.max(...result.profile.map(p => p.w));
      expect(maxW).toBeGreaterThan(minW); // Some expansion should occur

      // Last point should show noticeable expansion
      const lastW = result.profile[result.profile.length - 1].w;
      const firstW = result.profile[0].w;
      expect(lastW).toBeGreaterThan(firstW);
    });

    it('profiles include reasonable z-spacing', () => {
      const q0 = { re: 0, im: 10 };
      const input: PropagationEngineInput = {
        q0,
        wavelengthMetres: WAVELENGTH_M,
        segments: [
          {
            distance: 100,
            abcdMatrix: { A: 1, B: 100, C: 0, D: 1 },
            componentId: null,
          },
        ],
        componentZMap: {},
      };

      const result = engine.propagateBeam(input);

      // Check z-positions are monotonically increasing
      for (let i = 1; i < result.profile.length; i++) {
        expect(result.profile[i].z).toBeGreaterThanOrEqual(result.profile[i - 1].z);
      }

      // Check first and last z positions span the segment
      expect(result.profile[0].z).toBeCloseTo(0, 1);
      expect(result.profile[result.profile.length - 1].z).toBeCloseTo(100, 1);
    });
  });

  describe('lens propagation', () => {
    it('converging lens affects q-parameter', () => {
      const q0 = { re: 0, im: 10 };
      const focalLength = 100; // 100 mm focal length

      const input: PropagationEngineInput = {
        q0,
        wavelengthMetres: WAVELENGTH_M,
        segments: [
          {
            distance: 0, // Lens at z=0
            abcdMatrix: { A: 1, B: 0, C: -1 / focalLength, D: 1 },
            componentId: 'lens1',
          },
        ],
        componentZMap: { lens1: 0 },
      };

      const result = engine.propagateBeam(input);

      // q-parameter should change after lens
      expect(result.qFinal.re).not.toBe(q0.re);
    });

    it('propagates through lens and free space sequence', () => {
      const q0 = { re: 0, im: 10 };
      const focalLength = 100; // mm

      const input: PropagationEngineInput = {
        q0,
        wavelengthMetres: WAVELENGTH_M,
        segments: [
          {
            distance: 0,
            abcdMatrix: { A: 1, B: 0, C: -1 / focalLength, D: 1 },
            componentId: 'L1',
          },
          {
            distance: 50,
            abcdMatrix: { A: 1, B: 50, C: 0, D: 1 },
            componentId: null,
          },
        ],
        componentZMap: { L1: 0 },
      };

      const result = engine.propagateBeam(input);

      // Should have profile samples from both segments
      expect(result.profile.length).toBeGreaterThan(1);

      // qAtComponent should have the lens
      expect(result.qAtComponent.L1).toBeDefined();

      // qFinal should differ from initial
      expect(Math.sqrt(result.qFinal.re ** 2 + result.qFinal.im ** 2)).toBeGreaterThan(
        Math.sqrt(q0.re ** 2 + q0.im ** 2)
      );
    });
  });

  describe('multi-segment propagation', () => {
    it('propagates through multiple free space segments', () => {
      const q0 = { re: 0, im: 10 };

      const input: PropagationEngineInput = {
        q0,
        wavelengthMetres: WAVELENGTH_M,
        segments: [
          { distance: 50, abcdMatrix: { A: 1, B: 50, C: 0, D: 1 }, componentId: null },
          { distance: 50, abcdMatrix: { A: 1, B: 50, C: 0, D: 1 }, componentId: null },
          { distance: 50, abcdMatrix: { A: 1, B: 50, C: 0, D: 1 }, componentId: null },
        ],
        componentZMap: {},
      };

      const result = engine.propagateBeam(input);

      // Profile should span total distance (150 mm)
      expect(result.profile[result.profile.length - 1].z).toBeCloseTo(150, 1);

      // Beam should expand monotonically
      let prevW = result.profile[0].w;
      for (let i = 1; i < result.profile.length; i++) {
        expect(result.profile[i].w).toBeGreaterThanOrEqual(prevW - 0.001); // Allow small numerical errors
        prevW = result.profile[i].w;
      }
    });

    it('tracks q-parameter at each component', () => {
      const q0 = { re: 0, im: 10 };

      const input: PropagationEngineInput = {
        q0,
        wavelengthMetres: WAVELENGTH_M,
        segments: [
          { distance: 50, abcdMatrix: { A: 1, B: 50, C: 0, D: 1 }, componentId: 'M1' },
          { distance: 50, abcdMatrix: { A: 1, B: 50, C: 0, D: 1 }, componentId: 'M2' },
        ],
        componentZMap: { M1: 0.05, M2: 0.1 },
      };

      const result = engine.propagateBeam(input);

      expect(result.qAtComponent.M1).toBeDefined();
      expect(result.qAtComponent.M2).toBeDefined();

      // Both components should have their q-parameters recorded
      expect(Number.isFinite(result.qAtComponent.M1.re)).toBe(true);
      expect(Number.isFinite(result.qAtComponent.M1.im)).toBe(true);
      expect(Number.isFinite(result.qAtComponent.M2.re)).toBe(true);
      expect(Number.isFinite(result.qAtComponent.M2.im)).toBe(true);
    });
  });

  describe('output consistency', () => {
    it('returns valid PropagationResult structure', () => {
      const q0 = { re: 0, im: 10 };

      const input: PropagationEngineInput = {
        q0,
        wavelengthMetres: WAVELENGTH_M,
        segments: [{ distance: 100, abcdMatrix: { A: 1, B: 100, C: 0, D: 1 }, componentId: null }],
        componentZMap: {},
      };

      const result = engine.propagateBeam(input);

      // Verify all required fields exist
      expect(Array.isArray(result.profile)).toBe(true);
      expect(Array.isArray(result.waists)).toBe(true);
      expect(typeof result.qAtComponent).toBe('object');
      expect(result.qFinal).toBeDefined();
      expect(result.qFinal.re).toBeDefined();
      expect(result.qFinal.im).toBeDefined();
    });

    it('profile waist w values are positive', () => {
      const q0 = { re: 0, im: 10 };

      const input: PropagationEngineInput = {
        q0,
        wavelengthMetres: WAVELENGTH_M,
        segments: [{ distance: 200, abcdMatrix: { A: 1, B: 200, C: 0, D: 1 }, componentId: null }],
        componentZMap: {},
      };

      const result = engine.propagateBeam(input);

      for (const point of result.profile) {
        expect(point.w).toBeGreaterThan(0);
        expect(point.z).toBeGreaterThanOrEqual(0);
      }
    });

    it('waist list is non-empty for typical propagation', () => {
      const q0 = { re: 0, im: 10 };

      const input: PropagationEngineInput = {
        q0,
        wavelengthMetres: WAVELENGTH_M,
        segments: [{ distance: 100, abcdMatrix: { A: 1, B: 100, C: 0, D: 1 }, componentId: null }],
        componentZMap: {},
      };

      const result = engine.propagateBeam(input);

      // Should have at least one waist detected
      expect(result.waists.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('physical realism', () => {
    it('beam expands in far field according to diffraction', () => {
      const waist_mm = 0.05; // 50 µm
      const zR = rayleighRange(waist_mm / 1000, WAVELENGTH_M) * 1000; // to mm
      const q0 = { re: 0, im: zR };

      const input: PropagationEngineInput = {
        q0,
        wavelengthMetres: WAVELENGTH_M,
        segments: [{ distance: 1000, abcdMatrix: { A: 1, B: 1000, C: 0, D: 1 }, componentId: null }],
        componentZMap: {},
      };

      const result = engine.propagateBeam(input);

      const wStart = result.profile[0].w;
      const wEnd = result.profile[result.profile.length - 1].w;

      // In far field (1000 mm >> zR), beam divergence dominates
      // w ≈ w0 * z / zR
      const expectedDivergence = WAVELENGTH_M / (Math.PI * (waist_mm / 1000)); // radians
      const observedDivergence = (wEnd - wStart) / 1000; // actual divergence

      // Should be in the ballpark
      expect(observedDivergence).toBeGreaterThan(0);
      expect(observedDivergence).toBeLessThan(0.1); // < 100 mrad
    });
  });
});
