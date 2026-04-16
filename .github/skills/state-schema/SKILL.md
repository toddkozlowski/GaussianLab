---
name: state-schema
description: Defines the TypeScript types for the application's state, including optical components, beam path, propagation results, and optimiser state. This schema serves as the single source of truth for the structure of the application's data and is used across all layers of the application to ensure consistency and type safety.
---

## 0. Conventions

### Component Dimensions
- All components should be considered to have physical dimensions which are stored in the state. For example, mirrors and lenses have a defined diameter (used for hit-testing and rendering), and the cavity object has a defined length. These dimensions are not just for rendering; they are part of the physical model of the system and may affect beam propagation (e.g. clipping, mirror size constraints). The state schema should include fields for these dimensions where relevant. 

### Coordinate System
- **Screen / canvas coordinates**: origin at **top-left** of the table canvas. X increases rightward. Y increases **downward**. All stored positions (`x`, `y`) are in this system, in **millimetres** (not pixels). The render layer is solely responsible for converting mm → px using the current zoom/scale factor.
- **Optical z-axis**: a scalar `z` measured in mm along the *unfolded* beam path, starting at 0 at the source origin. Used exclusively in Layer 0 (physics) and the 1D profile panel. Never stored on components.
- **Beam direction**: encoded as a `CardinalDirection` enum (see §2). The beam always travels along one of the four cardinal axes. Diagonal propagation is not supported.

### Units
All lengths: **millimetres (mm)** throughout the state. Wavelength: **nanometres (nm)**. Angles: **degrees**, restricted to the values defined per component type. Radii of curvature and focal lengths: **mm**. Overlap/mode-matching fractions: dimensionless **0–1** (not percent).

---

## 1. Primitive Enums and Unions

```typescript
/** The four cardinal directions in which a beam may propagate. */
type CardinalDirection = 'right' | 'left' | 'up' | 'down';

/**
 * Mirror orientation encodes the angle of the reflective face normal,
 * restricted to the four diagonal orientations that produce 90° turns.
 * Value is the CCW angle of the face normal from the +x axis, in degrees.
 *
 * Reflective face normals and their effect on incoming beam direction:
 *   45  → reflects 'right'→'up',   'down'→'left'
 *   135 → reflects 'right'→'down', 'up'→'left'
 *   225 → reflects 'left'→'down',  'up'→'right'
 *   315 → reflects 'left'→'up',    'down'→'right'
 *
 * See optics-math.skill.md §Mirror for the full reflection direction table.
 * Direct back-reflection (0°, 90°, 180°, 270° face normals) is NOT allowed.
 */
type MirrorOrientation = 45 | 135 | 225 | 315;

/** Discriminant for all component types. */
type ComponentKind =
  | 'source'
  | 'mirror_flat'
  | 'lens_thin'
  | 'cavity_fp';

/** Grid spacing standard. */
type GridStandard = 'metric' | 'imperial';

/** Optimiser run status. */
type SolverStatus = 'idle' | 'running' | 'solved' | 'failed';
```

---

## 2. Component Schemas

All components share a **`BaseComponent`** record. Each specialisation extends it with physics properties.

```typescript
interface BaseComponent {
  /** Unique stable ID. Generate with crypto.randomUUID(). Never reassign. */
  id: string;

  kind: ComponentKind;

  /**
   * Position in table mm coordinates (origin = table top-left).
   * For mirrors: position of the centre of the reflective face.
   * For lenses, cavity, source: position of the optical centre.
   */
  position: { x: number; y: number };

  /**
   * If true, this component cannot be moved by the user or by the optimiser
   * until explicitly unlocked via the UI. The optimiser must skip locked
   * components entirely when selecting free parameters.
   */
  locked: boolean;

  /**
   * Display label shown on the canvas. Auto-generated if not set by user
   * (e.g. "L1", "M2", "FP1"). Mutable.
   */
  label: string;
}
```

### 2a. Laser Source

```typescript
interface SourceComponent extends BaseComponent {
  kind: 'source';

  /** Beam propagation direction out of the source. */
  direction: CardinalDirection;

  /**
   * 1/e² beam waist radius in mm.
   * Defined at the waist location, not necessarily at the source position.
   */
  waistRadius: number; // mm

  /**
   * Waist position relative to source origin, in mm, along the beam
   * propagation direction. Sign convention: positive = waist is downstream
   * of source position (in the propagation direction). Negative = waist is
   * upstream (e.g. -30 for an NPRO with waist inside the enclosure).
   *
   * The complex beam parameter q at the source position is then computed as:
   *   q0 = -waistOffset + i * zR
   * where zR = π * waistRadius² / wavelength_mm
   * See optics-math.skill.md §Source for derivation.
   */
  waistOffset: number; // mm, signed

  /** Wavelength in nm. Default 1064. */
  wavelength: number; // nm
}
```

### 2b. Flat Mirror

```typescript
interface FlatMirrorComponent extends BaseComponent {
  kind: 'mirror_flat';

  /**
   * Orientation of the reflective face. Encodes which 90° turn this mirror
   * produces. See MirrorOrientation definition above.
   * Only the reflective face (the face whose normal points into the
   * incoming beam half-space) produces a reflection. A beam arriving at
   * the non-reflective face terminates.
   */
  orientation: MirrorOrientation;
}
```

### 2c. Thin Lens

```typescript
interface LensThinComponent extends BaseComponent {
  kind: 'lens_thin';

  /**
   * Effective focal length in mm.
   *   f > 0 → converging
   *   f < 0 → diverging
   * Lens must be snapped to the beam axis. Its position component (x or y)
   * transverse to the beam direction is constrained by the beam path resolver
   * to lie exactly on the beam line.
   */
  focalLength: number; // mm, signed

  /**
   * Whether this lens is available to the optimiser as a free parameter.
   * Independent of `locked`: a lens may be unlocked (user can drag it)
   * but excluded from optimisation, or vice versa — though in practice
   * the optimiser also checks `locked` and skips locked lenses regardless
   * of this flag.
   */
  optimiserCanMove: boolean;
}
```

### 2d. Fabry-Perot Cavity

```typescript
interface CavityFPComponent extends BaseComponent {
  kind: 'cavity_fp';

  /**
   * Distance between the two cavity mirrors (mirror separation), in mm.
   * This is the round-trip length / 2.
   */
  length: number; // mm, positive

  /**
   * Radius of curvature of mirror 1 (the input coupler), in mm.
   * Sign convention: R > 0 concave (focusing), R < 0 convex, Inf = flat.
   * Use Number.POSITIVE_INFINITY for a flat mirror.
   */
  r1: number; // mm, signed

  /**
   * Radius of curvature of mirror 2 (the output coupler / end mirror), mm.
   * Same sign convention as r1.
   */
  r2: number; // mm, signed

  /**
   * The axis along which the cavity is oriented. The beam enters from
   * the end corresponding to `direction` and exits from the same axis.
   * The cavity is an inline element: the beam continues after it.
   */
  direction: CardinalDirection;

  /**
   * Solved eigenmode. Null until the cavity solver has been run.
   * Populated by the cavity eigenmode solver defined in optics-math.skill.md §Cavity.
   * This is the beam parameter at the input coupler (mirror 1), inside the cavity.
   */
  eigenmode: CavityEigenmode | null;
}

interface CavityEigenmode {
  /** 1/e² waist radius of the cavity eigenmode, mm. */
  waistRadius: number;

  /**
   * Position of the eigenmode waist relative to the input coupler (mirror 1),
   * in mm, along the cavity axis. Positive = inside the cavity.
   */
  waistPositionFromM1: number;

  /**
   * Stability parameter g = g1 * g2 where g_i = 1 - L/R_i.
   * Cavity is stable iff 0 ≤ g ≤ 1. Stored for UI display.
   */
  stabilityProduct: number;

  /** Whether the cavity is geometrically stable. */
  isStable: boolean;
}
```

### 2f. Discriminated Union

```typescript
type OpticalComponent =
  | SourceComponent
  | FlatMirrorComponent
  | LensThinComponent
  | CavityFPComponent;
```

---

## 3. Table Schema

```typescript
interface TableConfig {
  /** Table width in mm. Default 1000. */
  width: number;

  /** Table height in mm. Default 600. */
  height: number;

  /** Hole spacing standard. Default 'metric' (25 mm). */
  gridStandard: GridStandard;

  /**
   * Derived from gridStandard. Do not store independently.
   * metric → 25.0 mm, imperial → 25.4 mm.
   * Compute at read time: gridSpacingMm(config.gridStandard).
   */
  // gridSpacingMm: number  ← NOT stored, always derived

  /** Whether snap-to-grid is active. Default true. */
  snapToGrid: boolean;

  /**
   * Maximum transverse offset in mm at which an off-axis lens or cavity
   * is considered captured by the current beam axis and snapped onto it.
   * Default 10.
   */
  axisCaptureThreshold: number;
}
```

---

## 4. Beam Path and Propagation Result

These types are **computed / derived** — they are never stored in the persistent component list. They are (re)computed by the beam path resolver whenever the component list or any component property changes.

```typescript
/**
 * A single straight segment of the beam between two events
 * (source emission, mirror reflection, component pass-through, or termination).
 */
interface BeamSegment {
  /** Direction of propagation along this segment. */
  direction: CardinalDirection;

  /** Start point of this segment in table mm coordinates. */
  start: { x: number; y: number };

  /**
   * End point of this segment in table mm coordinates.
   * If the beam exits the table boundary without hitting a component,
   * this is the intersection with the table edge.
   */
  end: { x: number; y: number };

  /**
   * Cumulative unfolded z-distance at the start of this segment, in mm.
   * z=0 at the source origin position.
   */
  zStart: number;

  /**
   * Cumulative unfolded z-distance at the end of this segment, in mm.
   */
  zEnd: number;

  /**
   * The component ID that terminates this segment, if any.
   * Null if the segment ends at the table boundary.
   */
  terminatedByComponentId: string | null;

  /**
   * Reason this segment ends.
   * 'component'      → beam hits a component (mirror, lens, cavity, etc.)
   * 'table_boundary' → beam exits table with no further components
   * 'wrong_face'     → beam hit the non-reflective face of a mirror; beam terminates
   */
  termination: 'component' | 'table_boundary' | 'wrong_face';
}

/**
 * The complete resolved beam path, produced by the beam path resolver.
 * Input to both the canvas renderer (Layer 3) and the 1D profile panel (Layer 4).
 */
interface BeamPath {
  segments: BeamSegment[];

  /**
   * Ordered list of component IDs encountered along the beam path,
   * in the order the beam passes through/reflects off them.
   * Derived from segments; provided here for convenience.
   */
  orderedComponentIds: string[];

  /**
   * Total unfolded optical path length in mm, from source to final termination.
   */
  totalLength: number;

  /**
   * Whether the beam path is valid for physics computation.
   * Invalid if: no source defined, source has no clear path,
   * a component is placed off-axis (snapping error), etc.
   * If false, propagationResult will be null.
   */
  isValid: boolean;

  /** Human-readable reason if isValid is false. For UI display. */
  invalidReason: string | null;
}

/**
 * The physics output of propagating the Gaussian beam along a resolved BeamPath.
 * Produced by the Layer 0 propagation engine consuming a BeamPath.
 */
interface PropagationResult {
  /**
   * Beam radius w(z) sampled at regular intervals along the unfolded z-axis.
   * Used to render the 1D profile panel and the beam width corridor on canvas.
   * z values are in mm; w values are in mm.
   */
  profile: Array<{ z: number; w: number }>;

  /**
   * Locations of beam waists along the unfolded path.
   * A waist is a local minimum of w(z).
   */
  waists: Array<{
    z: number;       // mm along unfolded path
    w: number;       // 1/e² radius at waist, mm
    componentId: string | null; // nearest component, for label display
  }>;

  /**
   * The complex beam parameter q at each component position,
   * keyed by component ID. Used by the optimiser and cavity solver.
   */
  qAtComponent: Record<string, ComplexNumber>;

  /**
   * Complex beam parameter at the final point of the beam path.
   */
  qFinal: ComplexNumber;
}

/** Minimal complex number type. No external math library dependency. */
interface ComplexNumber {
  re: number;
  im: number;
}
```

---

## 5. Target Mode

```typescript
/**
 * The desired beam mode to match. Either specified manually by the user,
 * or derived from a cavity eigenmode.
 */
type TargetMode =
  | {
      kind: 'manual';
      /** Desired 1/e² beam waist radius at the target location, mm. */
      waistRadius: number;
      /**
       * Target waist position as unfolded z-coordinate along the beam path, mm.
       * The user places a target marker on the 1D profile panel or specifies
       * a distance from the source.
       */
      waistZ: number;
    }
  | {
      kind: 'cavity';
      /**
       * ID of the CavityFPComponent whose eigenmode is the target.
       * The eigenmode waist position is taken from
       * cavity.eigenmode.waistPositionFromM1, offset by the cavity's
       * position along the beam path.
       */
      cavityComponentId: string;
    };
```

---

## 6. Optimiser State

```typescript
interface OptimiserSolution {
  /** Unique ID for this solution (for table display keying). */
  id: string;

  /**
   * Map of component ID → new position for each lens the optimiser moved.
   * Only contains components whose position changed.
   */
  lensPositions: Record<string, { x: number; y: number }>;

  /**
   * Mode overlap integral result, dimensionless 0–1.
   * Solution is considered 'solved' if overlap >= 0.99.
   * See optics-math.skill.md §ModeOverlap.
   */
  overlap: number;

  /** Human-readable summary for the solution table, e.g. "L1: x=245mm, L2: x=512mm" */
  summary: string;
}

interface OptimiserState {
  status: SolverStatus;

  /**
   * All solutions found in the last solver run with overlap >= threshold.
   * May be empty if no solution was found.
   */
  solutions: OptimiserSolution[];

  /**
   * Index into `solutions` of the solution currently previewed on the canvas.
   * Null if no solution is being previewed.
   */
  previewedSolutionIndex: number | null;

  /**
   * Snapshot of lens positions taken immediately before the solver was run.
   * Used to restore positions if the user presses 'Undo'.
   * Null if no solve has been run yet, or if the snapshot has been discarded
   * (after 'Keep' or after the user makes any manual canvas modification).
   */
  preRunSnapshot: Record<string, { x: number; y: number }> | null;

  /**
   * Whether the pre-run snapshot is still valid (i.e. can still be restored).
   * Set to false when 'Keep' is pressed or when any manual canvas change occurs.
   */
  snapshotValid: boolean;
}
```

---

## 7. Root Application State

```typescript
interface AppState {
  /** Table physical dimensions and grid configuration. */
  table: TableConfig;

  /**
   * All optical components placed on the table, keyed by component ID.
   * Insertion order is NOT meaningful for physics; the beam path resolver
   * determines order geometrically.
   *
   * ⚠ DECISION POINT: beam path ordering is resolved spatially (nearest
   * component along current direction wins), not by insertion order.
   * See beam path resolver spec in Layer 1 build notes.
   */
  components: Record<string, OpticalComponent>;

  /**
   * ID of the single light source component, if placed.
   * Null if no source has been placed yet.
   * MVP enforces exactly one source at most.
   */
  sourceId: string | null;

  /**
   * Resolved beam path. Recomputed whenever `components` changes.
   * Null if no source is placed or path is unresolvable.
   */
  beamPath: BeamPath | null;

  /**
   * Physics result of propagating the beam along `beamPath`.
   * Null if beamPath is null or invalid.
   */
  propagationResult: PropagationResult | null;

  /** The target mode for mode-matching. Null if not yet configured. */
  targetMode: TargetMode | null;

  /** State of the mode-matching optimiser. */
  optimiser: OptimiserState;

  /** UI-only: ID of the component currently selected on the canvas. Null if none. */
  selectedComponentId: string | null;
}
```

---

## 8. Derived / Helper Types Reference

These are **not stored in state**. They are computed on demand by utility functions.

| Derived value | Computed from | Where computed |
|---|---|---|
| `gridSpacingMm` | `table.gridStandard` | `tableUtils.ts` |
| `BeamPath` | `components`, `sourceId` | `beamPathResolver.ts` (Layer 1) |
| `PropagationResult` | `BeamPath`, source `q0` | `propagation.ts` (Layer 0) |
| `CavityEigenmode` | `CavityFPComponent` fields | `cavitySolver.ts` (Layer 0) |
| `w(z)` at a point | `PropagationResult.profile` | interpolation in `propagation.ts` |
| Beam corridor geometry | `BeamPath` + `PropagationResult` | canvas renderer (Layer 3) |
| Mode overlap | two `ComplexNumber` q values | `modeOverlap.ts` (Layer 0) |

---

## 9. Invariants the Codebase Must Enforce

These are hard constraints. Any function that writes to `AppState` is responsible for maintaining them.

1. **At most one source.** `sourceId` is never set if another source already exists in `components`.
2. **Locked components are immovable.** Any function that sets `position` must check `locked` first. The optimiser skips components where `locked === true`, regardless of `optimiserCanMove`.
3. **Mirror orientation is restricted.** `FlatMirrorComponent.orientation` and `CurvedMirrorComponent.orientation` may only be `45 | 135 | 225 | 315`. No other values are valid.
4. **Lens/cavity transverse position is on-axis.** When a lens or cavity position is set, the component transverse to the current beam direction must be snapped to the beam line. The beam path resolver enforces this; the UI drag handler must enforce it live.
5. **Snap-to-grid when active.** When `table.snapToGrid` is true, any position written must be rounded to the nearest grid intersection: `round(v / gridSpacingMm) * gridSpacingMm` for both x and y.
6. **Snapshot invalidation.** Setting any `position` on any component (by any means) while `optimiser.snapshotValid === true` must set `optimiser.snapshotValid = false` and `optimiser.preRunSnapshot = null`, unless the position change *is* part of applying an optimiser solution.
7. **Component IDs are immutable.** Once assigned, a component's `id` is never changed or reused.
8. **Cavity eigenmode is cleared on property change.** If `length`, `r1`, or `r2` of a `CavityFPComponent` is modified, `eigenmode` must be set to `null` until the solver is re-run.

---

## 10. Reserved for Future Expansion (do not implement in MVP)

The following fields are explicitly excluded from MVP but are noted here so that schema extensions do not conflict:

- `SourceComponent.astigmatism` — separate waist radii and positions for tangential/sagittal planes
- `LensThinComponent.catalog_id` — reference to a lens catalog entry
- `AppState.components` supporting multiple sources — blocked by invariant 1 until deliberately lifted
- `MirrorOrientation` values `0 | 90 | 180 | 270` — for future back-reflection or straight-through mirror support
- `AppState.history` — undo/redo stack beyond the single optimiser pre-run snapshot
- Any `medium` field on `CavityFPComponent` — for intracavity media (future ring cavities, etc.)
- `CurvedMirrorComponent` and `ComponentKind = 'mirror_curved'` — reserved for future expansion; not part of the implemented MVP schema.ts union