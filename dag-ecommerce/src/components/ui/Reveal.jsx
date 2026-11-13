import { useContext } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { EASE_LUXE } from './motion-presets';
import { RevealGroupContext } from './reveal-context';

/**
 * Révèle son contenu (fondu + montée) quand il entre dans la fenêtre.
 * Dans un <RevealGroup>, il suit la cascade du groupe (delay est alors ignoré).
 * @param {{
 *   as?: string, delay?: number, duration?: number, y?: number, once?: boolean, amount?: number,
 *   className?: string, children?: import('react').ReactNode
 * }} props
 *   as : balise HTML (défaut « div ») · delay / duration en secondes · y : montée en px
 *   once : ne joue qu'une fois (défaut true) · amount : part visible qui déclenche (0 à 1)
 */
export default function Reveal({
  as = 'div',
  delay = 0,
  duration = 0.9,
  y = 28,
  once = true,
  amount = 0.15,
  className,
  children,
  ...rest
}) {
  const inGroup = useContext(RevealGroupContext);
  const reduced = useReducedMotion();

  if (reduced) {
    const Plain = as;
    return (
      <Plain className={className} {...rest}>
        {children}
      </Plain>
    );
  }

  const Tag = motion[as] ?? motion.div;
  const variants = {
    hidden: { opacity: 0, y },
    shown: {
      opacity: 1,
      y: 0,
      transition: inGroup ? { duration, ease: EASE_LUXE } : { duration, ease: EASE_LUXE, delay },
    },
  };

  if (inGroup) {
    return (
      <Tag className={className} variants={variants} {...rest}>
        {children}
      </Tag>
    );
  }

  return (
    <Tag
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="shown"
      viewport={{ once, amount }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
