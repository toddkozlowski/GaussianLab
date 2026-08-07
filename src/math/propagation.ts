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
    // whole path. Within any pure free-space stretch - which includes a
    // custom-object slab's segment, since its correction only ever shifts
    // Re(q) - Im(q) is invariant, so atan(Re(q)/Im(q)) is exactly the local
    // Gouy phase and its delta across the stretch is exact. A thin lens
    // contributes zero *additional* Gouy phase at the instant it's crossed
    // (its ABCD matrix has B=0, so the general accumulated-phase formula
    // -arg(A + B/q) evaluates to -arg(1) = 0) - same for the cavity-coupling
    // substitution, which is a modelling event rather than a real optical
    // element. So boundaries simply carry the running total forward
    // unchanged, and each new segment resumes accumulating from its own q.
    let gouyPhaseRad = gouyPhaseFromQ(qCurrent);

    const profile: Array<{ z: number; w: number; gouyPhaseDeg: number }> = []; // in mm / degrees
    const waists: PropagationWaist[] = [];
    const qAtComponent: Record<string, ComplexNumber> = {};
    const cavityOverlap: Record<string, number> = {};

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

      const segmentWaistAt = -qCurrent.re;
      if (segmentWaistAt >= 0 && segmentWaistAt <= distanceM) {
        const localWaistRadius = Math.sqrt((wavelengthMetres * qCurrent.im) / Math.PI);
        if (Number.isFinite(localWaistRadius) && localWaistRadius > 0) {
          waists.push({
            z: z_current + segmentWaistAt,
            w: localWaistRadius,
            componentId,
          });
        }
      }

      const segmentStartPhaseRad = gouyPhaseFromQ(qCurrent);
      let pointGouyPhaseRad = gouyPhaseRad;

      const sampleCount = Math.max(1, Math.ceil(distanceM / 0.001));
      for (let i = 0; i <= sampleCount; i += 1) {
        const zLocal = (distanceM * i) / sampleCount;
        const qLocal: Complex = {
          re: qCurrent.re + zLocal,
          im: qCurrent.im,
        };
        pointGouyPhaseRad = gouyPhaseRad + (gouyPhaseFromQ(qLocal) - segmentStartPhaseRad);

        profile.push({
          z: (z_current + zLocal) * 1000,
          w: beamRadiusFromQ(qLocal, wavelengthMetres) * 1000,
          gouyPhaseDeg: (pointGouyPhaseRad * 180) / Math.PI,
        });
      }
      gouyPhaseRad = pointGouyPhaseRad;

      const qAtBoundary: Complex = {
        re: qCurrent.re + distanceM,
        im: qCurrent.im,
      };

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
        // A flat-faced dielectric slab of physical thickness t and index n has
        // optical path t/n. The geometric segment that follows already spans
        // the slab's full physical thickness as ordinary free space, so a
        // single translation of -t(1 - 1/n) applied here (order-independent,
        // since translation matrices commute) reduces that to the correct t/n
        // once the following free-space propagation is added. At n=1 the slab
        // is optically transparent, so no correction is applied.
        const n = segment.customObjectIndexOfRefraction;
        const thicknessMm = segment.customObjectThicknessMm;
        if (typeof n === 'number' && typeof thicknessMm === 'number' && Math.abs(n - 1) > 1e-9) {
          const reductionM = (thicknessMm / 1000) * (1 - 1 / n);
          qAfterBoundary = propagateQ(qAtBoundary, {
            A: 1,
            B: -reductionM,
            C: 0,
            D: 1,
          });
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
      z_current += distanceM;

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

function beamRadiusFromQ(q: Complex, wavelengthMetres: number): number {
  const denom = q.re * q.re + q.im * q.im;
  if (denom <= 0 || q.im <= 0) {
    return 1e-6;
  }

  const invQIm = -q.im / denom;
  const wSq = -wavelengthMetres / (Math.PI * invQIm);
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
