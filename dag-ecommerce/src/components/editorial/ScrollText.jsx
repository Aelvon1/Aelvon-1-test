import { useRef } from 'react';
import { motion as Motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { cn } from '../ui';

// Nombre de mots éclairés en même temps par le « front » de lecture.
const FRONT = 7;

function Word({ progress, start, end, children }) {
  const opacity = useTransform(progress, [start, end], [0.2, 1]);
  return <Motion.span style={{ opacity }}>{children}</Motion.span>;
}

/**
 * Texte qui s'éclaire mot à mot au fil du défilement, comme une lecture à voix basse.
 * Le texte est du vrai texte (lisible par les lecteurs d'écran) ; il est entièrement éclairé
 * avant d'atteindre le milieu de l'écran, et d'emblée si l'utilisateur préfère moins d'animations.
 * @param {{ paragraphs: string[], className?: string, paragraphClassName?: string }} props
 *   paragraphs : un paragraphe par chaîne ; les espaces insécables gardent leurs mots soudés
 */
export default function ScrollText({ paragraphs = [], className, paragraphClassName }) {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.82', 'end 0.6'] });

  const lines = paragraphs.map((paragraph) => paragraph.split(' ').filter(Boolean));
  const starts = lines.map((_, index) => lines.slice(0, index).reduce((sum, words) => sum + words.length, 0));
  const total = lines.reduce((sum, words) => sum + words.length, 0);
  const span = total + FRONT;

  return (
    <div ref={ref} className={className}>
      {lines.map((words, lineIndex) => (
        <p key={lineIndex} className={cn(paragraphClassName)}>
          {reduced
            ? words.join(' ')
            : words.map((word, wordIndex) => {
                const position = starts[lineIndex] + wordIndex;
                return (
                  <Word key={wordIndex} progress={scrollYProgress} start={position / span} end={(position + FRONT) / span}>
                    {word}
                    {wordIndex < words.length - 1 ? ' ' : ''}
                  </Word>
                );
              })}
        </p>
      ))}
    </div>
  );
}
