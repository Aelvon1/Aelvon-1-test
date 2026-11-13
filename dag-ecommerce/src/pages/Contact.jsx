import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHero from '../components/editorial/PageHero';
import {
  MESSAGE_MAX,
  NAME_MAX,
  ORDER_EXAMPLE,
  SUBJECTS,
  buildContactMessage,
  contactDefaults,
  normalizeOrderNumber,
  validateContact,
  validateContactField,
} from '../components/editorial/contact-message';
import { CONTACT_EMAIL } from '../components/layout/navigation';
import { Button, Eyebrow, Field, Icon, Input, Reveal, Section, Select, TextLink, Textarea, useToast } from '../components/ui';
import { scrollToTarget, usePageMeta } from '../hooks';

// Coordonnées et horaires de la maison.
const PHONE = { label: '+33 1 23 45 67 89', href: 'tel:+33123456789' };
const ADDRESS = ['123 Rue de la Mode', '75001 Paris, France'];
const HOURS = [
  { days: 'Lundi – vendredi', hours: '9\xa0h – 18\xa0h' },
  { days: 'Samedi', hours: '10\xa0h – 16\xa0h' },
  { days: 'Dimanche', hours: 'Fermé' },
];

/** Une coordonnée de la bande d'en-tête : libellé discret, valeur en caractères de titre. */
function Coordinate({ label, children, note }) {
  return (
    <div className="border-b border-line py-6 last:border-b-0 lg:border-b-0 lg:py-8 lg:pr-8 lg:not-first:border-l lg:not-first:pl-12">
      <p className="eyebrow text-muted">{label}</p>
      <div className="mt-2 font-display text-[clamp(1.375rem,1.9vw,1.75rem)] leading-snug lining-nums">{children}</div>
      {note ? <p className="mt-2 text-[0.8125rem] leading-snug text-muted">{note}</p> : null}
    </div>
  );
}

/** Copie un texte dans le presse-papiers ; repli sur l'ancienne commande si l'API moderne est refusée ou absente. */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // contexte non sécurisé, permission refusée : on tente la sélection classique
  }
  const previous = document.activeElement;
  const area = document.createElement('textarea');
  try {
    area.value = text;
    area.setAttribute('readonly', '');
    area.setAttribute('aria-hidden', 'true');
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.appendChild(area);
    area.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
    if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
  }
}

/** Dernière étape : le message est prêt, il reste à l'envoyer depuis sa propre messagerie. */
function ReadyMessage({ mail, onEdit, panelRef }) {
  const toast = useToast();

  const copy = async () => {
    const copied = await copyText(`À\xa0: ${mail.to}\nObjet\xa0: ${mail.subject}\n\n${mail.body}`);
    if (copied) toast({ title: 'Message copié', description: `À coller dans un e-mail adressé à ${mail.to}.` });
    else toast({ title: 'Copie impossible', description: 'Sélectionnez le message ci-dessus pour le copier.', icon: 'alert' });
  };

  return (
    <div ref={panelRef} tabIndex={-1} aria-labelledby="message-pret-titre" className="outline-none">
      <p className="eyebrow flex items-center gap-3 text-accent">
        <Icon name="check" size={18} />
        Votre message est prêt
      </p>
      <h2 id="message-pret-titre" className="text-title mt-5 max-w-[16ch]">
        Il ne reste qu’à l’<em className="italic">envoyer</em>.
      </h2>
      <p className="mt-5 max-w-[54ch] text-lead text-muted">
        Ce site n’envoie aucun message lui-même&nbsp;: rien n’est encore parti. Ouvrez votre messagerie, votre message y est déjà
        rédigé. Un envoi, et il nous parvient.
      </p>

      <div className="mt-9 border border-line bg-surface">
        <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-4 gap-y-2 border-b border-line px-5 py-5 text-[0.9375rem] sm:px-7">
          <dt className="eyebrow pt-1 text-muted">À</dt>
          <dd className="break-words">{mail.to}</dd>
          <dt className="eyebrow pt-1 text-muted">Objet</dt>
          <dd className="break-words lining-nums">{mail.subject}</dd>
        </dl>
        <p className="scroll-area max-h-80 whitespace-pre-wrap break-words px-5 py-6 text-[0.9375rem] leading-relaxed sm:px-7" data-lenis-prevent>
          {mail.body}
        </p>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button href={mail.mailto} variant="solid" icon="mail">
          Ouvrir ma messagerie
        </Button>
        <Button variant="outline" onClick={copy}>
          Copier le message
        </Button>
      </div>
      <TextLink variant="label" arrow="left" onClick={onEdit} className="mt-5">
        Modifier le message
      </TextLink>
      <p className="mt-6 max-w-[54ch] border-t border-line pt-6 text-[0.8125rem] leading-relaxed text-muted">
        Rien ne s’ouvre&nbsp;? Copiez le message et envoyez-le à{' '}
        <TextLink href={`mailto:${CONTACT_EMAIL}`} underline="always" tone="fg">
          {CONTACT_EMAIL}
        </TextLink>{' '}
        depuis la messagerie de votre choix.
      </p>
    </div>
  );
}

export default function Contact() {
  usePageMeta({
    title: 'Contact',
    description:
      'Une question, une suggestion, un échange\xa0? Écrivez à la maison DAG\xa0: contact@dag-belts.com, du lundi au samedi. Réponse sous 24\xa0h ouvrées.',
  });

  const [searchParams] = useSearchParams();
  const [values, setValues] = useState(() => contactDefaults(searchParams));
  const [errors, setErrors] = useState({});
  const [mail, setMail] = useState(null);
  const formRef = useRef(null);
  const panelRef = useRef(null);
  const wasReady = useRef(false);

  // Le focus suit l'étape : vers le message prêt, puis de retour dans le formulaire.
  useEffect(() => {
    if (mail) {
      wasReady.current = true;
      scrollToTarget(panelRef.current, { focus: true });
    } else if (wasReady.current) {
      wasReady.current = false;
      const field = formRef.current?.querySelector('[name="message"]');
      scrollToTarget(formRef.current);
      field?.focus({ preventScroll: true });
    }
  }, [mail]);

  const set = (field, value) => {
    const next = { ...values, [field]: value };
    setValues(next);
    // un champ signalé se corrige à la frappe ; les autres attendent l'envoi
    if (errors[field]) setErrors({ ...errors, [field]: validateContactField(field, next) });
  };
  const bind = (field) => ({
    name: field,
    value: values[field],
    onChange: (event) => set(field, event.target.value),
  });

  const onSubmit = (event) => {
    event.preventDefault();
    const result = validateContact(values);
    setErrors(result.errors);
    if (!result.valid) {
      formRef.current?.querySelector(`[name="${result.firstInvalid}"]`)?.focus();
      return;
    }
    setMail(buildContactMessage(values));
  };

  const errorCount = Object.values(errors).filter(Boolean).length;
  const length = values.message.trim().length;

  return (
    <>
      <PageHero
        eyebrow="Contact"
        title="Écrivez-*nous*."
        lead="Une question&nbsp;? Une suggestion&nbsp;? Nous sommes à votre écoute."
      >
        <Reveal delay={0.35}>
          <address className="mt-12 grid border-t border-line not-italic lg:mt-16 lg:grid-cols-3">
            <Coordinate label="E-mail">
              <TextLink href={`mailto:${CONTACT_EMAIL}`} underline="always" className="min-h-11 break-words">
                {CONTACT_EMAIL}
              </TextLink>
            </Coordinate>
            <Coordinate label="Téléphone" note="Du lundi au vendredi, de 9&nbsp;h à 18&nbsp;h.">
              <TextLink href={PHONE.href} className="min-h-11 whitespace-nowrap">
                {PHONE.label}
              </TextLink>
            </Coordinate>
            <Coordinate label="Adresse">
              {ADDRESS.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </Coordinate>
          </address>
        </Reveal>
      </PageHero>

      <Section tone="ivoire" className="!pt-[clamp(3.5rem,7vw,7rem)]">
        <div className="grid gap-y-16 lg:grid-cols-12 lg:gap-x-6">
          <div className="lg:col-span-7">
            {mail ? (
              <ReadyMessage mail={mail} panelRef={panelRef} onEdit={() => setMail(null)} />
            ) : (
              <>
                <Eyebrow index={1} rule className="mb-6">
                  Votre message
                </Eyebrow>
                <h2 className="text-title max-w-[18ch]">
                  Dites-nous <em className="italic">tout</em>.
                </h2>
                <p className="mt-5 max-w-[52ch] text-muted">
                  Les champs marqués d’un astérisque sont nécessaires. À l’étape suivante, votre message s’ouvre dans votre propre
                  messagerie, prêt à partir&nbsp;: ce site n’envoie rien lui-même.
                </p>

                <form ref={formRef} onSubmit={onSubmit} noValidate className="mt-10 flex flex-col gap-6">
                  <div className="grid gap-6 sm:grid-cols-2">
                    <Field label="Nom complet" required error={errors.name}>
                      <Input {...bind('name')} autoComplete="name" maxLength={NAME_MAX} />
                    </Field>
                    <Field label="E-mail" required error={errors.email} hint="Pour vous répondre, uniquement.">
                      <Input {...bind('email')} type="email" inputMode="email" autoComplete="email" maxLength={254} />
                    </Field>
                  </div>
                  <div className="grid gap-6 sm:grid-cols-2">
                    <Field label="Sujet" required error={errors.subject}>
                      <Select {...bind('subject')} placeholder="Choisir un sujet" options={SUBJECTS} />
                    </Field>
                    <Field label="Numéro de commande" optional error={errors.order} hint={`Il figure sur votre confirmation. Exemple\xa0: ${ORDER_EXAMPLE}`}>
                      <Input
                        {...bind('order')}
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        maxLength={16}
                        onBlur={() => set('order', normalizeOrderNumber(values.order))}
                      />
                    </Field>
                  </div>
                  <Field
                    label="Message"
                    required
                    error={errors.message}
                    hint={`${length}\xa0/\xa0${MESSAGE_MAX} caractères`}
                  >
                    <Textarea {...bind('message')} rows={7} maxLength={MESSAGE_MAX + 200} />
                  </Field>

                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
                    <Button type="submit" variant="solid" size="lg" icon="arrow-right">
                      Préparer mon message
                    </Button>
                    <p role="alert" className="text-[0.8125rem] leading-snug text-danger">
                      {errorCount > 0 ? (errorCount > 1 ? `${errorCount} champs sont à corriger.` : 'Un champ est à corriger.') : null}
                    </p>
                  </div>
                </form>
              </>
            )}
          </div>

          <aside className="lg:col-span-4 lg:col-start-9">
            <div className="flex flex-col gap-12 lg:sticky lg:top-header">
              <div>
                <h2 className="eyebrow text-muted">Horaires</h2>
                <dl className="mt-4 border-t border-line">
                  {HOURS.map((row) => (
                    <div key={row.days} className="flex items-baseline justify-between gap-6 border-b border-line py-3.5">
                      <dt className="whitespace-nowrap">{row.days}</dt>
                      <dd className="whitespace-nowrap tabular-nums text-muted">{row.hours}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div>
                <h2 className="eyebrow text-muted">Délai de réponse</h2>
                <p className="text-subtitle mt-4 max-w-[18ch] lining-nums">Sous 24&nbsp;h ouvrées.</p>
                <p className="mt-3 max-w-[40ch] text-[0.9375rem] leading-relaxed text-muted">
                  Nous nous engageons à répondre à tous vos messages dans ce délai.
                </p>
              </div>

              <div>
                <h2 className="eyebrow text-muted">Avant d’écrire</h2>
                <p className="mt-4 max-w-[40ch] text-[0.9375rem] leading-relaxed text-muted">
                  Livraison, retours, entretien, tailles&nbsp;: la réponse est peut-être déjà là.
                </p>
                <div className="mt-2 flex flex-col items-start">
                  <TextLink to="/faq" variant="label" arrow>
                    Consulter l’aide
                  </TextLink>
                  <TextLink to="/guide-des-tailles" variant="label" arrow>
                    Guide des tailles
                  </TextLink>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </Section>
    </>
  );
}
