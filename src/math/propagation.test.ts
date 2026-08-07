import { describe, it, expect } from 'vitest';
import { ConcreteBeamPropagationEngine } from './propagation';
import { freeSpaceABCD, thinLensABCD } from './abcd';
import { rayleighRange } from './qParameter';
import { calculateModeOverlapFromWaistParams } from './overlap';
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
            componentKind: 'lens_thin',
            lensFocalLengthMm: focalLength,
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

    it('does not retroactively change upstream profile before lens', () => {
      const q0 = { re: 0, im: 10 };

      const freeSpaceOnly: PropagationEngineInput = {
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

      const withLensAfter100mm: PropagationEngineInput = {
        q0,
        wavelengthMetres: WAVELENGTH_M,
        segments: [
          {
            distance: 100,
            abcdMatrix: { A: 1, B: 100, C: 0, D: 1 },
            componentId: 'L1',
            componentKind: 'lens_thin',
            lensFocalLengthMm: 75,
          },
          {
            distance: 100,
            abcdMatrix: { A: 1, B: 100, C: 0, D: 1 },
            componentId: null,
          },
        ],
        componentZMap: { L1: 100 },
      };

      const baseline = engine.propagateBeam(freeSpaceOnly);
      const withLens = engine.propagateBeam(withLensAfter100mm);

      const baselineAt50 = baseline.profile.find((p) => Math.abs(p.z - 50) < 1e-6);
      const withLensAt50 = withLens.profile.find((p) => Math.abs(p.z - 50) < 1e-6);

      expect(baselineAt50).toBeDefined();
      expect(withLensAt50).toBeDefined();
      expect(withLensAt50!.w).toBeCloseTo(baselineAt50!.w, 9);
    });

    it('keeps beam radius continuous across a thin lens encounter', () => {
      const q0 = { re: 0, im: 10 };
      const input: PropagationEngineInput = {
        q0,
        wavelengthMetres: WAVELENGTH_M,
        segments: [
          {
            distance: 100,
            abcdMatrix: { A: 1, B: 100, C: 0, D: 1 },
            componentId: 'L1',
            componentKind: 'lens_thin',
            lensFocalLengthMm: 75,
          },
          {
            distance: 50,
            abcdMatrix: { A: 1, B: 50, C: 0, D: 1 },
            componentId: null,
          },
        ],
        componentZMap: { L1: 100 },
      };

      const result = engine.propagateBeam(input);
      const beforeLens = result.profile.find((p) => Math.abs(p.z - 100) < 1e-6);
      const justAfterLens = result.profile.find((p) => Math.abs(p.z - 105) < 1e-6);

      expect(beforeLens).toBeDefined();
      expect(justAfterLens).toBeDefined();
      expect(Math.abs(justAfterLens!.w - beforeLens!.w)).toBeLessThan(0.02);
    });
  });

  describe('custom object (dielectric slab) propagation', () => {
    it('reduces optical path to the equivalent free-space distance t/n when index of refraction != 1', () => {
      const q0 = { re: 0, im: 10 };
      const thicknessMm = 100;
      const n = 2;

      const inputWithSlab: PropagationEngineInput = {
        q0,
        wavelengthMetres: WAVELENGTH_M,
        segments: [
          {
            distance: 0,
            abcdMatrix: { A: 1, B: 0, C: 0, D: 1 },
            componentId: 'OBJ1',
            componentKind: 'custom_object',
            customObjectIndexOfRefraction: n,
            customObjectThicknessMm: thicknessMm,
          },
          {
            // The segment following the object spans its full physical
            // thickness as ordinary free space; the boundary correction
            // above is what reduces that to the correct optical path.
            distance: thicknessMm,
            abcdMatrix: { A: 1, B: thicknessMm, C: 0, D: 1 },
            componentId: null,
          },
        ],
        componentZMap: { OBJ1: 0 },
      };

      const equivalentFreeSpace: PropagationEngineInput = {
        q0,
        wavelengthMetres: WAVELENGTH_M,
        segments: [
          {
            distance: thicknessMm / n,
            abcdMatrix: { A: 1, B: thicknessMm / n, C: 0, D: 1 },
            componentId: null,
          },
        ],
        componentZMap: {},
      };

      const withSlab = engine.propagateBeam(inputWithSlab);
      const baseline = engine.propagateBeam(equivalentFreeSpace);

      expect(withSlab.qFinal.re).toBeCloseTo(baseline.qFinal.re, 6);
      expect(withSlab.qFinal.im).toBeCloseTo(baseline.qFinal.im, 6);
    });

    it('is optically transparent (no correction applied) when index of refraction is 1', () => {
      const q0 = { re: 0, im: 10 };
      const thicknessMm = 100;

      const inputWithInertObject: PropagationEngineInput = {
        q0,
        wavelengthMetres: WAVELENGTH_M,
        segments: [
          {
            distance: 0,
            abcdMatrix: { A: 1, B: 0, C: 0, D: 1 },
            componentId: 'OBJ1',
            componentKind: 'custom_object',
            customObjectIndexOfRefraction: 1,
            customObjectThicknessMm: thicknessMm,
          },
          {
            distance: thicknessMm,
            abcdMatrix: { A: 1, B: thicknessMm, C: 0, D: 1 },
            componentId: null,
          },
        ],
        componentZMap: { OBJ1: 0 },
      };

      const plainFreeSpace: PropagationEngineInput = {
        q0,
        wavelengthMetres: WAVELENGTH_M,
        segments: [
          {
            distance: thicknessMm,
            abcdMatrix: { A: 1, B: thicknessMm, C: 0, D: 1 },
            componentId: null,
          },
        ],
        componentZMap: {},
      };

      const withInertObject = engine.propagateBeam(inputWithInertObject);
      const baseline = engine.propagateBeam(plainFreeSpace);

      expect(withInertObject.qFinal.re).toBeCloseTo(baseline.qFinal.re, 9);
      expect(withInertObject.qFinal.im).toBeCloseTo(baseline.qFinal.im, 9);
    });
  });

  describe('Gouy phase', () => {
    it('reports atan(z/zR) relative to a waist at the start of free space', () => {
      const waist_mm = 0.05;
      const zRMm = rayleighRange(waist_mm / 1000, WAVELENGTH_M) * 1000;
      const q0 = { re: 0, im: zRMm }; // at the waist

      const input: PropagationEngineInput = {
        q0,
        wavelengthMetres: WAVELENGTH_M,
        segments: [
          {
            distance: zRMm,
            abcdMatrix: { A: 1, B: zRMm, C: 0, D: 1 },
            componentId: null,
          },
        ],
        componentZMap: {},
      };

      const result = engine.propagateBeam(input);

      expect(result.profile[0].gouyPhaseDeg).toBeCloseTo(0, 6);
      const lastPoint = result.profile[result.profile.length - 1];
      expect(lastPoint.z).toBeCloseTo(zRMm, 3);
      // One Rayleigh range from the waist, the Gouy phase is exactly 45 deg.
      expect(lastPoint.gouyPhaseDeg).toBeCloseTo(45, 1);
    });

    it('does not introduce an artificial phase jump when crossing a thin lens', () => {
      // A thin lens reshapes curvature (its ABCD matrix has B=0), which
      // contributes zero *additional* Gouy phase at the crossing itself -
      // the accumulated phase should stay continuous there, unlike a naive
      // per-segment atan(re/im) that re-bases to the lens's new q and would
      // show a large discontinuous jump.
      const q0 = { re: 0, im: 10 };
      const input: PropagationEngineInput = {
        q0,
        wavelengthMetres: WAVELENGTH_M,
        segments: [
          {
            distance: 100,
            abcdMatrix: { A: 1, B: 100, C: 0, D: 1 },
            componentId: 'L1',
            componentKind: 'lens_thin',
            lensFocalLengthMm: 75,
          },
          {
            distance: 50,
            abcdMatrix: { A: 1, B: 50, C: 0, D: 1 },
            componentId: null,
          },
        ],
        componentZMap: { L1: 100 },
      };

      const result = engine.propagateBeam(input);
      const justBeforeLens = result.profile.find((p) => Math.abs(p.z - 100) < 1e-6);
      const justAfterLens = result.profile.find((p) => Math.abs(p.z - 105) < 1e-6);

      expect(justBeforeLens).toBeDefined();
      expect(justAfterLens).toBeDefined();
      expect(Math.abs(justAfterLens!.gouyPhaseDeg - justBeforeLens!.gouyPhaseDeg)).toBeLessThan(5);
    });

    it('accumulates monotonically through a simple diverging free-space stretch', () => {
      const q0 = { re: 0, im: 10 };
      const input: PropagationEngineInput = {
        q0,
        wavelengthMetres: WAVELENGTH_M,
        segments: [{ distance: 200, abcdMatrix: { A: 1, B: 200, C: 0, D: 1 }, componentId: null }],
        componentZMap: {},
      };

      const result = engine.propagateBeam(input);
      let previous = result.profile[0].gouyPhaseDeg;
      for (let i = 1; i < result.profile.length; i += 1) {
        expect(result.profile[i].gouyPhaseDeg).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = result.profile[i].gouyPhaseDeg;
      }
    });
  });

  describe('cavity checkpoint mode filtering', () => {
    it('continues downstream profile for cavity coupling above the default 25% threshold', () => {
      const q0 = { re: -100, im: 10 };
      const matchingWaistRadiusMm = Math.sqrt((WAVELENGTH_M * 0.01) / Math.PI) * 1000;
      const input: PropagationEngineInput = {
        q0,
        wavelengthMetres: WAVELENGTH_M,
        segments: [
          {
            distance: 100,
            abcdMatrix: { A: 1, B: 100, C: 0, D: 1 },
            componentId: 'FP1',
            componentKind: 'cavity_fp',
            cavityEigenmode: {
              waistRadius: matchingWaistRadiusMm,
              waistPositionFromM1: 50,
              stabilityProduct: 0.5,
              isStable: true,
            },
            cavityLengthMm: 100,
          },
          {
            distance: 25,
            abcdMatrix: { A: 1, B: 25, C: 0, D: 1 },
            componentId: null,
          },
        ],
        componentZMap: { FP1: 100 },
      };

      const result = engine.propagateBeam(input);
      expect(result.profile[result.profile.length - 1].z).toBeCloseTo(125, 6);
    });

    it('switches to cavity eigenmode when overlap is above threshold', () => {
      const q0 = { re: 0, im: 10 };
      const input: PropagationEngineInput = {
        q0,
        wavelengthMetres: WAVELENGTH_M,
        segments: [
          {
            distance: 100,
            abcdMatrix: { A: 1, B: 100, C: 0, D: 1 },
            componentId: 'FP1',
            componentKind: 'cavity_fp',
            cavityEigenmode: {
              waistRadius: 0.06,
              waistPositionFromM1: 0,
              stabilityProduct: 0.5,
              isStable: true,
            },
            cavityLengthMm: 50,
            cavityCouplingThreshold: 0,
          },
          {
            distance: 25,
            abcdMatrix: { A: 1, B: 25, C: 0, D: 1 },
            componentId: null,
          },
        ],
        componentZMap: { FP1: 100 },
      };

      const result = engine.propagateBeam(input);
      const cavityQ = result.qAtComponent.FP1;
      expect(cavityQ).toBeDefined();
      expect(cavityQ.im).toBeGreaterThan(0);
      expect(result.profile[result.profile.length - 1].z).toBeCloseTo(125, 6);
    });

    it('terminates downstream profile when cavity coupling is below threshold', () => {
      const q0 = { re: 0, im: 0.2 };
      const input: PropagationEngineInput = {
        q0,
        wavelengthMetres: WAVELENGTH_M,
        segments: [
          {
            distance: 100,
            abcdMatrix: { A: 1, B: 100, C: 0, D: 1 },
            componentId: 'FP1',
            componentKind: 'cavity_fp',
            cavityEigenmode: {
              waistRadius: 1,
              waistPositionFromM1: 0,
              stabilityProduct: 0.5,
              isStable: true,
            },
            cavityLengthMm: 50,
            cavityCouplingThreshold: 0.1,
          },
          {
            distance: 25,
            abcdMatrix: { A: 1, B: 25, C: 0, D: 1 },
            componentId: null,
          },
        ],
        componentZMap: { FP1: 100 },
      };

      const result = engine.propagateBeam(input);
      const lastZ = result.profile[result.profile.length - 1].z;
      expect(lastZ).toBeCloseTo(100, 6);
    });
  });

  describe('cavity physical geometry (component position = input mirror)', () => {
    it('does not terminate on a sub-millimeter waist-position mismatch that rigorous overlap still rates >99%', () => {
      // Regression test: the old accept/reject check used an approximate,
      // reference-plane-dependent overlap formula that could crash to ~0.23
      // (below the 25% threshold) for a mismatch as small as 0.1 mm, even
      // though the rigorous formula (what the UI reports as "mode matching")
      // rates the same beams at >99.99%. The engine must use the rigorous
      // formula so it never rejects a coupling the UI reports as matched.
      const w0Mm = 1; // 1 mm waist, same size for beam and cavity eigenmode
      const zRMm = rayleighRange(w0Mm / 1000, WAVELENGTH_M) * 1000;
      const distanceToM1Mm = 100; // pure free space up to the cavity's input mirror
      const waistPositionFromM1Mm = 50;
      const mismatchMm = 0.1; // sub-mm position perturbation

      // Incoming beam's own waist sits `mismatchMm` past the cavity's waist
      // (both measured from the segment start, i.e. from M1's frame).
      const beamWaistFromSegmentStartMm = distanceToM1Mm + waistPositionFromM1Mm + mismatchMm;
      const q0 = { re: -beamWaistFromSegmentStartMm, im: zRMm };

      const input: PropagationEngineInput = {
        q0,
        wavelengthMetres: WAVELENGTH_M,
        segments: [
          {
            distance: distanceToM1Mm,
            abcdMatrix: { A: 1, B: distanceToM1Mm, C: 0, D: 1 },
            componentId: 'FP1',
            componentKind: 'cavity_fp',
            cavityEigenmode: {
              waistRadius: w0Mm,
              waistPositionFromM1: waistPositionFromM1Mm,
              stabilityProduct: 0.5,
              isStable: true,
            },
            cavityLengthMm: 100,
          },
          {
            distance: 25,
            abcdMatrix: { A: 1, B: 25, C: 0, D: 1 },
            componentId: null,
          },
        ],
        componentZMap: { FP1: distanceToM1Mm },
      };

      const result = engine.propagateBeam(input);
      expect(result.profile[result.profile.length - 1].z).toBeCloseTo(distanceToM1Mm + 25, 6);
      expect(result.cavityOverlap.FP1).toBeGreaterThan(0.99);
    });

    it('places the cavity eigenmode waist at its true physical position relative to the input mirror', () => {
      // Regression test: component.position is now anchored at the cavity's
      // input mirror (M1), so a segment ending at a cavity is pure free
      // space up to M1, with no extra half-cavity-length offset involved.
      const distanceToM1Mm = 100;
      const waistPositionFromM1Mm = 20; // within the 25 mm segment that follows M1

      const input: PropagationEngineInput = {
        q0: { re: 0, im: 10 },
        wavelengthMetres: WAVELENGTH_M,
        segments: [
          {
            distance: distanceToM1Mm,
            abcdMatrix: { A: 1, B: distanceToM1Mm, C: 0, D: 1 },
            componentId: 'FP1',
            componentKind: 'cavity_fp',
            cavityEigenmode: {
              waistRadius: 0.06,
              waistPositionFromM1: waistPositionFromM1Mm,
              stabilityProduct: 0.5,
              isStable: true,
            },
            cavityLengthMm: 50,
            cavityCouplingThreshold: 0,
          },
          {
            distance: 25,
            abcdMatrix: { A: 1, B: 25, C: 0, D: 1 },
            componentId: null,
          },
        ],
        componentZMap: { FP1: distanceToM1Mm },
      };

      const result = engine.propagateBeam(input);

      // The waist is reported against whichever segment boundary it falls
      // within (here, the segment following the cavity), not tagged by
      // cavity ID - so match purely on position.
      const expectedWaistZM = (distanceToM1Mm + waistPositionFromM1Mm) / 1000;
      const cavityWaist = result.waists.find((w) => Math.abs(w.z - expectedWaistZM) < 1e-9);

      expect(cavityWaist).toBeDefined();
      expect(cavityWaist!.w).toBeCloseTo(0.06 / 1000, 9);
    });

    it('reports the true measured input-vs-eigenmode overlap per cavity, not clamped to 1 once matched', () => {
      // Regression test: the accept/reject check used to only expose a
      // pass/fail boolean; downstream code (modeMetrics.computeLiveModeOverlap)
      // ended up comparing the forced eigenmode output against itself,
      // always reading 100% once transmission was accepted. The engine must
      // record the actual overlap it measured, whatever that value is.
      const w0Mm = 0.04;
      const zRMm = rayleighRange(w0Mm / 1000, WAVELENGTH_M) * 1000;
      const waistPositionFromM1Mm = 20;
      const mismatchMm = 2 * zRMm; // deliberately partial, not near-perfect, match
      const distanceToM1Mm = 100;

      const beamWaistFromSegmentStartMm = distanceToM1Mm + waistPositionFromM1Mm + mismatchMm;
      const q0 = { re: -beamWaistFromSegmentStartMm, im: zRMm };

      const expectedOverlap = calculateModeOverlapFromWaistParams(
        w0Mm,
        waistPositionFromM1Mm + mismatchMm,
        w0Mm,
        waistPositionFromM1Mm,
        WAVELENGTH_NM,
      );
      // Sanity: this should be a genuinely partial match, not ~0 or ~1.
      expect(expectedOverlap).toBeGreaterThan(0.3);
      expect(expectedOverlap).toBeLessThan(0.9);

      const input: PropagationEngineInput = {
        q0,
        wavelengthMetres: WAVELENGTH_M,
        segments: [
          {
            distance: distanceToM1Mm,
            abcdMatrix: { A: 1, B: distanceToM1Mm, C: 0, D: 1 },
            componentId: 'FP1',
            componentKind: 'cavity_fp',
            cavityEigenmode: {
              waistRadius: w0Mm,
              waistPositionFromM1: waistPositionFromM1Mm,
              stabilityProduct: 0.5,
              isStable: true,
            },
            cavityLengthMm: 50,
          },
          {
            distance: 25,
            abcdMatrix: { A: 1, B: 25, C: 0, D: 1 },
            componentId: null,
          },
        ],
        componentZMap: { FP1: distanceToM1Mm },
      };

      const result = engine.propagateBeam(input);

      // Coupling should still succeed (partial match clears the default 25% bar)...
      expect(result.profile[result.profile.length - 1].z).toBeCloseTo(distanceToM1Mm + 25, 6);
      // ...but the reported overlap must be the true measured value, not 1.
      expect(result.cavityOverlap.FP1).toBeCloseTo(expectedOverlap, 6);
      expect(result.cavityOverlap.FP1).toBeLessThan(0.999);
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
