/**
 * Tests de la logique pure du décor : scintillement du néon, travelling d'accueil,
 * cinématique inverse de la lampe loupe, plan de la salle.
 */
import { describe, expect, it } from 'vitest';
import { NeonFlicker, mulberry32 } from '../../src/world/lighting/neonFlicker';
import {
  HOME_CAMERA_KEYS,
  HOME_SEGMENT_SECONDS,
  homeCameraPose,
  type HomeCameraPose,
} from '../../src/world/camera/homeCamera';
import { solveTwoLink } from '../../src/world/room/lampIK';
import { BENCH, MAT, PEGBOARD, ROOM, SPOTS, WINDOW } from '../../src/world/layout';

describe('néon (scintillement)', () => {
  it('démarre avec des claquements puis se stabilise en moins de 3 s', () => {
    let clicks = 0;
    const neon = new NeonFlicker(42, () => clicks++);
    neon.randomBursts = false;
    neon.setPower(true);
    expect(neon.phase).toBe('starting');
    for (let i = 0; i < 180; i++) neon.update(1 / 60);
    expect(neon.phase).toBe('stable');
    expect(clicks).toBeGreaterThanOrEqual(2);
    expect(neon.output).toBeGreaterThan(0.95);
  });

  it('reste borné et produit des crises aléatoires en régime établi', () => {
    let clicks = 0;
    const neon = new NeonFlicker(7, () => clicks++);
    neon.setPower(true, true);
    let min = 1;
    for (let i = 0; i < 60 * 60; i++) {
      neon.update(1 / 60);
      expect(neon.output).toBeGreaterThanOrEqual(0);
      expect(neon.output).toBeLessThanOrEqual(1);
      expect(neon.buzz).toBeGreaterThanOrEqual(0);
      expect(neon.buzz).toBeLessThanOrEqual(1);
      min = Math.min(min, neon.output);
    }
    // En une minute : au moins une crise (intervalle 7..22 s) visible.
    expect(min).toBeLessThan(0.8);
    expect(clicks).toBeGreaterThan(0);
  });

  it('est déterministe pour une graine donnée', () => {
    const run = (seed: number) => {
      const neon = new NeonFlicker(seed);
      neon.setPower(true);
      const samples: number[] = [];
      for (let i = 0; i < 600; i++) {
        neon.update(1 / 60);
        samples.push(neon.output);
      }
      return samples;
    };
    expect(run(3)).toEqual(run(3));
    expect(run(3)).not.toEqual(run(4));
  });

  it('s’éteint immédiatement hors tension', () => {
    const neon = new NeonFlicker(1);
    neon.setPower(true, true);
    neon.update(0.016);
    neon.setPower(false);
    neon.update(0.016);
    expect(neon.output).toBe(0);
    expect(neon.powered).toBe(false);
  });

  it('mulberry32 reste dans [0, 1[', () => {
    const r = mulberry32(99);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('travelling de l’accueil', () => {
  const pose = (): HomeCameraPose => ({ position: [0, 0, 0], target: [0, 0, 0] });

  it('reste dans la pièce, au-dessus de l’établi et loin des murs', () => {
    const out = pose();
    const loop = HOME_CAMERA_KEYS.length * HOME_SEGMENT_SECONDS;
    for (let t = 0; t < loop; t += 0.25) {
      homeCameraPose(t, out);
      const [x, y, z] = out.position;
      expect(x).toBeGreaterThan(ROOM.minX + 0.6);
      expect(x).toBeLessThan(ROOM.maxX - 0.5);
      expect(z).toBeGreaterThan(BENCH.z[1] + 0.3);
      expect(z).toBeLessThan(ROOM.maxZ - 0.3);
      expect(y).toBeGreaterThan(1.1);
      expect(y).toBeLessThan(2.2);
    }
  });

  it('est continu et boucle sans saut', () => {
    const a = pose();
    const b = pose();
    const loop = HOME_CAMERA_KEYS.length * HOME_SEGMENT_SECONDS;
    for (let t = 0; t < loop; t += 0.05) {
      homeCameraPose(t, a);
      homeCameraPose(t + 0.05, b);
      const d = Math.hypot(
        a.position[0] - b.position[0],
        a.position[1] - b.position[1],
        a.position[2] - b.position[2],
      );
      expect(d).toBeLessThan(0.05);
    }
    homeCameraPose(0, a);
    homeCameraPose(loop, b);
    // Seul le flottement (fonction du temps absolu) diffère d'un tour à l'autre.
    expect(Math.abs(a.position[0] - b.position[0])).toBeLessThan(0.03);
  });

  it('est déterministe', () => {
    const a = homeCameraPose(12.34, pose());
    const b = homeCameraPose(12.34, pose());
    expect(a).toEqual(b);
  });
});

describe('lampe loupe (cinématique inverse)', () => {
  it('atteint une cible accessible', () => {
    const l1 = 0.44;
    const l2 = 0.42;
    for (const [r, h] of [
      [0.4, 0.35],
      [0.7, 0.3],
      [0.2, -0.1],
      [0.5, 0.0],
    ] as const) {
      const s = solveTwoLink(r, h, l1, l2);
      expect(s.reachable).toBe(true);
      const wr = s.elbowR + l2 * Math.sin(s.a2);
      const wh = s.elbowH + l2 * Math.cos(s.a2);
      expect(wr).toBeCloseTo(r, 5);
      expect(wh).toBeCloseTo(h, 5);
      // Coude au-dessus de la droite épaule → poignet (solution « coude en haut »).
      expect(s.elbowH * r - s.elbowR * h).toBeGreaterThan(-1e-9);
    }
  });

  it('tend le bras vers une cible hors d’atteinte sans NaN', () => {
    const s = solveTwoLink(2, 1, 0.44, 0.42);
    expect(s.reachable).toBe(false);
    expect(Number.isFinite(s.a1)).toBe(true);
    expect(Number.isFinite(s.a2)).toBe(true);
  });
});

describe('plan de la salle', () => {
  it('respecte 20 m² et les dimensions du tapis', () => {
    expect(ROOM.width * ROOM.depth).toBeLessThanOrEqual(20);
    expect(MAT.size[0]).toBeGreaterThanOrEqual(0.6);
    expect(MAT.size[1]).toBeGreaterThanOrEqual(0.5);
    // Tapis entièrement sur le plateau, surface = dessus du plateau + épaisseur.
    expect(MAT.center[0] - MAT.size[0] / 2).toBeGreaterThan(BENCH.x[0]);
    expect(MAT.center[0] + MAT.size[0] / 2).toBeLessThan(BENCH.x[1]);
    expect(MAT.center[2] - MAT.size[1] / 2).toBeGreaterThan(BENCH.z[0]);
    expect(MAT.center[2] + MAT.size[1] / 2).toBeLessThan(BENCH.z[1]);
    expect(MAT.center[1]).toBeCloseTo(BENCH.topHeight + MAT.thickness, 6);
  });

  it('place les éléments dans la pièce', () => {
    expect(WINDOW.x).toBe(ROOM.minX);
    expect(PEGBOARD.z).toBeGreaterThan(ROOM.minZ);
    for (const [x, y, z] of Object.values(SPOTS)) {
      expect(x).toBeGreaterThanOrEqual(ROOM.minX);
      expect(x).toBeLessThanOrEqual(ROOM.maxX);
      expect(z).toBeGreaterThanOrEqual(ROOM.minZ);
      expect(z).toBeLessThanOrEqual(ROOM.maxZ);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(ROOM.height);
    }
  });
});
