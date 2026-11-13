import { describe, expect, it } from 'vitest';
import { cn, yieldDisplay } from './cn';

describe('cn', () => {
  it('assemble les classes en ignorant les valeurs vides', () => {
    expect(cn('a', false, null, undefined, '', 'b', ['c', 0, 'd'])).toBe('a b c d');
  });
});

describe('yieldDisplay', () => {
  const BASE = 'group/btn relative inline-flex items-center';

  it('garde les classes par défaut quand l’appelant ne règle pas display', () => {
    expect(yieldDisplay(BASE)).toBe(BASE);
    expect(yieldDisplay(BASE, 'mt-4 w-full text-left')).toBe(BASE);
    expect(yieldDisplay(BASE, [false, undefined])).toBe(BASE);
  });

  it.each(['hidden', 'block', 'inline-block', 'flex', 'inline-flex', 'grid', 'contents'])(
    'laisse « %s » de l’appelant remplacer le display par défaut',
    (utility) => {
      expect(yieldDisplay(BASE, `mt-4 ${utility}`)).toBe('group/btn relative items-center');
    },
  );

  it('traite « hidden sm:inline-flex » : le défaut sans variante s’efface', () => {
    expect(yieldDisplay(BASE, 'hidden sm:inline-flex')).toBe('group/btn relative items-center');
  });

  it('conserve le défaut quand l’appelant ne règle display que sous une variante', () => {
    // « sm:hidden » passe après « inline-flex » dans la feuille de styles : rien à retirer
    expect(yieldDisplay(BASE, 'sm:hidden')).toBe(BASE);
    expect(yieldDisplay(BASE, 'max-sm:hidden hover:flex')).toBe(BASE);
    expect(yieldDisplay(BASE, 'group-aria-[current]:hidden')).toBe(BASE);
  });

  it('ne retire un défaut à variante que pour la même variante', () => {
    const base = 'hidden sm:flex lg:grid gap-2';
    expect(yieldDisplay(base, 'sm:block')).toBe('hidden lg:grid gap-2');
    expect(yieldDisplay(base, 'inline-flex lg:hidden')).toBe('sm:flex gap-2');
  });

  it('reconnaît la priorité « ! » et les valeurs arbitraires', () => {
    expect(yieldDisplay(BASE, 'hidden!')).toBe('group/btn relative items-center');
    expect(yieldDisplay(BASE, '!hidden')).toBe('group/btn relative items-center');
    expect(yieldDisplay(BASE, '[display:inline-grid]')).toBe('group/btn relative items-center');
  });

  it('ne confond pas les deux-points entre crochets avec une variante', () => {
    expect(yieldDisplay(BASE, '[&_.packshot-hover]:object-cover [--underline-trim:0.22em]')).toBe(BASE);
    expect(yieldDisplay(BASE, 'supports-[display:grid]:grid')).toBe(BASE);
    expect(yieldDisplay('inline-flex [&_svg]:hidden', '[&_svg]:block')).toBe('inline-flex');
  });

  it('ignore les classes qui ressemblent à display sans le régler', () => {
    expect(yieldDisplay(BASE, 'flex-1 grid-cols-2 inline-flex-none table-fixed sr-only')).toBe(BASE);
  });

  it('accepte les mêmes entrées que cn', () => {
    expect(yieldDisplay(['inline-flex', false, 'gap-2'], ['hidden', null])).toBe('gap-2');
  });
});
