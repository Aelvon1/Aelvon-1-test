import { useId, useState } from 'react';
import { AnimatePresence, motion as Motion, useReducedMotion } from 'motion/react';
import { EASE_LUXE } from './motion-presets';
import { cn } from './cn';

/**
 * Liste de sections repliables (FAQ, détails produit…).
 * @param {{
 *   items: Array<{ id: string, title: import('react').ReactNode, content: import('react').ReactNode }>,
 *   type?: 'single'|'multiple', defaultOpen?: string|string[], headingLevel?: 2|3|4|5|6,
 *   numbered?: boolean, className?: string
 * }} props
 *   type « single » : une seule section ouverte à la fois · defaultOpen : id(s) ouverts au départ
 *   numbered : affiche 01, 02… devant chaque titre
 */
export default function Accordion({
  items = [],
  type = 'single',
  defaultOpen = [],
  headingLevel = 3,
  numbered = false,
  className,
}) {
  const baseId = useId();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(() => [].concat(defaultOpen ?? []));
  const Heading = `h${headingLevel}`;

  const toggle = (id) => {
    setOpen((current) => {
      const isOpen = current.includes(id);
      if (type === 'multiple') return isOpen ? current.filter((entry) => entry !== id) : [...current, id];
      return isOpen ? [] : [id];
    });
  };

  // Flèches haut/bas, Début et Fin circulent entre les intitulés.
  const onKeyDown = (event) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const triggers = [...event.currentTarget.querySelectorAll('[data-accordion-trigger]')];
    const index = triggers.indexOf(document.activeElement);
    if (index === -1) return;
    event.preventDefault();
    const last = triggers.length - 1;
    const next =
      event.key === 'Home' ? 0 : event.key === 'End' ? last : event.key === 'ArrowDown' ? (index === last ? 0 : index + 1) : index === 0 ? last : index - 1;
    triggers[next]?.focus();
  };

  return (
    <div className={cn('border-t border-line', className)} onKeyDown={onKeyDown}>
      {items.map((item, index) => {
        const isOpen = open.includes(item.id);
        const triggerId = `${baseId}-t-${item.id}`;
        const panelId = `${baseId}-p-${item.id}`;
        return (
          <div key={item.id} className="border-b border-line">
            <Heading className="m-0">
              <button
                type="button"
                id={triggerId}
                data-accordion-trigger
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(item.id)}
                className="group/acc flex w-full items-center gap-5 py-5 text-left md:py-6"
              >
                {numbered ? (
                  <span aria-hidden="true" className="eyebrow w-7 shrink-0 tabular-nums text-accent">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                ) : null}
                <span className="flex-1 font-display text-[clamp(1.25rem,1.7vw,1.625rem)] leading-snug transition-colors duration-500 group-hover/acc:text-accent">
                  {item.title}
                </span>
                <span aria-hidden="true" className="relative grid size-11 shrink-0 place-items-center">
                  <span className="absolute h-px w-3.5 bg-current" />
                  <span
                    className={cn(
                      'absolute h-3.5 w-px bg-current transition-transform duration-500 ease-luxe',
                      isOpen ? 'rotate-90' : 'rotate-0',
                    )}
                  />
                </span>
              </button>
            </Heading>
            <AnimatePresence initial={false}>
              {isOpen ? (
                <Motion.div
                  key="panel"
                  id={panelId}
                  role="region"
                  aria-labelledby={triggerId}
                  className="overflow-hidden"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: reduced ? 0 : 0.6, ease: EASE_LUXE }}
                >
                  <div className={cn('max-w-[62ch] pb-7 pr-11 leading-relaxed text-muted', numbered && 'pl-12')}>
                    {item.content}
                  </div>
                </Motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
