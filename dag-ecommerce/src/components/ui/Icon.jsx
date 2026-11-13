import { ICONS } from './icon-paths';

/**
 * Icône filaire du jeu DAG.
 * @param {{ name: string, size?: number|string, strokeWidth?: number, title?: string, className?: string }} props
 *   name : voir ICON_NAMES · size : côté en px (défaut 20) · strokeWidth : défaut 1.25
 *   title : nom accessible ; sans titre l'icône est décorative (aria-hidden)
 */
export default function Icon({ name, size = 20, strokeWidth = 1.25, title, className, ...rest }) {
  const icon = ICONS[name];
  if (!icon) return null;
  const labelled = Boolean(title);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={icon.filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? title : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
      className={`shrink-0 ${className ?? ''}`}
      {...rest}
    >
      {icon.d.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
