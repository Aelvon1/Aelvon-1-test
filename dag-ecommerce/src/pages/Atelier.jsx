import { useCallback, useId, useRef, useState } from 'react';
import { useHref } from 'react-router-dom';
import BuyBar from '../components/atelier/BuyBar';
import Composition from '../components/atelier/Composition';
import Facts from '../components/atelier/Facts';
import Inspirations from '../components/atelier/Inspirations';
import ShareDialog from '../components/atelier/ShareDialog';
import SizeGuide from '../components/atelier/SizeGuide';
import Stage from '../components/atelier/Stage';
import Summary from '../components/atelier/Summary';
import { browserStorage, cleanConfig, isDefaultLook, saveDraft, viewForEdit } from '../components/atelier/atelier-state';
import { bringIntoView } from '../components/atelier/bring-into-view';
import { surpriseBelt } from '../components/atelier/presets';
import { useAtelier } from '../components/atelier/useAtelier';
import { useFraming } from '../components/atelier/useFraming';
import { Eyebrow, Price, SplitText, useToast } from '../components/ui';
import { useCart } from '../context/CartContext';
import { DEFAULT_BELT } from '../data/atelier';
import { usePageMeta, usePrefersReducedMotion } from '../hooks';
import { beltToSearchParams } from '../lib/atelier-url';
import { formatPrice } from '../lib/format';
import { ATELIER_BASE_PRICE, atelierPrice } from '../lib/pricing';

/**
 * L'Atelier : composer sa ceinture, la voir en 3D à mesure, l'ajouter au panier.
 * La scène est collante (à gauche à partir de lg, en haut sinon) ; le panneau de composition défile.
 */
export default function Atelier() {
  usePageMeta({
    title: 'L’Atelier',
    description: `Composez votre ceinture DAG\xa0: cuir, finition, boucle, couture, largeur et monogramme. Elle se dessine en 3D sous vos yeux, à partir de ${formatPrice(ATELIER_BASE_PRICE)}.`,
  });

  const { config, size, surface, hintSeen, edit, chooseSize, chooseSurface } = useAtelier();
  const reducedMotion = usePrefersReducedMotion();
  const { view, pin, follow } = useFraming({ hasMonogram: Boolean(config.monogram), disabled: reducedMotion });
  const { addCustomBelt } = useCart();
  const toast = useToast();

  const [hint, setHint] = useState(!hintSeen);
  const [sizeError, setSizeError] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState(null);

  const sizeFieldId = `${useId()}-choix-taille`;

  // accès à la scène pour la vignette du panier (null tant que la 3D n'est pas prête, ou absente)
  const scene = useRef(null);
  const handleReady = useCallback((api) => {
    scene.current = api;
  }, []);

  const shareHref = useHref({ pathname: '/atelier', search: `?${beltToSearchParams(config)}` });


  /** Modifie un réglage ; la caméra va montrer la partie concernée. */
  const change = (field, value) => {
    edit({ [field]: value });
    follow(viewForEdit(field, { ...config, [field]: value }));
  };

  const applyLook = (look) => {
    edit(look);
    follow('full');
  };

  const reset = () => {
    const previous = config;
    applyLook(cleanConfig(DEFAULT_BELT));
    toast({
      title: 'Composition réinitialisée',
      icon: 'return',
      duration: 7000,
      action: { label: 'Annuler', onClick: () => applyLook(previous) },
    });
  };

  const pickSize = (value) => {
    chooseSize(value);
    setSizeError(false);
  };

  const showSizes = () => {
    const field = document.getElementById(sizeFieldId);
    bringIntoView(field);
    (field?.querySelector('input:checked') ?? field?.querySelector('input'))?.focus({ preventScroll: true });
  };

  const add = () => {
    if (!size) {
      setSizeError(true);
      showSizes();
      return;
    }
    let image = null;
    try {
      image = scene.current?.capture({ size: 512 }) ?? null;
    } catch {
      image = null; // sans vignette, le panier dessine la ceinture
    }
    addCustomBelt(config, size, { image });
  };

  const share = async () => {
    const url = new URL(shareHref, window.location.href).href;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Lien copié', description: 'Il ouvre l’Atelier sur cette ceinture.' });
    } catch {
      // presse-papiers absent ou refusé : le lien est montré, sélectionné
      setShareUrl(url);
    }
  };

  const dismissHint = () => {
    setHint(false);
    saveDraft(browserStorage(), { hintSeen: true });
  };

  return (
    <div className="theme-ivoire relative pt-header [--stage-h:clamp(9rem,42svh,30rem)] lg:grid lg:grid-cols-[minmax(0,1fr)_28rem] lg:pt-0 xl:grid-cols-[minmax(0,1fr)_36rem] 2xl:grid-cols-[minmax(0,1fr)_40rem]">
      <Stage
        config={config}
        view={view}
        onView={pin}
        surface={surface}
        onSurface={chooseSurface}
        onReady={handleReady}
        hint={hint}
        onHintDone={dismissHint}
      />

      {/*
        Panneau de composition.
        Marges de défilement des commandes : au clavier, le focus n'arrive ni sous la scène collante
        (mobile ; l'en-tête est déjà réservé par la page) ni sous le pied collant. Les boutons radio
        sont des points invisibles en haut de leur carte : la marge basse compte la carte entière.
        overflow-x-clip : l'infobulle d'une pastille proche du bord n'élargit pas la page.
      */}
      <div className="@container min-w-0 overflow-x-clip [--panel-px:1.25rem] sm:[--panel-px:2rem] lg:[--panel-px:2.5rem] xl:[--panel-px:3rem] 2xl:[--panel-px:3.5rem] [&_:is(button,a,input[type=text])]:scroll-mb-28 [&_input[type=radio]]:scroll-mb-64 max-lg:[&_:is(input,button,a)]:scroll-mt-[calc(var(--stage-h)+0.5rem)]">
        <div className="mx-auto max-w-[36rem] px-[var(--panel-px)] lg:max-w-none">
          <header className="pb-8 pt-8 lg:pb-10 lg:pt-[calc(var(--header-h)+2.75rem)]">
            <Eyebrow rule>L’Atelier</Eyebrow>
            <SplitText as="h1" className="mt-5 text-title" text="Composez la *vôtre*." />
            <p className="mt-5 max-w-[42ch] text-[1.0625rem] leading-relaxed text-muted">
              Choisissez le cuir, la boucle, la couture. Chaque choix se voit aussitôt sur la ceinture.
            </p>
            <p className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <Price amount={ATELIER_BASE_PRICE} from className="font-display text-[1.5rem] leading-none" />
              <span className="text-[0.8125rem] text-muted">Fabriquée à la commande.</span>
            </p>
          </header>

          <Inspirations
            config={config}
            onApply={(preset) => applyLook(preset.config)}
            onSurprise={() => applyLook(surpriseBelt(config))}
            onReset={reset}
            canReset={!isDefaultLook(config) || Boolean(config.monogram)}
          />

          <Composition
            config={config}
            onChange={change}
            size={size}
            onSize={pickSize}
            sizeError={sizeError}
            sizeFieldId={sizeFieldId}
            onOpenGuide={() => setGuideOpen(true)}
          />

          <Summary config={config} size={size} onChooseSize={showSizes} onShare={share} />
        </div>

        <BuyBar config={config} size={size} onAdd={add} />

        <div className="mx-auto max-w-[36rem] px-[var(--panel-px)] pb-12 pt-4 lg:max-w-none lg:pb-16">
          <Facts total={atelierPrice(config)} />
        </div>
      </div>

      <SizeGuide open={guideOpen} onClose={() => setGuideOpen(false)} selected={size} onApply={pickSize} />
      <ShareDialog url={shareUrl} onClose={() => setShareUrl(null)} />
    </div>
  );
}
