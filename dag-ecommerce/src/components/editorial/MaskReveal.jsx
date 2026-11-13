import { useRef } from 'react';
import { motion as Motion, useInView, useReducedMotion } from 'motion/react';
import { EASE_LUXE } from '../ui';

const HIDDEN = {
  bottom: 'inset(100% 0% 0% 0%)',
  top: 'inset(0% 0% 100% 0%)',
  left: 'inset(0% 100% 0% 0%)',
  right: 'inset(0% 0% 0% 100%)',
};

/**
 * Dévoile un visuel derrière un masque qui se retire, pendant que l'image se pose (léger dézoom).
 * Immobile et visible d'emblée si l'utilisateur préfère moins d'animations.
 * @param {{
 *   from?: 'bottom'|'top'|'left'|'right', delay?: number, duration?: number, amount?: number,
 *   className?: string, children?: import('react').ReactNode
 * }} props
 *   from : bord d'où part le dévoilement (défaut « bottom ») · amount : part visible qui déclenche
 */
export default function MaskReveal({ from = 'bottom', delay = 0, duration = 1.5, amount = 0.2, className, children }) {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  // l'entrée à l'écran est observée sur l'enveloppe : le calque masqué, lui, n'a pas de surface visible
  const inView = useInView(ref, { once: true, amount });

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <div ref={ref} className={className}>
      <Motion.div
        className="overflow-hidden"
        initial="hidden"
        animate={inView ? 'shown' : 'hidden'}
        variants={{
          hidden: { clipPath: HIDDEN[from] ?? HIDDEN.bottom },
          shown: { clipPath: 'inset(0% 0% 0% 0%)', transition: { duration, ease: EASE_LUXE, delay } },
        }}
      >
        <Motion.div
          variants={{
            hidden: { scale: 1.14 },
            shown: { scale: 1, transition: { duration: duration + 0.5, ease: EASE_LUXE, delay } },
          }}
        >
          {children}
        </Motion.div>
      </Motion.div>
    </div>
  );
}
