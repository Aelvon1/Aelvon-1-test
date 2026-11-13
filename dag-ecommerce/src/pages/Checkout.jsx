import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eyebrow, Section, SplitText } from '../components/ui';
import DetailsStep from '../components/checkout/DetailsStep';
import EmptyCheckout from '../components/checkout/EmptyCheckout';
import OrderSummary, { Assurances } from '../components/checkout/OrderSummary';
import PaymentStep from '../components/checkout/PaymentStep';
import StepIndicator from '../components/checkout/StepIndicator';
import { clearDraft, loadDraft, saveDraft } from '../components/checkout/draft';
import { CHECKOUT_STEPS, EMPTY_TITLE_ID } from '../components/checkout/steps';
import { useToday } from '../components/checkout/useToday';
import { useCart } from '../context/CartContext';
import { getLenis, scrollToTarget, scrollToTop, useMediaQuery, usePageMeta } from '../hooks';
import { createOrder, listOrders, saveOrder, withoutEmbeddedImages } from '../lib/orders';
import { normalizeCheckout, toCustomer, validateCheckout, validateField } from '../lib/validation';

const STEP_PARAM = 'etape';
const PAYMENT = 'paiement';
const CART_CHANGED = 'Votre panier a été modifié dans un autre onglet. Vérifiez votre commande, puis confirmez-la de nouveau.';

/** Copie de `errors` où `field` porte `message` (ou n'apparaît plus si le message est vide). */
function withError(errors, field, message) {
  if ((errors[field] ?? '') === message) return errors;
  const next = { ...errors };
  if (message) next[field] = message;
  else delete next[field];
  return next;
}

/**
 * Tunnel de commande en deux étapes : coordonnées et livraison, puis paiement.
 * Le paiement est une démonstration : aucune donnée bancaire n'est demandée, rien n'est prélevé.
 * L'étape vit dans l'URL (?etape=paiement) : le bouton Précédent du navigateur revient aux coordonnées.
 */
export default function Checkout() {
  const { cartItems, subtotal, shipping, total, count, updateQuantity, removeFromCart, clearCart, syncCart } = useCart();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const desktop = useMediaQuery('(min-width: 64rem)');

  const [draft, setDraft] = useState(loadDraft);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('');
  // message affiché près du bouton de confirmation (panier modifié ailleurs entre-temps)
  const [notice, setNotice] = useState('');
  // commande confirmée : fige l'écran pendant la transition vers la page de confirmation
  const [placed, setPlaced] = useState(null);
  // date du jour suivie en continu : l'estimation de livraison affichée est celle que la commande obtiendra
  const today = useToday();
  const focusField = useRef(null);

  const { values, gift } = draft;
  const latestValues = useRef(values);
  // le mot d'accompagnement n'est retenu que si la case « C'est un cadeau » est cochée
  const effective = useMemo(() => (gift ? values : { ...values, giftNote: '' }), [gift, values]);
  const ready = useMemo(() => validateCheckout(effective).valid, [effective]);
  const wantsPayment = searchParams.get(STEP_PARAM) === PAYMENT;
  const step = wantsPayment && ready ? 2 : 1;
  const empty = cartItems.length === 0 && !placed;

  usePageMeta({
    title: empty ? 'Votre commande' : CHECKOUT_STEPS[step - 1].label,
    description: 'Finalisez votre commande DAG en deux étapes, livraison à domicile comprise.',
  });

  useEffect(() => {
    if (!placed) saveDraft(draft);
  }, [draft, placed]);

  // ?etape=paiement sans coordonnées valides (lien direct, session expirée) ou sans panier : retour à l'étape 1
  useEffect(() => {
    if (wantsPayment && (!ready || empty)) setSearchParams({}, { replace: true });
  }, [wantsPayment, ready, empty, setSearchParams]);

  // Le panier se vide alors que le tunnel est affiché (dernier article retiré, commande passée dans un
  // autre onglet) : l'écran « panier vide » remplace tout, y compris l'élément qui portait le focus.
  // Celui-ci rejoint le titre du nouvel écran — sauf s'il est tenu ailleurs (tiroir du panier ouvert).
  const shownEmpty = useRef(empty);
  useEffect(() => {
    if (shownEmpty.current === empty) return;
    shownEmpty.current = empty;
    if (!empty) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    // un défilement adouci encore en cours (changement d'étape) reprendrait la main sur le retour en haut
    getLenis()?.reset?.();
    scrollToTop({ immediate: true });
    document.getElementById(EMPTY_TITLE_ID)?.focus({ preventScroll: true });
  }, [empty]);

  // changement d'étape : on remonte au fil des étapes et le focus suit (titre, ou champ à modifier)
  const shownStep = useRef(step);
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    const field = focusField.current;
    focusField.current = null;
    const control = step === 1 && field ? document.querySelector(`#commande [name="${field}"]`) : null;
    if (control) {
      control.focus();
      return;
    }
    scrollToTarget('#etapes');
    document.getElementById('etape-titre')?.focus({ preventScroll: true });
  }, [step]);

  if (empty) return <EmptyCheckout />;

  const change = (field, value) => {
    // latestValues : plusieurs champs peuvent changer dans le même instant (saisie automatique du navigateur)
    const next = { ...latestValues.current, [field]: value };
    latestValues.current = next;
    setDraft((current) => ({ ...current, values: next }));
    setErrors((current) => {
      // une erreur affichée se corrige en direct ; le pays revalide le code postal et le téléphone déjà saisis
      const fields = field === 'country' ? ['country', 'postalCode', 'phone'] : [field];
      return fields.reduce((result, name) => {
        const dependent = name !== field && next[name].trim() !== '';
        return current[name] || dependent ? withError(result, name, validateField(name, next)) : result;
      }, current);
    });
  };

  const blur = (field) => {
    // un champ laissé vide n'est signalé qu'à l'envoi
    if (!String(values[field] ?? '').trim()) return;
    setErrors((current) => withError(current, field, validateField(field, effective)));
  };

  const toggleGift = (checked) => {
    setDraft((current) => ({ ...current, gift: checked }));
    if (!checked) setErrors((current) => withError(current, 'giftNote', ''));
  };

  const submitDetails = (event) => {
    event.preventDefault();
    const result = validateCheckout(effective);
    setErrors(result.errors);
    if (!result.valid) {
      const invalid = Object.keys(result.errors).length;
      setStatus(invalid > 1 ? `${invalid} champs sont à corriger.` : 'Un champ est à corriger.');
      event.currentTarget.querySelector(`[name="${result.firstInvalid}"]`)?.focus();
      return;
    }
    setStatus('');
    setNotice('');
    setSearchParams({ [STEP_PARAM]: PAYMENT });
  };

  const backToDetails = (field) => {
    focusField.current = field || null;
    setNotice('');
    setSearchParams({});
  };

  const confirm = (event) => {
    event.preventDefault();
    if (placed) return;
    // Un autre onglet a pu modifier ce panier, ou déjà le commander, sans que celui-ci l'ait su :
    // on relit le panier enregistré. S'il n'est plus celui affiché, le récapitulatif se met à jour
    // et rien n'est commandé — le client confirme ce qu'il a sous les yeux, pas un panier périmé.
    if (!syncCart()) {
      setNotice(CART_CHANGED);
      return;
    }
    const order = createOrder(
      {
        items: cartItems,
        totals: { subtotal, shipping, total, count },
        customer: toCustomer(effective),
        gift,
        giftNote: normalizeCheckout(effective).giftNote,
      },
      { taken: listOrders().map((entry) => entry.id) },
    );
    if (!order) return;
    const saved = saveOrder(order);
    setPlaced(order);
    clearDraft();
    // replace : « Précédent » ne ramène pas sur l'étape de paiement. Si le stockage est indisponible,
    // la commande voyage dans l'état de navigation pour que la confirmation puisse l'afficher.
    navigate(`/confirmation/${order.id}`, {
      replace: true,
      state: { placed: true, order: saved ? null : withoutEmbeddedImages(order) },
    });
    clearCart();
  };

  const summary = (
    <OrderSummary
      items={placed ? placed.items : cartItems}
      totals={placed ? placed.totals : { subtotal, shipping, total, count }}
      editable={!placed}
      collapsible={!desktop}
      onQuantity={updateQuantity}
      onRemove={removeFromCart}
      className={desktop ? 'sticky top-header self-start lg:col-span-5 xl:col-span-4 xl:col-start-9' : undefined}
    />
  );

  return (
    <Section tone="ivoire" pad={false} className="pt-header" innerClassName="pb-24 pt-10 md:pb-32 md:pt-14 lg:pt-20">
      <header>
        <Eyebrow rule>Commande</Eyebrow>
        <SplitText as="h1" className="text-title mt-5" text="Finaliser votre *commande*." />
      </header>

      {desktop ? null : <div className="mt-9">{summary}</div>}

      {/* commande confirmée : l'écran reste en place, inerte, le temps de la transition */}
      <div inert={Boolean(placed)} className="mt-8 grid gap-x-10 lg:mt-14 lg:grid-cols-12 xl:gap-x-8">
        <div className="min-w-0 lg:col-span-7">
          <StepIndicator id="etapes" current={step} onBack={placed ? undefined : () => backToDetails('')} className="scroll-mt-6" />
          <p role="status" className="sr-only">
            {status}
          </p>

          <div key={step} className="page-enter mt-6 lg:mt-8">
            <h2 id="etape-titre" tabIndex={-1} className="sr-only">
              Étape {step} sur {CHECKOUT_STEPS.length}&nbsp;: {CHECKOUT_STEPS[step - 1].label}
            </h2>
            {step === 1 ? (
              <DetailsStep
                values={values}
                errors={errors}
                gift={gift}
                shipping={shipping}
                today={today}
                onChange={change}
                onBlur={blur}
                onGift={toggleGift}
                onSubmit={submitDetails}
              />
            ) : (
              <PaymentStep
                customer={toCustomer(effective)}
                gift={gift}
                giftNote={normalizeCheckout(effective).giftNote}
                shipping={placed ? placed.totals.shipping : shipping}
                today={today}
                confirming={Boolean(placed)}
                notice={notice}
                onEdit={backToDetails}
                onConfirm={confirm}
              />
            )}
          </div>

          {desktop ? null : <Assurances className="mt-12 border-t border-line pt-8" />}
        </div>

        {desktop ? summary : null}
      </div>
    </Section>
  );
}
