import { describe, expect, it } from 'vitest';
import { FAQ_CATEGORIES, FAQ_COUNT, answerText, faqJsonLd, filterFaq, fold, highlightParts } from './faq-content';

const count = (categories) => categories.reduce((total, category) => total + category.questions.length, 0);

describe('contenu de l’aide', () => {
  it('garde les cinq rubriques et les dix-huit questions d’origine', () => {
    expect(FAQ_CATEGORIES.map((category) => category.id)).toEqual(['livraison', 'produits', 'retours', 'paiement', 'garantie']);
    expect(FAQ_COUNT).toBe(18);
  });

  it('donne des identifiants uniques aux questions', () => {
    const ids = FAQ_CATEGORIES.flatMap((category) => category.questions.map((question) => question.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('applique la règle maison des tailles et les frais de port partagés', () => {
    const text = FAQ_CATEGORIES.flatMap((category) => category.questions.map((question) => answerText(question.a))).join(' ');
    expect(text).toContain('ajoutez 15\xa0cm');
    expect(text).toContain('tour de taille de 85\xa0cm, choisissez une ceinture en taille 100');
    expect(text).toMatch(/100\s€/);
    expect(text).toMatch(/7,90\s€/);
    expect(text).toContain('France, Belgique, Suisse et Luxembourg');
  });

  it('reste exact sur le paiement : Stripe, aucune donnée bancaire conservée', () => {
    const payment = FAQ_CATEGORIES.find((category) => category.id === 'paiement');
    const text = payment.questions.map((question) => answerText(question.a)).join(' ');
    expect(text).toContain('Stripe');
    expect(text).toContain('Nous ne stockons aucune information bancaire');
  });
});

describe('recherche', () => {
  it('replie accents, casse et apostrophes sans changer la longueur', () => {
    expect(fold('Échange d’Été\xa0?')).toBe("echange d'ete ?");
    expect(fold('Échange d’Été\xa0?')).toHaveLength('Échange d’Été\xa0?'.length);
  });

  it('renvoie tout sans requête', () => {
    expect(count(filterFaq('   '))).toBe(FAQ_COUNT);
  });

  it('ignore les accents et exige tous les mots', () => {
    const delays = filterFaq('delais livraison');
    expect(delays.find((category) => category.id === 'livraison').questions.map((question) => question.id)).toContain('delais');
    expect(count(filterFaq('rembourse'))).toBeGreaterThan(0);
    expect(count(filterFaq('zzzz'))).toBe(0);
  });

  it('cherche aussi dans les réponses', () => {
    const result = filterFaq('pci-dss');
    expect(result.find((category) => category.id === 'paiement').questions).toHaveLength(1);
  });

  it('surligne les mots trouvés dans un intitulé accentué', () => {
    const parts = highlightParts('Quels sont les délais de livraison\xa0?', 'DELAIS');
    expect(parts.filter((part) => part.match).map((part) => part.text)).toEqual(['délais']);
    expect(parts.map((part) => part.text).join('')).toBe('Quels sont les délais de livraison\xa0?');
  });
});

describe('données structurées', () => {
  it('publie une FAQPage complète, en texte brut', () => {
    const data = faqJsonLd();
    expect(data['@type']).toBe('FAQPage');
    expect(data.mainEntity).toHaveLength(FAQ_COUNT);
    for (const entry of data.mainEntity) {
      expect(entry['@type']).toBe('Question');
      expect(entry.name).not.toContain('\xa0');
      expect(typeof entry.acceptedAnswer.text).toBe('string');
      expect(entry.acceptedAnswer.text.length).toBeGreaterThan(20);
    }
  });
});
