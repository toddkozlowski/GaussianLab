/**
 * Propagation Engine: Orchestrates beam propagation through optical system
 *
 * Combines q-parameter, ABCD matrices, and beam profile calculations
 * into an injectable implementation of PropagationEngine interface.
 */

import {
  propagateQ,
  rayleighRange,
  waistFromQ,
} from './qParameter';
import { type Complex } from './complex';
import type {
  PropagationEngine,
  PropagationEngineInput,
} from '../app/state/types/Layer0Interfaces';
import type { PropagationResult, PropagationWaist, ComplexNumber } from '../app/state/schema';
import { calculateModeOverlap } from './overlap';

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

    const profile: Array<{ z: number; w: number }> = []; // in mm
    const waists: PropagationWaist[] = [];
    const qAtComponent: Record<string, ComplexNumber> = {};

    // Propagate through each segment. Each segment models free-space travel only.
    // Component transforms happen at the segment boundary after sampling.
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

      const sampleCount = Math.max(1, Math.ceil(distanceM / 0.001));
      for (let i = 0; i <= sampleCount; i += 1) {
        const zLocal = (distanceM * i) / sampleCount;
        const qLocal: Complex = {
          re: qCurrent.re + zLocal,
          im: qCurrent.im,
        };

        profile.push({
          z: (z_current + zLocal) * 1000,
          w: beamRadiusFromQ(qLocal, wavelengthMetres) * 1000,
        });
      }

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
      } else if (segment.componentKind === 'cavity_fp' && segment.cavityEigenmode?.isStable) {
        const cavityQAtBoundary = cavityEigenmodeAtBoundary(
          segment.cavityEigenmode,
          wavelengthMetres,
          segment.cavityLengthMm
        );
        const beamAtInput = beamFromQ(qAtBoundary, wavelengthMetres);
        const cavityAtInput = beamFromQ(cavityQAtBoundary, wavelengthMetres);

        const overlap = calculateModeOverlap(
          beamAtInput.radius,
          beamAtInput.waistPosition,
          cavityAtInput.radius,
          cavityAtInput.waistPosition,
          wavelengthMetres
        );

        const threshold = segment.cavityCouplingThreshold ?? 0.25;
        if (overlap >= threshold) {
          // Beam path geometry meets a cavity at its stored center position.
          // Switch onto the cavity eigenmode referenced at that same plane.
          qAfterBoundary = cavityQAtBoundary;
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
      qFinal: {
        re: qCurrent.re * 1000,
        im: qCurrent.im * 1000,
      },
    };
  }
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

function beamFromQ(q: Complex, wavelengthMetres: number): { radius: number; waistPosition: number } {
  const { waistPosition } = waistFromQ(q, wavelengthMetres);
  return {
    radius: beamRadiusFromQ(q, wavelengthMetres),
    waistPosition,
  };
}

function cavityEigenmodeAtBoundary(
  eigenmode: { waistRadius: number; waistPositionFromM1: number },
  wavelengthMetres: number,
  cavityLengthMm?: number
): Complex {
  const cavityWaistRadiusM = Math.max(1e-9, eigenmode.waistRadius / 1000);
  const cavityLengthM = Math.max(0, (cavityLengthMm ?? 0) / 1000);
  const cavityWaistPositionAtBoundaryM = eigenmode.waistPositionFromM1 / 1000 - cavityLengthM / 2;
  const zR = rayleighRange(cavityWaistRadiusM, wavelengthMetres);
  return {
    re: -cavityWaistPositionAtBoundaryM,
    im: zR,
  };
}
