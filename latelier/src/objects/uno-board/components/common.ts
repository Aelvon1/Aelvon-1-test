/**
 * Composants « clés » décrits comme sous-ensembles (préparation du niveau 3 : intérieurs).
 *
 * Chaque composant clé = un sous-ensemble retirable (`kind: 'assembly'`, porteur des joints de
 * soudure et du geste de retrait) + sa pièce extérieure (boîtier), enfant non retirable pour
 * l'instant. L'agent chargé des intérieurs ajoutera ses pièces comme enfants du sous-ensemble
 * (le retrait du sous-ensemble, puis de l'extérieur rendu retirable par une opération
 * destructive, donnera accès aux pièces internes) sans toucher au reste de l'objet.
 *
 * Le nœud du sous-ensemble est placé (translation seule, jamais tourné) sur l'empreinte : son
 * repère a les mêmes axes que celui de l'objet, origine sur le plan du cuivre supérieur au centre
 * de l'empreinte.
 */
import type { ExplodeSpec, PartDef, PartInfo, RemovalSpec } from '../../types';
import { component } from '../layout';
import type { UnoParams } from '../params';
import { buildComponent, componentDetail, type ComponentModel } from '../packages/model';

export interface KeyComponentSpec {
  /** Désignation (layout). */
  ref: string;
  /** Identifiant du sous-ensemble (ex. « u4 »). */
  id: string;
  /** Identifiant de la pièce extérieure (ex. « u4.package »). */
  exteriorId: string;
  name: string;
  exteriorName: string;
  /** Bloc parent. */
  parent: string;
  model: ComponentModel;
  tags: readonly string[];
  info: PartInfo;
  exteriorInfo: PartInfo;
  removal: RemovalSpec;
  explode: ExplodeSpec;
  labelPriority?: number;
}

export function keyComponentParts(spec: KeyComponentSpec): PartDef<UnoParams>[] {
  const placement = () => [component(spec.ref)];
  const assemblyDetail = componentDetail(spec.model, placement, { withBody: false });
  const exteriorDetail = componentDetail(spec.model, placement, { withJoints: false, frame: 'child' });
  const assembly: PartDef<UnoParams> = {
    id: spec.id,
    name: spec.name,
    kind: 'assembly',
    parent: spec.parent,
    tags: spec.tags,
    build: (ctx) => buildComponent(ctx, spec.model, placement(), { withBody: false }),
    info: spec.info,
    explode: spec.explode,
    removal: spec.removal,
    label: { priority: spec.labelPriority ?? 5 },
  };
  if (assemblyDetail) assembly.detail = assemblyDetail;
  const exterior: PartDef<UnoParams> = {
    id: spec.exteriorId,
    name: spec.exteriorName,
    parent: spec.id,
    build: (ctx) =>
      buildComponent(ctx, spec.model, placement(), { withJoints: false, frame: 'child', hooks: false }),
    info: spec.exteriorInfo,
    explode: { direction: [0, 1, 0], distance: 0 },
    label: false,
  };
  if (exteriorDetail) exterior.detail = exteriorDetail;
  return [assembly, exterior];
}
