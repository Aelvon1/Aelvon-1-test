import { cn } from './cn';

/**
 * Choix exclusif présenté en carte (mode de livraison, moyen de paiement…).
 * Regroupez les cartes d'un même choix dans un <fieldset> avec <legend> et donnez-leur le même `name`.
 * @param {{
 *   title: import('react').ReactNode, description?: import('react').ReactNode,
 *   meta?: import('react').ReactNode, className?: string, children?: import('react').ReactNode
 * } & import('react').InputHTMLAttributes<HTMLInputElement>} props
 *   meta : contenu aligné à droite (prix, délai) · children : contenu libre sous la description
 *   + name, value, checked, onChange, disabled… transmis à l'<input type="radio">
 */
export default function RadioCard({ title, description, meta, className, children, ...rest }) {
  return (
    <label
      className={cn(
        'group/radio relative flex cursor-pointer items-start gap-4 border border-fg/25 p-5 transition-colors duration-300',
        'hover:border-fg/55 has-[:checked]:border-fg has-[:checked]:bg-fg/[0.04]',
        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-accent',
        'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-45',
        className,
      )}
    >
      <input type="radio" {...rest} className="peer sr-only" />
      <span
        aria-hidden="true"
        className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-fg/45 transition-colors duration-300 group-has-[:checked]/radio:border-accent"
      >
        <span className="size-2.5 scale-0 rounded-full bg-accent transition-transform duration-500 ease-luxe group-has-[:checked]/radio:scale-100" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] font-medium leading-snug">{title}</span>
        {description ? <span className="mt-1 block text-[0.8125rem] leading-snug text-muted">{description}</span> : null}
        {children}
      </span>
      {meta != null ? <span className="shrink-0 text-[0.9375rem] tabular-nums">{meta}</span> : null}
    </label>
  );
}
