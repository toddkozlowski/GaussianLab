import { describe, it, expect } from 'vitest';
import { fitGaussianWaist, type WaistFitInputPoint } from './waistFit';

/** Exact Gaussian beam radius at z, given waist z0/w0 and Rayleigh range zR (all mm). */
function beamRadius(zMm: number, z0Mm: number, w0Mm: number, zRMm: number): number {
  return w0Mm * Math.sqrt(1 + ((zMm - z0Mm) / zRMm) ** 2);
}

describe('fitGaussianWaist', () => {
  it('recovers the exact waist from 3 noiseless samples', () => {
    const z0 = 50;
    const w0 = 0.3;
    const zR = 120;
    const zs = [0, 80, 200];
    const points: WaistFitInputPoint[] = zs.map((zMm) => ({ zMm, waistRadiusMm: beamRadius(zMm, z0, w0, zR) }));

    const result = fitGaussianWaist(points);
    expect(result).not.toBeNull();
    expect(result!.zMm).toBeCloseTo(z0, 6);
    expect(result!.waistRadiusMm).toBeCloseTo(w0, 6);
  });

  it('recovers the exact waist from more than 3 noiseless samples (overdetermined least squares)', () => {
    const z0 = -30;
    const w0 = 0.15;
    const zR = 250;
    const zs = [-400, -200, -30, 100, 300, 500];
    const points: WaistFitInputPoint[] = zs.map((zMm) => ({ zMm, waistRadiusMm: beamRadius(zMm, z0, w0, zR) }));

    const result = fitGaussianWaist(points);
    expect(result).not.toBeNull();
    expect(result!.zMm).toBeCloseTo(z0, 5);
    expect(result!.waistRadiusMm).toBeCloseTo(w0, 5);
  });

  it('recovers a waist sitting behind z=0 (negative z0), same as a source waistOffset upstream of the source', () => {
    const z0 = -75;
    const w0 = 0.2;
    const zR = 90;
    const zs = [0, 50, 150];
    const points: WaistFitInputPoint[] = zs.map((zMm) => ({ zMm, waistRadiusMm: beamRadius(zMm, z0, w0, zR) }));

    const result = fitGaussianWaist(points);
    expect(result).not.toBeNull();
    expect(result!.zMm).toBeCloseTo(z0, 6);
  });

  it('returns null with fewer than 3 points', () => {
    expect(fitGaussianWaist([])).toBeNull();
    expect(fitGaussianWaist([{ zMm: 0, waistRadiusMm: 0.1 }])).toBeNull();
    expect(fitGaussianWaist([{ zMm: 0, waistRadiusMm: 0.1 }, { zMm: 10, waistRadiusMm: 0.2 }])).toBeNull();
  });

  it('returns null for degenerate points all at the same z', () => {
    const points: WaistFitInputPoint[] = [
      { zMm: 50, waistRadiusMm: 0.1 },
      { zMm: 50, waistRadiusMm: 0.2 },
      { zMm: 50, waistRadiusMm: 0.3 },
    ];
    expect(fitGaussianWaist(points)).toBeNull();
  });

  it('returns null when the data curves downward (no physical waist, negative curvature)', () => {
    // w^2 = -0.04*z^2 + 10 at z = 0, 5, 10 - an exact downward parabola.
    const points: WaistFitInputPoint[] = [
      { zMm: 0, waistRadiusMm: Math.sqrt(10) },
      { zMm: 5, waistRadiusMm: Math.sqrt(9) },
      { zMm: 10, waistRadiusMm: Math.sqrt(6) },
    ];
    expect(fitGaussianWaist(points)).toBeNull();
  });

  it('returns null for perfectly flat (constant) radius data - zero curvature', () => {
    const points: WaistFitInputPoint[] = [
      { zMm: 0, waistRadiusMm: 0.2 },
      { zMm: 50, waistRadiusMm: 0.2 },
      { zMm: 100, waistRadiusMm: 0.2 },
    ];
    expect(fitGaussianWaist(points)).toBeNull();
  });
});
