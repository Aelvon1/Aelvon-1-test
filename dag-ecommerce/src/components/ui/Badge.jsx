import { cn, yieldDisplay } from './cn';

const VARIANTS = {
  outline: 'border border-fg/30 text-fg',
  solid: 'bg-fg text-bg',
  accent: 'bg-accent text-on-accent',
  muted: 'bg-fg/10 text-fg',
};

/**
 * Étiquette rectangulaire (« Nouveau », « Iconique », « Sur-mesure »…).
 * @param {{ variant?: 'outline'|'solid'|'accent'|'muted', className?: string, children?: import('react').ReactNode }} props
 */
export default function Badge({ variant = 'outline', className, children, ...rest }) {
  return (
    <span
      className={cn(
        yieldDisplay(
          'inline-flex h-6 items-center px-2.5 font-sans text-[0.625rem] font-semibold uppercase leading-none tracking-[0.2em] whitespace-nowrap',
          className,
        ),
        VARIANTS[variant] ?? VARIANTS.outline,
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
