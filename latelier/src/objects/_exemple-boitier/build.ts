/**
 * Géométrie et matériaux du boîtier de dérivation d'exemple.
 *
 * Toutes les cotes sont données en millimètres (lisibles, comme sur un plan) puis converties
 * en mètres par `mm()`. Les géométries répétées passent par `ctx.geometry` (cache partagé de
 * l'objet) ; les pièces répétées sont des `InstancedMesh` déclarés dans `PartBuild.instanced`.
 */
import * as THREE from 'three/webgpu';
import { float, mx_noise_float, positionLocal } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { MaterialFactory } from '../../materials/types';
import type { BuildContext, PartBuild } from '../types';
import { meltProgress } from '../../inspection/motions';

/** Identifiant de l'objet (préfixe obligatoire des textures et matériaux propres). */
export const OBJECT_ID = 'exemple-boitier';

/** Paramètres de l'objet (voir `paramSchema` dans `index.ts`). */
export type BoxParams = {
  /** Carte témoin lumineuse montée (variante). */
  indicator: boolean;
  /** Teinte du boîtier. */
  color: 'gray' | 'black';
};

/** Millimètres → mètres. */
export const mm = (v: number): number => v / 1000;

// --- Cotes principales (mm) -------------------------------------------------------------------

export const DIM = {
  /** Boîte : extérieur, hauteur, parois, fond, rayon d'angle. */
  width: 80,
  height: 36,
  wall: 2.2,
  floor: 2.5,
  corner: 6,
  /** Fûts d'angle (vis du couvercle). */
  bossOffset: 33,
  bossRadius: 4.5,
  /** Couvercle : joint, plaque. */
  gasket: 1.2,
  lidPlate: 4,
  /** Carte témoin. */
  boardSize: [40, 26] as const,
  boardCenter: [12, 12] as const,
  boardStandoff: 6,
  pcb: 1.6,
  /** Entrées de câbles (paroi −X). */
  grommetY: 19,
  grommetZ: [0, 22] as const,
  grommetHole: 16,
} as const;

/** Hauteur du dessus de la carte (repère de l'objet). */
export const BOARD_TOP = DIM.floor + DIM.boardStandoff + DIM.pcb;
/** Dessus du couvercle (repère de l'objet). */
export const LID_TOP = DIM.height + DIM.gasket + DIM.lidPlate;

// --- Matériaux propres à l'objet --------------------------------------------------------------

/** Plastique ABS/PC moulé : rugosité légèrement bruitée (grain de moule), écrit en TSL. */
function moldedPlastic(color: number, roughness: number): MaterialFactory {
  return () => {
    const m = new THREE.MeshPhysicalNodeMaterial({ color, roughness, metalness: 0, clearcoat: 0.06, clearcoatRoughness: 0.5 });
    // Grain de moule : variation de rugosité à l'échelle du dixième de millimètre.
    m.roughnessNode = float(roughness).add(mx_noise_float(positionLocal.mul(2600), 0.05));
    return m;
  };
}

/** Matériaux déclarés dans `ObjectDef.materials` (enregistrés sous `exemple-boitier/<clé>`). */
export const MATERIALS: Record<string, MaterialFactory> = {
  'abs.gray': moldedPlastic(0xc6cbc6, 0.58),
  'abs.black': moldedPlastic(0x1c1d1f, 0.52),
  'pa.terminal': moldedPlastic(0xd8d2bd, 0.55),
  'pcb.terminal': moldedPlastic(0x2d8a4e, 0.5),
  // Membrane : surface de révolution fermée, visible des deux côtés.
  'tpe.gray': () =>
    new THREE.MeshPhysicalNodeMaterial({ color: 0x5b5f63, roughness: 0.82, metalness: 0, side: THREE.DoubleSide }),
};

const mat = (ctx: BuildContext<BoxParams>, key: string) => ctx.materials.get(`${OBJECT_ID}/${key}`);
const housing = (ctx: BuildContext<BoxParams>) => mat(ctx, ctx.params.color === 'black' ? 'abs.black' : 'abs.gray');

// --- Utilitaires géométriques ------------------------------------------------------------------

/** Rectangle à coins arrondis centré (mm), éventuellement percé de trous circulaires. */
function roundedRect(w: number, d: number, r: number, holes: readonly [number, number, number][] = []): THREE.Shape {
  const x = w / 2;
  const y = d / 2;
  const s = new THREE.Shape();
  s.moveTo(-x + r, -y);
  s.lineTo(x - r, -y);
  s.absarc(x - r, -y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x, y - r);
  s.absarc(x - r, y - r, r, 0, Math.PI / 2, false);
  s.lineTo(-x + r, y);
  s.absarc(-x + r, y - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-x, -y + r);
  s.absarc(-x + r, -y + r, r, Math.PI, Math.PI * 1.5, false);
  for (const [hx, hy, hr] of holes) {
    const h = new THREE.Path();
    h.absarc(hx, hy, hr, 0, Math.PI * 2, true);
    s.holes.push(h);
  }
  return s;
}

/** Extrusion verticale (mm) d'une forme du plan XZ, de y0 à y0 + depth, convertie en mètres. */
function extrudeUp(shape: THREE.Shape, depth: number, y0: number, curveSegments = 10, bevel = 0): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: depth - 2 * bevel,
    curveSegments,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
  });
  // Plan XY de la forme → plan XZ ; extrusion +Z → +Y.
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0 + bevel, 0);
  g.scale(0.001, 0.001, 0.001);
  return g;
}

/** Boîte (mm) centrée en (x, y, z), non indexée (fusionnable avec des extrusions). */
function boxMm(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(mm(w), mm(h), mm(d)).toNonIndexed();
  g.translate(mm(x), mm(y), mm(z));
  return g;
}

/**
 * Profil de révolution (mm : [rayon, y]) autour de Y, converti en mètres, non indexé.
 * Le profil se parcourt de sorte que la matière soit à GAUCHE du sens de parcours dans le plan
 * (rayon, y) : normale = (dy, −dx) (convention de `LatheGeometry`), p. ex. du bas vers le haut
 * sur une paroi extérieure. Les angles vifs (> `sharpDeg`) sont conservés : le profil est découpé
 * en tronçons lissés séparément puis fusionnés.
 */
function latheMm(points: readonly [number, number][], segments: number, sharpDeg = 35): THREE.BufferGeometry {
  const runs: [number, number][][] = [];
  let run: [number, number][] = [points[0]!];
  const cosSharp = Math.cos(THREE.MathUtils.degToRad(sharpDeg));
  for (let i = 1; i < points.length; i++) {
    run.push(points[i]!);
    const next = points[i + 1];
    if (!next) break;
    const a = points[i - 1]!;
    const b = points[i]!;
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const vx = next[0] - b[0];
    const vy = next[1] - b[1];
    const cos = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1);
    if (cos < cosSharp) {
      runs.push(run);
      run = [b];
    }
  }
  runs.push(run);
  const parts = runs
    .filter((r) => r.length >= 2)
    .map((r) => new THREE.LatheGeometry(r.map(([x, y]) => new THREE.Vector2(mm(x), mm(y))), segments).toNonIndexed());
  return parts.length === 1 ? parts[0]! : merge(parts);
}

/** Fusionne des géométries de mêmes attributs (normales/uv) en une seule. */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const clean = parts.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(ng.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') ng.deleteAttribute(name);
    ng.clearGroups();
    return ng;
  });
  const merged = mergeGeometries(clean, false);
  if (!merged) throw new Error('Fusion de géométries impossible (attributs incompatibles).');
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  for (const g of parts) g.dispose();
  return merged;
}

/** Inverse la coordonnée v des UV (textures du service : ligne 0 de l'image = haut). */
function flipV(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const uv = g.getAttribute('uv');
  if (uv) for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  return g;
}

const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], name: string) => {
  const m = new THREE.Mesh(geometry, material);
  m.name = name;
  return m;
};

// --- Base -----------------------------------------------------------------------------------

/** Base : fond, parois (entrées de câbles sur la paroi −X), fûts d'angle, plots de la carte. */
export function buildBase(ctx: BuildContext<BoxParams>): THREE.Object3D {
  const g = ctx.geometry.get('base', () => {
    const { width: W, height: H, wall: t, floor: f, corner: R } = DIM;
    const half = W / 2;
    const L = W - 2 * R;
    const wallH = H - f;
    const parts: THREE.BufferGeometry[] = [];
    parts.push(extrudeUp(roundedRect(W - 0.8, W - 0.8, R - 0.4), f, 0, 12, 0.4));
    // Parois droites +X, +Z, −Z.
    parts.push(boxMm(t, wallH, L, half - t / 2, f + wallH / 2, 0));
    parts.push(boxMm(L, wallH, t, 0, f + wallH / 2, half - t / 2));
    parts.push(boxMm(L, wallH, t, 0, f + wallH / 2, -half + t / 2));
    // Paroi −X percée des deux entrées de câbles (forme dans le plan ZY extrudée selon X).
    const panel = new THREE.Shape();
    panel.moveTo(-L / 2, 0);
    panel.lineTo(L / 2, 0);
    panel.lineTo(L / 2, wallH);
    panel.lineTo(-L / 2, wallH);
    panel.closePath();
    for (const z of DIM.grommetZ) {
      const hole = new THREE.Path();
      hole.absarc(z, DIM.grommetY - f, DIM.grommetHole / 2, 0, Math.PI * 2, true);
      panel.holes.push(hole);
    }
    const west = new THREE.ExtrudeGeometry(panel, { depth: t, curveSegments: 24, bevelEnabled: false });
    // Forme (x → −z, y → y), extrusion +Z → +X.
    west.rotateY(-Math.PI / 2);
    west.translate(-half + t, f, 0);
    west.scale(0.001, 0.001, 0.001);
    parts.push(west);
    // Angles : quarts d'anneau extrudés.
    for (let k = 0; k < 4; k++) {
      const arc = new THREE.Shape();
      arc.moveTo(R, 0);
      arc.absarc(0, 0, R, 0, Math.PI / 2, false);
      arc.lineTo(0, R - t);
      arc.absarc(0, 0, R - t, Math.PI / 2, 0, true);
      arc.closePath();
      const q = extrudeUp(arc, wallH, f, 8);
      // Quart d'anneau de base dans le quadrant (+X, −Z), tourné de −k × 90° autour de Y.
      q.rotateY((-k * Math.PI) / 2);
      const sx = k < 2 ? 1 : -1;
      const sz = k === 0 || k === 3 ? -1 : 1;
      q.translate(mm(sx * (half - R)), 0, mm(sz * (half - R)));
      parts.push(q);
    }
    // Fûts d'angle (avant-trou Ø 3,4) et plots de la carte (avant-trou Ø 2).
    const boss = latheMm(
      [
        [DIM.bossRadius, f - 0.1],
        [DIM.bossRadius, H - 1.2],
        [2.3, H - 1.2],
        [1.7, H - 1.5],
        [1.7, H - 14],
      ],
      20,
    );
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) parts.push(boss.clone().translate(mm(sx * DIM.bossOffset), 0, mm(sz * DIM.bossOffset)));
    boss.dispose();
    const standoff = latheMm(
      [
        [3.0, f - 0.1],
        [3.0, f + DIM.boardStandoff],
        [1.0, f + DIM.boardStandoff],
        [1.0, f + DIM.boardStandoff - 5],
      ],
      16,
    );
    for (const [x, z] of BOARD_SCREWS) parts.push(standoff.clone().translate(mm(x), 0, mm(z)));
    standoff.dispose();
    // Glissières de clipsage du bornier.
    parts.push(boxMm(26, 2.5, 1.6, -20, f + 1.25, -27.6), boxMm(26, 2.5, 1.6, -20, f + 1.25, -12.4));
    return merge(parts);
  });
  return mesh(g, housing(ctx), 'Base moulée');
}

// --- Couvercle et joint -----------------------------------------------------------------------

const LID_HOLES = (r: number): [number, number, number][] => [
  [DIM.bossOffset, DIM.bossOffset, r],
  [-DIM.bossOffset, DIM.bossOffset, r],
  [DIM.bossOffset, -DIM.bossOffset, r],
  [-DIM.bossOffset, -DIM.bossOffset, r],
];

/** Couvercle (origine : dessus des parois, sur l'axe). Plaque percée + lèvre de centrage + étiquette. */
export function buildLid(ctx: BuildContext<BoxParams>): THREE.Object3D {
  const group = new THREE.Group();
  group.position.set(0, mm(DIM.height), 0);
  const plate = ctx.geometry.get('lid.plate', () => {
    const plateGeo = extrudeUp(roundedRect(DIM.width - 0.8, DIM.width - 0.8, DIM.corner - 0.4, LID_HOLES(2.3)), DIM.lidPlate, DIM.gasket, 12, 0.4);
    // Lèvre de centrage : quatre segments qui entrent dans la boîte (interrompus aux fûts).
    const inner = DIM.width / 2 - DIM.wall - 0.4;
    const lip: THREE.BufferGeometry[] = [plateGeo];
    const len = 48;
    const lipH = 3.2;
    const yMid = DIM.gasket - lipH / 2;
    lip.push(boxMm(1.4, lipH, len, inner - 0.7, yMid, 0), boxMm(1.4, lipH, len, -inner + 0.7, yMid, 0));
    lip.push(boxMm(len, lipH, 1.4, 0, yMid, inner - 0.7), boxMm(len, lipH, 1.4, 0, yMid, -inner + 0.7));
    return merge(lip);
  });
  group.add(mesh(plate, housing(ctx), 'Plaque du couvercle'));

  // Étiquette (marque inventée) : texture générée dans le worker, clé préfixée par l'objet.
  const labelTexture = ctx.textures.get({
    key: `${OBJECT_ID}/lid-label`,
    generator: 'drawlist',
    width: 512,
    height: 256,
    params: {
      viewBox: [0, 0, 44, 22],
      background: '#ece6d6',
      ops: [
        { op: 'rect', x: 1, y: 1, w: 42, h: 20, stroke: '#2b2b2b', lineWidth: 0.35, radius: 1.2 },
        { op: 'text', text: 'DÉRIVO', x: 22, y: 7.2, font: "bold 5.4px 'DejaVu Sans', sans-serif", fill: '#1f3b5a', align: 'center', baseline: 'middle', letterSpacing: 0.6 },
        { op: 'text', text: 'BOÎTE DE DÉRIVATION', x: 22, y: 12.2, font: "2.2px 'DejaVu Sans', sans-serif", fill: '#2b2b2b', align: 'center', baseline: 'middle' },
        { op: 'text', text: 'IP55 · 80×80 · 450 V~', x: 22, y: 16.2, font: "bold 2.3px 'DejaVu Sans Mono', monospace", fill: '#2b2b2b', align: 'center', baseline: 'middle' },
        { op: 'noise', amount: 0.05, seed: 7, mono: true },
      ],
    },
  });
  const labelGeo = ctx.geometry.get('lid.label', () => flipV(new THREE.PlaneGeometry(mm(44), mm(22)).rotateX(-Math.PI / 2)));
  const labelMaterial = ctx.materials.variant('paper.label', { map: labelTexture, color: 0xffffff, name: 'Étiquette du couvercle' });
  const label = mesh(labelGeo, labelMaterial, 'Étiquette');
  label.position.set(0, mm(DIM.gasket + DIM.lidPlate + 0.05), 0);
  group.add(label);
  return group;
}

/** Joint de couvercle (repère du couvercle). */
export function buildGasket(ctx: BuildContext<BoxParams>): PartBuild {
  const outer = DIM.width - 0.6;
  const g = ctx.geometry.get('gasket', () => {
    const ring = roundedRect(outer, outer, DIM.corner - 0.3);
    const hole = new THREE.Path();
    const inner = outer - 4;
    const r = DIM.corner - 2;
    const x = inner / 2;
    hole.moveTo(-x + r, -x);
    hole.absarc(-x + r, -x + r, r, Math.PI * 1.5, Math.PI, true);
    hole.lineTo(-x, x - r);
    hole.absarc(-x + r, x - r, r, Math.PI, Math.PI / 2, true);
    hole.lineTo(x - r, x);
    hole.absarc(x - r, x - r, r, Math.PI / 2, 0, true);
    hole.lineTo(x, -x + r);
    hole.absarc(x - r, -x + r, r, 0, -Math.PI / 2, true);
    ring.holes.push(hole);
    return extrudeUp(ring, DIM.gasket, 0, 10);
  });
  const object = mesh(g, ctx.materials.get('rubber.black'), 'Joint EPDM');
  return { object, anchor: [mm(outer / 2 - 1), mm(DIM.gasket), 0] };
}

// --- Vis cruciformes ------------------------------------------------------------------------

/**
 * Vis à tête cylindrique bombée, empreinte cruciforme et filet simplifié (dents annulaires au
 * pas `pitch`). Origine : dessous de la tête, sur l'axe (pivot du dévissage).
 */
function screwGeometries(head: number, headH: number, shank: number, length: number, pitch: number) {
  const r = shank / 2;
  const root = r * 0.8;
  const profile: [number, number][] = [
    [0, headH],
    [head * 0.2, headH * 0.98],
    [head * 0.36, headH * 0.88],
    [head * 0.46, headH * 0.64],
    [head / 2, headH * 0.3],
    [head / 2, 0],
    [r, 0],
    [r, -1],
  ];
  // Filet simplifié : dents en dents de scie jusqu'à la pointe.
  for (let y = -1; y > -(length - 1.6); y -= pitch) {
    profile.push([root, y - pitch * 0.45], [r, y - pitch]);
  }
  profile.push([root * 0.7, -length + 0.6], [0.05, -length]);
  // Parcours de la pointe vers le sommet de la tête (normales vers l'extérieur).
  const body = latheMm(profile.reverse(), 18);
  // Empreinte cruciforme : deux lames sombres croisées affleurant le dôme.
  const w = head * 0.52;
  const cross = merge([boxMm(w, 0.7, head * 0.12, 0, headH - 0.28, 0), boxMm(head * 0.12, 0.7, w, 0, headH - 0.28, 0)]);
  return { body, cross };
}

/** Vis instanciées (positions en mm dans le repère de l'objet, tête posée à `y`). */
function buildScrews(
  ctx: BuildContext<BoxParams>,
  key: string,
  dims: { head: number; headH: number; shank: number; length: number; pitch: number },
  positions: readonly [number, number, number][],
  label: (i: number) => string,
): PartBuild {
  const body = ctx.geometry.get(`${key}.body`, () => screwGeometries(dims.head, dims.headH, dims.shank, dims.length, dims.pitch).body);
  const cross = ctx.geometry.get(`${key}.cross`, () => screwGeometries(dims.head, dims.headH, dims.shank, dims.length, dims.pitch).cross);
  const count = positions.length;
  const steel = new THREE.InstancedMesh(body, ctx.materials.get('steel.zinc'), count);
  const recess = new THREE.InstancedMesh(cross, ctx.materials.get('steel.blackoxide'), count);
  steel.name = 'Corps de vis';
  recess.name = 'Empreinte cruciforme';
  const m = new THREE.Matrix4();
  positions.forEach(([x, y, z], i) => {
    // Légère rotation propre à chaque vis : les empreintes ne sont pas alignées.
    m.makeRotationY(0.4 + i * 1.3).setPosition(mm(x), mm(y), mm(z));
    steel.setMatrixAt(i, m);
    recess.setMatrixAt(i, m);
  });
  const group = new THREE.Group();
  group.add(steel, recess);
  return { object: group, instanced: [steel, recess], instanceLabel: label };
}

const CORNER_LABELS = ['avant droite', 'avant gauche', 'arrière droite', 'arrière gauche'];

export function buildLidScrews(ctx: BuildContext<BoxParams>): PartBuild {
  const o = DIM.bossOffset;
  return buildScrews(
    ctx,
    'screw.lid',
    { head: 7.5, headH: 2.8, shank: 4, length: 16, pitch: 0.7 },
    [
      [o, LID_TOP, o],
      [-o, LID_TOP, o],
      [o, LID_TOP, -o],
      [-o, LID_TOP, -o],
    ],
    (i) => `Vis de couvercle (${CORNER_LABELS[i] ?? `n° ${i + 1}`})`,
  );
}

/** Positions (mm, x/z) des vis de la carte, repère de l'objet. */
export const BOARD_SCREWS: readonly [number, number][] = [
  // Diagonale avant gauche / arrière droite (le bornier de la carte occupe l'arrière gauche).
  [DIM.boardCenter[0] - DIM.boardSize[0] / 2 + 4, DIM.boardCenter[1] + DIM.boardSize[1] / 2 - 4],
  [DIM.boardCenter[0] + DIM.boardSize[0] / 2 - 4, DIM.boardCenter[1] - DIM.boardSize[1] / 2 + 4],
];

export function buildBoardScrews(ctx: BuildContext<BoxParams>): PartBuild {
  return buildScrews(
    ctx,
    'screw.board',
    { head: 4.6, headH: 1.6, shank: 2.5, length: 6, pitch: 0.45 },
    BOARD_SCREWS.map(([x, z]) => [x, BOARD_TOP, z] as [number, number, number]),
    (i) => `Vis de carte n° ${i + 1}`,
  );
}

// --- Bornier ---------------------------------------------------------------------------------

/** Bornier 3 pôles à vis (origine : centre du dessous, sur le fond de la boîte). */
export function buildTerminal(ctx: BuildContext<BoxParams>): THREE.Object3D {
  const group = new THREE.Group();
  group.position.set(mm(-20), mm(DIM.floor), mm(-20));
  const body = ctx.geometry.get('terminal.body', () => {
    const parts = [boxMm(23, 11, 13, 0, 5.5, 0)];
    // Cloisons entre pôles, plus hautes que le corps.
    for (const x of [-11, -3.75, 3.75, 11]) parts.push(boxMm(1.0, 3, 13, x, 12.5, 0));
    // Pieds de clipsage.
    parts.push(boxMm(20, 1.2, 1.4, 0, -0.1, -6.2), boxMm(20, 1.2, 1.4, 0, -0.1, 6.2));
    return merge(parts);
  });
  group.add(mesh(body, mat(ctx, 'pa.terminal'), 'Corps polyamide'));
  // Cages en laiton visibles par les entrées (face +Z) et vis de serrage.
  const cage = ctx.geometry.get('terminal.cage', () => merge([boxMm(4.6, 4.4, 7, 0, 5.4, 3.2)]));
  const entry = ctx.geometry.get('terminal.entry', () => merge([boxMm(3.6, 3.6, 0.3, 0, 5.4, 6.56)]));
  const screw = ctx.geometry.get('terminal.screw', () =>
    merge([latheMm([[1.2, 6], [1.2, 9.8], [1.9, 9.8], [1.9, 11.4], [0, 11.4]], 16), boxMm(3.9, 0.6, 0.55, 0, 11.3, 0)]),
  );
  const brass = ctx.materials.get('brass');
  const dark = ctx.materials.get('plastic.black');
  const zinc = ctx.materials.get('steel.zinc');
  for (const x of [-7.5, 0, 7.5]) {
    const c = mesh(cage, brass, 'Cage de serrage');
    c.position.x = mm(x);
    const e = mesh(entry, dark, 'Entrée de conducteur');
    e.position.x = mm(x);
    const s = mesh(screw, zinc, 'Vis de serrage');
    s.position.x = mm(x);
    s.rotation.y = x * 0.2;
    group.add(c, e, s);
  }
  return group;
}

// --- Conducteurs ----------------------------------------------------------------------------

/** Entraxe des pôles (mm). */
const POLE_PITCH = 7.5;

/**
 * Deux conducteurs souples (instances) du bornier vers le bornier de la carte. Origine : entrée
 * du pôle 2 du bornier ; l'instance 1 est décalée d'un pas de pôle. Couleurs par instance.
 */
export function buildWires(ctx: BuildContext<BoxParams>): PartBuild {
  const group = new THREE.Group();
  group.position.set(mm(-20), mm(DIM.floor + 5.4), mm(-13.5));
  const path = new THREE.CatmullRomCurve3(
    [
      [0, 0, 0],
      [0, 0.3, 3.5],
      [0.8, 4, 7],
      [9, 9.5, 9.5],
      [17, 7.4, 10.5],
      [17.75, 6.1, 12.4],
      [17.75, 6.1, 14.5],
    ].map(([x, y, z]) => new THREE.Vector3(mm(x!), mm(y!), mm(z!))),
  );
  const tube = ctx.geometry.get('wire.tube', () => new THREE.TubeGeometry(path, 48, mm(1.1), 10, false));
  const ferrule = ctx.geometry.get('wire.ferrules', () => {
    const f = new THREE.CylinderGeometry(mm(0.75), mm(0.75), mm(4), 10).toNonIndexed();
    f.rotateX(Math.PI / 2);
    const a = f.clone().translate(0, 0, mm(-1.4));
    const end = path.getPointAt(1);
    const b = f.clone().translate(end.x, end.y, end.z + mm(1.6));
    f.dispose();
    return merge([a, b]);
  });
  // Isolant blanc teinté par instance (marron = phase, bleu = neutre).
  const insulation = new THREE.InstancedMesh(
    tube,
    ctx.materials.variant('plastic.white', { color: 0xffffff, roughness: 0.45, name: 'Isolant PVC' }),
    2,
  );
  const ends = new THREE.InstancedMesh(ferrule, ctx.materials.get('tin'), 2);
  insulation.name = 'Isolant';
  ends.name = 'Embouts sertis';
  const m = new THREE.Matrix4();
  for (let i = 0; i < 2; i++) {
    m.makeTranslation(mm(i * POLE_PITCH), 0, 0);
    insulation.setMatrixAt(i, m);
    ends.setMatrixAt(i, m);
  }
  insulation.setColorAt(0, new THREE.Color(0x6a3b1f));
  insulation.setColorAt(1, new THREE.Color(0x1f4b93));
  group.add(insulation, ends);
  return {
    object: group,
    instanced: [insulation, ends],
    instanceLabel: (i) => (i === 0 ? 'Conducteur marron (phase)' : 'Conducteur bleu (neutre)'),
  };
}

// --- Carte témoin ---------------------------------------------------------------------------

/** Circuit imprimé + bornier à ressort 2 points (origine : dessus de la carte, au centre). */
export function buildBoard(ctx: BuildContext<BoxParams>): THREE.Object3D {
  const [bw, bd] = DIM.boardSize;
  const group = new THREE.Group();
  group.position.set(mm(DIM.boardCenter[0]), mm(BOARD_TOP), mm(DIM.boardCenter[1]));
  // Sérigraphie, pistes et pastilles : texture générée (viewBox en mm, origine au coin arrière gauche).
  const art = ctx.textures.get({
    key: `${OBJECT_ID}/pcb-top`,
    generator: 'drawlist',
    width: 1024,
    height: 668,
    params: {
      viewBox: [0, 0, bw, bd],
      background: '#0f5e57',
      ops: [
        // Pistes (cuivre sous vernis : plus clair). L → R1 → D1 (anode) ; N → D1 (cathode).
        { op: 'polyline', points: [5.75, 6, 5.75, 8.5, 19, 8.5, 20.9, 12.5], stroke: '#2b8a78', lineWidth: 0.9, lineCap: 'round', lineJoin: 'round' },
        { op: 'polyline', points: [31.1, 12.5, 33.5, 12.5, 33.5, 16.5, 31.27, 18.4], stroke: '#2b8a78', lineWidth: 0.9, lineCap: 'round', lineJoin: 'round' },
        { op: 'polyline', points: [13.25, 6, 14.5, 7.2, 35, 7.2, 35, 20, 28.73, 20.6, 28.73, 18.4], stroke: '#2b8a78', lineWidth: 0.9, lineCap: 'round', lineJoin: 'round' },
        // Pastilles étamées (bornier, R1, D1) et trous de fixation.
        { op: 'circle', x: 5.75, y: 6, r: 1.3, fill: '#cfd2d4' },
        { op: 'circle', x: 13.25, y: 6, r: 1.3, fill: '#cfd2d4' },
        { op: 'circle', x: 20.9, y: 12.5, r: 0.9, fill: '#cfd2d4' },
        { op: 'circle', x: 31.1, y: 12.5, r: 0.9, fill: '#cfd2d4' },
        { op: 'circle', x: 28.73, y: 18.4, r: 0.8, fill: '#cfd2d4' },
        { op: 'circle', x: 31.27, y: 18.4, r: 0.8, fill: '#cfd2d4' },
        { op: 'circle', x: 4, y: 22, r: 2.2, fill: '#cfd2d4' },
        { op: 'circle', x: 36, y: 4, r: 2.2, fill: '#cfd2d4' },
        { op: 'circle', x: 4, y: 22, r: 1.35, fill: '#1a1a1a' },
        { op: 'circle', x: 36, y: 4, r: 1.35, fill: '#1a1a1a' },
        // Sérigraphie.
        { op: 'rect', x: 19.2, y: 11.2, w: 13.6, h: 2.6, stroke: '#f2f2ee', lineWidth: 0.2 },
        { op: 'text', text: 'R1 1k', x: 26, y: 9.8, font: "1.4px 'DejaVu Sans Mono', monospace", fill: '#f2f2ee', align: 'center', baseline: 'middle' },
        { op: 'circle', x: 30, y: 18.4, r: 2.9, stroke: '#f2f2ee', lineWidth: 0.2 },
        { op: 'text', text: 'D1', x: 30, y: 22.8, font: "1.4px 'DejaVu Sans Mono', monospace", fill: '#f2f2ee', align: 'center', baseline: 'middle' },
        { op: 'text', text: 'L', x: 5.75, y: 11.3, font: "bold 1.6px 'DejaVu Sans', sans-serif", fill: '#f2f2ee', align: 'center', baseline: 'middle' },
        { op: 'text', text: 'N', x: 13.25, y: 11.3, font: "bold 1.6px 'DejaVu Sans', sans-serif", fill: '#f2f2ee', align: 'center', baseline: 'middle' },
        { op: 'text', text: 'TÉMOIN 12–24 V', x: 22, y: 23.4, font: "1.5px 'DejaVu Sans', sans-serif", fill: '#f2f2ee', align: 'center', baseline: 'middle' },
        { op: 'text', text: 'DRV-T2 rév. B', x: 25, y: 4.6, font: "1.1px 'DejaVu Sans Mono', monospace", fill: '#f2f2ee', align: 'center', baseline: 'middle' },
      ],
    },
  });
  const pcb = ctx.geometry.get('pcb', () => {
    const g = new THREE.BoxGeometry(mm(bw), mm(DIM.pcb), mm(bd));
    g.translate(0, -mm(DIM.pcb / 2), 0);
    // Face +Y (groupe 2) : UV de l'image (coin arrière gauche en haut de l'image).
    const uv = g.getAttribute('uv');
    for (let i = 8; i < 12; i++) uv.setY(i, 1 - uv.getY(i));
    return g;
  });
  const edge = ctx.materials.get('fr4.core');
  const top = ctx.materials.variant('mask.teal', { map: art, color: 0xffffff, name: 'Vernis épargne (sérigraphié)' });
  const bottom = ctx.materials.get('mask.teal');
  group.add(mesh(pcb, [edge, edge, top, bottom, edge, edge], 'Circuit imprimé'));
  // Bornier à ressort 2 points (vert), entrées face −Z, leviers orange.
  const terminal = ctx.geometry.get('pcb.terminal', () =>
    merge([boxMm(15, 10, 8, 0, 5, 0), boxMm(15, 2.5, 3, 0, 8.75, 2.5), boxMm(3.4, 3.4, 0.3, -3.75, 4, -4.1), boxMm(3.4, 3.4, 0.3, 3.75, 4, -4.1)]),
  );
  const t = mesh(terminal, mat(ctx, 'pcb.terminal'), 'Bornier à ressort');
  // Entrées alignées sur les extrémités des conducteurs (dessin : x 5,75 / 13,25, y 6).
  t.position.set(mm(9.5 - bw / 2), 0, mm(6 - bd / 2));
  group.add(t);
  // Points de soudure du bornier (côté cuivre).
  const joint = solderJointGeometry(ctx);
  const solder = ctx.materials.get('solder');
  for (const dx of [-3.75, 3.75]) {
    const j = mesh(joint, solder, 'Soudure du bornier');
    j.position.set(t.position.x + mm(dx), -mm(DIM.pcb), t.position.z);
    j.rotation.x = Math.PI;
    group.add(j);
  }
  return group;
}

/** Ménisque de soudure (cône arrondi) ; sommet vers +Y. */
function solderJointGeometry(ctx: BuildContext<BoxParams>): THREE.BufferGeometry {
  return ctx.geometry.get('solder.joint', () =>
    latheMm(
      [
        [1.2, 0],
        [1.2, 0.05],
        [0.95, 0.25],
        [0.55, 0.7],
        [0.35, 1.2],
        [0, 1.25],
      ],
      14,
      70,
    ),
  );
}

/** Crée le hook de fusion de l'étain : les ménisques s'affaissent puis disparaissent. */
function meltHook(joints: THREE.Object3D[]): PartBuild['hooks'] {
  return {
    onRemovalProgress(t) {
      const k = 1 - meltProgress(t);
      for (const j of joints) {
        j.scale.set(0.6 + 0.4 * k, Math.max(0.001, k), 0.6 + 0.4 * k);
        j.visible = k > 0.02;
      }
    },
  };
}

/** LED 5 mm rouge (origine : dessus de la carte, entre les pattes). */
export function buildLed(ctx: BuildContext<BoxParams>): PartBuild {
  const group = new THREE.Group();
  const [bw, bd] = DIM.boardSize;
  // Coordonnées du dessin de la carte (mm depuis le coin arrière gauche) → repère de la carte.
  group.position.set(mm(30 - bw / 2), 0, mm(18.4 - bd / 2));
  const lens = ctx.geometry.get('led.lens', () => {
    const pts: [number, number][] = [[2.9, 2.0], [2.9, 3.0], [2.5, 3.0]];
    for (let a = 0; a <= 8; a++) {
      const ang = (a / 8) * (Math.PI / 2);
      pts.push([2.5 * Math.cos(ang), 3.0 + 5.2 + 2.5 * Math.sin(ang) - 2.5]);
    }
    return latheMm([[0, 2.0], ...pts], 24);
  });
  group.add(mesh(lens, ctx.materials.get('led.red'), 'Lentille époxy'));
  const leg = ctx.geometry.get('led.leg', () => new THREE.CylinderGeometry(mm(0.25), mm(0.25), mm(5.6), 6).translate(0, mm(0.6), 0));
  const tin = ctx.materials.get('tin');
  const joint = solderJointGeometry(ctx);
  const solder = ctx.materials.get('solder');
  const joints: THREE.Object3D[] = [];
  for (const dx of [-1.27, 1.27]) {
    const l = mesh(leg, tin, 'Patte');
    l.position.x = mm(dx);
    const j = mesh(joint, solder, 'Soudure');
    j.position.set(mm(dx), -mm(DIM.pcb), 0);
    j.rotation.x = Math.PI;
    joints.push(j);
    group.add(l, j);
  }
  return { object: group, hooks: meltHook(joints), anchor: [mm(1.27), mm(0.3), 0] };
}

/** Résistance axiale 1 kΩ (marron-noir-rouge-or), couchée, pattes pliées (origine : dessus de la carte). */
export function buildResistor(ctx: BuildContext<BoxParams>): PartBuild {
  const group = new THREE.Group();
  const [bw, bd] = DIM.boardSize;
  group.position.set(mm(26 - bw / 2), 0, mm(12.5 - bd / 2));
  const lift = 1.6;
  const body = ctx.geometry.get('res.body', () => {
    const g = latheMm(
      [
        [0, -3.15],
        [0.9, -3.12],
        [1.2, -2.8],
        [1.2, -2.0],
        [1.05, -1.5],
        [1.05, 1.5],
        [1.2, 2.0],
        [1.2, 2.8],
        [0.9, 3.12],
        [0, 3.15],
      ],
      20,
    );
    g.rotateZ(Math.PI / 2);
    g.translate(0, mm(lift + 1.2), 0);
    return g;
  });
  group.add(mesh(body, ctx.materials.variant('ceramic.tan', { color: 0xd9c49a, roughness: 0.45, name: 'Laque de résistance' }), 'Corps'));
  const band = ctx.geometry.get('res.band', () => {
    const g = new THREE.CylinderGeometry(mm(1.23), mm(1.23), mm(0.55), 20, 1, true);
    g.rotateZ(Math.PI / 2);
    g.translate(0, mm(lift + 1.2), 0);
    return g;
  });
  const colors = [0x5a3218, 0x111111, 0xb02418, 0xb8963c];
  [-2.3, -1.2, -0.1, 2.0].forEach((x, i) => {
    const b = mesh(band, ctx.materials.variant(i === 3 ? 'gold' : 'plastic.black', { color: colors[i]!, name: `Anneau ${i + 1}` }), 'Anneau de couleur');
    b.position.x = mm(x);
    group.add(b);
  });
  // Pattes : fil horizontal puis coudé à 90° vers les trous (entraxe 10,16 mm).
  const leadGeo = ctx.geometry.get('res.lead', () => {
    const half = 5.08;
    const lead = (side: 1 | -1) =>
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(
          [
            [3.1, lift + 1.2],
            [4.4, lift + 1.2],
            [half - 0.1, lift + 0.9],
            [half, lift],
            [half, -DIM.pcb - 0.8],
          ].map(([x, y]) => new THREE.Vector3(mm(side * x!), mm(y!), 0)),
          false,
          'catmullrom',
          0.2,
        ),
        16,
        mm(0.3),
        6,
        false,
      );
    return merge([lead(1), lead(-1)]);
  });
  group.add(mesh(leadGeo, ctx.materials.get('tin'), 'Pattes'));
  const joint = solderJointGeometry(ctx);
  const solder = ctx.materials.get('solder');
  const joints: THREE.Object3D[] = [];
  for (const dx of [-5.08, 5.08]) {
    const j = mesh(joint, solder, 'Soudure');
    j.position.set(mm(dx), -mm(DIM.pcb), 0);
    j.rotation.x = Math.PI;
    joints.push(j);
    group.add(j);
  }
  return { object: group, hooks: meltHook(joints), anchor: [mm(5.08), mm(0.3), 0] };
}

// --- Membranes ------------------------------------------------------------------------------

/** Membranes passe-câbles (instances) dans la paroi −X ; origine de chaque instance : axe du trou. */
export function buildGrommets(ctx: BuildContext<BoxParams>): PartBuild {
  const g = ctx.geometry.get('grommet', () => {
    const t = DIM.wall;
    const r = DIM.grommetHole / 2;
    // Profil (rayon, position le long de l'axe, +Y = extérieur avant rotation).
    const profile: [number, number][] = [
      [0.8, 0.2],
      [2.2, 0.35],
      [r - 1.2, 0.9],
      [r + 1.3, 1.3],
      [r + 1.6, 0.9],
      [r + 1.6, 0.2],
      [r, 0],
      [r, -t],
      [r + 0.9, -t],
      [r + 0.9, -t - 0.9],
      [r - 0.6, -t - 1.2],
      [2.4, -t + 0.4],
      [0.8, -t + 0.6],
      [0.8, 0.2],
    ];
    const geo = latheMm(profile.reverse(), 28);
    // Axe Y → axe −X (la membrane affleure à l'extérieur de la paroi −X).
    geo.rotateZ(Math.PI / 2);
    return geo;
  });
  const grommets = new THREE.InstancedMesh(g, mat(ctx, 'tpe.gray'), DIM.grommetZ.length);
  grommets.name = 'Membranes';
  const m = new THREE.Matrix4();
  DIM.grommetZ.forEach((z, i) => {
    m.makeTranslation(mm(-DIM.width / 2), mm(DIM.grommetY), mm(z));
    grommets.setMatrixAt(i, m);
  });
  return { object: grommets, instanced: grommets, instanceLabel: (i) => (i === 0 ? 'Membrane avant' : 'Membrane arrière') };
}
