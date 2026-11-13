import { useId } from 'react';
import { AnimatePresence, motion as Motion, useReducedMotion } from 'motion/react';
import { MONOGRAM_STYLES, getMonogramStyle } from '../../data/atelier';
import { MAX_MONOGRAM_LENGTH, MONOGRAM_PRICE, sanitizeMonogram } from '../../lib/pricing';
import { EASE_LUXE, Field, Icon, Input, OptionGrid, Price, cn } from '../ui';

/**
 * Option monogramme de la fiche produit : une case à cocher qui dévoile la saisie (limitée par
 * sanitizeMonogram) et le choix du style de marquage.
 * @param {{
 *   enabled: boolean, onEnabledChange: (enabled: boolean) => void,
 *   value: string, onValueChange: (value: string) => void,
 *   styleId: string, onStyleChange: (id: string) => void,
 *   error?: string, inputRef?: { current: HTMLInputElement|null }, className?: string
 * }} props
 *   value : monogramme déjà nettoyé · styleId : id de MONOGRAM_STYLES · error : message sous le champ
 */
export default function MonogramOption({
  enabled,
  onEnabledChange,
  value,
  onValueChange,
  styleId,
  onStyleChange,
  error,
  inputRef,
  className,
}) {
  const baseId = useId();
  const panelId = `${baseId}-panneau`;
  const styleLabelId = `${baseId}-style`;
  const reduced = useReducedMotion();
  const style = getMonogramStyle(styleId);

  return (
    <div className={cn('border transition-colors duration-500 ease-luxe', enabled ? 'border-fg/55' : 'border-fg/25 hover:border-fg/55', className)}>
      <label className="flex min-h-14 cursor-pointer items-center gap-3.5 px-4 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-accent">
        <span className="relative grid size-5 shrink-0 place-items-center">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => onEnabledChange(event.target.checked)}
            aria-controls={panelId}
            aria-expanded={enabled}
            className="peer absolute inset-0 size-full cursor-pointer appearance-none border border-fg/45 bg-transparent outline-none transition-colors duration-300 checked:border-accent checked:bg-accent hover:border-fg"
          />
          <Icon
            name="check"
            size={14}
            strokeWidth={2}
            className="pointer-events-none relative text-on-accent opacity-0 transition-opacity duration-300 peer-checked:opacity-100"
          />
        </span>
        <span className="flex-1 text-[0.9375rem] leading-snug">
          Ajouter un monogramme
          <span className="block text-[0.8125rem] text-muted">Vos initiales, marquées dans le cuir.</span>
        </span>
        <span className="shrink-0 text-[0.9375rem] tabular-nums">
          +&nbsp;
          <Price amount={MONOGRAM_PRICE} />
        </span>
      </label>

      <AnimatePresence initial={false}>
        {enabled ? (
          <Motion.div
            key="monogramme"
            id={panelId}
            className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.6, ease: EASE_LUXE }}
          >
            <div className="flex flex-col gap-5 border-t border-line px-4 pb-5 pt-5">
              <Field
                label="Votre monogramme"
                hint={`${MAX_MONOGRAM_LENGTH} caractères au plus\xa0: lettres sans accent et chiffres.`}
                error={error}
              >
                <Input
                  ref={inputRef}
                  name="monogramme"
                  value={value}
                  onChange={(event) => onValueChange(sanitizeMonogram(event.target.value))}
                  maxLength={MAX_MONOGRAM_LENGTH + 2}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="DAG"
                  className="font-display! text-[1.5rem] uppercase tracking-[0.3em] lining-nums placeholder:text-fg/25"
                />
              </Field>

              <div>
                <p id={styleLabelId} className="text-[0.8125rem] font-medium tracking-[0.02em]">
                  Style de marquage
                </p>
                <OptionGrid
                  className="mt-2"
                  labelledBy={styleLabelId}
                  columns={MONOGRAM_STYLES.length}
                  options={MONOGRAM_STYLES.map((entry) => ({ value: entry.id, label: entry.name }))}
                  value={styleId}
                  onChange={onStyleChange}
                />
                <p aria-live="polite" className="mt-2.5 text-[0.8125rem] leading-snug text-muted">
                  {style.description}
                </p>
              </div>
            </div>
          </Motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
