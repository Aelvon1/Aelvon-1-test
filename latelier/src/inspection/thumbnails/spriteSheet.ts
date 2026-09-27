/**
 * Planche de sprites des miniatures d'inventaire (fonctions pures, testées sous Node) :
 * disposition des vues, angles du tour complet et réduction 2×2 (suréchantillonnage : les
 * rendus de miniatures n'ont pas d'anticrénelage matériel).
 */

export interface SheetLayout {
  frames: number;
  columns: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
  width: number;
  height: number;
}

/** Disposition en grille la plus « carrée » possible (colonnes ≥ lignes). */
export function sheetLayout(frames: number, frameWidth: number, frameHeight: number): SheetLayout {
  const columns = Math.max(1, Math.ceil(Math.sqrt(frames * (frameHeight / frameWidth) * 1.5)));
  const rows = Math.ceil(frames / columns);
  return { frames, columns, rows, frameWidth, frameHeight, width: columns * frameWidth, height: rows * frameHeight };
}

/** Origine (px) de la vue `index` dans la planche. */
export function frameOrigin(layout: SheetLayout, index: number): { x: number; y: number } {
  return {
    x: (index % layout.columns) * layout.frameWidth,
    y: Math.floor(index / layout.columns) * layout.frameHeight,
  };
}

/** Azimut (rad) de la vue `index` d'un tour complet de `frames` vues, depuis `start`. */
export function turntableAzimuth(index: number, frames: number, start: number): number {
  return start + (index / frames) * Math.PI * 2;
}

/**
 * Réduit une image RGBA 8 bits de moitié (moyenne 2×2 pondérée par l'alpha : pas de liseré
 * sombre au bord de l'objet sur fond transparent) et l'écrit dans `dst` (largeur `dstStride` px)
 * à la position (`dstX`, `dstY`). `srcRowBytes` : octets par ligne source (alignement GPU).
 * `flipY` : lignes sources de bas en haut (lecture WebGL).
 */
export function downsample2x(
  src: Uint8Array | Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  srcRowBytes: number,
  dst: Uint8ClampedArray,
  dstStride: number,
  dstX: number,
  dstY: number,
  flipY: boolean,
): void {
  const w = srcWidth >> 1;
  const h = srcHeight >> 1;
  for (let y = 0; y < h; y++) {
    const sy0 = flipY ? srcHeight - 1 - 2 * y : 2 * y;
    const sy1 = flipY ? sy0 - 1 : sy0 + 1;
    const row0 = sy0 * srcRowBytes;
    const row1 = sy1 * srcRowBytes;
    let o = ((dstY + y) * dstStride + dstX) * 4;
    for (let x = 0; x < w; x++) {
      const c0 = row0 + x * 8;
      const c1 = row1 + x * 8;
      const a0 = src[c0 + 3]!;
      const a1 = src[c0 + 7]!;
      const a2 = src[c1 + 3]!;
      const a3 = src[c1 + 7]!;
      const alpha = a0 + a1 + a2 + a3;
      if (alpha === 0) {
        dst[o] = 0;
        dst[o + 1] = 0;
        dst[o + 2] = 0;
        dst[o + 3] = 0;
      } else {
        for (let k = 0; k < 3; k++) {
          dst[o + k] =
            (src[c0 + k]! * a0 + src[c0 + 4 + k]! * a1 + src[c1 + k]! * a2 + src[c1 + 4 + k]! * a3) / alpha;
        }
        dst[o + 3] = alpha / 4;
      }
      o += 4;
    }
  }
}

/** Octets par ligne d'une lecture GPU (WebGPU aligne les lignes sur 256 octets). */
export function readbackRowBytes(width: number, bytesPerPixel: number, aligned: boolean): number {
  const raw = width * bytesPerPixel;
  return aligned ? Math.ceil(raw / 256) * 256 : raw;
}
