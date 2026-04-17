import React from 'react';
import { Circle, Line } from 'react-konva';
import type {
  BeamPath,
  PropagationResult,
  SourceComponent,
} from '../../app/state/schema';

interface BeamCorridorOverlayProps {
  beamPath: BeamPath | null;
  source: SourceComponent | null;
  propagationResult: PropagationResult | null;
  mmToPx: (mm: number) => number;
  hoveredZMm?: number | null;
}

function sourceBeamRadiusMm(source: SourceComponent | null): number {
  if (!source) {
    return 0.25;
  }
  return Math.max(0.05, source.waistRadius);
}

function profileRadiusAtZMm(
  propagationResult: PropagationResult | null,
  zMm: number,
  fallbackRadiusMm: number
): number {
  if (!propagationResult || propagationResult.profile.length === 0) {
    return fallbackRadiusMm;
  }

  let nearest = propagationResult.profile[0];
  let nearestDz = Math.abs(nearest.z - zMm);

  for (let i = 1; i < propagationResult.profile.length; i += 1) {
    const p = propagationResult.profile[i];
    const dz = Math.abs(p.z - zMm);
    if (dz < nearestDz) {
      nearest = p;
      nearestDz = dz;
    }
  }

  return Math.max(0.05, nearest.w);
}

export const BeamCorridorOverlay: React.FC<BeamCorridorOverlayProps> = ({
  beamPath,
  source,
  propagationResult,
  mmToPx,
  hoveredZMm,
}) => {
  if (!beamPath || beamPath.segments.length === 0 || !beamPath.isValid) {
    return null;
  }

  const firstSegment = beamPath.segments[0];
  const centerPoints: number[] = [mmToPx(firstSegment.start.x), mmToPx(firstSegment.start.y)];

  for (const segment of beamPath.segments) {
    centerPoints.push(mmToPx(segment.end.x), mmToPx(segment.end.y));
  }

  const fallbackRadiusMm = sourceBeamRadiusMm(source);
  const corridorWidthPx = Math.max(
    4,
    mmToPx(profileRadiusAtZMm(propagationResult, firstSegment.zStart, fallbackRadiusMm) * 2)
  );

  return (
    <>
      <Line
        points={centerPoints}
        stroke="rgba(255, 139, 61, 0.35)"
        strokeWidth={corridorWidthPx}
        lineCap="round"
        lineJoin="round"
        listening={false}
      />
      <Line
        points={centerPoints}
        stroke="#ff6a2a"
        strokeWidth={2}
        lineCap="round"
        lineJoin="round"
        listening={false}
      />

      {propagationResult?.waists.map((waist, index) => {
        const segment = beamPath.segments.find((s) => waist.z >= s.zStart && waist.z <= s.zEnd);
        if (!segment) {
          return null;
        }

        const segmentLength = Math.max(1e-6, segment.zEnd - segment.zStart);
        const t = Math.min(1, Math.max(0, (waist.z - segment.zStart) / segmentLength));
        const x = segment.start.x + (segment.end.x - segment.start.x) * t;
        const y = segment.start.y + (segment.end.y - segment.start.y) * t;

        return (
          <Circle
            key={`waist-${index}`}
            x={mmToPx(x)}
            y={mmToPx(y)}
            radius={4}
            fill="#2d9bf0"
            stroke="#ffffff"
            strokeWidth={1.5}
            listening={false}
          />
        );
      })}

      {typeof hoveredZMm === 'number' && (() => {
        const hoveredPoint = pointAlongPathAtZ(beamPath, hoveredZMm);
        if (!hoveredPoint) {
          return null;
        }

        return (
          <Circle
            x={mmToPx(hoveredPoint.x)}
            y={mmToPx(hoveredPoint.y)}
            radius={5}
            fill="#2d9bf0"
            stroke="#ffffff"
            strokeWidth={1.5}
            listening={false}
          />
        );
      })()}
    </>
  );
};

function pointAlongPathAtZ(beamPath: BeamPath, zMm: number): { x: number; y: number } | null {
  const segment = beamPath.segments.find((candidate) => zMm >= candidate.zStart && zMm <= candidate.zEnd);
  if (!segment) {
    return null;
  }

  const length = Math.max(1e-9, segment.zEnd - segment.zStart);
  const t = Math.max(0, Math.min(1, (zMm - segment.zStart) / length));
  return {
    x: segment.start.x + (segment.end.x - segment.start.x) * t,
    y: segment.start.y + (segment.end.y - segment.start.y) * t,
  };
}