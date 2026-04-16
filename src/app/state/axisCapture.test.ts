import { describe, expect, it } from 'vitest';
import {
  isWithinAxisCapture,
  snapPointToAxis,
  transverseOffsetToAxis,
} from './axisCapture';

describe('axisCapture', () => {
  it('accepts offsets within threshold', () => {
    expect(isWithinAxisCapture(10, 10)).toBe(true);
    expect(isWithinAxisCapture(-9.5, 10)).toBe(true);
  });

  it('rejects offsets outside threshold', () => {
    expect(isWithinAxisCapture(10.1, 10)).toBe(false);
    expect(isWithinAxisCapture(-10.1, 10)).toBe(false);
  });

  it('computes transverse offset using y for horizontal beam directions', () => {
    const axisOrigin = { x: 100, y: 200 };
    const point = { x: 250, y: 214 };
    expect(transverseOffsetToAxis(point, axisOrigin, 'right')).toBe(14);
    expect(transverseOffsetToAxis(point, axisOrigin, 'left')).toBe(14);
  });

  it('computes transverse offset using x for vertical beam directions', () => {
    const axisOrigin = { x: 100, y: 200 };
    const point = { x: 114, y: 250 };
    expect(transverseOffsetToAxis(point, axisOrigin, 'up')).toBe(14);
    expect(transverseOffsetToAxis(point, axisOrigin, 'down')).toBe(14);
  });

  it('snaps point to beam axis based on propagation direction', () => {
    const axisOrigin = { x: 100, y: 200 };
    expect(snapPointToAxis({ x: 250, y: 214 }, axisOrigin, 'right')).toEqual({ x: 250, y: 200 });
    expect(snapPointToAxis({ x: 114, y: 250 }, axisOrigin, 'down')).toEqual({ x: 100, y: 250 });
  });
});
