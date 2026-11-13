import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eyebrow, Section, SplitText } from '../components/ui';
import DetailsStep from '../components/checkout/DetailsStep';
import EmptyCheckout from '../components/checkout/EmptyCheckout';
import OrderSummary, { Assurances } from '../components/checkout/OrderSummary';
import PaymentStep from '../components/checkout/PaymentStep';
import StepIndicator from '../components/checkout/StepIndicator';
import { clearDraft, loadDraft, saveDraft } from '../components/checkout/draft';
import { CHECKOUT_STEPS } from '../components/checkout/steps';
import { useCart } from '../context/CartContext';
import { scrollToTarget, useMediaQuery, usePageMeta } from '../hooks';
import { createOrder, listOrders, saveOrder, withoutEmbeddedImages } from '../lib/orders';
import { normalizeCheckout, toCustomer, validateCheckout, validateField } from '../lib/validation';

const STEP_PARAM = 'etape';
const PAYMENT = 'paiement';

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
  const { cartItems, subtotal, shipping, total, count, updateQuantity, removeFromCart, clearCart } = useCart();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const desktop = useMediaQuery('(min-width: 64rem)');

  const [draft, setDraft] = useState(loadDraft);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('');
  // commande confirmée : fige l'écran pendant la transition vers la page de confirmation
  const [placed, setPlaced] = useState(null);
  const [today] = useState(() => new Date());
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

  // ?etape=paiement sans coordonnées valides (lien direct, session expirée) : retour à l'étape 1
  useEffect(() => {
    if (wantsPayment && !ready) setSearchParams({}, { replace: true });
  }, [wantsPayment, ready, setSearchParams]);

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
    setSearchParams({ [STEP_PARAM]: PAYMENT });
  };

  const backToDetails = (field) => {
    focusField.current = field || null;
    setSearchParams({});
  };

  const confirm = (event) => {
    event.preventDefault();
    if (placed) return;
    const order = createOrder(
      {
        items: cartItems,
        totals: { subtotal, shipping, total, count },
        customer: toCustomer(effective),
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
                giftNote={normalizeCheckout(effective).giftNote}
                shipping={placed ? placed.totals.shipping : shipping}
                today={today}
                confirming={Boolean(placed)}
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
