import { Link } from 'react-router-dom';
import Icon from './Icon';
import { cn, yieldDisplay } from './cn';

const ARROWS = { right: 'arrow-right', left: 'arrow-left', 'up-right': 'arrow-up-right', down: 'arrow-down' };

const TONES = {
  inherit: '',
  fg: 'text-fg',
  muted: 'text-muted hover:text-fg',
  accent: 'text-accent',
};

/**
 * Lien de texte au filet animé.
 * @param {{
 *   to?: import('react-router-dom').To, href?: string, onClick?: Function,
 *   variant?: 'inline'|'label', underline?: 'hover'|'always',
 *   arrow?: boolean|'right'|'left'|'up-right'|'down', tone?: 'inherit'|'fg'|'muted'|'accent',
 *   className?: string, children?: import('react').ReactNode
 * }} props
 *   variant « inline » : hérite de la typographie du texte · « label » : petites capitales
 *   espacées, zone tactile de 44 px (appels à l'action isolés).
 *   Sans `to` ni `href`, rend un <button type="button">.
 */
export default function TextLink({
  to,
  href,
  variant = 'inline',
  underline = 'hover',
  arrow = false,
  tone = 'inherit',
  className,
  children,
  ...rest
}) {
  const arrowName = arrow ? (ARROWS[arrow === true ? 'right' : arrow] ?? 'arrow-right') : null;
  const leading = arrowName === 'arrow-left';

  const classes = cn(
    // une classe d'affichage de l'appelant (« hidden sm:inline-flex ») remplace « inline-flex »
    yieldDisplay('group/link inline-flex items-center transition-colors duration-500 ease-luxe', className),
    variant === 'label'
      ? 'min-h-11 gap-3 font-sans text-[0.6875rem] font-semibold uppercase tracking-[0.22em]'
      : 'gap-2 align-baseline',
    TONES[tone] ?? '',
    className,
  );

  const arrowIcon = arrowName ? (
    <Icon
      name={arrowName}
      size={variant === 'label' ? 16 : '1em'}
      className={cn(
        'transition-transform duration-500 ease-luxe',
        leading && 'group-hover/link:-translate-x-1',
        arrowName === 'arrow-right' && 'group-hover/link:translate-x-1',
        arrowName === 'arrow-up-right' && 'group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5',
        arrowName === 'arrow-down' && 'group-hover/link:translate-y-0.5',
      )}
    />
  ) : null;

  const content = (
    <>
      {leading ? arrowIcon : null}
      <span
        className={cn(
          underline === 'always' ? 'link-underline-always' : 'link-underline',
          variant === 'label' && '[--underline-trim:0.22em]',
        )}
      >
        {children}
      </span>
      {leading ? null : arrowIcon}
    </>
  );

  if (to != null) {
    return (
      <Link to={to} className={classes} {...rest}>
        {content}
      </Link>
    );
  }

  if (href != null) {
    const external = rest.target === '_blank';
    return (
      <a href={href} className={classes} rel={external ? 'noopener noreferrer' : undefined} {...rest}>
        {content}
      </a>
    );
  }

  return (
    <button type="button" className={cn(classes, 'text-left')} {...rest}>
      {content}
    </button>
  );
}
