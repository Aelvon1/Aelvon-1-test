import { Link } from 'react-router-dom';
import { AnimatePresence, motion as Motion, useReducedMotion } from 'motion/react';
import { useCart } from '../../context/CartContext';
import { formatPrice } from '../../lib/format';
import { FREE_SHIPPING_THRESHOLD, roundMoney } from '../../lib/pricing';
import Button from '../ui/Button';
import Drawer from '../ui/Drawer';
import FreeShippingBar from '../ui/FreeShippingBar';
import Packshot from '../ui/Packshot';
import Price from '../ui/Price';
import QuantityStepper from '../ui/QuantityStepper';
import { EASE_LUXE } from '../ui/motion-presets';

function CartLine({ item, index, onQuantity, onRemove, onNavigate }) {
  const reduced = useReducedMotion();
  const to = item.slug ? `/product/${item.slug}` : '/atelier';
  return (
    <Motion.li
      layout={reduced ? false : 'position'}
      initial={reduced ? false : { height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: reduced ? 0 : 0.6, ease: EASE_LUXE }}
      className="overflow-hidden"
    >
      <div className="cart-line-in flex gap-5 border-b border-line py-6" style={{ '--i': Math.min(index, 6) }}>
        <Link to={to} onClick={onNavigate} tabIndex={-1} aria-hidden="true" className="block w-[5.75rem] shrink-0 self-start">
          <Packshot src={item.image} belt={item.belt} alt="" ratio="4 / 5" />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-4">
            <h3 className="font-display text-[1.375rem] leading-[1.15]">
              <Link to={to} onClick={onNavigate} className="group/link">
                <span className="link-underline">{item.name}</span>
              </Link>
            </h3>
            <Price amount={roundMoney(item.price * item.quantity)} className="pt-1 text-[0.9375rem] font-medium" />
          </div>
          <p className="mt-1.5 text-[0.8125rem] leading-snug text-muted">{item.subtitle}</p>
          <div className="mt-auto flex items-center justify-between gap-4 pt-4">
            <QuantityStepper
              value={item.quantity}
              onChange={(next) => onQuantity(item.cartItemId, next)}
              label={`Quantité — ${item.name}`}
            />
            <button
              type="button"
              onClick={(event) => {
                // le bouton disparaît avec la ligne : on rend le focus au tiroir
                event.currentTarget.closest('[role="dialog"]')?.focus({ preventScroll: true });
                onRemove(item.cartItemId);
              }}
              aria-label={`Retirer ${item.name} du panier`}
              className="group/link flex min-h-11 items-center text-[0.8125rem] text-muted transition-colors duration-300 hover:text-fg"
            >
              <span className="link-underline-always">Retirer</span>
            </button>
          </div>
        </div>
      </div>
    </Motion.li>
  );
}

function EmptyCart({ onClose }) {
  return (
    <div className="flex min-h-full flex-col justify-center px-6 py-12 sm:px-8">
      <p className="eyebrow text-muted">Panier</p>
      <p className="mt-5 font-display text-[2.5rem] leading-[1.02] tracking-[-0.015em]">
        Il ne manque que <em className="italic">l’essentiel</em>.
      </p>
      <p className="mt-5 max-w-[34ch] text-[0.9375rem] leading-relaxed text-muted">
        Votre panier est vide. Choisissez une ceinture de la collection, ou composez la vôtre à l’Atelier.
      </p>
      <div className="mt-9 flex flex-col gap-3">
        <Button to="/shop" onClick={onClose} variant="solid" icon="arrow-right" fullWidth>
          Découvrir la collection
        </Button>
        <Button to="/atelier" onClick={onClose} variant="outline" fullWidth>
          Composer la vôtre
        </Button>
      </div>
    </div>
  );
}

/** Tiroir du panier, lié à useCart(). Ouvert par openCart(), addToCart() ou addCustomBelt(). */
export default function CartDrawer() {
  const { cartItems, subtotal, shipping, total, count, updateQuantity, removeFromCart, isCartOpen, closeCart } = useCart();
  const empty = cartItems.length === 0;

  const footer = empty ? null : (
    <div className="flex flex-col gap-5">
      <dl className="flex flex-col gap-2 text-[0.9375rem]">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted">Sous-total</dt>
          <dd>
            <Price amount={subtotal} />
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted">Livraison</dt>
          <dd>{shipping === 0 ? 'Offerte' : <Price amount={shipping} />}</dd>
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-line pt-4">
          <dt className="eyebrow">Total</dt>
          <dd className="font-display text-[1.75rem] leading-none">
            <Price amount={total} />
          </dd>
        </div>
      </dl>
      <div className="flex flex-col gap-1">
        <Button to="/checkout" onClick={closeCart} variant="solid" size="lg" icon="arrow-right" fullWidth>
          Commander
        </Button>
        <button
          type="button"
          onClick={closeCart}
          className="group/link mx-auto flex min-h-11 items-center text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-muted transition-colors duration-300 hover:text-fg"
        >
          <span className="link-underline [--underline-trim:0.22em]">Continuer mes achats</span>
        </button>
      </div>
      <p className="text-center text-xs leading-relaxed text-muted">
        Livraison en 3 à 5&nbsp;jours ouvrés, offerte dès {formatPrice(FREE_SHIPPING_THRESHOLD)}. Retours gratuits sous 30&nbsp;jours.
      </p>
    </div>
  );

  return (
    <Drawer
      open={isCartOpen}
      onClose={closeCart}
      padded={false}
      footer={footer}
      closeLabel="Fermer le panier"
      title={
        <>
          Votre panier
          {count > 0 ? (
            <span className="ml-2.5 align-[0.3em] font-sans text-[0.8125rem] font-medium tabular-nums text-muted">
              <span aria-hidden="true">({count})</span>
              <span className="sr-only">
                , {count} article{count > 1 ? 's' : ''}
              </span>
            </span>
          ) : null}
        </>
      }
    >
      {empty ? (
        <EmptyCart onClose={closeCart} />
      ) : (
        <>
          <div className="border-b border-line px-6 py-5 sm:px-8">
            <FreeShippingBar subtotal={subtotal} />
          </div>
          <ul className="px-6 sm:px-8" aria-label="Articles du panier">
            <AnimatePresence initial={false}>
              {cartItems.map((item, index) => (
                <CartLine
                  key={item.cartItemId}
                  item={item}
                  index={index}
                  onQuantity={updateQuantity}
                  onRemove={removeFromCart}
                  onNavigate={closeCart}
                />
              ))}
            </AnimatePresence>
          </ul>
        </>
      )}
    </Drawer>
  );
}
