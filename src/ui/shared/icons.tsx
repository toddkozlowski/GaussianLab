// Inline (rather than <img src="...svg">) so these icons can recolor via
// currentColor - an <img>-loaded SVG renders in an isolated context and can't
// be restyled from the embedding page's CSS, which left them black-on-dark in
// dark mode regardless of the surrounding .icon-button's text color.

type IconProps = { className?: string };

const baseSvgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function LockIcon({ locked, className = 'icon-glyph' }: { locked: boolean } & IconProps) {
  return (
    <svg className={className} {...baseSvgProps}>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      {locked ? <path d="M7 11V7a5 5 0 0 1 10 0v4" /> : <path d="M7 11V7a5 5 0 0 1 9.9-1" />}
    </svg>
  );
}

export function ZoomInIcon({ className = 'icon-glyph' }: IconProps) {
  return (
    <svg className={className} {...baseSvgProps}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" x2="16.65" y1="21" y2="16.65" />
      <line x1="11" x2="11" y1="8" y2="14" />
      <line x1="8" x2="14" y1="11" y2="11" />
    </svg>
  );
}

export function ZoomOutIcon({ className = 'icon-glyph' }: IconProps) {
  return (
    <svg className={className} {...baseSvgProps}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" x2="16.65" y1="21" y2="16.65" />
      <line x1="8" x2="14" y1="11" y2="11" />
    </svg>
  );
}

export function SearchIcon({ className = 'icon-glyph' }: IconProps) {
  return (
    <svg className={className} {...baseSvgProps}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" x2="16.65" y1="21" y2="16.65" />
    </svg>
  );
}

export function FullscreenIcon({ className = 'icon-glyph' }: IconProps) {
  return (
    <svg className={className} {...baseSvgProps}>
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <rect width="10" height="8" x="7" y="8" rx="1" />
    </svg>
  );
}

export function EyeIcon({ className = 'icon-glyph' }: IconProps) {
  return (
    <svg className={className} {...baseSvgProps}>
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function EyeOffIcon({ className = 'icon-glyph' }: IconProps) {
  return (
    <svg className={className} {...baseSvgProps}>
      <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
      <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
      <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
      <path d="m2 2 20 20" />
    </svg>
  );
}

export function RotateCcwIcon({ className = 'icon-glyph' }: IconProps) {
  return (
    <svg className={className} {...baseSvgProps}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

export function RotateCwIcon({ className = 'icon-glyph' }: IconProps) {
  return (
    <svg className={className} {...baseSvgProps}>
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}

export function ChevronCircleIcon({ direction, className = 'icon-glyph' }: { direction: 'up' | 'down' } & IconProps) {
  return (
    <svg className={className} {...baseSvgProps}>
      <circle cx="12" cy="12" r="10" />
      <path d={direction === 'up' ? 'm8 14 4-4 4 4' : 'm16 10-4 4-4-4'} />
    </svg>
  );
}

export function TrashIcon({ className = 'icon-glyph' }: IconProps) {
  return (
    <svg className={className} {...baseSvgProps}>
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
