import React, { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  BeamPath,
  OpticalComponent,
  PropagationResult,
  SourceComponent,
  TargetMode,
} from '../../app/state/schema';

interface BeamProfileChartProps {
  source: SourceComponent | null;
  beamPath: BeamPath | null;
  propagationResult: PropagationResult | null;
  components: Record<string, OpticalComponent>;
  targetMode: TargetMode | null;
  hoveredZMm: number | null;
  onHoverZMm: (zMm: number | null) => void;
}

interface ProfilePoint {
  z: number;
  w: number;
}

function buildFallbackProfile(source: SourceComponent | null, beamPath: BeamPath | null): ProfilePoint[] {
  if (!beamPath || beamPath.segments.length === 0) {
    return [];
  }

  const radius = source ? Math.max(0.05, source.waistRadius) : 0.25;
  const points: ProfilePoint[] = [];

  points.push({ z: 0, w: radius });
  for (const segment of beamPath.segments) {
    points.push({ z: segment.zEnd, w: radius });
  }

  return points;
}

function nearestProfilePoint(profile: ProfilePoint[], zMm: number): ProfilePoint | null {
  if (profile.length === 0) {
    return null;
  }

  let nearest = profile[0];
  let nearestDistance = Math.abs(profile[0].z - zMm);

  for (let i = 1; i < profile.length; i += 1) {
    const candidate = profile[i];
    const distance = Math.abs(candidate.z - zMm);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }

  return nearest;
}

export const BeamProfileChart: React.FC<BeamProfileChartProps> = ({
  source,
  beamPath,
  propagationResult,
  components,
  targetMode,
  hoveredZMm,
  onHoverZMm,
}) => {
  const profileData =
    propagationResult && propagationResult.profile.length > 0
      ? propagationResult.profile
      : buildFallbackProfile(source, beamPath);

  const componentMarkers = useMemo(() => {
    if (!beamPath) {
      return [] as Array<{ z: number; label: string }>;
    }

    return beamPath.segments
      .filter((segment) => segment.terminatedByComponentId)
      .map((segment) => {
        const id = segment.terminatedByComponentId as string;
        return {
          z: segment.zEnd,
          label: components[id]?.label ?? id,
        };
      });
  }, [beamPath, components]);

  const targetGuides = useMemo(() => {
    if (!targetMode) {
      return { targetWaistMm: null as number | null, targetZMm: null as number | null, label: null as string | null };
    }

    if (targetMode.kind === 'manual') {
      return {
        targetWaistMm: targetMode.waistRadius,
        targetZMm: targetMode.waistZ,
        label: 'Manual target',
      };
    }

    const cavity = components[targetMode.cavityComponentId];
    if (!cavity || cavity.kind !== 'cavity_fp' || !beamPath) {
      return { targetWaistMm: null, targetZMm: null, label: null };
    }

    const cavityEncounter = beamPath.segments.find((segment) => segment.terminatedByComponentId === cavity.id);
    if (!cavityEncounter || !cavity.eigenmode) {
      return { targetWaistMm: null, targetZMm: null, label: null };
    }

    return {
      targetWaistMm: cavity.eigenmode.waistRadius,
      targetZMm: cavityEncounter.zEnd + cavity.eigenmode.waistPositionFromM1,
      label: `${cavity.label} target`,
    };
  }, [beamPath, components, targetMode]);

  if (profileData.length === 0) {
    return <div className="profile-placeholder">No beam profile data available.</div>;
  }

  const hoveredPoint = hoveredZMm !== null ? nearestProfilePoint(profileData, hoveredZMm) : null;

  return (
    <div className="profile-chart-shell">
      {hoveredPoint && (
        <div className="profile-hover-readout">
          z = {hoveredPoint.z.toFixed(1)} mm, w = {hoveredPoint.w.toFixed(4)} mm ({(hoveredPoint.w * 1000).toFixed(1)} um)
        </div>
      )}
      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer>
          <LineChart
            data={profileData}
            margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
            onMouseMove={(state: any) => {
              const z = typeof state?.activeLabel === 'number' ? state.activeLabel : null;
              onHoverZMm(z);
            }}
            onMouseLeave={() => onHoverZMm(null)}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#d5dde6" />
            <XAxis
              dataKey="z"
              type="number"
              domain={[0, 'dataMax']}
              tick={{ fontSize: 11, fill: '#55677a' }}
              label={{ value: 'z (mm)', position: 'insideBottomRight', offset: -5, fill: '#55677a' }}
            />
            <YAxis
              dataKey="w"
              type="number"
              domain={['auto', 'auto']}
              tick={{ fontSize: 11, fill: '#55677a' }}
              label={{ value: 'w (mm)', angle: -90, position: 'insideLeft', fill: '#55677a' }}
            />
            <Tooltip
              formatter={(value) => {
                const numeric = typeof value === 'number' ? value : Number(value);
                if (!Number.isFinite(numeric)) {
                  return String(value);
                }
                return `${numeric.toFixed(4)} mm (${(numeric * 1000).toFixed(1)} um)`;
              }}
              labelFormatter={(label) => {
                const numeric = typeof label === 'number' ? label : Number(label);
                return Number.isFinite(numeric) ? `z=${numeric.toFixed(2)} mm` : `z=${String(label)}`;
              }}
            />
            <Line
              dataKey="w"
              type="monotone"
              stroke="#ff6a2a"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />

            {componentMarkers.map((marker, index) => (
              <ReferenceLine
                key={`comp-marker-${index}`}
                x={marker.z}
                stroke="#8ca0b5"
                strokeDasharray="4 4"
                label={{ value: marker.label, position: 'insideTop', fill: '#4f6174', fontSize: 11 }}
              />
            ))}

            {targetGuides.targetWaistMm !== null && (
              <ReferenceLine
                y={targetGuides.targetWaistMm}
                stroke="#7a4dd8"
                strokeDasharray="6 4"
                label={{ value: targetGuides.label ?? 'Target', position: 'insideTopLeft', fill: '#6a49bd', fontSize: 11 }}
              />
            )}
            {targetGuides.targetZMm !== null && (
              <ReferenceLine x={targetGuides.targetZMm} stroke="#7a4dd8" strokeDasharray="6 4" />
            )}

            {hoveredPoint && (
              <>
                <ReferenceLine x={hoveredPoint.z} stroke="#2d9bf0" strokeDasharray="4 4" />
                <ReferenceDot x={hoveredPoint.z} y={hoveredPoint.w} r={4} fill="#2d9bf0" stroke="#ffffff" />
              </>
            )}

            {propagationResult?.waists.map((waist, index) => (
              <ReferenceDot
                key={`waist-${index}`}
                x={waist.z}
                y={waist.w}
                r={4}
                fill="#2d9bf0"
                stroke="#ffffff"
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
