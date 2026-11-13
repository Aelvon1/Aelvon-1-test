import { Packshot, cn } from '../ui';

const POSITIONS = {
  center: '',
  top: '[&_img]:object-top',
  bottom: '[&_img]:object-bottom',
  left: '[&_img]:object-left',
  right: '[&_img]:object-right',
};

/**
 * Gros plan pleine tuile : un rendu « boucle » ou « detail » qui remplit sa tuile de studio
 * (les plans macro sont cadrés bord à bord ; en « contain » leurs bords apparaîtraient).
 * Repose sur Packshot : place réservée, fondu à l'arrivée, dessin de repli si le rendu manque.
 * @param {{
 *   visual: { src: string, belt?: object } | null, alt?: string, ratio?: string,
 *   position?: 'center'|'top'|'bottom'|'left'|'right', className?: string
 * }} props  + les autres props de Packshot (loading, surface, children…)
 */
export default function Macro({ visual, alt = '', ratio = '1 / 1', position = 'center', className, ...rest }) {
  return (
    <Packshot
      src={visual?.src}
      belt={visual?.belt}
      alt={alt}
      ratio={ratio}
      className={cn('[&_img]:object-cover', POSITIONS[position] ?? '', className)}
      {...rest}
    />
  );
}
