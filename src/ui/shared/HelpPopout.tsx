import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

// Inline (rather than <img src="...svg">) so the glyph picks up currentColor
// from the surrounding CSS (e.g. dark mode's --text-secondary) - an
// <img>-loaded SVG can't be restyled from the embedding page's CSS.
function HelpIcon() {
  return (
    <svg
      className="icon-glyph"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </svg>
  );
}

interface HelpPopoutProps {
  className?: string;
  summaryAriaLabel: string;
  children: ReactNode;
}

export function HelpPopout({ className, summaryAriaLabel, children }: HelpPopoutProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    // <details> only closes natively via re-clicking the summary; force it
    // closed on any outside click so it behaves like a normal popover.
    function handlePointerDown(event: MouseEvent) {
      const details = detailsRef.current;
      if (details && details.open && !details.contains(event.target as Node)) {
        details.open = false;
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  return (
    <details ref={detailsRef} className={className ? `help-popout ${className}` : 'help-popout'}>
      <summary aria-label={summaryAriaLabel}>
        <HelpIcon />
      </summary>
      <div>{children}</div>
    </details>
  );
}
