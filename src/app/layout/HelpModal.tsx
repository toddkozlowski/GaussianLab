import { useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface HelpModalProps {
  onClose: () => void;
}

interface HelpSection {
  id: string;
  title: string;
  content: ReactNode;
}

const SECTIONS: HelpSection[] = [
  { id: 'get-started', title: 'Get Started', content: <GetStartedSection /> },
  { id: 'components', title: 'Components', content: <ComponentsSection /> },
  { id: 'mode-matching', title: 'Mode Matching', content: <ModeMatchingSection /> },
  { id: 'about', title: 'About', content: <AboutSection /> },
];

/**
 * Left-hand section list + right-hand content pane. The active section's nav
 * button shares the content pane's exact background color (see
 * .help-nav-item--active / .help-content in styles.css) so it reads as a
 * folder tab fused onto the panel it's showing, rather than a separate
 * button that merely toggles content elsewhere.
 */
export function HelpModal({ onClose }: HelpModalProps) {
  const [activeId, setActiveId] = useState(SECTIONS[0].id);
  const activeSection = SECTIONS.find((section) => section.id === activeId) ?? SECTIONS[0];

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog help-modal-dialog" onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h3>Help</h3>
          <button type="button" className="modal-close-button" aria-label="Close help" onClick={onClose}>
            &times;
          </button>
        </header>
        <div className="help-modal-body">
          <nav className="help-nav">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                className={section.id === activeId ? 'help-nav-item help-nav-item--active' : 'help-nav-item'}
                aria-current={section.id === activeId}
                onClick={() => setActiveId(section.id)}
              >
                {section.title}
              </button>
            ))}
          </nav>
          <div className="help-content">{activeSection.content}</div>
        </div>
        <footer className="modal-footer">
          <button type="button" onClick={onClose}>Close</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function GetStartedSection() {
  return (
    <>
      <p>
        GaussianLab lays out a virtual optical table and propagates a Gaussian laser beam through
        it in real time. Four things are worth understanding before you start moving parts around.
      </p>

      <h4>Adding components</h4>
      <p>
        Use the "+" buttons above the component table (Mirror, Lens, Cavity, Target, Beam Stop,
        Custom Object) to drop a new part onto the table, or drag any existing part directly on
        the 2D canvas. Components snap onto the beam axis when dragged close to it, and otherwise
        snap to the table's grid (grid spacing and snapping can be changed in Settings). Click a
        part - on the canvas or in the component table - to select it and edit its properties in
        the popup card.
      </p>

      <h4>The 2D table view</h4>
      <p>
        The canvas shows every component on a physical, top-down layout in millimetres, tracing
        the beam path (the orange line) as it reflects and refracts through the table. Scroll (or
        a two-finger trackpad swipe) pans the view; Ctrl/Cmd + scroll (or a pinch gesture) zooms
        toward the pointer. The zoom controls in the canvas's bottom-left corner zoom in/out and
        reset the view. Dragging a part on the canvas repositions it; dragging empty table space
        pans instead.
      </p>

      <h4>The unfolded beam-path view</h4>
      <p>
        A real table folds the beam back and forth with mirrors, which makes the beam's size hard
        to read directly off a top-down layout. The "Unfolded Beam Profile" panel straightens
        every reflection into a single line, plotting beam radius w against distance travelled z
        (mm) from the source - so waist size and position read directly off the chart no matter
        how many times the physical beam bends.
      </p>

      <h4>The mode-matching solver</h4>
      <p>
        Covered in full in the Mode Matching tab. In short: mark a cavity or a Target component as
        the mode you want to couple into, and the solver repositions your movable lenses to
        maximize the beam's overlap with that mode.
      </p>
    </>
  );
}

function ComponentsSection() {
  return (
    <>
      <p>
        Every component sits at a position on the table (mm) and can be locked in place. Optically,
        each is represented as an <strong>ABCD matrix</strong>; the beam's Gaussian state is carried
        from one to the next as a complex <strong>q-parameter</strong>, transformed at each element
        by q<sub>out</sub> = (A·q<sub>in</sub> + B) / (C·q<sub>in</sub> + D). Every beam radius shown
        in the app - at the source, on the profile chart, at a target - is the{' '}
        <strong>1/e² intensity radius</strong>: the radius at which the beam's intensity has fallen
        to 1/e² (≈13.5%) of its on-axis peak, the standard convention for Gaussian beams.
      </p>

      <h4>Source</h4>
      <p>
        Originates the beam. It isn't itself an ABCD element - it just sets the beam's initial
        q-parameter from its waist size, the waist's position relative to the source, and
        wavelength.
      </p>
      <ul>
        <li>Waist radius w₀ (µm, 1/e² definition)</li>
        <li>Waist z-offset (mm) - how far the beam's true waist sits from the source's own position; negative if the waist is upstream of the source</li>
        <li>Wavelength (nm)</li>
        <li>Direction - the beam's initial travel direction</li>
      </ul>

      <h4>Flat Mirror</h4>
      <p>
        Redirects the beam 90° without focusing it. A flat mirror's ABCD matrix is the identity,
        [[1, 0], [0, 1]] - purely a change of direction, with no effect on the beam's size or
        curvature.
      </p>
      <ul>
        <li>Orientation (45° / 135° / 225° / 315°) - which of the two incoming directions the reflective face accepts, and which direction it turns the beam into</li>
      </ul>

      <h4>Thin Lens</h4>
      <p>
        Focuses or diverges the beam. Modeled as an idealized thin lens - zero physical thickness -
        with ABCD = [[1, 0], [−1/f, 1]]. Positive focal length converges the beam; negative
        diverges it.
      </p>
      <ul>
        <li>Focal length f (mm)</li>
        <li>"Allow optimizer to move" - whether the mode-matching solver may reposition this lens</li>
        <li>Sensitivity (%/mm², read-only) - see Mode Matching</li>
      </ul>

      <h4>Cavity (Fabry–Pérot)</h4>
      <p>
        A two-mirror resonator. Rather than tracing a single pass through it, GaussianLab solves
        for the cavity's own self-consistent <strong>eigenmode</strong>: the one Gaussian beam
        shape that reproduces itself after a full round trip. For round-trip matrix
        M = [[A, B], [C, D]], the eigenmode's q-parameter satisfies
        C·q² + (D−A)·q − B = 0; the physical root (positive imaginary part) is then converted to a
        waist size and position via 1/q = 1/R − iλ/(πw²). The cavity is stable only if
        0 ≤ g₁·g₂ ≤ 1, where g = 1 − L/R for each mirror (L = cavity length, R = that mirror's
        radius of curvature) - an unstable cavity has no finite eigenmode and is flagged as such.
      </p>
      <ul>
        <li>Length (mm) - mirror separation</li>
        <li>R1, R2 (mm) - radius of curvature of each mirror; toggle "flat" for an infinite radius</li>
        <li>Direction</li>
        <li>"Show mode projection" - overlays this cavity's eigenmode across the whole beam profile, for comparison against the incoming beam</li>
      </ul>

      <h4>Target</h4>
      <p>
        A marker, not a physical part - it has no effect on the beam. It exists purely to define a
        desired waist size at a position, giving the solver (and the live overlap readout)
        something to mode-match the incoming beam against.
      </p>
      <ul>
        <li>Waist radius (µm, 1/e² definition) - the target size you're aiming for</li>
        <li>"Show mode projection"</li>
      </ul>

      <h4>Beam Stop</h4>
      <p>
        An opaque block. Fully absorbs the beam wherever it sits, terminating propagation right
        there - there is nothing downstream of it. No optical properties.
      </p>

      <h4>Custom Object</h4>
      <p>
        A flat-faced dielectric slab (e.g. a window or crystal) of thickness t and refractive
        index n. The beam passes straight through undeviated - both faces are assumed flat, at
        normal incidence - but a higher index shortens the beam's effective optical path through
        the material, modeled as ABCD = [[1, t/n], [0, 1]] rather than the physical thickness t.
        At n = 1 the slab is optically inert (t/n = t, no effect on the beam), though it still
        occupies physical space for the "too close" spacing check.
      </p>
      <ul>
        <li>Index of refraction n</li>
        <li>Thickness (mm)</li>
      </ul>
    </>
  );
}

function ModeMatchingSection() {
  return (
    <>
      <h4>What it does</h4>
      <p>
        Mode matching means shaping the beam so its waist size and position line up with some
        target Gaussian mode - typically a cavity you want to couple light into. Pick a Cavity or
        Target component from the "Target" dropdown, and GaussianLab continuously computes the
        overlap between the beam arriving there and that target mode. The solver's job is to
        reposition your lenses - it never changes a focal length - to push that overlap toward
        100%.
      </p>
      <p>
        Note what's deliberately <em>not</em> modeled: mode matching here is purely a function of
        the beam's longitudinal Gaussian parameters - waist size and waist position along the
        axis. Transverse and angular alignment (the beam actually landing on-axis and pointed the
        right way) is a separate, real-world concern this tool doesn't simulate.
      </p>

      <h4>Running it</h4>
      <p>
        Any thin lens with "Allow optimizer to move" enabled and not locked counts as movable, up
        to 3 at once (more would make the search combinatorially slow enough to risk stalling the
        browser). Press "Run optimizer" and GaussianLab runs a coarse grid search over each
        movable lens's allowed range to find promising starting points, then refines the best of
        those with a derivative-free Nelder-Mead simplex search to polish each into a local
        optimum. Multiple ranked candidate solutions are kept - not just the single best - each
        listing its resulting overlap % and a max sensitivity figure, so you can weigh a slightly
        lower-overlap solution that's far more tolerant of small placement errors against a
        sharper, less forgiving optimum. Click "Apply" on whichever candidate you want to move
        your lenses to.
      </p>

      <h4>Constraining the search</h4>
      <ul>
        <li>
          <strong>Manual adjustment ranges</strong> restrict where movable lenses are allowed to
          land, as z-windows (mm, Start/Stop) along the <em>unfolded</em> beam path rather than
          physical (x, y) - so a single range can validly span across a mirror bend. Use this to
          match real rail travel limits on your bench, or to keep a lens on a specific side of
          another part.
        </li>
        <li>
          <strong>Avoid collisions</strong>, when enabled, discards any candidate placement that
          would trigger the same "too close" warning used elsewhere in the app (see the Minimum
          component spacing setting) - the solver simply won't propose cramming a lens right up
          against another component.
        </li>
        <li>
          Lock a lens, or turn off its "Allow optimizer to move," to hold it fixed while letting
          others move.
        </li>
      </ul>

      <h4>Sensitivity</h4>
      <p>
        For each movable lens, GaussianLab reports how sharply overlap falls off for a small nudge
        in that lens's position - the curvature of overlap (%) with respect to position (mm), in
        %/mm². A low number means the mode match tolerates some placement error; a high number
        means it's a knife-edge worth double-checking on the real bench.
      </p>

      <h4>The math</h4>
      <p>
        Overlap is computed from each beam's waist size w₀ and absolute waist position z₀. Each
        waist first converts to a Rayleigh range, z<sub>R</sub> = π·w₀² / λ. The power-coupling
        overlap between beam 1 and beam 2 is then:
      </p>
      <p className="help-equation">
        O² = 4·z<sub>R1</sub>·z<sub>R2</sub> / [ (z<sub>01</sub> − z<sub>02</sub>)² + (z<sub>R1</sub> + z<sub>R2</sub>)² ]
      </p>
      <p>
        O (0 to 1) is the field overlap; O² is the fraction of the beam's power actually coupled
        into the target mode - this is what's shown everywhere as a percentage. The result is
        reference-plane independent (it gives the same answer no matter where along the path it's
        evaluated) and only reaches its maximum of 100% when both beams share the same waist size{' '}
        <em>and</em> the same waist position - matching only one of the two still leaves overlap
        below 100%.
      </p>
    </>
  );
}

function AboutSection() {
  return (
    <>
      <h4>About GaussianLab</h4>
      <p>This website was created to serve as the mode matching tool that I wish I had when I 
        was a PhD student designing optical set ups to couple lasers to cavities. This tool is built on 
        the legacy of software like JAMMT (Just Another Mode-Matching Tool) and GaussianBeam, but
        built for a native-browser, user-friendly experience.</p>

        <p>If you have any comments, suggestions, or general feeback, please feel free to reach out at 
          todd.gaussianlab@gmail.com</p>
        </>
  );
}