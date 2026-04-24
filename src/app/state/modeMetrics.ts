import { calculateModeOverlapFromWaistParams } from '../../math/overlap';
import type { AppState } from './schema';

interface BeamWaist {
  w0Mm: number;
  z0Mm: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function getOutputBeamWaist(state: AppState): (BeamWaist & { wavelengthNm: number }) | null {
  const result = state.propagationResult;
  if (!result || result.profile.length === 0) {
    return null;
  }

  const source = state.sourceId ? state.components[state.sourceId] : null;
  if (!source || source.kind !== 'source') {
    return null;
  }

  if (result.qFinal.im <= 0) {
    return null;
  }

  const wavelengthNm = source.wavelength;
  const wavelengthMm = wavelengthNm * 1e-6;
  const w0Mm = Math.sqrt((wavelengthMm * result.qFinal.im) / Math.PI);
  if (!Number.isFinite(w0Mm) || w0Mm <= 0) {
    return null;
  }

  const zEndMm = result.profile[result.profile.length - 1].z;
  const z0Mm = zEndMm - result.qFinal.re;
  if (!Number.isFinite(z0Mm)) {
    return null;
  }

  return {
    w0Mm,
    z0Mm,
    wavelengthNm,
  };
}

export function getTargetBeamWaist(state: AppState): BeamWaist | null {
  if (!state.targetMode) {
    return null;
  }

  if (state.targetMode.kind === 'manual') {
    return {
      w0Mm: state.targetMode.waistRadius,
      z0Mm: state.targetMode.waistZ,
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

  const m1ZMm = encounter.zEnd - cavity.length / 2;

  return {
    w0Mm: cavity.eigenmode.waistRadius,
    z0Mm: m1ZMm + cavity.eigenmode.waistPositionFromM1,
  };
}

export function computeLiveModeOverlap(state: AppState): number | null {
  const output = getOutputBeamWaist(state);
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
