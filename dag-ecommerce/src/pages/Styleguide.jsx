import { useState } from 'react';
import { useCart } from '../context/CartContext';
import { BUCKLES, LEATHERS, HERO_BELT, SIZES, WIDTHS } from '../data/atelier';
import { productImage, products } from '../data/products';
import { usePageMeta } from '../hooks/usePageMeta';
import ProductCard from '../components/product/ProductCard';
import {
  Accordion,
  Badge,
  BeltThumb,
  Button,
  Checkbox,
  Drawer,
  Eyebrow,
  Field,
  FreeShippingBar,
  ICON_NAMES,
  Icon,
  Input,
  Marquee,
  Modal,
  OptionGrid,
  Packshot,
  Price,
  QuantityStepper,
  RadioCard,
  Reveal,
  RevealGroup,
  Section,
  SectionHeading,
  Select,
  SplitText,
  Swatches,
  TextLink,
  Textarea,
  useToast,
} from '../components/ui';

const CHAPTERS = [
  ['fondations', 'Fondations'],
  ['boutons', 'Boutons et liens'],
  ['icones', 'Icônes'],
  ['mouvement', 'Mouvement'],
  ['formulaires', 'Formulaires'],
  ['selecteurs', 'Sélecteurs'],
  ['produit', 'Produit'],
  ['calques', 'Calques'],
];

const TOKENS = [
  ['bg', 'bg-bg'],
  ['surface', 'bg-surface'],
  ['fg', 'bg-fg'],
  ['muted', 'bg-muted'],
  ['line', 'bg-line'],
  ['accent', 'bg-accent'],
  ['danger', 'bg-danger'],
  ['positive', 'bg-positive'],
];

const FAQ_ITEMS = [
  {
    id: 'livraison',
    title: 'Quels sont les délais de livraison\u00a0?',
    content: 'Votre commande est livrée en 3 à 5\u00a0jours ouvrés en France métropolitaine. La livraison est offerte dès 100\u00a0€ d’achat\u00a0; elle est de 7,90\u00a0€ en dessous.',
  },
  {
    id: 'retours',
    title: 'Puis-je retourner ma ceinture\u00a0?',
    content: 'Oui. Les retours sont gratuits pendant 30\u00a0jours après réception.',
  },
  {
    id: 'garantie',
    title: 'Quelle est la garantie\u00a0?',
    content: 'Chaque ceinture DAG est garantie 2\u00a0ans.',
  },
];

/** Montre le même contenu sur les deux surfaces. */
function Duo({ children, className = '' }) {
  return (
    <div className="grid border-y border-line lg:grid-cols-2">
      <div className={`theme-noir min-w-0 p-6 sm:p-10 ${className}`}>{children}</div>
      <div className={`theme-ivoire min-w-0 p-6 sm:p-10 ${className}`}>{children}</div>
    </div>
  );
}

function Chapter({ id, index, title, intro, children }) {
  return (
    <section id={id} className="theme-noir border-t border-line">
      <div className="container-luxe pb-10 pt-20 md:pt-28">
        <Eyebrow index={index} rule>
          Référence
        </Eyebrow>
        <h2 className="text-title mt-6">{title}</h2>
        {intro ? <p className="mt-4 max-w-[60ch] text-muted">{intro}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Label({ children }) {
  return <p className="eyebrow mb-4 mt-10 text-muted first:mt-0">{children}</p>;
}

function Foundations() {
  return (
    <div className="flex flex-col gap-10">
      <div>
        <Label>Couleurs sémantiques</Label>
        <ul className="grid grid-cols-4 gap-3">
          {TOKENS.map(([name, className]) => (
            <li key={name}>
              <span className={`block aspect-square border border-line ${className}`} />
              <span className="mt-2 block text-xs text-muted">{name}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <Label>Typographie</Label>
        <div className="flex flex-col gap-6">
          <p className="text-display">
            La ceinture, en <em className="italic">mieux</em>.
          </p>
          <p className="text-title">L’essentiel. Parfaitement maîtrisé.</p>
          <p className="text-subtitle">Cuir pleine fleur, boucle en acier brossé.</p>
          <p className="text-lead text-muted">text-lead — Finitions nettes. Tenue parfaite. Le détail qui change tout.</p>
          <p>Texte courant en Manrope. Vous choisissez le cuir, la boucle, la couture ; nous faisons le reste.</p>
          <p className="eyebrow text-muted">Eyebrow — petites capitales</p>
        </div>
      </div>
    </div>
  );
}

function Buttons() {
  return (
    <div className="flex flex-col">
      <Label>Variantes</Label>
      <div className="flex flex-wrap items-center gap-3">
        <Button>Ajouter au panier</Button>
        <Button variant="solid">Commander</Button>
        <Button variant="outline">Composer la vôtre</Button>
        <Button variant="ghost">Annuler</Button>
      </div>
      <Label>Tailles et icône</Label>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" icon="arrow-right">
          Petit
        </Button>
        <Button size="md" icon="arrow-right">
          Moyen
        </Button>
        <Button size="lg" icon="arrow-right">
          Grand
        </Button>
        <Button variant="outline" icon="arrow-left" iconPosition="left">
          Retour
        </Button>
      </div>
      <Label>États</Label>
      <div className="flex flex-wrap items-center gap-3">
        <Button loading>Envoi en cours</Button>
        <Button disabled>Indisponible</Button>
        <Button variant="outline" disabled>
          Indisponible
        </Button>
        <Button to="/shop" variant="outline" icon="arrow-up-right">
          Lien interne
        </Button>
      </div>
      <Label>Pleine largeur</Label>
      <Button variant="solid" size="lg" icon="arrow-right" fullWidth>
        Commander
      </Button>
      <Label>Affichage choisi par l’appelant — hidden sm:inline-flex, sm:hidden</Label>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" className="hidden sm:inline-flex">
          Dès 640&nbsp;px
        </Button>
        <Button variant="outline" size="sm" className="sm:hidden">
          Sous 640&nbsp;px
        </Button>
        <TextLink to="/shop" variant="label" arrow className="hidden sm:inline-flex">
          Lien dès 640&nbsp;px
        </TextLink>
        <TextLink to="/shop" variant="label" arrow className="sm:hidden">
          Lien sous 640&nbsp;px
        </TextLink>
        <Badge className="hidden sm:inline-flex">Dès 640&nbsp;px</Badge>
      </div>
      <Label>Liens de texte</Label>
      <div className="flex flex-col items-start gap-3">
        <p className="max-w-[46ch] text-muted">
          Un doute sur la longueur&nbsp;? Consultez le <TextLink to="/guide-des-tailles" underline="always" tone="fg">guide des tailles</TextLink> avant de commander.
        </p>
        <TextLink to="/shop" variant="label" arrow>
          Voir la collection
        </TextLink>
        <TextLink to="/about" variant="label" arrow="up-right" tone="accent">
          La maison
        </TextLink>
        <TextLink variant="label" arrow="left" tone="muted" onClick={() => {}}>
          Retour
        </TextLink>
      </div>
      <Label>Sur-titres, étiquettes, prix</Label>
      <div className="flex flex-col items-start gap-4">
        <Eyebrow>La collection</Eyebrow>
        <Eyebrow index={2} rule>
          L’Atelier
        </Eyebrow>
        <Eyebrow rule tone="accent">
          Sur-mesure
        </Eyebrow>
        <div className="flex flex-wrap gap-2">
          <Badge>Iconique</Badge>
          <Badge variant="accent">Nouveau</Badge>
          <Badge variant="solid">Sur-mesure</Badge>
          <Badge variant="muted">Réversible</Badge>
        </div>
        <div className="flex flex-wrap items-baseline gap-6">
          <Price amount={89} className="font-display text-3xl" />
          <Price amount={7.9} />
          <Price amount={129} from />
        </div>
      </div>
    </div>
  );
}

function Icons() {
  return (
    <ul className="grid grid-cols-3 gap-x-2 gap-y-6 sm:grid-cols-5">
      {ICON_NAMES.map((name) => (
        <li key={name} className="flex flex-col items-center gap-2 text-center">
          <Icon name={name} size={24} />
          <span className="text-[0.6875rem] text-muted">{name}</span>
        </li>
      ))}
    </ul>
  );
}

function MotionDemo() {
  const [run, setRun] = useState(0);
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-4">
        <Label>SplitText — par mot, puis par ligne</Label>
        <Button size="sm" variant="outline" icon="return" iconPosition="left" onClick={() => setRun((n) => n + 1)}>
          Rejouer
        </Button>
      </div>
      <div key={run} className="flex flex-col gap-8">
        <SplitText as="p" className="text-display" text="La ceinture, en *mieux*." />
        <SplitText as="p" by="line" className="text-title" text={'L’essentiel.\n*Parfaitement* maîtrisé.'} />
        <div>
          <Label>RevealGroup</Label>
          <RevealGroup className="grid grid-cols-3 gap-3" stagger={0.12}>
            {['Cuir', 'Boucle', 'Couture'].map((word) => (
              <Reveal key={word} className="border border-line px-3 py-5 sm:px-5">
                <p className="font-display text-2xl">{word}</p>
              </Reveal>
            ))}
          </RevealGroup>
        </div>
        <div>
          <Label>Reveal</Label>
          <Reveal delay={0.2}>
            <p className="max-w-[40ch] text-muted">Un bloc seul, révélé en fondu avec une légère montée.</p>
          </Reveal>
        </div>
      </div>
      <Label>Marquee</Label>
      <Marquee speed={36} fade className="border-y border-line py-5">
        {['Cuir pleine fleur', 'Boucles en acier', 'Finitions nettes', 'Sur-mesure à l’Atelier'].map((item) => (
          <span key={item} className="flex items-center gap-12 font-display text-2xl whitespace-nowrap">
            {item}
            <Icon name="sparkle" size={14} className="text-accent" />
          </span>
        ))}
      </Marquee>
      <Label>Accordion — simple, numéroté</Label>
      <Accordion items={FAQ_ITEMS} defaultOpen="livraison" numbered />
      <Label>Accordion — multiple</Label>
      <Accordion items={FAQ_ITEMS} type="multiple" />
    </div>
  );
}

function FormDemo() {
  const [values, setValues] = useState({ name: '', email: '', subject: '', message: '', consent: false });
  const [errors, setErrors] = useState({});
  const [delivery, setDelivery] = useState('standard');
  const toast = useToast();

  const set = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const onSubmit = (event) => {
    event.preventDefault();
    const next = {};
    if (!values.name.trim()) next.name = 'Indiquez votre nom.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email.trim())) next.email = 'Saisissez une adresse e-mail valide. Exemple\u00a0: prenom@exemple.fr';
    if (!values.subject) next.subject = 'Choisissez un sujet.';
    if (!values.consent) next.consent = 'Cochez la case pour continuer.';
    setErrors(next);
    const first = Object.keys(next)[0];
    if (first) {
      event.currentTarget.querySelector(`[name="${first}"]`)?.focus();
      return;
    }
    toast({ title: 'Formulaire valide', description: 'Démonstration\u00a0: rien n’est envoyé.' });
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Nom" required error={errors.name}>
          <Input name="name" autoComplete="name" value={values.name} onChange={set('name')} />
        </Field>
        <Field label="E-mail" required error={errors.email} hint="Pour vous répondre, rien d’autre.">
          <Input name="email" type="email" autoComplete="email" value={values.email} onChange={set('email')} />
        </Field>
      </div>
      <Field label="Sujet" required error={errors.subject}>
        <Select
          name="subject"
          value={values.subject}
          onChange={set('subject')}
          placeholder="Choisir un sujet"
          options={[
            { value: 'commande', label: 'Ma commande' },
            { value: 'taille', label: 'Un conseil de taille' },
            { value: 'atelier', label: 'Une création sur-mesure' },
          ]}
        />
      </Field>
      <Field label="Message" optional hint="Quelques lignes suffisent.">
        <Textarea name="message" rows={4} value={values.message} onChange={set('message')} />
      </Field>
      <Field label="Champ désactivé">
        <Input disabled defaultValue="Non modifiable" />
      </Field>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-[0.8125rem] font-medium">Livraison</legend>
        <RadioCard
          name="sg-livraison"
          value="standard"
          checked={delivery === 'standard'}
          onChange={() => setDelivery('standard')}
          title="Livraison à domicile"
          description="3 à 5&nbsp;jours ouvrés, France métropolitaine."
          meta={<Price amount={7.9} />}
        />
        <RadioCard
          name="sg-livraison"
          value="offerte"
          checked={delivery === 'offerte'}
          onChange={() => setDelivery('offerte')}
          title="Livraison offerte"
          description="Dès 100&nbsp;€ d’achat."
          meta="Offerte"
        />
        <RadioCard name="sg-livraison" value="indisponible" disabled title="Option indisponible" description="État désactivé." />
      </fieldset>
      <Checkbox
        name="consent"
        checked={values.consent}
        onChange={set('consent')}
        error={errors.consent}
        label="J’accepte d’être recontacté au sujet de ma demande."
        description="Aucune inscription à la lettre."
      />
      <Button type="submit" variant="solid" icon="arrow-right">
        Valider
      </Button>
    </form>
  );
}

function Selectors() {
  const [size, setSize] = useState('95');
  const [width, setWidth] = useState(35);
  const [leather, setLeather] = useState('cognac');
  const [buckle, setBuckle] = useState('poli');
  const [color, setColor] = useState('noir-marron');
  const [quantity, setQuantity] = useState(1);
  const colors = [...products[0].colors, ...products[5].colors];
  return (
    <div className="flex flex-col">
      <Label>OptionGrid — tailles (110 indisponible)</Label>
      <OptionGrid
        label="Taille"
        value={size}
        onChange={setSize}
        options={SIZES.map((value) => ({ value, label: value, disabled: value === '110' }))}
      />
      <Label>OptionGrid — largeurs, avec précision</Label>
      <OptionGrid
        label="Largeur"
        columns={3}
        value={width}
        onChange={setWidth}
        options={WIDTHS.map((entry) => ({ value: entry.id, label: entry.name, hint: entry.label }))}
      />
      <Label>Swatches — nuancier de l’Atelier</Label>
      <Swatches label="Cuir" options={LEATHERS} value={leather} onChange={setLeather} />
      <Label>Swatches — teintes claires (boucles)</Label>
      <Swatches label="Boucle" options={BUCKLES} value={buckle} onChange={setBuckle} />
      <Label>Swatches — coloris produit, dont bicolore</Label>
      <Swatches options={colors} value={color} onChange={setColor} size="lg" />
      <Swatches options={colors} value={color} onChange={setColor} size="sm" className="mt-2" />
      <Label>QuantityStepper</Label>
      <div className="flex flex-wrap items-center gap-4">
        <QuantityStepper value={quantity} onChange={setQuantity} />
        <QuantityStepper value={10} onChange={() => {}} />
        <QuantityStepper value={2} onChange={() => {}} disabled />
      </div>
    </div>
  );
}

function ProductDemo() {
  const essential = products[0];
  return (
    <div className="flex flex-col">
      <Label>ProductCard — la tuile de la boutique (components/product)</Label>
      <div className="grid grid-cols-2 gap-4">
        <ProductCard product={products[0]} />
        <ProductCard product={products[5]} />
      </div>
      <Label>Packshot — second visuel au survol&nbsp;: hoverFit «&nbsp;cover&nbsp;» (défaut), puis «&nbsp;contain&nbsp;»</Label>
      <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-4">
        {[
          { ratio: '4 / 5', hoverFit: 'cover' },
          { ratio: '1 / 1', hoverFit: 'cover' },
          { ratio: '4 / 5', hoverFit: 'contain' },
          { ratio: '1 / 1', hoverFit: 'contain' },
        ].map((tile) => (
          <Packshot
            key={`${tile.ratio}-${tile.hoverFit}`}
            src={productImage(essential, 'cognac', 'studio')}
            hoverSrc={productImage(essential, 'cognac', 'boucle')}
            hoverFit={tile.hoverFit}
            ratio={tile.ratio}
            alt={`DAG Essential cognac, survol ${tile.hoverFit}`}
            belt={essential.colors[2].belt}
          />
        ))}
      </div>
      <Label>Packshot — surfaces craie / papier, image manquante</Label>
      <div className="grid grid-cols-3 gap-3">
        <Packshot src={productImage(essential, 'cognac', 'studio')} alt="DAG Essential cognac" belt={essential.colors[2].belt} surface="craie" ratio="1 / 1" />
        <Packshot src="/renders/inexistant.webp" alt="Ceinture bleu nuit" belt={{ leather: 'navy', stitch: 'ecru', buckle: 'brosse' }} ratio="1 / 1" />
        <Packshot src={null} alt="Ceinture sur-mesure" belt={HERO_BELT} ratio="1 / 1" />
      </div>
      <Label>BeltThumb — d’après une configuration</Label>
      <div className="tone-papier grid grid-cols-4 gap-px bg-papier sm:grid-cols-6">
        {[
          { leather: 'noir', buckle: 'poli', width: 30 },
          { leather: 'marron', stitch: 'ecru', buckle: 'antique', width: 38 },
          { leather: 'tan', stitch: 'ecru', buckle: 'antique', width: 38 },
          { leather: 'bordeaux', stitch: 'or', buckle: 'laiton' },
          { leather: 'foret', stitch: 'sans', buckle: 'noir' },
          { leather: 'noir', lining: 'marron', buckle: 'brosse' },
        ].map((belt) => (
          <BeltThumb key={`${belt.leather}-${belt.buckle}`} belt={belt} className="w-full" />
        ))}
      </div>
      <Label>FreeShippingBar — 0&nbsp;€, 64&nbsp;€, 120&nbsp;€</Label>
      <div className="flex flex-col gap-6">
        <FreeShippingBar subtotal={0} />
        <FreeShippingBar subtotal={64} />
        <FreeShippingBar subtotal={120} />
      </div>
    </div>
  );
}

function Overlays() {
  const [drawer, setDrawer] = useState(null);
  const [modal, setModal] = useState(null);
  const toast = useToast();
  const { openCart } = useCart();
  return (
    <div className="flex flex-col">
      <Label>Drawer</Label>
      <div className="flex flex-wrap gap-3">
        {['right', 'left', 'bottom'].map((side) => (
          <Button key={side} variant="outline" size="sm" onClick={() => setDrawer(side)}>
            Tiroir {side}
          </Button>
        ))}
        <Button variant="outline" size="sm" icon="bag" onClick={openCart}>
          Ouvrir le panier
        </Button>
      </div>
      <Label>Modal</Label>
      <div className="flex flex-wrap gap-3">
        {['sm', 'md', 'lg'].map((size) => (
          <Button key={size} variant="outline" size="sm" onClick={() => setModal(size)}>
            Fenêtre {size}
          </Button>
        ))}
        <Button variant="outline" size="sm" onClick={() => setModal('noir')}>
          Fenêtre noire
        </Button>
      </div>
      <Label>Transition de page</Label>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-1">
        <TextLink to="?essai=1" variant="label" arrow>
          Changer un paramètre (sans transition)
        </TextLink>
        <TextLink to="/legal" variant="label" arrow>
          Changer de page (avec transition)
        </TextLink>
      </div>
      <Label>Toast</Label>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" size="sm" onClick={() => toast('Ajouté à vos favoris')}>
          Simple
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            toast({
              title: 'DAG Essential ajoutée au panier',
              description: 'Noir · 95\u00a0cm',
              icon: 'bag',
              action: { label: 'Voir', onClick: openCart },
            })
          }
        >
          Avec action
        </Button>
      </div>

      <Drawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        side={drawer ?? 'right'}
        title="Guide des tailles"
        footer={
          <Button variant="solid" fullWidth onClick={() => setDrawer(null)}>
            J’ai compris
          </Button>
        }
      >
        <p className="text-muted">Mesurez votre tour de taille, là où se porte le pantalon, puis ajoutez 15&nbsp;cm.</p>
        <div className="mt-6 flex flex-col gap-4">
          <Field label="Tour de taille (cm)">
            <Input type="number" inputMode="numeric" className="no-spinner" placeholder="84" />
          </Field>
          {Array.from({ length: 12 }, (_, index) => (
            <p key={index} className="border-b border-line pb-4 text-sm text-muted">
              Ligne {index + 1} — la zone centrale défile normalement, le pied reste en place.
            </p>
          ))}
        </div>
      </Drawer>

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        size={modal === 'noir' ? 'md' : (modal ?? 'md')}
        tone={modal === 'noir' ? 'noir' : 'ivoire'}
        title="Votre monogramme"
        description="Jusqu’à trois caractères, marqués à chaud sur la pointe de la ceinture."
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="ghost" onClick={() => setModal(null)}>
              Annuler
            </Button>
            <Button variant="solid" onClick={() => setModal(null)}>
              Valider
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          <Field label="Initiales" hint="Lettres et chiffres uniquement.">
            <Input maxLength={3} placeholder="DAG" />
          </Field>
          <Checkbox label="Dorure or" description="Feuille dorée, posée à chaud." />
        </div>
      </Modal>
    </div>
  );
}

/** Référence vivante du design system « Noir Atelier » (route /styleguide, développement uniquement). */
export default function Styleguide() {
  usePageMeta({
    title: 'Référence du design system',
    description: 'Toutes les primitives de l’interface DAG, dans leurs états, sur les deux surfaces.',
  });

  return (
    <>
      <Section tone="noir" first className="pb-16">
        <SectionHeading
          as="h1"
          size="hero"
          eyebrow="Design system"
          index={0}
          title="Noir *Atelier*."
          lead="Les primitives de l’interface DAG, montrées dans leurs états sur les deux surfaces&nbsp;: noir à gauche, ivoire à droite."
        />
        <nav aria-label="Chapitres" className="mt-12">
          <ul className="flex flex-wrap gap-x-8 gap-y-1">
            {CHAPTERS.map(([id, label]) => (
              <li key={id}>
                <TextLink href={`#${id}`} variant="label" tone="muted">
                  {label}
                </TextLink>
              </li>
            ))}
          </ul>
        </nav>
      </Section>

      <Chapter id="fondations" index={1} title="Fondations" intro="Couleurs sémantiques et échelle typographique. Les composants n’utilisent que ces jetons&nbsp;: ils s’adaptent à la surface qui les porte.">
        <Duo>
          <Foundations />
        </Duo>
      </Chapter>

      <Chapter id="boutons" index={2} title="Boutons et liens" intro="Button, TextLink, Eyebrow, Badge, Price.">
        <Duo>
          <Buttons />
        </Duo>
      </Chapter>

      <Chapter id="icones" index={3} title="Icônes" intro="Un seul composant, un trait fin constant.">
        <Duo>
          <Icons />
        </Duo>
      </Chapter>

      <Chapter id="mouvement" index={4} title="Mouvement" intro="Reveal, RevealGroup, SplitText, Marquee, Accordion. Lent, amorti, jamais gratuit&nbsp;; immobile si l’utilisateur le demande.">
        <Duo>
          <MotionDemo />
        </Duo>
      </Chapter>

      <Chapter id="formulaires" index={5} title="Formulaires" intro="Field, Input, Textarea, Select, Checkbox, RadioCard. Validez à l’envoi et placez le focus sur le premier champ en erreur.">
        <Duo>
          <FormDemo />
        </Duo>
      </Chapter>

      <Chapter id="selecteurs" index={6} title="Sélecteurs" intro="OptionGrid, Swatches, QuantityStepper&nbsp;: de vrais groupes radio, pilotables au clavier.">
        <Duo>
          <Selectors />
        </Duo>
      </Chapter>

      <Chapter id="produit" index={7} title="Produit" intro="ProductCard, Packshot, BeltThumb, FreeShippingBar. Les visuels reposent toujours sur une tuile claire, même dans un chapitre noir.">
        <Duo>
          <ProductDemo />
        </Duo>
      </Chapter>

      <Chapter id="calques" index={8} title="Calques" intro="Drawer, Modal, notifications&nbsp;: focus enfermé, Échap, clic sur le voile, défilement de la page verrouillé.">
        <Duo>
          <Overlays />
        </Duo>
      </Chapter>

      <Section tone="ivoire">
        <SectionHeading
          eyebrow="Recette"
          index={9}
          title="Un chapitre *ivoire*, pour le rythme."
          lead="Section pose la surface et le conteneur&nbsp;; SectionHeading compose le sur-titre, le titre révélé et le chapeau."
        >
          <Button to="/" variant="outline" icon="arrow-right">
            Retour à l’accueil
          </Button>
        </SectionHeading>
      </Section>
    </>
  );
}
