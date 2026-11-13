import { useId } from 'react';
import { cn } from '../ui';

const tint = (hex, amount, toward) => `color-mix(in srgb, ${hex} ${100 - amount}%, ${toward})`;
const lighten = (hex, amount) => tint(hex, amount, '#ffffff');
const darken = (hex, amount) => tint(hex, amount, '#000000');

// Grain du cuir : un bruit fractal (SVG en ligne) dont les creux assombrissent la teinte.
const GRAIN = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='80'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.62' numOctaves='2' seed='7'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.5 -0.42'/></filter><rect width='100%' height='100%' filter='url(#g)'/></svg>",
)}")`;

// Chaque finition, rendue dans la teinte du cuir choisi : un reflet pour le lisse, un grain serré
// pour le grainé, un aplat sans reflet pour le mat.
const FINISH_BACKGROUNDS = {
  lisse: (hex) =>
    `linear-gradient(112deg, ${darken(hex, 12)} 0%, ${hex} 30%, ${lighten(hex, 26)} 47%, ${hex} 62%, ${darken(hex, 22)} 100%)`,
  graine: (hex) => `${GRAIN}, linear-gradient(112deg, ${lighten(hex, 10)}, ${darken(hex, 10)})`,
  mat: (hex) => tint(hex, 14, '#8d867c'),
};

/**
 * Échantillon de finition, dans la teinte du cuir en cours.
 * @param {{ finish: string, hex: string, className?: string }} props  finish : id de FINISHES
 */
export function FinishSample({ finish, hex, className }) {
  const background = (FINISH_BACKGROUNDS[finish] ?? FINISH_BACKGROUNDS.lisse)(hex);
  return (
    <span
      aria-hidden="true"
      className={cn('block shadow-[inset_0_0_0_1px_rgb(23_20_18/0.14)]', className)}
      style={{ background }}
    />
  );
}

/**
 * Petite boucle dessinée dans la teinte du métal.
 * @param {{ hex: string, className?: string }} props
 */
export function BuckleGlyph({ hex, className }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <svg viewBox="0 0 48 36" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style={{ stopColor: lighten(hex, 46) }} />
          <stop offset="46%" style={{ stopColor: hex }} />
          <stop offset="100%" style={{ stopColor: darken(hex, 38) }} />
        </linearGradient>
      </defs>
      {/* ombre portée et cerne : les aciers clairs restent lisibles sur l'ivoire */}
      <rect x="8.8" y="7.4" width="31" height="24" rx="4" fill="none" stroke="#171412" strokeOpacity="0.16" strokeWidth="4.4" />
      <rect x="8" y="6" width="31" height="24" rx="4" fill="none" stroke="#171412" strokeOpacity="0.42" strokeWidth="5.6" />
      <rect x="8" y="6" width="31" height="24" rx="4" fill="none" stroke={`url(#${id}-metal)`} strokeWidth="4.4" />
      <rect x="8" y="6" width="31" height="24" rx="4" fill="none" strokeWidth="0.7" strokeOpacity="0.7" style={{ stroke: lighten(hex, 64) }} />
      {/* ardillon */}
      <path d="M8 18H42" stroke="#171412" strokeOpacity="0.42" strokeWidth="3.6" strokeLinecap="round" />
      <path d="M8 18H42" strokeWidth="2.4" strokeLinecap="round" style={{ stroke: hex }} />
      <path d="M9 17.4H41" strokeWidth="0.6" strokeLinecap="round" strokeOpacity="0.7" style={{ stroke: lighten(hex, 64) }} />
    </svg>
  );
}

/**
 * Échantillon de couture : un morceau de lanière dans le cuir en cours, piqué du fil proposé.
 * Ton sur ton : le fil reprend la teinte du cuir, éclaircie. Bords francs : aucun fil, la tranche seule.
 * @param {{ leatherHex: string, stitchHex: string|null|false, className?: string }} props
 *   stitchHex : couleur du fil · null = ton sur ton · false = sans couture
 */
export function StitchSample({ leatherHex, stitchHex, className }) {
  const thread = stitchHex === false ? null : (stitchHex ?? lighten(leatherHex, 30));
  return (
    <svg viewBox="0 0 60 30" className={className} aria-hidden="true" focusable="false">
      <rect x="0.5" y="0.5" width="59" height="29" rx="2.5" stroke="#171412" strokeOpacity="0.18" style={{ fill: leatherHex }} />
      {/* reflet de la fleur */}
      <rect x="1" y="1" width="58" height="11" rx="2" fill="#ffffff" fillOpacity="0.07" />
      {thread ? (
        [7, 23].map((y) => (
          <g key={y} fill="none" strokeLinecap="round" strokeDasharray="3.6 2.6">
            {/* relief du point : un fil de la teinte du cuir reste perceptible */}
            <path d={`M5 ${y + 0.7}H55`} stroke="#000000" strokeOpacity="0.35" strokeWidth="1.3" />
            <path d={`M5 ${y}H55`} strokeWidth="1.3" style={{ stroke: thread }} />
          </g>
        ))
      ) : (
        <g fill="none" strokeWidth="1.4" style={{ stroke: darken(leatherHex, 45) }}>
          <path d="M3 1.2H57" />
          <path d="M3 28.8H57" />
        </g>
      )}
    </svg>
  );
}
