import { useState } from 'react';
import { SIZES as ATELIER_SIZES } from '../../data/atelier';
import { SIZE_ALLOWANCE_CM, TROUSER_SIZES_FR, WAIST_MAX_CM, WAIST_MIN_CM, recommendSize, sizeChart } from '../../lib/sizing';
import { Button, Drawer, Field, Input, OptionGrid, Select, TextLink, cn } from '../ui';
import { sizeRange } from './catalogue';

const MODES = [
  { value: 'cm', label: 'Tour de taille', hint: 'en centimètres' },
  { value: 'pantalon', label: 'Pantalon', hint: 'taille française' },
];

const parseWaist = (text) => Number(String(text).trim().replace(',', '.'));

/**
 * Tiroir « Guide des tailles » de la fiche produit : un trouveur de taille compact (tour de
 * taille en cm ou taille de pantalon française), limité aux tailles du modèle, avec un bouton
 * qui applique la taille conseillée, puis la table de correspondance et le lien vers le guide complet.
 * @param {{
 *   open: boolean, onClose: () => void, product: object,
 *   selected?: string|null, onApply: (size: string) => void
 * }} props
 */
export default function SizeGuideDrawer({ open, onClose, product, selected, onApply }) {
  const [mode, setMode] = useState('cm');
  const [waist, setWaist] = useState('');
  const [trouser, setTrouser] = useState('');

  const sizes = product.sizes;
  const filled = mode === 'cm' ? waist.trim() !== '' : trouser !== '';
  const waistCm = mode === 'cm' ? parseWaist(waist) : TROUSER_SIZES_FR.find((entry) => entry.fr === trouser)?.waist;
  const result = filled ? recommendSize(waistCm, sizes) : null;
  const invalid = filled && !result;
  const usable = result && !result.outOfRange;
  const chart = sizeChart(sizes);

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
            <p className="eyebrow text-muted">{result.outOfRange ? 'Taille la plus proche' : 'Taille conseillée'}</p>
            <p className="mt-3 flex items-baseline gap-2 font-display leading-none lining-nums">
              <span className="text-[3.5rem]">{result.size}</span>
              <span className="text-[1.25rem] text-muted">cm</span>
            </p>
            <p className="mt-4 text-[0.875rem] leading-relaxed text-muted">
              {result.outOfRange ? (
                <>
                  Votre longueur idéale est de {result.ideal}&nbsp;cm&nbsp;: elle sort des tailles de ce modèle ({sizeRange(sizes)}). À
                  l’Atelier, nous réalisons les longueurs de {sizeRange(ATELIER_SIZES)}.
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
            {result.outOfRange ? (
              <TextLink to="/atelier" variant="label" arrow className="mt-2">
                Composer la vôtre
              </TextLink>
            ) : selected === result.size ? (
              <p className="mt-3 text-[0.8125rem] text-positive">C’est la taille que vous avez choisie.</p>
            ) : null}
          </>
        ) : (
          <p className="text-[0.875rem] leading-relaxed text-muted">
            Indiquez votre mesure&nbsp;: la taille conseillée pour {product.name} s’affiche ici.
          </p>
        )}
      </div>

      <table className="mt-10 w-full border-collapse text-left text-[0.875rem]">
        <caption className="eyebrow pb-4 text-left text-muted">Correspondances — {product.name}</caption>
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
          {chart.map((row) => {
            const match = result && !result.outOfRange && result.size === row.size;
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
