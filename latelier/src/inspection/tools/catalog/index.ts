/**
 * Catalogue des outils 3D du moteur : une définition (`ToolDef`) par identifiant de `TOOL_IDS`,
 * et le comportement de chacune vis-à-vis du présentateur (suivi, orientation, sons).
 *
 * Le module ne dépend pas du registre (pas d'import circulaire) : `registry.ts` appelle
 * `createToolCatalog(TOOL_NAMES)` et enregistre le résultat.
 */
import type { ToolAnimState, ToolBuildContext, ToolDef } from '../../../objects/types';
import type * as THREE from 'three/webgpu';
import { TOOL_IDS, type ToolId } from '../ids';
import { TOOL_ICONS } from '../icons';
import { animateDriver, buildFlat, buildHexKey, buildPhillips, buildPrecision } from './drivers';
import {
  animateArborPress,
  animateBearingPuller,
  animateMallet,
  buildArborPress,
  buildBearingPuller,
  buildMallet,
  malletStrikes,
} from './heavy';
import {
  animateHands,
  animateIcExtractor,
  animateScalpel,
  animateSpudger,
  animateTweezers,
  buildHands,
  buildIcExtractor,
  buildScalpel,
  buildSpudger,
  buildTweezers,
} from './handling';
import {
  animateCirclipPliers,
  animateCutter,
  animateFlatPliers,
  buildCirclipPliers,
  buildFlatPliers,
  buildFlushCutter,
} from './pliers';
import {
  animateDesolderBraid,
  animateDesolderPump,
  animateHotAir,
  animateSolderingIron,
  buildDesolderBraid,
  buildDesolderPump,
  buildHotAir,
  buildSolderingIron,
  pumpReleaseAt,
} from './soldering';
import { DEFAULT_BEHAVIOR, type ToolBehavior } from './rig';

interface CatalogEntry {
  build: (ctx: ToolBuildContext) => THREE.Object3D;
  animate: (tool: THREE.Object3D, state: ToolAnimState) => void;
  behavior: ToolBehavior;
}

/** Comportement le plus courant : suit le point de travail, plan de l'outil face à la caméra. */
const standard: ToolBehavior = { follow: 'position', roll: 'camera' };

const ENTRIES: Record<ToolId, CatalogEntry> = {
  'hex-key-1.5': { build: buildHexKey('1.5'), animate: animateDriver, behavior: standard },
  'hex-key-2': { build: buildHexKey('2'), animate: animateDriver, behavior: standard },
  'hex-key-2.5': { build: buildHexKey('2.5'), animate: animateDriver, behavior: standard },
  'screwdriver-phillips': { build: buildPhillips, animate: animateDriver, behavior: standard },
  'screwdriver-flat': { build: buildFlat, animate: animateDriver, behavior: standard },
  'screwdriver-precision': { build: buildPrecision, animate: animateDriver, behavior: standard },
  'pliers-flat': {
    build: buildFlatPliers,
    animate: animateFlatPliers,
    behavior: { follow: 'rigid', roll: 'partShort' },
  },
  'pliers-circlip': {
    build: buildCirclipPliers,
    animate: animateCirclipPliers,
    behavior: { follow: 'rigid', roll: 'camera' },
  },
  'cutter-flush': {
    build: buildFlushCutter,
    animate: animateCutter,
    behavior: { follow: 'position', roll: 'partShort' },
  },
  'bearing-puller': {
    build: buildBearingPuller,
    animate: animateBearingPuller,
    behavior: { follow: 'position', roll: 'camera', approach: 1.3 },
  },
  'arbor-press': {
    build: buildArborPress,
    animate: animateArborPress,
    behavior: { follow: 'position', roll: 'camera', approach: 1.5 },
  },
  mallet: {
    build: buildMallet,
    animate: animateMallet,
    behavior: {
      follow: 'position',
      roll: 'camera',
      cues: () => malletStrikes().map((at) => ({ at, sound: 'part.drop.plastic' as const, volume: 0.9 })),
    },
  },
  'soldering-iron': { build: buildSolderingIron, animate: animateSolderingIron, behavior: standard },
  'desolder-pump': {
    build: buildDesolderPump,
    animate: animateDesolderPump,
    behavior: {
      follow: 'position',
      roll: 'camera',
      cues: (motion, direction) =>
        direction === 1 ? [{ at: pumpReleaseAt(motion), sound: 'snap.click', volume: 0.9 }] : [],
    },
  },
  'desolder-braid': { build: buildDesolderBraid, animate: animateDesolderBraid, behavior: standard },
  'hot-air': { build: buildHotAir, animate: animateHotAir, behavior: standard },
  tweezers: {
    build: buildTweezers,
    animate: animateTweezers,
    behavior: { follow: 'rigid', roll: 'partShort' },
  },
  'ic-extractor': {
    build: buildIcExtractor,
    animate: animateIcExtractor,
    behavior: { follow: 'rigid', roll: 'partLong' },
  },
  scalpel: { build: buildScalpel, animate: animateScalpel, behavior: standard },
  spudger: { build: buildSpudger, animate: animateSpudger, behavior: { follow: 'rigid', roll: 'camera' } },
  hands: { build: buildHands, animate: animateHands, behavior: { follow: 'rigid', roll: 'partShort' } },
};

/** Définitions du catalogue (noms fournis par le registre). */
export function createToolCatalog(names: Record<ToolId, string>): ToolDef[] {
  return TOOL_IDS.map((id) => ({
    id,
    name: names[id],
    icon: TOOL_ICONS[id],
    build: ENTRIES[id].build,
    animate: ENTRIES[id].animate,
  }));
}

/** Comportement d'un outil (défaut pour les outils déclarés par les objets). */
export function toolBehavior(id: string): ToolBehavior {
  return (ENTRIES as Record<string, CatalogEntry | undefined>)[id]?.behavior ?? DEFAULT_BEHAVIOR;
}
