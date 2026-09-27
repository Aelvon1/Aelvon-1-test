/**
 * Générateur `label` : étiquettes, affiches, fiches et marquages imprimés (couleur sRGB + alpha
 * = forme découpée ou encre). Rastérisé sur OffscreenCanvas dans le worker (non testable sous
 * Node). MARQUES INVENTÉES UNIQUEMENT : les textes par défaut sont fictifs.
 * Orientation : image à l'endroit sur des UV standard (haut de l'étiquette en v = 1).
 *
 * Styles :
 * - `label`   : étiquette produit (bandeau d'accent, titre, lignes techniques, code-barres) ;
 * - `poster`  : affiche d'atelier (grand titre, pictogramme, lignes centrées) ;
 * - `tag`     : étiquette à œillet (trou transparent), écriture façon marqueur ;
 * - `warning` : panneau d'avertissement (bord hachuré jaune/noir, triangle) ;
 * - `box`     : impression d'encre sur carton (fond transparent, encre érodée) ;
 * - `plate`   : plaquette d'identification (une ligne de titre pleine hauteur, sous-titre fin).
 *
 * Paramètres : { style?, title?, subtitle?, lines?: string[], paper?: '#efe6cf', ink?: '#1f1d1a',
 * accent?: '#b35a2a', border?: true, barcode?: boolean, pictogram?: 'gear' | 'bolt' | 'drop' |
 * 'none', stamp?: { text, color?, angle? } | null, aging?: 0.35 (jaunissement, taches, usure) }.
 */
import type { Generator } from './types';
import { fbmField, flipRowsRGBA, num, raw, rng, str } from './field';

type Style = 'label' | 'poster' | 'tag' | 'warning' | 'box' | 'plate';
type Pictogram = 'gear' | 'bolt' | 'drop' | 'none';
type Ctx = OffscreenCanvasRenderingContext2D;

interface Stamp {
  text: string;
  color: string;
  angle: number;
}

function readLines(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function readStamp(value: unknown): Stamp | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.text !== 'string') return null;
  return {
    text: v.text,
    color: typeof v.color === 'string' ? v.color : '#a3261d',
    angle: typeof v.angle === 'number' ? v.angle : -0.18,
  };
}

export const label: Generator = ({ width, height, params, seed }) => {
  const styleName = str(params, 'style', 'label');
  const style: Style =
    styleName === 'poster' ||
    styleName === 'tag' ||
    styleName === 'warning' ||
    styleName === 'box' ||
    styleName === 'plate'
      ? styleName
      : 'label';
  const title = str(params, 'title', style === 'warning' ? 'ATTENTION' : 'FERRAVOX');
  const subtitle = str(params, 'subtitle', style === 'warning' ? 'Haute tension' : 'Outillage de précision');
  const lines = readLines(raw(params, 'lines'));
  const paper = str(params, 'paper', style === 'warning' ? '#e8c22a' : '#efe6cf');
  const ink = str(params, 'ink', '#1f1d1a');
  const accent = str(params, 'accent', '#b35a2a');
  const border = raw(params, 'border') !== false;
  const barcode = raw(params, 'barcode') === true;
  const pictoName = str(params, 'pictogram', style === 'poster' ? 'gear' : 'none');
  const pictogram: Pictogram =
    pictoName === 'gear' || pictoName === 'bolt' || pictoName === 'drop' ? pictoName : 'none';
  const stamp = readStamp(raw(params, 'stamp'));
  const aging = Math.min(1, Math.max(0, num(params, 'aging', 0.35)));
  const rand = rng(seed, 43);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as Ctx | null;
  if (!ctx) throw new Error('OffscreenCanvas 2D indisponible dans ce navigateur.');
  const u = Math.min(width, height) / 100; // unité de mise en page
  const pad = u * 6;

  // Fond / forme.
  if (style !== 'box') {
    ctx.fillStyle = paper;
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, style === 'tag' ? u * 8 : u * 1.5);
    ctx.fill();
  }

  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.textBaseline = 'alphabetic';

  switch (style) {
    case 'warning': {
      hazardBorder(ctx, width, height, u * 7);
      triangle(ctx, width / 2, height * 0.36, Math.min(width, height) * 0.22, ink);
      fitText(ctx, title, width / 2, height * 0.7, width - pad * 3, u * 13, `bold`, 'sans-serif', 'center');
      fitText(ctx, subtitle, width / 2, height * 0.82, width - pad * 3, u * 7, '', 'sans-serif', 'center');
      break;
    }
    case 'poster': {
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, width, height * 0.22);
      ctx.fillStyle = paper;
      fitText(ctx, title, width / 2, height * 0.15, width - pad * 2, u * 14, 'bold', 'sans-serif', 'center');
      ctx.fillStyle = ink;
      fitText(ctx, subtitle, width / 2, height * 0.31, width - pad * 2, u * 6.5, 'italic', 'serif', 'center');
      if (pictogram !== 'none')
        drawPictogram(ctx, pictogram, width / 2, height * 0.5, Math.min(width, height) * 0.14, ink);
      let y = height * 0.7;
      for (const line of lines) {
        fitText(ctx, line, width / 2, y, width - pad * 2, u * 5, '', 'sans-serif', 'center');
        y += u * 7;
      }
      break;
    }
    case 'tag': {
      // Œillet : trou transparent + renfort.
      const hx = pad * 1.2;
      const hy = height / 2;
      ctx.strokeStyle = accent;
      ctx.lineWidth = u * 2;
      ctx.beginPath();
      ctx.arc(hx, hy, u * 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(hx, hy, u * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = ink;
      const left = hx + u * 12;
      fitText(
        ctx,
        title,
        left,
        height * 0.38,
        width - left - pad,
        u * 14,
        'bold',
        'cursive, sans-serif',
        'left',
      );
      let y = height * 0.62;
      for (const line of [subtitle, ...lines]) {
        fitText(ctx, line, left, y, width - left - pad, u * 8, '', 'cursive, sans-serif', 'left');
        y += u * 11;
      }
      break;
    }
    case 'plate': {
      const band = Math.max(2, height * 0.08);
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, band, height);
      ctx.fillStyle = ink;
      const hasSub = subtitle.length > 0;
      fitText(
        ctx,
        title,
        (width + band) / 2,
        height * (hasSub ? 0.56 : 0.68),
        width - band - height * 0.3,
        height * (hasSub ? 0.46 : 0.56),
        'bold',
        'monospace',
        'center',
      );
      if (hasSub)
        fitText(
          ctx,
          subtitle,
          (width + band) / 2,
          height * 0.86,
          width - band - height * 0.3,
          height * 0.2,
          '',
          'sans-serif',
          'center',
        );
      break;
    }
    case 'box': {
      fitText(ctx, title, width / 2, height * 0.4, width - pad * 2, u * 22, 'bold', 'sans-serif', 'center');
      fitText(ctx, subtitle, width / 2, height * 0.6, width - pad * 2, u * 9, '', 'sans-serif', 'center');
      let y = height * 0.75;
      for (const line of lines) {
        fitText(ctx, line, width / 2, y, width - pad * 2, u * 7, '', 'monospace', 'center');
        y += u * 9;
      }
      if (pictogram !== 'none') drawPictogram(ctx, pictogram, width - pad * 2, pad * 2, u * 7, ink);
      break;
    }
    default: {
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, u * 4, height);
      ctx.fillStyle = ink;
      const left = pad + u * 3;
      fitText(ctx, title, left, pad + u * 12, width - left - pad, u * 16, 'bold', 'sans-serif', 'left');
      fitText(ctx, subtitle, left, pad + u * 21, width - left - pad, u * 6.5, 'italic', 'serif', 'left');
      ctx.fillRect(left, pad + u * 25, width - left - pad, Math.max(1, u * 0.5));
      let y = pad + u * 33;
      for (const line of lines) {
        fitText(ctx, line, left, y, width - left - pad, u * 6, '', 'monospace', 'left');
        y += u * 8;
      }
      if (barcode) drawBarcode(ctx, width - pad - u * 30, height - pad - u * 12, u * 30, u * 12, rand, ink);
      if (pictogram !== 'none')
        drawPictogram(ctx, pictogram, width - pad - u * 8, pad + u * 8, u * 7, accent);
      break;
    }
  }

  if (border && style !== 'box' && style !== 'warning') {
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(1, u * 0.6);
    ctx.beginPath();
    ctx.roundRect(u * 2.5, u * 2.5, width - u * 5, height - u * 5, u);
    ctx.stroke();
  }

  if (stamp) {
    // Calque séparé : les manques d'encre ne doivent pas trouer le papier.
    const layer = new OffscreenCanvas(width, height);
    const lctx = layer.getContext('2d') as Ctx | null;
    if (lctx) {
      drawStamp(lctx, stamp, width * 0.68, height * 0.7, Math.min(width, height) * 0.16, u);
      ctx.drawImage(layer, 0, 0);
    }
  }

  // Vieillissement et impression imparfaite (données brutes).
  const image = ctx.getImageData(0, 0, width, height);
  const d = image.data;
  const stains = fbmField(width, height, { scale: 3, octaves: 5, seed });
  const erosion = fbmField(width, height, { scale: 48, octaves: 3, seed: seed + 1 });
  const inkR = parseInt(ink.slice(1, 3), 16) || 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const o = i * 4;
      if (style === 'box') {
        // Encre sur carton : alpha érodé (report d'impression irrégulier).
        const e = erosion[i]!;
        d[o + 3] = d[o + 3]! * Math.min(1, Math.max(0, (e - 0.25) * 2.2)) * (0.85 - aging * 0.3);
        continue;
      }
      if (d[o + 3] === 0) continue;
      const s = stains[i]!;
      // Jaunissement irrégulier + bords plus sombres.
      const edge = Math.min(x, y, width - 1 - x, height - 1 - y) / (u * 4);
      const edgeDark = edge < 1 ? (1 - edge) * 0.25 * aging : 0;
      const yellow = aging * (0.12 + Math.max(0, s - 0.45) * 0.6);
      const isInk = Math.abs(d[o]! - inkR) < 24 && d[o]! < 110;
      const fade = isInk ? aging * Math.max(0, erosion[i]! - 0.55) * 1.6 : 0;
      d[o] = mixChannel(d[o]!, 238, fade) * (1 - edgeDark) * (1 - yellow * 0.08);
      d[o + 1] = mixChannel(d[o + 1]!, 230, fade) * (1 - edgeDark) * (1 - yellow * 0.2);
      d[o + 2] = mixChannel(d[o + 2]!, 205, fade) * (1 - edgeDark) * (1 - yellow * 0.55);
    }
  }
  // Image à l'endroit sur des UV standard (v vers le haut).
  return flipRowsRGBA(image.data, width, height);
};

const mixChannel = (a: number, b: number, t: number): number => a + (b - a) * Math.min(1, t);

/** Texte ajusté à une largeur maximale (réduction de la taille si nécessaire). */
function fitText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  weight: string,
  family: string,
  align: 'left' | 'center' | 'right',
): void {
  if (!text) return;
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`.trim();
  const measured = ctx.measureText(text).width;
  if (measured > maxWidth && measured > 0) {
    s = Math.max(4, (s * maxWidth) / measured);
    ctx.font = `${weight} ${s}px ${family}`.trim();
  }
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
}

function hazardBorder(ctx: Ctx, width: number, height: number, band: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.rect(band, band, width - band * 2, height - band * 2);
  ctx.clip('evenodd');
  ctx.fillStyle = '#1b1a18';
  const step = band * 1.4;
  for (let k = -height; k < width + height; k += step * 2) {
    ctx.beginPath();
    ctx.moveTo(k, 0);
    ctx.lineTo(k + step, 0);
    ctx.lineTo(k + step - height, height);
    ctx.lineTo(k - height, height);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function triangle(ctx: Ctx, cx: number, cy: number, r: number, ink: string): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = r * 0.14;
  ctx.strokeStyle = ink;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r * 1.1, cy + r * 0.8);
  ctx.lineTo(cx - r * 1.1, cy + r * 0.8);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.fillRect(cx - r * 0.07, cy - r * 0.45, r * 0.14, r * 0.75);
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.52, r * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPictogram(ctx: Ctx, kind: Pictogram, cx: number, cy: number, r: number, color: string): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  if (kind === 'gear') {
    const teeth = 10;
    ctx.beginPath();
    for (let k = 0; k < teeth * 2; k++) {
      const a0 = (k / (teeth * 2)) * Math.PI * 2;
      const a1 = ((k + 1) / (teeth * 2)) * Math.PI * 2;
      const rr = k % 2 === 0 ? r : r * 0.8;
      ctx.lineTo(cx + Math.cos(a0) * rr, cy + Math.sin(a0) * rr);
      ctx.lineTo(cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr);
    }
    ctx.closePath();
    ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
  } else if (kind === 'bolt') {
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.2, cy - r);
    ctx.lineTo(cx - r * 0.55, cy + r * 0.12);
    ctx.lineTo(cx - r * 0.02, cy + r * 0.12);
    ctx.lineTo(cx - r * 0.25, cy + r);
    ctx.lineTo(cx + r * 0.55, cy - r * 0.2);
    ctx.lineTo(cx + r * 0.02, cy - r * 0.2);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'drop') {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.bezierCurveTo(cx + r * 0.2, cy - r * 0.4, cx + r * 0.75, cy, cx + r * 0.75, cy + r * 0.3);
    ctx.arc(cx, cy + r * 0.3, r * 0.75, 0, Math.PI);
    ctx.bezierCurveTo(cx - r * 0.75, cy, cx - r * 0.2, cy - r * 0.4, cx, cy - r);
    ctx.fill();
  }
  ctx.restore();
}

function drawBarcode(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  rand: () => number,
  ink: string,
): void {
  ctx.save();
  ctx.fillStyle = ink;
  let cx = x;
  while (cx < x + w) {
    const bar = (1 + Math.floor(rand() * 3)) * (w / 90);
    if (rand() < 0.55) ctx.fillRect(cx, y, bar, h * 0.82);
    cx += bar + (1 + Math.floor(rand() * 2)) * (w / 110);
  }
  ctx.font = `${h * 0.16}px monospace`;
  ctx.textAlign = 'left';
  let digits = '';
  for (let k = 0; k < 12; k++) digits += Math.floor(rand() * 10).toString();
  ctx.fillText(digits, x, y + h);
  ctx.restore();
}

function drawStamp(ctx: Ctx, stamp: Stamp, cx: number, cy: number, r: number, u: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(stamp.angle);
  ctx.globalAlpha = 0.78;
  ctx.strokeStyle = stamp.color;
  ctx.fillStyle = stamp.color;
  ctx.lineWidth = u * 1.2;
  ctx.beginPath();
  ctx.roundRect(-r * 1.4, -r * 0.5, r * 2.8, r, u * 1.5);
  ctx.stroke();
  ctx.lineWidth = u * 0.5;
  ctx.beginPath();
  ctx.roundRect(-r * 1.3, -r * 0.4, r * 2.6, r * 0.8, u);
  ctx.stroke();
  fitText(ctx, stamp.text.toUpperCase(), 0, r * 0.18, r * 2.4, r * 0.48, 'bold', 'monospace', 'center');
  // Tampon irrégulier : quelques manques d'encre.
  ctx.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 40; k++) {
    const a = (k * 2.399) % (Math.PI * 2);
    const rr = ((k * 7919) % 97) / 97;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 1.3 * rr, Math.sin(a) * r * 0.45 * rr, u * (0.3 + rr * 0.8), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
