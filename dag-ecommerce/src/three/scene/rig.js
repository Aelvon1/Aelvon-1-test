import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  NoColorSpace,
  PerspectiveCamera,
  Quaternion,
  Vector2,
  Vector3,
} from 'three';
import { buildBuckle, buildKeeper } from './buckle';
import { createStudioEnvironment } from './environment';
import { createMaterials, leatherLook } from './materials';
import { createMonogramCanvases, drawMonogram, loadDisplayFont } from './monogram';
import { createPose, flowExtremes, poseHandedness, sampleFrame, setFlowParams, setFlowTime, solvePose } from './pose';
import { createContactShadow, SHADOW_LAYER } from './shadow';
import { beltSpec, clamp, lerp } from './spec';
import { leatherMaps } from './textures';
import { buildCoilOcclusion, createStrap, makeSample, poseStitches, poseStrap, surfaceAt, writeOcclusion } from './strap';
import { beltPoints, blendViews, describeView, solveCamera, VIEWS } from './views';

// ---------------------------------------------------------------------------
// BeltRig : la ceinture, sa mise en pose, ses cadrages et ses interactions.
// Tout l'état vit dans l'instance (aucun singleton) : plusieurs scènes peuvent coexister.
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180;
const BUCKLE_TILT = 6 * DEG;
const AUTO_SPEED = 0.2; // rad/s pour autoRotate = 1
const VIEW_TIME = 1.5; // s
const POSE_TIME = 2.2; // s
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Brin de point sellier : fil rond couché sur la fleur, dont les deux bouts plongent dans leur
 * perce. Repère local : X le long du brin (longueur 1, mise à l'échelle `len` par l'instance),
 * Y en travers, Z = normale de la face ; Y et Z en millimètres.
 * `aShade` assombrit le fil là où il entre dans le cuir ; `aHole` marque les perces (petits disques mats
 * à la teinte du cuir, sombres au centre).
 */
function stitchGeometry(len, { stations, seg, holes }) {
  const R = 0.36; // rayon du fil ciré (0,72 mm)
  const RISE = 0.18; // axe du fil au-dessus du fond du filet : les deux tiers du fil sont en relief
  const A0 = -0.62;
  const A1 = Math.PI + 0.62;
  const position = [];
  const normal = [];
  const uv = [];
  const shade = [];
  const hole = [];
  const index = [];
  const axis = (e) => RISE - 0.62 * Math.pow(sstep(0.6, 1, Math.abs(e)), 1.3);
  for (const e of stations) {
    const dive = sstep(0.6, 1, Math.abs(e));
    const zc = axis(e);
    const slope = (axis(e + 0.01) - axis(e - 0.01)) / (0.01 * len); // dz/dX en mm
    const sl = Math.hypot(1, slope);
    const scale = 1 - 0.22 * dive; // le fil se serre en entrant dans la perce
    for (let j = 0; j <= seg; j++) {
      const a = A0 + ((A1 - A0) * j) / seg;
      const cy = Math.cos(a);
      const cz = Math.sin(a);
      position.push(e / 2, cy * R * scale, zc + cz * R * scale);
      // normale en mm : cos(a)·Y + sin(a)·U, U ⟂ à l'axe du fil ; composante X × len (matrice d'instance non uniforme)
      const nx = ((-slope * cz) / sl) * len;
      const ny = cy;
      const nz = cz / sl;
      const l = Math.hypot(nx, ny, nz) || 1;
      normal.push(nx / l, ny / l, nz / l);
      uv.push((e + 1) / 2, j / seg);
      shade.push((1 - 0.7 * dive * dive) * (0.84 + 0.16 * Math.max(0, cz)));
      hole.push(0);
    }
  }
  const cols = seg + 1;
  for (let i = 0; i < stations.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      index.push(a, b, d, a, d, c);
    }
  }
  if (holes) {
    // Perces : là où le fil traverse, le cuir s'ouvre en une petite fente sombre.
    const N = 8;
    for (const sign of [-1, 1]) {
      const base = position.length / 3;
      const cx = sign * (0.5 - 0.2 / len);
      position.push(cx, 0, 0.02);
      normal.push(0, 0, 1);
      uv.push(0.5, 0.5);
      shade.push(0.06);
      hole.push(1);
      for (let k = 0; k < N; k++) {
        const t = (k / N) * Math.PI * 2;
        position.push(cx + (Math.cos(t) * 0.4) / len, Math.sin(t) * 0.43, 0.02);
        normal.push(0, 0, 1);
        uv.push(0.5, 0.5);
        shade.push(0.82);
        hole.push(1);
      }
      for (let k = 0; k < N; k++) index.push(base, base + 1 + k, base + 1 + ((k + 1) % N));
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(position), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(normal), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute('aShade', new BufferAttribute(new Float32Array(shade), 1));
  g.setAttribute('aHole', new BufferAttribute(new Float32Array(hole), 1));
  g.setIndex(index);
  return g;
}

const STITCH_FRONT = { stations: [-1, -0.9, -0.76, -0.55, 0.55, 0.76, 0.9, 1], seg: 8, holes: true };
const STITCH_BACK = { stations: [-1, -0.8, 0, 0.8, 1], seg: 4, holes: false }; // envers : rarement vu de près

/** Contour d'un perçage oblong (abscisses a → b, rayon r) : [sigma, v, nSigma, nV] ; les flancs suivent la lanière. */
function cutOutline(c) {
  const pts = [];
  const ARC = 10;
  const sides = Math.max(0, Math.round((c.b - c.a) / 1.1));
  for (let i = 0; i <= ARC; i++) {
    const t = -Math.PI / 2 + (i / ARC) * Math.PI;
    pts.push([c.b + Math.cos(t) * c.r, Math.sin(t) * c.r, Math.cos(t), Math.sin(t)]);
  }
  for (let i = 1; i < sides; i++) pts.push([c.b + ((c.a - c.b) * i) / sides, c.r, 0, 1]);
  for (let i = 0; i <= ARC; i++) {
    const t = Math.PI / 2 + (i / ARC) * Math.PI;
    pts.push([c.a + Math.cos(t) * c.r, Math.sin(t) * c.r, Math.cos(t), Math.sin(t)]);
  }
  for (let i = 1; i < sides; i++) pts.push([c.a + ((c.b - c.a) * i) / sides, -c.r, 0, -1]);
  if (!sides) {
    // perçage rond : les deux demi-cercles se rejoignent, on retire les doublons
    pts.splice(ARC, 1);
    pts.pop();
  }
  return pts;
}

export class BeltRig {
  constructor({ renderer, scene, camera, invalidate = () => {} }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.invalidate = invalidate;
    this.disposed = false;

    this.root = new Group();
    this.turntable = new Group();
    this.turntable.matrixAutoUpdate = false;
    this.root.add(this.turntable);
    scene.add(this.root);

    this.floor = 0; // 0 = plateau sombre, 1 = papier clair
    this.mood = 0; // 0 = lumière chaude, 1 = lumière neutre (cuirs noirs et froids)
    this.envTarget = createStudioEnvironment(renderer, this.floor, this.mood);
    scene.environment = this.envTarget.texture;

    this.materials = createMaterials(renderer.capabilities.getMaxAnisotropy());
    this.materials.setEnvironment(this.envTarget.texture);
    this.shadow = createContactShadow();
    this.turntable.add(this.shadow.plane);

    // Monogramme
    this.monoCanvases = createMonogramCanvases();
    const mkTex = (canvas) => {
      const t = new CanvasTexture(canvas);
      t.colorSpace = NoColorSpace;
      t.minFilter = LinearMipmapLinearFilter;
      t.magFilter = LinearFilter;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      return t;
    };
    this.monoAlpha = mkTex(this.monoCanvases.alpha);
    this.monoNormal = mkTex(this.monoCanvases.normal);
    this.materials.setMonogramMaps(this.monoAlpha, this.monoNormal);
    this.monoText = null;
    this.grain = null; // cartes du fini courant (grain lisible dans le monogramme)

    this.parts = null; // géométries dépendant de la largeur
    this.width = null;
    this.reveal = false;
    this.resolved = null;
    this.configToken = 0;

    // État d'animation
    this.blend = 0; // 0 rouleau … 1 déroulée
    this.blendFrom = 0;
    this.blendTo = 0;
    this.blendT = 1;
    this.flowTime = 0;
    this.viewName = 'hero';
    this.aspect = 1;
    this.options = { interactive: false, autoRotate: 0, parallax: false, reducedMotion: false, intro: false };

    this.cam = { pos: new Vector3(0, 60, 400), quat: new Quaternion(), fov: 30, pivot: new Vector3(), range: 0 };
    this.camFrom = { pos: new Vector3(), quat: new Quaternion(), fov: 30, pivot: new Vector3() };
    this.camTo = { pos: new Vector3(), quat: new Quaternion(), fov: 30, pivot: new Vector3(), range: 0 };
    this.viewT = 1;
    this.viewDirty = true;
    this.snapView = true;
    this.introDone = false; // le tout premier cadrage peut partir de celui du poster

    this.theta = 0;
    this.omega = 0;
    this.pitch = 0;
    this.pitchVel = 0;
    this.recenter = false;
    this.dragging = false;
    this.oscT = 0;
    this.osc = 0;
    this.par = { x: 0, y: 0, tx: 0, ty: 0 };

    this.ready = false;
    this.needsRender = true;
    this.shadowDirty = true;
    this.still = false; // rendu trop lent : plus de mouvement continu (voir setStill)
    this.poseGoal = null; // cadrage de la pose d'arrivée, pendant un déroulé
    this.poseFrom = null; // cadrage au départ du déroulé

    this._onFonts = () => {
      if (this.disposed) return;
      this.monoText = null;
      this.updateMonogram();
      this.invalidate();
    };
    if (typeof document !== 'undefined' && document.fonts?.addEventListener) {
      document.fonts.addEventListener('loadingdone', this._onFonts);
    }
  }

  // --- Construction -------------------------------------------------------

  buildParts(width, reveal = false) {
    this.disposeParts();
    const spec = beltSpec(width);
    const pose = createPose(spec, { reveal });
    const strap = createStrap(spec);
    const M = this.materials;

    // Occlusion du rouleau, calculée une fois sur la pose au repos.
    solvePose(pose, 0);
    poseStrap(strap, pose);
    buildCoilOcclusion(strap);

    const strapMesh = new Mesh(strap.geometry, M.strap);
    strapMesh.frustumCulled = false;
    strapMesh.layers.enable(SHADOW_LAYER);

    const stitchSet = (set, detail) => {
      const geometry = stitchGeometry(spec.stitchLength, detail);
      const occ = new InstancedBufferAttribute(new Float32Array(set.count).fill(1), 1).setUsage(DynamicDrawUsage);
      geometry.setAttribute('aOcc', occ);
      const mesh = new InstancedMesh(geometry, M.thread, set.count);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      return { set, geometry, occ, mesh };
    };
    const stitches = [stitchSet(strap.stitches.front, STITCH_FRONT), stitchSet(strap.stitches.back, STITCH_BACK)];

    // Perçages : parois des crans et de la fente d'ardillon.
    const cutDefs = spec.holes.map((s) => ({ a: spec.sigma0 + s, b: spec.sigma0 + s, r: spec.holeRadius }));
    cutDefs.push({ a: spec.tailLength - 4, b: spec.sigma0 + 3.2, r: spec.slotHalf });
    cutDefs.forEach((c, i) => M.cuts.value[i].set(c.a, c.b, c.r, 0));
    const cutOutlines = cutDefs.map(cutOutline);
    const cutCount = cutOutlines.reduce((n, o) => n + o.length, 0);
    const cutGeo = new BufferGeometry();
    cutGeo.setAttribute('position', new BufferAttribute(new Float32Array(cutCount * 6), 3).setUsage(DynamicDrawUsage));
    cutGeo.setAttribute('normal', new BufferAttribute(new Float32Array(cutCount * 6), 3).setUsage(DynamicDrawUsage));
    cutGeo.setAttribute('aOcc', new BufferAttribute(new Float32Array(cutCount * 2).fill(0.4), 1));
    const cutIndex = [];
    let base = 0;
    for (const o of cutOutlines) {
      const n = o.length;
      for (let i = 0; i < n; i++) {
        const i1 = (i + 1) % n;
        const a = base + i * 2;
        const b = base + i1 * 2;
        cutIndex.push(a, b, a + 1, b, b + 1, a + 1);
      }
      base += n * 2;
    }
    cutGeo.setIndex(cutIndex);
    const cuts = new Mesh(cutGeo, M.cut);
    cuts.frustumCulled = false;

    // Monogramme : pastille épousant la fleur.
    const MU = 28;
    const MV = 8;
    const monoGeo = new BufferGeometry();
    const mv = (MU + 1) * (MV + 1);
    monoGeo.setAttribute('position', new BufferAttribute(new Float32Array(mv * 3), 3).setUsage(DynamicDrawUsage));
    monoGeo.setAttribute('normal', new BufferAttribute(new Float32Array(mv * 3), 3).setUsage(DynamicDrawUsage));
    const muv = new Float32Array(mv * 2);
    const mi = [];
    for (let j = 0; j <= MV; j++) {
      for (let i = 0; i <= MU; i++) {
        const o = j * (MU + 1) + i;
        muv[o * 2] = i / MU;
        muv[o * 2 + 1] = j / MV;
        if (i < MU && j < MV) mi.push(o, o + 1, o + MU + 2, o, o + MU + 2, o + MU + 1);
      }
    }
    monoGeo.setAttribute('uv', new BufferAttribute(muv, 2));
    monoGeo.setAttribute('aOcc', new BufferAttribute(new Float32Array(mv).fill(1), 1));
    monoGeo.setIndex(mi);
    const monogram = new Mesh(monoGeo, M.monogram);
    monogram.frustumCulled = false;
    monogram.renderOrder = 2;
    monogram.visible = false;

    // Boucle et passant
    const bg = buildBuckle(spec);
    const buckle = new Group();
    buckle.matrixAutoUpdate = false;
    const frame = new Mesh(bg.frame, M.frame);
    const prong = new Mesh(bg.prong, M.prong);
    frame.layers.enable(SHADOW_LAYER);
    prong.layers.enable(SHADOW_LAYER);
    buckle.add(frame, prong);
    const keeperGeo = buildKeeper(spec);
    const keeper = new Mesh(keeperGeo, M.keeper);
    keeper.matrixAutoUpdate = false;
    keeper.layers.enable(SHADOW_LAYER);

    this.turntable.add(strapMesh, stitches[0].mesh, stitches[1].mesh, cuts, monogram, buckle, keeper);
    this.parts = {
      spec,
      pose,
      strap,
      strapMesh,
      stitches,
      cuts,
      cutGeo,
      cutOutlines,
      monogram,
      monoGeo,
      MU,
      MV,
      buckle,
      frameGeo: bg.frame,
      prongGeo: bg.prong,
      keeper,
      keeperGeo,
    };
    this.width = width;
    this.reveal = reveal;
    this.shadowDirty = true;
    this.viewDirty = true;
    this.poseAll();
  }

  disposeParts() {
    const p = this.parts;
    if (!p) return;
    this.turntable.remove(p.strapMesh, p.stitches[0].mesh, p.stitches[1].mesh, p.cuts, p.monogram, p.buckle, p.keeper);
    p.strap.geometry.dispose();
    for (const st of p.stitches) {
      st.geometry.dispose();
      st.mesh.dispose();
    }
    p.cutGeo.dispose();
    p.monoGeo.dispose();
    p.frameGeo.dispose();
    p.prongGeo.dispose();
    p.keeperGeo.dispose();
    this.parts = null;
  }

  // --- Pose ----------------------------------------------------------------

  /** Résout la pose courante et replace tout ce qui en dépend. */
  poseAll() {
    const p = this.parts;
    if (!p) return;
    const { pose, strap, spec } = p;
    solvePose(pose, this.blend);
    poseStrap(strap, pose);
    writeOcclusion(strap, this.blend, this.floor);
    for (const st of p.stitches) {
      poseStitches(strap, st.set, st.mesh.instanceMatrix.array, st.occ.array);
      st.mesh.instanceMatrix.needsUpdate = true;
      st.occ.needsUpdate = true;
    }

    // Parois des perçages
    const smp = this._smp || (this._smp = makeSample());
    const cp = p.cutGeo.attributes.position.array;
    const cn = p.cutGeo.attributes.normal.array;
    let o = 0;
    for (const outline of p.cutOutlines) {
      for (const [sg, v, ns, nv] of outline) {
        for (const face of [1, -1]) {
          surfaceAt(strap, sg, v, face, -0.03, smp);
          cp[o] = smp.pos[0];
          cp[o + 1] = smp.pos[1];
          cp[o + 2] = smp.pos[2];
          // normale tournée vers l'axe du perçage
          cn[o] = -(smp.T[0] * ns + smp.B[0] * nv);
          cn[o + 1] = -(smp.T[1] * ns + smp.B[1] * nv);
          cn[o + 2] = -(smp.T[2] * ns + smp.B[2] * nv);
          o += 3;
        }
      }
    }
    p.cutGeo.attributes.position.needsUpdate = true;
    p.cutGeo.attributes.normal.needsUpdate = true;

    // Monogramme : lecture le long de χ·T, hauteur le long de χ·B (χ = sens d'enroulement)
    if (p.monogram.visible) {
      const chi = poseHandedness;
      const mp = p.monoGeo.attributes.position.array;
      const mn = p.monoGeo.attributes.normal.array;
      let q = 0;
      for (let j = 0; j <= p.MV; j++) {
        for (let i = 0; i <= p.MU; i++) {
          const sg = spec.sigma0 + spec.monoAt + (i / p.MU - 0.5) * spec.monoLength * chi;
          const v = (j / p.MV - 0.5) * spec.monoHeight * chi;
          surfaceAt(strap, sg, v, 1, 0.012, smp);
          mp[q] = smp.pos[0];
          mp[q + 1] = smp.pos[1];
          mp[q + 2] = smp.pos[2];
          mn[q] = smp.N[0];
          mn[q + 1] = smp.N[1];
          mn[q + 2] = smp.N[2];
          q += 3;
        }
      }
      p.monoGeo.attributes.position.needsUpdate = true;
      p.monoGeo.attributes.normal.needsUpdate = true;
    }

    // Boucle : pivote autour de la barrette
    const f = sampleFrame(pose, 0, smp);
    const cb = Math.cos(BUCKLE_TILT);
    const sb = Math.sin(BUCKLE_TILT);
    const X = new Vector3(-f.T[0] * cb + f.N[0] * sb, -f.T[1] * cb + f.N[1] * sb, -f.T[2] * cb + f.N[2] * sb);
    const Y = new Vector3(-f.B[0], -f.B[1], -f.B[2]);
    const Z = new Vector3().crossVectors(X, Y);
    p.buckle.matrix.makeBasis(X, Y, Z);
    p.buckle.matrix.setPosition(
      f.pos[0] - f.N[0] * spec.foldRadius,
      f.pos[1] - f.N[1] * spec.foldRadius,
      f.pos[2] - f.N[2] * spec.foldRadius,
    );
    p.buckle.matrixWorldNeedsUpdate = true;

    const k = sampleFrame(pose, spec.keeperAt, smp);
    p.keeper.matrix.makeBasis(new Vector3().fromArray(k.T), new Vector3().fromArray(k.B), new Vector3().fromArray(k.N));
    p.keeper.matrix.setPosition(k.pos[0], k.pos[1], k.pos[2]);
    p.keeper.matrixWorldNeedsUpdate = true;

    this.shadow.opacity = Math.max(0, 1 - this.blend * 2.5);
    this.needsRender = true;
  }

  /** Emprise au sol du rouleau, pour l'ombre de contact. */
  shadowBounds() {
    const { pose, spec } = this.parts;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < pose.n; i += 8) {
      const x = pose.pos[i * 3];
      const z = pose.pos[i * 3 + 2];
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    const pad = spec.frameLength + 52;
    return {
      cx: (minX + maxX) / 2,
      cz: (minZ + maxZ) / 2,
      half: Math.max(maxX - minX, maxZ - minZ) / 2 + pad,
    };
  }

  updateShadow() {
    if (!this.parts || this.blend > 0) return;
    const saved = this.turntable.matrix.clone();
    this.turntable.matrix.identity();
    this.turntable.updateMatrixWorld(true);
    this.shadow.update(this.renderer, this.scene, this.shadowBounds());
    this.turntable.matrix.copy(saved);
    this.turntable.updateMatrixWorld(true);
    this.shadowDirty = false;
  }

  // --- Configuration -------------------------------------------------------

  /** Applique un BeltConfig résolu. La promesse est tenue quand la ceinture est prête à être rendue. */
  setConfig(resolved) {
    this.configPromise = this.applyConfig(resolved);
    return this.configPromise;
  }

  async applyConfig(resolved) {
    const token = ++this.configToken;
    this.resolved = resolved;
    // Réversible : la pose du rouleau découvre la doublure (cœur remonté).
    const reveal = !!resolved.lining;
    if (resolved.widthMm !== this.width || reveal !== this.reveal) this.buildParts(resolved.widthMm, reveal);
    const p = this.parts;
    for (const st of p.stitches) st.mesh.visible = resolved.stitchHex !== false;
    this.setLighting(this.floor, leatherLook(resolved.leatherHex).cool > 0.5 ? 1 : 0);
    this.updateMonogram();
    const ok = await this.materials.apply(resolved, () => token === this.configToken && !this.disposed);
    if (!ok) return false;
    // Le grain du fini transparaît dans le monogramme (cartes déjà en cache à ce stade).
    const grain = await leatherMaps(resolved.finish);
    if (token !== this.configToken || this.disposed) return false;
    this.grain = grain;
    this.updateMonogram();
    this.needsRender = true;
    this.invalidate();
    return true;
  }

  updateMonogram() {
    const p = this.parts;
    if (!p || !this.resolved) return;
    const text = this.resolved.monogram || '';
    const key = `${text}|${this.grain ? this.grain.finish : ''}|${p.spec.W}`;
    if (key !== this.monoText) {
      this.monoText = key;
      const has = drawMonogram(this.monoCanvases, text, this.grain, p.spec.monoHeight);
      this.monoAlpha.needsUpdate = true;
      this.monoNormal.needsUpdate = true;
      const was = p.monogram.visible;
      p.monogram.visible = has;
      if (has && !was) this.poseAll();
      this.needsRender = true;
    } else if (p.monogram.visible !== !!text) {
      p.monogram.visible = !!text;
      if (text) this.poseAll();
    }
  }

  /**
   * Charge la police d'affichage puis redessine le monogramme. La promesse renvoyée n'attend la
   * police que `waitMs` millisecondes au plus (0 : pas d'attente) ; arrivée plus tard, elle déclenche
   * simplement un nouveau dessin.
   */
  prepareFonts(waitMs = 1500) {
    this.fontsPromise = loadDisplayFont().then(() => {
      if (this.disposed) return;
      this.monoText = null;
      this.updateMonogram();
      this.invalidate();
    });
    if (waitMs <= 0) return Promise.resolve();
    return Promise.race([this.fontsPromise, new Promise((resolve) => setTimeout(resolve, waitMs))]);
  }

  /** Ton du support : 1 = surface claire (papier), 0 = sombre. Régénère l'éclairage d'ambiance. */
  setFloor(floor) {
    this.setLighting(floor > 0.5 ? 1 : 0, this.mood);
  }

  /** Éclairage d'ambiance : support (sombre / papier) et température (chaude / neutre selon le cuir). */
  setLighting(floor, mood) {
    if ((floor === this.floor && mood === this.mood) || this.disposed) return;
    const floorChanged = floor !== this.floor;
    this.floor = floor;
    this.mood = mood;
    const old = this.envTarget;
    this.envTarget = createStudioEnvironment(this.renderer, floor, mood);
    this.scene.environment = this.envTarget.texture;
    this.materials.setEnvironment(this.envTarget.texture);
    old.dispose();
    if (floorChanged) {
      this.materials.setFloor(floor);
      this.poseAll();
    }
    this.needsRender = true;
    this.invalidate();
  }

  setOptions(options) {
    Object.assign(this.options, options);
    this.viewDirty = true;
    this.invalidate();
  }

  setAspect(aspect) {
    if (Math.abs(aspect - this.aspect) < 1e-4) return;
    this.aspect = aspect;
    this.viewDirty = true;
    this.snapView = true;
  }

  setView(view, instant = false) {
    const name = VIEWS.includes(view) ? view : 'hero';
    if (name === this.viewName && !instant) return;
    this.viewName = name;
    this.viewDirty = true;
    this.recenter = true;
    if (instant) this.snapView = true;
    this.invalidate();
  }

  setPose(pose, instant = false) {
    const to = pose === 'flow' ? 1 : 0;
    if (to === this.blendTo && !instant) return;
    this.blendFrom = this.blend;
    this.blendTo = to;
    this.blendT = instant || this.calm ? 1 : 0;
    if (this.blendT === 1 && this.blend !== to) {
      this.blend = to;
      this.poseAll();
      if (to === 0) this.shadowDirty = true;
    }
    if (this.blendT < 1) {
      // Déroulé animé : la caméra part de son cadrage actuel puis suit la pose image par image (voir
      // update) ; elle ne file plus vers le cadrage final pendant que la ceinture est encore en chemin.
      this.poseFrom = { pos: this.cam.pos.clone(), quat: this.cam.quat.clone(), fov: this.cam.fov, pivot: this.cam.pivot.clone() };
      this.poseGoal = null;
    } else {
      this.viewDirty = true;
      if (instant) this.snapView = true;
    }
    this.recenter = true;
    this.invalidate();
  }

  // --- Cadrage ---------------------------------------------------------------

  /** Vrai quand rien ne doit bouger tout seul : moins d'animations demandé, ou rendu trop lent. */
  get calm() {
    return this.options.reducedMotion || this.still;
  }

  /** Débattement de rotation à prévoir dans le cadre, selon les options. */
  rotateRange() {
    const { interactive, autoRotate, parallax } = this.options;
    const { calm } = this;
    return interactive || (!!autoRotate && !calm) ? Math.PI : parallax && !calm ? 0.09 : 0;
  }

  /**
   * Enveloppe de la pose déroulée : réunion des points de la ceinture aux extrêmes de sa respiration.
   * Cadrer cette enveloppe garantit que la ceinture ne sort jamais de l'image en respirant.
   */
  flowEnvelope() {
    const p = this.parts;
    if (!p.envelope) {
      const pts = [];
      for (const [k1, k2, ph] of flowExtremes()) {
        setFlowParams(p.pose, k1, k2, ph);
        solvePose(p.pose, 1);
        for (const q of beltPoints({ pose: p.pose, spec: p.spec, coil: 0 }, 20)) pts.push(q);
      }
      p.envelope = pts;
      // la pose de travail est remise dans son état courant (la lanière, elle, n'a pas été touchée)
      setFlowTime(p.pose, this.flowTime);
      solvePose(p.pose, this.blend);
    }
    return p.envelope;
  }

  /** Calcule la caméra d'une vue pour la pose `blend` (0 ou 1) et le format donné. */
  cameraFor(view, blend, aspect, rotate = 0) {
    const p = this.parts;
    const overview = view === 'hero' || view === 'full';
    const points = blend >= 0.5 && overview ? this.flowEnvelope() : undefined;
    const restore = this.blend;
    if (restore !== blend) {
      solvePose(p.pose, blend);
      poseStrap(p.strap, p.pose);
    }
    const def = describeView(view, {
      pose: p.pose,
      strap: p.strap,
      spec: p.spec,
      isCoil: blend < 0.5,
      aspect,
      rotate,
      points,
    });
    const cam = solveCamera(def, aspect);
    if (restore !== blend) {
      solvePose(p.pose, restore);
      poseStrap(p.strap, p.pose);
    }
    return { ...cam, pivot: def.pivot, range: def.range };
  }

  /**
   * Caméra ajustée à la pose en cours de déroulé (ou d'enroulé) : la définition de la vue glisse du
   * rouleau à la pose déroulée au rythme de `blend`, et les points cadrés sont ceux de l'instant.
   */
  liveCamera() {
    const p = this.parts;
    const ctx = { pose: p.pose, strap: p.strap, spec: p.spec, aspect: this.aspect, rotate: this.rotateRange(), coil: 1 - this.blend };
    const overview = this.viewName === 'hero' || this.viewName === 'full';
    if (overview) ctx.points = beltPoints(ctx);
    const a = describeView(this.viewName, { ...ctx, isCoil: true });
    const b = describeView(this.viewName, { ...ctx, isCoil: false });
    const def = blendViews(a, b, this.blend);
    const cam = solveCamera(def, this.aspect);
    return { ...cam, pivot: def.pivot, range: def.range };
  }

  refreshView() {
    if (!this.parts) return;
    const reducedMotion = this.calm;
    const rotate = this.rotateRange();
    const goal = this.cameraFor(this.viewName, this.blendTo, this.aspect, rotate);
    this.poseGoal = goal; // cadrage de la pose d'arrivée (rejoint en fin de déroulé)
    const snap = this.snapView || reducedMotion || !this.introDone;
    if (this.options.intro && !reducedMotion && !this.introDone) {
      // Entrée en scène : on part exactement du cadrage du poster (vue ajustée dans un carré centré,
      // comme une image en object-fit: contain), puis la caméra glisse vers le cadrage du conteneur.
      this.introDone = true;
      const poster = this.cameraFor(this.viewName, this.blendTo, 1, 0);
      const fov = this.aspect < 1 ? (2 * Math.atan(Math.tan((poster.fov * DEG) / 2) / this.aspect)) / DEG : poster.fov;
      this.cam.pos.copy(poster.position);
      this.cam.quat.copy(poster.quaternion);
      this.cam.fov = fov;
      this.cam.pivot.copy(goal.pivot);
      this.cam.range = goal.range;
      this.camFrom.pos.copy(this.cam.pos);
      this.camFrom.quat.copy(this.cam.quat);
      this.camFrom.fov = fov;
      this.camFrom.pivot.copy(goal.pivot);
      this.camTo.pos.copy(goal.position);
      this.camTo.quat.copy(goal.quaternion);
      this.camTo.fov = goal.fov;
      this.camTo.pivot.copy(goal.pivot);
      this.camTo.range = goal.range;
      this.viewT = -0.3; // laisse le fondu poster → canvas se faire avant de bouger
      this.viewDirty = false;
      this.snapView = false;
      this.recenter = false;
      this.needsRender = true;
      return;
    }
    this.camFrom.pos.copy(this.cam.pos);
    this.camFrom.quat.copy(this.cam.quat);
    this.camFrom.fov = this.cam.fov;
    this.camFrom.pivot.copy(this.cam.pivot);
    this.camTo.pos.copy(goal.position);
    this.camTo.quat.copy(goal.quaternion);
    this.camTo.fov = goal.fov;
    this.camTo.pivot.copy(goal.pivot);
    this.camTo.range = goal.range;
    this.cam.range = goal.range;
    this.viewT = snap ? 1 : 0;
    if (snap) {
      this.cam.pos.copy(goal.position);
      this.cam.quat.copy(goal.quaternion);
      this.cam.fov = goal.fov;
      this.cam.pivot.copy(goal.pivot);
      if (this.recenter) {
        this.theta = 0;
        this.omega = 0;
        this.pitch = 0;
        this.pitchVel = 0;
        this.recenter = false;
      }
    } else if (this.cam.range < Math.PI) {
      // vue à débattement limité : on repart de l'angle équivalent le plus proche de zéro
      this.theta -= Math.PI * 2 * Math.round(this.theta / (Math.PI * 2));
    }
    this.introDone = true;
    this.viewDirty = false;
    this.snapView = false;
    this.needsRender = true;
  }

  // --- Interaction -----------------------------------------------------------

  dragStart() {
    this.dragging = true;
    this.recenter = false;
    this.omega = 0;
    this.pitchVel = 0;
    this.invalidate();
  }

  /** dx, dy en fraction de la largeur du conteneur ; dt en secondes. */
  dragMove(dx, dy, dt) {
    if (!this.dragging) return;
    const dTheta = dx * 3.4;
    const dPitch = dy * 1.1;
    this.theta += dTheta;
    this.pitch += dPitch;
    const k = 1 / Math.max(dt, 1 / 240);
    this.omega = lerp(this.omega, dTheta * k, 0.5);
    this.pitchVel = lerp(this.pitchVel, dPitch * k, 0.5);
    this.invalidate();
  }

  dragEnd() {
    this.dragging = false;
    this.omega = clamp(this.omega, -6, 6);
    this.pitchVel = clamp(this.pitchVel, -2, 2);
    this.invalidate();
  }

  /** Clavier : petite impulsion de rotation (sens = ±1), amortie comme un lâcher de glisser. */
  nudge(direction) {
    this.recenter = false;
    this.omega = clamp(this.omega + direction * 1.5, -4, 4);
    this.invalidate();
  }

  /** Rendu trop lent : plus de mouvement continu ni de transition (comme « moins d'animations »). */
  setStill(still) {
    if (this.still === !!still) return;
    this.still = !!still;
    this.viewDirty = true;
    this.invalidate();
  }

  /** Position du pointeur dans le conteneur, de -1 à 1 (parallaxe). */
  setPointer(x, y) {
    this.par.tx = clamp(x, -1, 1);
    this.par.ty = clamp(y, -1, 1);
    this.invalidate();
  }

  // --- Boucle ----------------------------------------------------------------

  /** Avance l'animation de dt secondes. Renvoie true tant que quelque chose bouge. */
  update(dt) {
    if (!this.parts || this.disposed) return false;
    dt = Math.min(dt, 0.05);
    const { interactive, autoRotate, parallax } = this.options;
    const reducedMotion = this.calm; // moins d'animations demandé, ou rendu trop lent : ni transition ni mouvement continu
    let active = false;

    // Pose : déroulé / enroulé
    let blending = false;
    if (this.blendT < 1) {
      this.blendT = Math.min(1, this.blendT + dt / POSE_TIME);
      this.blend = lerp(this.blendFrom, this.blendTo, ease(this.blendT));
      if (this.blendT >= 1) {
        this.blend = this.blendTo;
        if (this.blend === 0) this.shadowDirty = true;
      }
      this.poseAll();
      blending = true;
      active = true;
    } else if (this.blend === 1 && !reducedMotion && (this.viewName === 'hero' || this.viewName === 'full')) {
      // Respiration lente de la lanière déroulée (le cadrage couvre toute son amplitude)
      this.flowTime += dt;
      setFlowTime(this.parts.pose, this.flowTime);
      this.poseAll();
      active = true;
    }

    if (this.viewDirty) this.refreshView();

    if (blending) {
      // La caméra est ajustée à la pose de l'instant, puis rejoint le cadrage de la pose d'arrivée.
      if (!this.poseGoal) this.poseGoal = this.cameraFor(this.viewName, this.blendTo, this.aspect, this.rotateRange());
      const live = this.liveCamera();
      const goal = this.poseGoal;
      const from = this.poseFrom;
      const w0 = from ? 1 - sstep(0, 0.25, this.blendT) : 0; // quitte en douceur le cadrage de départ
      const w = sstep(0.7, 1, this.blendT); // rejoint celui de la pose d'arrivée
      const to = this.camTo;
      to.pos.copy(live.position);
      to.quat.copy(live.quaternion);
      to.fov = live.fov;
      to.pivot.copy(live.pivot);
      to.range = live.range;
      if (w0 > 0) {
        to.pos.lerp(from.pos, w0);
        to.quat.slerp(from.quat, w0);
        to.fov = lerp(to.fov, from.fov, w0);
        to.pivot.lerp(from.pivot, w0);
      }
      if (w > 0) {
        to.pos.lerp(goal.position, w);
        to.quat.slerp(goal.quaternion, w);
        to.fov = lerp(to.fov, goal.fov, w);
        to.pivot.lerp(goal.pivot, w);
        to.range = lerp(to.range, goal.range, w);
      }
      this.cam.range = to.range;
      if (this.viewT >= 1) {
        this.cam.pos.copy(to.pos);
        this.cam.quat.copy(to.quat);
        this.cam.fov = to.fov;
        this.cam.pivot.copy(to.pivot);
      }
    }

    // Transition de cadrage
    if (this.viewT < 1) {
      this.viewT = Math.min(1, this.viewT + dt / VIEW_TIME);
      const e = ease(Math.max(0, this.viewT));
      const a = this.camFrom;
      const b = this.camTo;
      // la position tourne autour du centre de la scène plutôt que de couper à travers
      const c = _v0.set(0, 20, 0);
      const da = _v1.copy(a.pos).sub(c);
      const db = _v2.copy(b.pos).sub(c);
      const ra = da.length();
      const rb = db.length();
      _q.setFromUnitVectors(da.normalize(), db.normalize());
      _q2.identity().slerp(_q, e);
      const r = Math.exp(lerp(Math.log(ra), Math.log(rb), e));
      this.cam.pos.copy(da).applyQuaternion(_q2).multiplyScalar(r).add(c);
      this.cam.quat.copy(a.quat).slerp(b.quat, e);
      this.cam.fov = lerp(a.fov, b.fov, e);
      this.cam.pivot.lerpVectors(a.pivot, b.pivot, e);
      active = true;
    }
    if (this.recenter) {
      if (this.viewT < 1 || blending) {
        const k = 1 - Math.exp(-dt * 4);
        this.theta += (0 - this.theta) * k;
        this.pitch += (0 - this.pitch) * k;
        this.omega = 0;
      } else {
        this.recenter = false;
      }
    }

    // Rotation : inertie, rotation automatique, butées
    const limited = this.cam.range < Math.PI;
    const range = interactive ? this.cam.range : 0;
    const auto = reducedMotion || !autoRotate ? 0 : autoRotate === true ? 1 : Number(autoRotate) || 0;
    if (!this.dragging) {
      if (!limited && auto && !this.recenter) {
        this.omega += (auto * AUTO_SPEED - this.omega) * (1 - Math.exp(-dt * 1.6));
      } else {
        this.omega *= Math.exp(-dt * (reducedMotion ? 9 : 3.2));
      }
      this.pitchVel *= Math.exp(-dt * 5);
      if (Math.abs(this.omega) > 1e-4 || Math.abs(this.pitchVel) > 1e-4) {
        this.theta += this.omega * dt;
        this.pitch += this.pitchVel * dt;
        active = true;
      }
      if (limited && !this.recenter) {
        // butées élastiques
        const over = this.theta > range ? this.theta - range : this.theta < -range ? this.theta + range : 0;
        if (Math.abs(over) > 1e-4) {
          this.theta -= over * (1 - Math.exp(-dt * 9));
          this.omega *= Math.exp(-dt * 12);
          active = true;
        }
      }
    } else {
      if (limited) this.theta = clamp(this.theta, -range - 0.12, range + 0.12);
      active = true;
    }
    this.pitch = clamp(this.pitch, -0.2, 0.26);

    // Balancement doux en vue rapprochée quand autoRotate est demandé
    let osc = 0;
    if (limited && auto && !this.dragging) {
      this.oscT += dt * auto;
      osc = Math.sin(this.oscT * 0.45) * Math.min(0.22, this.cam.range * 0.6);
      active = true;
    }
    this.osc += (osc - this.osc) * (1 - Math.exp(-dt * 3));

    // Parallaxe
    const par = this.par;
    if (parallax && !reducedMotion) {
      const k = 1 - Math.exp(-dt * 3.2);
      par.x += (par.tx - par.x) * k;
      par.y += (par.ty - par.y) * k;
      if (Math.abs(par.tx - par.x) > 1e-3 || Math.abs(par.ty - par.y) > 1e-3) active = true;
    } else {
      par.x = 0;
      par.y = 0;
    }

    this.applyCamera(this.theta + this.osc + par.x * 0.075, this.pitch - par.y * 0.035);
    if (active || this.dragging) this.needsRender = true;
    return active;
  }

  applyCamera(theta, pitch) {
    const { cam, camera } = this;
    const p = cam.pivot;
    _m0.makeTranslation(p.x, p.y, p.z);
    _m1.makeRotationY(theta);
    _m2.makeTranslation(-p.x, -p.y, -p.z);
    this.turntable.matrix.copy(_m0).multiply(_m1).multiply(_m2);
    this.turntable.matrixWorldNeedsUpdate = true;

    camera.position.copy(cam.pos);
    camera.quaternion.copy(cam.quat);
    if (pitch !== 0) {
      // bascule verticale autour du pivot, selon l'axe horizontal de la caméra
      _v0.set(1, 0, 0).applyQuaternion(cam.quat);
      _q.setFromAxisAngle(_v0, -pitch);
      camera.position.sub(p).applyQuaternion(_q).add(p);
      camera.quaternion.premultiply(_q);
    }
    if (camera.fov !== cam.fov || camera.aspect !== this.aspect) {
      camera.fov = cam.fov;
      camera.aspect = this.aspect;
    }
    const d = camera.position.length();
    camera.near = Math.max(4, d * 0.02);
    camera.far = d + 2600;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  render() {
    if (this.disposed || !this.parts) return;
    if (this.shadowDirty && this.blend === 0) this.updateShadow();
    this.renderer.render(this.scene, this.camera);
    this.needsRender = false;
  }

  /** Studio : positions (mm, repère de la scène au repos) des détails de la ceinture dans la pose courante. */
  features() {
    const p = this.parts;
    if (!p) return null;
    const { spec, strap, pose } = p;
    const at = (s, v = 0, face = 1) => {
      const q = surfaceAt(strap, spec.sigma0 + s, v, face, 0, makeSample());
      return { position: q.pos.map((x) => Math.round(x * 10) / 10), normal: q.N.map((x) => Math.round(x * 1000) / 1000) };
    };
    const f = sampleFrame(pose, 0, makeSample());
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) this.poseAll();
    const info = this.renderer.info.render;
    // écart maximal de la ceinture au centre de l'image, à l'instant (1 = bord du cadre)
    let excursion = 0;
    for (const q of beltPoints({ pose, spec, coil: 1 - this.blend }, 20)) {
      _v0.copy(q).applyMatrix4(this.turntable.matrix).project(this.camera);
      excursion = Math.max(excursion, Math.abs(_v0.x), Math.abs(_v0.y));
    }
    return {
      stats: {
        triangles: info.triangles,
        calls: info.calls,
        frame: this.renderer.info.render.frame,
        poseMs: Math.round(((performance.now() - t0) / 5) * 100) / 100,
        excursion: Math.round(excursion * 1000) / 1000,
        blend: Math.round(this.blend * 1000) / 1000,
      },
      // éclairage : support (0 sombre, 1 papier), température (0 chaude, 1 neutre), intensité reçue par le cuir
      lighting: { floor: this.floor, mood: this.mood, leather: Math.round(this.materials.strap[0].envMapIntensity * 100) / 100 },
      pose: this.blend < 0.5 ? 'coil' : 'flow',
      width: spec.W,
      buckle: {
        position: [0, 1, 2].map((k) => Math.round((f.pos[k] - f.T[k] * spec.frameLength * 0.5 - f.N[k] * spec.foldRadius) * 10) / 10),
        normal: f.N.map((x) => Math.round(x * 1000) / 1000),
      },
      keeper: at(spec.keeperAt),
      monogram: at(spec.monoAt),
      holes: spec.holes.map((s) => at(s)),
      tip: at(spec.length - 6),
      tailEnd: at(spec.tailLength, 0, -1),
      mid: at(spec.length * 0.5),
    };
  }

  /**
   * Studio : plus grand écart de la ceinture au centre de l'image (|NDC| ; 1 = bord du cadre) sur
   * `seconds` secondes de respiration en pose déroulée, pour une vue et un format donnés.
   */
  flowExcursion({ view = 'hero', aspect = 16 / 9, seconds = 180, step = 0.5, rotate = 0 } = {}) {
    const p = this.parts;
    if (!p) return null;
    const cam = this.cameraFor(view, 1, aspect, rotate);
    const probe = new PerspectiveCamera(cam.fov, aspect, 1, 20000);
    probe.position.copy(cam.position);
    probe.quaternion.copy(cam.quaternion);
    probe.updateMatrixWorld();
    probe.updateProjectionMatrix();
    let worst = 0;
    let at = 0;
    for (let t = 0; t <= seconds; t += step) {
      setFlowTime(p.pose, t);
      solvePose(p.pose, 1);
      for (const q of beltPoints({ pose: p.pose, spec: p.spec, coil: 0 }, 10)) {
        _v0.copy(q).project(probe);
        const m = Math.max(Math.abs(_v0.x), Math.abs(_v0.y));
        if (m > worst) {
          worst = m;
          at = t;
        }
      }
    }
    setFlowTime(p.pose, this.flowTime);
    solvePose(p.pose, this.blend);
    return { view, aspect: Math.round(aspect * 1000) / 1000, worst: Math.round(worst * 1000) / 1000, at };
  }

  /** Studio : attend la configuration en cours, termine les transitions et rend aussitôt. */
  async settle() {
    await this.configPromise?.catch(() => undefined);
    await this.fontsPromise?.catch(() => undefined);
    if (this.disposed || !this.parts) return;
    if (this.blend !== this.blendTo || this.blendT < 1) {
      this.blendT = 1;
      this.blend = this.blendTo;
      this.poseAll();
      if (this.blend === 0) this.shadowDirty = true;
    }
    this.viewT = 1;
    this.viewDirty = true;
    this.snapView = true;
    this.recenter = true;
    this.update(0);
    this.render();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  /**
   * Contexte WebGL perdu : les ressources GPU n'existent plus. On retire la ceinture de la scène
   * sans rien libérer côté GPU ; une instance neuve sera construite à la restauration.
   */
  abandon() {
    if (this.disposed) return;
    this.disposed = true;
    if (typeof document !== 'undefined' && document.fonts?.removeEventListener) {
      document.fonts.removeEventListener('loadingdone', this._onFonts);
    }
    if (this.scene.environment === this.envTarget.texture) this.scene.environment = null;
    this.scene.remove(this.root);
    this.parts = null;
  }

  /**
   * Capture la ceinture courante sur fond transparent.
   * @param {Object} o
   * @param {number} [o.size=512] côté en pixels (ou width/height)
   * @param {string} [o.view='full'] cadrage ; 'current' = ce qui est à l'écran
   * @param {'coil'|'flow'} [o.pose] pose (défaut : pose courante)
   * @param {number} [o.supersample] suréchantillonnage (défaut : automatique, 1 à 2)
   * @param {string} [o.type='image/webp'] @param {number} [o.quality=0.92]
   */
  capture({ size = 512, width, height, view = 'full', pose, supersample, type = 'image/webp', quality = 0.92, camera: freeCamera } = {}) {
    if (this.disposed || !this.parts) return null;
    const { renderer, camera } = this;
    const gl = renderer.getContext();
    if (gl.isContextLost()) return null;
    const w = Math.round(width ?? size);
    const h = Math.round(height ?? size);
    const maxDim = Math.min(4096, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 4096);
    const ss = clamp(supersample ?? (Math.max(w, h) <= 1024 ? 2 : 1), 1, Math.max(1, Math.floor(maxDim / Math.max(w, h))));

    // Sauvegarde
    const savedSize = renderer.getSize(new Vector2());
    const savedRatio = renderer.getPixelRatio();
    const savedAspect = this.aspect;
    const savedBlend = this.blend;
    const savedTurn = this.turntable.matrix.clone();
    const savedCam = {
      pos: camera.position.clone(),
      quat: camera.quaternion.clone(),
      fov: camera.fov,
      aspect: camera.aspect,
      near: camera.near,
      far: camera.far,
    };

    const blend = pose ? (pose === 'flow' ? 1 : 0) : this.blendTo;
    const aspect = w / h;
    if (view !== 'current' || freeCamera) {
      if (blend !== this.blend) {
        this.blend = blend;
        this.poseAll();
        if (blend === 0) this.shadowDirty = true;
      }
      const goal = this.cameraFor(VIEWS.includes(view) ? view : 'full', blend, aspect, 0);
      this.turntable.matrix.identity();
      this.turntable.matrixWorldNeedsUpdate = true;
      camera.position.copy(goal.position);
      camera.quaternion.copy(goal.quaternion);
      camera.fov = goal.fov;
      if (freeCamera) {
        // Caméra libre (inspection au studio) : { position, target, fov }
        camera.position.fromArray(freeCamera.position);
        camera.up.set(0, 1, 0);
        camera.lookAt(new Vector3().fromArray(freeCamera.target ?? [0, 18, 0]));
        camera.fov = freeCamera.fov ?? 30;
      }
      const d = camera.position.length();
      camera.near = Math.max(2, d * 0.02);
      camera.far = d + 2600;
    }
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    renderer.setPixelRatio(1);
    renderer.setSize(w * ss, h * ss, false);
    if (this.shadowDirty && this.blend === 0) this.updateShadow();
    renderer.render(this.scene, camera);

    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(renderer.domElement, 0, 0, w, h);

    // Restauration
    renderer.setPixelRatio(savedRatio);
    renderer.setSize(savedSize.x, savedSize.y, false);
    if (this.blend !== savedBlend) {
      this.blend = savedBlend;
      this.poseAll();
      if (savedBlend === 0) this.shadowDirty = true;
    }
    this.turntable.matrix.copy(savedTurn);
    this.turntable.matrixWorldNeedsUpdate = true;
    camera.position.copy(savedCam.pos);
    camera.quaternion.copy(savedCam.quat);
    camera.fov = savedCam.fov;
    camera.aspect = savedCam.aspect;
    camera.near = savedCam.near;
    camera.far = savedCam.far;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    this.aspect = savedAspect;
    this.render();

    try {
      let url = out.toDataURL(type, quality);
      if (type !== 'image/png' && !url.startsWith(`data:${type}`) && Math.max(w, h) > 384) {
        // Encodeur absent (WebP sur certains navigateurs) : le navigateur a rendu un PNG, plusieurs
        // fois plus lourd. On le réduit pour qu'une vignette reste raisonnable (panier, stockage local).
        const k = 384 / Math.max(w, h);
        const small = document.createElement('canvas');
        small.width = Math.max(1, Math.round(w * k));
        small.height = Math.max(1, Math.round(h * k));
        const sctx = small.getContext('2d');
        sctx.imageSmoothingEnabled = true;
        sctx.imageSmoothingQuality = 'high';
        sctx.drawImage(out, 0, 0, small.width, small.height);
        url = small.toDataURL('image/png');
      }
      return url;
    } catch {
      return null;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (typeof document !== 'undefined' && document.fonts?.removeEventListener) {
      document.fonts.removeEventListener('loadingdone', this._onFonts);
    }
    this.disposeParts();
    this.materials.dispose();
    this.monoAlpha.dispose();
    this.monoNormal.dispose();
    this.shadow.dispose();
    if (this.scene.environment === this.envTarget.texture) this.scene.environment = null;
    this.envTarget.dispose();
    this.scene.remove(this.root);
  }
}

const _v0 = new Vector3();
const _v1 = new Vector3();
const _v2 = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _m0 = new Matrix4();
const _m1 = new Matrix4();
const _m2 = new Matrix4();
