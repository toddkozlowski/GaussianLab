import { useState } from 'react';
import { CanvasPane } from './CanvasPane';
import { ProfilePane } from './ProfilePane';
import { Sidebar } from './Sidebar';

export function AppShell() {
  const [hoveredZMm, setHoveredZMm] = useState<number | null>(null);

  return (
    <main className="app-shell">
      <section className="workspace" aria-label="GaussianLab workspace">
        <Sidebar />
        <div className="primary-pane">
          <CanvasPane hoveredZMm={hoveredZMm} onHoverZMm={setHoveredZMm} />
          <ProfilePane hoveredZMm={hoveredZMm} onHoverZMm={setHoveredZMm} />
        </div>
      </section>
    </main>
  );
}
