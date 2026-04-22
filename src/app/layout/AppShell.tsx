import { useState } from 'react';
import { CanvasPane } from './CanvasPane';
import { ProfilePane } from './ProfilePane';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';

export function AppShell() {
  const [hoveredZMm, setHoveredZMm] = useState<number | null>(null);
  const [showTargetProfile, setShowTargetProfile] = useState(true);

  return (
    <main className="app-shell">
      <section className="workspace" aria-label="GaussianLab workspace">
        <Sidebar
          showTargetProfile={showTargetProfile}
          onToggleTargetProfile={setShowTargetProfile}
        />
        <div className="primary-pane">
          <CanvasPane hoveredZMm={hoveredZMm} onHoverZMm={setHoveredZMm} />
          <ProfilePane
            hoveredZMm={hoveredZMm}
            onHoverZMm={setHoveredZMm}
            showTargetProfile={showTargetProfile}
          />
        </div>
      </section>
      <StatusBar />
    </main>
  );
}
