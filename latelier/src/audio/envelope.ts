/**
 * Enveloppes d'amplitude/de fréquence : calcul pur des segments (testable) puis application à
 * un `AudioParam` (ou à tout objet ayant la même interface d'automatisation).
 */

/** Sous-ensemble d'`AudioParam` utilisé par les enveloppes (permet des doublures de test). */
export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
  setTargetAtTime(target: number, startTime: number, timeConstant: number): unknown;
  cancelScheduledValues(time: number): unknown;
}

/** Segment d'enveloppe : la valeur `value` est atteinte à l'instant `time` (s, relatif). */
export interface EnvelopeSegment {
  type: 'set' | 'linear' | 'exp';
  time: number;
  value: number;
}

/** Plancher des rampes exponentielles (−80 dB) : une rampe exponentielle ne peut atteindre 0. */
export const EXP_FLOOR = 1e-4;

/**
 * Enveloppe percussive : montée linéaire en `attack`, puis décroissance exponentielle jusqu'à
 * −60 dB en `decay` secondes, puis silence.
 */
export function percussive(attack: number, decay: number, peak = 1): EnvelopeSegment[] {
  const a = Math.max(0.0005, attack);
  const d = Math.max(0.002, decay);
  return [
    { type: 'set', time: 0, value: 0 },
    { type: 'linear', time: a, value: peak },
    { type: 'exp', time: a + d, value: Math.max(EXP_FLOOR, peak * 0.001) },
    { type: 'set', time: a + d + 0.001, value: 0 },
  ];
}

export interface AdsrShape {
  attack: number;
  decay: number;
  /** Niveau de maintien relatif au pic (0..1). */
  sustain: number;
  release: number;
  peak?: number;
}

/**
 * Enveloppe ADSR pour une note tenue `gate` secondes. Si la note est plus courte que
 * l'attaque + la chute, le relâchement part du niveau réellement atteint à `gate`.
 */
export function adsr(shape: AdsrShape, gate: number): EnvelopeSegment[] {
  const peak = shape.peak ?? 1;
  const a = Math.max(0.0005, shape.attack);
  const d = Math.max(0.001, shape.decay);
  const r = Math.max(0.005, shape.release);
  const sustain = Math.max(EXP_FLOOR, Math.min(1, shape.sustain) * peak);
  const g = Math.max(0.001, gate);
  const out: EnvelopeSegment[] = [{ type: 'set', time: 0, value: 0 }];
  if (g <= a) {
    out.push({ type: 'linear', time: g, value: peak * (g / a) });
  } else {
    out.push({ type: 'linear', time: a, value: peak });
    if (g <= a + d) {
      // Interpolation exponentielle partielle entre le pic et le maintien.
      const k = (g - a) / d;
      out.push({ type: 'exp', time: g, value: Math.max(EXP_FLOOR, peak * (sustain / peak) ** k) });
    } else {
      out.push({ type: 'exp', time: a + d, value: sustain });
      out.push({ type: 'set', time: g, value: sustain });
    }
  }
  out.push({ type: 'exp', time: g + r, value: EXP_FLOOR });
  out.push({ type: 'set', time: g + r + 0.001, value: 0 });
  return out;
}

/** Durée totale d'une enveloppe (instant du dernier segment). */
export function envelopeDuration(segments: readonly EnvelopeSegment[]): number {
  let end = 0;
  for (const s of segments) end = Math.max(end, s.time);
  return end;
}

/** Valeur d'une enveloppe à l'instant `t` (évaluation analytique, pour les tests et le calcul). */
export function envelopeValueAt(segments: readonly EnvelopeSegment[], t: number): number {
  let prevTime = 0;
  let prevValue = 0;
  for (const s of segments) {
    if (t < s.time) {
      if (s.type === 'set') return prevValue;
      const span = s.time - prevTime;
      const k = span > 0 ? (t - prevTime) / span : 1;
      if (s.type === 'linear') return prevValue + (s.value - prevValue) * k;
      const from = Math.max(EXP_FLOOR, prevValue);
      const to = Math.max(EXP_FLOOR, s.value);
      return from * (to / from) ** k;
    }
    prevTime = s.time;
    prevValue = s.value;
  }
  return prevValue;
}

/**
 * Programme l'enveloppe sur `param` à partir de `t0` (temps audio), valeurs multipliées par
 * `scale`. Retourne l'instant de fin.
 */
export function applyEnvelope(
  param: AudioParamLike,
  segments: readonly EnvelopeSegment[],
  t0: number,
  scale = 1,
): number {
  let end = t0;
  for (const s of segments) {
    const time = t0 + s.time;
    const value = s.value * scale;
    if (s.type === 'set') param.setValueAtTime(value, time);
    else if (s.type === 'linear') param.linearRampToValueAtTime(value, time);
    else param.exponentialRampToValueAtTime(Math.max(EXP_FLOOR, Math.abs(value)), time);
    end = Math.max(end, time);
  }
  return end;
}

/**
 * Change la valeur d'un paramètre sans clic : fige la valeur courante (annulation des
 * automatisations futures) puis rampe linéairement jusqu'à `value` en `seconds`.
 *
 * Rampe linéaire plutôt que `setTargetAtTime` : Chrome calcule `setTargetAtTime` de proche en
 * proche et suspend ce calcul quand le nœud n'a plus d'entrée active (bus d'interface au
 * repos) ; le réglage de volume ne s'appliquait alors qu'au son suivant, en retard. Une rampe
 * linéaire est définie par ses instants de début et de fin : elle reste exacte.
 */
export function smoothParam(param: AudioParamLike, value: number, now: number, seconds: number): void {
  const hold = (param as { cancelAndHoldAtTime?: (time: number) => unknown }).cancelAndHoldAtTime;
  if (typeof hold === 'function') {
    hold.call(param, now);
  } else {
    // Firefox : pas de cancelAndHoldAtTime ; on fige la valeur calculée courante.
    const current = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(current, now);
  }
  param.linearRampToValueAtTime(value, now + Math.max(0.005, seconds));
}
