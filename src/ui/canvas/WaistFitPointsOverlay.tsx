/**
 * WaistFitPointsOverlay: when the Waist Fit panel's "Show on beam path"
 * toggle is on, marks every fully-entered (z, waist radius) sample from
 * that panel with a small dot at its projected position on the beam axis -
 * a companion to the same dots drawn on the unfolded beam profile chart.
 */

import React from 'react';
import { Circle } from 'react-konva';
import type { BeamPath, WaistFitPoint } from '../../app/state/schema';
import { pointOnBeamPathAtZ } from '../../app/state/pathUtils';

interface WaistFitPointsOverlayProps {
  beamPath: BeamPath | null;
  points: WaistFitPoint[];
  mmToPx: (mm: number) => number;
}

const DOT_RADIUS_PX = 4;
const DOT_COLOR = '#16a34a';

export const WaistFitPointsOverlay: React.FC<WaistFitPointsOverlayProps> = ({ beamPath, points, mmToPx }) => {
  if (!beamPath || !beamPath.isValid) {
    return null;
  }

  return (
    <>
      {points.map((point) => {
        if (point.zMm === null || point.waistRadiusMm === null) {
          return null;
        }
        const position = pointOnBeamPathAtZ(beamPath, point.zMm);
        if (!position) {
          return null;
        }
        return (
          <Circle
            key={point.id}
            x={mmToPx(position.x)}
            y={mmToPx(position.y)}
            radius={DOT_RADIUS_PX}
            fill={DOT_COLOR}
            stroke="#ffffff"
            strokeWidth={1.5}
            listening={false}
          />
        );
      })}
    </>
  );
};
