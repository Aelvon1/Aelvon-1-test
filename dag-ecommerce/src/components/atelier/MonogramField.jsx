import { useId } from 'react';
import { AnimatePresence, motion as Motion, useReducedMotion } from 'motion/react';
import { MONOGRAM_STYLES, getMonogramStyle } from '../../data/atelier';
import { MAX_MONOGRAM_LENGTH, sanitizeMonogram } from '../../lib/pricing';
import { EASE_LUXE, Field, Input, OptionGrid, TextLink } from '../ui';

/**
 * Monogramme de l'Atelier : la saisie suffit à l'ajouter, l'effacer le retire. Le style de
 * marquage n'apparaît qu'une fois des initiales saisies.
 * @param {{
 *   value: string, onValueChange: (value: string) => void,
 *   styleId: string, onStyleChange: (id: string) => void
 * }} props
 *   value : monogramme déjà nettoyé · styleId : id de MONOGRAM_STYLES
 */
export default function MonogramField({ value, onValueChange, styleId, onStyleChange }) {
  const styleLabelId = useId();
  const reduced = useReducedMotion();

  return (
    <div>
      <Field label="Vos initiales" hint={`${MAX_MONOGRAM_LENGTH} caractères au plus\xa0: lettres sans accent et chiffres.`}>
        <Input
          name="monogramme"
          value={value}
          onChange={(event) => onValueChange(sanitizeMonogram(event.target.value))}
          // marge pour un caractère accentué décomposé ou un espace, retirés au nettoyage
          maxLength={MAX_MONOGRAM_LENGTH + 2}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="DAG"
          className="font-display! text-[1.5rem] uppercase tracking-[0.3em] lining-nums placeholder:text-fg/50"
        />
      </Field>

      <AnimatePresence initial={false}>
        {value ? (
          <Motion.div
            key="style"
            className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.6, ease: EASE_LUXE }}
          >
            {/* marge intérieure : le contour de focus des options n'est pas rogné par overflow-hidden */}
            <div className="px-1.5 pb-1.5 pt-6 -mx-1.5">
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
              <div className="mt-2.5 flex items-start justify-between gap-6">
                <p className="text-[0.8125rem] leading-snug text-muted">{getMonogramStyle(styleId).description}</p>
                <TextLink tone="muted" underline="always" onClick={() => onValueChange('')} className="-my-3 min-h-11 shrink-0 text-[0.8125rem]">
                  Retirer
                </TextLink>
              </div>
            </div>
          </Motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
