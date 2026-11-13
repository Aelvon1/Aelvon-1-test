import { useId } from 'react';
import {
  BUCKLES,
  FINISHES,
  LEATHERS,
  SIZES,
  STITCHES,
  WIDTHS,
  getBuckle,
  getFinish,
  getLeather,
  getStitch,
  getWidth,
} from '../../data/atelier';
import { formatPrice } from '../../lib/format';
import { MONOGRAM_PRICE } from '../../lib/pricing';
import { SIZE_ALLOWANCE_CM } from '../../lib/sizing';
import { Icon, OptionGrid, Swatches, TextLink } from '../ui';
import ChoiceCards from './ChoiceCards';
import MonogramField from './MonogramField';
import { BuckleGlyph, FinishSample, StitchSample } from './Samples';
import Step from './Step';
import { nbspUnits } from './atelier-state';

const surcharge = (amount) => `+\xa0${formatPrice(amount)}`;

/**
 * Les sept étapes de la composition : cuir, finition, boucle, couture, largeur, monogramme, taille.
 * Les échantillons de finition et de couture sont dessinés dans le cuir choisi.
 * @param {{
 *   config: object, onChange: (field: string, value: string|number) => void,
 *   size: string|null, onSize: (size: string) => void,
 *   sizeError: boolean, sizeFieldId: string, onOpenGuide: () => void
 * }} props
 *   onChange : (champ de BeltConfig, nouvelle valeur) · sizeError : aucune taille au moment de l'ajout
 *   sizeFieldId : id du bloc des tailles (le focus y est porté en cas d'oubli)
 */
export default function Composition({ config, onChange, size, onSize, sizeError, sizeFieldId, onOpenGuide }) {
  const ids = useId();
  const titleId = (step) => `${ids}-${step}`;
  const leather = getLeather(config.leather);

  return (
    <>
      <Step index={1} title="Cuir" titleId={titleId('cuir')} value={leather.name}>
        <Swatches
          size="lg"
          labelledBy={titleId('cuir')}
          options={LEATHERS}
          value={config.leather}
          onChange={(value) => onChange('leather', value)}
        />
      </Step>

      <Step index={2} title="Finition" titleId={titleId('finition')} value={getFinish(config.finish).name}>
        <ChoiceCards
          layout="adaptive"
          className="grid-cols-1 @[34rem]:grid-cols-3"
          labelledBy={titleId('finition')}
          value={config.finish}
          onChange={(value) => onChange('finish', value)}
          options={FINISHES.map((finish) => ({
            value: finish.id,
            label: finish.name,
            description: finish.description,
            visual: <FinishSample finish={finish.id} hex={leather.hex} className="h-11 w-16 shrink-0 @[34rem]:h-12 @[34rem]:w-full" />,
          }))}
        />
      </Step>

      <Step index={3} title="Boucle" titleId={titleId('boucle')} value={getBuckle(config.buckle).name}>
        <ChoiceCards
          className="grid-cols-3 @[34rem]:grid-cols-5"
          labelledBy={titleId('boucle')}
          value={config.buckle}
          onChange={(value) => onChange('buckle', value)}
          options={BUCKLES.map((buckle) => ({
            value: buckle.id,
            label: buckle.name,
            meta: buckle.surcharge > 0 ? surcharge(buckle.surcharge) : null,
            visual: <BuckleGlyph hex={buckle.hex} className="h-8 w-11" />,
          }))}
        />
      </Step>

      <Step index={4} title="Couture" titleId={titleId('couture')} value={getStitch(config.stitch).name}>
        <ChoiceCards
          className="grid-cols-3 @[34rem]:grid-cols-6"
          labelledBy={titleId('couture')}
          value={config.stitch}
          onChange={(value) => onChange('stitch', value)}
          options={STITCHES.map((stitch) => ({
            value: stitch.id,
            label: stitch.name,
            visual: <StitchSample leatherHex={leather.hex} stitchHex={stitch.hex} className="h-7 w-14" />,
          }))}
        />
      </Step>

      <Step index={5} title="Largeur" titleId={titleId('largeur')} value={getWidth(config.width).label}>
        <OptionGrid
          labelledBy={titleId('largeur')}
          columns={WIDTHS.length}
          options={WIDTHS.map((width) => ({ value: width.id, label: nbspUnits(width.name), hint: width.label }))}
          value={config.width}
          onChange={(value) => onChange('width', value)}
        />
      </Step>

      <Step
        index={6}
        title="Monogramme"
        titleId={titleId('monogramme')}
        value={config.monogram ? surcharge(MONOGRAM_PRICE) : `Facultatif · ${surcharge(MONOGRAM_PRICE)}`}
      >
        <MonogramField
          value={config.monogram}
          onValueChange={(value) => onChange('monogram', value)}
          styleId={config.monogramStyle}
          onStyleChange={(value) => onChange('monogramStyle', value)}
        />
      </Step>

      <Step
        index={7}
        title="Taille"
        titleId={titleId('taille')}
        value={
          <TextLink variant="label" onClick={onOpenGuide} aria-haspopup="dialog" className="-my-3">
            <span className="flex items-center gap-2.5">
              <Icon name="ruler" size={16} />
              Guide des tailles
            </span>
          </TextLink>
        }
      >
        <div id={sizeFieldId}>
          <OptionGrid
            labelledBy={titleId('taille')}
            columns={5}
            options={SIZES.map((entry) => ({ value: entry, label: entry }))}
            value={size}
            onChange={onSize}
          />
          {sizeError ? (
            <p role="alert" className="mt-3 flex items-start gap-1.5 text-[0.8125rem] leading-snug text-danger">
              <Icon name="alert" size={15} className="mt-px" />
              <span>Choisissez votre taille pour ajouter la ceinture au panier.</span>
            </p>
          ) : (
            <p className="mt-3 text-[0.8125rem] leading-snug text-muted">
              En centimètres. Votre tour de taille, plus {SIZE_ALLOWANCE_CM}&nbsp;cm&nbsp;; entre deux tailles, prenez la plus grande.
            </p>
          )}
        </div>
      </Step>
    </>
  );
}
