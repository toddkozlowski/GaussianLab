/**
 * Gaussian Beam Waist Fit
 *
 * Recovers a beam's waist position z0 and waist radius w0 from measured
 * (z, w) samples, using the standard beam-waist fitting method: w(z)^2 is
 * exactly quadratic in z for an ideal Gaussian beam,
 *
 *   w(z)^2 = w0^2 + (w0/zR)^2 * (z - z0)^2 = a*z^2 + b*z + c
 *
 * so fitting a quadratic to (z_i, w_i^2) by linear least squares - no
 * wavelength needed - and inverting a/b/c recovers z0 and w0 directly:
 *
 *   z0 = -b / (2a)
 *   w0 = sqrt(c - b^2/(4a))
 *
 * A physically valid waist requires a > 0 (radius must curve upward away
 * from a minimum) and the recovered w0^2 > 0; otherwise the data doesn't
 * describe a real beam waist and the fit is rejected.
 */

export interface WaistFitInputPoint {
  zMm: number;
  waistRadiusMm: number;
}

export interface WaistFitOutput {
  zMm: number;
  waistRadiusMm: number;
}

/** Minimum number of (z, w) samples needed to determine the quadratic's 3 coefficients. */
export const MIN_WAIST_FIT_POINTS = 3;

function determinant3(m: number[][]): number {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}

/** Solves the 3x3 linear system M*x = v via Cramer's rule; null if M is singular. */
function solve3x3(m: number[][], v: number[]): [number, number, number] | null {
  const det = determinant3(m);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) {
    return null;
  }

  const withColumn = (col: number, replacement: number[]): number[][] =>
    m.map((row, i) => row.map((value, j) => (j === col ? replacement[i] : value)));

  const a = determinant3(withColumn(0, v)) / det;
  const b = determinant3(withColumn(1, v)) / det;
  const c = determinant3(withColumn(2, v)) / det;
  return [a, b, c];
}

/**
 * Fits a Gaussian beam waist to the given (z, w) samples.
 * Returns null if there are too few points, the points are degenerate
 * (e.g. all at the same z), or the fitted curve doesn't describe a real
 * waist (no upward curvature, or a non-positive recovered waist size).
 */
export function fitGaussianWaist(points: WaistFitInputPoint[]): WaistFitOutput | null {
  if (points.length < MIN_WAIST_FIT_POINTS) {
    return null;
  }

  // Normal equations for least-squares fit of y = a*z^2 + b*z + c against
  // y_i = w_i^2, i.e. (X^T X) [a,b,c]^T = X^T y for design rows [z^2, z, 1].
  let sz1 = 0;
  let sz2 = 0;
  let sz3 = 0;
  let sz4 = 0;
  let sy0 = 0;
  let sy1 = 0;
  let sy2 = 0;
  const n = points.length;

  for (const { zMm: z, waistRadiusMm: w } of points) {
    const z2 = z * z;
    const y = w * w;
    sz1 += z;
    sz2 += z2;
    sz3 += z2 * z;
    sz4 += z2 * z2;
    sy0 += y;
    sy1 += z * y;
    sy2 += z2 * y;
  }

  const normalMatrix = [
    [sz4, sz3, sz2],
    [sz3, sz2, sz1],
    [sz2, sz1, n],
  ];
  const solution = solve3x3(normalMatrix, [sy2, sy1, sy0]);
  if (!solution) {
    return null;
  }

  const [a, b, c] = solution;
  if (!(a > 0)) {
    return null; // no upward curvature - not a real waist
  }

  const zMm = -b / (2 * a);
  const w0Sq = c - (b * b) / (4 * a);
  if (!(w0Sq > 0)) {
    return null;
  }

  return { zMm, waistRadiusMm: Math.sqrt(w0Sq) };
}
