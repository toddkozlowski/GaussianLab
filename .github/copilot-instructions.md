# GaussianLab Agent Instructions

- Use .github/skills/optics-math/SKILL.md as the authority for Gaussian beam formulas, sign conventions, ABCD matrix order, cavity stability, and overlap calculations.
- Use .github/skills/state-schema/SKILL.md as the authority for AppState shape, units in persisted state, and invariants.
- Treat EXAMPLE/ as a read-only reference implementation. Consult it for parity and regression ideas, but do not copy C++ structure or large code blocks into the TypeScript app.
- Preserve the layer contract:
  - src/math is pure and framework-free.
  - src/app/state may depend on src/math but not on React, Konva, or Recharts.
  - UI layers consume derived outputs and must not reimplement optics calculations.
- Persisted state uses millimetres for lengths and nanometres for wavelength. Convert to SI units only at the math-kernel boundary.
- MVP flat mirrors change beam direction geometrically but do not contribute focusing power.
- Beam encounter order is geometric, never insertion order.
- Off-axis lenses and cavities are ignored until they are within the configurable beam-axis capture threshold, then drag logic snaps them onto the axis.
- Beam/path/profile/overlap update live during manual dragging. The optimiser runs only when explicitly invoked by the user.
- Any cavity geometry change clears its cached eigenmode.
- Any manual position change invalidates optimiser snapshots unless the change is part of previewing or applying a solver result.
- When changing optics code, add or update regression tests first when practical.
