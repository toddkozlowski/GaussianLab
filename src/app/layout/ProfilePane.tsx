import { lazy, Suspense } from 'react';
import { useAppStore } from '../adapters/useAppStore';
import { moveComponentToPathZ } from '../state';
import { HelpPopout } from '../../ui/shared/HelpPopout';
import { ChevronCircleIcon } from '../../ui/shared/icons';

const BeamProfileChart = lazy(() => import('../../ui/profile/BeamProfileChart').then((module) => ({
  default: module.BeamProfileChart,
})));

interface ProfilePaneProps {
  hoveredZMm: number | null;
  onHoverZMm: (zMm: number | null) => void;
  profileOpen: boolean;
  onToggleProfileOpen: () => void;
}

export function ProfilePane({ hoveredZMm, onHoverZMm, profileOpen, onToggleProfileOpen }: ProfilePaneProps) {
  const { state, dispatch } = useAppStore();
  const source = state.sourceId ? state.components[state.sourceId] : null;
  const sourceComponent = source && source.kind === 'source' ? source : null;
  const isJsdomTestEnv =
    typeof window !== 'undefined' &&
    typeof window.navigator !== 'undefined' &&
    /jsdom/i.test(window.navigator.userAgent);

  const handleComponentPathMove = (componentId: string, zMm: number) => {
    const position = moveComponentToPathZ(state, componentId, zMm);
    if (!position) {
      return;
    }
    dispatch({
      type: 'UPDATE_COMPONENT',
      payload: {
        id: componentId,
        updates: { position },
      },
    });
  };

  return (
    <section className="panel profile-panel" aria-labelledby="profile-title">
      <header className={profileOpen ? 'panel-header' : 'panel-header panel-header--collapsed'}>
        <button
          type="button"
          className="mode-matching-header-toggle profile-header-toggle"
          aria-expanded={profileOpen}
          onClick={onToggleProfileOpen}
        >
          <div className="profile-header-title">
            <h2 id="profile-title">Unfolded Beam Profile</h2>
          </div>
          <ChevronCircleIcon direction={profileOpen ? 'down' : 'up'} />
        </button>
        <HelpPopout className="profile-help-popout" summaryAriaLabel="Profile info">
          Drag lens or target markers directly on the 1D profile to slide them along the unfolded
          beam path. The propagation and overlap readout update live during dragging.
        </HelpPopout>
      </header>
      {profileOpen && (
        <div className="panel-body profile-panel-body">
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
                onMoveComponentAlongPath={handleComponentPathMove}
                waistFit={state.waistFit}
              />
            </Suspense>
          )}
        </div>
      )}
    </section>
  );
}
