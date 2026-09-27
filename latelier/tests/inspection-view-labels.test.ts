/**
 * Disposition des étiquettes à traits de rappel : colonnes latérales sans chevauchement, dans la
 * zone libre, traits sans croisement, étiquette épinglée conservée, quota respecté ; étiquettes
 * de vue rangée sans chevauchement.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LABEL_OPTIONS,
  columnCapacity,
  labelsConflict,
  layoutLabels,
  layoutTags,
  resolveColumn,
  segmentHitsRect,
  segmentsCross,
  type LabelArea,
  type LabelCandidate,
  type PlacedLabel,
} from '../src/inspection/labels/labelLayout';

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const AREA: LabelArea = { left: 300, top: 60, right: 1600, bottom: 960 };

function candidates(seed: number, count: number): LabelCandidate[] {
  const r = rng(seed);
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    anchorX: 700 + r() * 500,
    anchorY: 250 + r() * 500,
    width: 70 + Math.floor(r() * 150),
    score: r() * 100,
    pinned: i === count - 1,
  }));
}

function checkLayout(placed: readonly PlacedLabel[], area: LabelArea, height: number): void {
  // Global : aucun trait croisé, aucun trait sur une étiquette (la sienne comprise), aucun
  // chevauchement, y compris entre les deux colonnes.
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i]!;
    expect(
      segmentHitsRect(
        p.railX,
        p.startY,
        p.anchorX,
        p.anchorY,
        p.x + 1,
        p.y + 1,
        p.x + p.width - 1,
        p.y + height - 1,
      ),
    ).toBe(false);
    for (let j = i + 1; j < placed.length; j++) expect(labelsConflict(p, placed[j]!, height)).toBe(false);
  }
  for (const side of ['left', 'right'] as const) {
    const column = placed.filter((p) => p.side === side).sort((a, b) => a.y - b.y);
    for (let i = 0; i < column.length; i++) {
      const p = column[i]!;
      expect(p.y).toBeGreaterThanOrEqual(area.top);
      expect(p.y + height).toBeLessThanOrEqual(area.bottom);
      expect(p.x).toBeGreaterThanOrEqual(area.left);
      expect(p.x + p.width).toBeLessThanOrEqual(area.right);
      if (i > 0) expect(p.y - column[i - 1]!.y).toBeGreaterThanOrEqual(height - 1e-9);
      // Départ du trait sur le bord de l'étiquette, côté rail.
      expect(p.startX).toBeCloseTo(side === 'left' ? p.x + p.width : p.x, 9);
      for (let j = i + 1; j < column.length; j++) {
        const q = column[j]!;
        expect(
          segmentsCross(p.railX, p.startY, p.anchorX, p.anchorY, q.railX, q.startY, q.anchorX, q.anchorY),
        ).toBe(false);
      }
    }
  }
}

describe('étiquettes — colonnes latérales', () => {
  it('résolution d’une colonne : ordre conservé, aucun chevauchement, dans la zone', () => {
    const o = DEFAULT_LABEL_OPTIONS;
    const ys = resolveColumn([100, 101, 102, 950, 951], AREA, o);
    for (let i = 1; i < ys.length; i++) expect(ys[i]! - ys[i - 1]!).toBeGreaterThanOrEqual(o.height + o.gap);
    expect(ys[0]).toBeGreaterThanOrEqual(AREA.top + o.margin);
    expect(ys.at(-1)! + o.height).toBeLessThanOrEqual(AREA.bottom - o.margin);
  });

  it('croisement de segments', () => {
    expect(segmentsCross(0, 0, 10, 10, 0, 10, 10, 0)).toBe(true);
    expect(segmentsCross(0, 0, 10, 0, 0, 1, 10, 1)).toBe(false);
  });

  it('dispositions aléatoires : sans chevauchement ni croisement, quota et épinglage respectés', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const list = candidates(seed, 5 + (seed % 30));
      const maxCount = seed % 2 ? 12 : 18;
      const placed = layoutLabels(list, AREA, { maxCount });
      expect(placed.length).toBeLessThanOrEqual(maxCount);
      expect(placed.length).toBe(Math.min(list.length, maxCount));
      expect(placed.some((p) => p.id === list.at(-1)!.id)).toBe(true);
      checkLayout(placed, AREA, DEFAULT_LABEL_OPTIONS.height);
    }
  });

  it('les meilleures candidates sont retenues', () => {
    const list = candidates(7, 30);
    const placed = new Set(layoutLabels(list, AREA, { maxCount: 12 }).map((p) => p.id));
    const best = [...list]
      .filter((c) => !c.pinned)
      .sort((a, b) => b.score - a.score)
      .slice(0, 11);
    for (const c of best) expect(placed.has(c.id)).toBe(true);
  });

  it('côtés : une ancre à gauche du centre prend la colonne gauche', () => {
    const placed = layoutLabels(
      [
        { id: 'g', anchorX: 500, anchorY: 400, width: 90, score: 1 },
        { id: 'd', anchorX: 1400, anchorY: 400, width: 90, score: 1 },
      ],
      AREA,
    );
    expect(placed.find((p) => p.id === 'g')!.side).toBe('left');
    expect(placed.find((p) => p.id === 'd')!.side).toBe('right');
  });

  it('zones étroites, ancres sous les colonnes : aucun conflit global, épinglée conservée', () => {
    let total = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const r = rng(1000 + seed);
      // Zone centrale réaliste : au moins 45 % de l'écran (voir `InspectionLabels.area`), écran
      // de 960 à 2560 px ; les ancres peuvent tomber sous les colonnes d'étiquettes.
      const width = 960 + r() * 1600;
      const height = 540 + r() * 900;
      const insets = width * 0.55 * r();
      const leftInset = insets * r();
      const area: LabelArea = {
        left: leftInset,
        top: 50,
        right: width - (insets - leftInset),
        bottom: height - 100,
      };
      const count = 3 + Math.floor(r() * 30);
      const list: LabelCandidate[] = Array.from({ length: count }, (_, i) => ({
        id: `q${i}`,
        anchorX: area.left + (area.right - area.left) * (0.15 + 0.7 * r()),
        anchorY: area.top + (area.bottom - area.top) * r(),
        width: 60 + r() * 200,
        score: r() * 100,
        pinned: i === 0,
      }));
      const placed = layoutLabels(list, area, { maxCount: 18 });
      checkLayout(placed, area, DEFAULT_LABEL_OPTIONS.height);
      total += placed.length;
    }
    // Les conflits écartent des étiquettes, sans vider l'affichage.
    expect(total / 400).toBeGreaterThan(4);
  });

  it('rectangle traversé par un segment (Liang–Barsky)', () => {
    expect(segmentHitsRect(0, 5, 20, 5, 5, 0, 10, 10)).toBe(true);
    expect(segmentHitsRect(0, 20, 20, 20, 5, 0, 10, 10)).toBe(false);
    expect(segmentHitsRect(6, 6, 7, 7, 5, 0, 10, 10)).toBe(true);
    expect(segmentHitsRect(0, 0, 4, 20, 5, 0, 10, 10)).toBe(false);
  });

  it('zone trop basse : capacité et rééquilibrage', () => {
    const small: LabelArea = { left: 0, top: 0, right: 1000, bottom: 120 };
    const cap = columnCapacity(small, DEFAULT_LABEL_OPTIONS);
    const list = candidates(3, 20).map((c) => ({ ...c, anchorX: 900, anchorY: 60 }));
    const placed = layoutLabels(list, small, { maxCount: 18 });
    expect(placed.length).toBeLessThanOrEqual(cap * 2);
    expect(placed.filter((p) => p.side === 'left').length).toBeLessThanOrEqual(cap);
    checkLayout(placed, small, DEFAULT_LABEL_OPTIONS.height);
  });
});

describe('étiquettes — vue rangée', () => {
  it('centrées sous leur point, sans chevauchement, les plus importantes d’abord', () => {
    const r = rng(11);
    const tags = Array.from({ length: 40 }, (_, i) => ({
      id: `t${i}`,
      x: 400 + r() * 800,
      y: 200 + r() * 500,
      width: 60 + r() * 60,
      score: r(),
    }));
    const placed = layoutTags(tags, { left: 0, top: 0, right: 1920, bottom: 1080 }, 19);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]!;
        const b = placed[j]!;
        const overlap = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + 19 && a.y + 19 > b.y;
        expect(overlap).toBe(false);
      }
    }
    const best = [...tags].sort((a, b) => b.score - a.score)[0]!;
    expect(placed.find((p) => p.id === best.id)?.x).toBeCloseTo(best.x - best.width / 2, 9);
  });
});
