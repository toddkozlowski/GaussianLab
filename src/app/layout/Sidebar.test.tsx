import { describe, it, expect } from 'vitest';
import { DEFAULT_MIRROR_ORIENTATION, getDefaultPlacement } from './Sidebar';
import { SUBSTRATE_DIRECTION } from '../../ui/canvas/components/MirrorRenderer';
import { createCavityFPComponent, createSourceComponent } from '../state/componentFactories';
import { resolveAppState } from '../state/stateResolver';
import { DEFAULT_APP_STATE } from '../state/defaultState';
import type { AppState, CardinalDirection } from '../state/schema';

// Matches the DIRECTION_UNIT convention used throughout the canvas renderers
// (e.g. SourceRenderer.tsx): the unit vector a beam travels along per
// cardinal direction, in the same (x right, y down) canvas coordinate space
// SUBSTRATE_DIRECTION is expressed in.
const DIRECTION_UNIT: Record<CardinalDirection, { x: number; y: number }> = {
  right: { x: 1, y: 0 },
  left: { x: -1, y: 0 },
  down: { x: 0, y: 1 },
  up: { x: 0, y: -1 },
};

describe('DEFAULT_MIRROR_ORIENTATION', () => {
  it('always presents the reflective face - not the substrate/back - to the beam it lands on', () => {
    for (const direction of Object.keys(DIRECTION_UNIT) as CardinalDirection[]) {
      const orientation = DEFAULT_MIRROR_ORIENTATION[direction];
      const beam = DIRECTION_UNIT[direction];
      const substrate = SUBSTRATE_DIRECTION[orientation];

      // A beam only reaches the reflective coating (rather than passing
      // through where the substrate block sits) if it's travelling toward
      // the substrate's side of the mirror - i.e. beam and substrate
      // directions point the same general way.
      const dot = beam.x * substrate.x + beam.y * substrate.y;
      expect(dot).toBeGreaterThan(0);
    }
  });

  it('covers all four cardinal directions with a valid MirrorOrientation', () => {
    const directions: CardinalDirection[] = ['right', 'left', 'up', 'down'];
    for (const direction of directions) {
      expect([45, 135, 225, 315]).toContain(DEFAULT_MIRROR_ORIENTATION[direction]);
    }
  });
});

describe('getDefaultPlacement', () => {
  it('skips past a cavity\'s full mirror span (M1 to M2), not just an offset from M1', () => {
    const source = createSourceComponent({}, { x: 50, y: 300 });
    const cavity = createCavityFPComponent({}, { x: 150, y: 300 }); // M1 at x=150
    cavity.length = 300; // M2 at x=450

    const state: AppState = {
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: { [source.id]: source, [cavity.id]: cavity },
    };
    const resolved = resolveAppState(state);

    const placement = getDefaultPlacement(resolved);
    // Must land beyond M2 (450), never inside the cavity's [150, 450] span.
    expect(placement.position.x).toBeGreaterThanOrEqual(450);
    expect(placement.position.x).toBeCloseTo(450 + 60, 6);
    expect(placement.position.y).toBe(300);
    expect(placement.direction).toBe('right');
  });
});
