/**
 * Registre des outils : définitions 3D (`ToolDef`) du catalogue du moteur et des objets.
 * Les noms et icônes de repli garantissent un affichage correct dans l'interface même si un
 * outil n'a pas (encore) de modèle 3D enregistré.
 */
import type { ToolDef } from '../../objects/types';
import { createToolCatalog } from './catalog';
import { TOOL_IDS, type ToolId } from './ids';

/** Noms français des outils du catalogue. */
export const TOOL_NAMES: Record<ToolId, string> = {
  'hex-key-1.5': 'Clé Allen 1,5 mm',
  'hex-key-2': 'Clé Allen 2 mm',
  'hex-key-2.5': 'Clé Allen 2,5 mm',
  'screwdriver-phillips': 'Tournevis cruciforme',
  'screwdriver-flat': 'Tournevis plat',
  'screwdriver-precision': 'Tournevis de précision',
  'pliers-flat': 'Pince plate',
  'pliers-circlip': 'Pince à circlips',
  'cutter-flush': 'Pince coupante',
  'bearing-puller': 'Extracteur de roulements',
  'arbor-press': 'Presse à main',
  mallet: 'Maillet',
  'soldering-iron': 'Fer à souder',
  'desolder-pump': 'Pompe à dessouder',
  'desolder-braid': 'Tresse à dessouder',
  'hot-air': 'Station à air chaud',
  tweezers: 'Brucelles',
  'ic-extractor': 'Extracteur de CI',
  scalpel: 'Scalpel',
  spudger: 'Levier plastique',
  hands: 'À la main',
};

/** Icône générique (clé plate) utilisée à défaut d'icône propre. */
export const FALLBACK_TOOL_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/></svg>';

const tools = new Map<string, ToolDef>();

export function registerTool(def: ToolDef, options?: { replace?: boolean }): void {
  if (tools.has(def.id) && !options?.replace) throw new Error(`Outil déjà enregistré : « ${def.id} ».`);
  tools.set(def.id, def);
}

export function getTool(id: string): ToolDef | undefined {
  return tools.get(id);
}

export function listTools(): ToolDef[] {
  return [...tools.values()];
}

/** Nom et icône d'un outil pour l'interface (repli si non enregistré). */
export function toolDisplay(id: string | null | undefined): { name: string; icon: string } | null {
  if (!id) return null;
  const def = tools.get(id);
  if (def) return { name: def.name, icon: def.icon };
  const name = (TOOL_NAMES as Record<string, string>)[id];
  return { name: name ?? id, icon: FALLBACK_TOOL_ICON };
}

/** Identifiants connus (catalogue + outils enregistrés), pour la validation. */
export function knownToolIds(): Set<string> {
  return new Set<string>([...TOOL_IDS, ...tools.keys()]);
}

// Catalogue du moteur : modèle 3D animé, nom et icône de chaque identifiant de `TOOL_IDS`.
for (const def of createToolCatalog(TOOL_NAMES)) registerTool(def);
