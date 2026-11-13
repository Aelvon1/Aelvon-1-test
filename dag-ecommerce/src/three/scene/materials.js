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
  lisse: { normal: 1.0, rough: 1.0, clearcoat: 0.3, clearcoatRoughness: 0.34, sheen: 0, sheenRoughness: 0.5, env: 1.0, lining: 0.6 },
  graine: { normal: 1.0, rough: 1.0, clearcoat: 0.14, clearcoatRoughness: 0.4, sheen: 0, sheenRoughness: 0.5, env: 1.0, lining: 0.5 },
  // Nubuck : aucun vernis ; un lobe de velours accroche la lumière rasante.
  mat: { normal: 1.0, rough: 1.0, clearcoat: 0, clearcoatRoughness: 0.5, sheen: 0.45, sheenRoughness: 0.6, env: 1.0, lining: 1 },
};

// env : [plateau sombre, fond papier]. Sur papier, l'acier clair est retenu pour garder du modelé.
const METAL = {
  brosse: { gain: [1.04, 0.86], roughness: 0.36, metalness: 1, anisotropy: 0.8, brushed: 0.55, env: [1.05, 0.9] },
  poli: { gain: [0.96, 0.9], roughness: 0.045, metalness: 1, anisotropy: 0, brushed: 0, env: [1.0, 0.7] },
  noir: { gain: [0.9, 0.9], roughness: 0.38, metalness: 0.85, anisotropy: 0, brushed: 0.1, env: [1.5, 1.35] },
  antique: { gain: [1.2, 1.1], roughness: 0.38, metalness: 1, anisotropy: 0.4, brushed: 0.4, env: [1.15, 1.0] },
  laiton: { gain: [1.3, 1.2], roughness: 0.3, metalness: 1, anisotropy: 0.75, brushed: 0.5, env: [1.15, 1.0] },
};

// Dorure à chaud : film satiné posé dans une empreinte peu profonde, le grain du cuir transparaît.
const FOIL = {
  marque: null,
  or: { color: '#d8ae62', roughness: 0.5 },
  argent: { color: '#c6c8cc', roughness: 0.52 },
};

const _c = new Color();
const _hsl = { h: 0, s: 0, l: 0 };
const smooth = (a, b, x) => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

/**
 * Lecture d'une teinte de cuir pour le rendu.
 *  - dark : 1 pour les cuirs très sombres. Leur albédo est relevé (un noir photographié n'est
 *    jamais un trou) et les teintes sombres colorées gagnent en saturation, pour que l'ébène ne
 *    se confonde pas avec le noir ;
 *  - cool : 1 pour les teintes neutres ou froides (noir, bleu nuit, charbon, vert) : elles sont
 *    éclairées en lumière neutre, sinon le noir vire au brun.
 */
export function leatherLook(hex, out = new Color()) {
  out.set(hex);
  const max = Math.max(out.r, out.g, out.b, 1e-5);
  const lum = 0.2126 * out.r + 0.7152 * out.g + 0.0722 * out.b;
  const warmth = (out.r - out.b) / max;
  const dark = 1 - smooth(0.008, 0.06, lum);
  const chroma = (max - Math.min(out.r, out.g, out.b)) / max;
  const gain = 1 + (1.15 - 0.45 * smooth(0.12, 0.4, chroma)) * dark;
  const sat = 1 + 0.4 * dark * smooth(0.12, 0.4, chroma);
  out.r = Math.max(0, lum + (out.r - lum) * sat) * gain;
  out.g = Math.max(0, lum + (out.g - lum) * sat) * gain;
  out.b = Math.max(0, lum + (out.b - lum) * sat) * gain;
  return { color: out, dark, cool: 1 - smooth(0.12, 0.3, warmth) };
}

/**
 * Ajoute à un matériau standard/physique :
 *  - l'occlusion par sommet `aOcc` (appliquée à l'éclairage d'ambiance, diffus et spéculaire) ;
 *  - en option (`shade`), la teinte par sommet `aShade` : elle assombrit l'albédo, mate la surface
 *    et éteint tous les reflets (fond des filets de couture, perces du fil, joint de tranche) ;
 *  - en option (`cuts`), les perçages de la lanière (crans, fente d'ardillon) par rejet de fragments.
 */
function patch(material, { cuts = null, shade = false, hole = null } = {}) {
  const uShade = { value: 1 };
  material.userData.uShade = uShade;
  material.onBeforeCompile = (shader) => {
    if (cuts) shader.uniforms.uCuts = cuts;
    if (shade) shader.uniforms.uShade = uShade;
    if (hole) shader.uniforms.uHoleColor = hole;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nattribute float aOcc;\nvarying float vOcc;${shade ? '\nattribute float aShade;\nvarying float vShade;' : ''}${hole ? '\nattribute float aHole;\nvarying float vHole;' : ''}${cuts ? '\nvarying vec2 vStrap;' : ''}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvOcc = aOcc;${shade ? '\nvShade = aShade;' : ''}${hole ? '\nvHole = aHole;' : ''}${cuts ? '\nvStrap = uv;' : ''}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying float vOcc;${shade ? '\nvarying float vShade;\nuniform float uShade;' : ''}${hole ? '\nvarying float vHole;\nuniform vec3 uHoleColor;' : ''}${
          cuts ? `\nvarying vec2 vStrap;\nuniform vec4 uCuts[${CUT_COUNT}];` : ''
        }`,
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
        }
        float dagShade = ${shade ? 'mix( 1.0, clamp( vShade, 0.0, 1.0 ), uShade )' : '1.0'};`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>${hole ? '\ndiffuseColor.rgb = mix( diffuseColor.rgb, uHoleColor, vHole );' : ''}\ndiffuseColor.rgb *= dagShade;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix( 1.0, roughnessFactor, smoothstep( 0.5, 1.0, dagShade ) );',
      )
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        {
          float occ = clamp( vOcc, 0.0, 1.0 );
          float gloss = occ * dagShade * dagShade;
          reflectedLight.indirectDiffuse *= occ;
          reflectedLight.directDiffuse *= occ;
          reflectedLight.directSpecular *= gloss;
          #if defined( USE_CLEARCOAT )
            clearcoatSpecularIndirect *= gloss;
            clearcoatSpecularDirect *= gloss;
          #endif
          #if defined( USE_SHEEN )
            sheenSpecularIndirect *= gloss;
            sheenSpecularDirect *= gloss;
          #endif
          #if defined( USE_ENVMAP ) && defined( STANDARD )
            float dotNVo = saturate( dot( geometryNormal, geometryViewDir ) );
            reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNVo, occ, material.roughness ) * dagShade * dagShade;
          #endif
        }`,
      );
  };
  material.customProgramCacheKey = () => `dag-occ${cuts ? '-cuts' : ''}${shade ? '-shade' : ''}${hole ? '-hole' : ''}`;
  return material;
}

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

  const leather = (withCuts) => patch(new MeshPhysicalMaterial({ roughness: 1, metalness: 0 }), { cuts: withCuts ? cuts : null, shade: true });
  const outer = leather(true);
  const lining = leather(true);
  const edge = patch(new MeshPhysicalMaterial({ roughness: 0.3, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.12 }), { shade: true });
  const keeperOuter = leather(false);
  const keeperInner = leather(false);

  const holeColor = { value: new Color(0x000000) }; // teinte des perces du fil : le cuir, en plus sombre
  const thread = patch(new MeshPhysicalMaterial({ roughness: 0.62, metalness: 0, sheen: 0.5, sheenRoughness: 0.5 }), { shade: true, hole: holeColor });
  const tm = threadMaps();
  thread.normalMap = tex(tm.normal, 1, false);
  thread.normalMap.repeat.set(1, 1);
  thread.normalScale = new Vector2(1.1, 1.1);

  const cut = patch(new MeshStandardMaterial({ roughness: 0.95, metalness: 0, side: DoubleSide }));

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

  const state = { finish: null, floor: 0, resolved: null };

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
      m.sheenRoughness = f.sheenRoughness;
      m.userData.gain = t.gain;
      m.needsUpdate = true;
    }
    state.finish = maps.finish;
  };

  const base = new Color();
  const inner = new Color();

  const paint = (resolved) => {
    state.resolved = resolved;
    const f = FINISH[state.finish] ?? FINISH.lisse;
    const paper = state.floor > 0.5 ? 1 : 0;
    const gain = outer.userData.gain ?? 1;
    const look = leatherLook(resolved.leatherHex, base);
    const lookIn = leatherLook(resolved.liningHex, inner);
    outer.color.copy(base).multiplyScalar(gain);
    keeperOuter.color.copy(outer.color);
    lining.color.copy(inner).multiplyScalar(gain * (resolved.lining ? 1 : 0.92));
    keeperInner.color.copy(lining.color);
    for (const [m, c, l] of [
      [outer, base, look],
      [keeperOuter, base, look],
      [lining, inner, lookIn],
      [keeperInner, inner, lookIn],
    ]) {
      // Velours du nubuck : reflet rasant de la teinte du cuir, éclaircie.
      m.sheenColor.copy(c).lerp(_c.set('#ffffff'), 0.3 + 0.2 * l.dark).multiplyScalar(f.sheen ? 0.8 : 0);
      // Les cuirs sombres reçoivent plus de lumière : sur papier ils se boucheraient, sur noir ils se fondraient.
      m.envMapIntensity = f.env * (1 + (paper ? 0.4 : 0.25) * l.dark);
    }
    // Sans couture, le filet n'est qu'une marque de fer : pas de teinte plus sombre.
    outer.userData.uShade.value = resolved.stitchHex === false ? 0 : 1;

    // Tranche : teinture nettement plus sombre que la fleur, lissée et vernie → un filet de lumière net.
    const mat = state.finish === 'mat';
    edge.color.copy(base).multiplyScalar(0.27);
    edge.color.getHSL(_hsl);
    edge.color.setHSL(_hsl.h, Math.min(1, _hsl.s * 1.08), _hsl.l);
    edge.roughness = mat ? 0.46 : 0.38;
    edge.clearcoat = mat ? 0.16 : 0.26;
    edge.clearcoatRoughness = mat ? 0.24 : 0.16;
    edge.specularIntensity = 0.6; // reflets rasants contenus : la tranche reste sombre, seule l'arête accroche
    edge.envMapIntensity = 0.8 + 0.5 * look.dark; // sur un cuir noir, c'est le filet de lumière des tranches qui dessine les spires
    cut.color.copy(base).multiplyScalar(0.36);

    // Fil : ton sur ton = teinte du cuir légèrement éclaircie.
    if (resolved.stitchHex) thread.color.set(resolved.stitchHex).multiplyScalar(0.8); // le fil ciré n'est jamais blanc pur
    else thread.color.copy(base).multiplyScalar(1.2).lerp(_c.set('#6f665c'), 0.06 + 0.1 * look.dark);
    thread.sheenColor.copy(thread.color).lerp(_c.set('#ffffff'), 0.3).multiplyScalar(0.35);
    thread.envMapIntensity = 1 + 0.3 * look.dark;
    holeColor.value.copy(base).multiplyScalar(0.8);

    // Métal
    const mt = METAL[resolved.buckle] ?? METAL.brosse;
    for (const m of [frame, prong]) {
      m.color.set(resolved.buckleHex).multiplyScalar(mt.gain[paper]);
      m.roughness = mt.roughness;
      m.metalness = mt.metalness;
      m.envMapIntensity = mt.env[paper];
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
      monogram.envMapIntensity = 1.0;
      monogram.normalScale.set(0.55, 0.55);
    } else {
      monogram.color.copy(base).multiplyScalar(0.5);
      monogram.metalness = 0;
      monogram.roughness = 0.3;
      monogram.envMapIntensity = 1;
      monogram.normalScale.set(1, 1);
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
    /**
     * Carte d'environnement (PMREM) de la scène. Elle est posée sur chaque matériau : three n'applique
     * `envMapIntensity` qu'à une carte propre au matériau, pas à `scene.environment` — sans cela, les
     * intensités réglées par matière (cuirs sombres relevés, acier retenu sur papier…) resteraient lettre morte.
     */
    setEnvironment(texture) {
      for (const m of [outer, lining, edge, keeperOuter, keeperInner, thread, cut, frame, prong, monogram]) {
        if (!m.envMap) m.needsUpdate = true;
        m.envMap = texture;
      }
    },
    /** Ton du support (0 sombre, 1 papier) : certains réglages en dépendent. */
    setFloor(floor) {
      state.floor = floor > 0.5 ? 1 : 0;
      if (state.finish && state.resolved) paint(state.resolved);
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
