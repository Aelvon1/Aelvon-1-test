/**
 * Accessoires et outils de l'atelier (agent « accessoires »).
 *
 * `World.build()` appelle `buildProps(ctx, world, progress)` APRÈS la coque, l'établi et les
 * luminaires, et AVANT la capture de la carte d'environnement et le calcul des ombres
 * statiques : tout ce qui est ajouté ici apparaît dans les reflets et projette ses ombres.
 *
 * Contenu :
 * - établi : oscilloscope (trace qui défile), alimentation (afficheurs 7 segments), multimètre,
 *   station de soudage et fer sur son support, station à air chaud, pompe à dessouder, tresse,
 *   étain, flux, brucelles, étau, casier à tiroirs transparents, multiprise — tapis DÉGAGÉ ;
 * - panneau perforé : tournevis, clés Allen, clés mixtes, pinces, extracteur, maillet, pied à
 *   coulisse, scie à métaux, sur chevilles instanciées, silhouettes peintes ;
 * - pièce : étagères (bidons, cartons, bocaux de vis instanciées), servante, tabouret, bureau
 *   électronique et radio-cassette, table RC et buggy en réparation, ventilateur, extincteur,
 *   poubelle, tapis, affiches, calendrier, rallonges au mur.
 *
 * Performance : géométrie statique fusionnée PAR MATÉRIAU (teinte par sommet → toutes les tôles
 * peintes en un appel, tous les plastiques en un autre, tous les décalques de l'atlas en un
 * autre), instanciation de la visserie, des chevilles, des composants et des douilles ; petits
 * objets sans ombre portée ; aucune allocation par image (lectures recalculées seulement quand la
 * valeur change). Collisions : `propColliderSpecs()` (volumes simplifiés, testés sans Rapier).
 */
import * as THREE from 'three/webgpu';
import type { AppContext } from '../../core/context';
import type { FrameInfo } from '../../core/Engine';
import type { QualityProfile } from '../../core/quality';
import { yieldToMain } from '../../core/scheduler';
import type { Interactable } from '../types';
import type { World } from '../World';
import { atlasDrawParams, ATLAS_SIZE } from './atlas';
import { InstanceSet, PropKit } from './kit';
import { PropMaterials } from './materials';
import { propColliderSpecs } from './colliders';
import { formatDisplay } from './sevenSeg';
import { blink, heaterLed, hotAirTemperature, multimeterReading, psuReadings } from './live';
import { buildInstruments } from './bench/instruments';
import { buildSoldering } from './bench/soldering';
import { buildDrawerCabinet, buildPowerStrip, buildVise } from './bench/benchFixtures';
import { buildPegboardTools, createPegGeometry } from './pegboard/tools';
import { buildShelves, createHardwareSets } from './room/shelves';
import { buildCart, createSocketSet } from './room/cart';
import { buildDesk } from './room/desk';
import { buildRcTable } from './room/rcTable';
import { buildFloorItems } from './room/floor';
import { buildWallItems } from './room/wall';
import { Radio } from './room/radio';
import { Fan } from './room/fan';

export interface PropsStats {
  /** Maillages fusionnés (un par matériau). */
  meshes: number;
  instancedMeshes: number;
  instances: number;
  /** Triangles de la géométrie des accessoires (instances comprises, avant découpage). */
  triangles: number;
}

export interface PropsHandle {
  /** Animation des accessoires (appelée à chaque image). */
  update(frame: FrameInfo): void;
  /** Éléments interactifs ajoutés par les accessoires. */
  interactables: Interactable[];
  /** Libère géométries, matériaux propres, collisions et sons. */
  dispose(): void;
  /** Statistiques de construction (debug, rapport). */
  stats: PropsStats;
}

/** Géométrie d'un petit composant en vrac (résistance, condensateur) : capsule courte. */
function createComponentGeometry(level: number): THREE.BufferGeometry {
  return new THREE.CapsuleGeometry(0.0014, 0.005, 2, level >= 2 ? 6 : 4);
}

/** Crée les maillages instanciés (matrices déjà en repère monde). */
function buildInstanced(
  sets: Iterable<InstanceSet>,
  resolve: (id: string) => THREE.Material,
): THREE.InstancedMesh[] {
  const out: THREE.InstancedMesh[] = [];
  for (const set of sets) {
    if (set.count === 0) {
      set.geometry.dispose();
      continue;
    }
    const mesh = new THREE.InstancedMesh(set.geometry, resolve(set.material), set.count);
    set.matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    if (set.colors.length === set.count) set.colors.forEach((c, i) => mesh.setColorAt(i, c));
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.name = `Instances · ${set.name}`;
    mesh.castShadow = set.options.castShadow ?? false;
    mesh.receiveShadow = set.options.receiveShadow ?? true;
    mesh.matrixAutoUpdate = false;
    mesh.computeBoundingSphere();
    out.push(mesh);
  }
  return out;
}

function triangles(g: THREE.BufferGeometry): number {
  return (g.index ? g.index.count : g.getAttribute('position').count) / 3;
}

/** Cache des valeurs affichées (recalcul des codes seulement quand la valeur change). */
interface DisplayCache {
  value: number;
}

/**
 * Construit les accessoires du décor dans `world.propsRoot`, enregistre leurs collisions et
 * retourne leur poignée (animation, interactions, libération).
 */
export async function buildProps(
  ctx: AppContext,
  world: World,
  progress: (value: number, label: string) => void,
): Promise<PropsHandle> {
  const quality = ctx.engine.quality;
  const level = quality.level;
  // Atlas : 2048 px en Élevé/Ultra, 1024 px sinon (les coordonnées de dessin sont en 2048).
  const atlasPx = quality.textureSize >= ATLAS_SIZE ? ATLAS_SIZE : ATLAS_SIZE / 2;
  const atlas = ctx.textures.get({
    key: 'world/props/atlas',
    generator: 'drawlist',
    width: atlasPx,
    height: atlasPx,
    colorSpace: 'srgb',
    wrap: 'clamp',
    params: atlasDrawParams(),
  });
  const mats = new PropMaterials(ctx, world, atlas);
  const kit = new PropKit(level);
  const rotorKit = new PropKit(level);
  const pegs = new InstanceSet('chevilles', createPegGeometry(), 'steel.zinc', { castShadow: true });
  const components = new InstanceSet('composants', createComponentGeometry(level), 'plastic.white');
  const hardware = createHardwareSets(level);
  const sockets = createSocketSet(level);

  progress(0.02, 'Appareils de l’établi…');
  buildInstruments(kit);
  buildSoldering(kit);
  buildVise(kit);
  buildDrawerCabinet(kit, components);
  buildPowerStrip(kit);
  await yieldToMain();
  progress(0.25, 'Outils du panneau perforé…');
  buildPegboardTools(kit, pegs);
  await yieldToMain();
  progress(0.45, 'Étagères, servante et bureau…');
  buildShelves(kit, hardware, 'glass.clear');
  buildCart(kit, sockets);
  buildDesk(kit);
  buildRcTable(kit);
  buildFloorItems(kit);
  buildWallItems(kit);
  const radio = new Radio(ctx, mats.u);
  radio.build(kit);
  const fan = new Fan(ctx, mats.u);
  fan.build(kit, rotorKit);
  await yieldToMain();

  progress(0.7, 'Fusion des accessoires…');
  const resolve = (id: string) => mats.get(id);
  const root = world.propsRoot;
  const meshes = kit.main.build(resolve, 'Accessoires');
  const decals = kit.decals.build(resolve, 'Décalques des accessoires');
  const rotorMeshes = rotorKit.main.build(resolve, 'Rotor');
  const instanced = buildInstanced(kit.instances.values(), resolve);
  for (const m of meshes) root.add(m);
  for (const m of decals) {
    m.castShadow = false;
    root.add(m);
  }
  for (const m of instanced) root.add(m);
  root.add(fan.rotor);
  radio.bind(meshes);
  fan.bind(meshes, rotorMeshes);
  const drawerMeshes = meshes.filter((m) => m.material === mats.drawerMaterial());
  await yieldToMain();

  // Collisions (volumes simplifiés au sol).
  const removers = propColliderSpecs().map((spec) => ctx.physics.addStatic(spec));

  // Qualité : tiroirs à transmission (Moyen et plus) ou simple transparence (Bas).
  const applyQuality = (profile: QualityProfile) => {
    mats.setDrawerQuality(profile.level);
    const material = mats.drawerMaterial();
    for (const m of drawerMeshes) m.material = material;
  };
  const offQuality = ctx.engine.onQualityChange(applyQuality);

  const stats: PropsStats = {
    meshes: meshes.length + decals.length + rotorMeshes.length,
    instancedMeshes: instanced.length,
    instances: instanced.reduce((n, m) => n + m.count, 0),
    triangles: Math.round(
      [...meshes, ...decals, ...rotorMeshes].reduce((n, m) => n + triangles(m.geometry), 0) +
        instanced.reduce((n, m) => n + triangles(m.geometry) * m.count, 0),
    ),
  };
  progress(1, 'Accessoires prêts');

  // --- Animation (aucune allocation par image) -------------------------------------------
  const u = mats.u;
  const cacheV: DisplayCache = { value: NaN };
  const cacheA: DisplayCache = { value: NaN };
  const cacheT: DisplayCache = { value: NaN };
  const cacheM: DisplayCache = { value: NaN };
  const setSeg = (index: 0 | 1 | 2, cache: DisplayCache, value: number, digits: number, decimals: number) => {
    if (value === cache.value) return;
    cache.value = value;
    const d = formatDisplay(value, digits, decimals);
    u.segCodes[index].value.set(d.codes[0] ?? 0, d.codes[1] ?? 0, d.codes[2] ?? 0, d.codes[3] ?? 0);
    u.segDp.value.setComponent(index, d.dp);
  };

  const update = (frame: FrameInfo) => {
    const t = frame.time;
    const psu = psuReadings(t);
    setSeg(0, cacheV, psu.volts, 3, 1);
    setSeg(1, cacheA, psu.amps, 3, 2);
    setSeg(2, cacheT, hotAirTemperature(t), 3, 0);
    const reading = multimeterReading(t);
    if (reading !== cacheM.value) {
      cacheM.value = reading;
      const d = formatDisplay(reading, 4, 2);
      u.lcdCodes.value.set(d.codes[0] ?? 0, d.codes[1] ?? 0, d.codes[2] ?? 0, d.codes[3] ?? 0);
      u.lcdDp.value = d.dp;
    }
    // Voyants : chauffe du fer, radio, chargeur, montage à 555 (alterné), air chaud.
    u.ledA.value.set(heaterLed(t), u.radioOn.value, blink(t, 1.2, 0.5), blink(t, 0.62, 0.5));
    u.ledB.value.set(blink(t, 0.62, 0.5, 0.31), 0.35 + 0.65 * blink(t, 2.4, 0.8), 0, 0);
    radio.update(frame.dt);
    fan.update(frame.dt);
  };

  const dispose = () => {
    offQuality();
    for (const remove of removers) remove();
    radio.dispose();
    fan.dispose();
    for (const m of instanced) m.dispose();
    for (const m of [...meshes, ...decals, ...rotorMeshes]) m.geometry.dispose();
    root.remove(fan.rotor);
  };

  return { update, interactables: [radio.interactable, fan.interactable], dispose, stats };
}
