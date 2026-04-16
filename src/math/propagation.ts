/**
 * Propagation Engine: Orchestrates beam propagation through optical system
 *
 * Combines q-parameter, ABCD matrices, and beam profile calculations
 * into an injectable implementation of PropagationEngine interface.
 */

import {
  qFromWaist,
  waistFromQ,
  propagateQ,
  beamRadiusAtZ,
  rayleighRange,
} from './qParameter';
import { type Complex } from './complex';
import { createABCD, multiplyABCD, type ABCDMatrix as MathABCDMatrix } from './abcd';
import type {
  PropagationEngine,
  PropagationEngineInput,
  PropagationSegment,
  ABCDMatrix,
} from '../app/state/types/Layer0Interfaces';
import type { PropagationResult, PropagationWaist, ComplexNumber } from '../app/state/schema';

/**
 * Propagation engine: traces Gaussian beam through optical system
 */
export class ConcreteBeamPropagationEngine implements PropagationEngine {
  /**
   * Propagate beam through segments and return profile + waists
   */
  propagateBeam(input: PropagationEngineInput): PropagationResult {
    const { q0, wavelengthMetres, segments, componentZMap } = input;

    // Convert input q (in mm units) to SI for calculation
    // Note: q0 is in mm per schema convention; convert to metres
    const q0_SI: Complex = {
      re: q0.re / 1000, // mm to metres
      im: q0.im / 1000, // mm to metres
    };

    let q_current = q0_SI;
    let z_current = 0; // Absolute position in system

    const profile: Array<{ z: number; w: number }> = []; // in mm
    const waists: PropagationWaist[] = [];
    const qAtComponent: Record<string, ComplexNumber> = {};

    // Propagate through each segment
    for (const segment of segments) {
      const { distance, abcdMatrix: abcdMM, componentId } = segment;

      // Convert ABCD matrix from mm to SI (metres)
      const abcdSI = convertABCDtoSI(abcdMM);

      // Apply ABCD transformation
      q_current = propagateQ(q_current, abcdSI);

      // Sample profile along this segment at regular intervals
      const { waistRadius, waistPosition } = waistFromQ(q_current, wavelengthMetres);
      const zR = rayleighRange(waistRadius, wavelengthMetres);

      // Sample points along segment (every 5mm or so)
      const sampleCount = Math.max(2, Math.ceil((distance / 1000) / 0.005)); // Convert mm to metres, 5mm spacing
      for (let i = 0; i <= sampleCount; i++) {
        const frac = i / sampleCount;
        const z_local = frac * (distance / 1000); // metres
        const w_local = beamRadiusAtZ(waistRadius, zR, z_local);

        // Check if this is close to waist
        if (i === 0 && frac === 0 && Math.abs(z_local) < 1e-6) {
          // Start of segment
        }
        if (Math.abs(z_local - waistPosition) < 0.0001) {
          // Near waist position
          if (waists.length === 0 || Math.abs(waists[waists.length - 1].z - (z_current + z_local)) > 0.001) {
            waists.push({
              z: z_current + z_local, // absolute position in metres
              w: w_local,
              componentId,
            });
          }
        }

        profile.push({
          z: (z_current + z_local) * 1000, // Convert back to mm for output
          w: w_local * 1000, // Convert back to mm for output
        });
      }

      // Record q at component if this segment terminates at a component
      if (componentId) {
        qAtComponent[componentId] = {
          re: q_current.re * 1000, // Convert back to mm
          im: q_current.im * 1000, // Convert back to mm
        };
      }

      z_current += distance / 1000; // Update absolute position (mm to metres)
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
        re: q_current.re * 1000, // Convert back to mm
        im: q_current.im * 1000, // Convert back to mm
      },
    };
  }
}

/**
 * Convert ABCD matrix from mm (persisted units) to SI (metres)
 * B is multiplied by 1e-3 (mm to m)
 * C is divided by 1e-3 (1/mm to 1/m)
 */
function convertABCDtoSI(abcdMM: ABCDMatrix): MathABCDMatrix {
  return {
    A: abcdMM.A,
    B: abcdMM.B / 1000, // mm to metres
    C: abcdMM.C * 1000, // 1/mm to 1/metres
    D: abcdMM.D,
  };
}
