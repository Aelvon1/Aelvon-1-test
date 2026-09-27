/**
 * Paramètres de l'objet et utilitaires de construction partagés par les pièces.
 */
import type * as THREE from 'three/webgpu';
import type { BuildContext } from '../types';
import { OBJECT_ID } from './constants';
import { computeRouting, type Routing } from './pcb/routing';

export type UnoParams = {
  /** Géométrie fine (ménisques, pattes détaillées) construite d'emblée, sans attendre l'approche. */
  fineDetail: boolean;
};

export const DEFAULT_PARAMS: UnoParams = { fineDetail: false };

export type Ctx = BuildContext<UnoParams>;

/** Matériau propre à l'objet (`uno-board/<clé>`). */
export const own = (ctx: Ctx, key: string): THREE.Material => ctx.materials.get(`${OBJECT_ID}/${key}`);

/** Routage calculé par `prepare` (recalculé si absent, ex. banc sans préparation). */
export function routingOf(ctx: Pick<Ctx, 'shared'>): Routing {
  const r = ctx.shared.routing as Routing | undefined;
  return r ?? computeRouting();
}
