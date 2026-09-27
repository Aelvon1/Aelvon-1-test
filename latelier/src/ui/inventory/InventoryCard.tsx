/**
 * Fiche cartonnée d'un objet de l'inventaire, punaisée sur le liège : miniature tournante,
 * nom, catégorie, nombre de pièces et d'étapes, durée, tampon de difficulté.
 */
import { memo, type CSSProperties, type Ref } from 'react';
import type { CatalogEntry, Thumbnail } from '../../core/store';
import { formatMinutes, plural } from '../logic/format';
import { highlightRanges, splitByRanges } from '../logic/text';
import { DifficultyStamp } from '../components/Stamp';
import { SpriteThumbnail } from './SpriteThumbnail';

/** Petit hachage stable d'un identifiant (inclinaison et couleur de punaise propres à chaque fiche). */
export function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

const PIN_TONES = ['', ' is-petrol', ' is-olive', ' is-yellow'] as const;

export function Highlighted({ text, query }: { text: string; query: string }) {
  const segments = splitByRanges(text, highlightRanges(text, query));
  return (
    <>
      {segments.map((s, i) =>
        s.highlighted ? (
          <mark key={i} className="hl">
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

export interface InventoryCardProps {
  entry: CatalogEntry;
  thumb: Thumbnail | undefined;
  query: string;
  index: number;
  /** Fiche portant le focus clavier (tabindex itinérant). */
  focusable: boolean;
  onBench: boolean;
  onSelect: (entry: CatalogEntry) => void;
  onFocusIndex: (index: number) => void;
  onHover: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}

export const InventoryCard = memo(function InventoryCard({
  entry,
  thumb,
  query,
  index,
  focusable,
  onBench,
  onSelect,
  onFocusIndex,
  onHover,
  buttonRef,
}: InventoryCardProps) {
  const h = hashId(entry.id);
  const tilt = ((h % 1000) / 1000 - 0.5) * 2.4;
  const style = { '--tilt': `${tilt.toFixed(2)}deg` } as CSSProperties;
  const pin = PIN_TONES[h % PIN_TONES.length];
  const descriptionId = `inv-desc-${entry.id}`;
  // Mots-clés trouvés par la recherche (invisibles sinon sur la fiche).
  const keywordHits = query
    ? entry.keywords.filter((k) => highlightRanges(k, query).length > 0).slice(0, 3)
    : [];
  return (
    <li className="inv-cell">
      <button
        ref={buttonRef}
        type="button"
        className={`inv-card paper${onBench ? ' is-on-bench' : ''}`}
        style={style}
        data-index={index}
        tabIndex={focusable ? 0 : -1}
        aria-describedby={descriptionId}
        onFocus={() => onFocusIndex(index)}
        onMouseEnter={onHover}
        onClick={() => onSelect(entry)}
      >
        <span className={`pin${pin}`} aria-hidden="true" />
        <span className="inv-photo">
          <SpriteThumbnail thumb={thumb} name={entry.name} />
          <span className="tape top-left" aria-hidden="true" />
        </span>
        <span className="inv-body">
          <span className="inv-category dymo is-black">
            <Highlighted text={entry.category} query={query} />
          </span>
          <span className="inv-name display">
            <Highlighted text={entry.name} query={query} />
          </span>
          <span className="inv-stats">
            <span className="inv-stat">
              <b>{plural(entry.partCount, 'pièce')}</b>
            </span>
            <span className="inv-stat">{plural(entry.stepCount, 'étape')}</span>
            <span className="inv-stat">≈&nbsp;{formatMinutes(entry.estimatedMinutes)}</span>
          </span>
          <span id={descriptionId} className="inv-desc">
            <Highlighted text={entry.description} query={query} />
          </span>
          {keywordHits.length > 0 && (
            <span className="inv-keywords">
              Mots-clés&nbsp;:{' '}
              {keywordHits.map((k) => (
                <span key={k} className="inv-keyword">
                  <Highlighted text={k} query={query} />
                </span>
              ))}
            </span>
          )}
        </span>
        <span className="inv-stamp">
          <DifficultyStamp level={entry.difficulty} />
        </span>
        {onBench && <span className="inv-bench-tag stamp is-blue">Sur l’établi</span>}
      </button>
    </li>
  );
});
