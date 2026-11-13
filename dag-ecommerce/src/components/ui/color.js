// Petites opérations sur des couleurs hexadécimales (#rrggbb).

function parseHex(hex) {
  const value = String(hex ?? '').replace('#', '');
  const full = value.length === 3 ? [...value].map((c) => c + c).join('') : value.padEnd(6, '0').slice(0, 6);
  const number = Number.parseInt(full, 16) || 0;
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}

/** Mélange deux couleurs : amount = 0 → a, 1 → b. */
export function mix(a, b, amount) {
  const from = parseHex(a);
  const to = parseHex(b);
  const t = Math.min(1, Math.max(0, amount));
  return `#${from
    .map((channel, index) => Math.round(channel + (to[index] - channel) * t).toString(16).padStart(2, '0'))
    .join('')}`;
}

export const lighten = (hex, amount) => mix(hex, '#ffffff', amount);
export const darken = (hex, amount) => mix(hex, '#000000', amount);

/** Luminance perçue, de 0 (noir) à 1 (blanc). */
export function luminance(hex) {
  const [r, g, b] = parseHex(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
