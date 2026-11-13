import { useId, useRef, useState } from 'react';
import PageHero from '../components/editorial/PageHero';
import RichText from '../components/editorial/RichText';
import SectionNav from '../components/editorial/SectionNav';
import { FAQ_CATEGORIES, FAQ_COUNT, faqJsonLd, filterFaq, fold, highlightParts, searchTerms } from '../components/editorial/faq-content';
import { useActiveSection } from '../components/editorial/useActiveSection';
import { useHashAnchor } from '../components/editorial/useHashAnchor';
import { CONTACT_EMAIL } from '../components/layout/navigation';
import { useJsonLd } from '../components/product/useJsonLd';
import { Accordion, Button, Icon, Reveal, Section, SectionHeading, TextLink, cn } from '../components/ui';
import { usePageMeta } from '../hooks';

const JSON_LD = faqJsonLd();
const SUGGESTIONS = ['livraison', 'taille', 'retour', 'paiement', 'garantie', 'entretien'];
const two = (n) => String(n).padStart(2, '0');
const plural = (n, singular, pluralForm = `${singular}s`) => `${n}\xa0${n > 1 ? pluralForm : singular}`;

/** Intitulé d'une question, les mots cherchés surlignés. */
function Highlighted({ text, query }) {
  return highlightParts(text, query).map((part, index) =>
    part.match ? (
      <mark key={index} className="bg-accent/25 text-inherit">
        {part.text}
      </mark>
    ) : (
      part.text
    ),
  );
}

export default function FAQ() {
  usePageMeta({
    title: 'Aide et questions fréquentes',
    description:
      'Livraison, tailles, retours, paiement, garantie\xa0: les réponses de la maison DAG à vos questions. Et un contact direct si la réponse manque.',
  });
  useJsonLd(JSON_LD);
  useHashAnchor();

  const searchId = useId();
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');

  const searching = searchTerms(query).length > 0;
  const trimmed = query.trim();
  const filtered = filterFaq(query);
  const visible = filtered.filter((category) => category.questions.length > 0);
  const total = visible.reduce((sum, category) => sum + category.questions.length, 0);
  const active = useActiveSection(visible.map((category) => category.id));

  const clear = () => {
    setQuery('');
    inputRef.current?.focus();
  };

  const status = !searching
    ? `${plural(FAQ_COUNT, 'question')}, ${plural(FAQ_CATEGORIES.length, 'rubrique')}.`
    : total > 0
      ? `${plural(total, 'réponse')} pour «\xa0${trimmed}\xa0».`
      : `Aucune réponse pour «\xa0${trimmed}\xa0».`;

  const navItems = filtered.map((category, index) => ({
    id: category.id,
    label: category.title,
    index: index + 1,
    count: category.questions.length,
    disabled: category.questions.length === 0,
  }));

  return (
    <>
      <PageHero
        eyebrow="Aide"
        title={'Vos questions,\nnos *réponses*.'}
        lead="Livraison, tailles, retours, paiement, garantie&nbsp;: l’essentiel est ici. Et si la réponse manque, écrivez-nous."
      >
        <Reveal delay={0.35} className="mt-12 max-w-3xl lg:mt-16">
          <form role="search" onSubmit={(event) => event.preventDefault()}>
            <label htmlFor={searchId} className="sr-only">
              Rechercher dans l’aide
            </label>
            <div className="flex items-center gap-4 border-b border-fg/35 transition-[border-color,box-shadow] duration-300 focus-within:border-accent focus-within:shadow-[0_1px_0_var(--accent)]">
              <Icon name="search" size={22} className="text-muted" />
              <input
                ref={inputRef}
                id={searchId}
                type="search"
                name="q"
                autoComplete="off"
                enterKeyHint="search"
                placeholder="Rechercher une question"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && query) {
                    event.preventDefault();
                    setQuery('');
                  }
                }}
                className="control min-h-16 min-w-0 flex-1 bg-transparent font-display text-[clamp(1.375rem,2vw,1.75rem)] text-fg outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
              />
              {query ? (
                <button
                  type="button"
                  onClick={clear}
                  className="grid size-11 shrink-0 place-items-center text-muted transition-colors duration-300 hover:text-fg"
                >
                  <Icon name="close" size={20} title="Effacer la recherche" />
                </button>
              ) : null}
            </div>
            <p role="status" className="mt-3 text-[0.8125rem] leading-snug text-muted">
              {status}
            </p>
          </form>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <p className="eyebrow mr-2 text-muted">Par exemple</p>
            {SUGGESTIONS.map((word) => {
              const pressed = fold(trimmed) === word;
              return (
                <button
                  key={word}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => setQuery(pressed ? '' : word)}
                  className={cn(
                    'min-h-11 rounded-full border px-4 text-[0.8125rem] transition-colors duration-300',
                    pressed ? 'border-fg bg-fg text-bg' : 'border-fg/25 text-fg/85 hover:border-fg/70 hover:text-fg',
                  )}
                >
                  {word}
                </button>
              );
            })}
          </div>
        </Reveal>
      </PageHero>

      <Section tone="ivoire" className="!pt-[clamp(3rem,6vw,6rem)]">
        <div className="grid gap-y-10 lg:grid-cols-12 lg:gap-x-6">
          <aside className={cn('lg:col-span-3', total === 0 && 'max-lg:hidden')}>
            <SectionNav items={navItems} active={active} label="Rubriques de l’aide" title="Rubriques" className="lg:sticky lg:top-header" />
          </aside>

          <div className="lg:col-span-8 lg:col-start-5">
            {visible.length > 0 ? (
              visible.map((category) => {
                const index = FAQ_CATEGORIES.findIndex((entry) => entry.id === category.id);
                const headingId = `${category.id}-titre`;
                return (
                  <section key={category.id} id={category.id} aria-labelledby={headingId} className="pt-16 first:pt-0 lg:pt-24">
                    <div className="mb-6 flex flex-wrap items-baseline gap-x-5 gap-y-2 lg:mb-9">
                      <span aria-hidden="true" className="eyebrow tabular-nums text-accent">
                        {two(index + 1)}
                      </span>
                      <h2 id={headingId} className="text-title">
                        {category.title}
                      </h2>
                      <span className="eyebrow ml-auto text-muted">{plural(category.questions.length, searching ? 'réponse' : 'question')}</span>
                    </div>
                    <Accordion
                      key={`${category.id}:${fold(trimmed)}`}
                      type={searching ? 'multiple' : 'single'}
                      defaultOpen={searching && total <= 3 ? category.questions.map((question) => question.id) : []}
                      items={category.questions.map((question) => ({
                        id: question.id,
                        title: searching ? <Highlighted text={question.q} query={query} /> : question.q,
                        content: <RichText blocks={question.a} />,
                      }))}
                    />
                  </section>
                );
              })
            ) : (
              <div className="border-t border-line pt-12 lg:pt-16">
                <p className="max-w-[16ch] text-title">Cette question n’a pas encore sa réponse.</p>
                <p className="mt-6 max-w-[46ch] text-lead text-muted">
                  Essayez un autre mot — «&nbsp;retour&nbsp;», «&nbsp;taille&nbsp;», «&nbsp;livraison&nbsp;» — ou posez-nous la question
                  directement.
                </p>
                <div className="mt-9 flex flex-wrap gap-3">
                  <Button variant="solid" onClick={clear}>
                    Effacer la recherche
                  </Button>
                  <Button to="/contact" variant="outline" icon="arrow-right">
                    Nous écrire
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Section>

      <Section tone="noir">
        <div className="grid gap-y-10 lg:grid-cols-12 lg:items-end lg:gap-x-6">
          <SectionHeading
            className="lg:col-span-7"
            eyebrow="Contact"
            title={'Une question\nsans *réponse*\xa0?'}
            lead="Notre équipe est là pour vous aider. Écrivez-nous&nbsp;: nous répondons sous 24&nbsp;h ouvrées."
          />
          <Reveal delay={0.3} className="flex flex-col items-start gap-5 lg:col-span-4 lg:col-start-9 lg:pb-2">
            <Button to="/contact" size="lg" icon="arrow-right">
              Nous contacter
            </Button>
            <TextLink href={`mailto:${CONTACT_EMAIL}`} variant="label" arrow="up-right" tone="muted">
              {CONTACT_EMAIL}
            </TextLink>
            <TextLink to="/guide-des-tailles" variant="label" arrow tone="muted">
              Guide des tailles
            </TextLink>
          </Reveal>
        </div>
      </Section>
    </>
  );
}
