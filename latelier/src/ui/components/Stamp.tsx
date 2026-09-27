/** Tampons encreurs : difficulté (1 à 5) et mentions (« Destructif », « Retirée »…). */
import type { ReactNode } from 'react';
import { difficultyLabel } from '../logic/format';

export function Stamp({
  children,
  tone = 'red',
  className,
  title,
}: {
  children: ReactNode;
  tone?: 'red' | 'blue' | 'olive';
  className?: string;
  title?: string;
}) {
  const toneClass = tone === 'red' ? '' : ` is-${tone}`;
  return (
    <span className={`stamp${toneClass}${className ? ` ${className}` : ''}`} title={title}>
      {children}
    </span>
  );
}

/** Tampon rond de difficulté : chiffre, 5 crans, libellé. */
export function DifficultyStamp({ level }: { level: 1 | 2 | 3 | 4 | 5 }) {
  const label = difficultyLabel(level);
  const tone = level >= 4 ? 'is-hard' : level >= 3 ? 'is-medium' : 'is-easy';
  return (
    <span
      className={`difficulty-stamp ${tone}`}
      role="img"
      aria-label={`Difficulté ${level} sur 5 : ${label}`}
    >
      <span className="difficulty-number" aria-hidden="true">
        {level}
      </span>
      <span className="difficulty-notches" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <i key={n} className={n <= level ? 'on' : undefined} />
        ))}
      </span>
      <span className="difficulty-label" aria-hidden="true">
        {label}
      </span>
    </span>
  );
}
