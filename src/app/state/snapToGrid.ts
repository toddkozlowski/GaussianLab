import type { GridStandard, Point2d } from './schema';

export function gridSpacingMm(gridStandard: GridStandard) {
  return gridStandard === 'metric' ? 25 : 25.4;
}

export function snapScalarToGrid(value: number, gridStandard: GridStandard) {
  const spacing = gridSpacingMm(gridStandard);
  return Math.round(value / spacing) * spacing;
}

export function snapPointToGrid(point: Point2d, gridStandard: GridStandard): Point2d {
  return {
    x: snapScalarToGrid(point.x, gridStandard),
    y: snapScalarToGrid(point.y, gridStandard),
  };
}
