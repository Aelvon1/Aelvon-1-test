import { Fragment } from 'react';
import { motion as Motion, useReducedMotion } from 'motion/react';
import { EASE_LUXE } from './motion-presets';
import { cn } from './cn';

/**
 * Découpe « La ceinture,\nen *mieux*. » en lignes → mots → segments { text, em }.
 * Les espaces insécables restent à l'intérieur d'un mot (« mieux ! » ne se sépare pas).
 */
function parse(source) {
  let em = false;
  return String(source ?? '')
    .split('\n')
    .map((line) => {
      const words = [[]];
      for (const char of line) {
        if (char === '*') {
          em = !em;
        } else if (char === ' ') {
          if (words[words.length - 1].length) words.push([]);
        } else {
          const word = words[words.length - 1];
          const last = word[word.length - 1];
          if (last && last.em === em) last.text += char;
          else word.push({ text: char, em });
        }
      }
      return words.filter((word) => word.length);
    })
    .filter((words) => words.length);
}

const renderSegments = (segments) =>
  segments.map((segment, index) =>
    segment.em ? (
      <em key={index} className="italic">
        {segment.text}
      </em>
    ) : (
      <Fragment key={index}>{segment.text}</Fragment>
    ),
  );

const renderWords = (words) =>
  words.map((segments, index) => (
    <Fragment key={index}>
      {index > 0 ? ' ' : null}
      {renderSegments(segments)}
    </Fragment>
  ));

// Le masque déborde un peu du mot pour ne rogner ni les accents ni les italiques.
const MASK = 'overflow-hidden px-[0.12em] -mx-[0.12em] pt-[0.18em] -mt-[0.18em] pb-[0.24em] -mb-[0.24em]';

/**
 * Titre révélé mot à mot (ou ligne à ligne) derrière un masque.
 * Marquez l'emphase en italique avec des astérisques : « La ceinture, en *mieux*. »
 * Un « \n » force un retour à la ligne. Les lecteurs d'écran reçoivent la phrase une seule fois.
 * @param {{
 *   text?: string, children?: string, as?: string, by?: 'word'|'line',
 *   delay?: number, stagger?: number, duration?: number, once?: boolean, amount?: number,
 *   className?: string
 * }} props
 *   as : balise rendue (défaut « span » ; « h1 », « h2 », « p »…) · by « line » : une unité par ligne « \n »
 */
export default function SplitText({
  text,
  children,
  as = 'span',
  by = 'word',
  delay = 0,
  stagger,
  duration = 1.1,
  once = true,
  amount = 0.5,
  className,
  ...rest
}) {
  const Tag = as;
  const reduced = useReducedMotion();
  const source = text ?? (typeof children === 'string' ? children : '');
  const lines = parse(source);
  const plain = lines.map((words) => words.map((segments) => segments.map((s) => s.text).join('')).join(' ')).join(' ');

  if (reduced) {
    return (
      <Tag className={className} {...rest}>
        {lines.map((words, index) => (
          <span key={index} className="block">
            {renderWords(words)}
          </span>
        ))}
      </Tag>
    );
  }

  const item = {
    hidden: { y: '118%' },
    shown: { y: '0%', transition: { duration, ease: EASE_LUXE } },
  };
  const gap = stagger ?? (by === 'line' ? 0.14 : 0.07);

  return (
    <Tag className={className} {...rest}>
      <span className="sr-only">{plain}</span>
      <Motion.span
        aria-hidden="true"
        className="block"
        initial="hidden"
        whileInView="shown"
        viewport={{ once, amount }}
        variants={{ hidden: {}, shown: { transition: { staggerChildren: gap, delayChildren: delay } } }}
      >
        {lines.map((words, lineIndex) =>
          by === 'line' ? (
            <span key={lineIndex} className={cn(MASK, 'block')}>
              <Motion.span className="block" variants={item}>
                {renderWords(words)}
              </Motion.span>
            </span>
          ) : (
            <span key={lineIndex} className="block">
              {words.map((segments, wordIndex) => (
                <Fragment key={wordIndex}>
                  {wordIndex > 0 ? ' ' : null}
                  <span className={cn(MASK, 'inline-block align-top')}>
                    <Motion.span className="inline-block" variants={item}>
                      {renderSegments(segments)}
                    </Motion.span>
                  </span>
                </Fragment>
              ))}
            </span>
          ),
        )}
      </Motion.span>
    </Tag>
  );
}
