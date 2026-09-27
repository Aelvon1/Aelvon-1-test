/**
 * Rastérisation de listes d'opérations de dessin (`DrawOp`) sur un OffscreenCanvas 2D, et
 * générateurs dérivés : `drawlist` (calque RGBA), `channels` (4 canaux de données
 * indépendants) et `normalFromHeight` (carte de normales).
 */
import type { ChannelSource, ChannelsParams, DrawListParams, DrawOp, NormalFromHeightParams } from '../types';
import type { Generator } from './types';
import { blurChannel } from './blur';
import { mulberry32 } from './random';

type Ctx2D = OffscreenCanvasRenderingContext2D;

/** Crée un contexte 2D dont le repère utilisateur correspond au `viewBox`. */
function createContext(
  width: number,
  height: number,
  viewBox?: readonly [number, number, number, number],
): {
  canvas: OffscreenCanvas;
  ctx: Ctx2D;
  pxPerUnit: number;
} {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as Ctx2D | null;
  if (!ctx) throw new Error('OffscreenCanvas 2D indisponible dans ce navigateur.');
  let pxPerUnit = 1;
  if (viewBox) {
    const [x, y, w, h] = viewBox;
    const sx = width / w;
    const sy = height / h;
    pxPerUnit = (sx + sy) / 2;
    ctx.setTransform(sx, 0, 0, sy, -x * sx, -y * sy);
  }
  return { canvas, ctx, pxPerUnit };
}

/** Exécute les opérations sur `ctx` (repère utilisateur déjà en place). */
export function runOps(
  ctx: Ctx2D,
  ops: readonly DrawOp[],
  width: number,
  height: number,
  seed: number,
  pxPerUnit: number,
): void {
  for (const op of ops) {
    switch (op.op) {
      case 'fill': {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = op.color;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
        break;
      }
      case 'clear': {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.restore();
        break;
      }
      case 'rect': {
        ctx.beginPath();
        if (op.radius && op.radius > 0) ctx.roundRect(op.x, op.y, op.w, op.h, op.radius);
        else ctx.rect(op.x, op.y, op.w, op.h);
        paint(ctx, op.fill, op.stroke, op.lineWidth);
        break;
      }
      case 'circle': {
        ctx.beginPath();
        ctx.arc(op.x, op.y, op.r, 0, Math.PI * 2);
        paint(ctx, op.fill, op.stroke, op.lineWidth);
        break;
      }
      case 'path': {
        const path = new Path2D(op.d);
        if (op.lineCap) ctx.lineCap = op.lineCap;
        if (op.lineJoin) ctx.lineJoin = op.lineJoin;
        if (op.fill) {
          ctx.fillStyle = op.fill;
          ctx.fill(path, op.fillRule ?? 'nonzero');
        }
        if (op.stroke) {
          ctx.strokeStyle = op.stroke;
          ctx.lineWidth = op.lineWidth ?? 1;
          ctx.stroke(path);
        }
        break;
      }
      case 'polyline': {
        const p = op.points;
        if (p.length < 4) break;
        ctx.beginPath();
        ctx.moveTo(p[0]!, p[1]!);
        for (let i = 2; i + 1 < p.length; i += 2) ctx.lineTo(p[i]!, p[i + 1]!);
        if (op.closed) ctx.closePath();
        if (op.lineCap) ctx.lineCap = op.lineCap;
        if (op.lineJoin) ctx.lineJoin = op.lineJoin;
        paint(ctx, op.fill, op.stroke, op.lineWidth);
        break;
      }
      case 'text': {
        ctx.save();
        ctx.translate(op.x, op.y);
        if (op.rotate) ctx.rotate(op.rotate);
        ctx.font = op.font;
        ctx.textAlign = op.align ?? 'left';
        ctx.textBaseline = op.baseline ?? 'alphabetic';
        if (op.letterSpacing !== undefined && 'letterSpacing' in ctx) {
          (ctx as unknown as { letterSpacing: string }).letterSpacing = `${op.letterSpacing}px`;
        }
        if (op.stroke) {
          ctx.strokeStyle = op.stroke;
          ctx.lineWidth = op.lineWidth ?? 1;
          ctx.strokeText(op.text, 0, 0);
        }
        if (op.fill ?? !op.stroke) {
          ctx.fillStyle = op.fill ?? '#fff';
          ctx.fillText(op.text, 0, 0);
        }
        ctx.restore();
        break;
      }
      case 'save':
        ctx.save();
        break;
      case 'restore':
        ctx.restore();
        break;
      case 'transform':
        ctx.transform(op.a, op.b, op.c, op.d, op.e, op.f);
        break;
      case 'alpha':
        ctx.globalAlpha = op.value;
        break;
      case 'composite':
        ctx.globalCompositeOperation = op.mode as GlobalCompositeOperation;
        break;
      case 'blur':
        blurCanvas(ctx, width, height, op.radius);
        break;
      case 'noise':
        addNoise(ctx, width, height, op.amount, op.seed ?? seed, op.mono ?? true);
        break;
    }
  }
  void pxPerUnit;
}

function paint(ctx: Ctx2D, fill?: string, stroke?: string, lineWidth?: number): void {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth ?? 1;
    ctx.stroke();
  }
}

/** Flou (JS, déterministe) de tous les canaux du calque. */
function blurCanvas(ctx: Ctx2D, width: number, height: number, radius: number): void {
  const image = ctx.getImageData(0, 0, width, height);
  const d = image.data;
  const channel = new Float32Array(width * height);
  for (let c = 0; c < 4; c++) {
    for (let i = 0; i < channel.length; i++) channel[i] = d[i * 4 + c]!;
    blurChannel(channel, width, height, radius);
    for (let i = 0; i < channel.length; i++) d[i * 4 + c] = channel[i]!;
  }
  ctx.putImageData(image, 0, 0);
}

function addNoise(
  ctx: Ctx2D,
  width: number,
  height: number,
  amount: number,
  seed: number,
  mono: boolean,
): void {
  const image = ctx.getImageData(0, 0, width, height);
  const d = image.data;
  const rand = mulberry32(seed);
  const a = amount * 255;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * a;
    d[i] = d[i]! + n;
    d[i + 1] = d[i + 1]! + (mono ? n : (rand() - 0.5) * a);
    d[i + 2] = d[i + 2]! + (mono ? n : (rand() - 0.5) * a);
  }
  ctx.putImageData(image, 0, 0);
}

/** Rastérise une liste d'opérations en RGBA. */
export const drawlist: Generator<DrawListParams> = ({ width, height, params, seed }) => {
  const { ctx, pxPerUnit } = createContext(width, height, params.viewBox);
  if (params.background)
    runOps(ctx, [{ op: 'fill', color: params.background }], width, height, seed, pxPerUnit);
  runOps(ctx, params.ops, width, height, seed, pxPerUnit);
  // getImageData renvoie des valeurs non prémultipliées.
  return ctx.getImageData(0, 0, width, height).data;
};

/** Rastérise une source de canal en niveaux de gris (Float32 0..255). */
function renderChannel(
  source: ChannelSource,
  width: number,
  height: number,
  viewBox: readonly [number, number, number, number] | undefined,
  seed: number,
  resolved: Partial<Record<'r' | 'g' | 'b' | 'a', Float32Array>>,
): Float32Array {
  if ('constant' in source) return new Float32Array(width * height).fill(Math.round(source.constant * 255));
  if ('from' in source) {
    const base = resolved[source.from];
    if (!base) throw new Error(`Canal source « ${source.from} » non encore calculé (ordre r, g, b, a).`);
    const copy = new Float32Array(base);
    if (source.blur) blurChannel(copy, width, height, source.blur);
    if (source.invert) for (let i = 0; i < copy.length; i++) copy[i] = 255 - copy[i]!;
    return copy;
  }
  const { ctx, pxPerUnit } = createContext(width, height, viewBox);
  runOps(ctx, [{ op: 'fill', color: source.background ?? '#000' }], width, height, seed, pxPerUnit);
  runOps(ctx, source.ops, width, height, seed, pxPerUnit);
  const data = ctx.getImageData(0, 0, width, height).data;
  const out = new Float32Array(width * height);
  // Luminance (dessins en niveaux de gris attendus ; le rouge suffit).
  for (let i = 0; i < out.length; i++) out[i] = data[i * 4]!;
  return out;
}

/** Quatre canaux de données indépendants. */
export const channels: Generator<ChannelsParams> = ({ width, height, params, seed }) => {
  const resolved: Partial<Record<'r' | 'g' | 'b' | 'a', Float32Array>> = {};
  const order = ['r', 'g', 'b', 'a'] as const;
  for (const key of order) {
    const source = params[key];
    resolved[key] = source ? renderChannel(source, width, height, params.viewBox, seed, resolved) : undefined;
  }
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    out[i * 4] = resolved.r ? resolved.r[i]! : 0;
    out[i * 4 + 1] = resolved.g ? resolved.g[i]! : 0;
    out[i * 4 + 2] = resolved.b ? resolved.b[i]! : 0;
    out[i * 4 + 3] = resolved.a ? resolved.a[i]! : 255;
  }
  return out;
};

/** Carte de normales (espace tangent, OpenGL : Y vers le haut) depuis une hauteur dessinée. */
export const normalFromHeight: Generator<NormalFromHeightParams> = ({ width, height, params, seed }) => {
  const h = renderChannel(params.height, width, height, params.viewBox, seed, {});
  const out = new Uint8ClampedArray(width * height * 4);
  const s = params.strength / 255;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const l = h[y * width + ((x - 1 + width) % width)]!;
      const r = h[y * width + ((x + 1) % width)]!;
      const u = h[((y - 1 + height) % height) * width + x]!;
      const d = h[((y + 1) % height) * width + x]!;
      // Canvas : y vers le bas ; on inverse pour une normale « OpenGL ».
      let nx = (l - r) * s;
      let ny = (d - u) * s;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * width + x) * 4;
      out[i] = (nx * 0.5 + 0.5) * 255;
      out[i + 1] = (ny * 0.5 + 0.5) * 255;
      out[i + 2] = (nz * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
};
