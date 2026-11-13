import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { products } from '../../data/products';
import { createAtelierItem, createCatalogItem } from '../../lib/cart';
import OrderLine from './OrderLine';

const essential = products.find((p) => p.slug === 'essential');
const [noir] = essential.colors;
const names = (role) => screen.getAllByRole(role).map((node) => node.getAttribute('aria-label')).filter(Boolean);

describe('OrderLine — noms accessibles', () => {
  it('distingue deux tailles d’une même ceinture', () => {
    render(
      <>
        <OrderLine item={createCatalogItem(essential, noir, '95')} editable />
        <OrderLine item={createCatalogItem(essential, noir, '100')} editable />
      </>,
    );
    expect(names('group')).toEqual(['Quantité — DAG Essential, Noir, 95 cm', 'Quantité — DAG Essential, Noir, 100 cm']);
    expect(screen.getByRole('button', { name: 'Retirer DAG Essential, Noir, 95 cm de la commande' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retirer DAG Essential, Noir, 100 cm de la commande' })).toBeInTheDocument();
  });

  it('distingue deux créations de l’Atelier et deux styles de monogramme', () => {
    render(
      <>
        <OrderLine item={createAtelierItem({ leather: 'noir', monogram: 'AB', monogramStyle: 'or' }, '95')} editable />
        <OrderLine item={createAtelierItem({ leather: 'noir', monogram: 'AB', monogramStyle: 'argent' }, '95')} editable />
      </>,
    );
    const groups = names('group');
    expect(new Set(groups).size).toBe(2);
    expect(groups[0]).toMatch(/^Quantité — DAG Sur-Mesure, .*Monogramme AB \(dorure or\)$/);
    expect(groups[1]).toMatch(/Monogramme AB \(dorure argent\)$/);
  });
});
