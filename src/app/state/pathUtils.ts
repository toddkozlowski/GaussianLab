import type { AppState, BeamPath, OpticalComponent, Point2d } from './schema';

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

export function computeDangerousPairs(
  components: Record<string, OpticalComponent>,
  thresholdMm: number = 10,
): DangerousPair[] {
  const list = Object.values(components);
  const pairs: DangerousPair[] = [];

  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i];
      const b = list[j];
      const dx = a.position.x - b.position.x;
      const dy = a.position.y - b.position.y;
      const distanceMm = Math.sqrt(dx * dx + dy * dy);
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

export function moveLensToPathZ(state: AppState, lensId: string, zMm: number): Point2d | null {
  const lens = state.components[lensId];
  if (!lens || lens.kind !== 'lens_thin') {
    return null;
  }

  return pointOnBeamPathAtZ(state.beamPath, zMm);
}
