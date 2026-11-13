import Eyebrow from './Eyebrow';
import SplitText from './SplitText';
import Reveal from './Reveal';
import { cn } from './cn';

const SIZES = { hero: 'text-hero', display: 'text-display', title: 'text-title', subtitle: 'text-subtitle' };

/**
 * En-tête de chapitre : sur-titre, titre révélé mot à mot, chapeau.
 * @param {{
 *   title: string, eyebrow?: import('react').ReactNode, index?: number|string,
 *   lead?: import('react').ReactNode, as?: 'h1'|'h2'|'h3', size?: 'hero'|'display'|'title'|'subtitle',
 *   align?: 'left'|'center', className?: string, titleClassName?: string,
 *   children?: import('react').ReactNode
 * }} props
 *   title : chaîne ; *mot* → italique, « \n » → retour à la ligne · as : niveau de titre (défaut h2)
 *   titleClassName : remplace la largeur maximale du titre (défaut « max-w-[18ch] ») · children : contenu libre
 *   sous le chapeau (liens, boutons)
 */
export default function SectionHeading({
  title,
  eyebrow,
  index,
  lead,
  as = 'h2',
  size = 'display',
  align = 'left',
  className,
  titleClassName,
  children,
}) {
  const centered = align === 'center';
  return (
    <div className={cn('flex flex-col', centered && 'items-center text-center', className)}>
      {eyebrow ? (
        <Reveal y={12}>
          <Eyebrow index={index} rule={index != null} className="mb-6 md:mb-8">
            {eyebrow}
          </Eyebrow>
        </Reveal>
      ) : null}
      <SplitText
        as={as}
        text={title}
        className={cn(SIZES[size] ?? SIZES.display, centered && 'mx-auto', titleClassName ?? 'max-w-[18ch]')}
      />
      {lead ? (
        <Reveal delay={0.25} className={cn('mt-6 max-w-[46ch] md:mt-8', centered && 'mx-auto')}>
          <p className="text-lead text-muted">{lead}</p>
        </Reveal>
      ) : null}
      {children ? (
        <Reveal delay={0.35} className="mt-8 md:mt-10">
          {children}
        </Reveal>
      ) : null}
    </div>
  );
}
