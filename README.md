# GaussianLab

GaussianLab is a browser-based Gaussian beam propagation and mode-matching workbench for optical table layouts.

## Current status

The repository now includes the initial Vite + React + TypeScript scaffold for the web application. Phase 0 is focused on creating a stable shell, test runner, and repo instructions before the optics kernel and state model are implemented.

## Planned MVP layers

1. Layer 0: pure TypeScript math kernel for ABCD propagation, cavity solving, overlap, and bounded optimisation.
2. Layer 1: state schema, beam-path resolver, and derived simulation outputs.
3. Layer 2: 2D optical table with placement, snapping, and rotation.
4. Layer 3: live beam corridor overlay on the 2D table.
5. Layer 4: unfolded 1D beam profile panel.
6. Layer 5: target-mode and mode-matching solver controls.

## Commands

- `npm install`
- `npm run dev`
- `npm run build`
- `npm test`

## Local playbook

Use this to run the app locally and exercise the current MVP end-to-end.

1. Install dependencies:
	`npm install`
2. Start the dev server:
	`npm run dev`
3. Open the local URL shown in the terminal (usually `http://localhost:5173`).

### What to try in the UI

1. In Component Palette, add source, lens, mirror, and cavity components.
2. Drag components on the table canvas and confirm live updates:
	- Beam corridor overlay (Layer 3)
	- Unfolded beam profile plot (Layer 4)
3. In Mode Matching:
	- Set manual target waist radius and waist z, then click Use manual target.
	- Click Run optimizer.
	- Click Preview and Apply on generated solutions.
4. Watch Status Bar update for path, overlap, and solver status.

### Useful verification commands

- Run tests: `npm test`
- Run production build: `npm run build`

## Reference material

- `.github/skills/optics-math/SKILL.md`
- `.github/skills/state-schema/SKILL.md`
- `EXAMPLE/`
