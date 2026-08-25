/**
 * Propagation Engine: Orchestrates beam propagation through optical system
 *
 * Combines q-parameter, ABCD matrices, and beam profile calculations
 * into an injectable implementation of PropagationEngine interface.
 */

import {
  propagateQ,
  rayleighRange,
} from './qParameter';
import { type Complex } from './complex';
import type {
  PropagationEngine,
  PropagationEngineInput,
} from '../app/state/types/Layer0Interfaces';
import type { PropagationResult, PropagationWaist, ComplexNumber } from '../app/state/schema';
import { calculateModeOverlapFromWaistParams } from './overlap';

/**
 * Propagation engine: traces Gaussian beam through optical system
 */
export class ConcreteBeamPropagationEngine implements PropagationEngine {
  /**
   * Propagate beam through segments and return profile + waists
   */
  propagateBeam(input: PropagationEngineInput): PropagationResult {
    const { q0, wavelengthMetres, segments } = input;

    // Convert input q (in mm units) to SI for calculation
    // Note: q0 is in mm per schema convention; convert to metres
    const q0_SI: Complex = {
      re: q0.re / 1000, // mm to metres
      im: q0.im / 1000, // mm to metres
    };

    let qCurrent = q0_SI;
    let z_current = 0; // Absolute position in system

    // Accumulated (unwrapped) Gouy phase, tracked continuously across the
    // whole path. Within any pure free-space stretch of uniform index - Im(q)
    // is invariant there, so atan(Re(q)/Im(q)) is exactly the local Gouy
    // phase and its delta across the stretch is exact. A thin lens
    // contributes zero *additional* Gouy phase at the instant it's crossed
    // (its ABCD matrix has B=0, so the general accumulated-phase formula
    // -arg(A + B/q) evaluates to -arg(1) = 0) - same for a dielectric
    // interface (B=0 there too) and the cavity-coupling substitution, which
    // is a modelling event rather than a real optical element. So boundaries
    // simply carry the running total forward unchanged, and each new stretch
    // resumes accumulating from its own q.
    let gouyPhaseRad = gouyPhaseFromQ(qCurrent);

    const profile: Array<{ z: number; w: number; gouyPhaseDeg: number }> = []; // in mm / degrees
    const waists: PropagationWaist[] = [];
    const qAtComponent: Record<string, ComplexNumber> = {};
    const cavityOverlap: Record<string, number> = {};

    // A dielectric slab's front face is where its owning segment ends, but
    // geometry doesn't carve out a distinct segment for the slab's interior -
    // the *following* segment's own distance already spans the slab's full
    // physical thickness plus whatever ordinary free space comes after it.
    // So the entry refraction is applied where that boundary is crossed
    // (below), and this carries the slab's index/thickness forward to be
    // consumed out of the next segment's own stretch.
    let pendingCustomObject: { refractiveIndex: number; thicknessM: number } | null = null;

    // Advances qCurrent/z_current/gouyPhaseRad across `distanceM` of uniform-
    // index free space, densely sampling the profile as it goes and
    // recording a waist if the beam comes to a focus within the stretch.
    const advance = (distanceM: number, refractiveIndex: number, waistComponentId: string | null) => {
      const stretchWaistAt = -qCurrent.re;
      if (stretchWaistAt >= 0 && stretchWaistAt <= distanceM) {
        const localWaistRadius = Math.sqrt((wavelengthMetres * qCurrent.im) / (Math.PI * refractiveIndex));
        if (Number.isFinite(localWaistRadius) && localWaistRadius > 0) {
          waists.push({
            z: (z_current + stretchWaistAt) * 1000,
            w: localWaistRadius * 1000,
            componentId: waistComponentId,
          });
        }
      }

      const stretchStartPhaseRad = gouyPhaseFromQ(qCurrent);
      let pointGouyPhaseRad = gouyPhaseRad;

      const sampleCount = Math.max(1, Math.ceil(distanceM / 0.001));
      for (let i = 0; i <= sampleCount; i += 1) {
        const zLocal = (distanceM * i) / sampleCount;
        const qLocal: Complex = {
          re: qCurrent.re + zLocal,
          im: qCurrent.im,
        };
        pointGouyPhaseRad = gouyPhaseRad + (gouyPhaseFromQ(qLocal) - stretchStartPhaseRad);

        profile.push({
          z: (z_current + zLocal) * 1000,
          w: beamRadiusFromQ(qLocal, wavelengthMetres, refractiveIndex) * 1000,
          gouyPhaseDeg: (pointGouyPhaseRad * 180) / Math.PI,
        });
      }
      gouyPhaseRad = pointGouyPhaseRad;
      qCurrent = { re: qCurrent.re + distanceM, im: qCurrent.im };
      z_current += distanceM;
    };

    // Propagate through each segment. Each segment models free-space travel only.
    // Component transforms happen at the segment boundary after sampling.
    //
    // A cavity's stored position is its input mirror (M1) - the plane where
    // an incoming beam physically first meets the cavity - so the segment
    // ending at a cavity is pure free space up to M1, and mode-matching is
    // decided exactly at that boundary. The segment that follows (from M1 to
    // whatever is next) naturally spans the cavity's interior and its
    // transmitted output, since the cavity's on-canvas footprint already
    // occupies that physical length.
    for (const segment of segments) {
      const { distance, componentId } = segment;
      const distanceM = distance / 1000;

      if (pendingCustomObject) {
        // Traverse the slab's interior at its own (reduced-divergence) rate,
        // then refract back out at its rear face before resuming ordinary
        // free space for whatever distance remains in this segment.
        const mediumDistanceM = Math.min(pendingCustomObject.thicknessM, distanceM);
        advance(mediumDistanceM, pendingCustomObject.refractiveIndex, componentId);
        qCurrent = {
          re: qCurrent.re / pendingCustomObject.refractiveIndex,
          im: qCurrent.im / pendingCustomObject.refractiveIndex,
        };

        const remainderDistanceM = distanceM - mediumDistanceM;
        pendingCustomObject = null;
        if (remainderDistanceM > 0) {
          advance(remainderDistanceM, 1, componentId);
        }
      } else {
        advance(distanceM, 1, componentId);
      }

      const qAtBoundary: Complex = qCurrent;

      let qAfterBoundary = qAtBoundary;
      let terminateAfterBoundary = false;

      if (segment.componentKind === 'lens_thin') {
        const focalLengthMm = segment.lensFocalLengthMm;
        if (typeof focalLengthMm === 'number' && Math.abs(focalLengthMm) > 1e-9) {
          qAfterBoundary = propagateQ(qAtBoundary, {
            A: 1,
            B: 0,
            C: -1000 / focalLengthMm,
            D: 1,
          });
        }
      } else if (segment.componentKind === 'custom_object') {
        // A flat-faced dielectric slab of physical thickness t and index n:
        // refract into the medium here (a flat interface's ABCD matrix,
        // D = n1/n2 = 1/n, scales q by n - see beamRadiusFromQ for how that
        // keeps the reported beam radius continuous across the face), then
        // let the *next* segment's own stretch spend the slab's thickness at
        // the medium's reduced-divergence rate before refracting back out.
        // At n=1 the slab is optically transparent, so nothing is applied.
        const n = segment.customObjectIndexOfRefraction;
        const thicknessMm = segment.customObjectThicknessMm;
        if (typeof n === 'number' && typeof thicknessMm === 'number' && Math.abs(n - 1) > 1e-9 && thicknessMm > 0) {
          qAfterBoundary = propagateQ(qAtBoundary, {
            A: 1,
            B: 0,
            C: 0,
            D: 1 / n,
          });
          pendingCustomObject = { refractiveIndex: n, thicknessM: thicknessMm / 1000 };
        }
      } else if (segment.componentKind === 'cavity_fp' && segment.cavityEigenmode?.isStable) {
        const cavityQAtM1 = cavityEigenmodeAtM1(segment.cavityEigenmode, wavelengthMetres);

        // Mode overlap uses the same rigorous, reference-plane-independent
        // formula shown to the user as "mode matching" (see modeMetrics.ts),
        // evaluated at M1 where the beam actually meets the cavity. This
        // keeps the accept/reject decision consistent with the displayed
        // percentage, so a >99% match never gets rejected here.
        const beamWaistRadiusM = Math.sqrt((wavelengthMetres * qAtBoundary.im) / Math.PI);
        const beamWaistPositionFromM1M = -qAtBoundary.re;
        const cavityWaistRadiusM = Math.max(1e-9, segment.cavityEigenmode.waistRadius / 1000);
        const cavityWaistPositionFromM1M = -cavityQAtM1.re;

        const overlap = calculateModeOverlapFromWaistParams(
          beamWaistRadiusM * 1000,
          beamWaistPositionFromM1M * 1000,
          cavityWaistRadiusM * 1000,
          cavityWaistPositionFromM1M * 1000,
          wavelengthMetres * 1e9
        );

        if (componentId) {
          cavityOverlap[componentId] = overlap;
        }

        const threshold = segment.cavityCouplingThreshold ?? 0.25;
        if (overlap >= threshold) {
          // Beam couples into the cavity at M1. From here through the
          // cavity's interior and beyond M2, the beam follows the cavity
          // eigenmode, not the incoming beam.
          qAfterBoundary = cavityQAtM1;
        } else {
          terminateAfterBoundary = true;
        }
      }

      if (componentId) {
        qAtComponent[componentId] = {
          re: qAfterBoundary.re * 1000,
          im: qAfterBoundary.im * 1000,
        };
      }

      qCurrent = qAfterBoundary;

      if (terminateAfterBoundary) {
        break;
      }
    }

    // Ensure unique waists
    const waistSet = new Map<string, PropagationWaist>();
    for (const w of waists) {
      const key = `${w.z.toFixed(6)}-${w.componentId}`;
      if (!waistSet.has(key)) {
        waistSet.set(key, w);
      }
    }
    const uniqueWaists = Array.from(waistSet.values());

    return {
      profile,
      waists: uniqueWaists,
      qAtComponent,
      cavityOverlap,
      qFinal: {
        re: qCurrent.re * 1000,
        im: qCurrent.im * 1000,
      },
    };
  }
}

/**
 * Local Gouy phase (radians) implied by q = (z - z0) + i*zR, i.e. atan((z-z0)/zR).
 * Exact for the Re/Im of whatever q is passed in - see the accumulation
 * comment above propagateBeam for how this is stitched across ABCD boundaries.
 */
function gouyPhaseFromQ(q: Complex): number {
  return Math.atan(q.re / q.im);
}

/**
 * @param refractiveIndex Local index of refraction at `q`'s position (1 for
 * vacuum/air). Physically, w(z) = sqrt(-lambda0 / (pi * n * Im(1/q))) - see
 * the "reduced q" convention documented above the custom-object handling in
 * propagateBeam, which keeps q itself defined with the vacuum wavelength and
 * only needs this extra factor at readout time.
 */
function beamRadiusFromQ(q: Complex, wavelengthMetres: number, refractiveIndex: number = 1): number {
  const denom = q.re * q.re + q.im * q.im;
  if (denom <= 0 || q.im <= 0) {
    return 1e-6;
  }

  const invQIm = -q.im / denom;
  const wSq = -wavelengthMetres / (Math.PI * invQIm * refractiveIndex);
  if (!Number.isFinite(wSq) || wSq <= 0) {
    return 1e-6;
  }

  return Math.sqrt(wSq);
}

/**
 * The cavity eigenmode's q-parameter at the input mirror (M1), the plane
 * where an incoming beam physically first meets the cavity.
 */
function cavityEigenmodeAtM1(
  eigenmode: { waistRadius: number; waistPositionFromM1: number },
  wavelengthMetres: number
): Complex {
  const cavityWaistRadiusM = Math.max(1e-9, eigenmode.waistRadius / 1000);
  const waistPositionFromM1M = eigenmode.waistPositionFromM1 / 1000;
  const zR = rayleighRange(cavityWaistRadiusM, wavelengthMetres);
  return {
    re: -waistPositionFromM1M,
    im: zR,
  };
}
