import { useId } from 'react';
import { getLeather } from '../../data/atelier';
import { BeltThumb, Icon, TextLink, cn } from '../ui';
import { PRESETS, matchPreset } from './presets';

/**
 * Inspirations de la maison : des compositions prêtes, appliquées d'un geste, puis le tirage
 * « Surprenez-moi » et le retour à la ceinture de départ.
 * @param {{
 *   config: object, onApply: (preset: { id: string, name: string, config: object }) => void,
 *   onSurprise: () => void, onReset: () => void, canReset: boolean
 * }} props
 */
export default function Inspirations({ config, onApply, onSurprise, onReset, canReset }) {
  const titleId = useId();
  const current = matchPreset(config);

  return (
    <section aria-labelledby={titleId} className="border-t border-line py-7 @[34rem]:py-9">
      <h2 id={titleId} className="eyebrow text-muted">
        Inspirations
      </h2>
      <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-muted">Partez d’une composition de la maison, puis faites-la vôtre.</p>

      <ul className="mt-5 grid grid-cols-3 gap-x-2 gap-y-5">
        {PRESETS.map((preset) => {
          const active = current === preset;
          return (
            <li key={preset.id}>
              <button type="button" aria-pressed={active} onClick={() => onApply(preset)} className="group/preset block w-full text-left">
                <span
                  className={cn(
                    'tone-papier relative block aspect-[5/4] overflow-hidden bg-papier outline-1 outline-offset-2 transition-[outline-color] duration-500 ease-luxe',
                    active ? 'outline-fg' : 'outline-transparent group-hover/preset:outline-fg/40',
                  )}
                >
                  <span aria-hidden="true" className="studio-light pointer-events-none absolute inset-0" />
                  {/* le dessin n'occupe que le centre de son cadre : on l'agrandit au-delà de la tuile */}
                  <BeltThumb
                    belt={preset.config}
                    className="absolute left-1/2 top-[52%] h-[150%] w-auto max-w-none -translate-x-1/2 -translate-y-1/2 transition-transform duration-700 ease-luxe group-hover/preset:scale-[1.04]"
                  />
                </span>
                <span className="mt-3 block font-display text-[1.1875rem] leading-none">{preset.name}</span>
                <span className="mt-1.5 block text-[0.75rem] leading-tight text-muted">{getLeather(preset.config.leather).name}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6">
        <TextLink variant="label" onClick={onSurprise}>
          <span className="flex items-center gap-2.5">
            <Icon name="sparkle" size={16} />
            Surprenez-moi
          </span>
        </TextLink>
        <TextLink variant="label" tone="muted" onClick={onReset} disabled={!canReset} className="disabled:pointer-events-none disabled:opacity-45">
          Réinitialiser
        </TextLink>
      </div>
    </section>
  );
}
