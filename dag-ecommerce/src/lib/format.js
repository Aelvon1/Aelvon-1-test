const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const eurosCents = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 89 → « 89 € », 7.9 → « 7,90 € ». */
export function formatPrice(amount) {
  const value = Number(amount) || 0;
  return Number.isInteger(value) ? euros.format(value) : eurosCents.format(value);
}

/** « 13 novembre 2026 » ; le premier du mois s'écrit « 1er décembre 2026 ». */
export function formatDate(date) {
  const text = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(date));
  return text.replace(/^1(?=\s)/, '1er');
}
