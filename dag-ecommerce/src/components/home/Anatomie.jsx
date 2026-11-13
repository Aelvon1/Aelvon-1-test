import { useState } from 'react';
import { usePrefersReducedMotion } from '../../hooks';
import AnatomieSequence from './AnatomieSequence';
import AnatomieStage from './AnatomieStage';
import { CHAPTERS } from './anatomie-content';
import { hasWebGL } from './webgl';

/**
 * Anatomie d'une ceinture. La scène 3D épinglée est réservée aux navigateurs qui peuvent la faire
 * tourner et aux visiteurs qui acceptent le mouvement ; sinon les mêmes chapitres se lisent en suite simple.
 */
export default function Anatomie() {
  const reduced = usePrefersReducedMotion();
  const [webgl] = useState(hasWebGL);
  // temps de la scène où la 3D a fait défaut (0 : ouverture) ; null tant qu'elle tourne
  const [failedAt, setFailedAt] = useState(null);
  const pinned = webgl && !reduced && failedAt === null;

  return (
    <section id="anatomie" aria-labelledby="anatomie-titre" className="theme-noir relative">
      {pinned ? (
        <AnatomieStage onUnavailable={setFailedAt} />
      ) : (
        // la scène a lâché en cours de lecture : la suite reprend au chapitre où l'on était
        <AnatomieSequence resumeAt={failedAt ? CHAPTERS[failedAt - 1]?.id : undefined} />
      )}
    </section>
  );
}
