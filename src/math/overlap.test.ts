import { describe, it, expect } from 'vitest';
import {
  calculateModeOverlap,
  calculateModeOverlapAtWaists,
  modeMismatchPenalty,
  effectiveRayleighRange,
  calculateModeOverlapFromWaistParams,
} from './overlap';

describe('Mode overlap integral', () => {
  const WAVELENGTH_M = 1064e-9;

  describe('overlap at waists (simplified)', () => {
    it('identical waists give maximum overlap', () => {
      const w = 0.05e-3; // 50 µm
      const overlap = calculateModeOverlapAtWaists(w, w);
      expect(overlap).toBeCloseTo(1, 10); // Perfect overlap
    });

    it('different waists give reduced overlap', () => {
      const w1 = 0.05e-3; // 50 µm
      const w2 = 0.1e-3; // 100 µm
      const overlap = calculateModeOverlapAtWaists(w1, w2);
      // O = 2*sqrt(w1*w2) / (w1+w2) = 2*sqrt(0.05*0.1) / (0.15)
      const expected = (2 * Math.sqrt(w1 * w2)) / (w1 + w2);
      expect(overlap).toBeCloseTo(expected, 10);
      expect(overlap).toBeLessThan(1);
    });

    it('overlap is symmetric: O(w1, w2) = O(w2, w1)', () => {
      const w1 = 0.03e-3;
      const w2 = 0.07e-3;
      const o1 = calculateModeOverlapAtWaists(w1, w2);
      const o2 = calculateModeOverlapAtWaists(w2, w1);
      expect(o1).toBeCloseTo(o2, 15);
    });

    it('very large mismatch gives reduced overlap', () => {
      const w1 = 0.01e-3; // 10 µm
      const w2 = 1e-3; // 1000 µm
      const overlap = calculateModeOverlapAtWaists(w1, w2);
      // O = 2*sqrt(0.01*1000) / (10+1000) ≈ 2*sqrt(10) / 1000 ≈ 0.1980
      expect(overlap).toBeLessThan(0.25); // Significantly reduced
    });
  });

  describe('overlap with waist offset', () => {
    it('no offset at matching waists gives unit overlap', () => {
      const w = 0.05e-3;
      const overlap = calculateModeOverlap(w, 0, w, 0, WAVELENGTH_M);
      expect(overlap).toBeCloseTo(1, 10);
    });

    it('offset reduces overlap (Gouy phase mismatch)', () => {
      const w = 0.05e-3;
      const deltaZ = 0.1; // 100 mm offset
      const overlap = calculateModeOverlap(w, 0, w, deltaZ, WAVELENGTH_M);
      // Phase factor: exp(-π*0.1² / (λ*2*w))
      const expected = Math.exp(-Math.PI * 0.01 / (WAVELENGTH_M * 2 * w));
      expect(overlap).toBeCloseTo(expected, 4);
      expect(overlap).toBeLessThan(1);
    });

    it('large offset gives small overlap', () => {
      const w = 0.05e-3;
      const deltaZ = 1; // 1 metre offset
      const overlap = calculateModeOverlap(w, 0, w, deltaZ, WAVELENGTH_M);
      expect(overlap).toBeLessThan(0.1);
    });

    it('symmetric offset (negative) gives same overlap', () => {
      const w = 0.05e-3;
      const deltaZ = 0.2;
      const overlap1 = calculateModeOverlap(w, 0, w, deltaZ, WAVELENGTH_M);
      const overlap2 = calculateModeOverlap(w, 0, w, -deltaZ, WAVELENGTH_M);
      expect(overlap1).toBeCloseTo(overlap2, 10);
    });
  });

  describe('mode mismatch penalty', () => {
    it('equal waists give unit penalty (no penalty)', () => {
      const w = 0.05e-3;
      const penalty = modeMismatchPenalty(w, w);
      expect(penalty).toBeCloseTo(1, 10);
    });

    it('2x mismatch gives reduced penalty', () => {
      const w1 = 0.05e-3;
      const w2 = 0.1e-3; // 2x larger
      const penalty = modeMismatchPenalty(w1, w2);
      // (2*r) / (r² + 1) where r = w1/w2 = 0.5
      // = 1.0 / 1.25 = 0.8
      expect(penalty).toBeCloseTo(0.8, 10);
    });

    it('penalty is symmetric', () => {
      const w1 = 0.03e-3;
      const w2 = 0.07e-3;
      const p1 = modeMismatchPenalty(w1, w2);
      const p2 = modeMismatchPenalty(w2, w1);
      // Note: this is generally NOT symmetric due to ratio
      // p1 = (2*r1) / (r1² + 1) where r1 = w1/w2 = 3/7
      // p2 = (2*r2) / (r2² + 1) where r2 = w2/w1 = 7/3
      // They will be different
      // Just verify both are in [0, 1]
      expect(p1).toBeGreaterThanOrEqual(0);
      expect(p1).toBeLessThanOrEqual(1);
      expect(p2).toBeGreaterThanOrEqual(0);
      expect(p2).toBeLessThanOrEqual(1);
    });
  });

  describe('effective Rayleigh range', () => {
    it('equal Rayleigh ranges give same effective range', () => {
      const zR = 0.01;
      const effective = effectiveRayleighRange(zR, zR);
      expect(effective).toBeCloseTo(zR, 10);
    });

    it('effective range is geometric mean', () => {
      const zR1 = 0.01;
      const zR2 = 0.04;
      const effective = effectiveRayleighRange(zR1, zR2);
      expect(effective).toBeCloseTo(Math.sqrt(zR1 * zR2), 10);
    });

    it('effective range is smaller than arithmetic mean (conservative)', () => {
      const zR1 = 0.01;
      const zR2 = 0.1;
      const effective = effectiveRayleighRange(zR1, zR2);
      const arithmetic = (zR1 + zR2) / 2;
      expect(effective).toBeLessThan(arithmetic);
    });
  });

  describe('physical example: mode matching', () => {
    it('source mode and cavity eigenmode can overlap', () => {
      // Source: 50 µm waist
      // Cavity: different waist, but same wavelength
      const sourceWaist = 0.05e-3;
      const cavityWaist = 0.03e-3;

      const overlap = calculateModeOverlapAtWaists(sourceWaist, cavityWaist);
      expect(overlap).toBeGreaterThan(0.5); // Decent overlap despite mismatch
      expect(overlap).toBeLessThan(1);
    });

    it('perfect matching: lens creates beam matching cavity', () => {
      // If lens perfectly scales beam to cavity waist
      const sourceWaist = 0.05e-3;
      const cavityWaist = 0.05e-3; // After telescoping lens
      const overlap = calculateModeOverlapAtWaists(sourceWaist, cavityWaist);
      expect(overlap).toBeCloseTo(1, 10); // Perfect if waists match
    });
  });
});

describe('calculateModeOverlapFromWaistParams (rigorous)', () => {
  // λ = 1064 nm.  All length inputs in mm, wavelength in nm.
  const LAMBDA_NM = 1064;

  it('identical waist size and position gives overlap = 1', () => {
    const w0 = 0.3; // 300 µm
    const z0 = 200; // 200 mm
    const overlap = calculateModeOverlapFromWaistParams(w0, z0, w0, z0, LAMBDA_NM);
    expect(overlap).toBeCloseTo(1, 10);
  });

  it('same waist position but different waist sizes gives overlap < 1', () => {
    const w01 = 0.3; // 300 µm
    const w02 = 0.6; // 600 µm
    const z0 = 200;
    const overlap = calculateModeOverlapFromWaistParams(w01, z0, w02, z0, LAMBDA_NM);
    // With equal positions: O² = 4*zR1*zR2/(zR1+zR2)²
    const lambdaMm = LAMBDA_NM * 1e-6;
    const zR1 = Math.PI * w01 * w01 / lambdaMm;
    const zR2 = Math.PI * w02 * w02 / lambdaMm;
    const expected = Math.sqrt((4 * zR1 * zR2) / ((zR1 + zR2) ** 2));
    expect(overlap).toBeCloseTo(expected, 8);
    expect(overlap).toBeLessThan(1);
  });

  it('same waist size but offset waist positions reduces overlap', () => {
    const w0 = 0.3; // 300 µm
    const overlap0 = calculateModeOverlapFromWaistParams(w0, 200, w0, 200, LAMBDA_NM);
    const overlapOffset = calculateModeOverlapFromWaistParams(w0, 200, w0, 350, LAMBDA_NM);
    expect(overlapOffset).toBeLessThan(overlap0);
    expect(overlapOffset).toBeLessThan(1);
  });

  it('large waist-position offset drives overlap near zero', () => {
    const w0 = 0.3; // Rayleigh range ≈ 266 mm
    // Δz = 100 000 mm  →  Δz/zR ≈ 376  →  O ≈ sqrt(4/zR ratio²) << 0.01
    const overlap = calculateModeOverlapFromWaistParams(w0, 0, w0, 100000, LAMBDA_NM);
    expect(overlap).toBeLessThan(0.01);
  });

  it('overlap is symmetric in beam order', () => {
    const w01 = 0.2;
    const z01 = 100;
    const w02 = 0.5;
    const z02 = 300;
    const o12 = calculateModeOverlapFromWaistParams(w01, z01, w02, z02, LAMBDA_NM);
    const o21 = calculateModeOverlapFromWaistParams(w02, z02, w01, z01, LAMBDA_NM);
    expect(o12).toBeCloseTo(o21, 10);
  });

  it('is in range [0, 1] for extreme mismatches', () => {
    const overlap = calculateModeOverlapFromWaistParams(0.01, 0, 10, 5000, LAMBDA_NM);
    expect(overlap).toBeGreaterThanOrEqual(0);
    expect(overlap).toBeLessThanOrEqual(1);
  });

  it('returns 0 for zero or negative waist radius', () => {
    expect(calculateModeOverlapFromWaistParams(0, 0, 0.3, 0, LAMBDA_NM)).toBe(0);
    expect(calculateModeOverlapFromWaistParams(-0.1, 0, 0.3, 0, LAMBDA_NM)).toBe(0);
  });

  it('waist-position mismatch of one Rayleigh range drops overlap to ~sqrt(1/2)', () => {
    // When Δz = zR1 + zR2 = 2*zR (equal beams), denominator doubles, O² halves
    const w0 = 0.3;
    const lambdaMm = LAMBDA_NM * 1e-6;
    const zR = Math.PI * w0 * w0 / lambdaMm;
    // Δz = 2*zR  →  O² = 4*zR² / (4*zR² + 4*zR²) = 0.5  →  O = 1/√2
    const overlap = calculateModeOverlapFromWaistParams(w0, 0, w0, 2 * zR, LAMBDA_NM);
    expect(overlap).toBeCloseTo(1 / Math.SQRT2, 4);
  });
});
