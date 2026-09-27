/**
 * Tests de la logique pure du joueur : vitesse visée, lissage (accélération/décélération),
 * accroupissement, surface, cadence des pas et balancement de tête.
 */
import { describe, expect, it } from 'vitest';
import {
  CrouchToggle,
  CROUCH_HOLD_THRESHOLD,
  VelocitySmoother,
  capsuleHalfHeight,
  moveSpeed,
  smoothDamp,
  surfaceAt,
  wishVelocity,
  type MoveIntent,
  type Vec2,
} from '../src/player/locomotion';
import { BOB, Gait, stepLength, type GaitInput } from '../src/player/gait';
import { PLAYER, RUG } from '../src/world/layout';

const intent = (patch: Partial<MoveIntent> = {}): MoveIntent => ({
  forward: 0,
  right: 0,
  sprint: false,
  crouched: false,
  ...patch,
});

/** Simule le lissage de vitesse pendant `seconds` à `fps` images/s. */
function simulate(smoother: VelocitySmoother, target: Vec2, seconds: number, fps: number): void {
  const dt = 1 / fps;
  for (let t = 0; t < seconds - 1e-9; t += dt) smoother.update(target, dt);
}

describe('vitesse visée', () => {
  it('avance vers −Z quand le lacet est nul, pas chassé vers +X', () => {
    const v = wishVelocity(intent({ forward: 1 }), 0, { x: 0, z: 0 });
    expect(v.x).toBeCloseTo(0);
    expect(v.z).toBeCloseTo(-PLAYER.walkSpeed);
    const r = wishVelocity(intent({ right: 1 }), 0, { x: 0, z: 0 });
    expect(r.x).toBeCloseTo(PLAYER.walkSpeed);
    expect(r.z).toBeCloseTo(0);
  });

  it('tourne avec le lacet (π/2 : avancer = aller vers −X)', () => {
    const v = wishVelocity(intent({ forward: 1 }), Math.PI / 2, { x: 0, z: 0 });
    expect(v.x).toBeCloseTo(-PLAYER.walkSpeed);
    expect(v.z).toBeCloseTo(0);
  });

  it('la diagonale n’est pas plus rapide que la ligne droite', () => {
    const v = wishVelocity(intent({ forward: 1, right: 1 }), 0.3, { x: 0, z: 0 });
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(PLAYER.walkSpeed);
  });

  it('marche rapide seulement en avançant ; accroupi plus lent ; recul ralenti', () => {
    expect(moveSpeed(intent({ forward: 1, sprint: true }))).toBe(PLAYER.sprintSpeed);
    expect(moveSpeed(intent({ forward: -1, sprint: true }))).toBe(PLAYER.walkSpeed);
    expect(moveSpeed(intent({ forward: 1, sprint: true, crouched: true }))).toBe(PLAYER.crouchSpeed);
    const back = wishVelocity(intent({ forward: -1 }), 0, { x: 0, z: 0 });
    expect(Math.hypot(back.x, back.z)).toBeLessThan(PLAYER.walkSpeed);
  });

  it('aucune entrée : vitesse nulle', () => {
    const v = wishVelocity(intent(), 1, { x: 5, z: 5 });
    expect(v).toEqual({ x: 0, z: 0 });
  });
});

describe('accélération et décélération douces', () => {
  it('smoothDamp converge vers la cible sans la dépasser', () => {
    const s = { value: 0, rate: 0 };
    let previous = 0;
    for (let i = 0; i < 120; i++) {
      smoothDamp(s, 1, 0.1, 1 / 60);
      expect(s.value).toBeGreaterThanOrEqual(previous - 1e-9);
      expect(s.value).toBeLessThanOrEqual(1 + 1e-6);
      previous = s.value;
    }
    expect(s.value).toBeCloseTo(1, 3);
  });

  it('départ progressif : pas de vitesse pleine à la première image', () => {
    const v = new VelocitySmoother();
    v.update({ x: 0, z: -PLAYER.walkSpeed }, 1 / 60);
    expect(v.speed).toBeGreaterThan(0);
    expect(v.speed).toBeLessThan(PLAYER.walkSpeed * 0.2);
  });

  it('atteint ~95 % de la marche en ≈ 0,25 s et s’arrête en ≈ 0,2 s', () => {
    const v = new VelocitySmoother();
    simulate(v, { x: 0, z: -PLAYER.walkSpeed }, 0.12, 60);
    expect(v.speed).toBeLessThan(PLAYER.walkSpeed * 0.9);
    simulate(v, { x: 0, z: -PLAYER.walkSpeed }, 0.18, 60);
    expect(v.speed).toBeGreaterThan(PLAYER.walkSpeed * 0.93);
    simulate(v, { x: 0, z: 0 }, 0.22, 60);
    expect(v.speed).toBeLessThan(0.05);
  });

  it('indépendant de la fréquence d’image (30, 60, 144 i/s)', () => {
    const speeds = [30, 60, 144].map((fps) => {
      const v = new VelocitySmoother();
      simulate(v, { x: PLAYER.walkSpeed, z: 0 }, 0.2, fps);
      return v.speed;
    });
    expect(Math.abs(speeds[0]! - speeds[2]!)).toBeLessThan(0.06);
    expect(Math.abs(speeds[1]! - speeds[2]!)).toBeLessThan(0.03);
  });

  it('clipTo retire l’élan bloqué par un obstacle', () => {
    const v = new VelocitySmoother();
    simulate(v, { x: 0, z: -PLAYER.walkSpeed }, 0.5, 60);
    v.clipTo(0, 0);
    expect(v.speed).toBe(0);
  });
});

describe('accroupissement', () => {
  it('appui bref : bascule', () => {
    const c = new CrouchToggle();
    c.press(0);
    c.release(0.1);
    expect(c.wanted).toBe(true);
    c.press(2);
    c.release(2.1);
    expect(c.wanted).toBe(false);
  });

  it('appui maintenu : accroupi temporaire', () => {
    const c = new CrouchToggle();
    c.press(0);
    expect(c.wanted).toBe(true);
    c.release(CROUCH_HOLD_THRESHOLD + 0.2);
    expect(c.wanted).toBe(false);
  });

  it('capsule : sommet 10 cm au-dessus des yeux, plus basse accroupi', () => {
    const stand = capsuleHalfHeight(PLAYER.eyeHeight);
    const crouch = capsuleHalfHeight(PLAYER.crouchEyeHeight);
    expect(2 * (stand + PLAYER.radius)).toBeCloseTo(PLAYER.eyeHeight + 0.1);
    expect(crouch).toBeLessThan(stand);
    expect(crouch).toBeGreaterThan(0);
  });
});

describe('surface sous les pieds', () => {
  it('tapis au centre, béton ailleurs', () => {
    expect(surfaceAt((RUG.x[0] + RUG.x[1]) / 2, (RUG.z[0] + RUG.z[1]) / 2)).toBe('rug');
    expect(surfaceAt(RUG.x[1] + 0.2, 0)).toBe('concrete');
    expect(surfaceAt(2, 1.5)).toBe('concrete');
  });
});

/** Simule la démarche à vitesse constante. */
function walk(
  gait: Gait,
  speed: number,
  seconds: number,
  fps: number,
  patch: Partial<GaitInput> = {},
): number {
  const dt = 1 / fps;
  let steps = 0;
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    gait.update({
      dt,
      distance: speed * dt,
      speed,
      referenceSpeed: PLAYER.walkSpeed,
      crouched: false,
      sprinting: false,
      bobEnabled: true,
      time: t,
      ...patch,
    });
    if (gait.stepped) steps++;
  }
  return steps;
}

describe('cadence des pas', () => {
  it('liée à la distance : ≈ distance / longueur de pas', () => {
    const g = new Gait();
    const steps = walk(g, PLAYER.walkSpeed, 10, 60);
    const expected = (PLAYER.walkSpeed * 10) / stepLength(PLAYER.walkSpeed, false);
    expect(Math.abs(steps - expected)).toBeLessThanOrEqual(1.5);
    // Cadence de marche naturelle : 1,6 à 2,2 pas/s.
    expect(steps / 10).toBeGreaterThan(1.6);
    expect(steps / 10).toBeLessThan(2.2);
  });

  it('indépendante de la fréquence d’image', () => {
    const a = walk(new Gait(), PLAYER.walkSpeed, 6, 30);
    const b = walk(new Gait(), PLAYER.walkSpeed, 6, 144);
    expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
  });

  it('marche rapide : pas plus longs mais plus fréquents ; accroupi : plus lents', () => {
    const walkRate = walk(new Gait(), PLAYER.walkSpeed, 10, 60);
    const sprintRate = walk(new Gait(), PLAYER.sprintSpeed, 10, 60, { sprinting: true });
    const crouchRate = walk(new Gait(), PLAYER.crouchSpeed, 10, 60, { crouched: true });
    expect(stepLength(PLAYER.sprintSpeed, false)).toBeGreaterThan(stepLength(PLAYER.walkSpeed, false));
    expect(sprintRate).toBeGreaterThan(walkRate);
    expect(crouchRate).toBeLessThan(walkRate);
  });

  it('aucun pas « dans le vide » contre un mur (distance nulle)', () => {
    const g = new Gait();
    const steps = walk(g, PLAYER.walkSpeed, 3, 60, { distance: 0, speed: 0 });
    expect(steps).toBe(0);
  });

  it('premier pas rapide au départ, pied reposé à l’arrêt en milieu de foulée', () => {
    const g = new Gait();
    // Premier pas après environ une demi-longueur de pas.
    let t = 0;
    const dt = 1 / 60;
    while (!g.stepped && t < 2) {
      g.update({
        dt,
        distance: PLAYER.walkSpeed * dt,
        speed: PLAYER.walkSpeed,
        referenceSpeed: PLAYER.walkSpeed,
        crouched: false,
        sprinting: false,
        bobEnabled: true,
        time: t,
      });
      t += dt;
    }
    expect(t).toBeLessThan(0.4);
    // Avance d'une demi-foulée puis arrêt : un pas plus léger est émis.
    walk(g, PLAYER.walkSpeed, (0.6 * stepLength(PLAYER.walkSpeed, false)) / PLAYER.walkSpeed, 60);
    g.update({
      dt,
      distance: 0,
      speed: 0,
      referenceSpeed: PLAYER.walkSpeed,
      crouched: false,
      sprinting: false,
      bobEnabled: true,
      time: 5,
    });
    expect(g.stepped).toBe(true);
    expect(g.stepStrength).toBeLessThan(1);
  });
});

describe('balancement de tête', () => {
  it('amplitudes bornées et continues (aucun saut entre deux images)', () => {
    const g = new Gait();
    const dt = 1 / 60;
    let previousY = 0;
    let previousX = 0;
    let maxJump = 0;
    let maxY = 0;
    for (let i = 0; i < 600; i++) {
      // Marche, arrêt, reprise : les transitions ne doivent pas provoquer de saut.
      const moving = i < 200 || i > 350;
      const speed = moving ? PLAYER.walkSpeed : 0;
      g.update({
        dt,
        distance: speed * dt,
        speed,
        referenceSpeed: PLAYER.walkSpeed,
        crouched: false,
        sprinting: false,
        bobEnabled: true,
        time: i * dt,
      });
      maxJump = Math.max(maxJump, Math.abs(g.offsetY - previousY), Math.abs(g.offsetX - previousX));
      maxY = Math.max(maxY, Math.abs(g.offsetY));
      previousY = g.offsetY;
      previousX = g.offsetX;
    }
    expect(maxY).toBeLessThanOrEqual(BOB.vertical * 1.3 + BOB.breath + 1e-9);
    expect(maxY).toBeGreaterThan(BOB.vertical * 0.5);
    expect(maxJump).toBeLessThan(0.004);
    expect(Math.abs(g.roll)).toBeLessThanOrEqual(BOB.roll);
  });

  it('désactivé par le réglage : aucune oscillation, les pas restent comptés', () => {
    const g = new Gait();
    const steps = walk(g, PLAYER.walkSpeed, 3, 60, { bobEnabled: false });
    expect(g.offsetX).toBe(0);
    expect(g.offsetY).toBe(0);
    expect(g.roll).toBe(0);
    expect(steps).toBeGreaterThan(3);
  });

  it('s’éteint à l’arrêt (hors respiration)', () => {
    const g = new Gait();
    walk(g, PLAYER.walkSpeed, 2, 60);
    walk(g, 0, 1.5, 60, { distance: 0 });
    expect(Math.abs(g.offsetX)).toBeLessThan(0.001);
    expect(Math.abs(g.offsetY)).toBeLessThanOrEqual(BOB.breath + 0.001);
  });
});
