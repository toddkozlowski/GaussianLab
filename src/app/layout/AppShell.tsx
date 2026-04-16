import { CanvasPane } from './CanvasPane';
import { ProfilePane } from './ProfilePane';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';

export function AppShell() {
  return (
    <main className="app-shell">
      <section className="workspace" aria-label="GaussianLab workspace">
        <Sidebar />
        <div className="primary-pane">
          <CanvasPane />
          <ProfilePane />
        </div>
      </section>
      <StatusBar />
    </main>
  );
}
