import React, { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
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
  showTargetProfile: boolean;
}

interface ProfilePoint {
  z: number;
  w: number;
  targetW?: number;
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

function nearestProfilePoint(profile: Array<{ z: number; w: number }>, zMm: number) {
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

function beamRadiusFromWaist(waistRadiusMm: number, waistZMm: number, zMm: number, wavelengthNm: number) {
  const wavelengthMm = wavelengthNm * 1e-6;
  const zR = (Math.PI * waistRadiusMm * waistRadiusMm) / wavelengthMm;
  return waistRadiusMm * Math.sqrt(1 + ((zMm - waistZMm) / zR) ** 2);
}

function formatBeamRadius(radiusMm: number) {
  const radiusUm = radiusMm * 1000;
  if (radiusUm < 1000) {
    return `${radiusUm.toFixed(1)} um`;
  }
  return `${radiusMm.toFixed(4)} mm`;
}

export const BeamProfileChart: React.FC<BeamProfileChartProps> = ({
  source,
  beamPath,
  propagationResult,
  components,
  targetMode,
  hoveredZMm,
  onHoverZMm,
  showTargetProfile,
}) => {
  const baseProfile: ProfilePoint[] =
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

  const target = useMemo(() => {
    if (!targetMode || !source) {
      return null as null | { waistRadiusMm: number; waistZMm: number; label: string };
    }

    if (targetMode.kind === 'manual') {
      return {
        waistRadiusMm: targetMode.waistRadius,
        waistZMm: targetMode.waistZ,
        label: 'Manual target',
      };
    }

    const cavity = components[targetMode.cavityComponentId];
    if (!cavity || cavity.kind !== 'cavity_fp' || !cavity.eigenmode || !beamPath) {
      return null;
    }

    const encounter = beamPath.segments.find((segment) => segment.terminatedByComponentId === cavity.id);
    if (!encounter) {
      return null;
    }

    return {
      waistRadiusMm: cavity.eigenmode.waistRadius,
      waistZMm: encounter.zEnd + cavity.eigenmode.waistPositionFromM1,
      label: `${cavity.label} target`,
    };
  }, [beamPath, components, source, targetMode]);

  const profileData = useMemo<ProfilePoint[]>(() => {
    if (!showTargetProfile || !target || !source) {
      return baseProfile;
    }

    return baseProfile.map((point) => ({
      ...point,
      targetW: beamRadiusFromWaist(target.waistRadiusMm, target.waistZMm, point.z, source.wavelength),
    }));
  }, [baseProfile, showTargetProfile, source, target]);

  const [autoScaleY, setAutoScaleY] = useState(true);
  const [lockedYMaxMm, setLockedYMaxMm] = useState(1);

  if (profileData.length === 0) {
    return <div className="profile-placeholder">No beam profile data available.</div>;
  }

  const profileMaxMm = profileData.reduce((maxValue, point) => {
    const pointMax = Math.max(point.w, point.targetW ?? 0);
    return Math.max(maxValue, pointMax);
  }, 0);
  const effectiveYMaxMm = Math.max(autoScaleY ? profileMaxMm : lockedYMaxMm, 0.001);
  const useMicronAxis = effectiveYMaxMm * 1000 <= 3000;
  const axisScale = useMicronAxis ? 1000 : 1;
  const axisUnitLabel = useMicronAxis ? 'um' : 'mm';
  const chartData = profileData.map((point) => ({
    ...point,
    wAxis: point.w * axisScale,
    targetWAxis: point.targetW === undefined ? undefined : point.targetW * axisScale,
  }));

  useEffect(() => {
    if (autoScaleY) {
      setLockedYMaxMm(profileMaxMm);
    }
  }, [autoScaleY, profileMaxMm]);

  const hoveredPoint = hoveredZMm !== null ? nearestProfilePoint(profileData, hoveredZMm) : null;
  const hoveredPointAxisY = hoveredPoint ? hoveredPoint.w * axisScale : null;

  return (
    <div className="profile-chart-shell">
      <div className="profile-chart-toolbar">
        <label className="profile-toggle">
          <span>Auto-scale Y</span>
          <input
            type="checkbox"
            checked={autoScaleY}
            onChange={(event) => {
              const checked = event.target.checked;
              if (!checked) {
                setLockedYMaxMm(profileMaxMm);
              }
              setAutoScaleY(checked);
            }}
          />
        </label>
      </div>
      <div className="profile-chart-frame">
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <LineChart
              data={chartData}
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
                dataKey="wAxis"
                type="number"
                domain={[0, effectiveYMaxMm * axisScale]}
                tick={{ fontSize: 11, fill: '#55677a' }}
                label={{ value: `w (${axisUnitLabel})`, angle: -90, position: 'insideLeft', fill: '#55677a' }}
              />
              <Line
                dataKey="wAxis"
                type="monotone"
                stroke="#ff6a2a"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />

              {showTargetProfile && target && (
                <Line
                  dataKey="targetWAxis"
                  type="monotone"
                  stroke="#6f52d9"
                  strokeWidth={1.8}
                  dot={false}
                  strokeDasharray="7 5"
                  isAnimationActive={false}
                />
              )}

              {componentMarkers.map((marker, index) => (
                <ReferenceLine
                  key={`component-${index}`}
                  x={marker.z}
                  stroke="#8ca0b5"
                  strokeDasharray="4 4"
                  label={{ value: marker.label, position: 'insideTop', fill: '#4f6174', fontSize: 11 }}
                />
              ))}

              {hoveredPoint && (
                <>
                  <ReferenceLine x={hoveredPoint.z} stroke="#2d9bf0" />
                  <ReferenceDot x={hoveredPoint.z} y={hoveredPointAxisY ?? 0} r={4} fill="#2d9bf0" stroke="#ffffff" />
                </>
              )}

              {propagationResult?.waists.map((waist, index) => (
                <ReferenceDot
                  key={`waist-${index}`}
                  x={waist.z}
                  y={waist.w * axisScale}
                  r={4}
                  fill="#2d9bf0"
                  stroke="#ffffff"
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {hoveredPoint && (
          <div className="profile-hover-card">
            <strong>{formatBeamRadius(hoveredPoint.w)}</strong>
            <span>z = {hoveredPoint.z.toFixed(1)} mm</span>
          </div>
        )}
      </div>
    </div>
  );
};
