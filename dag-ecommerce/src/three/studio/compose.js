// Compositions 2D du studio : rendu posé sur un fond, image de partage (Open Graph).

const DISPLAY = '"Cormorant Garamond Variable", "Cormorant Garamond", Georgia, serif';
const SANS = '"Manrope Variable", "Manrope", system-ui, sans-serif';

const loadImage = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });

function paintBackdrop(ctx, w, h, backdrop) {
  if (backdrop === 'noir' || backdrop === 'ivoire') {
    const stops =
      backdrop === 'noir'
        ? ['#1d1712', '#130f0c', '#0b0a09']
        : ['#f7f2e9', '#f1ebe1', '#e7dfd1'];
    ctx.fillStyle = stops[2];
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    // dégradé elliptique, comme le fond CSS de BeltCanvas
    ctx.translate(w / 2, h * 0.37);
    ctx.scale(w * 0.6, h * 0.95);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, stops[0]);
    g.addColorStop(0.45, stops[1]);
    g.addColorStop(1, stops[2]);
    ctx.fillStyle = g;
    ctx.fillRect(-2, -2, 4, 4);
    ctx.restore();
  } else {
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, w, h);
  }
}

export async function composeOnBackdrop(url, backdrop, type = 'image/webp', quality = 0.92) {
  const img = await loadImage(url);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  paintBackdrop(ctx, canvas.width, canvas.height, backdrop);
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL(type, quality);
}

/** Image de partage 1200×630 : fond noir, ceinture signature, mot-symbole et signature de marque. */
export async function composeOgImage(beltUrl) {
  const W = 1200;
  const H = 630;
  await Promise.all([
    document.fonts.load(`500 160px "Cormorant Garamond Variable"`, 'DAG'),
    document.fonts.load(`italic 400 48px "Cormorant Garamond Variable"`, 'La ceinture, en mieux.'),
    document.fonts.load(`600 14px "Manrope Variable"`, 'MAISON DE CEINTURES'),
  ]).catch(() => undefined);
  const belt = await loadImage(beltUrl);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Fond : noir chaud, halo derrière la ceinture
  ctx.fillStyle = '#0b0a09';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W * 0.7, H * 0.46);
  ctx.scale(W * 0.5, H * 0.8);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, '#241b14');
  g.addColorStop(0.5, '#14100d');
  g.addColorStop(1, 'rgba(11,10,9,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-3, -3, 6, 6);
  ctx.restore();

  // Ceinture, à droite
  const bh = H * 1.08;
  const bw = (belt.naturalWidth / belt.naturalHeight) * bh;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(belt, W - bw * 0.955, (H - bh) / 2 + 6, bw, bh);

  // Textes
  const x = 84;
  ctx.fillStyle = '#c9a96e';
  ctx.font = `600 13px ${SANS}`;
  ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '4.2px';
  ctx.fillText('MAISON DE CEINTURES', x + 2, 208);
  ctx.fillStyle = '#f1ebe1';
  ctx.font = `500 168px ${DISPLAY}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '6px';
  ctx.fillText('DAG', x - 6, 368);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.fillStyle = '#c9a96e';
  ctx.fillRect(x + 2, 404, 56, 1.5);
  ctx.fillStyle = 'rgba(241,235,225,0.92)';
  ctx.font = `italic 400 46px ${DISPLAY}`;
  ctx.fillText('La ceinture, en mieux.', x, 468);
  return canvas.toDataURL('image/jpeg', 0.9);
}
