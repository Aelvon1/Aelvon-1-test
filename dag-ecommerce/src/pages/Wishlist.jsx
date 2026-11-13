import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion as Motion } from 'motion/react';
import AtelierTile from '../components/product/AtelierTile';
import ProductCard from '../components/product/ProductCard';
import { countLabel, sortProducts } from '../components/product/catalogue';
import { missingIds, savedProducts } from '../components/product/wishlist';
import {
  Button,
  EASE_LUXE,
  Eyebrow,
  Icon,
  Reveal,
  RevealGroup,
  Section,
  SectionHeading,
  SplitText,
  TextLink,
  useToast,
} from '../components/ui';
import { useWishlist } from '../context/WishlistContext';
import { products } from '../data/products';
import { scrollToTop, usePageMeta } from '../hooks';

export default function Wishlist() {
  const { ids, toggle, clear } = useWishlist();
  const toast = useToast();

  // les favoris gardent l'ordre d'ajout ; un doublon, ou un modèle qui n'existe plus, est ignoré…
  const saved = savedProducts(ids);
  const count = saved.length;
  const empty = count === 0;
  const suggestions = sortProducts(products, 'selection')
    .filter((product) => product.featured)
    .slice(0, 4);

  usePageMeta({
    title: 'Vos favoris',
    description: 'Les ceintures DAG que vous avez mises de côté, conservées sur cet appareil.',
  });

  // … et sort de la liste enregistrée, que l'en-tête compte telle quelle
  useEffect(() => {
    if (ids.length === saved.length) return;
    clear();
    saved.forEach((product) => toggle(product.id));
  });

  // --- « Tout retirer » et son annulation ---------------------------------
  // favoris retirés, tant que la page vide propose de les rétablir
  const [removed, setRemoved] = useState(null);
  const undoToast = useRef(null);
  // favoris du dernier rendu : la notification garde la fonction reçue à sa création, avec ceux d'alors
  const latestIds = useRef(ids);
  useEffect(() => {
    latestIds.current = ids;
  });

  /** Rétablit ce que « Tout retirer » a retiré, sans toucher aux favoris remis depuis. */
  const restore = (list) => {
    missingIds(list, latestIds.current).forEach((id) => toggle(id));
    setRemoved(null);
    toast.dismiss(undoToast.current);
  };

  const removeAll = () => {
    const list = saved.map((product) => product.id);
    clear();
    setRemoved(list);
    undoToast.current = toast({
      title: 'Vos favoris ont été retirés',
      icon: 'heart',
      duration: 7000,
      action: {
        label: 'Annuler',
        onClick: () => {
          restore(list);
          // la notification se referme, et avec elle le bouton qui portait le focus
          document.getElementById('contenu')?.focus({ preventScroll: true });
        },
      },
    });
  };

  // un favori ajouté depuis : la page vide ne proposera plus de rétablir les anciens
  if (removed && !empty) setRemoved(null);

  // l'annulation quitte l'écran avec la page : ailleurs, elle ne verrait pas les favoris ajoutés depuis
  useEffect(() => () => toast.dismiss(undoToast.current), [toast]);

  // La vue change du tout au tout (liste ↔ page vide) et emporte la commande qui vient d'être
  // activée — « Tout retirer », un cœur, « Rétablir » : le focus, retombé sur le document, rejoint
  // le contenu de la page, ramenée en haut. Tenu ailleurs (en-tête, panier ouvert), il y reste.
  const shownEmpty = useRef(empty);
  useEffect(() => {
    if (shownEmpty.current === empty) return;
    shownEmpty.current = empty;
    const main = document.getElementById('contenu');
    const active = document.activeElement;
    if (active && active !== document.body && active !== main) return;
    scrollToTop({ immediate: true });
    main?.focus({ preventScroll: true });
  }, [empty]);

  if (empty) {
    return (
      <>
        <Section tone="noir" first className="flex min-h-[78svh] flex-col justify-center">
          <SectionHeading
            as="h1"
            eyebrow="Vos favoris"
            title={'Rien encore.\nTout reste à *choisir*.'}
            lead="Touchez le cœur d’une ceinture pour la mettre de côté. Vous la retrouverez ici, sur cet appareil."
          >
            <div className="flex flex-col items-start gap-y-4">
              {removed ? (
                <TextLink variant="label" underline="always" onClick={() => restore(removed)}>
                  <span className="flex items-center gap-2.5">
                    <Icon name="return" size={16} />
                    Rétablir vos favoris
                  </span>
                </TextLink>
              ) : null}
              <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                <Button to="/shop" icon="arrow-right">
                  Découvrir la collection
                </Button>
                <TextLink to="/atelier" variant="label" arrow>
                  Composer la vôtre
                </TextLink>
              </div>
            </div>
          </SectionHeading>
        </Section>

        <Section tone="ivoire">
          <div className="mb-10 flex items-end justify-between gap-8 lg:mb-14">
            <div>
              <Reveal y={12}>
                <Eyebrow rule className="mb-5">
                  Pour commencer
                </Eyebrow>
              </Reveal>
              <SplitText as="h2" className="text-title" text="La sélection de la *maison*." />
            </div>
            <div className="hidden shrink-0 sm:block">
              <TextLink to="/shop" variant="label" arrow>
                Toute la collection
              </TextLink>
            </div>
          </div>
          <RevealGroup as="ul" className="grid grid-cols-2 gap-x-4 gap-y-12 sm:gap-x-5 lg:grid-cols-4 lg:gap-x-6">
            {suggestions.map((product) => (
              <Reveal as="li" key={product.id}>
                <ProductCard product={product} />
              </Reveal>
            ))}
          </RevealGroup>
        </Section>
      </>
    );
  }

  return (
    <>
      <Section tone="noir" first>
        <div className="flex flex-col gap-y-8 lg:flex-row lg:items-end lg:justify-between lg:gap-x-10">
          <SectionHeading as="h1" eyebrow="Vos favoris" title="Mises de *côté*." lead="Vos ceintures préférées, conservées sur cet appareil." />
          <div className="flex items-center gap-8 lg:pb-2">
            <p role="status" className="eyebrow text-muted">
              {countLabel(count, 'ceinture')}
            </p>
            <TextLink variant="label" underline="always" onClick={removeAll}>
              Tout retirer
            </TextLink>
          </div>
        </div>

        <MotionConfig reducedMotion="user">
          <ul className="relative mt-12 grid grid-cols-2 gap-x-4 gap-y-12 sm:gap-x-5 lg:mt-20 lg:grid-cols-3 lg:gap-x-6 lg:gap-y-20">
            <AnimatePresence mode="popLayout" initial={false}>
              {saved.map((product, index) => (
                <Motion.li
                  key={product.id}
                  layout="position"
                  initial={{ opacity: 0, y: 28 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0.3, ease: 'easeOut' } }}
                  transition={{ duration: 0.9, ease: EASE_LUXE, layout: { duration: 0.9, ease: EASE_LUXE } }}
                >
                  <ProductCard product={product} headingLevel={2} priority={index < 3} />
                </Motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </MotionConfig>
      </Section>

      <Section tone="ivoire">
        <div className="grid gap-y-10 lg:grid-cols-12 lg:items-stretch lg:gap-x-6">
          <div className="flex flex-col justify-between gap-10 lg:col-span-5">
            <SectionHeading
              eyebrow="Et ensuite"
              title="Poursuivre la *visite*."
              size="title"
              lead="Le reste de la collection vous attend. Et si aucune n’est tout à fait la vôtre, composez-la."
            >
              <Button to="/shop" variant="solid" icon="arrow-right">
                Voir la collection
              </Button>
            </SectionHeading>
          </div>
          <Reveal className="lg:col-span-7">
            <AtelierTile headingLevel={2} className="lg:min-h-[24rem]" />
          </Reveal>
        </div>
      </Section>
    </>
  );
}
