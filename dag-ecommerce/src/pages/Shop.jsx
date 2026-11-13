import { useEffect, useId, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AnimatePresence, MotionConfig, motion as Motion } from 'motion/react';
import AtelierTile from '../components/product/AtelierTile';
import ProductCard from '../components/product/ProductCard';
import Reassurance from '../components/product/Reassurance';
import {
  SORTS,
  SORT_PARAM,
  capitalize,
  collectionSlug,
  countLabel,
  countWords,
  sortProducts,
} from '../components/product/catalogue';
import { Button, EASE_LUXE, Eyebrow, Icon, Reveal, Section, SplitText, TextLink, cn } from '../components/ui';
import { collections, products } from '../data/products';
import { useMediaQuery, usePageMeta } from '../hooks';

const COLOR_COUNT = products.reduce((total, product) => total + product.colors.length, 0);
const ALL_ALIASES = ['', 'all', 'toutes'];
const SPAN = { 1: 'col-span-1', 2: 'col-span-2', 3: 'col-span-3' };

/** Onglets discrets : chaque collection est un lien, l'URL fait foi (retour arrière, rechargement). */
function CollectionTabs({ tabs, active }) {
  const listRef = useRef(null);

  // l'onglet actif reste visible dans la bande défilante (mobile)
  useEffect(() => {
    const list = listRef.current;
    const current = list?.querySelector('[aria-current="true"]');
    if (!list || !current) return;
    const target = current.offsetLeft - (list.clientWidth - current.offsetWidth) / 2;
    list.scrollTo({ left: Math.max(0, target), behavior: 'auto' });
  }, [active]);

  return (
    <nav aria-label="Collections" className="min-w-0 lg:flex-1">
      <Motion.ul
        ref={listRef}
        layoutScroll
        className="-mx-[clamp(1.25rem,4vw,4rem)] flex gap-x-7 overflow-x-auto px-[clamp(1.25rem,4vw,4rem)] [scrollbar-width:none] max-lg:shadow-[inset_0_-1px_0_var(--line)] lg:mx-0 lg:gap-x-10 lg:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab) => {
          const current = tab.slug === active;
          return (
            <li key={tab.slug || 'toutes'} className="shrink-0">
              <Link
                to={tab.to}
                aria-current={current ? 'true' : undefined}
                className={cn(
                  'relative flex min-h-13 items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-[0.22em] transition-colors duration-500 ease-luxe',
                  current ? 'text-fg' : 'text-muted hover:text-fg',
                )}
              >
                {tab.label}
                <span className={cn('text-[0.625rem] tabular-nums tracking-normal', current ? 'text-accent' : 'text-muted')}>
                  {tab.count}
                  <span className="sr-only"> {tab.count > 1 ? 'modèles' : 'modèle'}</span>
                </span>
                {current ? (
                  <Motion.span
                    layoutId="shop-tab-rule"
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-px bg-fg"
                    transition={{ duration: 0.7, ease: EASE_LUXE }}
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
      </Motion.ul>
    </nav>
  );
}

function SortSelect({ value, onChange }) {
  const id = useId();
  return (
    <div className="flex shrink-0 items-center gap-3">
      <label htmlFor={id} className="eyebrow text-muted">
        Trier
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-11 cursor-pointer appearance-none bg-transparent py-2 pr-7 text-[0.8125rem] font-medium text-fg"
        >
          {SORTS.map((sort) => (
            <option key={sort.value} value={sort.value}>
              {sort.label}
            </option>
          ))}
        </select>
        <Icon name="chevron-down" size={16} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-muted" />
      </div>
    </div>
  );
}

export default function Shop() {
  const [searchParams, setSearchParams] = useSearchParams();
  const desktop = useMediaQuery('(min-width: 64rem)');

  // --- État lu dans l'URL -------------------------------------------------
  const requested = (searchParams.get('collection') ?? '').trim().toLowerCase();
  const showAll = ALL_ALIASES.includes(requested);
  const collection = showAll ? null : (collections.find((entry) => collectionSlug(entry.name) === requested) ?? null);
  const active = showAll ? '' : collection ? collectionSlug(collection.name) : null;
  const sortParam = searchParams.get(SORT_PARAM);
  const sort = SORTS.some((entry) => entry.value === sortParam) ? sortParam : SORTS[0].value;

  const matching = showAll ? products : collection ? products.filter((product) => product.collection === collection.name) : [];
  const list = sortProducts(matching, sort);
  const count = list.length;

  usePageMeta({
    title: collection ? `Collection ${collection.name}` : 'La collection',
    description: collection
      ? `${collection.description} Ceintures DAG en cuir, livraison offerte dès 100\xa0€.`
      : `${capitalize(countWords(products.length, 'modèle'))} de ceintures en cuir, ${countWords(COLOR_COUNT, 'coloris', 'coloris')}. Livraison offerte dès 100\xa0€, retours gratuits sous 30\xa0jours.`,
  });

  const hrefFor = (slug) => {
    const next = new URLSearchParams();
    if (slug) next.set('collection', slug);
    if (sort !== SORTS[0].value) next.set(SORT_PARAM, sort);
    const query = next.toString();
    return query ? `/shop?${query}` : '/shop';
  };

  const tabs = [
    { slug: '', label: 'Toutes', count: products.length, to: hrefFor('') },
    ...collections.map((entry) => ({
      slug: collectionSlug(entry.name),
      label: entry.name,
      count: products.filter((product) => product.collection === entry.name).length,
      to: hrefFor(collectionSlug(entry.name)),
    })),
  ];

  // le tri est une préférence d'affichage : il remplace l'entrée d'historique au lieu d'en créer une
  const setSort = (value) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value === SORTS[0].value) next.delete(SORT_PARAM);
        else next.set(SORT_PARAM, value);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  };

  // --- Grille : la tuile de l'Atelier complète toujours une rangée ---------
  const columns = desktop ? 3 : 2;
  const remainder = count % columns;
  const atelierSpan = remainder === 0 ? columns : columns - remainder;
  const atelierIndex = remainder === 0 ? Math.min(count, desktop ? columns : columns * 2) : count;
  const cells = list.map((product) => ({ key: `p-${product.id}`, product }));
  if (count > 0) cells.splice(atelierIndex, 0, { key: `atelier-${atelierSpan}`, atelier: true });

  const heading = showAll ? 'Toutes les ceintures' : collection ? `Collection ${collection.name}` : 'Collection introuvable';
  const blurb = showAll
    ? 'Du costume au jean brut, une ceinture pour chaque jour.'
    : collection
      ? collection.description
      : null;

  return (
    <>
      <Section tone="ivoire" first pad={false} className="pb-12 lg:pb-20">
        <div className="grid gap-y-9 lg:grid-cols-12 lg:items-end lg:gap-x-6">
          <div className="lg:col-span-8">
            <Reveal y={12}>
              <Eyebrow rule className="mb-6 md:mb-8">
                La collection
              </Eyebrow>
            </Reveal>
            <SplitText as="h1" className="text-display" text={'Tout ce qu’il faut.\nRien de *plus*.'} />
          </div>
          <Reveal delay={0.25} className="lg:col-span-4 lg:pb-3">
            <p className="max-w-[40ch] text-lead text-muted">
              {capitalize(countWords(products.length, 'modèle'))}, {countWords(COLOR_COUNT, 'coloris', 'coloris')}. Cuir pleine fleur,
              boucles en acier, finitions nettes.
            </p>
            <TextLink to="/guide-des-tailles" variant="label" arrow className="mt-4">
              Trouver votre taille
            </TextLink>
          </Reveal>
        </div>
      </Section>

      <section className="theme-ivoire relative pb-[clamp(4.5rem,9vw,9rem)]" aria-labelledby="catalogue-titre">
        <div className="container-luxe">
          <div className="flex flex-col lg:flex-row lg:items-stretch lg:justify-between lg:gap-10 lg:shadow-[inset_0_-1px_0_var(--line)]">
            <CollectionTabs tabs={tabs} active={active} />
            <div className="flex items-center justify-end max-lg:pt-2">
              <SortSelect value={sort} onChange={setSort} />
            </div>
          </div>

          <div className="flex flex-col gap-x-10 gap-y-2 pb-8 pt-7 lg:flex-row lg:items-baseline lg:justify-between lg:pb-12 lg:pt-12">
            <div key={active ?? 'introuvable'} className="page-enter flex flex-col gap-x-8 gap-y-2 lg:flex-row lg:items-baseline">
              <h2 id="catalogue-titre" className="text-subtitle">
                {heading}
              </h2>
              {blurb ? <p className="max-w-[52ch] text-[0.9375rem] text-muted">{blurb}</p> : null}
            </div>
            <p role="status" className="eyebrow shrink-0 text-muted max-lg:mt-2">
              {countLabel(count, 'modèle')}
            </p>
          </div>

          {count > 0 ? (
            <MotionConfig reducedMotion="user">
              <ul className="relative grid grid-cols-2 gap-x-4 gap-y-12 sm:gap-x-5 lg:grid-cols-3 lg:gap-x-6 lg:gap-y-20">
                <AnimatePresence mode="popLayout">
                  {cells.map((cell, index) => (
                    <Motion.li
                      key={cell.key}
                      layout="position"
                      className={cell.atelier ? SPAN[atelierSpan] : undefined}
                      initial={{ opacity: 0, y: 28 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.1 }}
                      exit={{ opacity: 0, transition: { duration: 0.3, ease: 'easeOut' } }}
                      transition={{
                        duration: 0.9,
                        ease: EASE_LUXE,
                        delay: (index % columns) * 0.08,
                        layout: { duration: 0.9, ease: EASE_LUXE },
                      }}
                    >
                      {cell.atelier ? <AtelierTile /> : <ProductCard product={cell.product} priority={index < columns} />}
                    </Motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </MotionConfig>
          ) : (
            <div className="page-enter grid gap-y-10 border-t border-line pb-6 pt-14 lg:grid-cols-12 lg:gap-x-6 lg:pt-20">
              <div className="lg:col-span-7">
                <p className="max-w-[16ch] text-title">Aucune ceinture ne porte ce nom.</p>
                <p className="mt-6 max-w-[44ch] text-lead text-muted">
                  Cette collection n’existe pas, ou n’existe plus. Revenez à l’ensemble des modèles — ou composez la vôtre à l’Atelier.
                </p>
                <div className="mt-9 flex flex-wrap gap-3">
                  <Button to="/shop" variant="solid">
                    Voir toute la collection
                  </Button>
                  <Button to="/atelier" variant="outline" icon="arrow-right">
                    Composer la vôtre
                  </Button>
                </div>
              </div>
            </div>
          )}

          <Reveal className="mt-[clamp(4.5rem,9vw,9rem)]">
            <Reassurance />
          </Reveal>
        </div>
      </section>
    </>
  );
}
