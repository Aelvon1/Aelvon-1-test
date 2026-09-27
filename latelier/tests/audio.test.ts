/**
 * Tests des utilitaires audio purs : enveloppes, rampes sans clic, planification aléatoire,
 * limiteur de polyphonie, tampons procéduraux et composition générative de la radio.
 */
import { describe, expect, it } from 'vitest';
import {
  EXP_FLOOR,
  adsr,
  applyEnvelope,
  envelopeDuration,
  envelopeValueAt,
  percussive,
  smoothParam,
  type AudioParamLike,
} from '../src/audio/envelope';
import { RandomEventTrack, VoiceLimiter, nextPoissonTime } from '../src/audio/scheduling';
import {
  brownNoise,
  makeSeamless,
  pinkNoise,
  renderImpacts,
  renderRoomImpulse,
  rms,
  whiteNoise,
} from '../src/audio/buffers';
import { SCALES, composeSong, isInScale, songDuration, voiceLead } from '../src/audio/music';
import { dbToGain, gainToDb, jitter, midiToHz, mulberry32, volumeToGain } from '../src/audio/math';

/** Doublure d'`AudioParam` qui enregistre les appels. */
class FakeParam implements AudioParamLike {
  value = 0.5;
  readonly calls: [string, ...number[]][] = [];
  setValueAtTime(value: number, time: number) {
    this.calls.push(['set', value, time]);
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.calls.push(['linear', value, time]);
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    this.calls.push(['exp', value, time]);
  }
  setTargetAtTime(value: number, time: number, tc: number) {
    this.calls.push(['target', value, time, tc]);
  }
  cancelScheduledValues(time: number) {
    this.calls.push(['cancel', time]);
  }
}

describe('utilitaires numériques', () => {
  it('volume → gain : bornes et courbe perceptive', () => {
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(1)).toBe(1);
    expect(gainToDb(volumeToGain(0.5))).toBeCloseTo(-12.04, 1);
    expect(volumeToGain(2)).toBe(1);
    expect(volumeToGain(Number.NaN)).toBe(0);
  });

  it('conversions dB et notes MIDI', () => {
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3);
    expect(midiToHz(69)).toBeCloseTo(440);
    expect(midiToHz(81)).toBeCloseTo(880);
  });

  it('générateur reproductible et variations bornées', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
    const rng = mulberry32(1);
    for (let i = 0; i < 1000; i++) {
      const j = jitter(rng, 0.05);
      expect(j).toBeGreaterThanOrEqual(0.95);
      expect(j).toBeLessThanOrEqual(1.05);
    }
  });
});

describe('enveloppes', () => {
  it('percussive : départ à 0, pic à l’attaque, extinction finale', () => {
    const env = percussive(0.01, 0.2, 0.8);
    expect(envelopeValueAt(env, 0)).toBe(0);
    expect(envelopeValueAt(env, 0.01)).toBeCloseTo(0.8);
    expect(envelopeValueAt(env, 0.005)).toBeCloseTo(0.4);
    // −60 dB à la fin de la décroissance.
    expect(envelopeValueAt(env, 0.21 - 1e-6)).toBeLessThan(0.8 * 0.0011);
    expect(envelopeValueAt(env, 1)).toBe(0);
    expect(envelopeDuration(env)).toBeCloseTo(0.211, 3);
  });

  it('ADSR : maintien, relâchement depuis le niveau atteint, instants croissants', () => {
    const shape = { attack: 0.02, decay: 0.1, sustain: 0.5, release: 0.2 };
    const long = adsr(shape, 0.5);
    expect(envelopeValueAt(long, 0.3)).toBeCloseTo(0.5);
    expect(envelopeValueAt(long, 0.5)).toBeCloseTo(0.5);
    expect(envelopeValueAt(long, 0.8)).toBe(0);
    for (let i = 1; i < long.length; i++) expect(long[i]!.time).toBeGreaterThanOrEqual(long[i - 1]!.time);
    // Note plus courte que l'attaque : relâchement depuis le niveau partiel (pas de saut).
    const short = adsr(shape, 0.01);
    expect(envelopeValueAt(short, 0.01)).toBeCloseTo(0.5, 1);
    expect(envelopeValueAt(short, 0.0101)).toBeLessThanOrEqual(0.5 + 1e-6);
  });

  it('applyEnvelope programme les segments au bon instant et à la bonne échelle', () => {
    const p = new FakeParam();
    const end = applyEnvelope(p, percussive(0.01, 0.1), 2, 0.5);
    expect(p.calls[0]).toEqual(['set', 0, 2]);
    expect(p.calls[1]).toEqual(['linear', 0.5, 2.01]);
    expect(p.calls[2]![0]).toBe('exp');
    expect(p.calls[2]![1]).toBeGreaterThanOrEqual(EXP_FLOOR);
    expect(end).toBeCloseTo(2.111, 3);
  });

  it('smoothParam fige la valeur courante puis rampe (aucun saut)', () => {
    const p = new FakeParam();
    smoothParam(p, 1, 3, 0.2);
    // Sans cancelAndHoldAtTime (doublure) : annulation + maintien de la valeur courante.
    expect(p.calls).toEqual([
      ['cancel', 3],
      ['set', 0.5, 3],
      ['linear', 1, 3.2],
    ]);
  });
});

describe('planification', () => {
  it('processus de Poisson : taux moyen respecté, instants croissants', () => {
    const rng = mulberry32(7);
    const track = new RandomEventTrack(rng, () => 20, 0);
    const times: number[] = [];
    for (let t = 0.05; t <= 100; t += 0.05) track.collect(t, times);
    expect(times.length).toBeGreaterThan(1800);
    expect(times.length).toBeLessThan(2200);
    for (let i = 1; i < times.length; i++) expect(times[i]!).toBeGreaterThanOrEqual(times[i - 1]!);
    expect(times.every((t) => t >= 0 && t < 100)).toBe(true);
  });

  it('écart minimal respecté ; taux nul : aucune émission puis reprise', () => {
    const rng = mulberry32(3);
    let rate = 50;
    const track = new RandomEventTrack(rng, () => rate, 0, 0.05);
    const times = track.collect(10);
    for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(0.05);
    rate = 0;
    const silent: number[] = [];
    // L'événement déjà tiré peut tomber ; ensuite plus rien tant que le taux est nul.
    track.collect(11, silent);
    silent.length = 0;
    track.collect(20, silent);
    expect(silent.length).toBe(0);
    rate = 10;
    const resumed = track.collect(30);
    expect(resumed.length).toBeGreaterThan(50);
    expect(resumed.every((t) => t >= 20)).toBe(true);
    expect(nextPoissonTime(0, 0, rng)).toBe(Number.POSITIVE_INFINITY);
  });

  it('limiteur : nombre de voix et intervalle minimal', () => {
    const lim = new VoiceLimiter();
    expect(lim.canStart('a', 0, 2, 0.05)).toBe(true);
    lim.register('a', 0, 0.3);
    expect(lim.canStart('a', 0.01, 2, 0.05)).toBe(false); // trop tôt
    expect(lim.canStart('a', 0.1, 2, 0.05)).toBe(true);
    lim.register('a', 0.1, 0.4);
    expect(lim.canStart('a', 0.2, 2, 0.05)).toBe(false); // 2 voix actives
    expect(lim.active('a', 0.2)).toBe(2);
    expect(lim.canStart('a', 0.35, 2, 0.05)).toBe(true); // la première est finie
    expect(lim.canStart('b', 0.2, 2, 0.05)).toBe(true); // autre son indépendant
  });
});

describe('tampons procéduraux', () => {
  const rng = () => mulberry32(5);

  it('bruits : amplitude bornée, moyenne ~0', () => {
    for (const data of [whiteNoise(48000, rng()), pinkNoise(48000, rng()), brownNoise(48000, rng())]) {
      let max = 0;
      let sum = 0;
      for (const x of data) {
        max = Math.max(max, Math.abs(x));
        sum += x;
      }
      expect(max).toBeLessThanOrEqual(1.2);
      expect(max).toBeGreaterThan(0.05);
      expect(Math.abs(sum / data.length)).toBeLessThan(0.05);
    }
  });

  it('bruit brun plus grave que le blanc (moins de variation d’un échantillon au suivant)', () => {
    const diff = (d: Float32Array) => {
      let s = 0;
      for (let i = 1; i < d.length; i++) s += Math.abs(d[i]! - d[i - 1]!);
      return s / d.length / (rms(d) || 1);
    };
    expect(diff(brownNoise(20000, rng()))).toBeLessThan(diff(pinkNoise(20000, rng())));
    expect(diff(pinkNoise(20000, rng()))).toBeLessThan(diff(whiteNoise(20000, rng())));
  });

  it('bouclage sans couture : le raccord fin → début est continu', () => {
    const data = brownNoise(20000, rng());
    const loop = makeSeamless(data, 1000);
    expect(loop.length).toBe(19000);
    const typicalStep = (() => {
      let s = 0;
      for (let i = 1; i < loop.length; i++) s += Math.abs(loop[i]! - loop[i - 1]!);
      return s / (loop.length - 1);
    })();
    const seam = Math.abs(loop[0]! - loop[loop.length - 1]!);
    expect(seam).toBeLessThan(typicalStep * 6);
  });

  it('textures d’impacts reproductibles et normalisées', () => {
    const a = renderImpacts(8000, { style: 'roof', rate: 30, seconds: 1 }, mulberry32(9));
    const b = renderImpacts(8000, { style: 'roof', rate: 30, seconds: 1 }, mulberry32(9));
    expect(a).toEqual(b);
    let max = 0;
    for (const x of a) max = Math.max(max, Math.abs(x));
    expect(max).toBeCloseTo(0.95, 2);
    for (const style of ['glass', 'sizzle'] as const) {
      const t = renderImpacts(8000, { style, rate: 50, seconds: 0.5 }, mulberry32(2));
      expect(rms(t)).toBeGreaterThan(0.001);
    }
  });

  it('réponse impulsionnelle : décroissance (fin bien plus faible que le début)', () => {
    const [left, right] = renderRoomImpulse(16000, 0.55, mulberry32(1));
    expect(left.length).toBe(right.length);
    const early = rms(left, 0, 1600);
    const late = rms(left, left.length - 1600, left.length);
    expect(late).toBeLessThan(early * 0.05);
  });
});

describe('musique générative de la radio', () => {
  it('reproductible pour une graine donnée', () => {
    expect(composeSong(123)).toEqual(composeSong(123));
  });

  it('notes dans la gamme, positions et durées valides', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const song = composeSong(seed);
      expect(song.tempo).toBeGreaterThanOrEqual(70);
      expect(song.tempo).toBeLessThanOrEqual(118);
      expect(song.bars.length % 4).toBe(0);
      for (const bar of song.bars) {
        for (const note of bar.chord) expect(isInScale(song.root, song.mode, note)).toBe(true);
        for (const e of bar.events) {
          expect(e.beat).toBeGreaterThanOrEqual(0);
          expect(e.beat).toBeLessThan(4.3);
          expect(e.dur).toBeGreaterThan(0);
          expect(e.vel).toBeGreaterThan(0);
          expect(e.vel).toBeLessThanOrEqual(1);
          if (e.inst === 'lead' || e.inst === 'chord') {
            expect(isInScale(song.root, song.mode, e.midi)).toBe(true);
          }
        }
        // Événements triés (programmation dans l'ordre).
        for (let i = 1; i < bar.events.length; i++) {
          expect(bar.events[i]!.beat).toBeGreaterThanOrEqual(bar.events[i - 1]!.beat);
        }
      }
      // Durée d'un morceau raisonnable (≈ 30 s à 2 min).
      expect(songDuration(song)).toBeGreaterThan(30);
      expect(songDuration(song)).toBeLessThan(130);
    }
  });

  it('variée dans le temps : modes, styles, tempos et tonalités différents', () => {
    const songs = Array.from({ length: 30 }, (_, i) => composeSong(1000 + i * 7919));
    expect(new Set(songs.map((s) => s.mode)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(songs.map((s) => s.style)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(songs.map((s) => s.tempo)).size).toBeGreaterThanOrEqual(10);
    expect(new Set(songs.map((s) => s.root)).size).toBeGreaterThanOrEqual(4);
  });

  it('mélodie présente dans les couplets, basse et batterie à chaque mesure', () => {
    const song = composeSong(77);
    const verses = song.bars.filter((b) => b.section === 'A' || b.section === 'B');
    const leadNotes = verses.reduce((n, b) => n + b.events.filter((e) => e.inst === 'lead').length, 0);
    expect(leadNotes).toBeGreaterThan(verses.length * 2);
    for (const bar of song.bars) {
      expect(bar.events.some((e) => e.inst === 'bass')).toBe(true);
      expect(bar.events.some((e) => e.inst === 'kick' || e.inst === 'hat')).toBe(true);
    }
  });

  it('conduite des voix : déplacement minimal entre accords, registre respecté', () => {
    const prev = [60, 64, 67]; // Do majeur
    const next = voiceLead([65, 69, 72], prev, 55, 76); // Fa majeur
    expect(next.every((n) => n >= 55 && n <= 76)).toBe(true);
    const movement = next.reduce((m, n) => m + Math.min(...prev.map((p) => Math.abs(n - p))), 0);
    expect(movement).toBeLessThanOrEqual(3);
    expect(new Set(next.map((n) => n % 12))).toEqual(new Set([5, 9, 0]));
  });

  it('gammes de 7 degrés', () => {
    for (const scale of Object.values(SCALES)) expect(scale.length).toBe(7);
  });
});
