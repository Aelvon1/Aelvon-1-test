/**
 * Poste de radio AM : musique générative (voir `music.ts`) jouée par de petits synthétiseurs,
 * puis dégradée comme une réception en ondes moyennes sur un petit haut-parleur : bande
 * passante étroite, saturation, souffle, parasites, évanouissements lents et, parfois, un
 * sifflement d'interférence. Les morceaux s'enchaînent avec un court blanc (grésillement).
 * Approximation : la réception AM est imitée par filtrage/saturation/bruit, sans modulation ni
 * démodulation réelles.
 */
import { adsr, percussive, smoothParam } from './envelope';
import type { Voice } from './kit';
import type { LoopControl } from './loops';
import { clamp01, midiToHz, randRange } from './math';
import { type NoteEvent, type SongPlan, composeSong } from './music';

/** Avance de programmation d'une mesure avant son début (s). */
const BAR_LEAD = 0.05;

export function createRadio(v: Voice, t0: number, intensity: number): LoopControl {
  const rng = v.rng;
  const kit = v.kit;

  // --- Chaîne « poste AM » ---
  const music = v.gain(1); // entrée des instruments
  const fading = v.gain(1); // évanouissements de propagation
  const hp = v.filter('highpass', 300, 0.7);
  const lp = v.filter('lowpass', 3300, 0.9);
  const speaker = v.filter('peaking', 1150, 1.2, 4.5); // résonance du petit haut-parleur
  const drive = v.shaper(1.8);
  const musicOut = v.gain(0.9);
  music.connect(fading).connect(hp).connect(lp).connect(speaker).connect(drive).connect(musicOut);
  musicOut.connect(v.out);

  // Souffle et parasites.
  const hiss = v.gain(0);
  v.noise('pink', t0, Infinity)
    .connect(v.filter('bandpass', 2600, 0.5))
    .connect(hiss);
  hiss.connect(v.out);
  const crackle = v.gain(0);
  const crackleLevel = v.gain(1);
  v.sample(kit.buffer('crackle'), t0, Infinity, { loop: true })
    .connect(v.filter('bandpass', 1800, 0.7))
    .connect(crackleLevel)
    .connect(crackle);
  crackle.connect(v.out);
  // Ronflement de l'alimentation du poste.
  const hum = v.gain(0.004);
  v.osc('sine', 100, t0, Infinity).connect(hum);
  hum.connect(v.out);

  let quality = clamp01(intensity);
  const applyQuality = (now: number, seconds: number) => {
    smoothParam(hiss.gain, 0.025 + 0.2 * (1 - quality), now, seconds);
    smoothParam(crackle.gain, 0.05 + 0.3 * (1 - quality), now, seconds);
    smoothParam(musicOut.gain, 0.3 + 0.6 * quality, now, seconds);
  };
  applyQuality(t0, 0.05);

  // --- Morceaux ---
  let song: SongPlan = composeSong(Math.floor(rng() * 1e9));
  let bar = 0;
  let nextBarTime = t0 + 0.3;
  let nextFade = t0 + 1;
  let nextStatic = t0 + randRange(rng, 0.5, 2);
  let nextWhistle = t0 + randRange(rng, 20, 60);

  const scheduleBar = (time: number) => {
    const plan = song.bars[bar]!;
    const spb = 60 / song.tempo;
    for (const e of plan.events) playNote(v, music, song, e, time + e.beat * spb, spb, rng);
  };

  return {
    setIntensity(value, now) {
      quality = clamp01(value);
      applyQuality(now, 0.5);
    },
    schedule(now, until) {
      // Après une coupure (onglet masqué), on reprend proprement à la mesure suivante.
      if (nextBarTime < now - 0.1) nextBarTime = now + 0.1;
      while (nextBarTime - BAR_LEAD < until) {
        scheduleBar(nextBarTime);
        nextBarTime += (4 * 60) / song.tempo;
        bar++;
        if (bar >= song.bars.length) {
          // Fin du morceau : court blanc grésillant puis morceau suivant (tonalité, tempo, style…).
          const gap = randRange(rng, 1.5, 3.2);
          smoothParam(hiss.gain, 0.06 + 0.2 * (1 - quality), nextBarTime, 0.3);
          applyQualityLater(nextBarTime + gap);
          nextBarTime += gap;
          song = composeSong(Math.floor(rng() * 1e9));
          bar = 0;
        }
      }
      // Évanouissements lents de la réception (propagation AM).
      if (nextFade < now - 1) nextFade = now;
      while (nextFade < until) {
        const deep = rng() < 0.1;
        fading.gain.setTargetAtTime(deep ? randRange(rng, 0.4, 0.6) : randRange(rng, 0.78, 1), nextFade, 0.7);
        nextFade += randRange(rng, 1.2, 3.5);
      }
      // Bouffées de parasites.
      if (nextStatic < now - 1) nextStatic = now;
      while (nextStatic < until) {
        const burst = randRange(rng, 1, 4) * (1.4 - quality);
        crackleLevel.gain.setTargetAtTime(burst, nextStatic, 0.05);
        crackleLevel.gain.setTargetAtTime(1, nextStatic + randRange(rng, 0.1, 0.4), 0.15);
        nextStatic += randRange(rng, 1.5, 6);
      }
      // Sifflement d'hétérodyne (deux stations voisines), rare et discret.
      if (nextWhistle < now - 1) nextWhistle = now + randRange(rng, 20, 60);
      if (nextWhistle < until) {
        const d = kit.voice(fading, 0.004);
        const len = randRange(rng, 3, 6);
        const f = randRange(rng, 1400, 3800);
        const o = d.osc('sine', f, nextWhistle, nextWhistle + len);
        o.frequency.setValueAtTime(f, nextWhistle);
        o.frequency.linearRampToValueAtTime(f + randRange(rng, -250, 250), nextWhistle + len);
        o.connect(
          d.env(adsr({ attack: 1, decay: 0.5, sustain: 0.8, release: 1.2 }, len - 1.2), nextWhistle),
        ).connect(d.out);
        nextWhistle += randRange(rng, 35, 90);
      }
    },
  };

  function applyQualityLater(time: number): void {
    smoothParam(hiss.gain, 0.025 + 0.2 * (1 - quality), time, 0.5);
  }
}

/** Synthèse d'une note ou d'un coup de batterie. */
function playNote(
  parent: Voice,
  destination: AudioNode,
  song: SongPlan,
  e: NoteEvent,
  t: number,
  spb: number,
  rng: () => number,
): void {
  const kit = parent.kit;
  const gate = Math.max(0.03, e.dur * spb);
  switch (e.inst) {
    case 'bass': {
      // Dent de scie filtrée : ses harmoniques passent la bande étroite du poste.
      const v = kit.voice(destination, 0.32 * e.vel);
      const o = v.osc('sawtooth', midiToHz(e.midi), t, t + gate + 0.1);
      v.chain(
        o,
        v.filter('lowpass', 750, 1),
        v.env(adsr({ attack: 0.005, decay: 0.15, sustain: 0.6, release: 0.06 }, gate), t),
      );
      break;
    }
    case 'chord': {
      const f = midiToHz(e.midi);
      if (song.chordVoice === 'pluck') {
        const v = kit.voice(destination, 0.085 * e.vel);
        const o = v.osc('sawtooth', f, t, t + gate + 0.15);
        const filter = v.filter('lowpass', 2600, 1.5);
        filter.frequency.setValueAtTime(2800, t);
        filter.frequency.exponentialRampToValueAtTime(750, t + 0.22);
        v.chain(o, filter, v.env(adsr({ attack: 0.004, decay: 0.25, sustain: 0.25, release: 0.1 }, gate), t));
      } else if (song.chordVoice === 'pad') {
        const v = kit.voice(destination, 0.07 * e.vel);
        const filter = v.filter('lowpass', 1800, 0.7);
        const env = v.env(adsr({ attack: 0.12, decay: 0.3, sustain: 0.7, release: 0.35 }, gate), t);
        for (const detune of [-7, 7]) {
          const o = v.osc('triangle', f, t, t + gate + 0.4);
          o.detune.value = detune;
          o.connect(filter);
        }
        v.chain(filter, env);
      } else {
        // Orgue : tirettes 8', 4', 2 2/3'.
        const v = kit.voice(destination, 0.05 * e.vel);
        const env = v.env(adsr({ attack: 0.01, decay: 0.05, sustain: 0.9, release: 0.08 }, gate), t);
        for (const [ratio, level] of [
          [1, 1],
          [2, 0.5],
          [3, 0.3],
        ] as const) {
          const o = v.osc('sine', f * ratio, t, t + gate + 0.1);
          o.connect(v.gain(level)).connect(env);
        }
        env.connect(v.out);
      }
      break;
    }
    case 'lead': {
      const f = midiToHz(e.midi);
      const type: OscillatorType = song.leadVoice === 'saw' ? 'sawtooth' : song.leadVoice;
      const level = song.leadVoice === 'triangle' ? 0.16 : 0.075;
      const v = kit.voice(destination, level * e.vel);
      const o = v.osc(type, f, t, t + gate + 0.12);
      // Vibrato retardé (s'installe sur les notes tenues).
      if (gate > 0.3) {
        const lfo = v.osc('sine', randRange(rng, 4.8, 5.6), t, t + gate + 0.12);
        const depth = v.gain(0);
        depth.gain.setValueAtTime(0, t);
        depth.gain.linearRampToValueAtTime(14, t + Math.min(0.35, gate));
        lfo.connect(depth).connect(o.detune);
      }
      v.chain(
        o,
        v.filter('lowpass', 2400, 0.8),
        v.env(adsr({ attack: 0.012, decay: 0.1, sustain: 0.7, release: 0.09 }, gate), t),
      );
      break;
    }
    case 'kick': {
      const v = kit.voice(destination, 0.6 * e.vel);
      const o = v.osc('sine', 110, t, t + 0.3);
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.08);
      v.chain(o, v.env(percussive(0.001, 0.25), t));
      const n = v.noise('white', t, t + 0.02);
      v.chain(n, v.filter('lowpass', 1500, 0.7), v.env(percussive(0.0005, 0.006), t, 0.3));
      break;
    }
    case 'snare': {
      const v = kit.voice(destination, 0.35 * e.vel);
      v.chain(
        v.noise('white', t, t + 0.2),
        v.filter('bandpass', 1900, 0.7),
        v.env(percussive(0.001, 0.12), t),
      );
      v.chain(v.osc('triangle', 185, t, t + 0.1), v.env(percussive(0.001, 0.06), t, 0.6));
      break;
    }
    case 'rim': {
      const v = kit.voice(destination, 0.3 * e.vel);
      v.chain(
        v.noise('white', t, t + 0.04),
        v.filter('bandpass', 1700, 5),
        v.env(percussive(0.0004, 0.02), t, 2),
      );
      v.chain(v.osc('sine', 820, t, t + 0.04), v.env(percussive(0.0005, 0.02), t, 0.4));
      break;
    }
    case 'hat':
    case 'openhat': {
      const v = kit.voice(destination, (e.inst === 'hat' ? 0.12 : 0.1) * e.vel);
      const decay = e.inst === 'hat' ? 0.035 : Math.min(0.25, gate);
      v.chain(
        v.noise('white', t, t + decay + 0.02),
        v.filter('highpass', 5000, 0.7),
        v.env(percussive(0.0005, decay), t),
      );
      break;
    }
  }
}
