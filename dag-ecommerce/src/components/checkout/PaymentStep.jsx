import { Button, Icon, TextLink } from '../ui';
import DeliveryMethod from './DeliveryMethod';
import DemoNotice from './DemoNotice';
import FormGroup from './FormGroup';
import { addressLines, fullName } from './format';

function EditLink({ label, onClick }) {
  return (
    <TextLink variant="label" tone="muted" onClick={onClick} aria-label={label}>
      Modifier
    </TextLink>
  );
}

/** Ligne du récapitulatif : contenu à gauche, « Modifier » à droite (grand écran). */
function Row({ children, edit }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0 flex-1 text-[0.9375rem] leading-relaxed">{children}</div>
      {edit ? <div className="-my-2.5 hidden shrink-0 md:block">{edit}</div> : null}
    </div>
  );
}

/**
 * Étape 2 — rappel des coordonnées (modifiables) et confirmation. Aucune donnée bancaire n'est demandée.
 * Les groupes reprennent ceux de l'étape 1 : le téléphone, demandé pour le transporteur, suit l'adresse.
 * @param {{
 *   customer: Record<string, string>, gift?: boolean, giftNote: string, shipping: number, today: Date,
 *   confirming: boolean, notice?: string,
 *   onEdit: (field: string) => void, onConfirm: (event: import('react').FormEvent<HTMLFormElement>) => void
 * }} props
 *   customer : coordonnées normalisées (toCustomer) · gift : la commande est un cadeau, avec ou sans mot ·
 *   notice : message à lire avant de confirmer (panier modifié dans un autre onglet) ·
 *   onEdit(field) : retour à l'étape 1, focus sur ce champ
 */
export default function PaymentStep({ customer, gift = false, giftNote, shipping, today, confirming, notice = '', onEdit, onConfirm }) {
  const editContact = <EditLink label="Modifier le contact" onClick={() => onEdit('email')} />;
  const editAddress = <EditLink label="Modifier l’adresse de livraison" onClick={() => onEdit('address')} />;
  const editGift = <EditLink label="Modifier le cadeau et son mot d’accompagnement" onClick={() => onEdit('giftNote')} />;

  return (
    <form onSubmit={onConfirm} noValidate className="flex flex-col gap-10 md:gap-12">
      <FormGroup title="Contact" action={editContact}>
        <Row edit={editContact}>
          <p className="wrap-anywhere">{customer.email}</p>
        </Row>
      </FormGroup>

      <FormGroup title="Adresse" action={editAddress}>
        <Row edit={editAddress}>
          <address className="not-italic">
            <span className="block font-medium wrap-anywhere">{fullName(customer)}</span>
            {addressLines(customer).map((line) => (
              <span key={line} className="block wrap-anywhere text-muted">
                {line}
              </span>
            ))}
            {customer.phone ? <span className="mt-2 block text-muted">Tél. {customer.phone}</span> : null}
          </address>
        </Row>
      </FormGroup>

      <FormGroup title="Livraison">
        <DeliveryMethod country={customer.country} shipping={shipping} from={today} framed={false} />
      </FormGroup>

      {/* la case « C'est un cadeau » se retrouve ici même sans mot : ce que le client a coché est ce qu'il confirme */}
      {gift || giftNote ? (
        <FormGroup title="Cadeau" action={editGift}>
          <Row edit={editGift}>
            <p>Cette commande est un cadeau.</p>
            {giftNote ? (
              <>
                <p className="mt-2 text-muted">Un mot accompagnera le colis&nbsp;:</p>
                <p className="mt-2 max-w-[40ch] whitespace-pre-line wrap-anywhere font-display text-[1.375rem] italic leading-snug">{giftNote}</p>
              </>
            ) : (
              <p className="text-muted">Aucun mot ne l’accompagne.</p>
            )}
          </Row>
        </FormGroup>
      ) : null}

      <FormGroup title="Paiement">
        <DemoNotice />
      </FormGroup>

      {notice ? (
        <p role="alert" className="flex items-start gap-3 border border-fg/25 p-5 text-[0.9375rem] leading-relaxed">
          <Icon name="alert" size={18} className="mt-1 text-accent" />
          <span>{notice}</span>
        </p>
      ) : null}

      <div className="flex flex-col gap-x-8 gap-y-3 border-t border-line pt-8 sm:flex-row-reverse sm:items-center sm:justify-between md:pt-10">
        <Button type="submit" variant="primary" size="lg" icon="arrow-right" loading={confirming} className="max-sm:w-full">
          Confirmer la commande
        </Button>
        <TextLink variant="label" arrow="left" tone="muted" onClick={() => onEdit('')} className="max-sm:justify-center">
          Retour aux coordonnées
        </TextLink>
      </div>
    </form>
  );
}
