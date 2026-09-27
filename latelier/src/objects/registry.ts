/**
 * Registre des objets de l'inventaire, alimenté AUTOMATIQUEMENT : chaque dossier
 * `objects/<id>/index.ts` exportant par défaut un `ObjectDef` est découvert à la compilation
 * (`import.meta.glob`). Ajouter un objet ne demande donc aucune modification du moteur.
 */
import type { CatalogEntry } from '../core/store';
import { countPhysicalParts, resolveObject } from './resolve';
import type { ObjectDef, ObjectParams } from './types';
import { DisassemblyGraph } from '../inspection/graph';

type AnyObjectDef = ObjectDef<ObjectParams>;

const modules = import.meta.glob<{ default: AnyObjectDef }>('./*/index.ts', { eager: true });

const definitions = new Map<string, AnyObjectDef>();
for (const [path, mod] of Object.entries(modules)) {
  const def = mod.default;
  if (!def || typeof def !== 'object' || typeof def.id !== 'string') {
    console.error(`[registry] ${path} n'exporte pas d'ObjectDef par défaut.`);
    continue;
  }
  if (definitions.has(def.id)) {
    console.error(`[registry] Identifiant d'objet dupliqué « ${def.id} » (${path}).`);
    continue;
  }
  definitions.set(def.id, def);
}

export function getObjectDef(id: string): AnyObjectDef | undefined {
  return definitions.get(id);
}

export function listObjectDefs(): AnyObjectDef[] {
  return [...definitions.values()].sort(
    (a, b) => a.category.localeCompare(b.category, 'fr') || a.name.localeCompare(b.name, 'fr'),
  );
}

/** Fiche d'inventaire calculée sans construire la géométrie. */
export function catalogEntry(def: AnyObjectDef): CatalogEntry {
  const resolved = resolveObject(def);
  let stepCount: number;
  try {
    stepCount = new DisassemblyGraph(
      resolved.parts,
      resolved.steps,
      new Set(resolved.allParts.map((p) => p.id)),
    ).steps.length;
  } catch {
    // Définition invalide : signalée par la validation ; la fiche affiche 0 étape.
    stepCount = 0;
  }
  return {
    id: def.id,
    name: def.name,
    category: def.category,
    difficulty: def.difficulty,
    estimatedMinutes: def.estimatedMinutes,
    description: def.description,
    keywords: def.keywords ?? [],
    partCount: countPhysicalParts(resolved),
    stepCount,
  };
}

export function buildCatalog(): CatalogEntry[] {
  return listObjectDefs().map(catalogEntry);
}
