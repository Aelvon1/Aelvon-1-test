import { useId } from 'react';
import { MotionConfig, motion as Motion } from 'motion/react';
import { SIZE_ALLOWANCE_CM, TROUSER_SIZES_FR, WAIST_MAX_CM, WAIST_MIN_CM } from '../../lib/sizing';
import { sizeRange } from '../product/catalogue';
import { Button, EASE_LUXE, Icon, OptionGrid, TextLink, cn } from '../ui';
import SizeRuler from './SizeRuler';
import { ALL_SIZES, FINDER_MODES, INCH_MAX, INCH_MIN, clampMeasure, cleanMeasure, parseMeasure } from './size-finder';

const NUMBER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const fr = (value) => NUMBER.format(value);

// Curseur : piste fine remplie jusqu'à la valeur (variable --fill), pastille de laiton cerclée.
const RANGE = cn(
  'mt-4 block h-11 w-full cursor-pointer appearance-none bg-transparent',
  '[&::-webkit-slider-runnable-track]:h-0.5',
  '[&::-webkit-slider-runnable-track]:[background:linear-gradient(to_right,var(--fg)_var(--fill),color-mix(in_srgb,var(--fg)_22%,transparent)_var(--fill))]',
  '[&::-webkit-slider-thumb]:-mt-[0.6875rem] [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full',
  '[&::-webkit-slider-thumb]:border-[5px] [&::-webkit-slider-thumb]:border-solid [&::-webkit-slider-thumb]:border-bg [&::-webkit-slider-thumb]:bg-accent',
  '[&::-webkit-slider-thumb]:shadow-[0_0_0_1px_var(--accent)]',
  '[&::-moz-range-track]:h-0.5 [&::-moz-range-track]:bg-fg/20 [&::-moz-range-progress]:h-0.5 [&::-moz-range-progress]:bg-fg',
  '[&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[5px] [&::-moz-range-thumb]:border-solid',
  '[&::-moz-range-thumb]:border-bg [&::-moz-range-thumb]:bg-accent [&::-moz-range-thumb]:shadow-[0_0_0_1px_var(--accent)] [&::-moz-range-thumb]:box-content',
);

/** Mesure libre : grand champ numérique, boutons ±1 et curseur, tous liés à la même valeur. */
function MeasureInput({ label, hint, unit, unitLabel, name, min, max, value, onChange, invalid }) {
  const id = useId();
  const hintId = `${id}-aide`;
  const middle = Math.round((min + max) / 2);
  const current = clampMeasure(parseMeasure(value), min, max, middle);
  const fill = `${((current - min) / (max - min)) * 100}%`;
  const step = (delta) => onChange(String(clampMeasure(Math.round(parseMeasure(value)) + delta, min, max, current)));

  return (
    <div>
      <label htmlFor={id} className="block text-[0.8125rem] font-medium tracking-[0.02em]">
        {label}
      </label>
      <div
        className={cn(
          'mt-1 flex items-baseline gap-2 border-b pb-3 transition-[border-color,box-shadow] duration-300',
          invalid ? 'border-danger' : 'border-fg/35 focus-within:border-accent focus-within:shadow-[0_1px_0_var(--accent)]',
        )}
      >
        <input
          id={id}
          name={name}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="—"
          value={value}
          aria-describedby={hintId}
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange(cleanMeasure(event.target.value))}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            event.preventDefault();
            step(event.key === 'ArrowUp' ? 1 : -1);
          }}
          style={{ width: `${Math.max(2, String(value).length) + 0.25}ch` }}
          className="control min-w-0 max-w-[60%] bg-transparent font-display text-[clamp(3.75rem,6.4vw,5.5rem)] leading-[1] tracking-[-0.02em] text-fg outline-none lining-nums placeholder:text-fg/30"
        />
        <span className="font-display text-[1.5rem] leading-none text-muted">{unit}</span>
        <div className="ml-auto flex gap-2 self-end pb-1">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={current <= min}
            className="grid size-11 place-items-center border border-fg/25 transition-colors duration-300 hover:border-fg/70 disabled:opacity-35"
          >
            <Icon name="minus" size={18} title={`Retirer un ${unitLabel}`} />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={current >= max}
            className="grid size-11 place-items-center border border-fg/25 transition-colors duration-300 hover:border-fg/70 disabled:opacity-35"
          >
            <Icon name="plus" size={18} title={`Ajouter un ${unitLabel}`} />
          </button>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={current}
        aria-label={`${label}, en ${unitLabel}s`}
        onChange={(event) => onChange(event.target.value)}
        className={RANGE}
        style={{ '--fill': fill }}
      />
      <div className="-mt-1 flex justify-between text-[0.75rem] tabular-nums text-muted" aria-hidden="true">
        <span>{min}</span>
        <span>{max}</span>
      </div>
      <p id={hintId} className="mt-4 text-[0.8125rem] leading-snug text-muted">
        {hint}
      </p>
    </div>
  );
}

/** Ce que le visiteur a saisi, ramené en centimètres quand il a choisi une autre unité. */
function conversionLine(state, result) {
  if (result.waist == null || result.status === 'invalid') return null;
  if (state.mode === 'pantalon') return `Taille ${state.trouser}, soit environ ${fr(result.waist)}\xa0cm de tour de taille.`;
  if (state.mode === 'pouces') return `${fr(result.entered)}\xa0pouces, soit environ ${fr(result.waist)}\xa0cm de tour de taille.`;
  return null;
}

function statusSentence(result) {
  if (result.status === 'exact' || result.status === 'near') return `Taille DAG conseillée\xa0: ${result.size}.`;
  if (result.status === 'out') return `Mesure hors de nos tailles. Taille la plus proche\xa0: ${result.size}.`;
  if (result.status === 'invalid') return 'Mesure hors de nos repères.';
  return '';
}

function Explanation({ result }) {
  const { status, ideal, size, direction, availability } = result;
  const range = sizeRange(ALL_SIZES);

  if (status === 'empty') return <p>Indiquez votre mesure&nbsp;: votre taille s’affiche ici.</p>;
  if (status === 'invalid') {
    return (
      <p>
        Nos repères vont de {WAIST_MIN_CM} à {WAIST_MAX_CM}&nbsp;cm de tour de taille. Vérifiez votre mesure, ou écrivez-nous&nbsp;: nous
        vous conseillerons.
      </p>
    );
  }
  if (status === 'out') {
    return (
      <p>
        Votre longueur idéale serait de {fr(ideal)}&nbsp;cm, {direction === 'short' ? 'au-delà' : 'en deçà'} de nos tailles ({range}).
        La taille {size} est la plus proche, mais elle sera {direction === 'short' ? 'un peu juste' : 'un peu longue'}. Écrivez-nous
        avant de commander&nbsp;: nous vous conseillerons.
      </p>
    );
  }

  const missing = availability?.missing ?? [];
  return (
    <>
      <p>
        {status === 'exact' ? (
          <>Votre longueur idéale tombe exactement sur une taille de la maison.</>
        ) : (
          <>
            Votre longueur idéale est de {fr(ideal)}&nbsp;cm. La taille {size} est la plus proche&nbsp;: les crans voisins du trou
            central rattrapent l’écart.
          </>
        )}
      </p>
      <p className="mt-3">
        {!availability?.inCollection ? (
          <>Cette longueur ne figure pas dans la collection&nbsp;: elle se compose à l’Atelier.</>
        ) : missing.length === 0 ? (
          <>Elle existe sur tous les modèles de la collection.</>
        ) : (
          <>
            Elle existe dans la collection, sauf sur la {missing.map((product) => product.name).join(' et la ')}.
          </>
        )}
      </p>
    </>
  );
}

/**
 * Trouveur de taille : la saisie à gauche (centimètres, taille de pantalon ou pouces), le résultat à droite.
 * L'état vit dans la page, qui s'en sert aussi pour surligner la table de correspondance.
 * @param {{
 *   state: { mode: 'cm'|'pantalon'|'pouces', cm: string, trouser: string, inches: string },
 *   onChange: (patch: object) => void,
 *   result: ReturnType<typeof import('./size-finder').finderResult>,
 *   className?: string
 * }} props
 */
export default function SizeFinder({ state, onChange, result, className }) {
  const groupId = useId();
  const { status, size, ideal, waist, availability } = result;
  const found = status === 'exact' || status === 'near';
  const hasSize = found || status === 'out';
  const conversion = conversionLine(state, result);
  const wrongMeasure = status === 'invalid';

  return (
    <div className={cn('grid gap-y-10 lg:grid-cols-12 lg:grid-rows-[auto_1fr] lg:gap-x-6', className)}>
      {/* --- La saisie --- */}
      <form className="flex flex-col gap-8 lg:col-span-5" noValidate onSubmit={(event) => event.preventDefault()}>
        <div>
          <p id={groupId} className="mb-3 text-[0.8125rem] font-medium tracking-[0.02em]">
            Ce que vous connaissez
          </p>
          <OptionGrid labelledBy={groupId} columns={3} options={FINDER_MODES} value={state.mode} onChange={(mode) => onChange({ mode })} />
        </div>

        {state.mode === 'cm' ? (
          <MeasureInput
            key="cm"
            name="tour-de-taille"
            label="Votre tour de taille"
            unit="cm"
            unitLabel="centimètre"
            min={WAIST_MIN_CM}
            max={WAIST_MAX_CM}
            value={state.cm}
            invalid={wrongMeasure}
            onChange={(cm) => onChange({ cm })}
            hint="Mesuré là où vous portez votre pantalon, sans serrer."
          />
        ) : null}

        {state.mode === 'pouces' ? (
          <MeasureInput
            key="pouces"
            name="tour-de-taille-pouces"
            label="Votre tour de taille"
            unit="in"
            unitLabel="pouce"
            min={INCH_MIN}
            max={INCH_MAX}
            value={state.inches}
            invalid={wrongMeasure}
            onChange={(inches) => onChange({ inches })}
            hint="Un pouce vaut 2,54&nbsp;cm&nbsp;: nous convertissons pour vous."
          />
        ) : null}

        {state.mode === 'pantalon' ? (
          <div>
            <p id={`${groupId}-pantalon`} className="mb-3 text-[0.8125rem] font-medium tracking-[0.02em]">
              Votre taille de pantalon
            </p>
            <OptionGrid
              labelledBy={`${groupId}-pantalon`}
              minWidth="3.5rem"
              options={TROUSER_SIZES_FR.map((entry) => ({ value: entry.fr, label: entry.fr }))}
              value={state.trouser}
              onChange={(trouser) => onChange({ trouser })}
            />
            <p className="mt-4 text-[0.8125rem] leading-snug text-muted">
              Taille française, telle qu’elle figure sur l’étiquette. La correspondance est indicative&nbsp;: une mesure au mètre ruban
              reste plus sûre.
            </p>
          </div>
        ) : null}
      </form>

      {/* --- Le résultat --- */}
      <div className="tone-craie border border-line bg-craie p-6 sm:p-10 lg:col-span-6 lg:col-start-7 lg:row-span-2 lg:row-start-1 lg:p-12">
        <p role="status" className="sr-only">
          {statusSentence(result)}
        </p>
        <p className={cn('eyebrow', wrongMeasure ? 'text-danger' : 'text-muted')}>
          {status === 'out' ? 'Taille la plus proche' : wrongMeasure ? 'Mesure à vérifier' : 'Votre taille DAG'}
        </p>

        <MotionConfig reducedMotion="user">
          <p className="mt-4 flex items-baseline gap-3 font-display leading-[0.85] lining-nums" aria-hidden={hasSize ? undefined : true}>
            <span className="relative -mx-[0.06em] block overflow-hidden px-[0.06em] pb-[0.06em] pt-[0.04em] text-[clamp(6rem,12.5vw,11.5rem)] tracking-[-0.035em]">
              {/* à chaque nouvelle taille, le chiffre remonte derrière son masque */}
              <Motion.span
                key={hasSize ? size : 'aucune'}
                className={cn('block', !hasSize && 'text-fg/25')}
                initial={{ y: '45%', opacity: 0 }}
                animate={{ y: '0%', opacity: 1 }}
                transition={{ duration: 0.7, ease: EASE_LUXE }}
              >
                {hasSize ? size : '—'}
              </Motion.span>
            </span>
            {hasSize ? <span className="text-[clamp(1.5rem,2.4vw,2.25rem)] leading-none text-muted">cm</span> : null}
          </p>
        </MotionConfig>

        {hasSize ? (
          <p className="mt-6 font-display text-[clamp(1.25rem,1.7vw,1.5rem)] leading-snug lining-nums">
            {fr(waist)}&nbsp;cm <span className="text-accent">+ {SIZE_ALLOWANCE_CM}&nbsp;cm</span> = {fr(ideal)}&nbsp;cm
          </p>
        ) : null}
        {conversion ? <p className="mt-1 text-[0.8125rem] text-muted">{conversion}</p> : null}

        <div className="mt-5 max-w-[48ch] text-[0.9375rem] leading-relaxed text-muted">
          <Explanation result={result} />
        </div>

        <SizeRuler sizes={ALL_SIZES} ideal={hasSize ? ideal : null} size={found ? size : null} className="mt-9" />

        <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
          {found ? (
            availability?.inCollection ? (
              <>
                <Button to="/shop" variant="solid" icon="arrow-right">
                  Voir la collection
                </Button>
                <TextLink to="/atelier" variant="label" arrow>
                  Composer la vôtre
                </TextLink>
              </>
            ) : (
              <>
                <Button to="/atelier" variant="solid" icon="arrow-right">
                  Composer la vôtre
                </Button>
                <TextLink to="/shop" variant="label" arrow>
                  Voir la collection
                </TextLink>
              </>
            )
          ) : status === 'empty' ? (
            <TextLink href="#mesurer" variant="label" arrow="down">
              Comment mesurer
            </TextLink>
          ) : (
            <>
              <Button to="/contact?sujet=produit" variant="solid" icon="arrow-right">
                Nous écrire
              </Button>
              <TextLink href="#mesurer" variant="label" arrow="down">
                Comment mesurer
              </TextLink>
            </>
          )}
        </div>
      </div>

      {/* --- Le raccourci : en dernier sur petit écran, sous la saisie sur grand écran --- */}
      <p className="border-t border-line pt-5 text-[0.8125rem] leading-relaxed text-muted lg:col-span-5 lg:self-end">
        <span className="font-medium text-fg">Pas de mètre ruban sous la main&nbsp;?</span> Mesurez une ceinture qui vous va, de la base de
        la boucle au cran que vous utilisez&nbsp;: ce chiffre est directement votre taille DAG.
      </p>
    </div>
  );
}
