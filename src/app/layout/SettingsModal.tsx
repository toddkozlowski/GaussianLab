import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../adapters/useAppStore';
import { useTheme } from '../adapters/useTheme';
import { NumericField } from '../../ui/shared/NumericField';

interface SettingsModalProps {
  onClose: () => void;
}

const MIN_TABLE_DIMENSION_MM = 50;

/**
 * Settings today: the optical table's size, and light/dark theme.
 *
 * Table size: the 2D canvas (Canvas.tsx) already renders reactively off
 * state.table.width/height, so applying here is just a normal
 * UPDATE_TABLE_CONFIG dispatch. Shrinking the table can leave already-placed
 * components positioned outside the new bounds (Canvas doesn't clip or move
 * them), so that case gets a confirmation prompt before the resize is
 * applied.
 *
 * Theme: a local UI preference (see theme.ts), not part of the document
 * state, so it applies immediately on toggle rather than waiting on Apply.
 */
export function SettingsModal({ onClose }: SettingsModalProps) {
  const { state, dispatch } = useAppStore();
  const { theme, toggleTheme } = useTheme();
  const [width, setWidth] = useState(state.table.width);
  const [height, setHeight] = useState(state.table.height);

  const applyTableSize = () => {
    const nextWidth = Math.max(MIN_TABLE_DIMENSION_MM, Math.round(width));
    const nextHeight = Math.max(MIN_TABLE_DIMENSION_MM, Math.round(height));

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

    dispatch({ type: 'UPDATE_TABLE_CONFIG', payload: { width: nextWidth, height: nextHeight } });
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
        </div>
        <footer className="modal-footer">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" onClick={applyTableSize}>Apply</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
