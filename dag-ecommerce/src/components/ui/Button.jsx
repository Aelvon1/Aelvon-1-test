import { Link } from 'react-router-dom';
import Icon from './Icon';
import { cn, yieldDisplay } from './cn';

const SIZES = {
  sm: 'min-h-11 px-5 py-2.5 gap-2.5 text-[0.6875rem] tracking-[0.2em]',
  md: 'min-h-13 px-7 py-3 gap-3 text-[0.6875rem] tracking-[0.22em]',
  lg: 'min-h-15 px-9 py-4 gap-3.5 text-xs tracking-[0.22em]',
};

// [repos, voile qui monte au survol]
const VARIANTS = {
  primary: ['bg-accent text-on-accent hover:text-bg', 'bg-fg'],
  solid: ['bg-fg text-bg hover:text-on-accent', 'bg-accent'],
  outline: ['border border-fg/40 text-fg hover:border-fg hover:text-bg', 'bg-fg'],
  ghost: ['text-fg', 'bg-fg/10'],
};

/**
 * Bouton rectangulaire à libellé en capitales espacées.
 * Rend un <Link> (prop `to`), un <a> (prop `href`) ou un <button>.
 * @param {{
 *   variant?: 'primary'|'solid'|'outline'|'ghost', size?: 'sm'|'md'|'lg',
 *   to?: import('react-router-dom').To, href?: string, type?: 'button'|'submit'|'reset',
 *   icon?: string, iconPosition?: 'left'|'right', loading?: boolean, fullWidth?: boolean,
 *   disabled?: boolean, className?: string, children?: import('react').ReactNode
 * }} props  + tous les attributs natifs (onClick, aria-*, target, state…)
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  to,
  href,
  type = 'button',
  icon,
  iconPosition = 'right',
  loading = false,
  fullWidth = false,
  disabled = false,
  className,
  children,
  ...rest
}) {
  const [base, veil] = VARIANTS[variant] ?? VARIANTS.primary;
  const inactive = disabled || loading;
  const iconSize = size === 'lg' ? 18 : 16;

  const classes = cn(
    // une classe d'affichage de l'appelant (« hidden sm:inline-flex ») remplace « inline-flex »
    yieldDisplay(
      'group/btn relative isolate inline-flex items-center justify-center overflow-hidden text-center font-sans font-semibold uppercase leading-tight',
      className,
    ),
    'transition-[color,border-color,opacity] duration-500 ease-luxe select-none',
    SIZES[size] ?? SIZES.md,
    base,
    fullWidth ? 'w-full' : 'w-fit',
    inactive && 'pointer-events-none',
    disabled && 'opacity-40',
    className,
  );

  const adornment = loading ? (
    <span
      aria-hidden="true"
      className="size-4 shrink-0 animate-spin-slow rounded-full border border-current border-t-transparent"
    />
  ) : icon ? (
    <Icon
      name={icon}
      size={iconSize}
      className={cn(
        'transition-transform duration-500 ease-luxe',
        iconPosition === 'right' ? 'group-hover/btn:translate-x-1' : 'group-hover/btn:-translate-x-1',
      )}
    />
  ) : null;

  const content = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-0 -z-10 origin-bottom scale-y-0 transition-transform duration-700 ease-luxe group-hover/btn:scale-y-100',
          veil,
        )}
      />
      {iconPosition === 'left' ? adornment : null}
      <span>{children}</span>
      {iconPosition === 'right' ? adornment : null}
    </>
  );

  if (to != null && !inactive) {
    return (
      <Link to={to} className={classes} {...rest}>
        {content}
      </Link>
    );
  }

  if (href != null && !inactive) {
    const external = rest.target === '_blank';
    return (
      <a href={href} className={classes} rel={external ? 'noopener noreferrer' : undefined} {...rest}>
        {content}
      </a>
    );
  }

  return (
    <button type={type} className={classes} disabled={inactive} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  );
}
