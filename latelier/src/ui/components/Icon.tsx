/**
 * Pictogrammes de l'interface (24 × 24, trait `currentColor`) : dessins originaux simples.
 */
import type { ReactNode } from 'react';

const PATHS = {
  back: <path d="M15 5l-7 7 7 7M8 12h13" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5.5 5.5" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3L5.5 5.5" />
      <circle cx="12" cy="12" r="6.6" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 9.5h1M9.5 9.5h1M13 9.5h1M16.5 9.5h1M6 12.5h1M9.5 12.5h1M13 12.5h1M16.5 12.5h1M8 15.5h8" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M4 4l16 16M9.9 5.8A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.7M6.4 7.5A16.5 16.5 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.4-1.1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  isolate: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M3 8V4.5A1.5 1.5 0 0 1 4.5 3H8M16 3h3.5A1.5 1.5 0 0 1 21 4.5V8M21 16v3.5a1.5 1.5 0 0 1-1.5 1.5H16M8 21H4.5A1.5 1.5 0 0 1 3 19.5V16" />
    </>
  ),
  frame: (
    <>
      <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
      <rect x="8.5" y="8.5" width="7" height="7" rx="1" />
    </>
  ),
  recenter: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    </>
  ),
  explode: (
    <>
      <rect x="9.5" y="9.5" width="5" height="5" rx="0.8" />
      <path d="M8 8L4 4M4 4v3.2M4 4h3.2M16 8l4-4M20 4v3.2M20 4h-3.2M8 16l-4 4M4 20v-3.2M4 20h3.2M16 16l4 4M20 20v-3.2M20 20h-3.2" />
    </>
  ),
  labels: (
    <>
      <path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.4 1.4 0 0 1 0 2l-6.7 6.7a1.4 1.4 0 0 1-2 0z" />
      <circle cx="8" cy="8" r="1.5" />
    </>
  ),
  knolling: (
    <>
      <rect x="3" y="4" width="7.5" height="4" rx="0.8" />
      <rect x="13.5" y="4" width="7.5" height="4" rx="0.8" />
      <rect x="3" y="11" width="4" height="9" rx="0.8" />
      <rect x="9.5" y="11" width="4" height="9" rx="0.8" />
      <circle cx="18.5" cy="13.5" r="2.3" />
      <circle cx="18.5" cy="19" r="1.4" />
    </>
  ),
  xray: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <path d="M12 6.5v11M8 9h8M7.5 12h9M8 15h8" />
    </>
  ),
  section: (
    <>
      <path d="M4 7.5L12 3l8 4.5v9L12 21l-8-4.5z" />
      <path d="M2.5 13.5l19-4" strokeDasharray="2.2 1.8" />
      <path d="M12 12v9" />
    </>
  ),
  neutral: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor" stroke="none" />
    </>
  ),
  reset: (
    <>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4 3.5v4h4" />
    </>
  ),
  showAll: (
    <>
      <path d="M12 3l9 4.5-9 4.5-9-4.5z" />
      <path d="M3 12l9 4.5 9-4.5M3 16.5L12 21l9-4.5" />
    </>
  ),
  chevronRight: <path d="M9 5l7 7-7 7" />,
  chevronLeft: <path d="M15 5l-7 7 7 7" />,
  chevronDown: <path d="M5 9l7 7 7-7" />,
  next: (
    <>
      <path d="M5 5l9 7-9 7z" />
      <path d="M18 5v14" />
    </>
  ),
  prev: (
    <>
      <path d="M19 5l-9 7 9 7z" />
      <path d="M6 5v14" />
    </>
  ),
  check: <path d="M4.5 12.5l5 5 10-11" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="1.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3.5l9.5 16.5h-19z" />
      <path d="M12 10v4.5M12 17.2v.3" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.3" />
    </>
  ),
  box: (
    <>
      <path d="M3 8l9-4.5L21 8v8.5L12 21l-9-4.5z" />
      <path d="M3 8l9 4.5L21 8M12 12.5V21" />
    </>
  ),
  wrench: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" />,
  hand: (
    <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6.5 7-2.6 0-4.2-1.3-5.6-3.4L3.2 15a1.5 1.5 0 0 1 2.4-1.8L8 15.5" />
  ),
  steps: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1.4" />
      <circle cx="4.5" cy="12" r="1.4" />
      <circle cx="4.5" cy="18" r="1.4" />
    </>
  ),
  flip: <path d="M7 4L3 8l4 4M3 8h13a4 4 0 0 1 0 8h-2M17 20l4-4-4-4" />,
  sliders: (
    <>
      <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  home: (
    <>
      <path d="M3.5 11L12 4l8.5 7" />
      <path d="M5.5 9.5V20h13V9.5M10 20v-5.5h4V20" />
    </>
  ),
  play: <path d="M7 4.5l12 7.5-12 7.5z" />,
  radio: (
    <>
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M7 8l10-4.5" />
      <circle cx="15.5" cy="14" r="2.8" />
      <path d="M6 12h4M6 15h4" />
    </>
  ),
  cube: (
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  cut: (
    <>
      <circle cx="6.5" cy="17.5" r="2.8" />
      <circle cx="17.5" cy="17.5" r="2.8" />
      <path d="M8.5 15.5L18 4M15.5 15.5L6 4" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className, title }: { name: IconName; className?: string; title?: string }) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {PATHS[name]}
    </svg>
  );
}

/**
 * Icône SVG fournie sous forme de balisage (outils du catalogue du moteur, texte de confiance
 * produit par le code du projet, jamais par l'utilisateur).
 */
export function SvgMarkup({ markup, className }: { markup: string; className?: string }) {
  return (
    <span
      className={className ? `svg-markup ${className}` : 'svg-markup'}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
