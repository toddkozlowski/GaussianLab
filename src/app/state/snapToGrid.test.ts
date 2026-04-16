import { describe, expect, it } from 'vitest';
import { gridSpacingMm, snapPointToGrid, snapScalarToGrid } from './snapToGrid';

describe('snapToGrid', () => {
  it('uses metric spacing for metric grid standard', () => {
    expect(gridSpacingMm('metric')).toBe(25);
  });

  it('uses imperial spacing for imperial grid standard', () => {
    expect(gridSpacingMm('imperial')).toBe(25.4);
  });

  it('snaps scalar values to nearest grid increment', () => {
    expect(snapScalarToGrid(37, 'metric')).toBe(25);
    expect(snapScalarToGrid(39, 'metric')).toBe(50);
  });

  it('snaps x and y coordinates independently', () => {
    expect(snapPointToGrid({ x: 37, y: 74 }, 'metric')).toEqual({ x: 25, y: 75 });
  });
});
