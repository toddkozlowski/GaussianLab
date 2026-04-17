/**
 * Grid Overlay: Draws optical table area, border, and mounting holes.
 */

import React from 'react';
import { Circle, Rect } from 'react-konva';
import type { TableConfig } from '../../app/state/schema';
import { gridSpacingMm } from '../../app/state/snapToGrid';

interface GridOverlayProps {
  config: TableConfig;
  mmToPx: (mm: number) => number;
}

export const GridOverlay: React.FC<GridOverlayProps> = ({ config, mmToPx }) => {
  const spacingMm = gridSpacingMm(config.gridStandard);
  const spacingPx = mmToPx(spacingMm);
  const tableWidthPx = mmToPx(config.width);
  const tableHeightPx = mmToPx(config.height);

  const holes: React.ReactNode[] = [];
  const holeRadius = Math.max(0.6, Math.min(2.4, spacingPx * 0.08));

  for (let xMm = 0; xMm <= config.width + 1e-6; xMm += spacingMm) {
    for (let yMm = 0; yMm <= config.height + 1e-6; yMm += spacingMm) {
      holes.push(
        <Circle
          key={`hole-${xMm}-${yMm}`}
          x={mmToPx(xMm)}
          y={mmToPx(yMm)}
          radius={holeRadius}
          fill="rgba(58, 66, 74, 0.45)"
          listening={false}
        />
      );
    }
  }

  return (
    <>
      <Rect
        x={0}
        y={0}
        width={tableWidthPx}
        height={tableHeightPx}
        fill="#f1f3f5"
        stroke="#8a939c"
        strokeWidth={1.5}
        cornerRadius={2}
        listening={false}
      />
      {holes}
    </>
  );
};
