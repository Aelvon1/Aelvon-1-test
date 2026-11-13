import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { scrollToTop } from '../../hooks/scroll';
import Icon from '../ui/Icon';
import Reveal from '../ui/Reveal';
import { cn } from '../ui/cn';
import { CONTACT_EMAIL, FOOTER_NAV } from './navigation';

const YEAR = new Date().getFullYear();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Inscription à la lettre : validation réelle, envoi simulé (aucun service branché, adresse non conservée). */
function Newsletter() {
  const inputId = useId();
  const errorId = `${inputId}-erreur`;
  const inputRef = useRef(null);
  const timer = useRef(0);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | done

  useEffect(() => () => clearTimeout(timer.current), []);

  const onSubmit = (event) => {
    event.preventDefault();
    if (status === 'sending') return;
    const value = email.trim();
    const problem = !value
      ? 'Indiquez votre adresse e-mail.'
      : !EMAIL_PATTERN.test(value)
        ? 'Cette adresse semble incomplète. Exemple\u00a0: prenom@exemple.fr'
        : '';
    if (problem) {
      setError(problem);
      inputRef.current?.focus();
      return;
    }
    setError('');
    setStatus('sending');
    timer.current = setTimeout(() => {
      setEmail('');
      setStatus('done');
    }, 900);
  };

  return (
    <div>
      <p className="eyebrow text-muted">La lettre</p>
      <p className="mt-5 max-w-[16ch] font-display text-[clamp(2rem,3.2vw,3rem)] leading-[1.05] tracking-[-0.015em]">
        Les nouvelles de la maison, <em className="italic">sans bruit</em>.
      </p>

      <div aria-live="polite" className="mt-9 max-w-md">
        {status === 'done' ? (
          <p className="flex min-h-13 items-center gap-3 border-b border-accent text-[0.9375rem]">
            <Icon name="check" size={18} className="text-accent" />
            Merci. Votre inscription est enregistrée.
          </p>
        ) : (
          <form onSubmit={onSubmit} noValidate>
            <label htmlFor={inputId} className="sr-only">
              Votre adresse e-mail
            </label>
            <div
              className={cn(
                'flex items-stretch border-b transition-[border-color,box-shadow] duration-300',
                error ? 'border-danger' : 'border-fg/35 focus-within:border-accent focus-within:shadow-[0_1px_0_var(--accent)]',
              )}
            >
              <input
                ref={inputRef}
                id={inputId}
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                placeholder="Votre adresse e-mail"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (error) setError('');
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                className="control min-h-13 min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-muted"
              />
              <button
                type="submit"
                disabled={status === 'sending'}
                className="group/link flex min-h-13 shrink-0 items-center gap-3 pl-5 text-[0.6875rem] font-semibold uppercase tracking-[0.22em] transition-colors duration-300 hover:text-accent disabled:text-muted"
              >
                {status === 'sending' ? 'Envoi…' : 'S’inscrire'}
                <Icon name="arrow-right" size={16} className="transition-transform duration-500 ease-luxe group-hover/link:translate-x-1" />
              </button>
            </div>
            {error ? (
              <p id={errorId} className="mt-3 flex items-start gap-1.5 text-[0.8125rem] leading-snug text-danger">
                <Icon name="alert" size={15} className="mt-px" />
                <span>{error}</span>
              </p>
            ) : (
              <p className="mt-3 text-[0.8125rem] leading-snug text-muted">Votre adresse ne sert qu’à cette lettre.</p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

/** Pied de page : lettre, colonnes de liens, mot-symbole surdimensionné, mentions. */
export default function Footer() {
  return (
    <footer className="theme-noir relative overflow-hidden border-t border-line">
      <div className="container-luxe">
        <div className="grid gap-16 py-20 lg:grid-cols-12 lg:gap-10 lg:py-28">
          <Reveal className="lg:col-span-5">
            <Newsletter />
          </Reveal>

          <nav aria-label="Pied de page" className="grid grid-cols-2 gap-x-8 gap-y-12 sm:grid-cols-3 lg:col-span-6 lg:col-start-7">
            {FOOTER_NAV.map((column) => (
              <div key={column.title}>
                <h2 className="eyebrow text-muted">{column.title}</h2>
                <ul className="mt-4">
                  {column.links.map((link) => (
                    <li key={link.to}>
                      <Link to={link.to} className="group/link flex min-h-11 items-center text-[0.9375rem] text-fg/85 transition-colors duration-300 hover:text-fg">
                        <span className="link-underline">{link.label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-8 border-t border-line pb-10 pt-12 md:flex-row md:items-end md:justify-between md:pb-14 md:pt-16">
          <p
            aria-hidden="true"
            className="-ml-[0.05em] font-display text-[44vw] font-normal leading-[0.72] tracking-[-0.04em] select-none md:text-[clamp(7.5rem,29vw,27rem)]"
          >
            DAG
          </p>
          <p className="font-display text-[clamp(1.5rem,2.2vw,2.125rem)] leading-[1.15] md:pb-[0.4em] md:text-right">
            L’essentiel.
            <br />
            <em className="italic">Parfaitement</em> maîtrisé.
          </p>
        </div>

        <div className="flex flex-col gap-x-10 gap-y-2 border-t border-line py-5 text-[0.8125rem] text-muted md:flex-row md:items-center">
          <p className="flex min-h-11 items-center">© {YEAR} DAG. Tous droits réservés.</p>
          <a href={`mailto:${CONTACT_EMAIL}`} className="group/link flex min-h-11 items-center transition-colors duration-300 hover:text-fg">
            <span className="link-underline">{CONTACT_EMAIL}</span>
          </a>
          <button
            type="button"
            onClick={() => scrollToTop()}
            className="group/link flex min-h-11 items-center gap-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-fg transition-colors duration-300 hover:text-accent md:ml-auto"
          >
            Haut de page
            <Icon name="arrow-up" size={16} className="transition-transform duration-500 ease-luxe group-hover/link:-translate-y-1" />
          </button>
        </div>
      </div>
    </footer>
  );
}
