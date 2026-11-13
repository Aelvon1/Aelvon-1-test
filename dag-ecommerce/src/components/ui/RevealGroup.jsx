import { motion, useReducedMotion } from 'motion/react';
import { RevealGroupContext } from './reveal-context';

/**
 * Conteneur qui révèle ses <Reveal> enfants en cascade quand il entre dans la fenêtre.
 * @param {{
 *   as?: string, stagger?: number, delay?: number, once?: boolean, amount?: number,
 *   className?: string, children?: import('react').ReactNode
 * }} props
 *   stagger : écart entre deux enfants en secondes (défaut 0.1) · delay : attente initiale
 */
export default function RevealGroup({
  as = 'div',
  stagger = 0.1,
  delay = 0,
  once = true,
  amount = 0.15,
  className,
  children,
  ...rest
}) {
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
  return (
    <RevealGroupContext.Provider value={true}>
      <Tag
        className={className}
        initial="hidden"
        whileInView="shown"
        viewport={{ once, amount }}
        variants={{ hidden: {}, shown: { transition: { staggerChildren: stagger, delayChildren: delay } } }}
        {...rest}
      >
        {children}
      </Tag>
    </RevealGroupContext.Provider>
  );
}
