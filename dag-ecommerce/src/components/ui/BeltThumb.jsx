import { useId } from 'react';
import { resolveBeltConfig } from '../../data/atelier';
import { darken, lighten, luminance, mix } from './color';

const CX = 100;
const CY = 100;
const RX = 62;
const RY = 24;

/** Ordonnée d'un point de la paroi avant, à l'abscisse x, pour une ellipse centrée en cy. */
const frontY = (x, cy) => cy + RY * Math.sqrt(Math.max(0, 1 - ((x - CX) / RX) ** 2));

/**
 * Dessin d'une ceinture roulée, coloré d'après une configuration (cuir, envers, boucle, couture).
 * Sert de repli quand un visuel manque et de vignette pour les créations de l'Atelier.
 * @param {{ belt?: Partial<import('../../data/atelier').BeltConfig>, title?: string, className?: string }} props
 *   title : nom accessible ; sans titre le dessin est décoratif (aria-hidden)
 */
export default function BeltThumb({ belt, title, className, ...rest }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const config = resolveBeltConfig(belt);
  const { leatherHex, liningHex, buckleHex, stitchHex, widthMm } = config;

  // un cuir très sombre reçoit des reflets un peu plus marqués pour garder du relief
  const dark = luminance(leatherHex) < 0.14;
  const h = Math.round(widthMm * 1.15);
  const top = CY - h / 2;
  const bottom = CY + h / 2;
  const mid = (x) => frontY(x, CY);

  const wall = `M${CX - RX} ${top}V${bottom}A${RX} ${RY} 0 0 0 ${CX + RX} ${bottom}V${top}A${RX} ${RY} 0 0 1 ${CX - RX} ${top}Z`;
  const frontArc = (cy, inset = 0) => `M${CX - RX + inset} ${frontY(CX - RX + inset, cy)}A${RX} ${RY} 0 0 0 ${CX + RX - inset} ${frontY(CX + RX - inset, cy)}`;

  const stitch = stitchHex === false ? null : (stitchHex ?? lighten(leatherHex, dark ? 0.3 : 0.24));
  const edge = mix(leatherHex, '#000000', 0.18);
  const rim = lighten(leatherHex, dark ? 0.34 : 0.26);
  const coils = [0.84, 0.69, 0.55, 0.42, 0.3];

  const buckleW = 30;
  const buckleX = CX - 9;
  const buckleMid = mid(buckleX + buckleW / 2);
  const buckleTop = buckleMid - h / 2 - 4;
  const buckleH = h + 8;
  const holes = [136, 146, 155];

  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...rest}
    >
      <defs>
        <radialGradient id={`${uid}-ombre`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#1a1410" stopOpacity="0.34" />
          <stop offset="65%" stopColor="#1a1410" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#1a1410" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-cuir`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={darken(leatherHex, 0.42)} />
          <stop offset="20%" stopColor={leatherHex} />
          <stop offset="40%" stopColor={lighten(leatherHex, dark ? 0.16 : 0.1)} />
          <stop offset="66%" stopColor={leatherHex} />
          <stop offset="100%" stopColor={darken(leatherHex, 0.5)} />
        </linearGradient>
        <radialGradient id={`${uid}-coeur`} cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor={darken(liningHex, 0.62)} />
          <stop offset="100%" stopColor={darken(liningHex, dark ? 0.12 : 0.3)} />
        </radialGradient>
        <linearGradient id={`${uid}-metal`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={lighten(buckleHex, 0.38)} />
          <stop offset="48%" stopColor={buckleHex} />
          <stop offset="100%" stopColor={darken(buckleHex, 0.34)} />
        </linearGradient>
      </defs>

      {/* ombre portée */}
      <ellipse cx={CX} cy={bottom + RY - 2} rx={RX + 16} ry={12} fill={`url(#${uid}-ombre)`} />

      {/* paroi extérieure */}
      <path d={wall} fill={`url(#${uid}-cuir)`} />

      {/* dessus du rouleau : envers visible et tranches des spires */}
      <ellipse cx={CX} cy={top} rx={RX} ry={RY} fill={edge} />
      <ellipse cx={CX} cy={top + 0.6} rx={RX - 3.2} ry={RY - 1.6} fill={`url(#${uid}-coeur)`} />
      {coils.map((scale) => (
        <ellipse
          key={scale}
          cx={CX}
          cy={top + (1 - scale) * 2.2}
          rx={RX * scale}
          ry={RY * scale}
          fill="none"
          stroke={mix(leatherHex, '#ffffff', dark ? 0.2 : 0.08)}
          strokeWidth={2.4}
          opacity={0.5 + scale * 0.5}
        />
      ))}
      <ellipse cx={CX} cy={top + 1.6} rx={RX * 0.2} ry={RY * 0.2} fill={darken(liningHex, 0.72)} />

      {/* arête éclairée */}
      <path d={frontArc(top)} fill="none" stroke={rim} strokeWidth={1} opacity={0.75} />

      {/* coutures */}
      {stitch ? (
        <g fill="none" stroke={stitch} strokeWidth={0.9} strokeDasharray="3.2 2.4" strokeLinecap="round" opacity={0.9}>
          <path d={frontArc(top + 5.5, 1.5)} />
          <path d={frontArc(bottom - 5.5, 1.5)} />
        </g>
      ) : null}

      {/* crans */}
      {holes.map((x) => (
        <ellipse key={x} cx={x} cy={mid(x)} rx={1.5} ry={1.7} fill={darken(leatherHex, 0.6)} stroke={rim} strokeWidth={0.4} strokeOpacity={0.5} />
      ))}

      {/* boucle : cadre et ardillon */}
      <rect x={buckleX + 1.5} y={buckleTop + 2.5} width={buckleW} height={buckleH} rx={3} fill="none" stroke="#000000" strokeOpacity={0.28} strokeWidth={4.6} />
      <rect x={buckleX} y={buckleTop} width={buckleW} height={buckleH} rx={3} fill="none" stroke={`url(#${uid}-metal)`} strokeWidth={4.6} />
      <rect x={buckleX} y={buckleTop} width={buckleW} height={buckleH} rx={3} fill="none" stroke={lighten(buckleHex, 0.55)} strokeWidth={0.7} strokeOpacity={0.55} />
      <path d={`M${buckleX - 1} ${buckleMid + 1}H${buckleX + buckleW + 3}`} stroke="#000000" strokeOpacity={0.25} strokeWidth={3.2} strokeLinecap="round" />
      <path d={`M${buckleX - 1} ${buckleMid}H${buckleX + buckleW + 3}`} stroke={buckleHex} strokeWidth={3.2} strokeLinecap="round" />
      <path d={`M${buckleX} ${buckleMid - 1}H${buckleX + buckleW + 2}`} stroke={lighten(buckleHex, 0.6)} strokeWidth={0.6} strokeLinecap="round" strokeOpacity={0.6} />
    </svg>
  );
}
