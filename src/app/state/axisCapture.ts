import type { CardinalDirection, Point2d } from './schema';

export function isWithinAxisCapture(offsetMm: number, thresholdMm: number) {
  return Math.abs(offsetMm) <= thresholdMm;
}

export function transverseOffsetToAxis(
  point: Point2d,
  axisOrigin: Point2d,
  direction: CardinalDirection,
) {
  if (direction === 'right' || direction === 'left') {
    return point.y - axisOrigin.y;
  }

  return point.x - axisOrigin.x;
}

export function snapPointToAxis(
  point: Point2d,
  axisOrigin: Point2d,
  direction: CardinalDirection,
): Point2d {
  if (direction === 'right' || direction === 'left') {
    return {
      x: point.x,
      y: axisOrigin.y,
    };
  }

  return {
    x: axisOrigin.x,
    y: point.y,
  };
}