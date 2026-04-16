---
name: request-plan
description: This prompt is used to request a plan for implementing a new feature or solving a problem. The plan should include a step-by-step outline of the approach, any relevant considerations or constraints, and references to any relevant code or documentation.
model: Claude Opus 4.6
tools: [agent, todo, search, read, web]
---

You are helping me build a web application called GaussianLab — a browser-based Gaussian beam propagation simulator and mode-matching tool for students and researchers. Before doing anything, read the following skill files in full:
optics-math.skill.md — canonical ABCD matrix conventions, q-parameter propagation, cavity eigenmode solver, mode overlap integral, optimizer contract
state-schema.skill.md — TypeScript data structures for table, components, beam path, propagation result (to be written — treat as forthcoming)
consult-example.skill.md — parsed source of a reference implementation in \EXAMPLE; consult for patterns and functionality.
What I want from you now is a complete, executable project plan.

# Application summary:
A React + TypeScript single-page application. The user defines a 2D optical table with configurable dimensions, places optical components (mirrors, lenses, a cavity object, a laser source) on it by drag-and-drop, and the app:
Traces a Gaussian beam through the component sequence using the ABCD matrix formalism defined in optics-math.skill.md
Renders the beam path as a width-scaled corridor on the 2D canvas, including reflections
Displays an "unfolded" 1D beam profile panel showing w(z) continuously along the optical path, with component positions and waist markers. This is the functionality currently performed by the included EXAMPLE project.
Solves for the eigenmode of a user-placed cavity object
Runs a mode-matching optimizer that repositions up to three lenses on the table to maximize overlap between the propagated beam and a user-defined target mode (either a manual waist specification or the cavity eigenmode)
Sequence of components is determined by the order in which the beam encounters them as it propagates, which may differ from the order in which they are placed on the table. The beam path resolver must correctly handle reflections and changes in propagation direction

## Tech stack decisions already made:
React + TypeScript
Konva.js for the 2D canvas (drag, hit-test, snap grid)
Recharts or lightweight Canvas2D for the 1D profile panel
Pure TypeScript math kernel (no external math library) with gradient-free optimizer (Nelder-Mead or bounded grid search for ≤ 3 free parameters)
Vitest for unit tests

## Segmentation contract (do not re-derive, follow this):
Layer 0 — Math kernel: ABCD propagation, cavity solver, overlap integral, optimizer. Pure functions, no UI, fully unit-tested with analytical reference cases before any other layer is built.
Layer 1 — State model: TypeScript schemas, beam path resolver (component list → ordered ABCD sequence), no rendering.
Layer 2 — 2D canvas: table boundary, component placement, drag, rotation in 45° increments, snap grid. No beam drawing yet.
Layer 3 — Beam overlay: draw beam width corridor and reflections on canvas, consuming Layer 0+1 output.
Layer 4 — 1D profile panel: unfolded z-axis plot of w(z), element markers, waist markers.
Layer 5 — Mode matching UI: optimizer controls, cavity object, before/after overlap display. Display of ‘target’ eigenmode on the 1D and 2D displays.

## MVP scope (strictly enforce this):
In scope: flat mirrors (45° rotation increments), thin lenses, cavity object (eigenmode only), Gaussian source (waist size + waist position offset), rectangular table with user-defined dimensions, manual target mode specification, optimizer over ≤ 3 lenses already placed on the table, snapped components. Do not consider things like curved mirrors, astigmatic beams, wavelength-dependent effects, saving/loading layouts, undo/redo, multi-user, or any backend functionality for the MVP.
Explicitly deferred: curved mirror ABCD (use flat mirror with selectable RoC for future), component catalog / lens suggestion, astigmatic beams, wavelength-dependent effects, saving/loading layouts, undo/redo, multi-user, any backend.

## What the project plan must contain:
Folder and file structure — complete, with one-line purpose annotations. Every file that will exist at MVP completion, including test files.
Layer-by-layer build sequence — for each layer: files created, files modified, definition of done (including which unit tests must pass), and explicit list of what is not touched in that layer.
State schema specification — derive and write the complete TypeScript types for the state model as part of the plan. This becomes state-schema.skill.md.
Agent task breakdown — each layer decomposed into individually assignable Copilot agent tasks, each scoped so narrowly that the agent cannot introduce cross-layer concerns. Each task must reference which skill file(s) to consult.
Analytical test cases — for Layer 0, list the specific numerical reference cases (source, setup, expected output) that unit tests will encode. These are the physics regression anchors for the entire project.
Risk register — the five most likely failure modes (wrong sign convention, beam path resolver returning wrong element order on reflection, optimizer getting stuck, canvas coordinate system mismatch with optical axis, etc.) and the mitigation for each.
Copilot agent instruction file — draft the .github/copilot-instructions.md content to include in the repo, governing how the agent must behave when touching optics code, state schema, and canvas code.

## Constraints on your response:
Do not write implementation code. Write the plan.
Do not invent optics conventions. Cite optics-math.skill.md as the authority.
Do not expand MVP scope.
If a decision is genuinely ambiguous, flag it explicitly as a decision point rather than silently resolving it.
The plan must be detailed enough that each agent task could be handed to a stateless agent with only the skill files and the task description and succeed without clarifying questions.


Ask now any and all relevant clarifying questions. Deeply consider assumptions on what the project is supposed to look like and request feedback early to avoid refactoring or reimplementation in the future.
