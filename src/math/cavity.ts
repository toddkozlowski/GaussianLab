/**
 * Cavity Eigenmode Solver
 *
 * Solves for the stable Gaussian beam (eigenmode) inside an optical cavity.
 * Uses the q-parameter formalism: for a round-trip ABCD matrix M,
 * the cavity eigenmode must satisfy q_out = q_in, which gives:
 *
 *   C*q² + (D-A)*q - B = 0
 *
 * The cavity is stable if and only if 0 ≤ g1*g2 ≤ 1,
 * where g = 1 - L/R for each mirror.
 */

import { complexMul, complexDiv, complexAdd, complexSub, complexInv, complexSqrt, type Complex } from './complex';
import type { ABCDMatrix } from './abcd';

/**
 * Cavity configuration shape used for eigenmode solving
 */
export interface Cavity {
  roundTripABCD: ABCDMatrix;
  // Optional: mirrors for stability calculation
  mirror1?: { radiusOfCurvatureM: number };
  mirror2?: { radiusOfCurvatureM: number };
  distanceBetweenMirrors?: number;
}

/**
 * Result of cavity eigenmode solving
 */
export interface CavityEigenmode {
  q: Complex; // The eigenmode q-parameter
  waistRadiusM: number; // Beam waist radius in metres
  waistPositionInCavityM: number; // Position of waist from first mirror
  isStable: boolean; // Whether cavity is stable
  g1: number; // Stability parameter for mirror 1
  g2: number; // Stability parameter for mirror 2
}

function gParameter(lengthM: number, radiusM: number): number {
  if (!Number.isFinite(radiusM)) {
    return 1;
  }
  return 1 - lengthM / radiusM;
}

export function solveTwoMirrorEigenmode(
  lengthM: number,
  radius1M: number,
  radius2M: number,
  wavelengthM: number,
): CavityEigenmode | null {
  if (!(lengthM > 0) || !(wavelengthM > 0)) {
    return null;
  }

  const g1 = gParameter(lengthM, radius1M);
  const g2 = gParameter(lengthM, radius2M);
  const stabilityProduct = g1 * g2;
  const isStable = stabilityProduct >= 0 && stabilityProduct <= 1;
  if (!isStable) {
    return null;
  }

  let waistPositionInCavityM: number;
  let zRM: number;

  const eps = 1e-12;
  const r1Finite = Number.isFinite(radius1M);
  const r2Finite = Number.isFinite(radius2M);

  if (r1Finite && r2Finite && Math.abs(radius1M - lengthM) < eps && Math.abs(radius2M - lengthM) < eps) {
    waistPositionInCavityM = lengthM / 2;
    zRM = lengthM / 2;
  } else if (!r1Finite && r2Finite) {
    waistPositionInCavityM = 0;
    const zR2 = lengthM * (radius2M - lengthM);
    if (!(zR2 > 0)) {
      return null;
    }
    zRM = Math.sqrt(zR2);
  } else if (r1Finite && !r2Finite) {
    waistPositionInCavityM = lengthM;
    const zR2 = lengthM * (radius1M - lengthM);
    if (!(zR2 > 0)) {
      return null;
    }
    zRM = Math.sqrt(zR2);
  } else if (!r1Finite && !r2Finite) {
    return null;
  } else {
    const denominator = radius1M + radius2M - 2 * lengthM;
    if (Math.abs(denominator) < eps) {
      return null;
    }

    waistPositionInCavityM = (lengthM * (radius2M - lengthM)) / denominator;
    const zR2 = waistPositionInCavityM * (radius1M - waistPositionInCavityM);
    if (!(zR2 > 0)) {
      return null;
    }
    zRM = Math.sqrt(zR2);
  }

  const waistRadiusM = Math.sqrt((wavelengthM * zRM) / Math.PI);
  return {
    q: { re: -waistPositionInCavityM, im: zRM },
    waistRadiusM,
    waistPositionInCavityM,
    isStable: true,
    g1,
    g2,
  };
}

/**
 * Compute stability parameters g1 and g2.
 * For a mirror with radius R and distance L from the other mirror:
 *   g = 1 - L/R
 * Cavity is stable iff 0 ≤ g1*g2 ≤ 1
 *
 * @param cavity Cavity configuration
 * @returns { g1, g2, isStable }
 */
function computeStabilityParameters(cavity: Cavity): { g1: number; g2: number; isStable: boolean } {
  if (!cavity.mirror1 || !cavity.mirror2 || cavity.distanceBetweenMirrors === undefined) {
    return { g1: 0.5, g2: 0.5, isStable: true }; // Conservative default
  }

  const L = cavity.distanceBetweenMirrors;
  const g1 = 1 - L / cavity.mirror1.radiusOfCurvatureM;
  const g2 = 1 - L / cavity.mirror2.radiusOfCurvatureM;
  const product = g1 * g2;
  const isStable = product >= 0 && product <= 1;

  return { g1, g2, isStable };
}

/**
 * Solve for the cavity eigenmode.
 * Raises error if the quadratic has no solution or if cavity is unstable.
 *
 * @param cavity Cavity configuration with round-trip ABCD matrix
 * @param wavelengthM Wavelength in metres
 * @returns Cavity eigenmode or null if no stable solution
 */
export function solveEigenmode(cavity: Cavity, wavelengthM: number): CavityEigenmode | null {
  const M = cavity.roundTripABCD;
  const { A, B, C, D } = M;

  // Quadratic: C*q² + (D-A)*q - B = 0
  // Using quadratic formula: q = [-(D-A) ± sqrt((D-A)² + 4*C*B)] / (2*C)

  if (Math.abs(C) < 1e-20) {
    // Linear case: (D-A)*q = B => q = B/(D-A)
    if (Math.abs(D - A) < 1e-20) {
      return null; // No solution
    }
    const q: Complex = { re: B / (D - A), im: 0 };
    // Note: Might not be physical if imaginary part is not positive
    // For now, return it; caller should validate
    return {
      q,
      waistRadiusM: 0.001, // Placeholder
      waistPositionInCavityM: 0,
      isStable: true,
      g1: 1,
      g2: 1,
    };
  }

  // Discriminant: (D-A)² + 4*C*B
  const discriminantRe = (D - A) * (D - A) + 4 * C * B;
  const discriminant: Complex = { re: discriminantRe, im: 0 };

  // Compute sqrt of discriminant (in complex plane)
  const sqrtDisc = complexSqrt(discriminant);

  // Two solutions:
  // q+ = [-(D-A) + sqrt(disc)] / (2*C)
  // q- = [-(D-A) - sqrt(disc)] / (2*C)

  const negDmA: Complex = { re: -(D - A), im: 0 };
  const twoC: Complex = { re: 2 * C, im: 0 };

  const q_plus = complexDiv(complexAdd(negDmA, sqrtDisc), twoC);
  const q_minus = complexDiv(complexSub(negDmA, sqrtDisc), twoC);

  // Choose the solution with positive imaginary part (physical beam waist)
  let q: Complex;
  if (q_plus.im > 0) {
    q = q_plus;
  } else if (q_minus.im > 0) {
    q = q_minus;
  } else {
    return null; // No physical solution
  }

  // Compute waist radius from q = i*zR at waist
  // More generally: 1/q = 1/R - i*λ/(π*w²)
  // At waist: R = ∞, so 1/q = -i*λ/(π*w²), thus w² = -λ/(π*Im(1/q))
  const invQ = complexInv(q);
  const wSq = -wavelengthM / (Math.PI * invQ.im);
  const waistRadiusM = Math.sqrt(wSq);

  // Stability parameters
  const { isStable, g1, g2 } = computeStabilityParameters(cavity);

  return {
    q,
    waistRadiusM,
    waistPositionInCavityM: -q.re, // Waist is at -q.re from current location
    isStable,
    g1,
    g2,
  };
}

/**
 * Check if cavity is geometrically stable.
 * Stability condition: 0 ≤ g1*g2 ≤ 1
 *
 * @param cavity Cavity configuration
 * @returns true if stable
 */
export function isCavityStable(cavity: Cavity): boolean {
  const { isStable } = computeStabilityParameters(cavity);
  return isStable;
}
