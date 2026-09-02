import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
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
  WaistFitState,
} from '../../app/state/schema';
import { NumericField } from '../shared/NumericField';
import { FullscreenIcon, LockIcon, SearchIcon } from '../shared/icons';
import { beamWaistFromQ } from '../../app/state/modeMetrics';
import { calculateModeOverlapFromWaistParams } from '../../math/overlap';

interface BeamProfileChartProps {
  source: SourceComponent | null;
  beamPath: BeamPath | null;
  propagationResult: PropagationResult | null;
  components: Record<string, OpticalComponent>;
  targetMode: TargetMode | null;
  hoveredZMm: number | null;
  onHoverZMm: (zMm: number | null) => void;
  onMoveComponentAlongPath: (componentId: string, zMm: number) => void;
  waistFit: WaistFitState;
}

interface ProfilePoint {
  z: number;
  w: number;
  gouyPhaseDeg: number;
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
  points.push({ z: 0, w: radius, gouyPhaseDeg: 0 });
  for (const segment of beamPath.segments) {
    points.push({ z: segment.zEnd, w: radius, gouyPhaseDeg: 0 });
  }
  return points;
}

function nearestProfilePoint<T extends { z: number; w: number }>(profile: T[], zMm: number): T | null {
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

// Wraps an unwrapped phase in degrees into the principal value range (-180, 180].
function wrapPhaseDeg(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

function formatGouyPhaseDeg(deg: number): string {
  return `${deg.toFixed(1)} deg`;
}

/**
 * Recharts' built-in `position: 'insideRight'` + `angle: 90` combination anchors
 * rotated text by its edge rather than its center, so the label drifts well off
 * the vertical middle of the plot area for anything longer than a couple of
 * characters. Render it manually instead: text-anchor "middle" keeps it centered
 * along its (rotated) length around the axis viewbox's vertical midpoint.
 */
function renderGouyPhaseAxisLabel(props: any) {
  const viewBox = props?.viewBox;
  if (!viewBox) {
    return <g />;
  }
  const x = viewBox.x + viewBox.width - 6;
  const y = viewBox.y + viewBox.height / 2;
  return (
    <text x={x} y={y} textAnchor="middle" transform={`rotate(90, ${x}, ${y})`} fill="#6f52d9" fontSize={11}>
      Gouy phase (deg)
    </text>
  );
}

/**
 * The default 'insideBottomRight' position sits right at the axis line,
 * which collides with the editable X-max field overlaid just below it.
 * Render the title just under that field instead (still inside the
 * chart's own bottom margin) so the two never overlap.
 */
function renderXAxisLabel(props: any) {
  const viewBox = props?.viewBox;
  if (!viewBox) {
    return <g />;
  }
  const x = viewBox.x + viewBox.width;
  const y = viewBox.y + viewBox.height + 30;
  return (
    <text x={x} y={y} textAnchor="end" fontSize={11} fill="var(--chart-axis-text)">
      z (mm)
    </text>
  );
}

/**
 * A component's position label, rendered just above the plotted region
 * (rather than inside it) so the dashed reference line marking that
 * component's z-position never overlaps/crosses the label text - unless
 * `placeBelow` is set, when it renders just inside the plot's top edge
 * instead, for the rare label that would otherwise land underneath the
 * Gouy-phase toggle pinned above the plot's top-right corner.
 */
function renderMarkerLabel(labelText: string, color: string, fontWeight = 400, placeBelow = false) {
  return (props: any) => {
    const viewBox = props?.viewBox;
    if (!viewBox) {
      return <g />;
    }
    const x = viewBox.x + (viewBox.width ?? 0) / 2;
    const y = placeBelow ? viewBox.y + 14 : viewBox.y - 8;
    return (
      <text x={x} y={y} textAnchor="middle" fontSize={11} fontWeight={fontWeight} fill={color}>
        {labelText}
      </text>
    );
  };
}

// Overlap fraction (0-1) -> the CSS variable naming its color tier.
function overlapColorVar(overlap: number): string {
  if (overlap > 0.75) {
    return 'var(--overlap-good)';
  }
  if (overlap >= 0.5) {
    return 'var(--overlap-mid)';
  }
  return 'var(--overlap-bad)';
}

function formatAxisMax(value: number): string {
  if (!Number.isFinite(value)) {
    return '';
  }
  if (value === 0) {
    return '0';
  }
  if (value >= 100) {
    return value.toFixed(0);
  }
  if (value >= 10) {
    return value.toFixed(1);
  }
  return value.toFixed(2);
}

// Evenly spaced tick values spanning [min, max], inclusive of both ends -
// used so the first/last tick always exactly matches the axis domain edge,
// letting the edge-tick renderers reliably identify (and replace) them.
function buildAxisTicks(min: number, max: number, count: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || count < 2) {
    return [min, max];
  }
  const ticks: number[] = [];
  for (let i = 0; i < count; i += 1) {
    ticks.push(min + ((max - min) * i) / (count - 1));
  }
  return ticks;
}

export const BeamProfileChart: React.FC<BeamProfileChartProps> = ({
  source,
  beamPath,
  propagationResult,
  components,
  targetMode,
  hoveredZMm,
  onHoverZMm,
  onMoveComponentAlongPath,
  waistFit,
}) => {
  const frameRef = React.useRef<HTMLDivElement>(null);
  const gouyToggleRef = React.useRef<HTMLDivElement>(null);
  const [draggingComponentId, setDraggingComponentId] = useState<string | null>(null);
  const [plotBounds, setPlotBounds] = useState<{ left: number; top: number; width: number; height: number } | null>(
    null,
  );
  const [gouyToggleWidth, setGouyToggleWidth] = useState(0);

  const baseProfile: ProfilePoint[] =
    propagationResult && propagationResult.profile.length > 0
      ? propagationResult.profile
      : buildFallbackProfile(source, beamPath);

  const componentMarkers = useMemo(() => {
    if (!beamPath) {
      return [] as Array<{ z: number; label: string }>;
    }

    // Cavities, beam stops, and custom objects get their own dedicated
    // markers (see cavityMarkers/beamStopMarkers/customObjectMarkers below)
    // instead of a single generic label.
    return beamPath.segments
      .filter((segment) => {
        if (!segment.terminatedByComponentId) {
          return false;
        }
        const kind = components[segment.terminatedByComponentId]?.kind;
        return kind !== 'cavity_fp' && kind !== 'beam_stop' && kind !== 'custom_object';
      })
      .map((segment) => {
        const id = segment.terminatedByComponentId as string;
        return {
          z: segment.zEnd,
          label: components[id]?.label ?? id,
        };
      });
  }, [beamPath, components]);

  const beamStopMarkers = useMemo(() => {
    if (!beamPath) {
      return [] as Array<{ z: number; label: string }>;
    }

    return beamPath.segments
      .filter((segment) => {
        if (!segment.terminatedByComponentId) {
          return false;
        }
        return components[segment.terminatedByComponentId]?.kind === 'beam_stop';
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

  // One standardized overlap readout per mode-matchable component present in
  // the profile (every cavity and every target the beam actually reaches),
  // pinned above that component's own position on the chart - see
  // chipPositions below for how each chip's z maps to a de-overlapped pixel
  // position.
  const modeMatchChips = useMemo(() => {
    if (!beamPath || !propagationResult || !source) {
      return [] as Array<{ id: string; label: string; overlap: number; z: number }>;
    }

    const chips: Array<{ id: string; label: string; overlap: number; z: number }> = [];

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
        const overlap = propagationResult.cavityOverlap[id];
        if (typeof overlap === 'number') {
          // segment.zEnd is the cavity's input mirror (M1) - see cavityMarkers above.
          chips.push({ id, label: component.label, overlap, z: segment.zEnd });
        }
      } else if (component.kind === 'target') {
        const beamWaist = beamWaistFromQ(propagationResult.qAtComponent[id], segment.zEnd, source.wavelength);
        if (!beamWaist) {
          continue;
        }
        const overlap = calculateModeOverlapFromWaistParams(
          beamWaist.w0Mm,
          beamWaist.z0Mm,
          component.waistRadius,
          segment.zEnd,
          source.wavelength,
        );
        chips.push({ id, label: component.label, overlap, z: segment.zEnd });
      }
    }

    return chips;
  }, [beamPath, components, propagationResult, source]);

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

  const customObjectMarkers = useMemo(() => {
    if (!beamPath) {
      return [] as Array<{ id: string; label: string; z: number; thickness: number; isOpticallyActive: boolean }>;
    }

    return beamPath.segments
      .filter((segment) => {
        if (!segment.terminatedByComponentId) {
          return false;
        }
        return components[segment.terminatedByComponentId]?.kind === 'custom_object';
      })
      .map((segment) => {
        const id = segment.terminatedByComponentId as string;
        const component = components[id];
        const thickness = component?.kind === 'custom_object' ? component.thickness : 0;
        const indexOfRefraction = component?.kind === 'custom_object' ? component.indexOfRefraction : 1;
        return {
          id,
          z: segment.zEnd,
          thickness,
          label: component?.label ?? id,
          isOpticallyActive: Math.abs(indexOfRefraction - 1) > 1e-9,
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

  // Every cavity's eigenmode is always shaded across its own physical extent
  // (M1 to M2), independent of that cavity's showProjection toggle above -
  // which instead controls the optional comparison line extended across the
  // *entire* unfolded path.
  const cavityEigenmodeAreas = useMemo(() => {
    if (!beamPath) {
      return [] as Array<{ id: string; m1ZMm: number; m2ZMm: number; w0Mm: number; z0Mm: number }>;
    }

    const areas: Array<{ id: string; m1ZMm: number; m2ZMm: number; w0Mm: number; z0Mm: number }> = [];
    for (const segment of beamPath.segments) {
      const id = segment.terminatedByComponentId;
      if (!id) {
        continue;
      }

      const component = components[id];
      if (!component || component.kind !== 'cavity_fp' || !component.eigenmode) {
        continue;
      }

      // component.position anchors the input mirror (M1).
      const m1ZMm = segment.zEnd;
      areas.push({
        id,
        m1ZMm,
        m2ZMm: m1ZMm + component.length,
        w0Mm: component.eigenmode.waistRadius,
        z0Mm: m1ZMm + component.eigenmode.waistPositionFromM1,
      });
    }

    return areas;
  }, [beamPath, components]);

  // Target objects always show a marker at their own desired waist size,
  // independent of whether their full mode projection is toggled on.
  const targetWaistMarkers = useMemo(() => {
    if (!beamPath) {
      return [] as Array<{ id: string; z: number; w: number; label: string }>;
    }

    const markers: Array<{ id: string; z: number; w: number; label: string }> = [];
    for (const segment of beamPath.segments) {
      const id = segment.terminatedByComponentId;
      if (!id) {
        continue;
      }

      const component = components[id];
      if (!component || component.kind !== 'target') {
        continue;
      }

      markers.push({ id, z: segment.zEnd, w: component.waistRadius, label: component.label });
    }

    return markers;
  }, [beamPath, components]);

  // Only fully-entered (z, w) rows from the Waist Fit panel plot as dots -
  // a row with just one field filled in isn't a usable sample yet.
  const waistFitDots = useMemo(() => {
    if (!waistFit.showOnBeamPath) {
      return [] as Array<{ id: string; zMm: number; waistRadiusMm: number }>;
    }
    return waistFit.points.filter(
      (point): point is { id: string; zMm: number; waistRadiusMm: number } =>
        point.zMm !== null && point.waistRadiusMm !== null,
    );
  }, [waistFit.points, waistFit.showOnBeamPath]);

  const profileData = useMemo<ProfilePoint[]>(() => {
    if (projections.length === 0 && cavityEigenmodeAreas.length === 0 && !waistFit.result) {
      return baseProfile;
    }
    if (!source) {
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
      // Bounded to the cavity's own physical extent (M1 to M2), unlike the
      // proj_ fields above which project across the whole path - anything
      // outside that span is left unset so the fill stops exactly at the
      // mirrors instead of extending everywhere.
      for (const area of cavityEigenmodeAreas) {
        if (point.z >= area.m1ZMm && point.z <= area.m2ZMm) {
          extended[`eigenmode_${area.id}`] = beamRadiusFromWaist(area.w0Mm, area.z0Mm, point.z, source.wavelength);
        }
      }
      // Sampled on the same z-grid as the rest of the profile (rather than
      // a separate arbitrary grid passed via its own `data` prop) - mixing
      // differently-sized data arrays across a chart's series confuses
      // recharts' mouse-tracked activeLabel, which got stuck unable to
      // report a hovered z past the end of the shorter array.
      if (waistFit.result) {
        extended.waistFitFit = beamRadiusFromWaist(
          waistFit.result.waistRadiusMm,
          waistFit.result.zMm,
          point.z,
          source.wavelength,
        );
      }
      return extended;
    });
  }, [baseProfile, projections, cavityEigenmodeAreas, waistFit.result, source]);

  const [lockYAxis, setLockYAxis] = useState(false);
  const [lockedYMaxMm, setLockedYMaxMm] = useState(1);
  const [lockedYMinMm, setLockedYMinMm] = useState(0);
  const [lockXAxis, setLockXAxis] = useState(false);
  const [lockedXMaxMm, setLockedXMaxMm] = useState(1);
  const [lockedXMinMm, setLockedXMinMm] = useState(0);
  const [showGouyPhase, setShowGouyPhase] = useState(false);
  const [gouyPhaseWrapped, setGouyPhaseWrapped] = useState(false);
  const [zoomToolActive, setZoomToolActive] = useState(false);
  const [zoomDragStartPx, setZoomDragStartPx] = useState<{ x: number; y: number } | null>(null);
  const [zoomDragCurrentPx, setZoomDragCurrentPx] = useState<{ x: number; y: number } | null>(null);

  const profileMaxMm = profileData.reduce((maxValue, point) => {
    let pointMax = point.w;
    for (const projection of projections) {
      const value = point[`proj_${projection.id}`];
      if (typeof value === 'number') {
        pointMax = Math.max(pointMax, value);
      }
    }
    for (const area of cavityEigenmodeAreas) {
      const value = point[`eigenmode_${area.id}`];
      if (typeof value === 'number') {
        pointMax = Math.max(pointMax, value);
      }
    }
    if (typeof point.waistFitFit === 'number') {
      pointMax = Math.max(pointMax, point.waistFitFit);
    }
    return Math.max(maxValue, pointMax);
  }, Math.max(
    targetWaistMarkers.reduce((max, marker) => Math.max(max, marker.w), 0),
    waistFitDots.reduce((max, point) => Math.max(max, point.waistRadiusMm), 0),
  ));
  const dataXMaxMm = waistFitDots.reduce(
    (max, point) => Math.max(max, point.zMm),
    profileData[profileData.length - 1]?.z ?? 0,
  );
  const effectiveYMaxMm = Math.max(lockYAxis ? lockedYMaxMm : profileMaxMm, 0.001);
  const effectiveXMaxMm = Math.max(lockXAxis ? lockedXMaxMm : dataXMaxMm, 0.001);
  const effectiveYMinMm = lockYAxis ? lockedYMinMm : 0;
  const effectiveXMinMm = lockXAxis ? lockedXMinMm : 0;
  const useMicronAxis = effectiveYMaxMm * 1000 <= 3000;
  const axisScale = useMicronAxis ? 1000 : 1;
  const axisUnitLabel = useMicronAxis ? 'um' : 'mm';
  // A locked range comes from the user typing exact bounds - round only the
  // auto (unlocked) case, so a locked narrow window isn't silently widened
  // back out to whole-unit boundaries.
  const roundedYAxisMax = lockYAxis ? effectiveYMaxMm * axisScale : Math.max(1, Math.ceil(effectiveYMaxMm * axisScale));
  const roundedXAxisMax = lockXAxis ? effectiveXMaxMm : Math.max(1, Math.ceil(effectiveXMaxMm));
  const roundedYAxisMin = lockYAxis ? effectiveYMinMm * axisScale : 0;
  const roundedXAxisMin = lockXAxis ? effectiveXMinMm : 0;
  const xTicks = useMemo(
    () => buildAxisTicks(roundedXAxisMin, roundedXAxisMax, 5),
    [roundedXAxisMin, roundedXAxisMax],
  );
  const yTicks = useMemo(
    () => buildAxisTicks(roundedYAxisMin, roundedYAxisMax, 5),
    [roundedYAxisMin, roundedYAxisMax],
  );

  // Each chip starts centered above its own component's z-position, then gets
  // nudged rightward (in ascending-z order, which already matches left-to-
  // right layout) just enough that no two chips - assumed to be about
  // CHIP_WIDTH_PX wide - end up closer than CHIP_MIN_GAP_PX apart.
  const chipPositions = useMemo(() => {
    if (!plotBounds) {
      return [] as Array<{ id: string; label: string; overlap: number; x: number }>;
    }

    const CHIP_WIDTH_PX = 108;
    const CHIP_MIN_GAP_PX = 5;
    const minSpacing = CHIP_WIDTH_PX + CHIP_MIN_GAP_PX;

    const zSpan = roundedXAxisMax - roundedXAxisMin;
    const withIdealX = modeMatchChips
      .map((chip) => {
        const ratio = zSpan > 0 ? Math.max(0, Math.min(1, (chip.z - roundedXAxisMin) / zSpan)) : 0;
        return { ...chip, x: plotBounds.left + ratio * plotBounds.width };
      })
      .sort((a, b) => a.x - b.x);

    let prevX = -Infinity;
    for (const chip of withIdealX) {
      chip.x = Math.max(chip.x, prevX + minSpacing);
      prevX = chip.x;
    }

    return withIdealX;
  }, [modeMatchChips, plotBounds, roundedXAxisMin, roundedXAxisMax]);

  const applyXRange = (nextMinMm: number, nextMaxMm: number) => {
    if (!Number.isFinite(nextMinMm) || !Number.isFinite(nextMaxMm)) {
      return;
    }
    if (nextMinMm < 0 || nextMaxMm <= nextMinMm) {
      return;
    }
    setLockedXMinMm(nextMinMm);
    setLockedXMaxMm(nextMaxMm);
    setLockXAxis(true);
  };

  const applyYRange = (nextMinMm: number, nextMaxMm: number) => {
    if (!Number.isFinite(nextMinMm) || !Number.isFinite(nextMaxMm)) {
      return;
    }
    if (nextMinMm < 0 || nextMaxMm <= nextMinMm) {
      return;
    }
    setLockedYMinMm(nextMinMm);
    setLockedYMaxMm(nextMaxMm);
    setLockYAxis(true);
  };

  const chartData: Array<Record<string, number | null>> = profileData.map((point) => {
    const scaled: Record<string, number | null> = {
      z: point.z,
      wAxis: point.w * axisScale,
      gouyPhaseAxis: gouyPhaseWrapped ? wrapPhaseDeg(point.gouyPhaseDeg) : point.gouyPhaseDeg,
    };
    for (const projection of projections) {
      const value = point[`proj_${projection.id}`];
      if (typeof value === 'number') {
        scaled[`proj_${projection.id}Axis`] = value * axisScale;
      }
    }
    for (const area of cavityEigenmodeAreas) {
      const value = point[`eigenmode_${area.id}`];
      if (typeof value === 'number') {
        scaled[`eigenmode_${area.id}Axis`] = value * axisScale;
      }
    }
    if (typeof point.waistFitFit === 'number') {
      scaled.waistFitFitAxis = point.waistFitFit * axisScale;
    }
    return scaled;
  });
  // Wrapping the phase into (-180, 180] introduces artificial jumps
  // wherever the true phase crosses a multiple of 360 deg - break the line
  // there (a null point) rather than drawing a misleading vertical segment
  // connecting +180 to -180.
  if (gouyPhaseWrapped) {
    for (let i = 1; i < chartData.length; i += 1) {
      const prev = chartData[i - 1].gouyPhaseAxis;
      const current = chartData[i].gouyPhaseAxis;
      if (typeof prev === 'number' && typeof current === 'number' && Math.abs(current - prev) > 180) {
        chartData[i].gouyPhaseAxis = null;
      }
    }
  }
  const gouyPhaseDomain: [number, number] | undefined = gouyPhaseWrapped
    ? [-180, 180]
    : undefined;

  // Nothing affects the displayed range while an axis is locked - the
  // locked value only tracks the live auto-computed max while unlocked, so
  // unlocking always resumes from the current data instead of a stale one.
  useEffect(() => {
    if (!lockYAxis) {
      setLockedYMaxMm(profileMaxMm);
      setLockedYMinMm(0);
    }
  }, [lockYAxis, profileMaxMm]);

  useEffect(() => {
    if (!lockXAxis) {
      setLockedXMaxMm(dataXMaxMm);
      setLockedXMinMm(0);
    }
  }, [lockXAxis, dataXMaxMm]);

  // Lens markers are positioned in absolute HTML over the chart, but recharts
  // insets the actual plot area from the frame's left edge by however wide the
  // Y axis labels render (which varies with digit count). Measuring the grid's
  // own background rect - rather than assuming the plot spans the full frame
  // width - is what keeps a marker aligned under its lens's line on the chart.
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    let gridResizeObserver: ResizeObserver | null = null;

    const measure = () => {
      const gridBg = frame.querySelector('.recharts-cartesian-grid-bg');
      if (!gridBg) {
        return;
      }
      const frameRect = frame.getBoundingClientRect();
      const gridRect = gridBg.getBoundingClientRect();
      setPlotBounds({
        left: gridRect.left - frameRect.left,
        top: gridRect.top - frameRect.top,
        width: gridRect.width,
        height: gridRect.height,
      });

      // Recharts can re-inset the grid (e.g. the Y axis label width
      // changing with tick digit count) without the outer frame's own box
      // changing size at all, which the frame-level observer below
      // wouldn't catch on its own.
      if (!gridResizeObserver) {
        gridResizeObserver = new ResizeObserver(measure);
        gridResizeObserver.observe(gridBg);
      }
    };

    measure();
    const frameResizeObserver = new ResizeObserver(measure);
    frameResizeObserver.observe(frame);

    // Neither observer above necessarily catches the surrounding page's own
    // layout still settling for a frame or two after mount (fonts, sibling
    // panels, etc.) - a pure reflow with no element actually changing size.
    // Left unaddressed, that stale first measurement stuck around wrong
    // (path-marker handles rendered below the axis instead of centered on
    // it) until some unrelated interaction happened to trigger a fresh
    // measurement. Re-measuring for a few frames after mount catches the
    // final settled layout instead.
    let rafCount = 0;
    let rafId = requestAnimationFrame(function tick() {
      measure();
      rafCount += 1;
      if (rafCount < 6) {
        rafId = requestAnimationFrame(tick);
      }
    });

    return () => {
      frameResizeObserver.disconnect();
      gridResizeObserver?.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, [roundedXAxisMin, roundedXAxisMax, roundedYAxisMin, roundedYAxisMax, axisUnitLabel]);

  // Measures the Gouy-phase toggle's own rendered width (it grows once the
  // "Wrap phase" checkbox appears) so component labels can tell whether
  // they'd land underneath it - see isInGouyToggleZone below.
  useLayoutEffect(() => {
    const toggle = gouyToggleRef.current;
    if (!toggle) {
      setGouyToggleWidth(0);
      return;
    }
    const measure = () => setGouyToggleWidth(toggle.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(toggle);
    return () => observer.disconnect();
  }, [showGouyPhase]);

  const hoveredPoint = hoveredZMm !== null ? nearestProfilePoint(profileData, hoveredZMm) : null;
  const hoveredPointAxisY = hoveredPoint ? hoveredPoint.w * axisScale : null;
  const hoveredGouyPhaseDeg = hoveredPoint
    ? gouyPhaseWrapped
      ? wrapPhaseDeg(hoveredPoint.gouyPhaseDeg)
      : hoveredPoint.gouyPhaseDeg
    : null;

  if (profileData.length === 0) {
    return <div className="profile-placeholder">No beam profile data available.</div>;
  }

  // The edge ticks (domain min/max) are hidden here and instead rendered as
  // the editable axis-edge fields overlaid on the frame below, positioned
  // from the measured plot pixel bounds.
  const isEdgeTickValue = (value: number, min: number, max: number) =>
    Math.abs(value - min) < 1e-9 || Math.abs(value - max) < 1e-9;

  const renderXAxisTick = (props: any) => {
    const { x, y, payload } = props;
    if (isEdgeTickValue(payload.value, roundedXAxisMin, roundedXAxisMax)) {
      return <g />;
    }
    return (
      <text x={x} y={y + 12} textAnchor="middle" fontSize={11} fill="var(--chart-axis-text)">
        {formatAxisMax(payload.value)}
      </text>
    );
  };

  const renderYAxisTick = (props: any) => {
    const { x, y, payload } = props;
    if (isEdgeTickValue(payload.value, roundedYAxisMin, roundedYAxisMax)) {
      return <g />;
    }
    return (
      <text x={x} y={y + 4} textAnchor="end" fontSize={11} fill="var(--chart-axis-text)">
        {formatAxisMax(payload.value)}
      </text>
    );
  };

  // A draggable handle anchored to the plot's x-axis, letting a lens or
  // target be slid along the unfolded path the same way whether it started
  // there or on the 2D table. `className` picks the marker's look (see
  // .profile-lens-marker / .profile-target-marker).
  const renderDraggablePathMarker = (marker: { id: string; z: number; label: string }, className: string) => {
    if (!plotBounds) {
      return null;
    }

    // Position against the plot area's real measured pixel bounds (see the
    // useLayoutEffect above), not the frame's full width - recharts insets
    // the plot by the Y axis label width, so a percent-of-frame position
    // drifts left of the actual line.
    const zSpan = roundedXAxisMax - roundedXAxisMin;
    const positionRatio = zSpan > 0 ? Math.max(0, Math.min(1, (marker.z - roundedXAxisMin) / zSpan)) : 0;
    const leftPx = plotBounds.left + positionRatio * plotBounds.width;
    // Anchored to the measured axis line itself (not a fixed offset from
    // the frame's bottom edge), so it stays put regardless of how much
    // vertical room the chart ends up with.
    const topPx = plotBounds.top + plotBounds.height;

    return (
      <button
        key={marker.id}
        type="button"
        className={`${className}${draggingComponentId === marker.id ? ' dragging' : ''}`}
        style={{ left: `${leftPx}px`, top: `${topPx}px` }}
        title={`Drag ${marker.label} along path`}
        onPointerDown={(event) => {
          const frame = frameRef.current;
          if (!frame) {
            return;
          }

          // Otherwise this would also bubble up to the frame's own
          // onPointerDown and simultaneously start a zoom-box drag whenever
          // the zoom tool happens to be armed.
          event.stopPropagation();
          event.preventDefault();
          setDraggingComponentId(marker.id);
          event.currentTarget.setPointerCapture(event.pointerId);

          const updateFromClientX = (clientX: number) => {
            const frameRect = frame.getBoundingClientRect();
            const bounds = plotBounds ?? { left: 0, width: frameRect.width };
            if (bounds.width <= 0) {
              return;
            }
            const dragRatio = Math.max(0, Math.min(1, (clientX - frameRect.left - bounds.left) / bounds.width));
            onMoveComponentAlongPath(marker.id, roundedXAxisMin + dragRatio * (roundedXAxisMax - roundedXAxisMin));
          };

          updateFromClientX(event.clientX);

          const onMove = (moveEvent: PointerEvent) => updateFromClientX(moveEvent.clientX);
          const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            setDraggingComponentId((active) => (active === marker.id ? null : active));
          };

          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        }}
      >
        <span className={`${className}-arrow`} aria-hidden="true">&larr;</span>
        <span>{marker.label}</span>
        <span className={`${className}-arrow`} aria-hidden="true">&rarr;</span>
      </button>
    );
  };

  // z (mm) -> the frame-relative pixel x it plots at, same mapping used
  // throughout this component for positioning HTML overlays against the
  // chart's SVG coordinate space.
  const zToPlotPx = (z: number): number | null => {
    if (!plotBounds) {
      return null;
    }
    const zSpan = roundedXAxisMax - roundedXAxisMin;
    const ratio = zSpan > 0 ? (z - roundedXAxisMin) / zSpan : 0;
    return plotBounds.left + ratio * plotBounds.width;
  };

  // The Gouy-phase toggle is pinned above the plot's top-right corner (see
  // the JSX below) - a component label landing in that same horizontal
  // span needs to render inside the plot instead of above it, or the two
  // would overlap.
  const isInGouyToggleZone = (z: number): boolean => {
    if (!plotBounds || gouyToggleWidth <= 0) {
      return false;
    }
    const xPx = zToPlotPx(z);
    if (xPx === null) {
      return false;
    }
    const zoneStart = plotBounds.left + plotBounds.width - gouyToggleWidth - 8;
    return xPx >= zoneStart;
  };

  // Converts a point in frame-relative pixels (as measured against
  // plotBounds, same as everywhere else in this component) into the z/w
  // values it corresponds to - w is in the axis's current display units
  // (um or mm), matching what the edge NumericFields show.
  const pxToZoomData = (px: { x: number; y: number }) => {
    if (!plotBounds || plotBounds.width <= 0 || plotBounds.height <= 0) {
      return null;
    }
    const ratioX = (px.x - plotBounds.left) / plotBounds.width;
    const ratioY = (px.y - plotBounds.top) / plotBounds.height;
    const z = roundedXAxisMin + ratioX * (roundedXAxisMax - roundedXAxisMin);
    // Pixel y grows downward but the axis grows upward, so the top of the
    // drag rectangle maps to the axis max, not the min.
    const wDisplay = roundedYAxisMax - ratioY * (roundedYAxisMax - roundedYAxisMin);
    return { z, wDisplay };
  };

  // Drag-to-zoom: while the magnifying-glass tool is armed, dragging a
  // rectangle over the plot locks both axes to exactly that bounded region.
  // Pointer capture + window-level listeners (rather than plain onMouseMove/
  // onMouseUp on the frame) keep the drag tracking smoothly even if the
  // cursor briefly leaves the frame - same pattern as the path markers above.
  const handleZoomPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!zoomToolActive) {
      return;
    }
    // Don't hijack clicks on the axis lock buttons or the min/max edit
    // fields overlaid on the frame - only an empty-space drag starts a zoom.
    if ((event.target as HTMLElement).closest('input, button')) {
      return;
    }
    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    event.preventDefault();
    const frameRect = frame.getBoundingClientRect();
    const start = { x: event.clientX - frameRect.left, y: event.clientY - frameRect.top };
    setZoomDragStartPx(start);
    setZoomDragCurrentPx(start);
    event.currentTarget.setPointerCapture(event.pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      setZoomDragCurrentPx({ x: moveEvent.clientX - frameRect.left, y: moveEvent.clientY - frameRect.top });
    };
    const onUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const end = { x: upEvent.clientX - frameRect.left, y: upEvent.clientY - frameRect.top };
      setZoomDragStartPx(null);
      setZoomDragCurrentPx(null);
      setZoomToolActive(false);

      // Too small a drag to be an intentional selection - ignore it rather
      // than snapping to a near-zero-size range.
      if (Math.abs(end.x - start.x) < 6 || Math.abs(end.y - start.y) < 6) {
        return;
      }
      const startData = pxToZoomData(start);
      const endData = pxToZoomData(end);
      if (!startData || !endData) {
        return;
      }
      applyXRange(Math.max(0, Math.min(startData.z, endData.z)), Math.max(startData.z, endData.z));
      applyYRange(
        Math.max(0, Math.min(startData.wDisplay, endData.wDisplay)) / axisScale,
        Math.max(startData.wDisplay, endData.wDisplay) / axisScale,
      );
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div className="profile-chart-shell">
      {chipPositions.length > 0 && (
        <div className="profile-chip-lane">
          <div className="profile-overlap-chip profile-overlap-caption">
            <strong>Overlap:</strong>
          </div>
          {chipPositions.map((chip) => (
            <div className="profile-overlap-chip profile-overlap-chip--pinned" key={chip.id} style={{ left: `${chip.x}px` }}>
              <strong>{chip.label}</strong>
              <span style={{ color: overlapColorVar(chip.overlap) }}>{(chip.overlap * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      )}
      <div
        className={zoomToolActive ? 'profile-chart-frame profile-chart-frame--zooming' : 'profile-chart-frame'}
        ref={frameRef}
        onPointerDown={handleZoomPointerDown}
      >
        <div style={{ width: '100%', height: '100%' }}>
          <ResponsiveContainer>
            <ComposedChart
              data={chartData}
              margin={{ top: 30, right: 16, bottom: 44, left: 34 }}
              onMouseMove={(state: any) => {
                const z = typeof state?.activeLabel === 'number' ? state.activeLabel : null;
                onHoverZMm(z);
              }}
              onMouseLeave={() => onHoverZMm(null)}
            >
              {/* fill="transparent" (rather than the default "none") forces recharts to
                  render a .recharts-cartesian-grid-bg rect, which lens markers below use
                  to measure the plot area's real pixel bounds. */}
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-line)" fill="transparent" />

              {cavityEigenmodeAreas.map((area) => (
                <Area
                  key={`cavity-eigenmode-${area.id}`}
                  dataKey={`eigenmode_${area.id}Axis`}
                  baseValue={0}
                  type="monotone"
                  fill="#9013FE"
                  fillOpacity={0.16}
                  stroke="#9013FE"
                  strokeOpacity={0.5}
                  strokeWidth={1}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={false}
                  legendType="none"
                  tooltipType="none"
                />
              ))}

              {customObjectMarkers.map((marker) => (
                <ReferenceArea
                  key={`custom-object-${marker.id}`}
                  x1={marker.z}
                  x2={marker.z + marker.thickness}
                  ifOverflow="visible"
                  fill={marker.isOpticallyActive ? 'rgba(61, 126, 166, 0.16)' : 'rgba(138, 147, 156, 0.14)'}
                  stroke={marker.isOpticallyActive ? 'rgba(61, 126, 166, 0.45)' : 'rgba(138, 147, 156, 0.4)'}
                  strokeWidth={1}
                  label={renderMarkerLabel(
                    marker.label,
                    marker.isOpticallyActive ? '#3d7ea6' : '#6f7f91',
                    600,
                    isInGouyToggleZone(marker.z + marker.thickness / 2),
                  )}
                />
              ))}
              <XAxis
                dataKey="z"
                type="number"
                domain={[roundedXAxisMin, roundedXAxisMax]}
                ticks={xTicks}
                allowDataOverflow
                tick={renderXAxisTick}
                label={renderXAxisLabel}
              />
              <YAxis
                dataKey="wAxis"
                type="number"
                domain={[roundedYAxisMin, roundedYAxisMax]}
                ticks={yTicks}
                allowDataOverflow
                tick={renderYAxisTick}
                label={{ value: `w (${axisUnitLabel})`, angle: -90, position: 'insideLeft', fill: 'var(--chart-axis-text)' }}
              />
              <Line
                dataKey="wAxis"
                type="monotone"
                stroke="#ff6a2a"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />

              {showGouyPhase && (
                <>
                  <YAxis
                    yAxisId="gouy"
                    dataKey="gouyPhaseAxis"
                    type="number"
                    orientation="right"
                    domain={gouyPhaseDomain ?? ['auto', 'auto']}
                    allowDataOverflow={gouyPhaseWrapped}
                    tick={{ fontSize: 11, fill: '#6f52d9' }}
                    label={renderGouyPhaseAxisLabel}
                  />
                  <Line
                    yAxisId="gouy"
                    dataKey="gouyPhaseAxis"
                    type="monotone"
                    stroke="#6f52d9"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                </>
              )}

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
                  stroke="var(--chart-neutral-line)"
                  strokeDasharray="4 4"
                  label={renderMarkerLabel(marker.label, 'var(--chart-axis-text)', 400, isInGouyToggleZone(marker.z))}
                />
              ))}

              {beamStopMarkers.map((marker, index) => (
                <ReferenceLine
                  key={`beam-stop-${index}`}
                  x={marker.z}
                  stroke="#c0392b"
                  strokeWidth={2}
                  label={renderMarkerLabel(`${marker.label} (beam stop)`, '#c0392b', 700, isInGouyToggleZone(marker.z))}
                />
              ))}

              {cavityMarkers.map((marker, index) =>
                marker.kind === 'mirror' ? (
                  <ReferenceLine
                    key={`cavity-${index}`}
                    x={marker.z}
                    stroke="#9013fe"
                    strokeDasharray="4 4"
                    label={renderMarkerLabel(marker.label, 'var(--chart-axis-text)', 400, isInGouyToggleZone(marker.z))}
                  />
                ) : (
                  <ReferenceLine
                    key={`cavity-${index}`}
                    x={marker.z}
                    stroke="#2d9bf0"
                    strokeDasharray="2 3"
                    label={{
                      value: marker.label,
                      position: 'insideBottom',
                      fill: '#2d9bf0',
                      fontSize: 11,
                    }}
                  />
                ),
              )}

              {hoveredPoint && (
                <>
                  <ReferenceLine x={hoveredPoint.z} stroke="#2d9bf0" />
                  <ReferenceDot x={hoveredPoint.z} y={hoveredPointAxisY ?? 0} r={4} fill="#2d9bf0" stroke="var(--chart-marker-ring)" />
                  {showGouyPhase && hoveredGouyPhaseDeg !== null && (
                    <ReferenceDot
                      yAxisId="gouy"
                      x={hoveredPoint.z}
                      y={hoveredGouyPhaseDeg}
                      r={4}
                      fill="#6f52d9"
                      stroke="var(--chart-marker-ring)"
                    />
                  )}
                </>
              )}

              {targetWaistMarkers.map((marker, index) => (
                <ReferenceDot
                  key={`target-waist-${index}`}
                  x={marker.z}
                  y={marker.w * axisScale}
                  r={5}
                  fill="#17A2B8"
                  stroke="var(--chart-marker-ring)"
                  strokeWidth={2}
                />
              ))}

              {waistFit.result && (
                <Line
                  dataKey="waistFitFitAxis"
                  type="monotone"
                  stroke="#16a34a"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  isAnimationActive={false}
                  legendType="none"
                  tooltipType="none"
                  connectNulls={false}
                />
              )}

              {waistFitDots.map((point) => (
                <ReferenceDot
                  key={`waist-fit-point-${point.id}`}
                  x={point.zMm}
                  y={point.waistRadiusMm * axisScale}
                  r={4}
                  fill="#16a34a"
                  stroke="var(--chart-marker-ring)"
                  strokeWidth={1.5}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {zoomDragStartPx && zoomDragCurrentPx && (
          <div
            className="profile-zoom-selection"
            style={{
              left: `${Math.min(zoomDragStartPx.x, zoomDragCurrentPx.x)}px`,
              top: `${Math.min(zoomDragStartPx.y, zoomDragCurrentPx.y)}px`,
              width: `${Math.abs(zoomDragCurrentPx.x - zoomDragStartPx.x)}px`,
              height: `${Math.abs(zoomDragCurrentPx.y - zoomDragStartPx.y)}px`,
            }}
          />
        )}

        {plotBounds && (
          <div
            className="profile-view-tools profile-view-tools--pinned"
            style={{ left: `${plotBounds.left}px`, top: `${plotBounds.top + plotBounds.height}px` }}
          >
            <button
              type="button"
              className="icon-button"
              aria-label={zoomToolActive ? 'Cancel zoom selection' : 'Zoom to selection'}
              aria-pressed={zoomToolActive}
              title="Drag a box on the chart to zoom into it"
              onClick={() => setZoomToolActive((active) => !active)}
            >
              <SearchIcon className={zoomToolActive ? 'icon-glyph profile-zoom-tool-active' : 'icon-glyph'} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Reset view"
              title="Reset view"
              disabled={!lockXAxis && !lockYAxis}
              onClick={() => {
                setLockXAxis(false);
                setLockYAxis(false);
              }}
            >
              <FullscreenIcon />
            </button>
          </div>
        )}

        {plotBounds && (
          <div
            ref={gouyToggleRef}
            className="profile-chart-toolbar-toggles profile-gouy-toggle-group--pinned"
            style={{ left: `${plotBounds.left + plotBounds.width}px`, top: `${plotBounds.top}px` }}
          >
            <label className="profile-gouy-toggle">
              <input
                type="checkbox"
                checked={showGouyPhase}
                onChange={(event) => setShowGouyPhase(event.target.checked)}
              />
              Gouy phase
            </label>
            {showGouyPhase && (
              <label className="profile-gouy-toggle">
                <input
                  type="checkbox"
                  checked={gouyPhaseWrapped}
                  onChange={(event) => setGouyPhaseWrapped(event.target.checked)}
                />
                Wrap phase
              </label>
            )}
          </div>
        )}

        {plotBounds &&
          lensMarkers.map((marker) => renderDraggablePathMarker(marker, 'profile-lens-marker'))}
        {plotBounds &&
          targetWaistMarkers.map((marker) => renderDraggablePathMarker(marker, 'profile-target-marker'))}

        {hoveredPoint && (
          <div className="profile-hover-card">
            <strong>{formatBeamRadius(hoveredPoint.w)}</strong>
            <span>z = {hoveredPoint.z.toFixed(1)} mm</span>
            {showGouyPhase && hoveredGouyPhaseDeg !== null && (
              <span>Gouy phase = {formatGouyPhaseDeg(hoveredGouyPhaseDeg)}</span>
            )}
          </div>
        )}

        {plotBounds && (
          <>
            <div
              className="profile-axis-edge-field profile-axis-edge-field--x-min"
              style={{ left: `${plotBounds.left}px`, top: `${plotBounds.top + plotBounds.height}px` }}
            >
              <NumericField
                aria-label="X axis minimum (mm)"
                className="profile-axis-edge-input"
                value={roundedXAxisMin}
                format={formatAxisMax}
                onCommit={(value) => applyXRange(value, roundedXAxisMax)}
              />
            </div>
            <div
              className="profile-axis-edge-field profile-axis-edge-field--x-max"
              style={{
                left: `${plotBounds.left + plotBounds.width}px`,
                top: `${plotBounds.top + plotBounds.height}px`,
              }}
            >
              <NumericField
                aria-label="X axis maximum (mm)"
                className="profile-axis-edge-input"
                value={roundedXAxisMax}
                format={formatAxisMax}
                onCommit={(value) => applyXRange(roundedXAxisMin, value)}
              />
              <button
                type="button"
                className="icon-button profile-axis-edge-lock"
                aria-label={lockXAxis ? 'Unlock X axis range' : 'Lock X axis range'}
                onClick={() => {
                  // Engaging the lock should freeze the range exactly as
                  // currently displayed (the rounded auto-fit bounds) rather
                  // than the unrounded lockedXMaxMm the sync effect below
                  // keeps updating in the background - otherwise the axis
                  // visibly snaps to that unrounded value the instant it locks.
                  if (!lockXAxis) {
                    setLockedXMinMm(roundedXAxisMin);
                    setLockedXMaxMm(roundedXAxisMax);
                  }
                  setLockXAxis((locked) => !locked);
                }}
              >
                <LockIcon locked={lockXAxis} />
              </button>
            </div>
            <div
              className="profile-axis-edge-field profile-axis-edge-field--y-min"
              style={{ left: `${plotBounds.left}px`, top: `${plotBounds.top + plotBounds.height}px` }}
            >
              <NumericField
                aria-label={`Y axis minimum (${axisUnitLabel})`}
                className="profile-axis-edge-input"
                value={roundedYAxisMin}
                format={formatAxisMax}
                onCommit={(value) => applyYRange(value / axisScale, roundedYAxisMax / axisScale)}
              />
            </div>
            <div
              className="profile-axis-edge-field profile-axis-edge-field--y-max"
              style={{ left: `${plotBounds.left}px`, top: `${plotBounds.top}px` }}
            >
              <button
                type="button"
                className="icon-button profile-axis-edge-lock"
                aria-label={lockYAxis ? 'Unlock Y axis range' : 'Lock Y axis range'}
                onClick={() => {
                  // Same reasoning as the X axis lock button above: freeze
                  // the currently-displayed (rounded) bounds instead of the
                  // unrounded lockedYMaxMm the sync effect keeps updating,
                  // so the axis doesn't visibly snap the instant it locks.
                  if (!lockYAxis) {
                    setLockedYMinMm(roundedYAxisMin / axisScale);
                    setLockedYMaxMm(roundedYAxisMax / axisScale);
                  }
                  setLockYAxis((locked) => !locked);
                }}
              >
                <LockIcon locked={lockYAxis} />
              </button>
              <NumericField
                aria-label={`Y axis maximum (${axisUnitLabel})`}
                className="profile-axis-edge-input"
                value={roundedYAxisMax}
                format={formatAxisMax}
                onCommit={(value) => applyYRange(roundedYAxisMin / axisScale, value / axisScale)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
