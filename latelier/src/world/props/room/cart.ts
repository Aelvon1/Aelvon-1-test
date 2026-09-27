/**
 * Servante d'atelier (tôle orange brûlé) : cinq tiroirs à poignées alu et porte-étiquettes, un
 * tiroir entrouvert garni de douilles, plateau à rebords, roulettes pivotantes, poignée de
 * poussée ; sur le plateau : cliquet, bombe de dégrippant, chiffon, rouleau de ruban.
 * Façade vers le sud (+Z), poignée de poussée côté est.
 */
import * as THREE from 'three/webgpu';
import { mulberry32 } from '../../lighting/neonFlicker';
import { InstanceSet, PropKit } from '../kit';
import { CART } from '../dims';
import { TINTS } from '../parts';

/** Douille 1/2" (instanciée dans le tiroir ouvert). */
export function createSocketSet(level: number): InstanceSet {
  const seg = level >= 2 ? 12 : 8;
  const g = new THREE.CylinderGeometry(0.011, 0.011, 0.038, seg, 1);
  return new InstanceSet('douilles', g, 'steel.chrome', { castShadow: false });
}

export function buildCart(kit: PropKit, sockets: InstanceSet): void {
  const [x0, x1] = CART.x;
  const [z0, z1] = CART.z;
  const W = x1 - x0;
  const D = z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const bottom = CART.casterHeight;
  const topY = CART.height - 0.035;
  const orange = { tint: TINTS.orange };
  kit.at([cx, 0, cz], [0, 0, 0], () => {
    // Caisson.
    kit.box(
      'world.props.paint',
      [0, (bottom + topY) / 2, -0.01],
      [W, topY - bottom, D - 0.02],
      0.01,
      orange,
      [0, 0, 0],
      2,
    );
    // Plateau à rebords (tapis caoutchouc au fond).
    kit.box('world.props.paint', [0, topY + 0.004, 0], [W + 0.01, 0.008, D + 0.006], 0.003, orange);
    kit.box('rubber.black', [0, topY + 0.0085, 0], [W - 0.03, 0.002, D - 0.03], 0.001, { castShadow: false });
    for (const [x, z, w, d] of [
      [0, -D / 2, W + 0.01, 0.01],
      [0, D / 2, W + 0.01, 0.01],
      [-W / 2, 0, 0.01, D],
      [W / 2, 0, 0.01, D],
    ] as const) {
      kit.box('world.props.paint', [x, topY + 0.02, z], [w, 0.04, d], 0.003, orange);
    }
    kit.decal('cartPlate', [0, topY - 0.022, D / 2 - 0.02 + 0.0008], [0.12, 0.031]);
    // Tiroirs (de haut en bas).
    const labels = ['cartSockets', 'cartKeys', 'cartElec', 'cartMisc', 'cartRC'];
    let y = topY - 0.05;
    CART.drawers.forEach((h, k) => {
      const open = k === CART.openDrawer ? CART.openBy : 0;
      const yc = y - h / 2;
      const fz = D / 2 - 0.02 + open;
      kit.plate(
        'world.props.paint',
        [0, yc, fz + 0.007],
        [W - 0.03, h - 0.008, 0.014],
        0.006,
        0.003,
        [0, 0, 0],
        orange,
      );
      // Poignée alu pleine largeur sur deux pattes.
      kit.box('alu.machined', [0, yc + h / 2 - 0.022, fz + 0.03], [W - 0.1, 0.012, 0.016], 0.004);
      for (const x of [-(W - 0.1) / 2 + 0.01, (W - 0.1) / 2 - 0.01])
        kit.box('alu.machined', [x, yc + h / 2 - 0.022, fz + 0.02], [0.012, 0.012, 0.018], 0.002);
      // Porte-étiquette (cadre tôle) + étiquette.
      kit.box('steel.zinc', [0, yc - 0.004, fz + 0.0145], [0.072, 0.024, 0.002], 0.001, {
        castShadow: false,
      });
      kit.decal(labels[k]!, [0, yc - 0.004, fz + 0.0158], [0.062, 0.017]);
      if (open > 0) {
        // Flancs visibles et bac garni de douilles.
        for (const x of [-W / 2 + 0.03, W / 2 - 0.03])
          kit.box('world.props.paint', [x, yc - 0.005, fz - 0.06], [0.004, h - 0.02, 0.12], 0.001, orange);
        kit.box('rubber.black', [0, yc - h / 2 + 0.012, fz - 0.06], [W - 0.07, 0.003, 0.12], 0.001, {
          castShadow: false,
        });
        const rand = mulberry32(5);
        for (let i = 0; i < 14; i++) {
          const sx = -W / 2 + 0.06 + i * ((W - 0.12) / 13);
          const radius = 0.009 + (i / 13) * 0.006;
          kit.instance(
            sockets,
            PropKit.place(
              [sx, yc - h / 2 + 0.014 + radius, fz - 0.035 - rand() * 0.012],
              [0, 0, Math.PI / 2 + (rand() - 0.5) * 0.2],
              [radius / 0.011, 1, radius / 0.011],
            ),
          );
        }
      }
      y -= h + 0.012;
    });
    // Poignée de poussée (tube chromé) côté est.
    const hx = W / 2 + CART.handleOut - 0.012;
    kit.cylinder(
      'steel.chrome',
      [hx, topY - 0.02, -D / 2 + 0.06],
      [hx, topY - 0.02, D / 2 - 0.08],
      0.012,
      14,
    );
    for (const z of [-D / 2 + 0.06, D / 2 - 0.08])
      kit.cylinder('steel.chrome', [W / 2, topY - 0.02, z], [hx + 0.006, topY - 0.02, z], 0.009, 10);
    // Roulettes pivotantes.
    for (const [x, z] of [
      [-W / 2 + 0.05, -D / 2 + 0.05],
      [W / 2 - 0.05, -D / 2 + 0.05],
      [-W / 2 + 0.05, D / 2 - 0.07],
      [W / 2 - 0.05, D / 2 - 0.07],
    ] as const) {
      kit.box('steel.zinc', [x, bottom - 0.004, z], [0.06, 0.008, 0.06], 0.002);
      kit.cylinder('steel.zinc', [x, bottom - 0.008, z], [x, bottom - 0.022, z], 0.01, 8);
      kit.box('steel.zinc', [x, bottom - 0.04, z - 0.01], [0.04, 0.045, 0.004], 0.002);
      kit.cylinder('rubber.black', [x - 0.015, 0.035, z - 0.018], [x + 0.015, 0.035, z - 0.018], 0.035, 16);
      kit.cylinder('steel.zinc', [x - 0.02, 0.035, z - 0.018], [x + 0.02, 0.035, z - 0.018], 0.004, 6, {
        castShadow: false,
      });
    }
    // Sur le plateau : cliquet, rouleau de ruban, chiffon.
    const top = topY + 0.0095;
    kit.box('steel.chrome', [-0.12, top + 0.008, 0.05], [0.2, 0.012, 0.022], 0.005, {}, [0, 0.5, 0]);
    kit.cylinder('steel.chrome', [-0.21, top, 0.1], [-0.21, top + 0.024, 0.1], 0.02, 16);
    kit.lathe(
      'tape.yellow',
      [
        [0.028, 0],
        [0.045, 0],
        [0.045, 0.019],
        [0.028, 0.019],
        [0.028, 0],
      ],
      [0.18, top, -0.1],
      [0, 0, 0],
      24,
    );
    rag(kit, [0.06, top, -0.06], 0.3);
  });
}

/** Chiffon froissé : plan subdivisé déformé par un bruit déterministe. */
export function rag(kit: PropKit, center: readonly [number, number, number], yaw: number, size = 0.26): void {
  const g = new THREE.PlaneGeometry(size, size * 0.8, 10, 8);
  g.rotateX(-Math.PI / 2);
  const pos = g.getAttribute('position');
  const rand = mulberry32(Math.round(center[0] * 1000 + center[2] * 100));
  const bumps = Array.from({ length: 6 }, () => [
    rand() * size - size / 2,
    rand() * size - size / 2,
    0.01 + rand() * 0.025,
  ]);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    let y = 0.002;
    for (const [bx, bz, bh] of bumps) y += bh! * Math.exp(-((x - bx!) ** 2 + (z - bz!) ** 2) / 0.002);
    const edge = Math.max(Math.abs(x) / (size / 2), Math.abs(z) / (size * 0.4));
    pos.setY(i, y * (1 - edge * 0.6) + (rand() - 0.5) * 0.003);
  }
  g.computeVertexNormals();
  kit.add('fabric.cloth', g, PropKit.place([center[0], center[1], center[2]], [0, yaw, 0]), {
    edge: 'none',
    castShadow: false,
  });
}
