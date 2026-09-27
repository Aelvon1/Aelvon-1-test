/**
 * Préréglages graphiques Bas / Moyen / Élevé / Ultra. Chaque système (post-traitement, décor,
 * ombres, atmosphère) lit le profil courant et s'y adapte.
 */
import type { QualityPreset } from './settings';

export interface QualityProfile {
  preset: QualityPreset;
  /** Niveau numérique (0 = Bas … 3 = Ultra), transmis aux constructions d'objets. */
  level: 0 | 1 | 2 | 3;
  /** Plafond du ratio de pixels (le ratio effectif = min(devicePixelRatio, plafond) × échelle dynamique). */
  maxPixelRatio: number;
  /** Échantillons MSAA de la passe de scène (0 = aucun). */
  msaaSamples: 0 | 4;
  /** Anticrénelage de post-traitement. */
  postAA: 'none' | 'fxaa' | 'smaa';
  shadows: boolean;
  shadowMapSize: number;
  /** Nombre maximal de lumières projetant des ombres. */
  shadowCasters: 1 | 2 | 3;
  ao: boolean;
  /** Résolution relative de la passe GTAO. */
  aoResolution: number;
  bloom: boolean;
  /** Profondeur de champ disponible. */
  dof: boolean;
  /** Rayons volumétriques + poussière. */
  volumetrics: boolean;
  dustParticles: number;
  rainOnGlass: boolean;
  /** Taille de la carte d'environnement pré-filtrée (cube, px). */
  envMapSize: number;
  /** Taille maximale des textures procédurales du décor. */
  textureSize: number;
  grain: boolean;
}

export const QUALITY_PROFILES: Readonly<Record<QualityPreset, QualityProfile>> = {
  low: {
    preset: 'low',
    level: 0,
    maxPixelRatio: 1,
    msaaSamples: 0,
    postAA: 'fxaa',
    shadows: true,
    shadowMapSize: 512,
    shadowCasters: 1,
    ao: false,
    aoResolution: 0.5,
    bloom: false,
    dof: false,
    volumetrics: false,
    dustParticles: 150,
    rainOnGlass: false,
    envMapSize: 128,
    textureSize: 512,
    grain: false,
  },
  medium: {
    preset: 'medium',
    level: 1,
    maxPixelRatio: 1.25,
    msaaSamples: 0,
    postAA: 'smaa',
    shadows: true,
    shadowMapSize: 1024,
    shadowCasters: 2,
    ao: true,
    aoResolution: 0.5,
    bloom: true,
    dof: true,
    volumetrics: true,
    dustParticles: 400,
    rainOnGlass: true,
    envMapSize: 256,
    textureSize: 1024,
    grain: true,
  },
  high: {
    preset: 'high',
    level: 2,
    maxPixelRatio: 1.5,
    msaaSamples: 4,
    postAA: 'smaa',
    shadows: true,
    shadowMapSize: 2048,
    shadowCasters: 3,
    ao: true,
    aoResolution: 0.75,
    bloom: true,
    dof: true,
    volumetrics: true,
    dustParticles: 900,
    rainOnGlass: true,
    envMapSize: 256,
    textureSize: 2048,
    grain: true,
  },
  ultra: {
    preset: 'ultra',
    level: 3,
    maxPixelRatio: 2,
    msaaSamples: 4,
    postAA: 'smaa',
    shadows: true,
    shadowMapSize: 4096,
    shadowCasters: 3,
    ao: true,
    aoResolution: 1,
    bloom: true,
    dof: true,
    volumetrics: true,
    dustParticles: 1600,
    rainOnGlass: true,
    envMapSize: 512,
    textureSize: 2048,
    grain: true,
  },
};
