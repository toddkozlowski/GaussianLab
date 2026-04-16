/**
 * Complex q-Parameter and Gaussian Beam Propagation
 *
 * The complex q-parameter encodes the Gaussian beam state:
 * q = z + i*zR, where zR = π*w0²/λ (Rayleigh range)
 * 
 * At waist: q = i*zR
 * Elsewhere: 1/q = 1/R - i*λ/(π*w²)
 *
 * All values in SI units (metres, metres⁻¹).
 */

import { complexMul, complexDiv, complexAdd, complexSub, complexInv, type Complex } from './complex';
import type { ABCDMatrix } from './abcd';

const PI = Math.PI;

/**
 * Compute q-parameter from waist radius and distance from waist.
 *
 * For a waist at z=0 with radius w0 and wavelength λ:
 *   q(z) = z + i*zR, where zR = π*w0²/λ
 *
 * @param waistRadiusM Waist radius in metres (1/e² definition)
 * @param distanceFromWaistM Distance from the waist (positive = downstream, negative = upstream)
 * @param wavelengthM Wavelength in metres
 * @returns Complex q-parameter
 */
export function qFromWaist(
  waistRadiusM: number,
  distanceFromWaistM: number,
  wavelengthM: number
): Complex {
  const zR = (PI * waistRadiusM * waistRadiusM) / wavelengthM;
  return {
    re: distanceFromWaistM,
    im: zR,
  };
}

/**
 * Compute waist radius (w0) and waist position (z0) from q-parameter.
 * Uses: 1/q = 1/R - i*λ/(π*w²)
 * where R is the radius of curvature and w is the beam radius.
 *
 * @param q Complex q-parameter
 * @param wavelengthM Wavelength in metres
 * @returns { waistRadius, waistPosition } relative to current location
 */
export function waistFromQ(q: Complex, wavelengthM: number): { waistRadius: number; waistPosition: number } {
  const invQ = complexInv(q);

  // invQ.re = 1/R (curvature)
  // invQ.im = -λ/(π*w²)

  // From invQ.im, solve for w:
  // w² = -λ / (π * invQ.im)
  const wSq = -wavelengthM / (PI * invQ.im);
  const waistRadius = Math.sqrt(wSq);

  // From invQ.re = 1/R, solve for z:
  // At given position, z = -invQ.re * zR² (relationship from q-param derivation)
  // Simpler: z = -q.re (from q = z + i*zR)
  const waistPosition = -q.re;

  return { waistRadius, waistPosition };
}

/**
 * Transform q-parameter through an ABCD system.
 * q_out = (A*q_in + B) / (C*q_in + D)
 *
 * @param q Input q-parameter
 * @param M ABCD matrix
 * @returns Output q-parameter
 */
export function propagateQ(q: Complex, M: ABCDMatrix): Complex {
  // Numerator: A*q + B
  const numerator = complexAdd(complexMul({ re: M.A, im: 0 }, q), { re: M.B, im: 0 });

  // Denominator: C*q + D
  const denominator = complexAdd(complexMul({ re: M.C, im: 0 }, q), { re: M.D, im: 0 });

  return complexDiv(numerator, denominator);
}

/**
 * Compute beam radius w(z) at a given z-distance.
 * w(z) = w0 * sqrt(1 + (z/zR)²)
 *
 * @param waistRadius w0 in metres
 * @param rayleighRange zR in metres
 * @param z Distance from waist in metres
 * @returns Beam radius at z
 */
export function beamRadiusAtZ(waistRadius: number, rayleighRange: number, z: number): number {
  return waistRadius * Math.sqrt(1 + (z / rayleighRange) ** 2);
}

/**
 * Compute wavefront radius of curvature R(z) at a given z-distance.
 * R(z) = z * (1 + (zR/z)²)
 * At the waist (z=0), R becomes infinite (flat wavefront).
 *
 * @param rayleighRange zR in metres
 * @param z Distance from waist in metres
 * @returns Radius of curvature (Infinity at z=0)
 */
export function wavefrontRadiusAtZ(rayleighRange: number, z: number): number {
  if (Math.abs(z) < 1e-20) {
    return Infinity; // At waist, wavefront is flat
  }
  return z * (1 + (rayleighRange / z) ** 2);
}

/**
 * Compute Gouy phase at a given z-distance from the waist.
 * ψ(z) = arctan(z / zR)
 *
 * @param rayleighRange zR in metres
 * @param z Distance from waist in metres
 * @returns Gouy phase in radians
 */
export function gouyPhaseAtZ(rayleighRange: number, z: number): number {
  return Math.atan(z / rayleighRange);
}

/**
 * Rayleigh range of a Gaussian beam.
 * zR = π * w0² / λ
 *
 * @param waistRadius w0 in metres
 * @param wavelengthM λ in metres
 * @returns Rayleigh range in metres
 */
export function rayleighRange(waistRadius: number, wavelengthM: number): number {
  return (PI * waistRadius * waistRadius) / wavelengthM;
}

/**
 * Beam divergence angle in the far field.
 * θ = λ / (π * w0)
 *
 * @param waistRadius w0 in metres
 * @param wavelengthM λ in metres
 * @returns Divergence angle in radians
 */
export function beamDivergence(waistRadius: number, wavelengthM: number): number {
  return wavelengthM / (PI * waistRadius);
}

/**
 * Compute q-parameter from waist radius, wavelength, and absolute position.
 * This is a utility combining source initialization and propagation.
 */
export function qAtPosition(
  sourceWaistRadiusM: number,
  sourceWaistOffsetM: number,
  wavelengthM: number,
  positionM: number
): Complex {
  // Waist is at sourceWaistOffsetM
  const distanceFromWaist = positionM - sourceWaistOffsetM;
  return qFromWaist(sourceWaistRadiusM, distanceFromWaist, wavelengthM);
}
