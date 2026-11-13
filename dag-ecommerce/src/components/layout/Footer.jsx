import { Link } from 'react-router-dom';
import { scrollToTop } from '../../hooks/scroll';
import Icon from '../ui/Icon';
import Reveal from '../ui/Reveal';
import { CONTACT_EMAIL, FOOTER_NAV } from './navigation';

const YEAR = new Date().getFullYear();

/**
 * Invitation à écrire à la maison : une phrase, puis un lien vers la page Contact tracé comme
 * une ligne de formulaire. Aucune inscription ici : rien n'est collecté ni promis à tort.
 */
function WriteToUs() {
  return (
    <div>
      <p className="eyebrow text-muted">Nous écrire</p>
      <p className="mt-5 font-display text-[clamp(2rem,3.2vw,3rem)] leading-[1.05] tracking-[-0.015em]">
        Parlons de
        <br />
        <em className="italic">votre</em> ceinture.
      </p>

      <div className="mt-9 max-w-md">
        <Link
          to="/contact"
          className="group/link flex min-h-13 items-center justify-between gap-6 border-b border-fg/35 text-[0.6875rem] font-semibold uppercase tracking-[0.22em] transition-colors duration-300 hover:border-accent hover:text-accent"
        >
          Écrire à la maison
          <Icon name="arrow-right" size={16} className="transition-transform duration-500 ease-luxe group-hover/link:translate-x-1" />
        </Link>
        <p className="mt-3 text-[0.8125rem] leading-snug text-muted">
          Taille, commande, création de l’Atelier&nbsp;: réponse sous 24&nbsp;h ouvrées.
        </p>
      </div>
    </div>
  );
}

/** Pied de page : invitation à écrire, colonnes de liens, mot-symbole surdimensionné, mentions. */
export default function Footer() {
  return (
    <footer className="theme-noir relative overflow-hidden border-t border-line">
      <div className="container-luxe">
        <div className="grid gap-16 py-20 lg:grid-cols-12 lg:gap-10 lg:py-28">
          <Reveal className="lg:col-span-5">
            <WriteToUs />
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

        {/* dernière ligne de la page : elle s'écarte de la zone sûre du bas (indicateur d'accueil) */}
        <div className="flex flex-col gap-x-10 gap-y-2 border-t border-line pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-5 text-[0.8125rem] text-muted md:flex-row md:items-center">
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
