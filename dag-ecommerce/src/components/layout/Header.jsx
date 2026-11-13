import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useScrollState } from '../../hooks/useScrollState';
import { useSurfaceTone } from '../../hooks/useSurfaceTone';
import Icon from '../ui/Icon';
import { cn } from '../ui/cn';
import MobileMenu from './MobileMenu';
import { PRIMARY_NAV, currentState } from './navigation';

/**
 * En-tête fixe. Transparent en haut de page, puis bandeau translucide ; se replie quand on
 * descend, revient quand on remonte. Adopte le ton (noir / ivoire) de la section qu'il survole.
 */
export default function Header() {
  const ref = useRef(null);
  const { pathname } = useLocation();
  const { count, openCart, isCartOpen } = useCart();
  const { count: wishCount } = useWishlist();
  const { scrolled, deep, direction } = useScrollState();
  const desktop = useMediaQuery('(min-width: 64rem)');
  const [focusWithin, setFocusWithin] = useState(false);
  // le menu est lié à la page où il a été ouvert : toute navigation le referme
  const [menuPath, setMenuPath] = useState(null);
  const menuOpen = menuPath === pathname && !desktop;

  const hidden = deep && direction === 'down' && !menuOpen && !focusWithin;

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--header-offset', hidden ? '0px' : 'var(--header-h)');
    return () => root.style.removeProperty('--header-offset');
  }, [hidden]);

  // Bandeau visible : un seul ton, celui du centre. En transparence : chaque zone (mot-symbole,
  // chaque lien, actions) suit la surface qu'elle survole — utile au-dessus d'une page en deux volets.
  useSurfaceTone(ref, { unified: scrolled });

  return (
    <header
      ref={ref}
      data-tone-ignore
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-transform duration-700 ease-luxe',
        hidden ? '-translate-y-full' : 'translate-y-0',
      )}
      style={{ paddingRight: 'var(--scroll-lock-gap)' }}
      onFocus={() => setFocusWithin(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusWithin(false);
      }}
    >
      <div
        aria-hidden="true"
        data-tone-zone="center"
        data-tone="noir"
        className={cn(
          'absolute inset-0 border-b border-line bg-bg/75 backdrop-blur-xl transition-[opacity,background-color,border-color] duration-500 ease-luxe',
          scrolled ? 'opacity-100' : 'opacity-0',
        )}
      />

      <div className="container-luxe relative grid h-[var(--header-h)] grid-cols-[1fr_auto_1fr] items-center gap-6">
        <div data-tone-zone data-tone="noir" className="justify-self-start">
          <Link
            to="/"
            aria-label="DAG — accueil"
            aria-current={pathname === '/' ? 'page' : undefined}
            className="flex min-h-11 items-center font-display text-[1.625rem] font-medium leading-none tracking-[0.22em] lg:text-[1.75rem]"
          >
            DAG
          </Link>
        </div>

        <nav aria-label="Navigation principale" className="hidden lg:block">
          <ul className="flex items-center gap-10 xl:gap-12">
            {PRIMARY_NAV.map((item) => {
              const current = currentState(item, pathname);
              return (
                <li key={item.to} data-tone-zone data-tone="noir">
                  <Link
                    to={item.to}
                    aria-current={current}
                    className="group/link flex min-h-11 items-center text-[0.6875rem] font-semibold uppercase tracking-[0.24em]"
                  >
                    <span className={cn(current ? 'link-underline-always' : 'link-underline', '[--underline-trim:0.24em]')}>
                      {item.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div data-tone-zone data-tone="noir" className="col-start-3 -mr-2.5 flex items-center justify-self-end">
          <Link
            to="/favoris"
            aria-label={wishCount > 0 ? `Favoris (${wishCount})` : 'Favoris'}
            aria-current={pathname === '/favoris' ? 'page' : undefined}
            className="relative grid size-11 place-items-center transition-colors duration-300 hover:text-accent"
          >
            <Icon name="heart" size={21} />
            {wishCount > 0 ? <span aria-hidden="true" className="absolute right-2 top-2.5 size-1.5 rounded-full bg-accent" /> : null}
          </Link>

          <button
            type="button"
            onClick={openCart}
            aria-haspopup="dialog"
            aria-expanded={isCartOpen}
            aria-label={count > 0 ? `Panier, ${count} article${count > 1 ? 's' : ''}` : 'Panier, vide'}
            className="relative grid size-11 place-items-center transition-colors duration-300 hover:text-accent"
          >
            <Icon name="bag" size={21} />
            {count > 0 ? (
              <span
                aria-hidden="true"
                className="absolute right-1 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[0.625rem] font-bold leading-none tabular-nums text-on-accent"
              >
                {count}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => setMenuPath(pathname)}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            aria-label="Ouvrir le menu"
            className="grid size-11 place-items-center lg:hidden"
          >
            <Icon name="menu" size={24} />
          </button>
        </div>
      </div>

      <MobileMenu open={menuOpen} onClose={() => setMenuPath(null)} pathname={pathname} wishCount={wishCount} />
    </header>
  );
}
