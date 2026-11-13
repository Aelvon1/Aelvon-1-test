import { cn } from './cn';

/**
 * Chapitre de page : pose la surface (noir ou ivoire), le rythme vertical et le conteneur.
 * C'est la classe de thème posée ici que l'en-tête lit pour choisir son ton.
 * @param {{
 *   tone?: 'noir'|'ivoire', as?: string, pad?: boolean, contained?: boolean, first?: boolean,
 *   className?: string, innerClassName?: string, children?: import('react').ReactNode
 * }} props
 *   pad : applique section-pad (défaut true) · contained : enveloppe le contenu dans container-luxe (défaut true)
 *   first : premier chapitre de la page → réserve la place de l'en-tête fixe (page-top)
 */
export default function Section({
  tone = 'noir',
  as = 'section',
  pad = true,
  contained = true,
  first = false,
  className,
  innerClassName,
  children,
  ...rest
}) {
  const Tag = as;
  return (
    <Tag
      className={cn(
        tone === 'ivoire' ? 'theme-ivoire' : 'theme-noir',
        'relative',
        pad && 'section-pad',
        first && 'page-top',
        className,
      )}
      {...rest}
    >
      {contained ? <div className={cn('container-luxe', innerClassName)}>{children}</div> : children}
    </Tag>
  );
}
