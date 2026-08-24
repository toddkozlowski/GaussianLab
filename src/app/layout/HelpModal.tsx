import { createPortal } from 'react-dom';

interface HelpModalProps {
  onClose: () => void;
}

/**
 * Placeholder help content - intentionally empty for now, pending specific
 * content to populate it with.
 */
export function HelpModal({ onClose }: HelpModalProps) {
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h3>Help</h3>
          <button type="button" className="modal-close-button" aria-label="Close help" onClick={onClose}>
            &times;
          </button>
        </header>
        <div className="modal-body" />
        <footer className="modal-footer">
          <button type="button" onClick={onClose}>Close</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
