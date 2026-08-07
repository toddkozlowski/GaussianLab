/**
 * TuningRangeOverlay: shades the manual mode-matching adjustment ranges
 * (Sidebar > Mode Matching > "Manual adjustment ranges") directly on the
 * table, as dashed rounded rectangles 2 grid squares wide, centered on the
 * beam path. A range can bend around a mirror - resolveZRangeExtents already
 * splits it into one physical chunk per segment it touches, so a corner
 * shows up here as two rectangles meeting at the mirror.
 */
import React from 'react';
import { Rect } from 'react-konva';
import type { BeamPath, GridStandard, ManualAdjustmentRange } from '../../app/state/schema';
import { resolveZRangeExtents } from '../../app/state/pathUtils';
import { gridSpacingMm } from '../../app/state/snapToGrid';

interface TuningRangeOverlayProps {
  beamPath: BeamPath | null;
  manualRanges: ManualAdjustmentRange[];
  gridStandard: GridStandard;
  mmToPx: (mm: number) => number;
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
        resolveZRangeExtents(beamPath, range.startZMm, range.endZMm).map((extent, i) => {
          const isHorizontal = extent.segment.direction === 'left' || extent.segment.direction === 'right';
          const xMm = isHorizontal
            ? Math.min(extent.pointA.x, extent.pointB.x)
            : extent.segment.start.x - halfWidthMm;
          const yMm = isHorizontal
            ? extent.segment.start.y - halfWidthMm
            : Math.min(extent.pointA.y, extent.pointB.y);
          const widthMm = isHorizontal ? Math.abs(extent.pointB.x - extent.pointA.x) : halfWidthMm * 2;
          const heightMm = isHorizontal ? halfWidthMm * 2 : Math.abs(extent.pointB.y - extent.pointA.y);

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
