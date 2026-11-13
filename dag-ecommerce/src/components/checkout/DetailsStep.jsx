import { Button, Checkbox, Field, Input, Select, TextLink, Textarea } from '../ui';
import { COUNTRIES, GIFT_NOTE_MAX, MAX_LENGTHS, getCountry } from '../../lib/validation';
import DeliveryMethod from './DeliveryMethod';
import FormGroup from './FormGroup';
import { NBSP } from './format';

const COUNTRY_OPTIONS = COUNTRIES.map((country) => ({ value: country.code, label: country.name }));

/**
 * Étape 1 — coordonnées, adresse, mode de livraison, cadeau (mot d'accompagnement facultatif).
 * Formulaire contrôlé : l'état, la validation et l'enregistrement du brouillon vivent dans la page.
 * L'ordre des champs est celui de CHECKOUT_FIELDS (lib/validation).
 * @param {{
 *   values: Record<string, string>, errors: Record<string, string>, gift: boolean,
 *   shipping: number, today: Date,
 *   onChange: (field: string, value: string) => void, onBlur: (field: string) => void,
 *   onGift: (checked: boolean) => void, onSubmit: (event: import('react').FormEvent<HTMLFormElement>) => void
 * }} props
 */
export default function DetailsStep({ values, errors, gift, shipping, today, onChange, onBlur, onGift, onSubmit }) {
  const country = getCountry(values.country) ?? COUNTRIES[0];
  // même lien pour tous les champs : name → valeur, modification, validation à la sortie
  const bind = (field) => ({
    name: field,
    value: values[field],
    maxLength: MAX_LENGTHS[field],
    onChange: (event) => onChange(field, event.target.value),
    onBlur: () => onBlur(field),
  });
  const noteLength = values.giftNote.length;

  return (
    <form id="commande" onSubmit={onSubmit} noValidate className="flex flex-col gap-10 md:gap-12">
      <FormGroup title="Contact" note="Pour le suivi de votre commande, rien d’autre.">
        <div className="grid gap-x-5 gap-y-6 sm:grid-cols-2">
          <Field label="E-mail" error={errors.email} className="sm:col-span-2">
            <Input {...bind('email')} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required />
          </Field>
          <Field label="Prénom" error={errors.firstName}>
            <Input {...bind('firstName')} autoComplete="given-name" autoCapitalize="words" required />
          </Field>
          <Field label="Nom" error={errors.lastName}>
            <Input {...bind('lastName')} autoComplete="family-name" autoCapitalize="words" required />
          </Field>
        </div>
      </FormGroup>

      {/* Le pays ouvre le groupe : le code postal et le téléphone, validés d'après lui, viennent ensuite. */}
      <FormGroup title="Adresse" note="France métropolitaine, Belgique, Suisse et Luxembourg.">
        <div className="grid gap-x-5 gap-y-6 sm:grid-cols-6">
          <Field label="Pays" error={errors.country} className="sm:col-span-6">
            <Select
              name="country"
              value={values.country}
              onChange={(event) => onChange('country', event.target.value)}
              options={COUNTRY_OPTIONS}
              autoComplete="shipping country"
              required
            />
          </Field>
          <Field label="Adresse" error={errors.address} className="sm:col-span-6">
            <Input {...bind('address')} autoComplete="shipping address-line1" required />
          </Field>
          <Field label="Complément d’adresse" optional hint="Bâtiment, étage, code d’accès." error={errors.addressComplement} className="sm:col-span-6">
            <Input {...bind('addressComplement')} autoComplete="shipping address-line2" />
          </Field>
          <Field label="Code postal" error={errors.postalCode} className="sm:col-span-2">
            <Input
              {...bind('postalCode')}
              inputMode="numeric"
              autoComplete="shipping postal-code"
              placeholder={country.postalExample}
              required
            />
          </Field>
          <Field label="Ville" error={errors.city} className="sm:col-span-4">
            <Input {...bind('city')} autoComplete="shipping address-level2" autoCapitalize="words" required />
          </Field>
          <Field label="Téléphone" optional hint="Pour le transporteur, en cas de besoin." error={errors.phone} className="sm:col-span-6">
            <Input {...bind('phone')} type="tel" inputMode="tel" autoComplete="tel" />
          </Field>
        </div>
      </FormGroup>

      <FormGroup title="Livraison">
        <DeliveryMethod country={country.code} shipping={shipping} from={today} />
      </FormGroup>

      <FormGroup title="Cadeau">
        <Checkbox
          name="gift"
          checked={gift}
          onChange={(event) => onGift(event.target.checked)}
          label="C’est un cadeau"
          description="Si vous le souhaitez, joignez quelques mots&nbsp;: ils accompagneront le colis."
          className="-mt-2.5"
        />
        {gift ? (
          <Field
            label="Votre mot"
            optional
            hint={`${noteLength}${NBSP}/${NBSP}${GIFT_NOTE_MAX} caractères`}
            error={errors.giftNote}
            className="page-enter mt-4"
          >
            <Textarea {...bind('giftNote')} rows={4} autoComplete="off" />
          </Field>
        ) : null}
      </FormGroup>

      {/* bouton d'abord dans le DOM : après le dernier champ, Tab mène à l'action principale */}
      <div className="flex flex-col gap-x-8 gap-y-3 border-t border-line pt-8 sm:flex-row-reverse sm:items-center sm:justify-between md:pt-10">
        <Button type="submit" variant="solid" size="lg" icon="arrow-right" className="max-sm:w-full">
          Continuer vers le paiement
        </Button>
        <TextLink to="/shop" variant="label" arrow="left" tone="muted" className="max-sm:justify-center">
          Retour à la collection
        </TextLink>
      </div>
    </form>
  );
}
