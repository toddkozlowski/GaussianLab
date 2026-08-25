/**
 * WaistMarkersOverlay: when Settings > "Show waists" is on, marks every
 * beam-waist location reported by the propagation engine (source waist,
 * post-lens refocusing, cavity eigenmode waists, etc.) with two small
 * inward-pointing triangles bracketing the beam, plus a "w0 = ..." label.
 */

import React from 'react';
import { Line, Text } from 'react-konva';
import type { BeamPath, CardinalDirection, Point2d, PropagationResult } from '../../app/state/schema';
import { useTheme } from '../../app/adapters/useTheme';
import { getCanvasColors } from './canvasTheme';

interface WaistMarkersOverlayProps {
  beamPath: BeamPath | null;
  propagationResult: PropagationResult | null;
  mmToPx: (mm: number) => number;
}

// Matches the DIRECTION_UNIT convention used throughout the canvas renderers
// (e.g. SourceRenderer.tsx): the unit vector a beam travels along per
// cardinal direction, in canvas coordinate space (x right, y down).
const DIRECTION_UNIT: Record<CardinalDirection, Point2d> = {
  right: { x: 1, y: 0 },
  left: { x: -1, y: 0 },
  down: { x: 0, y: 1 },
  up: { x: 0, y: -1 },
};

// All in screen pixels (not mm) - fixed-size indicator glyphs, like the
// existing hover/waist dot markers elsewhere on the canvas, rather than
// physical geometry that should scale with the table.
const TIP_GAP_PX = 2;
const TRIANGLE_HEIGHT_PX = 8;
const TRIANGLE_HALF_WIDTH_PX = 5;
const LABEL_OFFSET_X_PX = 9;
const LABEL_OFFSET_Y_PX = -14;

export const WaistMarkersOverlay: React.FC<WaistMarkersOverlayProps> = ({
  beamPath,
  propagationResult,
  mmToPx,
}) => {
  const { theme } = useTheme();
  const colors = getCanvasColors(theme);

  if (!beamPath || !beamPath.isValid || !propagationResult) {
    return null;
  }

  return (
    <>
      {propagationResult.waists.map((waist, index) => {
        const segment = beamPath.segments.find((s) => waist.z >= s.zStart && waist.z <= s.zEnd);
        if (!segment) {
          return null;
        }

        const segmentLength = Math.max(1e-6, segment.zEnd - segment.zStart);
        const t = Math.min(1, Math.max(0, (waist.z - segment.zStart) / segmentLength));
        const xMm = segment.start.x + (segment.end.x - segment.start.x) * t;
        const yMm = segment.start.y + (segment.end.y - segment.start.y) * t;
        const px = mmToPx(xMm);
        const py = mmToPx(yMm);

        const dir = DIRECTION_UNIT[segment.direction];
        const perp: Point2d = { x: -dir.y, y: dir.x };

        // A triangle on each side of the beam, apex pointing in toward the
        // axis (sign flips which side: +1/-1 along perp).
        const trianglePoints = (sign: 1 | -1): number[] => {
          const apexX = px + perp.x * sign * TIP_GAP_PX;
          const apexY = py + perp.y * sign * TIP_GAP_PX;
          const baseCx = px + perp.x * sign * (TIP_GAP_PX + TRIANGLE_HEIGHT_PX);
          const baseCy = py + perp.y * sign * (TIP_GAP_PX + TRIANGLE_HEIGHT_PX);
          return [
            apexX, apexY,
            baseCx + dir.x * TRIANGLE_HALF_WIDTH_PX, baseCy + dir.y * TRIANGLE_HALF_WIDTH_PX,
            baseCx - dir.x * TRIANGLE_HALF_WIDTH_PX, baseCy - dir.y * TRIANGLE_HALF_WIDTH_PX,
          ];
        };

        return (
          <React.Fragment key={`waist-marker-${index}-${waist.componentId ?? 'free'}`}>
            <Line points={trianglePoints(1)} closed fill="#000000" stroke="#ffffff" strokeWidth={1} listening={false} />
            <Line points={trianglePoints(-1)} closed fill="#000000" stroke="#ffffff" strokeWidth={1} listening={false} />
            <Text
              x={px + LABEL_OFFSET_X_PX}
              y={py + LABEL_OFFSET_Y_PX}
              text={formatWaistLabel(waist.w)}
              fontSize={10}
              fill={colors.labelSecondary}
              listening={false}
            />
          </React.Fragment>
        );
      })}
    </>
  );
};

function formatWaistLabel(radiusMm: number): string {
  const radiusUm = radiusMm * 1000;
  if (radiusUm < 1000) {
    return `w₀ = ${radiusUm.toFixed(1)} um`;
  }
  return `w₀ = ${radiusMm.toFixed(4)} mm`;
}
