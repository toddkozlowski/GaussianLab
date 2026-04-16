/**
 * ABCD Matrix Operations
 *
 * Implements ABCD matrix calculations for optical systems.
 * Convention: M = [[A, B], [C, D]]
 * Propagation is right-to-left: M_total = M_n * ... * M_2 * M_1
 *
 * All lengths in SI units (metres).
 */

export interface ABCDMatrix {
  A: number;
  B: number; // in metres
  C: number; // in 1/metres
  D: number;
}

/**
 * Create an ABCD matrix from explicit values.
 */
export function createABCD(A: number, B: number, C: number, D: number): ABCDMatrix {
  return { A, B, C, D };
}

/**
 * Free space propagation over distance L (metres).
 * [[1, L], [0, 1]]
 */
export function freeSpaceABCD(distanceM: number): ABCDMatrix {
  return { A: 1, B: distanceM, C: 0, D: 1 };
}

/**
 * Thin lens with focal length f (metres).
 * Positive f = converging (focal point downstream)
 * Negative f = diverging
 * [[1, 0], [-1/f, 1]]
 */
export function thinLensABCD(focalLengthM: number): ABCDMatrix {
  if (focalLengthM === 0) {
    throw new Error('Cannot create thin lens with zero focal length');
  }
  return { A: 1, B: 0, C: -1 / focalLengthM, D: 1 };
}

/**
 * Mirror reflection with radius of curvature R (metres).
 * Positive R = center of curvature at +z (concave, focusing)
 * Negative R = center of curvature at -z (convex, diverging)
 * Flat mirror: R = ±Infinity
 * [[1, 0], [2/R, 1]]
 */
export function mirrorABCD(radiusOfCurvatureM: number): ABCDMatrix {
  // Handle flat mirror (infinite radius)
  if (!isFinite(radiusOfCurvatureM)) {
    return { A: 1, B: 0, C: 0, D: 1 }; // Flat mirror: identity
  }
  if (radiusOfCurvatureM === 0) {
    throw new Error('Cannot create mirror with zero radius of curvature');
  }
  return { A: 1, B: 0, C: 2 / radiusOfCurvatureM, D: 1 };
}

/**
 * Multiply two ABCD matrices: M_result = M2 * M1
 * This represents applying M1 first, then M2.
 */
export function multiplyABCD(M1: ABCDMatrix, M2: ABCDMatrix): ABCDMatrix {
  const A = M2.A * M1.A + M2.B * M1.C;
  const B = M2.A * M1.B + M2.B * M1.D;
  const C = M2.C * M1.A + M2.D * M1.C;
  const D = M2.C * M1.B + M2.D * M1.D;
  return { A, B, C, D };
}

/**
 * Compose a sequence of ABCD matrices in optical order (left-to-right).
 * Returns M_n * ... * M_2 * M_1 (right-to-left mathematical order).
 * This represents: apply M1, then M2, then M3, etc.
 */
export function composeABCD(matrices: ABCDMatrix[]): ABCDMatrix {
  if (matrices.length === 0) {
    return { A: 1, B: 0, C: 0, D: 1 }; // Identity
  }
  if (matrices.length === 1) {
    return matrices[0];
  }

  // Build from right to left: result = matrices[n] * ... * matrices[1] * matrices[0]
  let result = matrices[0];
  for (let i = 1; i < matrices.length; i++) {
    result = multiplyABCD(result, matrices[i]);
  }
  return result;
}

/**
 * Determinant of an ABCD matrix.
 * For passive optical systems, det(M) = 1.
 */
export function determinantABCD(M: ABCDMatrix): number {
  return M.A * M.D - M.B * M.C;
}

/**
 * Inverse of an ABCD matrix (if determinant ≠ 0).
 */
export function inverseABCD(M: ABCDMatrix): ABCDMatrix {
  const det = determinantABCD(M);
  if (det === 0) {
    throw new Error('ABCD matrix is singular (determinant = 0)');
  }
  return { A: M.D / det, B: -M.B / det, C: -M.C / det, D: M.A / det };
}

/**
 * Trace of an ABCD matrix: A + D
 */
export function traceABCD(M: ABCDMatrix): number {
  return M.A + M.D;
}

/**
 * Check if a matrix is the identity matrix (within tolerance).
 */
export function isIdentityABCD(M: ABCDMatrix, tolerance: number = 1e-12): boolean {
  return (
    Math.abs(M.A - 1) < tolerance &&
    Math.abs(M.B) < tolerance &&
    Math.abs(M.C) < tolerance &&
    Math.abs(M.D - 1) < tolerance
  );
}

/**
 * Format an ABCD matrix as a readable string.
 */
export function abcdToString(M: ABCDMatrix): string {
  const precision = 6;
  return (
    `[[${M.A.toFixed(precision)}, ${M.B.toFixed(precision)}],\n` +
    ` [${M.C.toFixed(precision)}, ${M.D.toFixed(precision)}]]`
  );
}
