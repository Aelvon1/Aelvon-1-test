/**
 * Étiquettes et marquages (touches vives, marques INVENTÉES) : ruban de masquage annoté au-dessus
 * de l'interrupteur, plaquette de la prise de l'établi, plaque signalétique du néon, marquage
 * « zone ESD » imprimé sur le tapis, panneau sur la porte, ruban adhésif jaune de réparation.
 * Textures générées dans le worker (générateur `label`, clés `world/label/…`).
 */
import * as THREE from 'three/webgpu';
import { float, texture, uv, vec3 } from 'three/tsl';
import type { AppContext } from '../../core/context';
import { DOOR, MAT, ROOM, SPOTS, WINDOW } from '../layout';
import { addBox, place } from '../geometry/shapes';
import { DOOR_DETAIL, ELECTRIC, WINDOW_DETAIL } from './dims';
import type { DecorBuild } from './types';

interface LabelSpec {
  name: string;
  /** Largeur × hauteur (m). */
  size: readonly [number, number];
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
  params: Record<string, unknown>;
  /** Pixels par mètre de la texture. */
  density?: number;
}

const LABELS: readonly LabelSpec[] = [
  {
    name: 'switch',
    size: [0.082, 0.026],
    position: [SPOTS.lightSwitch[0], SPOTS.lightSwitch[1] + 0.085, ROOM.maxZ - 0.0015],
    rotation: [0, Math.PI, 0.03],
    params: {
      style: 'tag',
      title: 'ÉCLAIRAGE',
      subtitle: 'néon + ampoule',
      paper: '#e6d8a8',
      ink: '#27231d',
      aging: 0.6,
    },
  },
  {
    name: 'outlet',
    size: [0.07, 0.024],
    position: [ELECTRIC.outlet[0], ELECTRIC.outlet[1] + 0.098, ROOM.minZ + 0.0015],
    rotation: [0, 0, -0.02],
    params: {
      style: 'plate',
      title: 'ÉTABLI 16 A',
      subtitle: '230 V ~ · circuit 3',
      paper: '#d9d2bd',
      ink: '#1f1d1a',
      aging: 0.5,
    },
  },
  {
    name: 'neon',
    size: [0.09, 0.022],
    position: [SPOTS.neonTube[0] - 0.3, SPOTS.neonTube[1] + 0.047, SPOTS.neonTube[2] + 0.0465],
    rotation: [0, 0, 0],
    params: {
      style: 'plate',
      title: 'LUMAFLEX',
      subtitle: 'T8 · 36 W · 230 V · 1984',
      paper: '#bcb6a4',
      ink: '#2a2824',
      aging: 0.45,
    },
  },
  {
    name: 'mat',
    size: [0.1, 0.065],
    position: [
      MAT.center[0] - MAT.size[0] / 2 + 0.065,
      MAT.center[1] + 0.0004,
      MAT.center[2] + MAT.size[1] / 2 - 0.045,
    ],
    rotation: [-Math.PI / 2, 0, 0],
    params: { style: 'warning', title: 'ZONE ESD', subtitle: 'Bracelet relié à la terre', aging: 0.35 },
  },
  {
    name: 'door',
    size: [0.24, 0.12],
    position: [(DOOR.x[0] + DOOR.x[1]) / 2, 1.58, DOOR_DETAIL.leafZ[0] - 0.0085],
    rotation: [0, Math.PI, 0.015],
    params: {
      style: 'warning',
      title: 'ATELIER',
      subtitle: 'Fermer la porte — humidité',
      aging: 0.55,
    },
  },
];

/** Ajoute les étiquettes (un maillage par étiquette : quelques appels de dessin). */
export function buildLabels(ctx: AppContext, b: DecorBuild): void {
  for (const spec of LABELS) {
    const density = spec.density ?? 3200;
    const tex = ctx.textures.get({
      key: `world/label/${spec.name}`,
      generator: 'label',
      width: Math.min(1024, Math.round(spec.size[0] * density)),
      height: Math.min(1024, Math.round(spec.size[1] * density)),
      colorSpace: 'srgb',
      wrap: 'clamp',
      params: spec.params,
    });
    const material = new THREE.MeshStandardNodeMaterial({
      roughness: 0.78,
      metalness: 0,
      alphaTest: 0.5,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const sample = texture(tex, uv());
    // Encre et papier légèrement ternis par la poussière.
    material.colorNode = sample.rgb.mul(vec3(0.92, 0.9, 0.86));
    material.opacityNode = sample.a;
    material.roughnessNode = float(0.8);
    b.materials.adopt(`world.label.${spec.name}`, material);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(spec.size[0], spec.size[1]), material);
    mesh.name = `Étiquette ${spec.name}`;
    mesh.position.set(...spec.position);
    mesh.rotation.set(...spec.rotation);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    b.group.add(mesh);
  }
  // Ruban adhésif jaune : réparation d'un carreau fêlé (coin de la fenêtre) et repère sur le conduit.
  const tape = 'tape.yellow';
  const gz0 = WINDOW.z[0] + WINDOW_DETAIL.frameWidth;
  const gy1 = WINDOW.y[1] - WINDOW_DETAIL.frameWidth;
  // Côté intérieur de la vitre (plan x = glassX).
  const tx = WINDOW_DETAIL.glassX + 0.0009;
  b.batch.add(
    tape,
    new THREE.BoxGeometry(0.001, 0.02, 0.11),
    place([tx, gy1 - 0.07, gz0 + 0.08], [0.62, 0, 0]),
    {
      castShadow: false,
    },
  );
  b.batch.add(
    tape,
    new THREE.BoxGeometry(0.001, 0.02, 0.08),
    place([tx, gy1 - 0.075, gz0 + 0.075], [-0.7, 0, 0]),
    {
      castShadow: false,
    },
  );
  addBox(b.batch, tape, [1.068, 1.62, ROOM.maxZ - 0.036], [1.092, 1.66, ROOM.maxZ - 0.012], 0.003, {
    castShadow: false,
  });
}
