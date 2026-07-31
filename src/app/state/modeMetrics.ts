import { calculateModeOverlapFromWaistParams } from '../../math/overlap';
import type { AppState } from './schema';

interface BeamWaist {
  w0Mm: number;
  z0Mm: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Derive the beam's own (natural) waist size and position from its
 * q-parameter at the point where it reaches `componentId`, using the
 * component's known z-position along the unfolded path.
 */
export function getBeamWaistAtComponent(
  state: AppState,
  componentId: string,
): (BeamWaist & { wavelengthNm: number }) | null {
  const result = state.propagationResult;
  if (!result) {
    return null;
  }

  const q = result.qAtComponent[componentId];
  if (!q || q.im <= 0) {
    return null;
  }

  const source = state.sourceId ? state.components[state.sourceId] : null;
  if (!source || source.kind !== 'source') {
    return null;
  }

  const wavelengthNm = source.wavelength;
  const wavelengthMm = wavelengthNm * 1e-6;
  const w0Mm = Math.sqrt((wavelengthMm * q.im) / Math.PI);
  if (!Number.isFinite(w0Mm) || w0Mm <= 0) {
    return null;
  }

  const encounter = state.beamPath?.segments.find((segment) => segment.terminatedByComponentId === componentId);
  if (!encounter) {
    return null;
  }

  const z0Mm = encounter.zEnd - q.re;
  if (!Number.isFinite(z0Mm)) {
    return null;
  }

  return { w0Mm, z0Mm, wavelengthNm };
}

export function getTargetBeamWaist(state: AppState): BeamWaist | null {
  if (!state.targetMode) {
    return null;
  }

  if (state.targetMode.kind === 'target') {
    const target = state.components[state.targetMode.targetComponentId];
    if (!target || target.kind !== 'target') {
      return null;
    }

    const encounter = state.beamPath?.segments.find((segment) => segment.terminatedByComponentId === target.id);
    if (!encounter) {
      return null;
    }

    // The target object's own position along the unfolded path IS the
    // desired waist location - it does not offset like a cavity's eigenmode.
    return {
      w0Mm: target.waistRadius,
      z0Mm: encounter.zEnd,
    };
  }

  const cavity = state.components[state.targetMode.cavityComponentId];
  if (!cavity || cavity.kind !== 'cavity_fp' || !cavity.eigenmode) {
    return null;
  }

  const encounter = state.beamPath?.segments.find((segment) => segment.terminatedByComponentId === cavity.id);
  if (!encounter) {
    return null;
  }

  // The beam path treats the cavity's stored position as its input mirror
  // (M1), so encounter.zEnd already is M1's z-position.
  const m1ZMm = encounter.zEnd;

  return {
    w0Mm: cavity.eigenmode.waistRadius,
    z0Mm: m1ZMm + cavity.eigenmode.waistPositionFromM1,
  };
}

export function computeLiveModeOverlap(state: AppState): number | null {
  // For a cavity target, the propagated beam downstream of the cavity is
  // *forced* onto the cavity's own eigenmode once coupling succeeds - so
  // comparing that forced output against the (identical) target mode would
  // trivially always read 100%. Instead, use the overlap actually measured
  // between the incoming beam and the cavity eigenmode at the input mirror,
  // which the propagation engine already computes and reports per-cavity.
  if (state.targetMode?.kind === 'cavity') {
    const overlap = state.propagationResult?.cavityOverlap?.[state.targetMode.cavityComponentId];
    return typeof overlap === 'number' ? clamp01(overlap) : null;
  }

  if (state.targetMode?.kind === 'target') {
    // A target object doesn't modify the beam, so compare the beam's own
    // natural waist right where it reaches the target - not the final
    // output, which could differ if anything sits further downstream.
    const output = getBeamWaistAtComponent(state, state.targetMode.targetComponentId);
    const target = getTargetBeamWaist(state);
    if (!output || !target) {
      return null;
    }

    return clamp01(
      calculateModeOverlapFromWaistParams(
        output.w0Mm,
        output.z0Mm,
        target.w0Mm,
        target.z0Mm,
        output.wavelengthNm,
      ),
    );
  }

  return null;
}
