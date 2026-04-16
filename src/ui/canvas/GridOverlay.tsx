/**
 * Grid Overlay: Draws grid pattern on canvas for visual reference
 */

import React from 'react';
import { Line } from 'react-konva';
import type { TableConfig } from '../../app/state/schema';

interface GridOverlayProps {
  config: TableConfig;
  mmToPx: (mm: number) => number;
}

export const GridOverlay: React.FC<GridOverlayProps> = ({ config, mmToPx }) => {
  // Grid spacing in mm: 10mm for metric
  const gridSpacingMm = config.gridStandard === 'metric' ? 10 : 25.4;
  const gridSpacingPx = mmToPx(gridSpacingMm);

  const verticalLines: React.ReactNode[] = [];
  const horizontalLines: React.ReactNode[] = [];

  // Draw vertical lines
  for (let x = 0; x < config.width; x += gridSpacingPx) {
    verticalLines.push(
      <Line
        key={`vline-${x}`}
        points={[x, 0, x, config.height]}
        stroke="#e0e0e0"
        strokeWidth={1}
        opacity={0.5}
      />
    );
  }

  // Draw horizontal lines
  for (let y = 0; y < config.height; y += gridSpacingPx) {
    horizontalLines.push(
      <Line
        key={`hline-${y}`}
        points={[0, y, config.width, y]}
        stroke="#e0e0e0"
        strokeWidth={1}
        opacity={0.5}
      />
    );
  }

  return (
    <>
      {verticalLines}
      {horizontalLines}
    </>
  );
};
