/**
 * Miniature 3D tournante : planche de sprites du moteur animée en CSS `steps()` (aucun travail
 * JavaScript par image). Tant que la planche n'est pas prête, un gabarit « photo en cours ».
 */
import type { CSSProperties } from 'react';
import type { Thumbnail } from '../../core/store';
import { spriteAnimation } from '../logic/sprite';
import { Icon } from '../components/Icon';

/** Durée d'affichage d'une vue au repos (s) ; la fiche survolée tourne deux fois plus vite. */
const SECONDS_PER_FRAME = 0.16;

export function SpriteThumbnail({ thumb, name }: { thumb: Thumbnail | undefined; name: string }) {
  if (!thumb) {
    return (
      <div className="thumb thumb-pending" role="img" aria-label={`${name} : miniature en préparation`}>
        <span className="thumb-pending-grid" aria-hidden="true" />
        <span className="thumb-pending-turntable" aria-hidden="true" />
        <Icon name="cube" className="thumb-pending-icon" />
        <span className="thumb-pending-text type">Photo en cours…</span>
      </div>
    );
  }
  const anim = spriteAnimation(thumb, SECONDS_PER_FRAME);
  const style = {
    '--sprite-columns': anim.columns,
    '--sprite-rows': anim.rows,
    '--sprite-period': `${anim.period}s`,
    '--sprite-row-period': `${anim.rowPeriod}s`,
    '--sprite-row-travel': `${-anim.rowTravel * 100}%`,
    aspectRatio: `${thumb.frameWidth} / ${thumb.frameHeight}`,
  } as CSSProperties;
  return (
    <div className="thumb thumb-ready" style={style} role="img" aria-label={`${name} : vue en rotation`}>
      <div className="thumb-rows" style={{ height: `${anim.sheetRows * 100}%` }}>
        <img
          className="thumb-sheet"
          src={thumb.url}
          alt=""
          draggable={false}
          style={{ width: `${anim.columns * 100}%` }}
        />
      </div>
    </div>
  );
}
