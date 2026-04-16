/**
 * Beam Path Resolver
 *
 * Traces a Gaussian beam geometrically through an optical table.
 * Determines which components the beam encounters, in what order, and
 * whether the path is valid for physics computation.
 *
 * This is pure geometry: no Layer 0 math, no UI dependencies.
 */

import type {
  AppState,
  BeamPath,
  BeamSegment,
  CardinalDirection,
  OpticalComponent,
  SourceComponent,
  FlatMirrorComponent,
} from './schema';
import { isWithinAxisCapture, snapPointToAxis, transverseOffsetToAxis } from './axisCapture';

/**
 * Resolve the beam path from the source component onwards.
 *
 * @param state AppState with components and sourceId
 * @returns BeamPath with segments, orderedComponentIds, totalLength, isValid, invalidReason
 *          (or null if no source is placed)
 */
export function resolveBeamPath(state: AppState): BeamPath | null {
  if (!state.sourceId) {
    return null; // No source placed
  }

  const source = state.components[state.sourceId];
  if (!source || source.kind !== 'source') {
    return {
      segments: [],
      orderedComponentIds: [],
      totalLength: 0,
      isValid: false,
      invalidReason: 'Source component not found or has wrong kind',
    };
  }

  // Trace the beam from the source
  const { segments, orderedComponentIds, totalLength, invalidReason } = traceBeamPath(
    source,
    state.components,
    state.table
  );

  return {
    segments,
    orderedComponentIds,
    totalLength,
    isValid: invalidReason === null,
    invalidReason,
  };
}

interface TraceResult {
  segments: BeamSegment[];
  orderedComponentIds: string[];
  totalLength: number;
  invalidReason: string | null;
}

/**
 * Trace the beam from the source through components.
 */
function traceBeamPath(
  source: SourceComponent,
  components: Record<string, OpticalComponent>,
  table: any // TableConfig
): TraceResult {
  const segments: BeamSegment[] = [];
  const orderedComponentIds: string[] = [];

  let currentPos = source.position;
  let currentDir = source.direction;
  let totalZ = 0;

  const visited = new Set<string>([source.id]);
  const MAX_REFLECTIONS = 20; // Prevent infinite loops

  while (segments.length < MAX_REFLECTIONS) {
    // Step 1: Find the next component along the current direction
    const { component, hitPoint, distance } = findNextComponentAlongRay(
      currentPos,
      currentDir,
      components,
      visited,
      table
    );

    // Step 2: Build a segment to the hit point (or table boundary)
    const zStart = totalZ;
    const zEnd = zStart + distance;

    let termination: 'component' | 'table_boundary' | 'wrong_face';
    let terminatedByComponentId: string | null = null;

    if (!component) {
      // No component hit; beam exits table
      termination = 'table_boundary';
    } else {
      // Beam hits a component
      termination = 'component';
      terminatedByComponentId = component.id;

      // Check if we hit the wrong face of a mirror
      if (component.kind === 'mirror_flat') {
        const mirror = component as FlatMirrorComponent;
        const hitValid = isValidMirrorHit(currentDir, hitPoint, mirror, currentPos);
        if (!hitValid) {
          // Hit the non-reflective face; beam absorbs
          const absorbSegment: BeamSegment = {
            direction: currentDir,
            start: currentPos,
            end: hitPoint,
            zStart,
            zEnd,
            terminatedByComponentId: component.id,
            termination: 'wrong_face',
          };
          segments.push(absorbSegment);
          return {
            segments,
            orderedComponentIds,
            totalLength: zEnd,
            invalidReason: null, // Valid path, just terminated
          };
        }
      }
    }

    // Add the segment
    const segment: BeamSegment = {
      direction: currentDir,
      start: currentPos,
      end: hitPoint,
      zStart,
      zEnd,
      terminatedByComponentId,
      termination,
    };
    segments.push(segment);
    totalZ = zEnd;

    // Step 3: If no component or wall boundary, path ends here
    if (!component || termination === 'table_boundary') {
      return {
        segments,
        orderedComponentIds,
        totalLength: totalZ,
        invalidReason: null,
      };
    }

    // Step 4: Process the component hit
    orderedComponentIds.push(component.id);
    visited.add(component.id);

    if (component.kind === 'mirror_flat') {
      // Reflect: new direction is determined by mirror orientation
      const mirror = component as FlatMirrorComponent;
      const newDir = reflectDirection(currentDir, mirror.orientation);
      currentDir = newDir;
      currentPos = hitPoint;
    } else if (component.kind === 'lens_thin' || component.kind === 'cavity_fp') {
      // Pass through: direction unchanged
      currentPos = hitPoint;
      // direction stays the same
    } else {
      // Source (shouldn't hit source again)
      return {
        segments,
        orderedComponentIds,
        totalLength: totalZ,
        invalidReason: 'Beam looped back to source',
      };
    }
  }

  return {
    segments,
    orderedComponentIds,
    totalLength: totalZ,
    invalidReason: 'Maximum reflections exceeded (infinite loop?)',
  };
}

/**
 * Find the nearest component along a ray in the given direction.
 * Returns the component and the point where the ray hits it.
 */
function findNextComponentAlongRay(
  rayOrigin: { x: number; y: number },
  direction: CardinalDirection,
  components: Record<string, OpticalComponent>,
  visited: Set<string>,
  table: any // TableConfig
): { component: OpticalComponent | null; hitPoint: { x: number; y: number }; distance: number } {
  const rayDir = directionToVector(direction);
  let closestComponent: OpticalComponent | null = null;
  let closestDistance = Infinity;
  let closestHitPoint = rayOrigin;

  // Trace ray to table boundary in this direction
  const tableBoundaryDistance = distanceToTableBoundary(rayOrigin, direction, table);

  for (const [id, component] of Object.entries(components)) {
    if (visited.has(id)) continue;
    if (component.kind === 'source') continue; // Don't hit source again

    // Compute intersection of ray with component
    const { intersects, hitPoint, distance } = rayIntersectsComponent(
      rayOrigin,
      direction,
      component,
      table
    );

    if (intersects && distance > 0.01 && distance < closestDistance && distance < tableBoundaryDistance) {
      closestComponent = component;
      closestDistance = distance;
      closestHitPoint = hitPoint;
    }
  }

  const finalDistance = closestComponent ? closestDistance : tableBoundaryDistance;
  const finalHitPoint = closestComponent ? closestHitPoint : rayEndpoint(rayOrigin, direction, finalDistance);

  return {
    component: closestComponent,
    hitPoint: finalHitPoint,
    distance: finalDistance,
  };
}

/**
 * Check if a ray hit the reflective face of a mirror.
 * The reflective face is the one whose normal points into the ray's incoming direction.
 */
function isValidMirrorHit(
  incomingDir: CardinalDirection,
  hitPoint: { x: number; y: number },
  mirror: FlatMirrorComponent,
  rayOrigin: { x: number; y: number }
): boolean {
  // The reflective face normal is encoded in the mirror orientation.
  // See state-schema.md for the reflection table.
  const orientation = mirror.orientation;

  // Direct check: does the incoming beam direction match the expected incoming direction for this orientation?
  // See optics-math.skill.md §Mirror for authoritative table.
  const validIncomingDirs: Record<number, CardinalDirection[]> = {
    45: ['right', 'down'],
    135: ['right', 'up'],
    225: ['left', 'up'],
    315: ['left', 'down'],
  };

  return validIncomingDirs[orientation]?.includes(incomingDir) ?? false;
}

/**
 * Reflect a direction off a mirror with the given orientation.
 * See state-schema.md and optics-math.skill.md for the reflection table.
 */
function reflectDirection(incomingDir: CardinalDirection, orientation: number): CardinalDirection {
  const reflectionTable: Record<number, Record<CardinalDirection, CardinalDirection>> = {
    45: { right: 'up', down: 'left', up: 'right', left: 'down' },
    135: { right: 'down', up: 'left', down: 'right', left: 'up' },
    225: { left: 'down', up: 'right', down: 'left', right: 'up' },
    315: { left: 'up', down: 'right', up: 'left', right: 'down' },
  };

  return reflectionTable[orientation]?.[incomingDir] ?? incomingDir;
}

/**
 * Compute the distance from a point to the nearest table boundary in a given direction.
 */
function distanceToTableBoundary(
  pos: { x: number; y: number },
  direction: CardinalDirection,
  table: any
): number {
  switch (direction) {
    case 'right':
      return Math.max(0, table.width - pos.x);
    case 'left':
      return Math.max(0, pos.x);
    case 'down':
      return Math.max(0, table.height - pos.y);
    case 'up':
      return Math.max(0, pos.y);
  }
}

/**
 * Compute the endpoint of a ray travelling a given distance.
 */
function rayEndpoint(
  origin: { x: number; y: number },
  direction: CardinalDirection,
  distance: number
): { x: number; y: number } {
  switch (direction) {
    case 'right':
      return { x: origin.x + distance, y: origin.y };
    case 'left':
      return { x: origin.x - distance, y: origin.y };
    case 'down':
      return { x: origin.x, y: origin.y + distance };
    case 'up':
      return { x: origin.x, y: origin.y - distance };
  }
}

/**
 * Check if a ray intersects a component and return the hit point.
 */
function rayIntersectsComponent(
  rayOrigin: { x: number; y: number },
  direction: CardinalDirection,
  component: OpticalComponent,
  table: any
): { intersects: boolean; hitPoint: { x: number; y: number }; distance: number } {
  const componentPos = component.position;
  const COMPONENT_RADIUS = 10; // mm (approximate size for hit-test)

  let intersectsAxis = false;
  let distance = Infinity;
  let hitPoint = rayOrigin;

  // Ray travels along cardinal axis; check if it passes within COMPONENT_RADIUS of the component center
  switch (direction) {
    case 'right':
      // Ray is at (y = rayOrigin.y), moving in +x
      if (Math.abs(componentPos.y - rayOrigin.y) <= COMPONENT_RADIUS) {
        const d = componentPos.x - rayOrigin.x;
        if (d > 0) {
          distance = d;
          hitPoint = { x: componentPos.x, y: rayOrigin.y };
          intersectsAxis = true;
        }
      }
      break;
    case 'left':
      // Ray is at (y = rayOrigin.y), moving in -x
      if (Math.abs(componentPos.y - rayOrigin.y) <= COMPONENT_RADIUS) {
        const d = rayOrigin.x - componentPos.x;
        if (d > 0) {
          distance = d;
          hitPoint = { x: componentPos.x, y: rayOrigin.y };
          intersectsAxis = true;
        }
      }
      break;
    case 'down':
      // Ray is at (x = rayOrigin.x), moving in +y
      if (Math.abs(componentPos.x - rayOrigin.x) <= COMPONENT_RADIUS) {
        const d = componentPos.y - rayOrigin.y;
        if (d > 0) {
          distance = d;
          hitPoint = { x: rayOrigin.x, y: componentPos.y };
          intersectsAxis = true;
        }
      }
      break;
    case 'up':
      // Ray is at (x = rayOrigin.x), moving in -y
      if (Math.abs(componentPos.x - rayOrigin.x) <= COMPONENT_RADIUS) {
        const d = rayOrigin.y - componentPos.y;
        if (d > 0) {
          distance = d;
          hitPoint = { x: rayOrigin.x, y: componentPos.y };
          intersectsAxis = true;
        }
      }
      break;
  }

  // Check axis capture: if component is off-axis but within threshold, snap it to axis
  if (intersectsAxis && !isComponentOnAxis(rayOrigin, direction, componentPos, table)) {
    const offset = transverseOffsetToAxis(componentPos, rayOrigin, direction); // Compute transverse offset
    if (Math.abs(offset) <= table.axisCaptureThreshold) {
      // Component is within capture range; snap hit point to beam axis
      hitPoint = snapPointToAxis(hitPoint, rayOrigin, direction);
    } else {
      // Component is too far off-axis; ignore it
      intersectsAxis = false;
      distance = Infinity;
    }
  }

  return {
    intersects: intersectsAxis,
    hitPoint,
    distance,
  };
}

/**
 * Check if a component is on the beam axis given the ray origin and direction.
 */
function isComponentOnAxis(
  rayOrigin: { x: number; y: number },
  direction: CardinalDirection,
  componentPos: { x: number; y: number },
  table: any
): boolean {
  switch (direction) {
    case 'right':
    case 'left':
      return Math.abs(componentPos.y - rayOrigin.y) < 1; // Tolerance: < 1 mm
    case 'up':
    case 'down':
      return Math.abs(componentPos.x - rayOrigin.x) < 1;
  }
}

/**
 * Convert a direction to a velocity vector.
 */
function directionToVector(dir: CardinalDirection): { dx: number; dy: number } {
  switch (dir) {
    case 'right':
      return { dx: 1, dy: 0 };
    case 'left':
      return { dx: -1, dy: 0 };
    case 'down':
      return { dx: 0, dy: 1 };
    case 'up':
      return { dx: 0, dy: -1 };
  }
}
