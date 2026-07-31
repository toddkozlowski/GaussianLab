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
import { handleCaretStepKeyDown } from '../shared/numericCaretStep';
import lockIcon from '../../../icons/lock.svg';
import lockOpenIcon from '../../../icons/lock-open.svg';

interface BeamProfileChartProps {
  source: SourceComponent | null;
  beamPath: BeamPath | null;
  propagationResult: PropagationResult | null;
  components: Record<string, OpticalComponent>;
  targetMode: TargetMode | null;
  hoveredZMm: number | null;
  onHoverZMm: (zMm: number | null) => void;
  liveOverlap: number | null;
  onMoveLensAlongPath: (lensId: string, zMm: number) => void;
}

interface ProfilePoint {
  z: number;
  w: number;
  [projectionKey: string]: number;
}

interface ModeProjection {
  id: string;
  label: string;
  w0Mm: number;
  z0Mm: number;
  isSelected: boolean;
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

function formatAxisMax(value: number): string {
  if (!Number.isFinite(value)) {
    return '';
  }
  if (value >= 100) {
    return value.toFixed(0);
  }
  if (value >= 10) {
    return value.toFixed(1);
  }
  return value.toFixed(2);
}

export const BeamProfileChart: React.FC<BeamProfileChartProps> = ({
  source,
  beamPath,
  propagationResult,
  components,
  targetMode,
  hoveredZMm,
  onHoverZMm,
  liveOverlap,
  onMoveLensAlongPath,
}) => {
  const frameRef = React.useRef<HTMLDivElement>(null);
  const [draggingLensId, setDraggingLensId] = useState<string | null>(null);

  const baseProfile: ProfilePoint[] =
    propagationResult && propagationResult.profile.length > 0
      ? propagationResult.profile
      : buildFallbackProfile(source, beamPath);

  const componentMarkers = useMemo(() => {
    if (!beamPath) {
      return [] as Array<{ z: number; label: string }>;
    }

    // Cavities get their own dedicated in/out/waist markers (see
    // cavityMarkers below) instead of a single generic label.
    return beamPath.segments
      .filter((segment) => {
        if (!segment.terminatedByComponentId) {
          return false;
        }
        return components[segment.terminatedByComponentId]?.kind !== 'cavity_fp';
      })
      .map((segment) => {
        const id = segment.terminatedByComponentId as string;
        return {
          z: segment.zEnd,
          label: components[id]?.label ?? id,
        };
      });
  }, [beamPath, components]);

  const cavityMarkers = useMemo(() => {
    if (!beamPath) {
      return [] as Array<{ z: number; label: string; kind: 'mirror' | 'waist' }>;
    }

    const markers: Array<{ z: number; label: string; kind: 'mirror' | 'waist' }> = [];

    for (const segment of beamPath.segments) {
      const id = segment.terminatedByComponentId;
      if (!id) {
        continue;
      }

      const component = components[id];
      if (!component || component.kind !== 'cavity_fp') {
        continue;
      }

      // component.position anchors the input mirror (M1); the output
      // mirror (M2) sits `length` further downstream.
      const m1ZMm = segment.zEnd;
      const m2ZMm = m1ZMm + component.length;

      markers.push({ z: m1ZMm, label: `${component.label}_in`, kind: 'mirror' });
      markers.push({ z: m2ZMm, label: `${component.label}_out`, kind: 'mirror' });

      if (component.eigenmode) {
        markers.push({
          z: m1ZMm + component.eigenmode.waistPositionFromM1,
          label: `${component.label}_waist`,
          kind: 'waist',
        });
      }
    }

    return markers;
  }, [beamPath, components]);

  const cavityOverlapMarkers = useMemo(() => {
    if (!beamPath || !propagationResult) {
      return [] as Array<{ z: number; label: string; good: boolean }>;
    }

    const markers: Array<{ z: number; label: string; good: boolean }> = [];

    for (const segment of beamPath.segments) {
      const id = segment.terminatedByComponentId;
      if (!id) {
        continue;
      }

      const component = components[id];
      if (!component || component.kind !== 'cavity_fp') {
        continue;
      }

      const overlap = propagationResult.cavityOverlap[id];
      if (typeof overlap !== 'number') {
        continue;
      }

      markers.push({
        z: segment.zEnd,
        label: `${(overlap * 100).toFixed(1)}%`,
        good: overlap >= 0.5,
      });
    }

    return markers;
  }, [beamPath, components, propagationResult]);

  const lensMarkers = useMemo(() => {
    if (!beamPath) {
      return [] as Array<{ id: string; label: string; z: number }>;
    }

    return beamPath.segments
      .filter((segment) => {
        if (!segment.terminatedByComponentId) {
          return false;
        }
        return components[segment.terminatedByComponentId]?.kind === 'lens_thin';
      })
      .map((segment) => {
        const id = segment.terminatedByComponentId as string;
        return {
          id,
          z: segment.zEnd,
          label: components[id]?.label ?? id,
        };
      });
  }, [beamPath, components]);

  // Cavities and targets can each opt in to showing their Gaussian mode
  // projected across the whole unfolded path (not just where the real beam
  // actually follows it), via their own showProjection toggle.
  const projections = useMemo(() => {
    if (!beamPath) {
      return [] as ModeProjection[];
    }

    const list: ModeProjection[] = [];

    for (const segment of beamPath.segments) {
      const id = segment.terminatedByComponentId;
      if (!id) {
        continue;
      }

      const component = components[id];
      if (!component) {
        continue;
      }

      if (component.kind === 'cavity_fp') {
        if (!component.showProjection || !component.eigenmode) {
          continue;
        }

        // component.position anchors the input mirror (M1).
        const m1ZMm = segment.zEnd;
        list.push({
          id,
          label: `${component.label} eigenmode`,
          w0Mm: component.eigenmode.waistRadius,
          z0Mm: m1ZMm + component.eigenmode.waistPositionFromM1,
          isSelected: targetMode?.kind === 'cavity' && targetMode.cavityComponentId === id,
        });
      } else if (component.kind === 'target') {
        if (!component.showProjection) {
          continue;
        }

        list.push({
          id,
          label: `${component.label} target`,
          w0Mm: component.waistRadius,
          z0Mm: segment.zEnd,
          isSelected: targetMode?.kind === 'target' && targetMode.targetComponentId === id,
        });
      }
    }

    return list;
  }, [beamPath, components, targetMode]);

  // Target objects always show a marker at their own desired waist size,
  // independent of whether their full mode projection is toggled on.
  const targetWaistMarkers = useMemo(() => {
    if (!beamPath) {
      return [] as Array<{ z: number; w: number }>;
    }

    const markers: Array<{ z: number; w: number }> = [];
    for (const segment of beamPath.segments) {
      const id = segment.terminatedByComponentId;
      if (!id) {
        continue;
      }

      const component = components[id];
      if (!component || component.kind !== 'target') {
        continue;
      }

      markers.push({ z: segment.zEnd, w: component.waistRadius });
    }

    return markers;
  }, [beamPath, components]);

  const profileData = useMemo<ProfilePoint[]>(() => {
    if (projections.length === 0 || !source) {
      return baseProfile;
    }

    return baseProfile.map((point) => {
      const extended: ProfilePoint = { ...point };
      for (const projection of projections) {
        extended[`proj_${projection.id}`] = beamRadiusFromWaist(
          projection.w0Mm,
          projection.z0Mm,
          point.z,
          source.wavelength,
        );
      }
      return extended;
    });
  }, [baseProfile, projections, source]);

  const [lockYAxis, setLockYAxis] = useState(false);
  const [lockedYMaxMm, setLockedYMaxMm] = useState(1);
  const [lockXAxis, setLockXAxis] = useState(false);
  const [lockedXMaxMm, setLockedXMaxMm] = useState(1);

  const profileMaxMm = profileData.reduce((maxValue, point) => {
    let pointMax = point.w;
    for (const projection of projections) {
      const value = point[`proj_${projection.id}`];
      if (typeof value === 'number') {
        pointMax = Math.max(pointMax, value);
      }
    }
    return Math.max(maxValue, pointMax);
  }, targetWaistMarkers.reduce((max, marker) => Math.max(max, marker.w), 0));
  const dataXMaxMm = profileData[profileData.length - 1]?.z ?? 0;
  const effectiveYMaxMm = Math.max(lockYAxis ? lockedYMaxMm : profileMaxMm, 0.001);
  const effectiveXMaxMm = Math.max(lockXAxis ? lockedXMaxMm : dataXMaxMm, 0.001);
  const useMicronAxis = effectiveYMaxMm * 1000 <= 3000;
  const axisScale = useMicronAxis ? 1000 : 1;
  const axisUnitLabel = useMicronAxis ? 'um' : 'mm';
  const roundedYAxisMax = Math.max(1, Math.ceil(effectiveYMaxMm * axisScale));
  const roundedXAxisMax = Math.max(1, Math.ceil(effectiveXMaxMm));
  const chartData = profileData.map((point) => {
    const scaled: Record<string, number> = { z: point.z, wAxis: point.w * axisScale };
    for (const projection of projections) {
      const value = point[`proj_${projection.id}`];
      if (typeof value === 'number') {
        scaled[`proj_${projection.id}Axis`] = value * axisScale;
      }
    }
    return scaled;
  });

  // Nothing affects the displayed range while an axis is locked - the
  // locked value only tracks the live auto-computed max while unlocked, so
  // unlocking always resumes from the current data instead of a stale one.
  useEffect(() => {
    if (!lockYAxis) {
      setLockedYMaxMm(profileMaxMm);
    }
  }, [lockYAxis, profileMaxMm]);

  useEffect(() => {
    if (!lockXAxis) {
      setLockedXMaxMm(dataXMaxMm);
    }
  }, [lockXAxis, dataXMaxMm]);

  const hoveredPoint = hoveredZMm !== null ? nearestProfilePoint(profileData, hoveredZMm) : null;
  const hoveredPointAxisY = hoveredPoint ? hoveredPoint.w * axisScale : null;

  if (profileData.length === 0) {
    return <div className="profile-placeholder">No beam profile data available.</div>;
  }

  return (
    <div className="profile-chart-shell">
      <div className="profile-chart-toolbar">
        <div className="profile-axis-control">
          <button
            type="button"
            className="icon-button"
            aria-label={lockXAxis ? 'Unlock X axis range' : 'Lock X axis range'}
            onClick={() => setLockXAxis((locked) => !locked)}
          >
            <img className="icon-glyph" src={lockXAxis ? lockIcon : lockOpenIcon} alt="" />
          </button>
          <label className="profile-axis-max-field">
            <span>X max (mm)</span>
            <input
              type="text"
              inputMode="decimal"
              className="profile-axis-max-input"
              value={formatAxisMax(effectiveXMaxMm)}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value) && value > 0) {
                  setLockedXMaxMm(value);
                  setLockXAxis(true);
                }
              }}
              onKeyDown={(event) =>
                handleCaretStepKeyDown(event, (value) => {
                  if (value > 0) {
                    setLockedXMaxMm(value);
                    setLockXAxis(true);
                  }
                })
              }
            />
          </label>
        </div>
        <div className="profile-axis-control">
          <button
            type="button"
            className="icon-button"
            aria-label={lockYAxis ? 'Unlock Y axis range' : 'Lock Y axis range'}
            onClick={() => setLockYAxis((locked) => !locked)}
          >
            <img className="icon-glyph" src={lockYAxis ? lockIcon : lockOpenIcon} alt="" />
          </button>
          <label className="profile-axis-max-field">
            <span>Y max ({axisUnitLabel})</span>
            <input
              type="text"
              inputMode="decimal"
              className="profile-axis-max-input"
              value={formatAxisMax(effectiveYMaxMm * axisScale)}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value) && value > 0) {
                  setLockedYMaxMm(value / axisScale);
                  setLockYAxis(true);
                }
              }}
              onKeyDown={(event) =>
                handleCaretStepKeyDown(event, (value) => {
                  if (value > 0) {
                    setLockedYMaxMm(value / axisScale);
                    setLockYAxis(true);
                  }
                })
              }
            />
          </label>
        </div>
      </div>
      <div className="profile-chart-frame" ref={frameRef}>
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <LineChart
              data={chartData}
              margin={{ top: 22, right: 16, bottom: 8, left: 8 }}
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
                domain={[0, roundedXAxisMax]}
                allowDataOverflow
                tick={{ fontSize: 11, fill: '#55677a' }}
                label={{ value: 'z (mm)', position: 'insideBottomRight', offset: -5, fill: '#55677a' }}
              />
              <YAxis
                dataKey="wAxis"
                type="number"
                domain={[0, roundedYAxisMax]}
                allowDataOverflow
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

              {projections.map((projection) => (
                <Line
                  key={`proj-line-${projection.id}`}
                  dataKey={`proj_${projection.id}Axis`}
                  type="monotone"
                  stroke={projection.isSelected ? '#6f52d9' : '#8ca0b5'}
                  strokeWidth={projection.isSelected ? 1.8 : 1.3}
                  dot={false}
                  strokeDasharray={projection.isSelected ? '7 5' : '4 4'}
                  isAnimationActive={false}
                />
              ))}

              {componentMarkers.map((marker, index) => (
                <ReferenceLine
                  key={`component-${index}`}
                  x={marker.z}
                  stroke="#8ca0b5"
                  strokeDasharray="4 4"
                  label={{ value: marker.label, position: 'insideTop', fill: '#4f6174', fontSize: 11 }}
                />
              ))}

              {cavityMarkers.map((marker, index) => (
                <ReferenceLine
                  key={`cavity-${index}`}
                  x={marker.z}
                  stroke={marker.kind === 'waist' ? '#2d9bf0' : '#9013fe'}
                  strokeDasharray={marker.kind === 'waist' ? '2 3' : '4 4'}
                  label={{
                    value: marker.label,
                    position: marker.kind === 'waist' ? 'insideBottom' : 'insideTop',
                    fill: marker.kind === 'waist' ? '#2d9bf0' : '#6b1fc9',
                    fontSize: 11,
                  }}
                />
              ))}

              {cavityOverlapMarkers.map((marker, index) => (
                <ReferenceLine
                  key={`cavity-overlap-${index}`}
                  x={marker.z}
                  stroke="transparent"
                  label={{
                    value: `mode match ${marker.label}`,
                    position: 'top',
                    fill: marker.good ? '#1a7f37' : '#c0392b',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
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

              {targetWaistMarkers.map((marker, index) => (
                <ReferenceDot
                  key={`target-waist-${index}`}
                  x={marker.z}
                  y={marker.w * axisScale}
                  r={5}
                  fill="#17A2B8"
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {lensMarkers.map((marker) => {
          // Position against the axis's actual rendered domain, not the raw
          // data max, so markers stay aligned with the curve when the X
          // axis is locked to a different range.
          const zMax = roundedXAxisMax;
          const leftPercent = zMax > 0 ? (marker.z / zMax) * 100 : 0;
          return (
            <button
              key={marker.id}
              type="button"
              className={`profile-lens-marker${draggingLensId === marker.id ? ' dragging' : ''}`}
              style={{ left: `${Math.max(0, Math.min(100, leftPercent))}%` }}
              title={`Drag ${marker.label} along path`}
              onPointerDown={(event) => {
                const frame = frameRef.current;
                if (!frame) {
                  return;
                }

                event.preventDefault();
                setDraggingLensId(marker.id);
                event.currentTarget.setPointerCapture(event.pointerId);

                const updateFromClientX = (clientX: number) => {
                  const rect = frame.getBoundingClientRect();
                  if (rect.width <= 0) {
                    return;
                  }
                  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
                  onMoveLensAlongPath(marker.id, ratio * roundedXAxisMax);
                };

                updateFromClientX(event.clientX);

                const onMove = (moveEvent: PointerEvent) => updateFromClientX(moveEvent.clientX);
                const onUp = () => {
                  window.removeEventListener('pointermove', onMove);
                  window.removeEventListener('pointerup', onUp);
                  setDraggingLensId((active) => (active === marker.id ? null : active));
                };

                window.addEventListener('pointermove', onMove);
                window.addEventListener('pointerup', onUp);
              }}
            >
              <span>{marker.label}</span>
            </button>
          );
        })}

        {hoveredPoint && (
          <div className="profile-hover-card">
            <strong>{formatBeamRadius(hoveredPoint.w)}</strong>
            <span>z = {hoveredPoint.z.toFixed(1)} mm</span>
          </div>
        )}

        {liveOverlap !== null && (
          <div className="profile-overlap-chip">
            <strong>Overlap</strong>
            <span>{(liveOverlap * 100).toFixed(1)}%</span>
          </div>
        )}
      </div>
    </div>
  );
};
