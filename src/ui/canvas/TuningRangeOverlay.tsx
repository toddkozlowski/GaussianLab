/**
 * TuningRangeOverlay: shades the manual mode-matching adjustment ranges
 * (Sidebar > Mode Matching > "Manual adjustment ranges") directly on the
 * table, as dashed rounded rectangles 2 grid squares wide, centered on the
 * beam path. A range can bend around a mirror - resolveZRangeExtents splits
 * it into one physical chunk per beam-path segment it touches, and segments
 * also end at non-redirecting components (lenses, targets, etc.) that don't
 * actually bend the path. Only a real direction change (a mirror) should
 * produce a separate shape, so consecutive same-direction extents are merged
 * into one continuous rectangle spanning straight through any such
 * components in between.
 */
import React from 'react';
import { Rect } from 'react-konva';
import type { BeamPath, CardinalDirection, GridStandard, ManualAdjustmentRange, Point2d } from '../../app/state/schema';
import { resolveZRangeExtents } from '../../app/state/pathUtils';
import { gridSpacingMm } from '../../app/state/snapToGrid';

interface TuningRangeOverlayProps {
  beamPath: BeamPath | null;
  manualRanges: ManualAdjustmentRange[];
  gridStandard: GridStandard;
  mmToPx: (mm: number) => number;
}

interface MergedRangeSpan {
  direction: CardinalDirection;
  pointA: Point2d;
  pointB: Point2d;
}

function mergeCollinearExtents(
  extents: ReturnType<typeof resolveZRangeExtents>,
): MergedRangeSpan[] {
  const spans: MergedRangeSpan[] = [];
  for (const extent of extents) {
    const last = spans[spans.length - 1];
    if (last && last.direction === extent.segment.direction) {
      last.pointB = extent.pointB;
    } else {
      spans.push({ direction: extent.segment.direction, pointA: extent.pointA, pointB: extent.pointB });
    }
  }
  return spans;
}

export const TuningRangeOverlay: React.FC<TuningRangeOverlayProps> = ({
  beamPath,
  manualRanges,
  gridStandard,
  mmToPx,
}) => {
  if (!beamPath || manualRanges.length === 0) {
    return null;
  }

  const halfWidthMm = gridSpacingMm(gridStandard); // 2 grid squares wide, centered => 1 square each side

  return (
    <>
      {manualRanges.map((range) =>
        mergeCollinearExtents(resolveZRangeExtents(beamPath, range.startZMm, range.endZMm)).map((span, i) => {
          const isHorizontal = span.direction === 'left' || span.direction === 'right';
          const xMm = isHorizontal ? Math.min(span.pointA.x, span.pointB.x) : span.pointA.x - halfWidthMm;
          const yMm = isHorizontal ? span.pointA.y - halfWidthMm : Math.min(span.pointA.y, span.pointB.y);
          const widthMm = isHorizontal ? Math.abs(span.pointB.x - span.pointA.x) : halfWidthMm * 2;
          const heightMm = isHorizontal ? halfWidthMm * 2 : Math.abs(span.pointB.y - span.pointA.y);

          return (
            <Rect
              key={`${range.id}-${i}`}
              x={mmToPx(xMm)}
              y={mmToPx(yMm)}
              width={mmToPx(widthMm)}
              height={mmToPx(heightMm)}
              cornerRadius={10}
              fill="rgba(147, 51, 234, 0.14)"
              stroke="rgba(126, 34, 206, 0.75)"
              strokeWidth={1.5}
              dash={[7, 5]}
              listening={false}
            />
          );
        }),
      )}
    </>
  );
};
