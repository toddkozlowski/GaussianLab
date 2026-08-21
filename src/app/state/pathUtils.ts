import type { AppState, BeamPath, BeamSegment, OpticalComponent, Point2d } from './schema';

/** Components closer than this (mm) trigger the "too close" proximity warning. */
export const DANGEROUS_PROXIMITY_THRESHOLD_MM = 10;

interface DangerousPair {
  aId: string;
  aLabel: string;
  bId: string;
  bLabel: string;
  distanceMm: number;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getComponentPathPosition(
  sourceId: string | null,
  beamPath: BeamPath | null,
  componentId: string,
): number | null {
  if (sourceId === componentId) {
    return 0;
  }

  const segment = beamPath?.segments.find((entry) => entry.terminatedByComponentId === componentId);
  return segment ? round3(segment.zEnd) : null;
}

/**
 * Which table axis a component's position.x/position.y edits actually move
 * it along, i.e. the direction of the beam segment it sits on: 'x' for a
 * horizontal (left/right) segment, 'y' for a vertical (up/down) one. Falls
 * back to the path's first segment (or 'x') when the component isn't on a
 * resolved path yet.
 */
export function getComponentMovementAxis(state: AppState, componentId: string): 'x' | 'y' {
  const segment =
    state.beamPath?.segments.find((s) => s.terminatedByComponentId === componentId) ??
    state.beamPath?.segments[0];
  return segment?.direction === 'up' || segment?.direction === 'down' ? 'y' : 'x';
}

export function pointOnBeamPathAtZ(beamPath: BeamPath | null, zMm: number): Point2d | null {
  if (!beamPath || !beamPath.isValid || beamPath.segments.length === 0) {
    return null;
  }

  const clampedZ = clamp(zMm, 0, beamPath.totalLength);

  for (const segment of beamPath.segments) {
    if (clampedZ < segment.zStart || clampedZ > segment.zEnd) {
      continue;
    }

    const dz = segment.zEnd - segment.zStart;
    const t = dz <= 1e-9 ? 0 : (clampedZ - segment.zStart) / dz;
    return {
      x: round3(segment.start.x + (segment.end.x - segment.start.x) * t),
      y: round3(segment.start.y + (segment.end.y - segment.start.y) * t),
    };
  }

  const last = beamPath.segments[beamPath.segments.length - 1];
  return { x: round3(last.end.x), y: round3(last.end.y) };
}

/** One segment's worth of a z-range: the sub-span of that segment the range covers, physically resolved. */
export interface ZRangeSegmentExtent {
  segment: BeamSegment;
  zSubStart: number;
  zSubEnd: number;
  pointA: Point2d;
  pointB: Point2d;
}

/**
 * Resolves a [startZMm, endZMm] window (order-independent) into the physical
 * segment(s) it covers. A window that crosses a mirror spans more than one
 * segment - e.g. a range that starts before a mirror and ends after it
 * yields one extent per segment, which together bend around the corner the
 * same way the beam itself does.
 */
export function resolveZRangeExtents(
  beamPath: BeamPath | null,
  startZMm: number,
  endZMm: number,
): ZRangeSegmentExtent[] {
  if (!beamPath || !beamPath.isValid || beamPath.segments.length === 0) {
    return [];
  }

  const lo = Math.min(startZMm, endZMm);
  const hi = Math.max(startZMm, endZMm);
  const extents: ZRangeSegmentExtent[] = [];

  for (const segment of beamPath.segments) {
    const subLo = Math.max(lo, segment.zStart);
    const subHi = Math.min(hi, segment.zEnd);
    if (subHi <= subLo) {
      continue;
    }

    const pointA = pointOnBeamPathAtZ(beamPath, subLo);
    const pointB = pointOnBeamPathAtZ(beamPath, subHi);
    if (!pointA || !pointB) {
      continue;
    }

    extents.push({ segment, zSubStart: subLo, zSubEnd: subHi, pointA, pointB });
  }

  return extents;
}

/**
 * Distance between a pair of components, for proximity warnings. A custom
 * object occupies real physical thickness along the beam (not just its
 * anchor point, which is its front face) - so whenever both components' beam
 * path z-positions are resolvable, distance to a custom object is measured
 * to its nearest face (zero if the other component's z falls inside the
 * object's span). Otherwise - e.g. either component currently isn't on a
 * resolved beam path - this falls back to plain 2D distance between anchors,
 * same as any other pair.
 */
function pairDistanceMm(
  a: OpticalComponent,
  b: OpticalComponent,
  sourceId: string | null,
  beamPath: BeamPath | null,
): number {
  const object = a.kind === 'custom_object' ? a : b.kind === 'custom_object' ? b : null;
  const other = object === a ? b : a;

  if (object && other.kind !== 'custom_object') {
    const frontZ = getComponentPathPosition(sourceId, beamPath, object.id);
    const otherZ = getComponentPathPosition(sourceId, beamPath, other.id);
    if (frontZ !== null && otherZ !== null) {
      const backZ = frontZ + object.thickness;
      if (otherZ >= frontZ && otherZ <= backZ) {
        return 0; // other component sits inside the object's span
      }
      return otherZ < frontZ ? frontZ - otherZ : otherZ - backZ;
    }
  }

  const dx = a.position.x - b.position.x;
  const dy = a.position.y - b.position.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function computeDangerousPairs(
  components: Record<string, OpticalComponent>,
  sourceId: string | null,
  beamPath: BeamPath | null,
  thresholdMm: number = DANGEROUS_PROXIMITY_THRESHOLD_MM,
): DangerousPair[] {
  const list = Object.values(components);
  const pairs: DangerousPair[] = [];

  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i];
      const b = list[j];
      const distanceMm = pairDistanceMm(a, b, sourceId, beamPath);
      if (distanceMm < thresholdMm) {
        pairs.push({
          aId: a.id,
          aLabel: a.label,
          bId: b.id,
          bLabel: b.label,
          distanceMm: round3(distanceMm),
        });
      }
    }
  }

  return pairs;
}

/**
 * Resolves the (x, y) a component would sit at if slid to a given z along
 * the beam path. Mirrors are excluded: repositioning one also changes the
 * geometry of every downstream segment, so "slide along z" isn't a
 * well-defined single-axis edit the way it is for a component that just
 * terminates a segment without redirecting the beam.
 */
export function moveComponentToPathZ(state: AppState, componentId: string, zMm: number): Point2d | null {
  const component = state.components[componentId];
  if (!component || component.kind === 'mirror_flat') {
    return null;
  }

  return pointOnBeamPathAtZ(state.beamPath, zMm);
}
