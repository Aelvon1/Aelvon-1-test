import { useId, useRef, useState } from 'react';
import { useHref, useParams, useSearchParams } from 'react-router-dom';
import BeltViewer from '../components/product/BeltViewer';
import Breadcrumb from '../components/product/Breadcrumb';
import MonogramOption from '../components/product/MonogramOption';
import ProductCard from '../components/product/ProductCard';
import ProductGallery from '../components/product/ProductGallery';
import Reassurance from '../components/product/Reassurance';
import SizeGuideDrawer from '../components/product/SizeGuideDrawer';
import StickyBuyBar from '../components/product/StickyBuyBar';
import StickyPanel from '../components/product/StickyPanel';
import {
  collectionUrl,
  productJsonLd,
  readColorParam,
  relatedProducts,
  sizeRange,
  sortProducts,
  withColorParam,
} from '../components/product/catalogue';
import { useJsonLd } from '../components/product/useJsonLd';
import { CONTACT_EMAIL } from '../components/layout/navigation';
import {
  Accordion,
  Badge,
  Button,
  Eyebrow,
  FavoriteButton,
  Icon,
  OptionGrid,
  Price,
  Reveal,
  RevealGroup,
  Section,
  SectionHeading,
  SplitText,
  Swatches,
  TextLink,
} from '../components/ui';
import { useCart } from '../context/CartContext';
import { MONOGRAM_STYLES, getMonogramStyle } from '../data/atelier';
import { findColor, findProduct, productGallery, productImage, productPath, products } from '../data/products';
import { scrollToTarget, usePageMeta } from '../hooks';
import { formatPrice } from '../lib/format';
import { FREE_SHIPPING_THRESHOLD, MONOGRAM_PRICE, SHIPPING_COST, catalogPrice } from '../lib/pricing';
import { SIZE_ALLOWANCE_CM } from '../lib/sizing';

const CONTAINER_BLEED = '-mx-[clamp(1.25rem,4vw,4rem)] px-[clamp(1.25rem,4vw,4rem)] scroll-px-[clamp(1.25rem,4vw,4rem)]';

/** Rangée de tuiles : bande à faire défiler sur mobile, grille de trois colonnes ensuite. */
function CardRow({ items }) {
  return (
    <RevealGroup
      as="ul"
      className={`${CONTAINER_BLEED} flex snap-x snap-mandatory gap-4 overflow-x-auto [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-x-5 sm:overflow-visible sm:px-0 lg:gap-x-6 [&::-webkit-scrollbar]:hidden`}
    >
      {items.map((item) => (
        <Reveal as="li" key={item.id} className="w-[72%] shrink-0 snap-start sm:w-auto">
          <ProductCard product={item} />
        </Reveal>
      ))}
    </RevealGroup>
  );
}

function ProductNotFound() {
  usePageMeta({
    title: 'Ceinture introuvable',
    description: 'Cette ceinture ne fait pas, ou plus, partie de la collection DAG.',
  });
  const suggestions = sortProducts(products, 'selection').slice(0, 3);

  return (
    <>
      <Section tone="noir" first>
        <SectionHeading
          as="h1"
          eyebrow="Introuvable"
          title={'Cette ceinture\nn’existe *pas*.'}
          lead="Elle a peut-être quitté la collection, ou l’adresse est incomplète. Les autres vous attendent."
        >
          <div className="flex flex-wrap gap-3">
            <Button to="/shop" icon="arrow-right">
              Voir la collection
            </Button>
            <Button to="/atelier" variant="outline">
              Composer la vôtre
            </Button>
          </div>
        </SectionHeading>
      </Section>
      <Section tone="ivoire">
        <Reveal y={12}>
          <Eyebrow rule className="mb-10 lg:mb-14">
            La sélection de la maison
          </Eyebrow>
        </Reveal>
        <CardRow items={suggestions} />
      </Section>
    </>
  );
}

function ProductView({ product }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { addToCart } = useCart();
  const ids = useId();
  const colorLabelId = `${ids}-coloris`;
  const sizeLabelId = `${ids}-taille`;
  const sizeFieldId = `${ids}-choix-taille`;

  const color = findColor(product, readColorParam(searchParams));
  const [size, setSize] = useState(null);
  const [sizeError, setSizeError] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [monogramOn, setMonogramOn] = useState(false);
  const [monogram, setMonogram] = useState('');
  const [monogramStyle, setMonogramStyle] = useState(MONOGRAM_STYLES[0].id);
  const [monogramError, setMonogramError] = useState('');
  const [viewerRequested, setViewerRequested] = useState(false);
  const addRef = useRef(null);
  const monogramRef = useRef(null);

  const appliedMonogram = monogramOn ? monogram : '';
  const price = catalogPrice(product, { monogram: appliedMonogram });
  const gallery = productGallery(product, color.value);
  const related = relatedProducts(product, 3);
  const pageHref = useHref(productPath(product));

  usePageMeta({
    title: product.name,
    description: `${product.description} ${formatPrice(product.price)}. Livraison offerte dès ${formatPrice(FREE_SHIPPING_THRESHOLD)}, retours gratuits sous 30\xa0jours.`,
  });

  useJsonLd(
    productJsonLd(product, {
      url: new URL(pageHref, window.location.href).href,
      images: gallery.map((shot) => new URL(shot.src, window.location.href).href),
    }),
  );

  // Le coloris vit dans l'URL : il remplace l'entrée d'historique, sans en ajouter.
  const chooseColor = (value) => {
    setSearchParams((previous) => withColorParam(previous, product, value), { replace: true, preventScrollReset: true });
  };

  const chooseSize = (value) => {
    setSize(String(value));
    setSizeError(false);
  };

  /** Amène un champ à l'écran s'il n'y est pas déjà (barre d'achat mobile, panneau défilé). */
  const bringIntoView = (element) => {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    if (rect.top < 96 || rect.bottom > window.innerHeight - 96) scrollToTarget(element, { offset: -32 });
  };

  const add = () => {
    if (!product.stock) return;
    if (!size) {
      setSizeError(true);
      const field = document.getElementById(sizeFieldId);
      bringIntoView(field);
      field?.querySelector('input')?.focus({ preventScroll: true });
      return;
    }
    if (monogramOn && !monogram) {
      setMonogramError('Saisissez votre monogramme, ou décochez l’option.');
      bringIntoView(monogramRef.current);
      monogramRef.current?.focus({ preventScroll: true });
      return;
    }
    addToCart(product, color, size, { monogram: appliedMonogram, monogramStyle });
  };

  const show3d = () => {
    setViewerRequested(true);
    scrollToTarget('#vue-3d', { focus: true });
  };

  const crumbs = [
    { label: 'Accueil', to: '/' },
    { label: 'Collection', to: '/shop' },
    { label: product.collection, to: collectionUrl(product.collection) },
    { label: product.name },
  ];

  const specs = [
    ['Matière', product.material],
    ['Largeur', product.width],
    ['Boucle', product.buckle],
    ['Tailles', sizeRange(product.sizes)],
    ['Coloris', product.colors.map((entry) => entry.name).join(', ')],
  ];

  const accordion = [
    {
      id: 'details',
      title: 'Détails',
      content: (
        <ul className="flex flex-col gap-2.5">
          {product.details.map((detail) => (
            <li key={detail} className="flex gap-3.5">
              <span aria-hidden="true" className="mt-[0.8em] h-px w-4 shrink-0 bg-accent" />
              <span>{detail}</span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: 'entretien',
      title: 'Matière et entretien',
      content: (
        <>
          <p>
            {product.material}. Boucle&nbsp;: {product.buckle.toLowerCase()}.
          </p>
          <p className="mt-3">
            Nettoyez votre ceinture régulièrement, avec un chiffon doux et sec. Pour nourrir le cuir, utilisez un produit d’entretien
            adapté deux à trois fois par an. Évitez l’exposition prolongée à l’eau et à la chaleur directe.
          </p>
        </>
      ),
    },
    {
      id: 'livraison',
      title: 'Livraison et retours',
      content: (
        <>
          <p>
            La livraison est offerte dès {formatPrice(FREE_SHIPPING_THRESHOLD)} d’achat&nbsp;; elle est de {formatPrice(SHIPPING_COST)} en
            deçà. Votre commande arrive en 3 à 5&nbsp;jours ouvrés en France métropolitaine.
          </p>
          <p className="mt-3">
            Les retours sont gratuits pendant 30&nbsp;jours après réception, pour une ceinture non portée, dans son emballage d’origine.
          </p>
        </>
      ),
    },
    {
      id: 'garantie',
      title: 'Garantie',
      content: (
        <p>
          Chaque ceinture DAG est garantie 2&nbsp;ans contre les défauts de fabrication. Une question&nbsp;? Écrivez-nous à{' '}
          <TextLink href={`mailto:${CONTACT_EMAIL}`} underline="always" tone="fg">
            {CONTACT_EMAIL}
          </TextLink>
          .
        </p>
      ),
    },
  ];

  return (
    <>
      {/* ------------------------------------------------------------------ Achat */}
      <section className="theme-ivoire relative pt-header">
        <div className="container-luxe pb-[clamp(4rem,8vw,8rem)] pt-1 lg:pt-8">
          <Breadcrumb items={crumbs} className="lg:hidden" />

          <div className="grid gap-y-7 lg:grid-cols-12 lg:gap-x-6">
            {/* min-w-0 : une cellule de grille ne doit pas s'élargir au contenu insécable qu'elle porte (légende tronquée). */}
            <div className="min-w-0 lg:col-span-7">
              <ProductGallery product={product} color={color} onView3d={show3d} />
              {/* Bureau : les engagements suivent la galerie, pour que le panneau d'achat, plus court, reste collé. */}
              <div className="mt-10 hidden lg:block">
                <Reassurance />
              </div>
            </div>

            <div className="min-w-0 lg:col-span-5 lg:pl-6 xl:col-span-4 xl:col-start-9 xl:pl-0">
              <StickyPanel>
                <Breadcrumb items={crumbs} className="-mt-3 mb-5 hidden lg:block" />

                <div className="flex min-h-6 items-center justify-between gap-4">
                  <Eyebrow>Collection {product.collection}</Eyebrow>
                  {product.badge ? <Badge>{product.badge}</Badge> : null}
                </div>
                <SplitText as="h1" className="mt-4 text-title" text={product.name} />
                {product.tagline ? <p className="mt-1.5 font-display text-subtitle italic text-muted">{product.tagline}</p> : null}

                <p className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-1" aria-live="polite" aria-atomic="true">
                  <Price amount={price} className="font-display text-[2rem] leading-none" />
                  {appliedMonogram ? (
                    <span className="text-[0.8125rem] text-muted">dont monogramme {formatPrice(MONOGRAM_PRICE)}</span>
                  ) : null}
                </p>

                <p className="mt-5 max-w-[46ch] text-[0.9375rem] leading-relaxed text-muted">{product.description}</p>

                <div className="mt-7 flex flex-col gap-7 border-t border-line pt-6">
                  {/* Coloris */}
                  <div>
                    <p className="flex items-baseline justify-between gap-4 text-[0.8125rem]">
                      <span id={colorLabelId} className="font-medium tracking-[0.02em]">
                        Coloris
                      </span>
                      <span className="text-muted" aria-live="polite">
                        {color.name}
                      </span>
                    </p>
                    <Swatches
                      className="mt-1.5"
                      size="lg"
                      labelledBy={colorLabelId}
                      options={product.colors}
                      value={color.value}
                      onChange={chooseColor}
                    />
                  </div>

                  {/* Taille */}
                  <div id={sizeFieldId}>
                    <div className="flex items-center justify-between gap-4">
                      <p className="flex items-baseline gap-3 text-[0.8125rem]">
                        <span id={sizeLabelId} className="font-medium tracking-[0.02em]">
                          Taille
                        </span>
                        <span className="text-muted">{size ? `${size}\xa0cm` : 'en centimètres'}</span>
                      </p>
                      <TextLink variant="label" onClick={() => setGuideOpen(true)} aria-haspopup="dialog">
                        <span className="flex items-center gap-2.5">
                          <Icon name="ruler" size={16} />
                          Guide des tailles
                        </span>
                      </TextLink>
                    </div>
                    <OptionGrid
                      className="mt-1"
                      labelledBy={sizeLabelId}
                      columns={Math.min(product.sizes.length, 6)}
                      options={product.sizes.map((entry) => ({ value: entry, label: entry }))}
                      value={size}
                      onChange={chooseSize}
                    />
                    {sizeError ? (
                      <p role="alert" className="mt-3 flex items-start gap-1.5 text-[0.8125rem] leading-snug text-danger">
                        <Icon name="alert" size={15} className="mt-px" />
                        <span>Choisissez votre taille pour ajouter la ceinture au panier.</span>
                      </p>
                    ) : (
                      <p className="mt-3 text-[0.8125rem] leading-snug text-muted">
                        Votre tour de taille, plus {SIZE_ALLOWANCE_CM}&nbsp;cm. Entre deux tailles, prenez la plus grande.
                      </p>
                    )}
                  </div>

                  {/* Monogramme */}
                  <MonogramOption
                    enabled={monogramOn}
                    onEnabledChange={(enabled) => {
                      setMonogramOn(enabled);
                      setMonogramError('');
                    }}
                    value={monogram}
                    onValueChange={(value) => {
                      setMonogram(value);
                      setMonogramError('');
                    }}
                    styleId={monogramStyle}
                    onStyleChange={setMonogramStyle}
                    error={monogramError}
                    inputRef={monogramRef}
                  />
                </div>

                {/* Achat */}
                <div ref={addRef} className="mt-7 flex gap-3">
                  <Button size="lg" variant="solid" fullWidth onClick={add} disabled={!product.stock}>
                    {product.stock ? 'Ajouter au panier' : 'Épuisé'}
                  </Button>
                  <FavoriteButton
                    product={product}
                    className="h-15 w-15 shrink-0 border border-fg/40 transition-[color,border-color] duration-500 ease-luxe hover:border-fg"
                  />
                </div>
                {product.stock ? (
                  <p className="mt-4 flex items-center gap-2.5 text-[0.8125rem] text-muted">
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-positive" />
                    En stock. Chez vous sous 3 à 5&nbsp;jours ouvrés.
                  </p>
                ) : null}

                {/* Mobile : les engagements viennent juste sous le bouton d'achat. */}
                <div className="mt-6 lg:hidden">
                  <Reassurance variant="list" />
                </div>
              </StickyPanel>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ Vue 3D */}
      <Section tone="noir" id="vue-3d" className="outline-none" aria-label="Vue 3D">
        <div className="grid gap-y-10 lg:grid-cols-12 lg:items-end lg:gap-x-6">
          <div className="lg:col-span-4 lg:pb-6">
            <SectionHeading
              eyebrow="Vue 3D"
              title={'Sous tous\nles *angles*.'}
              size="title"
              lead="Faites-la tourner. Approchez-vous de la boucle, du cuir, de la couture. Votre monogramme y apparaît dès que vous l’ajoutez."
            />
          </div>
          <Reveal className="lg:col-span-8">
            <BeltViewer
              belt={color.belt}
              monogram={appliedMonogram}
              monogramStyle={monogramStyle}
              poster={productImage(product, color.value, 'studio')}
              alt={`${product.name}, ${color.name}`}
              requested={viewerRequested}
              className="aspect-[4/5] sm:aspect-[16/10]"
            />
            <p className="eyebrow mt-4 flex flex-wrap justify-between gap-x-6 gap-y-1 text-[0.625rem] text-muted">
              <span>
                {product.name} — {color.name}
              </span>
              <span>
                {appliedMonogram ? `Monogramme ${appliedMonogram} · ${getMonogramStyle(monogramStyle).name}` : 'Sans monogramme'}
              </span>
            </p>
          </Reveal>
        </div>
      </Section>

      {/* ------------------------------------------------------------------ Détail */}
      <Section tone="ivoire">
        <div className="grid gap-y-14 lg:grid-cols-12 lg:gap-x-6">
          <div className="lg:col-span-5">
            <SectionHeading eyebrow="La pièce" title={'Ce qui la\n*distingue*.'} size="title" />
            <Reveal delay={0.2}>
              <p className="mt-7 max-w-[52ch] text-[1.0625rem] leading-[1.75] text-muted">{product.longDescription}</p>
              <dl className="mt-10 border-t border-line">
                {specs.map(([term, value]) => (
                  <div key={term} className="flex items-baseline justify-between gap-6 border-b border-line py-3.5">
                    <dt className="eyebrow shrink-0 text-[0.625rem] text-muted">{term}</dt>
                    <dd className="text-right text-[0.9375rem]">{value}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>
          <Reveal className="lg:col-span-6 lg:col-start-7" delay={0.1}>
            <Accordion items={accordion} defaultOpen="details" headingLevel={3} />
          </Reveal>
        </div>
      </Section>

      {/* ------------------------------------------------------------------ À découvrir */}
      {related.length > 0 ? (
        <Section tone="noir">
          <div className="mb-10 flex items-end justify-between gap-8 lg:mb-14">
            <SectionHeading eyebrow="À découvrir" title="Vous aimerez *aussi*." size="title" />
            <div className="hidden shrink-0 sm:block">
              <TextLink to="/shop" variant="label" arrow>
                Toute la collection
              </TextLink>
            </div>
          </div>
          <CardRow items={related} />
          <div className="mt-8 sm:hidden">
            <TextLink to="/shop" variant="label" arrow>
              Toute la collection
            </TextLink>
          </div>
        </Section>
      ) : null}

      <StickyBuyBar
        anchorRef={addRef}
        name={product.name}
        detail={size ? `${color.name} · ${size}\xa0cm` : color.name}
        price={price}
        label={!product.stock ? 'Épuisé' : size ? 'Ajouter' : 'Choisir la taille'}
        onAction={add}
        disabled={!product.stock}
      />

      <SizeGuideDrawer open={guideOpen} onClose={() => setGuideOpen(false)} product={product} selected={size} onApply={chooseSize} />
    </>
  );
}

export default function ProductDetail() {
  const { id } = useParams();
  const product = findProduct(id);
  if (!product) return <ProductNotFound />;
  return <ProductView key={product.id} product={product} />;
}
