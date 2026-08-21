/**
 * Grid Overlay: Draws optical table area, border, and mounting holes.
 */

import React from 'react';
import { Circle, Rect } from 'react-konva';
import type { TableConfig } from '../../app/state/schema';
import { gridSpacingMm } from '../../app/state/snapToGrid';
import { useTheme } from '../../app/adapters/useTheme';
import type { Theme } from '../../app/theme';

interface GridOverlayProps {
  config: TableConfig;
  mmToPx: (mm: number) => number;
}

// Konva draws to a <canvas> bitmap, not the DOM, so this can't pick up CSS
// custom properties like the rest of the app's theming. Dark mode dims the
// table surface (it's a bright white rect otherwise) while staying clearly
// lighter than the .table-canvas-shell backdrop around it (#3b4249), and the
// mounting holes flip from dark dots to light ones to stay visible against
// it. Component renderer colors (labels, neutral outlines) key off the same
// theme via canvasTheme.ts.
const TABLE_SURFACE: Record<Theme, { fill: string; stroke: string; hole: string }> = {
  light: { fill: '#f1f3f5', stroke: '#8a939c', hole: 'rgba(58, 66, 74, 0.45)' },
  dark: { fill: '#565f6b', stroke: '#828d99', hole: 'rgba(226, 232, 240, 0.4)' },
};

export const GridOverlay: React.FC<GridOverlayProps> = ({ config, mmToPx }) => {
  const { theme } = useTheme();
  const surface = TABLE_SURFACE[theme];
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
          fill={surface.hole}
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
        fill={surface.fill}
        stroke={surface.stroke}
        strokeWidth={1.5}
        cornerRadius={2}
        listening={false}
      />
      {holes}
    </>
  );
};
