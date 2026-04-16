/**
 * Mode Overlap Integral
 *
 * Calculates the overlap between two Gaussian beams.
 * Formula (from optics-math SKILL):
 * O = (2*sqrt(w1*w2) / (w1+w2)) * exp(-π*(z1-z2)² / (λ*(w1+w2)))
 *
 * where:
 *  - w1, w2 are beam radii at the comparison point
 *  - z1, z2 are waist positions (relative to comparison point)
 *  - λ is the wavelength
 *
 * Range: 0 ≤ O ≤ 1
 */

/**
 * Calculate the mode overlap between two Gaussian beams.
 *
 * @param beam1Radius_w1 Radius of beam 1 at the interaction point (metres)
 * @param beam1WaistZ_z1 Waist position of beam 1 relative to interaction point (metres)
 * @param beam2Radius_w2 Radius of beam 2 at the interaction point (metres)
 * @param beam2WaistZ_z2 Waist position of beam 2 relative to interaction point (metres)
 * @param wavelengthM Wavelength in metres
 * @returns Mode overlap (dimensionless, 0 ≤ O ≤ 1)
 */
export function calculateModeOverlap(
  beam1Radius_w1: number,
  beam1WaistZ_z1: number,
  beam2Radius_w2: number,
  beam2WaistZ_z2: number,
  wavelengthM: number
): number {
  // Geometric term: 2*sqrt(w1*w2) / (w1 + w2)
  const geometric = (2 * Math.sqrt(beam1Radius_w1 * beam2Radius_w2)) / (beam1Radius_w1 + beam2Radius_w2);

  // Phase mismatch term: exp(-π*Δz² / (λ*(w1+w2)))
  const deltaZ = beam1WaistZ_z1 - beam2WaistZ_z2;
  const phase = Math.exp(-Math.PI * deltaZ * deltaZ / (wavelengthM * (beam1Radius_w1 + beam2Radius_w2)));

  return geometric * phase;
}

/**
 * Simplified overlap for beams at their waists (z1 = z2 = 0).
 * Reduces to: O = 2*sqrt(w1*w2) / (w1 + w2)
 *
 * @param beam1WaistRadius w01
 * @param beam2WaistRadius w02
 * @returns Mode overlap (0 ≤ O ≤ 1)
 */
export function calculateModeOverlapAtWaists(beam1WaistRadius: number, beam2WaistRadius: number): number {
  return (2 * Math.sqrt(beam1WaistRadius * beam2WaistRadius)) / (beam1WaistRadius + beam2WaistRadius);
}

/**
 * Mode-matching efficiency with waist size matching.
 * For symmetric telescopes that scale the beam: if w1 = k*w2, then overlap is maximized
 * at matching: O_match = 1 when w1 = w2
 */
export function modeMismatchPenalty(beam1WaistRadius: number, beam2WaistRadius: number): number {
  // Penalty increases as beams become more mismatched
  const ratio = beam1WaistRadius / beam2WaistRadius;
  // Harmonic mean efficiency
  return (2 * ratio) / (ratio * ratio + 1);
}

/**
 * Effective Rayleigh range for mode matching.
 * When two beams with different Rayleigh ranges interact, the effective
 * interaction range is limited by the smaller Rayleigh range.
 */
export function effectiveRayleighRange(zR1: number, zR2: number): number {
  return Math.sqrt(zR1 * zR2); // Geometric mean (conservative)
}
