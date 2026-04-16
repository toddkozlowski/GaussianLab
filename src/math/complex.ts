/**
 * Complex Number Utilities
 *
 * Layer 0: Pure mathematics, no UI dependencies.
 * Implements basic complex arithmetic and q-parameter-related operations.
 * All values in SI units (metres, metres^-1, etc.) internally.
 */

export interface Complex {
  re: number; // Real part
  im: number; // Imaginary part
}

/**
 * Add two complex numbers.
 */
export function complexAdd(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}

/**
 * Subtract two complex numbers.
 */
export function complexSub(a: Complex, b: Complex): Complex {
  return { re: a.re - b.re, im: a.im - b.im };
}

/**
 * Multiply two complex numbers.
 */
export function complexMul(a: Complex, b: Complex): Complex {
  const re = a.re * b.re - a.im * b.im;
  const im = a.re * b.im + a.im * b.re;
  return { re, im };
}

/**
 * Divide one complex number by another: a / b
 */
export function complexDiv(a: Complex, b: Complex): Complex {
  const denom = b.re * b.re + b.im * b.im;
  if (denom === 0) {
    throw new Error('Cannot divide by zero');
  }
  const re = (a.re * b.re + a.im * b.im) / denom;
  const im = (a.im * b.re - a.re * b.im) / denom;
  return { re, im };
}

/**
 * Conjugate of a complex number.
 */
export function complexConj(a: Complex): Complex {
  return { re: a.re, im: -a.im };
}

/**
 * Magnitude (modulus) of a complex number.
 */
export function complexMag(a: Complex): number {
  return Math.sqrt(a.re * a.re + a.im * a.im);
}

/**
 * Squared magnitude (avoids square root).
 */
export function complexMagSq(a: Complex): number {
  return a.re * a.re + a.im * a.im;
}

/**
 * Phase (argument) of a complex number in radians.
 */
export function complexPhase(a: Complex): number {
  return Math.atan2(a.im, a.re);
}

/**
 * Inverse (reciprocal) of a complex number: 1/a
 */
export function complexInv(a: Complex): Complex {
  const denom = a.re * a.re + a.im * a.im;
  if (denom === 0) {
    throw new Error('Cannot invert zero');
  }
  return { re: a.re / denom, im: -a.im / denom };
}

/**
 * Square root of a complex number.
 * Follows the principal branch (positive real part, or positive imaginary if real part is zero).
 */
export function complexSqrt(a: Complex): Complex {
  const mag = complexMag(a);
  const phase = complexPhase(a);
  const newMag = Math.sqrt(mag);
  const newPhase = phase / 2;
  return {
    re: newMag * Math.cos(newPhase),
    im: newMag * Math.sin(newPhase),
  };
}

/**
 * Exponential of a complex number: e^a
 */
export function complexExp(a: Complex): Complex {
  const expRe = Math.exp(a.re);
  return {
    re: expRe * Math.cos(a.im),
    im: expRe * Math.sin(a.im),
  };
}

/**
 * Natural logarithm of a complex number (principal branch).
 */
export function complexLn(a: Complex): Complex {
  const mag = complexMag(a);
  const phase = complexPhase(a);
  return {
    re: Math.log(mag),
    im: phase,
  };
}

/**
 * Format a complex number as a string for debugging.
 */
export function complexToString(a: Complex, precision: number = 6): string {
  const re = a.re.toFixed(precision);
  const im = a.im.toFixed(precision);
  const sign = a.im >= 0 ? '+' : '';
  return `${re}${sign}${im}i`;
}

/**
 * Check if two complex numbers are approximately equal within tolerance.
 */
export function complexApproxEqual(a: Complex, b: Complex, tolerance: number = 1e-12): boolean {
  return Math.abs(a.re - b.re) < tolerance && Math.abs(a.im - b.im) < tolerance;
}
