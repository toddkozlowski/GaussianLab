import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../adapters/useAppStore';
import { useTheme } from '../adapters/useTheme';
import { NumericField } from '../../ui/shared/NumericField';
import { HelpPopout } from '../../ui/shared/HelpPopout';

interface SettingsModalProps {
  onClose: () => void;
}

const MIN_TABLE_DIMENSION_MM = 50;

/**
 * Settings today: the optical table's size, its minimum inter-component
 * spacing, and light/dark theme.
 *
 * Table size: the 2D canvas (Canvas.tsx) already renders reactively off
 * state.table.width/height, so applying here is just a normal
 * UPDATE_TABLE_CONFIG dispatch. Shrinking the table can leave already-placed
 * components positioned outside the new bounds (Canvas doesn't clip or move
 * them), so that case gets a confirmation prompt before the resize is
 * applied.
 *
 * Minimum component spacing: the same UPDATE_TABLE_CONFIG dispatch feeds
 * computeDangerousPairs (the "too close" warning in the component table) and
 * the optimizer's "avoid collisions" legality check - see
 * TableConfig.minComponentSpacingMm. 0 disables the check entirely.
 *
 * Theme: a local UI preference (see theme.ts), not part of the document
 * state, so it applies immediately on toggle rather than waiting on Apply.
 */
export function SettingsModal({ onClose }: SettingsModalProps) {
  const { state, dispatch } = useAppStore();
  const { theme, toggleTheme } = useTheme();
  const [width, setWidth] = useState(state.table.width);
  const [height, setHeight] = useState(state.table.height);
  const [minComponentSpacingMm, setMinComponentSpacingMm] = useState(state.table.minComponentSpacingMm);

  const applySettings = () => {
    const nextWidth = Math.max(MIN_TABLE_DIMENSION_MM, Math.round(width));
    const nextHeight = Math.max(MIN_TABLE_DIMENSION_MM, Math.round(height));
    const nextMinComponentSpacingMm = Math.max(0, minComponentSpacingMm);

    const strandedLabels = Object.values(state.components)
      .filter((component) => component.position.x > nextWidth || component.position.y > nextHeight)
      .map((component) => component.label);

    if (strandedLabels.length > 0) {
      const confirmed = window.confirm(
        `Shrinking the table to ${nextWidth} x ${nextHeight} mm will leave ${strandedLabels.length} ` +
          `component(s) outside the new bounds: ${strandedLabels.join(', ')}. Continue anyway?`,
      );
      if (!confirmed) {
        return;
      }
    }

    dispatch({
      type: 'UPDATE_TABLE_CONFIG',
      payload: { width: nextWidth, height: nextHeight, minComponentSpacingMm: nextMinComponentSpacingMm },
    });
    onClose();
  };

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h3>Settings</h3>
          <button type="button" className="modal-close-button" aria-label="Close settings" onClick={onClose}>
            &times;
          </button>
        </header>
        <div className="modal-body">
          <label className="settings-toggle-row">
            <span>Dark mode</span>
            <span className="switch">
              <input
                type="checkbox"
                checked={theme === 'dark'}
                onChange={toggleTheme}
                aria-label="Toggle dark mode"
              />
              <span className="switch-track">
                <span className="switch-thumb" />
              </span>
            </span>
          </label>
          <hr className="modal-divider" />
          <label>
            Table width (mm)
            <NumericField value={width} format={(value) => String(Math.round(value))} onCommit={setWidth} />
          </label>
          <label>
            Table height (mm)
            <NumericField value={height} format={(value) => String(Math.round(value))} onCommit={setHeight} />
          </label>
          <hr className="modal-divider" />
          <div className="settings-field">
            <span className="settings-field-title">
              Minimum component spacing (mm)
              <HelpPopout className="settings-help-popout" summaryAriaLabel="What is minimum component spacing?">
                The minimum allowed gap between optical elements before a "too close" warning is
                flagged. This is also the spacing used when "Avoid collisions" is enabled, to keep
                the auto-optimizer from placing lenses too close together.
              </HelpPopout>
            </span>
            <NumericField
              aria-label="Minimum component spacing (mm)"
              value={minComponentSpacingMm}
              onCommit={(value) => setMinComponentSpacingMm(Math.max(0, value))}
            />
          </div>
        </div>
        <footer className="modal-footer">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" onClick={applySettings}>Apply</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
