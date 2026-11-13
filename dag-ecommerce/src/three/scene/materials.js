import {
  CanvasTexture,
  Color,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  Vector2,
  Vector4,
} from 'three';
import { brushedMaps, leatherMaps, threadMaps } from './textures';

// ---------------------------------------------------------------------------
// Matériaux physiques de la ceinture. Un changement de couleur ou de fini ne touche
// qu'aux uniformes et aux textures : aucune géométrie n'est reconstruite.
// ---------------------------------------------------------------------------

export const CUT_COUNT = 6; // 5 crans + la fente de l'ardillon

const FINISH = {
  lisse: { normal: 1.0, rough: 1.0, clearcoat: 0.3, clearcoatRoughness: 0.34, sheen: 0, env: 1.0, lining: 0.6 },
  graine: { normal: 1.0, rough: 1.0, clearcoat: 0.1, clearcoatRoughness: 0.42, sheen: 0, env: 1.0, lining: 0.55 },
  mat: { normal: 0.8, rough: 1.0, clearcoat: 0, clearcoatRoughness: 0.5, sheen: 1, env: 0.9, lining: 1 },
};

const METAL = {
  brosse: { gain: 1.04, roughness: 0.36, metalness: 1, anisotropy: 0.8, brushed: 0.55, clearcoat: 0, env: 1.05 },
  poli: { gain: 0.96, roughness: 0.045, metalness: 1, anisotropy: 0, brushed: 0, clearcoat: 0, env: 1.0 },
  noir: { gain: 0.8, roughness: 0.46, metalness: 0.85, anisotropy: 0, brushed: 0.12, clearcoat: 0, env: 1.25 },
  antique: { gain: 1.2, roughness: 0.38, metalness: 1, anisotropy: 0.4, brushed: 0.4, clearcoat: 0, env: 1.15 },
  laiton: { gain: 1.3, roughness: 0.3, metalness: 1, anisotropy: 0.75, brushed: 0.5, clearcoat: 0, env: 1.15 },
};

const FOIL = {
  marque: null,
  or: { color: '#e0b96a', roughness: 0.3 },
  argent: { color: '#dfe1e4', roughness: 0.27 },
};

/**
 * Ajoute à un matériau standard/physique :
 *  - l'occlusion par sommet `aOcc` (appliquée à l'éclairage d'ambiance, diffus et spéculaire) ;
 *  - en option, les perçages de la lanière (crans, fente d'ardillon) par rejet de fragments.
 */
function patch(material, cuts) {
  material.onBeforeCompile = (shader) => {
    if (cuts) shader.uniforms.uCuts = cuts;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nattribute float aOcc;\nvarying float vOcc;${cuts ? '\nvarying vec2 vStrap;' : ''}`,
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvOcc = aOcc;${cuts ? '\nvStrap = uv;' : ''}`);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying float vOcc;${cuts ? `\nvarying vec2 vStrap;\nuniform vec4 uCuts[${CUT_COUNT}];` : ''}`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>${
          cuts
            ? `
        for ( int i = 0; i < ${CUT_COUNT}; i ++ ) {
          vec4 cut = uCuts[ i ];
          float cx = clamp( vStrap.x, cut.x, cut.y );
          if ( distance( vStrap, vec2( cx, 0.0 ) ) < cut.z ) discard;
        }`
            : ''
        }`,
      )
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        {
          float occ = clamp( vOcc, 0.0, 1.0 );
          reflectedLight.indirectDiffuse *= occ;
          reflectedLight.directDiffuse *= occ;
          reflectedLight.directSpecular *= occ;
          #if defined( USE_CLEARCOAT )
            clearcoatSpecularIndirect *= occ;
          #endif
          #if defined( USE_SHEEN )
            sheenSpecularIndirect *= occ;
          #endif
          #if defined( USE_ENVMAP ) && defined( STANDARD )
            float dotNVo = saturate( dot( geometryNormal, geometryViewDir ) );
            reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNVo, occ, material.roughness );
          #endif
        }`,
      );
  };
  material.customProgramCacheKey = () => (cuts ? 'dag-occ-cuts' : 'dag-occ');
  return material;
}

const _c = new Color();

export function createMaterials(maxAnisotropy = 1) {
  const cuts = { value: Array.from({ length: CUT_COUNT }, () => new Vector4(-1e4, -1e4, 0, 0)) };
  const aniso = Math.min(8, maxAnisotropy);
  const textures = new Map(); // fini → { normal, orm, albedo }
  const owned = [];

  const tex = (canvas, tile, srgb) => {
    const t = new CanvasTexture(canvas);
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
    t.repeat.set(1 / tile, 1 / tile);
    t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
    t.minFilter = LinearMipmapLinearFilter;
    t.magFilter = LinearFilter;
    t.anisotropy = aniso;
    owned.push(t);
    return t;
  };

  const leather = () => patch(new MeshPhysicalMaterial({ roughness: 1, metalness: 0 }), cuts);
  const outer = leather();
  const lining = leather();
  const edge = patch(new MeshPhysicalMaterial({ roughness: 0.34, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.22 }));
  const keeperOuter = patch(new MeshPhysicalMaterial({ roughness: 1, metalness: 0 }));
  const keeperInner = patch(new MeshPhysicalMaterial({ roughness: 1, metalness: 0 }));

  const thread = patch(
    new MeshPhysicalMaterial({ roughness: 0.7, metalness: 0, sheen: 0.5, sheenRoughness: 0.55, vertexColors: true }),
  );
  const tm = threadMaps();
  thread.normalMap = tex(tm.normal, 1, false);
  thread.normalMap.repeat.set(1, 1);
  thread.normalScale = new Vector2(1.4, 1.4);

  const cut = patch(new MeshStandardMaterial({ roughness: 0.92, metalness: 0, side: DoubleSide }));

  const bm = brushedMaps();
  const brushedNormal = tex(bm.normal, bm.tile, false);
  const brushedRough = tex(bm.rough, bm.tile, false);
  const metal = () => patch(new MeshPhysicalMaterial({ metalness: 1, roughness: 0.3 }));
  const frame = metal();
  const prong = metal();

  const monogram = patch(
    new MeshPhysicalMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
      roughness: 0.3,
    }),
  );

  const state = { finish: null, pendingFinish: null };

  const setLeatherMaps = (maps, f) => {
    let t = textures.get(maps.finish);
    if (!t) {
      t = {
        normal: tex(maps.normal, maps.tile, false),
        orm: tex(maps.orm, maps.tile, false),
        albedo: tex(maps.albedo, maps.tile, true),
        gain: maps.tintGain,
      };
      textures.set(maps.finish, t);
    }
    for (const m of [outer, lining, keeperOuter, keeperInner]) {
      const isLining = m === lining || m === keeperInner;
      m.map = t.albedo;
      m.normalMap = t.normal;
      m.roughnessMap = t.orm;
      m.aoMap = t.orm;
      m.aoMapIntensity = 0.9;
      m.normalScale = new Vector2(1, 1).multiplyScalar(f.normal * (isLining ? f.lining : 1));
      m.roughness = Math.min(1, f.rough * (isLining ? 1.18 : 1));
      m.clearcoat = isLining ? f.clearcoat * 0.4 : f.clearcoat;
      m.clearcoatRoughness = f.clearcoatRoughness;
      m.sheen = f.sheen;
      m.sheenRoughness = 0.5;
      m.envMapIntensity = f.env;
      m.userData.gain = t.gain;
      m.needsUpdate = true;
    }
    state.finish = maps.finish;
  };

  const paint = (resolved) => {
    const f = FINISH[state.finish] ?? FINISH.lisse;
    const gain = outer.userData.gain ?? 1;
    const base = new Color(resolved.leatherHex);
    const inner = new Color(resolved.liningHex);
    outer.color.copy(base).multiplyScalar(gain);
    keeperOuter.color.copy(outer.color);
    lining.color.copy(inner).multiplyScalar(gain * (resolved.lining ? 1 : 0.92));
    keeperInner.color.copy(lining.color);
    for (const [m, c] of [
      [outer, base],
      [keeperOuter, base],
      [lining, inner],
      [keeperInner, inner],
    ]) {
      // Velours du nubuck : reflet rasant de la teinte du cuir, éclaircie.
      m.sheenColor.copy(c).lerp(_c.set('#ffffff'), 0.22).multiplyScalar(f.sheen ? 0.55 : 0);
    }
    // Tranche : teinture plus sombre, légèrement plus brillante.
    edge.color.copy(base).multiplyScalar(0.42);
    edge.roughness = state.finish === 'mat' ? 0.5 : 0.4;
    edge.clearcoat = state.finish === 'mat' ? 0.2 : 0.38;
    cut.color.copy(base).multiplyScalar(0.3);

    // Fil : ton sur ton = teinte du cuir légèrement éclaircie.
    if (resolved.stitchHex) thread.color.set(resolved.stitchHex).multiplyScalar(0.8); // le fil ciré n'est jamais blanc pur
    else thread.color.copy(base).multiplyScalar(1.16).lerp(_c.set('#6f665c'), 0.06);
    thread.sheenColor.copy(thread.color).lerp(_c.set('#ffffff'), 0.3).multiplyScalar(0.35);

    // Métal
    const mt = METAL[resolved.buckle] ?? METAL.brosse;
    for (const m of [frame, prong]) {
      m.color.set(resolved.buckleHex).multiplyScalar(mt.gain);
      m.roughness = mt.roughness;
      m.metalness = mt.metalness;
      m.envMapIntensity = mt.env;
      const wasAniso = m.anisotropy > 0;
      const wasBrushed = !!m.normalMap;
      m.anisotropy = mt.anisotropy;
      m.normalMap = mt.brushed > 0 ? brushedNormal : null;
      m.roughnessMap = mt.brushed > 0 ? brushedRough : null;
      m.normalScale = new Vector2(mt.brushed, mt.brushed);
      if (wasAniso !== mt.anisotropy > 0 || wasBrushed !== mt.brushed > 0) m.needsUpdate = true;
    }

    // Monogramme
    const foil = FOIL[resolved.monogramStyle];
    if (foil) {
      monogram.color.set(foil.color);
      monogram.metalness = 1;
      monogram.roughness = foil.roughness;
      monogram.envMapIntensity = 1.25;
    } else {
      monogram.color.copy(base).multiplyScalar(0.5);
      monogram.metalness = 0;
      monogram.roughness = 0.3;
      monogram.envMapIntensity = 1;
    }
  };

  return {
    cuts,
    strap: [outer, lining, edge],
    keeper: [keeperOuter, keeperInner, edge],
    thread,
    cut,
    frame,
    prong,
    monogram,
    get finish() {
      return state.finish;
    },
    /**
     * Applique une configuration résolue. Les cartes du fini sont générées de façon asynchrone
     * la première fois ; la promesse est résolue une fois le matériau à jour.
     */
    async apply(resolved, isCurrent = () => true) {
      const finish = FINISH[resolved.finish] ? resolved.finish : 'lisse';
      if (state.finish) paint(resolved);
      if (finish !== state.finish) {
        const maps = await leatherMaps(finish);
        if (!isCurrent()) return false;
        setLeatherMaps(maps, FINISH[finish]);
        paint(resolved);
      }
      return true;
    },
    setMonogramMaps(alpha, normal) {
      monogram.alphaMap = alpha;
      monogram.normalMap = normal;
      monogram.normalScale = new Vector2(1, 1);
      monogram.needsUpdate = true;
    },
    dispose() {
      for (const t of owned) t.dispose();
      for (const m of [outer, lining, edge, keeperOuter, keeperInner, thread, cut, frame, prong, monogram]) m.dispose();
    },
  };
}
