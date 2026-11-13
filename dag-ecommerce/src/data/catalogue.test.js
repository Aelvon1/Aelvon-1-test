import { describe, expect, it } from 'vitest';
import {
  BUCKLES,
  DEFAULT_BELT,
  FINISHES,
  HERO_BELT,
  LEATHERS,
  STITCHES,
  WIDTHS,
  beltConfigKey,
  describeBelt,
  normalizeBeltConfig,
  resolveBeltConfig,
} from './atelier';
import { SHOTS, allVariants, findColor, findProduct, productGallery, productImage, productPath, products } from './products';

const ids = (list) => list.map((entry) => entry.id);

describe('nuancier de l’Atelier', () => {
  it('complète une configuration partielle avec les valeurs par défaut', () => {
    expect(normalizeBeltConfig()).toEqual({ ...DEFAULT_BELT });
    expect(normalizeBeltConfig({ leather: 'navy' })).toMatchObject({ leather: 'navy', finish: 'lisse', width: 35 });
  });

  it('écarte les identifiants inconnus', () => {
    const c = normalizeBeltConfig({ leather: 'rose', finish: 'verni', buckle: 'or massif', stitch: 'fluo', width: 12, lining: 'rose', monogram: 42 });
    expect(c.leather).toBe(LEATHERS[0].id);
    expect(c.finish).toBe(FINISHES[0].id);
    expect(c.buckle).toBe(BUCKLES[0].id);
    expect(c.stitch).toBe(STITCHES[0].id);
    expect(c.width).toBe(35);
    expect(c.lining).toBe(LEATHERS[0].id);
    expect(c.monogram).toBe('');
  });

  it('résout les identifiants en valeurs de rendu', () => {
    const r = resolveBeltConfig({ leather: 'noir', lining: 'marron', stitch: 'ecru', buckle: 'laiton', width: 38 });
    expect(r.leatherHex).toBe('#141312');
    expect(r.liningHex).toBe('#4b2f22');
    expect(r.stitchHex).toBe('#e6dcc8');
    expect(r.buckleHex).toBe('#c9a96e');
    expect(r.widthMm).toBe(38);
  });

  it('distingue ton sur ton (null), bords francs (false) et envers identique au cuir', () => {
    expect(resolveBeltConfig({ stitch: 'ton' }).stitchHex).toBeNull();
    expect(resolveBeltConfig({ stitch: 'sans' }).stitchHex).toBe(false);
    const r = resolveBeltConfig({ leather: 'tan' });
    expect(r.liningHex).toBe(r.leatherHex);
  });

  it('donne une clé stable, insensible au style d’un monogramme absent', () => {
    expect(beltConfigKey({ leather: 'noir' })).toBe(beltConfigKey({ leather: 'noir', monogramStyle: 'or' }));
    expect(beltConfigKey({ leather: 'noir', monogram: 'AD' })).not.toBe(beltConfigKey({ leather: 'noir', monogram: 'AD', monogramStyle: 'or' }));
    expect(beltConfigKey({ leather: 'noir' })).not.toBe(beltConfigKey({ leather: 'ebene' }));
  });

  it('décrit une ceinture en clair', () => {
    expect(describeBelt(HERO_BELT)).toBe('Cuir cognac lisse · boucle laiton doré · couture ton sur ton · 35 mm');
    expect(describeBelt({ stitch: 'sans', lining: 'marron' })).toContain('bords francs');
    expect(describeBelt({ stitch: 'sans', lining: 'marron' })).toContain('envers marron');
  });
});

describe('catalogue', () => {
  it('a des identifiants et des slugs uniques', () => {
    expect(new Set(products.map((p) => p.id)).size).toBe(products.length);
    expect(new Set(products.map((p) => p.slug)).size).toBe(products.length);
  });

  it('ne référence que des options existantes du nuancier', () => {
    for (const product of products) {
      expect(product.colors.length).toBeGreaterThan(0);
      expect(new Set(product.colors.map((c) => c.value)).size).toBe(product.colors.length);
      for (const color of product.colors) {
        expect(ids(LEATHERS)).toContain(color.belt.leather);
        expect(ids(FINISHES)).toContain(color.belt.finish);
        expect(ids(BUCKLES)).toContain(color.belt.buckle);
        expect(ids(STITCHES)).toContain(color.belt.stitch);
        expect(ids(WIDTHS)).toContain(color.belt.width);
        expect(product.width).toBe(`${color.belt.width} mm`);
        if (color.belt.lining) expect(ids(LEATHERS)).toContain(color.belt.lining);
      }
    }
  });

  it('retrouve un produit par identifiant ou par slug', () => {
    expect(findProduct('1')?.slug).toBe('essential');
    expect(findProduct(3)?.slug).toBe('texture');
    expect(findProduct('Reversible')?.id).toBe(6);
    expect(findProduct('inconnu')).toBeUndefined();
    expect(findProduct(undefined)).toBeUndefined();
    expect(productPath(products[0])).toBe('/product/essential');
  });

  it('retombe sur le premier coloris quand la valeur est inconnue', () => {
    expect(findColor(products[0], 'cognac').name).toBe('Cognac');
    expect(findColor(products[0], 'fuchsia')).toBe(products[0].colors[0]);
  });

  it('nomme les visuels selon la convention des rendus', () => {
    expect(productImage(products[0], 'cognac')).toMatch(/renders\/essential-cognac-studio\.webp$/);
    expect(productImage(products[0], 'cognac', 'boucle')).toMatch(/renders\/essential-cognac-boucle\.webp$/);
    const gallery = productGallery(products[2], 'tan');
    expect(gallery.map((g) => g.id)).toEqual(SHOTS.map((s) => s.id));
    expect(gallery[0].alt).toContain('DAG Texture Tan');
  });

  it('liste chaque variante une seule fois pour le script de rendu', () => {
    const variants = allVariants();
    expect(variants).toHaveLength(products.reduce((n, p) => n + p.colors.length, 0));
    expect(new Set(variants.map((v) => `${v.slug}-${v.color}`)).size).toBe(variants.length);
  });
});
