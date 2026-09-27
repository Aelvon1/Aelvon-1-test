/**
 * Flou d'un canal (Float32Array largeur × hauteur) par trois passes de flou-boîte séparables,
 * approximation rapide d'un flou gaussien. Bords en « clamp ».
 */
export function blurChannel(data: Float32Array, width: number, height: number, radius: number): void {
  if (radius < 0.5) return;
  // Trois boîtes successives ≈ gaussienne d'écart-type ~ radius.
  const r = Math.max(1, Math.round(radius / 1.7));
  const tmp = new Float32Array(data.length);
  for (let pass = 0; pass < 3; pass++) {
    boxH(data, tmp, width, height, r);
    boxV(tmp, data, width, height, r);
  }
}

function boxH(src: Float32Array, dst: Float32Array, w: number, h: number, r: number): void {
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += src[row + Math.min(w - 1, Math.max(0, i))]!;
    for (let x = 0; x < w; x++) {
      dst[row + x] = acc * inv;
      const add = src[row + Math.min(w - 1, x + r + 1)]!;
      const sub = src[row + Math.max(0, x - r)]!;
      acc += add - sub;
    }
  }
}

function boxV(src: Float32Array, dst: Float32Array, w: number, h: number, r: number): void {
  const inv = 1 / (2 * r + 1);
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += src[Math.min(h - 1, Math.max(0, i)) * w + x]!;
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = acc * inv;
      const add = src[Math.min(h - 1, y + r + 1) * w + x]!;
      const sub = src[Math.max(0, y - r) * w + x]!;
      acc += add - sub;
    }
  }
}
