import { AnimatePresence, MotionConfig, motion as Motion } from 'motion/react';
import AtelierTile from '../components/product/AtelierTile';
import ProductCard from '../components/product/ProductCard';
import { countLabel, sortProducts } from '../components/product/catalogue';
import { Button, EASE_LUXE, Eyebrow, Reveal, RevealGroup, Section, SectionHeading, SplitText, TextLink, useToast } from '../components/ui';
import { useWishlist } from '../context/WishlistContext';
import { findProduct, products } from '../data/products';
import { usePageMeta } from '../hooks';

export default function Wishlist() {
  const { ids, toggle, clear } = useWishlist();
  const toast = useToast();

  // les favoris gardent l'ordre d'ajout ; un identifiant qui n'existe plus est ignoré
  const saved = ids.map((id) => findProduct(id)).filter(Boolean);
  const count = saved.length;
  const suggestions = sortProducts(products, 'selection')
    .filter((product) => product.featured)
    .slice(0, 4);

  usePageMeta({
    title: 'Vos favoris',
    description: 'Les ceintures DAG que vous avez mises de côté, conservées sur cet appareil.',
  });

  const removeAll = () => {
    const removed = [...ids];
    clear();
    toast({
      title: 'Vos favoris ont été retirés',
      icon: 'heart',
      duration: 7000,
      action: { label: 'Annuler', onClick: () => removed.forEach((id) => toggle(id)) },
    });
  };

  if (count === 0) {
    return (
      <>
        <Section tone="noir" first className="flex min-h-[78svh] flex-col justify-center">
          <SectionHeading
            as="h1"
            eyebrow="Vos favoris"
            title={'Rien encore.\nTout reste à *choisir*.'}
            lead="Touchez le cœur d’une ceinture pour la mettre de côté. Vous la retrouverez ici, sur cet appareil."
          >
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              <Button to="/shop" icon="arrow-right">
                Découvrir la collection
              </Button>
              <TextLink to="/atelier" variant="label" arrow>
                Composer la vôtre
              </TextLink>
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
