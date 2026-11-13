import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { findProduct } from '../../data/products';
import SizeGuideDrawer from './SizeGuideDrawer';

const mount = (props = {}) =>
  render(
    <MemoryRouter>
      <SizeGuideDrawer open onClose={vi.fn()} product={findProduct('essential')} onApply={vi.fn()} {...props} />
    </MemoryRouter>,
  );

const field = () => screen.getByLabelText('Votre tour de taille');
const type = (text) => fireEvent.change(field(), { target: { value: text } });
const described = () => document.getElementById(field().getAttribute('aria-describedby')).textContent;
const text = (element) => element.textContent.replace(/\xa0/g, ' ');
const advice = () => text(document.querySelector('[aria-live="polite"]'));

describe('SizeGuideDrawer — saisie du tour de taille', () => {
  it('ne signale aucune erreur pendant la saisie de « 85 » et de « 105 »', () => {
    mount();
    for (const entry of ['8', '85', '', '1', '10', '105']) {
      type(entry);
      expect(field(), entry).not.toHaveAttribute('aria-invalid', 'true');
      expect(text(document.body)).not.toContain('Indiquez un tour de taille');
    }
    expect(described()).toMatch(/^Entre 60 et 115/);
  });

  it('signale sans attendre une mesure au-delà du maximum', () => {
    mount();
    type('116');
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(described()).toMatch(/^Indiquez un tour de taille entre 60 et 115/);
  });

  it('signale une mesure trop petite quand le champ est quitté, et retire l’erreur à la frappe suivante', () => {
    mount();
    type('45');
    expect(field()).not.toHaveAttribute('aria-invalid', 'true');
    fireEvent.blur(field());
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    type('4');
    expect(field()).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('signale une mesure trop petite quand elle est validée par Entrée', () => {
    const onApply = vi.fn();
    mount({ onApply });
    type('5');
    fireEvent.submit(field().closest('form'));
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(onApply).not.toHaveBeenCalled();
  });

  it('applique la taille conseillée à la validation d’une mesure correcte', () => {
    const onApply = vi.fn();
    mount({ onApply });
    type('85');
    fireEvent.submit(field().closest('form'));
    expect(onApply).toHaveBeenCalledWith('100');
  });
});

describe('SizeGuideDrawer — conseil', () => {
  it('écrit la longueur idéale avec une virgule', () => {
    mount();
    type('85,5');
    expect(advice()).toContain('Votre longueur idéale est de 100,5 cm.');
    type('62,5');
    expect(advice()).toContain('Votre longueur idéale est de 77,5 cm');
    expect(advice()).not.toMatch(/\d\.\d/);
  });

  it('renvoie vers l’Atelier une longueur qu’il réalise', () => {
    mount();
    type('107'); // idéal 122 : hors du modèle (85 à 110), dans la tolérance du 120 de l'Atelier
    expect(advice()).toContain('À l’Atelier, nous réalisons les longueurs de 80 à 120 cm.');
    expect(screen.getByRole('link', { name: 'Composer la vôtre' })).toHaveAttribute('href', '/atelier');
    expect(screen.queryByRole('link', { name: 'Nous écrire' })).toBeNull();
  });

  it('renvoie vers le contact une longueur que l’Atelier ne réalise pas non plus', () => {
    mount();
    for (const entry of ['115', '60']) {
      type(entry);
      expect(advice(), entry).toContain('comme de celles que nous réalisons à l’Atelier (80 à 120 cm)');
      expect(screen.queryByRole('link', { name: 'Composer la vôtre' })).toBeNull();
      expect(screen.getByRole('link', { name: 'Nous écrire' })).toHaveAttribute('href', '/contact?sujet=produit');
    }
  });
});
