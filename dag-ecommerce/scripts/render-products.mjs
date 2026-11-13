#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Visuels pré-rendus de la ceinture DAG — `npm run renders`
//
// Démarre un serveur Vite sur un port libre, ouvre la page de studio (studio.html) dans un
// Chromium sans écran et écrit, à partir de la scène 3D temps réel :
//
//   public/renders/{slug}-{coloris}-studio.webp   vue d'ensemble, ombre portée incluse
//   public/renders/{slug}-{coloris}-boucle.webp   gros plan sur la boucle
//   public/renders/{slug}-{coloris}-detail.webp   gros plan cuir et couture
//   public/renders/poster-hero.webp               ceinture signature (repli du héros)
//   public/renders/poster-atelier.webp            ceinture par défaut de l'Atelier
//   public/og-image.jpg                           image de partage 1200×630
//
// La liste des variantes vient de la page elle-même (window.__studio.variants()), car Node ne peut
// pas importer directement les modules de src/. Le script est idempotent : relancé, il réécrit les
// mêmes fichiers.
//
// Le Chromium sans écran rend en logiciel (SwiftShader). En production, <BeltCanvas /> s'en tient
// alors au poster ; la page de studio lève cette réserve (window.__DAG_BELT_SOFTWARE_OK__), si bien
// que les rendus sont produits par la vraie scène, pixel pour pixel.
//
// Options :  --only=<slug>   ne rendre qu'un produit      --no-posters   sauter posters et image OG
//            --posters       ne rendre que les posters et l'image OG
//            --size=1200     côté des visuels produit     --quality=0.9  qualité WebP
// ---------------------------------------------------------------------------
import { execSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'renders');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = 'true'] = a.replace(/^--/, '').split('=');
    return [k, v];
  }),
);
const SIZE = Number(args.size) || 1200;
const QUALITY = Number(args.quality) || 0.9;
const PAPER = 'e7dfd1'; // les visuels produit sont éclairés pour un fond papier
const SHOTS = [
  { id: 'studio', view: 'full' },
  { id: 'boucle', view: 'boucle' },
  { id: 'detail', view: 'couture' },
];

/** Playwright est installé globalement, pas dans ce projet. */
function loadPlaywright() {
  const attempts = [() => createRequire(import.meta.url)('playwright')];
  attempts.push(() => {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return createRequire(path.join(globalRoot, 'noop.js'))('playwright');
  });
  for (const attempt of attempts) {
    try {
      return attempt();
    } catch {
      /* essai suivant */
    }
  }
  console.error(
    [
      '',
      '✖ Impossible de charger « playwright ».',
      '  Ce script pilote un Chromium sans écran via Playwright, attendu en installation globale :',
      '    npm install -g playwright && npx playwright install chromium',
      '  (ou exposez votre installation avec NODE_PATH=$(npm root -g)).',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

const { chromium } = loadPlaywright();

const kb = (bytes) => `${(bytes / 1024).toFixed(0).padStart(5)} Ko`;

async function main() {
  const started = Date.now();
  await mkdir(outDir, { recursive: true });

  const server = await createServer({
    root,
    logLevel: 'error',
    cacheDir: path.join(root, 'node_modules', '.vite-renders'), // ne perturbe pas un `npm run dev` en cours
    server: { port: 0, host: '127.0.0.1', strictPort: false, open: false },
  });
  await server.listen();
  const address = server.httpServer.address();
  const base = `http://127.0.0.1:${address.port}`;
  console.log(`Studio : ${base}/studio.html`);

  const browser = await chromium.launch();
  const rows = [];
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 640 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(240000);
    page.on('pageerror', (error) => console.error(`  [page] ${error.message}`));
    await page.goto(`${base}/studio.html?ui=0&size=600&preset=default&bg=${PAPER}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__studio);
    let timer;
    const ok = await Promise.race([
      page.evaluate(() => window.__studio.ready),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(false), 180000);
      }),
    ]);
    clearTimeout(timer);
    if (!ok) throw new Error('La scène 3D ne démarre pas (WebGL 2 indisponible dans ce Chromium ?).');

    const write = async (file, dataUrl, label, t0) => {
      if (!dataUrl) throw new Error(`Capture vide pour ${label}`);
      const buffer = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
      await writeFile(file, buffer);
      rows.push({ file: path.relative(root, file), size: buffer.length, ms: Date.now() - t0 });
      console.log(`  ✓ ${path.relative(root, file).padEnd(52)} ${kb(buffer.length)}  ${String(Date.now() - t0).padStart(6)} ms`);
    };

    // --- Visuels produit ---------------------------------------------------
    let variants = await page.evaluate(() => window.__studio.variants());
    if (args.only) variants = variants.filter((v) => v.slug === args.only);
    if (args.posters) variants = [];
    console.log(`\n${variants.length} variante(s) × ${SHOTS.length} plans, ${SIZE}×${SIZE} px\n`);
    for (const variant of variants) {
      await page.evaluate(
        ({ belt, bg }) =>
          window.__studio.set(
            { monogram: '', monogramStyle: 'marque', lining: null, ...belt },
            { pose: 'coil', view: 'full', backdrop: 'none', bg },
          ),
        { belt: variant.belt, bg: PAPER },
      );
      for (const shot of SHOTS) {
        const t0 = Date.now();
        const url = await page.evaluate(
          ({ view, size, quality }) =>
            window.__studio.capture({ view, pose: 'coil', size, supersample: 2, type: 'image/webp', quality }),
          { view: shot.view, size: SIZE, quality: QUALITY },
        );
        await write(path.join(outDir, `${variant.slug}-${variant.color}-${shot.id}.webp`), url, `${variant.slug} ${shot.id}`, t0);
      }
    }

    // --- Posters et image de partage (ambiance sombre du site) ----------------
    if (!args['no-posters'] && !args.only) {
      console.log('\nPosters\n');
      const poster = async (name, preset, view) => {
        const t0 = Date.now();
        const url = await page.evaluate(
          async ({ preset, view, quality }) => {
            const studio = window.__studio;
            await studio.set(studio.presets[preset], { pose: 'coil', view, backdrop: 'none', bg: '' });
            return studio.capture({ view, pose: 'coil', size: 1600, supersample: 1.5, type: 'image/webp', quality });
          },
          { preset, view, quality: QUALITY },
        );
        await write(path.join(outDir, name), url, name, t0);
      };
      await poster('poster-hero.webp', 'hero', 'hero');
      await poster('poster-atelier.webp', 'default', 'full');
      const t0 = Date.now();
      const og = await page.evaluate(async () => {
        const studio = window.__studio;
        await studio.set(studio.presets.hero, { pose: 'coil', view: 'hero', backdrop: 'none', bg: '' });
        return studio.og();
      });
      await write(path.join(root, 'public', 'og-image.jpg'), og, 'og-image', t0);
    }
  } finally {
    await browser.close();
    await server.close();
  }

  // --- Récapitulatif ---------------------------------------------------------
  const total = rows.reduce((n, r) => n + r.size, 0);
  const line = '─'.repeat(78);
  console.log(`\n${line}\n${'Fichier'.padEnd(54)}${'Poids'.padStart(10)}${'Durée'.padStart(12)}\n${line}`);
  for (const r of rows) console.log(`${r.file.padEnd(54)}${kb(r.size).padStart(10)}${`${r.ms} ms`.padStart(12)}`);
  console.log(line);
  console.log(
    `${`${rows.length} fichier(s)`.padEnd(54)}${kb(total).padStart(10)}${`${((Date.now() - started) / 1000).toFixed(1)} s`.padStart(12)}\n`,
  );
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(`\n✖ ${error.message}\n`);
    process.exit(1);
  },
);
