import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PaymentStep from './PaymentStep';

const customer = {
  email: 'camille@exemple.fr',
  firstName: 'Camille',
  lastName: 'Durand',
  phone: '06 12 34 56 78',
  address: '12 rue de Turenne',
  addressComplement: '',
  postalCode: '75003',
  city: 'Paris',
  country: 'FR',
};

const mount = (props = {}) =>
  render(<PaymentStep customer={customer} giftNote="" shipping={0} today={new Date(2026, 10, 13, 12)} confirming={false} onEdit={vi.fn()} onConfirm={vi.fn()} {...props} />);

describe('PaymentStep — cadeau', () => {
  it('ne parle pas de cadeau pour une commande ordinaire', () => {
    mount();
    expect(screen.queryByRole('group', { name: 'Cadeau' })).toBeNull();
  });

  it('rappelle la case « C’est un cadeau » même sans mot d’accompagnement', () => {
    mount({ gift: true });
    const group = screen.getByRole('group', { name: 'Cadeau' });
    expect(within(group).getByText('Cette commande est un cadeau.')).toBeInTheDocument();
    expect(within(group).getByText('Aucun mot ne l’accompagne.')).toBeInTheDocument();
  });

  it('affiche le mot quand il y en a un', () => {
    mount({ gift: true, giftNote: 'Joyeux anniversaire.' });
    const group = screen.getByRole('group', { name: 'Cadeau' });
    expect(within(group).getByText('Cette commande est un cadeau.')).toBeInTheDocument();
    expect(within(group).getByText('Joyeux anniversaire.')).toBeInTheDocument();
    expect(within(group).queryByText('Aucun mot ne l’accompagne.')).toBeNull();
  });
});

describe('PaymentStep — message avant confirmation', () => {
  it('n’affiche aucune alerte par défaut', () => {
    mount();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('annonce le message transmis (panier modifié dans un autre onglet)', () => {
    mount({ notice: 'Votre panier a été modifié dans un autre onglet.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Votre panier a été modifié dans un autre onglet.');
  });
});

describe('PaymentStep — coordonnées', () => {
  it('range le téléphone avec l’adresse, comme à l’étape 1', () => {
    mount();
    expect(within(screen.getByRole('group', { name: 'Adresse' })).getByText(/06 12 34 56 78/)).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Contact' })).queryByText(/06 12 34 56 78/)).toBeNull();
  });
});
