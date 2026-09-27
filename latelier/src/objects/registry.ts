/**
 * Registre des objets de l'inventaire, alimenté AUTOMATIQUEMENT : chaque dossier
 * `objects/<id>/index.ts` exportant par défaut un `ObjectDef` est découvert à la compilation
 * (`import.meta.glob`). Ajouter un objet ne demande donc aucune modification du moteur.
 *
 * Les dossiers préfixés par « _ » (ex. `objects/_exemple-boitier/`) sont des objets de
 * développement (exemple minimal documenté, bancs de test) : ils ne figurent dans l'inventaire
 * qu'avec le paramètre d'URL `?devobjects=1`, mais restent accessibles par `?inspect=<id>`.
 */
import type { CatalogEntry } from '../core/store';
import { countPhysicalParts, resolveObject } from './resolve';
import type { ObjectDef, ObjectParams } from './types';
import { DisassemblyGraph } from '../inspection/graph';

type AnyObjectDef = ObjectDef<ObjectParams>;
type ObjectModule = { default: AnyObjectDef };

const publicModules = import.meta.glob<ObjectModule>(['./*/index.ts', '!./_*/index.ts'], { eager: true });
const devModules = import.meta.glob<ObjectModule>('./_*/index.ts', { eager: true });

const definitions = new Map<string, AnyObjectDef>();
const devDefinitions = new Map<string, AnyObjectDef>();

function register(target: Map<string, AnyObjectDef>, modules: Record<string, ObjectModule>): void {
  for (const [path, mod] of Object.entries(modules)) {
    const def = mod.default;
    if (!def || typeof def !== 'object' || typeof def.id !== 'string') {
      console.error(`[registry] ${path} n'exporte pas d'ObjectDef par défaut.`);
      continue;
    }
    if (definitions.has(def.id) || devDefinitions.has(def.id)) {
      console.error(`[registry] Identifiant d'objet dupliqué « ${def.id} » (${path}).`);
      continue;
    }
    target.set(def.id, def);
  }
}
register(definitions, publicModules);
register(devDefinitions, devModules);

const showDevObjects = (): boolean =>
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('devobjects') === '1';

export function getObjectDef(id: string): AnyObjectDef | undefined {
  return definitions.get(id) ?? devDefinitions.get(id);
}

/** Objets de développement (dossiers « _… »). */
export function listDevObjectDefs(): AnyObjectDef[] {
  return [...devDefinitions.values()];
}

/** Objets publics de l'inventaire (+ objets de développement si `?devobjects=1`). */
export function listObjectDefs(): AnyObjectDef[] {
  const all = showDevObjects()
    ? [...definitions.values(), ...devDefinitions.values()]
    : [...definitions.values()];
  return all.sort((a, b) => a.category.localeCompare(b.category, 'fr') || a.name.localeCompare(b.name, 'fr'));
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
