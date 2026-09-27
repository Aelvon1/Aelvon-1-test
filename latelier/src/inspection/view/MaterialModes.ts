/**
 * Modes de rendu de l'inspection par substitution de matériaux : rayons X (fantômes) et faces
 * de coupe. Restauration EXACTE des matériaux d'origine :
 * - le matériau de base de chaque maillage modifié est mémorisé à la première substitution ;
 * - les fondus du placement « hide » (clones temporaires de `PoseComposer`) sont respectés via
 *   `baseMaterialOf` / `setBaseMaterial` : un fondu en cours se termine sur le bon matériau ;
 * - les maillages qui quittent la pièce (détail libéré) retrouvent leur matériau AVANT d'être
 *   libérés (rappel `DetailManager.onChange`).
 * Les matériaux de vue sont marqués `shared` : `disposeObjectTree` ne les libère jamais, ce
 * module s'en charge.
 */
import * as THREE from 'three/webgpu';
import type { Assembly } from '../Assembly';
import type { PoseComposer } from '../poses';
import { createSectionCapVariant, createXrayMaterial, supportsSectionCap } from './viewMaterials';

type MeshMaterial = THREE.Material | THREE.Material[];

interface Applied {
  base: MeshMaterial;
  current: MeshMaterial;
}

export class MaterialModes {
  private readonly applied = new Map<THREE.Mesh, Applied>();
  private readonly caps = new Map<THREE.Material, THREE.Material>();
  private readonly xrayMaterial = createXrayMaterial();
  private xray = false;
  private section = false;
  /** Pièces restant opaques en rayons X (sélection et descendants). */
  private solid: ReadonlySet<string> = new Set();
  private assembly: Assembly | null = null;
  private composer: PoseComposer | null = null;

  constructor() {
    this.xrayMaterial.userData.shared = true;
  }

  attach(assembly: Assembly, composer: PoseComposer): void {
    this.detach();
    this.assembly = assembly;
    this.composer = composer;
  }

  /** Restaure tous les matériaux d'origine (avant libération de l'objet). */
  detach(): void {
    this.restoreAll();
    this.assembly = null;
    this.composer = null;
    this.disposeCaps();
  }

  get xrayEnabled(): boolean {
    return this.xray;
  }

  /** Pièce affichée en fantôme ? */
  isGhost(partId: string): boolean {
    return this.xray && !this.solid.has(partId);
  }

  setXray(enabled: boolean, solid: ReadonlySet<string>): void {
    this.xray = enabled;
    this.solid = solid;
    this.sync();
  }

  setSection(enabled: boolean): void {
    if (this.section === enabled) return;
    this.section = enabled;
    this.sync();
  }

  /** Recalcule le matériau de chaque maillage de l'objet (événementiel, pas par image). */
  sync(): void {
    const a = this.assembly;
    const composer = this.composer;
    if (!a || !composer) return;
    const seen = new Set<THREE.Mesh>();
    for (const part of a.order) {
      const ghost = this.isGhost(part.id);
      for (const mesh of part.ownMeshes) {
        seen.add(mesh);
        const entry = this.applied.get(mesh);
        const base = entry ? entry.base : composer.baseMaterialOf(mesh);
        const wanted = this.materialFor(base, ghost);
        if (wanted === base) {
          if (entry) {
            composer.setBaseMaterial(mesh, base);
            this.applied.delete(mesh);
          }
          continue;
        }
        if (entry && sameMaterial(entry.current, wanted)) continue;
        composer.setBaseMaterial(mesh, wanted);
        this.applied.set(mesh, { base, current: wanted });
      }
    }
    // Maillages sortis de l'objet (détail masqué ou libéré) : matériau d'origine restitué.
    for (const [mesh, entry] of this.applied) {
      if (seen.has(mesh)) continue;
      mesh.material = entry.base;
      this.applied.delete(mesh);
    }
  }

  private materialFor(base: MeshMaterial, ghost: boolean): MeshMaterial {
    if (ghost) {
      return Array.isArray(base) ? base.map(() => this.xrayMaterial) : this.xrayMaterial;
    }
    if (!this.section) return base;
    if (Array.isArray(base)) {
      const mapped = base.map((m) => this.capOf(m));
      return mapped.every((m, i) => m === base[i]) ? base : mapped;
    }
    return this.capOf(base);
  }

  private capOf(material: THREE.Material): THREE.Material {
    if (!supportsSectionCap(material)) return material;
    let cap = this.caps.get(material);
    if (!cap) {
      cap = createSectionCapVariant(material);
      cap.userData.shared = true;
      this.caps.set(material, cap);
    }
    return cap;
  }

  private restoreAll(): void {
    const composer = this.composer;
    for (const [mesh, entry] of this.applied) {
      if (composer) composer.setBaseMaterial(mesh, entry.base);
      else mesh.material = entry.base;
    }
    this.applied.clear();
  }

  private disposeCaps(): void {
    for (const cap of this.caps.values()) cap.dispose();
    this.caps.clear();
  }

  dispose(): void {
    this.detach();
    this.xrayMaterial.dispose();
  }
}

function sameMaterial(a: MeshMaterial, b: MeshMaterial): boolean {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((m, i) => m === b[i]);
}
