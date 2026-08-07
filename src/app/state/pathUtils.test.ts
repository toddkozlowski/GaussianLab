import { describe, expect, it } from 'vitest';
import { computeDangerousPairs, moveComponentToPathZ, resolveZRangeExtents } from './pathUtils';
import {
  createCustomObjectComponent,
  createFlatMirrorComponent,
  createLensThinComponent,
  createSourceComponent,
  createTargetComponent,
} from './componentFactories';
import { resolveAppState } from './stateResolver';
import { DEFAULT_APP_STATE } from './defaultState';
import type { AppState } from './schema';

// All components sit on a straight horizontal path from a source at x=0, so
// each component's beam path z-position equals its x-coordinate.
function buildStateWithObjectAndTarget(targetX: number): { state: AppState; objectId: string; targetId: string } {
  const source = createSourceComponent({}, { x: 0, y: 300 });
  const object = createCustomObjectComponent({}, { x: 100, y: 300 });
  object.thickness = 50; // spans z = [100, 150]
  const target = createTargetComponent({}, { x: targetX, y: 300 });

  const state: AppState = {
    ...DEFAULT_APP_STATE,
    sourceId: source.id,
    components: { [source.id]: source, [object.id]: object, [target.id]: target },
  };

  return { state: resolveAppState(state), objectId: object.id, targetId: target.id };
}

describe('computeDangerousPairs (custom object face-awareness)', () => {
  it('flags a component that falls inside the object\'s thickness span, even at its center', () => {
    const { state, objectId, targetId } = buildStateWithObjectAndTarget(125); // inside [100, 150]
    const pairs = computeDangerousPairs(state.components, state.sourceId, state.beamPath, 10);
    const pair = pairs.find((p) => [p.aId, p.bId].includes(objectId) && [p.aId, p.bId].includes(targetId));
    expect(pair).toBeDefined();
    expect(pair!.distanceMm).toBe(0);
  });

  it('flags a component just past the object\'s back face, measuring from that face', () => {
    const { state, objectId, targetId } = buildStateWithObjectAndTarget(155); // 5mm past back face (150)
    const pairs = computeDangerousPairs(state.components, state.sourceId, state.beamPath, 10);
    const pair = pairs.find((p) => [p.aId, p.bId].includes(objectId) && [p.aId, p.bId].includes(targetId));
    expect(pair).toBeDefined();
    expect(pair!.distanceMm).toBeCloseTo(5, 6);
  });

  it('flags a component just before the object\'s front face, measuring from that face', () => {
    const { state, objectId, targetId } = buildStateWithObjectAndTarget(95); // 5mm before front face (100)
    const pairs = computeDangerousPairs(state.components, state.sourceId, state.beamPath, 10);
    const pair = pairs.find((p) => [p.aId, p.bId].includes(objectId) && [p.aId, p.bId].includes(targetId));
    expect(pair).toBeDefined();
    expect(pair!.distanceMm).toBeCloseTo(5, 6);
  });

  it('does not flag a component safely beyond the threshold from either face', () => {
    const { state, objectId, targetId } = buildStateWithObjectAndTarget(300); // 150mm past back face
    const pairs = computeDangerousPairs(state.components, state.sourceId, state.beamPath, 10);
    const pair = pairs.find((p) => [p.aId, p.bId].includes(objectId) && [p.aId, p.bId].includes(targetId));
    expect(pair).toBeUndefined();
  });
});

describe('moveComponentToPathZ', () => {
  it('resolves a non-mirror component to the (x, y) at the requested z along a straight path', () => {
    const source = createSourceComponent({}, { x: 0, y: 300 });
    const lens = createLensThinComponent({}, { x: 200, y: 300 });
    const state = resolveAppState({
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: { [source.id]: source, [lens.id]: lens },
    });

    expect(moveComponentToPathZ(state, lens.id, 350)).toEqual({ x: 350, y: 300 });
  });

  it('returns null for a mirror - a single z is not a well-defined edit for it', () => {
    const source = createSourceComponent({}, { x: 0, y: 300 });
    const mirror = createFlatMirrorComponent({}, { x: 200, y: 300 });
    const state = resolveAppState({
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: { [source.id]: source, [mirror.id]: mirror },
    });

    expect(moveComponentToPathZ(state, mirror.id, 350)).toBeNull();
  });

  it('returns null for an unknown component id', () => {
    const state = resolveAppState(DEFAULT_APP_STATE);
    expect(moveComponentToPathZ(state, 'nonexistent', 100)).toBeNull();
  });

  it('returns null when the beam path is not resolvable', () => {
    const lens = createLensThinComponent({}, { x: 200, y: 300 });
    const state: AppState = {
      ...DEFAULT_APP_STATE,
      sourceId: null,
      components: { [lens.id]: lens },
    };

    expect(moveComponentToPathZ(state, lens.id, 100)).toBeNull();
  });
});

describe('resolveZRangeExtents', () => {
  it('resolves a range that stays within one segment to a single extent', () => {
    const source = createSourceComponent({}, { x: 0, y: 300 });
    const target = createTargetComponent({}, { x: 500, y: 300 });
    const state = resolveAppState({
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: { [source.id]: source, [target.id]: target },
    });

    const extents = resolveZRangeExtents(state.beamPath, 100, 200);
    expect(extents).toHaveLength(1);
    expect(extents[0].pointA).toEqual({ x: 100, y: 300 });
    expect(extents[0].pointB).toEqual({ x: 200, y: 300 });
  });

  it('order-independent: same result whether start > end or start < end', () => {
    const source = createSourceComponent({}, { x: 0, y: 300 });
    const target = createTargetComponent({}, { x: 500, y: 300 });
    const state = resolveAppState({
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: { [source.id]: source, [target.id]: target },
    });

    expect(resolveZRangeExtents(state.beamPath, 200, 100)).toEqual(resolveZRangeExtents(state.beamPath, 100, 200));
  });

  it('splits a range that crosses a mirror into one extent per segment', () => {
    // source(100,300) --right--> mirror(300,300) --135deg--> down
    const source = createSourceComponent({}, { x: 100, y: 300 });
    source.direction = 'right';
    const mirror = createFlatMirrorComponent({}, { x: 300, y: 300 });
    mirror.orientation = 135; // reflects right -> down
    const target = createTargetComponent({}, { x: 300, y: 600 });

    const state = resolveAppState({
      ...DEFAULT_APP_STATE,
      sourceId: source.id,
      components: { [source.id]: source, [mirror.id]: mirror, [target.id]: target },
    });

    // Segment 0 (horizontal): z=[0,200]. Segment 1 (vertical, past mirror): z=[200, ...].
    // A range of z=[150,250] should split into a chunk on each segment.
    const extents = resolveZRangeExtents(state.beamPath, 150, 250);
    expect(extents).toHaveLength(2);

    const horizontal = extents.find((e) => e.segment.direction === 'right')!;
    expect(horizontal).toBeDefined();
    expect(horizontal.pointA).toEqual({ x: 250, y: 300 });
    expect(horizontal.pointB).toEqual({ x: 300, y: 300 });

    const vertical = extents.find((e) => e.segment.direction === 'down')!;
    expect(vertical).toBeDefined();
    expect(vertical.pointA).toEqual({ x: 300, y: 300 });
    expect(vertical.pointB).toEqual({ x: 300, y: 350 });
  });

  it('returns an empty array for a null or invalid beam path', () => {
    expect(resolveZRangeExtents(null, 0, 100)).toEqual([]);
  });
});
