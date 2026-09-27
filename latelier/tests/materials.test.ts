/**
 * Tests de la bibliothèque de matériaux (sous Node) : couverture de tous les identifiants de
 * base, construction des graphes TSL sans erreur, textures de bibliothèque préfixées `lib/`,
 * variantes (surcharges, émission propre au clone), tailles de textures selon la qualité,
 * attributs d'usure géométriques.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { MaterialLibraryImpl } from '../src/materials/MaterialLibrary';
import { BASE_RECIPES, registerBaseMaterials } from '../src/materials/library';
import { BASE_MATERIAL_IDS } from '../src/materials/types';
import { LIB_TEXTURES, libTextureSize } from '../src/materials/libTextures';
import { setMaterialGlow } from '../src/materials/factories/optics';
import {
  applyEdgeWear,
  computeEdgeWear,
  computeOcclusion,
  weldByPosition,
} from '../src/materials/geometry/edgeWear';
import { createBevelledBox } from '../src/materials/geometry/bevelledBox';
import { FakeTextureService } from './helpers/fakeServices';

function createLibrary(quality: 0 | 1 | 2 | 3 = 2) {
  const textures = new FakeTextureService();
  const library = new MaterialLibraryImpl({ textures, quality, maxAnisotropy: 16 });
  registerBaseMaterials(library);
  return { textures, library };
}

describe('bibliothèque de matériaux', () => {
  it('fournit une recette pour chaque identifiant de base', () => {
    for (const id of BASE_MATERIAL_IDS) expect(BASE_RECIPES[id], id).toBeTypeOf('function');
    const { library } = createLibrary();
    for (const id of BASE_MATERIAL_IDS) expect(library.has(id), id).toBe(true);
  });

  it('construit chaque matériau (nœuds TSL) et ne demande que des textures lib/', () => {
    const { library, textures } = createLibrary();
    for (const id of BASE_MATERIAL_IDS) {
      const m = library.get(id);
      expect(m, id).toBeInstanceOf(THREE.Material);
      expect((m as THREE.NodeMaterial).isNodeMaterial, id).toBe(true);
      expect(m.name).toBe(id);
    }
    expect(textures.requests.length).toBeGreaterThan(0);
    for (const r of textures.requests) {
      expect(r.key.startsWith('lib/'), r.key).toBe(true);
      expect(r.width).toBeGreaterThanOrEqual(64);
    }
    // Une texture partagée n'est demandée qu'une fois par clé.
    const keys = new Set(textures.requests.map((r) => r.key));
    expect(keys.size).toBeLessThanOrEqual(Object.keys(LIB_TEXTURES).length);
  });

  it('exige les caractéristiques physiques demandées', () => {
    const { library } = createLibrary();
    const phys = (id: string) => library.get(id) as THREE.MeshPhysicalNodeMaterial;
    expect(phys('copper.enamel').clearcoat).toBeGreaterThan(0.5);
    expect(phys('mask.teal').clearcoat).toBeGreaterThan(0.5);
    expect(phys('epoxy.black').clearcoat).toBeGreaterThan(0);
    expect(phys('varnish.impregnation').clearcoat).toBeGreaterThan(0);
    expect(phys('steel.ground').anisotropy).toBeGreaterThan(0.5);
    expect(phys('glass.clear').transmission).toBe(1);
    expect(phys('glass.window').transmission).toBe(1);
    expect(phys('led.green').transmission).toBeGreaterThan(0);
    expect(phys('fabric.rug').sheen).toBeGreaterThan(0);
    expect(phys('fabric.cloth').sheen).toBeGreaterThan(0);
    expect(phys('fiber.glass').sheen).toBeGreaterThan(0);
    expect(phys('silicon.die').iridescence).toBeGreaterThan(0);
  });

  it('les variantes gardent leur propre émission (setGlow)', () => {
    const { library } = createLibrary();
    const base = library.get('led.red') as THREE.MeshPhysicalNodeMaterial;
    const clone = library.variant('led.red', { name: 'LED de test' }) as THREE.MeshPhysicalNodeMaterial;
    expect(setMaterialGlow(base, 1)).toBe(true);
    expect(setMaterialGlow(clone, 0)).toBe(true);
    expect(base.emissiveIntensity).toBeGreaterThan(0);
    expect(clone.emissiveIntensity).toBe(0);
    expect(setMaterialGlow(library.get('plastic.black'), 1)).toBe(false);
  });

  it('les surcharges de variante agissent sur les propriétés lues par les nœuds', () => {
    const { library } = createLibrary();
    const v = library.variant('plastic.black', {
      color: 0xff0000,
      roughness: 0.2,
    }) as THREE.MeshPhysicalNodeMaterial;
    expect(v.color.r).toBeGreaterThan(0.9);
    expect(v.roughness).toBe(0.2);
    // Une carte de normales explicite remplace le relief procédural.
    const n = library.variant('plastic.black', {
      normalMap: new THREE.Texture(),
    }) as THREE.MeshPhysicalNodeMaterial;
    expect(n.normalNode).toBeNull();
    expect((library.get('plastic.black') as THREE.MeshPhysicalNodeMaterial).normalNode).not.toBeNull();
  });

  it('adapte la taille des textures à la qualité', () => {
    expect(libTextureSize([1024, 1024], 0)).toEqual([512, 512]);
    expect(libTextureSize([1024, 1024], 1)).toEqual([1024, 1024]);
    expect(libTextureSize([1024, 1024], 2)).toEqual([1024, 1024]);
    expect(libTextureSize([1024, 1024], 3)).toEqual([2048, 2048]);
    expect(libTextureSize([2048, 1024], 1)).toEqual([1024, 512]);
    expect(libTextureSize([2048, 1024], 3)).toEqual([2048, 1024]);
  });
});

describe('attributs géométriques d’usure', () => {
  it('soude les sommets dupliqués', () => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const { count } = weldByPosition(box.getAttribute('position'), 1e-6);
    expect(count).toBe(8);
  });

  it('arêtes convexes d’un cube subdivisé : 1 sur les arêtes, 0 au centre des faces', () => {
    const box = new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
    const { edgeWear, cavity } = computeEdgeWear(box);
    const pos = box.getAttribute('position');
    let centers = 0;
    for (let i = 0; i < pos.count; i++) {
      const coords = [Math.abs(pos.getX(i)), Math.abs(pos.getY(i)), Math.abs(pos.getZ(i))];
      const onEdge = coords.filter((c) => Math.abs(c - 0.5) < 1e-6).length >= 2;
      const faceCenter = coords.filter((c) => c < 1e-6).length === 2;
      if (onEdge) expect(edgeWear[i]).toBeCloseTo(1, 5);
      if (faceCenter) {
        expect(edgeWear[i]).toBe(0);
        centers++;
      }
      expect(cavity[i]).toBe(0);
    }
    expect(centers).toBe(6);
  });

  it('reconnaît un congé finement segmenté (angles dièdres faibles)', () => {
    // Boîte arrondie : 9 segments par face, chaque segment du congé ne tourne que de ~10°.
    const rounded = roundedBox(1, 0.1, 4);
    const { edgeWear } = computeEdgeWear(rounded, { radius: 0.12 });
    const pos = rounded.getAttribute('position');
    let onBevel = 0;
    let worn = 0;
    for (let i = 0; i < pos.count; i++) {
      const ax = Math.abs(pos.getX(i));
      const ay = Math.abs(pos.getY(i));
      // Sommets au milieu d'un congé entre les faces +x et +y.
      if (ax > 0.44 && ay > 0.44 && Math.abs(pos.getZ(i)) < 0.42) {
        onBevel++;
        if (edgeWear[i]! > 0.9) worn++;
      }
    }
    expect(onBevel).toBeGreaterThan(0);
    expect(worn / onBevel).toBeGreaterThan(0.9);
  });

  it('boîte biseautée : usure sur les congés, faces propres au centre', () => {
    const box = applyEdgeWear(createBevelledBox(0.1, 0.1, 0.1, { radius: 0.01 }), { radius: 0.012 });
    const pos = box.getAttribute('position');
    const wear = box.getAttribute('edgeWear');
    let center = 0;
    let bevel = 0;
    for (let i = 0; i < pos.count; i++) {
      const c = [Math.abs(pos.getX(i)), Math.abs(pos.getY(i)), Math.abs(pos.getZ(i))].sort((a, b) => b - a);
      // Centre de face : deux coordonnées proches de 0 ; congé : deux coordonnées > demi-côté − rayon.
      if (c[1]! < 0.012 && c[2]! < 0.012) {
        expect(wear.getX(i), 'centre').toBe(0);
        center++;
      }
      if (c[1]! > 0.043 && c[0]! > 0.043) {
        expect(wear.getX(i), 'congé').toBeGreaterThan(0.5);
        bevel++;
      }
    }
    expect(center).toBeGreaterThan(0);
    expect(bevel).toBeGreaterThan(0);
    // Normales unitaires.
    const nor = box.getAttribute('normal');
    for (let i = 0; i < nor.count; i += 17) {
      expect(Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i))).toBeCloseTo(1, 5);
    }
  });

  it('un cube retourné (normales vers l’intérieur) n’a que des creux', () => {
    const box = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2);
    const index = box.getIndex()!;
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i + 1);
      index.setX(i + 1, index.getX(i + 2));
      index.setX(i + 2, a);
    }
    const { edgeWear, cavity } = computeEdgeWear(box, { spread: 0 });
    expect(Math.max(...edgeWear)).toBe(0);
    expect(Math.max(...cavity)).toBeCloseTo(1, 5);
  });

  it('occlusion : un coin rentrant est plus occulté qu’un point dégagé', () => {
    // Deux plans perpendiculaires (sol + mur) formant un coin concave en x = 0.
    const floor = new THREE.PlaneGeometry(1, 1, 4, 4).rotateX(-Math.PI / 2).translate(0.5, 0, 0);
    const wall = new THREE.PlaneGeometry(1, 1, 4, 4).rotateY(Math.PI / 2).translate(0, 0.5, 0);
    const merged = mergeTwo(floor, wall);
    const occlusion = computeOcclusion(merged, { samples: 64, radius: 0.5 });
    const pos = merged.getAttribute('position');
    let corner = 1;
    let open = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      if (x < 1e-6 && y < 1e-6) corner = Math.min(corner, occlusion[i]!);
      if (Math.abs(x - 1) < 1e-6 && y === 0) open = Math.max(open, occlusion[i]!);
    }
    expect(corner).toBeLessThan(open);
    expect(open).toBeGreaterThan(0.8);
  });
});

/**
 * Boîte arrondie (même principe que `RoundedBoxGeometry` des addons, sans dépendre de 'three') :
 * sommets d'une boîte subdivisée projetés sur la surface arrondie.
 */
function roundedBox(size: number, radius: number, segments: number): THREE.BufferGeometry {
  const total = segments * 2 + 1;
  const g = new THREE.BoxGeometry(1, 1, 1, total, total, total);
  const pos = g.getAttribute('position');
  const half = size / 2 - radius;
  const n = new THREE.Vector3();
  const halfSegment = 0.5 / total;
  for (let i = 0; i < pos.count; i++) {
    n.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    const sx = Math.sign(n.x);
    const sy = Math.sign(n.y);
    const sz = Math.sign(n.z);
    n.set(n.x - sx * halfSegment, n.y - sy * halfSegment, n.z - sz * halfSegment).normalize();
    pos.setXYZ(i, half * sx + n.x * radius, half * sy + n.y * radius, half * sz + n.z * radius);
  }
  return g;
}

/** Fusion minimale de deux géométries indexées (position + normale). */
function mergeTwo(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  const pa = a.getAttribute('position');
  const pb = b.getAttribute('position');
  const na = a.getAttribute('normal');
  const nb = b.getAttribute('normal');
  const pos = new Float32Array((pa.count + pb.count) * 3);
  const nor = new Float32Array((pa.count + pb.count) * 3);
  pos.set(pa.array as Float32Array, 0);
  pos.set(pb.array as Float32Array, pa.count * 3);
  nor.set(na.array as Float32Array, 0);
  nor.set(nb.array as Float32Array, pa.count * 3);
  const ia = a.getIndex()!;
  const ib = b.getIndex()!;
  const idx: number[] = [];
  for (let i = 0; i < ia.count; i++) idx.push(ia.getX(i));
  for (let i = 0; i < ib.count; i++) idx.push(ib.getX(i) + pa.count);
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}
