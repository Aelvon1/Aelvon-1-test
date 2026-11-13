import { useState } from 'react';
import { SIZES } from '../../data/atelier';
import { SIZE_ALLOWANCE_CM, TROUSER_SIZES_FR, WAIST_MAX_CM, WAIST_MIN_CM, recommendSize, sizeChart } from '../../lib/sizing';
import { sizeRange } from '../product/catalogue';
import { Button, Drawer, Field, Input, OptionGrid, Select, TextLink, cn } from '../ui';

const MODES = [
  { value: 'cm', label: 'Tour de taille', hint: 'en centimètres' },
  { value: 'pantalon', label: 'Pantalon', hint: 'taille française' },
];

const parseWaist = (text) => Number(String(text).trim().replace(',', '.'));

/**
 * Guide des tailles de l'Atelier, en tiroir : la règle de la maison, un calcul à partir du tour
 * de taille ou de la taille de pantalon, la table des longueurs réalisées, et un bouton qui
 * applique la taille conseillée.
 * @param {{ open: boolean, onClose: () => void, selected?: string|null, onApply: (size: string) => void }} props
 */
export default function SizeGuide({ open, onClose, selected, onApply }) {
  const [mode, setMode] = useState('cm');
  const [waist, setWaist] = useState('');
  const [trouser, setTrouser] = useState('');

  const filled = mode === 'cm' ? waist.trim() !== '' : trouser !== '';
  const waistCm = mode === 'cm' ? parseWaist(waist) : TROUSER_SIZES_FR.find((entry) => entry.fr === trouser)?.waist;
  const result = filled ? recommendSize(waistCm, SIZES) : null;
  const invalid = filled && !result;
  const usable = result && !result.outOfRange;

  const apply = () => {
    if (!usable) return;
    onApply(result.size);
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Guide des tailles"
      footer={
        <Button fullWidth variant="solid" disabled={!usable} onClick={apply}>
          {usable ? `Choisir la taille ${result.size}` : 'Choisir cette taille'}
        </Button>
      }
    >
      <p className="font-display text-[1.5rem] leading-snug lining-nums">
        Votre tour de taille, plus {SIZE_ALLOWANCE_CM}&nbsp;cm.
      </p>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">
        Mesurez-vous là où vous portez votre pantalon, sans serrer. Nos tailles indiquent la longueur de la boucle au cran central.
      </p>

      <form
        className="mt-8 flex flex-col gap-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <OptionGrid label="Ce que vous connaissez" columns={2} options={MODES} value={mode} onChange={setMode} />

        {mode === 'cm' ? (
          <Field
            label="Votre tour de taille"
            hint={`Entre ${WAIST_MIN_CM} et ${WAIST_MAX_CM}\xa0cm.`}
            error={invalid ? `Indiquez un tour de taille entre ${WAIST_MIN_CM} et ${WAIST_MAX_CM}\xa0cm.` : undefined}
          >
            <Input
              name="tour-de-taille"
              inputMode="decimal"
              autoComplete="off"
              placeholder="Ex. 85"
              maxLength={5}
              value={waist}
              onChange={(event) => setWaist(event.target.value.replace(/[^0-9.,]/g, ''))}
            />
          </Field>
        ) : (
          <Field label="Votre taille de pantalon" hint="Taille française, telle qu’indiquée sur l’étiquette.">
            <Select
              name="taille-pantalon"
              placeholder="Choisir"
              value={trouser}
              onChange={(event) => setTrouser(event.target.value)}
              options={TROUSER_SIZES_FR.map((entry) => ({ value: entry.fr, label: entry.fr }))}
            />
          </Field>
        )}
      </form>

      <div aria-live="polite" className="mt-6 border border-line p-5">
        {result ? (
          <>
            <p className="eyebrow text-muted">{result.outOfRange ? 'Longueur la plus proche' : 'Taille conseillée'}</p>
            <p className="mt-3 flex items-baseline gap-2 font-display leading-none lining-nums">
              <span className="text-[3.5rem]">{result.size}</span>
              <span className="text-[1.25rem] text-muted">cm</span>
            </p>
            <p className="mt-4 text-[0.875rem] leading-relaxed text-muted">
              {result.outOfRange ? (
                <>
                  Votre longueur idéale est de {result.ideal}&nbsp;cm&nbsp;: elle sort des longueurs réalisées à l’Atelier (
                  {sizeRange(SIZES)}).
                </>
              ) : result.exact ? (
                <>Votre longueur idéale est de {result.ideal}&nbsp;cm, exactement.</>
              ) : (
                <>
                  Votre longueur idéale est de {result.ideal}&nbsp;cm. Nous vous conseillons la taille la plus proche&nbsp;: le{' '}
                  {result.size}.
                </>
              )}
            </p>
            {usable && selected === result.size ? (
              <p className="mt-3 text-[0.8125rem] text-positive">C’est la taille que vous avez choisie.</p>
            ) : null}
          </>
        ) : (
          <p className="text-[0.875rem] leading-relaxed text-muted">Indiquez votre mesure&nbsp;: la taille conseillée s’affiche ici.</p>
        )}
      </div>

      <table className="mt-10 w-full border-collapse text-left text-[0.875rem]">
        <caption className="eyebrow pb-4 text-left text-muted">Correspondances</caption>
        <thead>
          <tr className="border-y border-line text-[0.75rem] text-muted">
            <th scope="col" className="py-3 pr-3 font-medium">
              Taille
            </th>
            <th scope="col" className="py-3 pr-3 font-medium">
              Tour de taille
            </th>
            <th scope="col" className="py-3 text-right font-medium">
              Pantalon (FR)
            </th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {sizeChart(SIZES).map((row) => {
            const match = usable && result.size === row.size;
            return (
              <tr key={row.size} className={cn('border-b border-line transition-colors duration-500', match && 'bg-fg/[0.06]')}>
                <th scope="row" className={cn('py-3 pl-2 pr-3 font-medium', match && 'text-accent')}>
                  {row.size}
                </th>
                <td className="py-3 pr-3 text-muted">
                  {row.waistMin} – {row.waistMax}&nbsp;cm
                </td>
                <td className="py-3 pr-2 text-right text-muted">{row.trouserFr.length ? row.trouserFr.join(' · ') : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <TextLink to="/guide-des-tailles" variant="label" arrow className="mt-6">
        Le guide complet des tailles
      </TextLink>
    </Drawer>
  );
}
