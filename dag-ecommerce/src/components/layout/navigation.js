// Navigation du site : source unique pour l'en-tête, le menu mobile et le pied de page.
import { collections } from '../../data/products';

export const CONTACT_EMAIL = 'contact@dag-belts.com';

/** `match` : préfixes de chemin qui rattachent une page à cette rubrique (aria-current). */
export const PRIMARY_NAV = [
  { label: 'Collection', to: '/shop', match: ['/shop', '/product'] },
  { label: 'L’Atelier', to: '/atelier', match: ['/atelier'] },
  { label: 'La Maison', to: '/about', match: ['/about'] },
  { label: 'Aide', to: '/faq', match: ['/faq', '/contact', '/guide-des-tailles'] },
];

export const SECONDARY_NAV = [
  { label: 'FAQ', to: '/faq' },
  { label: 'Contact', to: '/contact' },
  { label: 'Guide des tailles', to: '/guide-des-tailles' },
  { label: 'Mentions légales', to: '/legal' },
];

export const FOOTER_NAV = [
  {
    title: 'Boutique',
    links: [
      { label: 'Toute la collection', to: '/shop' },
      ...collections.map((collection) => ({
        label: collection.name,
        to: `/shop?collection=${collection.name.toLowerCase()}`,
      })),
    ],
  },
  {
    title: 'La Maison',
    links: [
      { label: 'À propos', to: '/about' },
      { label: 'L’Atelier', to: '/atelier' },
      { label: 'Guide des tailles', to: '/guide-des-tailles' },
    ],
  },
  {
    title: 'Aide',
    links: [
      { label: 'FAQ', to: '/faq' },
      { label: 'Contact', to: '/contact' },
      { label: 'Mentions légales', to: '/legal' },
    ],
  },
];

/** 'page' si le chemin est exactement celui du lien, 'true' s'il appartient à la rubrique. */
export function currentState(item, pathname) {
  if (pathname === item.to) return 'page';
  const prefixes = item.match ?? [item.to];
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ? 'true' : undefined;
}
