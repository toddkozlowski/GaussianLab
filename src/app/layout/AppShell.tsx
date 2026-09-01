import { useState } from 'react';
import { CanvasPane } from './CanvasPane';
import { ProfilePane } from './ProfilePane';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';

export function AppShell() {
  const [hoveredZMm, setHoveredZMm] = useState<number | null>(null);
  const [profileOpen, setProfileOpen] = useState(true);

  return (
    <main className="app-shell">
      <section className="workspace" aria-label="GaussianLab workspace">
        <Sidebar />
        <div
          className="primary-pane"
          style={{ gridTemplateRows: profileOpen ? 'minmax(280px, 1.15fr) minmax(220px, 0.95fr)' : '1fr auto' }}
        >
          <CanvasPane hoveredZMm={hoveredZMm} onHoverZMm={setHoveredZMm} />
          <ProfilePane
            hoveredZMm={hoveredZMm}
            onHoverZMm={setHoveredZMm}
            profileOpen={profileOpen}
            onToggleProfileOpen={() => setProfileOpen((open) => !open)}
          />
        </div>
      </section>
      <StatusBar />
    </main>
  );
}
