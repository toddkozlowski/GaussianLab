import { describe, it, expect } from 'vitest';
import {
  complexAdd,
  complexSub,
  complexMul,
  complexDiv,
  complexConj,
  complexMag,
  complexMagSq,
  complexPhase,
  complexInv,
  complexSqrt,
  complexExp,
  complexLn,
  complexApproxEqual,
  type Complex,
} from './complex';

describe('complex', () => {
  const a = { re: 3, im: 4 }; // magnitude 5
  const b = { re: 1, im: 2 };
  const zero = { re: 0, im: 0 };
  const one = { re: 1, im: 0 };
  const i = { re: 0, im: 1 };

  describe('arithmetic', () => {
    it('adds complex numbers', () => {
      const result = complexAdd(a, b);
      expect(result).toEqual({ re: 4, im: 6 });
    });

    it('subtracts complex numbers', () => {
      const result = complexSub(a, b);
      expect(result).toEqual({ re: 2, im: 2 });
    });

    it('multiplies complex numbers', () => {
      // (1 + 2i)(3 + 4i) = 3 + 4i + 6i - 8 = -5 + 10i
      const result = complexMul(b, a);
      expect(result).toEqual({ re: -5, im: 10 });
    });

    it('divides complex numbers', () => {
      // (3 + 4i) / (1 + 2i) = (3 + 4i)(1 - 2i) / 5 = (3 + 8 + (4-6)i) / 5 = (11 - 2i) / 5
      const result = complexDiv(a, b);
      expect(result.re).toBeCloseTo(2.2, 10);
      expect(result.im).toBeCloseTo(-0.4, 10);
    });

    it('throws on division by zero', () => {
      expect(() => complexDiv(a, zero)).toThrow();
    });
  });

  describe('conjugate', () => {
    it('conjugates a complex number', () => {
      const result = complexConj(a);
      expect(result).toEqual({ re: 3, im: -4 });
    });

    it('conjugate of conjugate is identity', () => {
      const result = complexConj(complexConj(a));
      expect(result).toEqual(a);
    });
  });

  describe('magnitude', () => {
    it('computes magnitude of 3+4i correctly (should be 5)', () => {
      const result = complexMag(a);
      expect(result).toBeCloseTo(5, 10);
    });

    it('computes squared magnitude without sqrt', () => {
      const result = complexMagSq(a);
      expect(result).toBe(25);
    });

    it('magnitude of zero is zero', () => {
      expect(complexMag(zero)).toBe(0);
    });
  });

  describe('phase', () => {
    it('computes phase of 1+0i as 0', () => {
      const result = complexPhase(one);
      expect(result).toBeCloseTo(0, 10);
    });

    it('computes phase of 0+1i as π/2', () => {
      const result = complexPhase(i);
      expect(result).toBeCloseTo(Math.PI / 2, 10);
    });

    it('computes phase of 1+1i as π/4', () => {
      const result = complexPhase({ re: 1, im: 1 });
      expect(result).toBeCloseTo(Math.PI / 4, 10);
    });
  });

  describe('inverse and special operations', () => {
    it('inverts a complex number', () => {
      // 1 / (1+2i) = (1-2i) / 5 = 0.2 - 0.4i
      const result = complexInv(b);
      expect(result.re).toBeCloseTo(0.2, 10);
      expect(result.im).toBeCloseTo(-0.4, 10);
    });

    it('z * 1/z equals 1', () => {
      const inv = complexInv(a);
      const result = complexMul(a, inv);
      expect(result.re).toBeCloseTo(1, 10);
      expect(result.im).toBeCloseTo(0, 10);
    });

    it('throws on inverting zero', () => {
      expect(() => complexInv(zero)).toThrow();
    });

    it('computes square root of a complex number', () => {
      // sqrt(1 + 0i) = 1
      const result = complexSqrt(one);
      expect(result.re).toBeCloseTo(1, 10);
      expect(result.im).toBeCloseTo(0, 10);
    });

    it('computes square root of negative real number', () => {
      // sqrt(-1) = i
      const result = complexSqrt({ re: -1, im: 0 });
      expect(result.re).toBeCloseTo(0, 10);
      expect(result.im).toBeCloseTo(1, 10);
    });

    it('(sqrt(z))^2 ≈ z', () => {
      const sqrt_a = complexSqrt(a);
      const result = complexMul(sqrt_a, sqrt_a);
      expect(result.re).toBeCloseTo(a.re, 10);
      expect(result.im).toBeCloseTo(a.im, 10);
    });
  });

  describe('exponential and logarithm', () => {
    it('computes e^(0+0i) = 1', () => {
      const result = complexExp(zero);
      expect(result.re).toBeCloseTo(1, 10);
      expect(result.im).toBeCloseTo(0, 10);
    });

    it('computes e^(0+πi) = -1', () => {
      const result = complexExp({ re: 0, im: Math.PI });
      expect(result.re).toBeCloseTo(-1, 10);
      expect(result.im).toBeCloseTo(0, 8); // Allow some slop
    });

    it('computes ln(1+0i) = 0', () => {
      const result = complexLn(one);
      expect(result.re).toBeCloseTo(0, 10);
      expect(result.im).toBeCloseTo(0, 10);
    });

    it('computes ln(e) = 1', () => {
      const e = { re: Math.E, im: 0 };
      const result = complexLn(e);
      expect(result.re).toBeCloseTo(1, 10);
      expect(result.im).toBeCloseTo(0, 10);
    });

    it('exp(ln(z)) ≈ z', () => {
      const ln_a = complexLn(a);
      const result = complexExp(ln_a);
      expect(result.re).toBeCloseTo(a.re, 8);
      expect(result.im).toBeCloseTo(a.im, 8);
    });
  });

  describe('approximate equality', () => {
    it('returns true for identical values', () => {
      expect(complexApproxEqual(a, a)).toBe(true);
    });

    it('returns true within tolerance', () => {
      const approx = { re: 3.0000001, im: 4.0000001 };
      expect(complexApproxEqual(a, approx, 1e-6)).toBe(true);
    });

    it('returns false outside tolerance', () => {
      const far = { re: 3.1, im: 4 };
      expect(complexApproxEqual(a, far, 1e-6)).toBe(false);
    });
  });

  describe('physical example: q-parameter of Gaussian beam', () => {
    // Physical setup: 1064 nm laser, 0.05 mm waist at waist location
    const wavelengthM = 1064e-9; // metres
    const waistRadiusM = 0.05e-3; // metres
    const zR = (Math.PI * waistRadiusM * waistRadiusM) / wavelengthM; // Rayleigh range

    it('q-parameter at waist is i*zR', () => {
      const q = { re: 0, im: zR };
      expect(q.im).toBeGreaterThan(0);
    });

    it('inverse q-parameter describes curvature and beam size', () => {
      const q = { re: 0, im: zR };
      const invQ = complexInv(q);
      // For pure imaginary q = i*zR: 1/q = -i/zR
      expect(invQ.re).toBeCloseTo(0, 10);
      expect(invQ.im).toBeCloseTo(-1 / zR, 8);
    });
  });
});
