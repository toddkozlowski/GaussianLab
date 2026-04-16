import { describe, expect, it } from 'vitest';
import {
  createCavityFPComponent,
  createFlatMirrorComponent,
  createLensThinComponent,
  createSourceComponent,
} from './componentFactories';
import type { OpticalComponent } from './schema';

describe('componentFactories', () => {
  it('creates source with expected defaults and incremental label', () => {
    const components: Record<string, OpticalComponent> = {};
    const firstSource = createSourceComponent(components, { x: 100, y: 100 });
    components[firstSource.id] = firstSource;
    const secondSource = createSourceComponent(components, { x: 150, y: 100 });

    expect(firstSource.kind).toBe('source');
    expect(firstSource.label).toBe('S1');
    expect(firstSource.wavelength).toBe(1064);
    expect(secondSource.label).toBe('S2');
  });

  it('creates mirror, lens, and cavity with MVP defaults', () => {
    const components: Record<string, OpticalComponent> = {};

    const mirror = createFlatMirrorComponent(components, { x: 200, y: 200 });
    components[mirror.id] = mirror;

    const lens = createLensThinComponent(components, { x: 300, y: 200 });
    components[lens.id] = lens;

    const cavity = createCavityFPComponent(components, { x: 400, y: 200 });

    expect(mirror.orientation).toBe(45);
    expect(lens.focalLength).toBe(100);
    expect(lens.optimiserCanMove).toBe(true);
    expect(cavity.eigenmode).toBeNull();
    expect(cavity.length).toBe(100);
    expect(cavity.r1).toBe(Number.POSITIVE_INFINITY);
  });
});
