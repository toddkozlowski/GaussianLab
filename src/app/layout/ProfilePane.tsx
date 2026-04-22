import { lazy, Suspense } from 'react';
import { useAppStore } from '../adapters/useAppStore';

const BeamProfileChart = lazy(() => import('../../ui/profile/BeamProfileChart').then((module) => ({
  default: module.BeamProfileChart,
})));

interface ProfilePaneProps {
  hoveredZMm: number | null;
  onHoverZMm: (zMm: number | null) => void;
  showTargetProfile: boolean;
}

export function ProfilePane({ hoveredZMm, onHoverZMm, showTargetProfile }: ProfilePaneProps) {
  const { state } = useAppStore();
  const source = state.sourceId ? state.components[state.sourceId] : null;
  const sourceComponent = source && source.kind === 'source' ? source : null;
  const isJsdomTestEnv =
    typeof window !== 'undefined' &&
    typeof window.navigator !== 'undefined' &&
    /jsdom/i.test(window.navigator.userAgent);

  return (
    <section className="panel" aria-labelledby="profile-title">
      <header className="panel-header">
        <div>
          <h2 id="profile-title">Unfolded Beam Profile</h2>
          <p>Live beam radius profile w(z) with waist markers.</p>
        </div>
      </header>
      <div className="panel-body">
        {isJsdomTestEnv ? (
          <div className="profile-placeholder">Profile chart unavailable in test environment.</div>
        ) : (
          <Suspense fallback={<div className="profile-placeholder">Loading profile chart...</div>}>
            <BeamProfileChart
              source={sourceComponent}
              beamPath={state.beamPath}
              propagationResult={state.propagationResult}
              components={state.components}
              targetMode={state.targetMode}
              hoveredZMm={hoveredZMm}
              onHoverZMm={onHoverZMm}
              showTargetProfile={showTargetProfile}
            />
          </Suspense>
        )}
      </div>
    </section>
  );
}
