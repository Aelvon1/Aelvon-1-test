/**
 * Étiquettes à traits de rappel (touche L) : couche DOM superposée au canvas (div + SVG,
 * `pointer-events: none`), style fiche cartonnée / ruban adhésif (`../labels.css`).
 *
 * - Ancres = ancrage déclaré, sinon point VISIBLE de la pièce (surface touchée par un rayon vers
 *   son centre, ou centre d'une face de ses bornes tournée vers la caméra) ; pièce instanciée :
 *   instance sélectionnée ou première instance.
 * - Candidates : pièces affichées, étiquetables (`PartDef.label !== false`), devant la caméra ;
 *   score = priorité déclarée (prépondérante) + taille projetée ; la sélection est épinglée.
 * - Occultation : lancers de rayon BVH caméra → ancre (sauf en rayons X, où tout est visible),
 *   64 au plus par mise à jour, pour les meilleures candidates seulement.
 * - ~12 étiquettes (18 en vue éclatée), rangées sur les côtés sans croisement (`labelLayout`).
 * - Vue rangée : nom de chaque pièce sous son emplacement (données `getKnollingLabels`).
 * - Recalcul à 30 Hz au plus, et seulement si la caméra, les poses ou l'état ont changé.
 */
import * as THREE from 'three/webgpu';
import '../labels.css';
import type { Assembly, PartRuntime } from '../Assembly';
import type { PoseComposer } from '../poses';
import type { KnollingLabel } from '../knollingPlan';
import type { Picker, PickHit } from '../selection/Picker';
import {
  layoutLabels,
  layoutTags,
  type LabelArea,
  type LabelCandidate,
  type PlacedLabel,
  type PlacedTag,
  type TagCandidate,
} from './labelLayout';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Cadence maximale de mise à jour (s). */
const UPDATE_INTERVAL = 1 / 30;
/** Hauteurs de base (px, avant échelle du texte). */
const LABEL_HEIGHT = 26;
const TAG_HEIGHT = 19;
/** Encarts par défaut des panneaux latéraux et des bandeaux (px) ; surchargeables en CSS. */
const DEFAULT_INSETS = { left: 330, right: 350, top: 64, bottom: 118 };

export interface LabelsViewState {
  enabled: boolean;
  selectedId: string | null;
  /** Instance sélectionnée (pièce instanciée) : l'étiquette s'y ancre. */
  selectedInstance: number | null;
  xray: boolean;
  knolling: boolean;
  /** Taux d'éclatement courant (0..1). */
  explode: number;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  textScale: number;
}

interface LabelNode {
  el: HTMLDivElement;
  text: HTMLSpanElement;
  under: SVGPathElement;
  line: SVGPathElement;
  dot: SVGCircleElement;
  content: string;
  width: number;
  shown: boolean;
}

interface TagNode {
  el: HTMLDivElement;
  content: string;
  width: number;
  shown: boolean;
}

interface PartInfo {
  part: PartRuntime;
  text: string;
  count: number;
  priority: number;
  /** Rayon de la sphère englobante au repos (m, échelle monde). */
  radius: number;
}

const _v = new THREE.Vector3();
const _view = new THREE.Vector3();
const _ray = new THREE.Ray();
const _anchor = new THREE.Vector3();
const _target = new THREE.Vector3();
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();
const _box = new THREE.Box3();
const AXES = ['y', 'z', 'x'] as const;

export class InspectionLabels {
  private readonly root: HTMLDivElement;
  private readonly svg: SVGSVGElement;
  private readonly nodes = new Map<string, LabelNode>();
  private readonly tags = new Map<string, TagNode>();
  private assembly: Assembly | null = null;
  private composer: PoseComposer | null = null;
  private infos: PartInfo[] = [];
  private state: LabelsViewState = {
    enabled: false,
    selectedId: null,
    selectedInstance: null,
    xray: false,
    knolling: false,
    explode: 0,
    leftPanelOpen: true,
    rightPanelOpen: true,
    textScale: 1,
  };
  private dirty = true;
  private timer = 0;
  private lastVersion = -1;
  private readonly lastCamera = new THREE.Matrix4();
  private readonly lastProjection = new THREE.Matrix4();
  private lastWidth = 0;
  private lastHeight = 0;
  private visible = false;
  private readonly insets = { ...DEFAULT_INSETS };
  private insetsStale = true;
  /** Rayons d'occultation restants pour la mise à jour en cours. */
  private rayBudget = 0;
  private readonly hit: PickHit = {
    partId: '',
    instance: null,
    mesh: new THREE.Mesh(),
    distance: 0,
    point: new THREE.Vector3(),
    ghost: false,
  };

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
    private readonly picker: Picker,
    private readonly knollingLabels: () => readonly KnollingLabel[],
  ) {
    this.root = document.createElement('div');
    this.root.className = 'insp-labels';
    this.root.setAttribute('aria-hidden', 'true');
    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.root.appendChild(this.svg);
    // Sous l'interface (même empilement fixe, inséré avant #ui-root).
    canvas.insertAdjacentElement('afterend', this.root);
  }

  attach(assembly: Assembly, composer: PoseComposer): void {
    this.detach();
    this.assembly = assembly;
    this.composer = composer;
    this.infos = assembly.order
      .filter(
        (p) =>
          p.def.label !== false && (p.hasGeometry || (p.def.label && p.def.label.priority !== undefined)),
      )
      .map((part) => {
        const label = part.def.label || undefined;
        const box = part.subtreeBox.isEmpty() ? part.localBox : part.subtreeBox;
        const size = box.isEmpty() ? 0.004 : box.getSize(_v).multiply(part.restWorldScale).length() / 2;
        return {
          part,
          text: label?.text ?? part.def.name,
          count: part.quantity,
          priority: label?.priority ?? 0,
          radius: size,
        };
      });
    this.dirty = true;
  }

  detach(): void {
    this.assembly = null;
    this.composer = null;
    this.infos = [];
    for (const node of this.nodes.values()) this.removeNode(node);
    this.nodes.clear();
    for (const tag of this.tags.values()) tag.el.remove();
    this.tags.clear();
    this.setVisible(false);
  }

  setState(state: LabelsViewState): void {
    const prev = this.state;
    if (
      state.enabled === prev.enabled &&
      state.selectedId === prev.selectedId &&
      state.selectedInstance === prev.selectedInstance &&
      state.xray === prev.xray &&
      state.knolling === prev.knolling &&
      state.explode === prev.explode &&
      state.leftPanelOpen === prev.leftPanelOpen &&
      state.rightPanelOpen === prev.rightPanelOpen &&
      state.textScale === prev.textScale
    )
      return;
    if (state.textScale !== this.state.textScale) {
      this.root.style.setProperty('--insp-scale', String(state.textScale));
      for (const node of this.nodes.values()) node.content = '';
      for (const tag of this.tags.values()) tag.content = '';
    }
    this.state = { ...state };
    this.insetsStale = true;
    this.dirty = true;
  }

  /** La scène a changé (visibilité, retrait…) sans que les poses aient bougé. */
  invalidate(): void {
    this.dirty = true;
  }

  update(dt: number): void {
    const a = this.assembly;
    if (!a || !this.state.enabled) {
      this.setVisible(false);
      return;
    }
    this.timer += dt;
    const camera = this.camera;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (
      !camera.matrixWorld.equals(this.lastCamera) ||
      !camera.projectionMatrix.equals(this.lastProjection) ||
      (this.composer && this.composer.version !== this.lastVersion) ||
      width !== this.lastWidth ||
      height !== this.lastHeight
    ) {
      this.dirty = true;
      if (width !== this.lastWidth || height !== this.lastHeight) this.insetsStale = true;
    }
    if (!this.dirty || this.timer < UPDATE_INTERVAL) return;
    this.timer = 0;
    this.dirty = false;
    this.lastCamera.copy(camera.matrixWorld);
    this.lastProjection.copy(camera.projectionMatrix);
    this.lastVersion = this.composer?.version ?? -1;
    this.lastWidth = width;
    this.lastHeight = height;
    this.setVisible(true);
    const knolling = this.state.knolling ? this.knollingLabels() : [];
    if (knolling.length > 0) {
      this.renderLabels([]);
      this.renderTags(this.layoutKnolling(knolling, width, height));
    } else {
      this.renderTags([]);
      this.renderLabels(this.layoutSide(width, height));
    }
  }

  // --- Calcul -----------------------------------------------------------------------------

  /**
   * Encarts de l'interface (panneaux, frise) : variables CSS `--inspection-inset-*` si l'interface
   * les définit, sinon valeurs par défaut. Relues seulement quand l'état ou la taille changent.
   */
  private readInsets(): void {
    const css = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: number) => {
      const value = parseFloat(css.getPropertyValue(name));
      return Number.isFinite(value) ? value : fallback;
    };
    const scale = this.state.textScale;
    this.insets.left = read('--inspection-inset-left', DEFAULT_INSETS.left * scale);
    this.insets.right = read('--inspection-inset-right', DEFAULT_INSETS.right * scale);
    this.insets.top = read('--inspection-inset-top', DEFAULT_INSETS.top);
    this.insets.bottom = read('--inspection-inset-bottom', DEFAULT_INSETS.bottom * scale);
    this.insetsStale = false;
  }

  private area(width: number, height: number): LabelArea {
    if (this.insetsStale) this.readInsets();
    let left = this.state.leftPanelOpen ? this.insets.left : 0;
    let right = this.state.rightPanelOpen ? this.insets.right : 0;
    // Zone centrale d'au moins 45 % de la largeur.
    const maxInsets = width * 0.55;
    if (left + right > maxInsets) {
      const k = maxInsets / (left + right);
      left *= k;
      right *= k;
    }
    return { left, right: width - right, top: this.insets.top, bottom: height - this.insets.bottom };
  }

  /** Projette `world` en pixels (dans `out`) ; faux si derrière la caméra. */
  private project(
    world: THREE.Vector3,
    width: number,
    height: number,
    out: { x: number; y: number },
  ): boolean {
    _view.copy(world).applyMatrix4(this.camera.matrixWorldInverse);
    if (_view.z > -1e-6) return false;
    _v.copy(world).project(this.camera);
    out.x = (_v.x * 0.5 + 0.5) * width;
    out.y = (-_v.y * 0.5 + 0.5) * height;
    return true;
  }

  private layoutSide(width: number, height: number): PlacedLabel[] {
    const a = this.assembly!;
    const area = this.area(width, height);
    const visible = this.visibleParts(a);
    const camera = this.camera;
    const pxPerRad = height / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const scored: { info: PartInfo; score: number; pinned: boolean }[] = [];
    const p = { x: 0, y: 0 };
    for (const info of this.infos) {
      const id = info.part.id;
      if (!visible.has(id)) continue;
      this.anchorOf(info, _anchor);
      const dist = _anchor.distanceTo(camera.position);
      if (!this.project(_anchor, width, height, p)) continue;
      // Ancre visible à l'écran, hors des panneaux latéraux.
      if (p.x < area.left || p.x > area.right || p.y < 0 || p.y > height) continue;
      const pinned = id === this.state.selectedId;
      const sizePx = (info.radius / Math.max(dist, 1e-6)) * pxPerRad;
      if (!pinned && sizePx < 3) continue;
      scored.push({ info, score: info.priority * 1000 + sizePx, pinned });
    }
    scored.sort((u, w) => Number(w.pinned) - Number(u.pinned) || w.score - u.score);
    const maxCount = this.state.explode > 0.25 ? 18 : 12;
    const candidates: LabelCandidate[] = [];
    this.rayBudget = 64;
    for (const s of scored) {
      if (candidates.length >= Math.ceil(maxCount * 1.5) || this.rayBudget <= 0) break;
      this.anchorOf(s.info, _anchor);
      // Rayons X : tout est visible à travers les fantômes ; sinon, point de la pièce visible.
      if (!this.state.xray && !this.visibleAnchor(s.info, _anchor, _anchor) && !s.pinned) continue;
      if (!this.project(_anchor, width, height, p)) continue;
      candidates.push({
        id: s.info.part.id,
        anchorX: p.x,
        anchorY: p.y,
        width: this.measureLabel(s.info),
        score: s.score,
        pinned: s.pinned,
      });
    }
    return layoutLabels(candidates, area, {
      height: LABEL_HEIGHT * this.state.textScale,
      maxCount,
    });
  }

  /**
   * Ancre monde d'une pièce : ancrage déclaré ; pièce instanciée sans ancrage déclaré : centre de
   * l'instance sélectionnée (ou de la première), plutôt que le milieu vide du groupe.
   */
  private anchorOf(info: PartInfo, out: THREE.Vector3): THREE.Vector3 {
    const a = this.assembly!;
    const part = info.part;
    if (part.instanced && !part.anchorExplicit) {
      const selected = this.state.selectedId === part.id ? this.state.selectedInstance : null;
      return a.instanceCenterWorld(part.id, selected ?? 0, out);
    }
    return a.anchorWorld(part.id, out);
  }

  /**
   * Point visible de la pièce : l'ancre si rien ne la cache (ou si le premier impact est sur la
   * pièce elle-même : le point de surface est alors retenu), sinon, pour un ancrage par défaut,
   * le centre des faces de ses bornes tournées vers la caméra. Faux si tout est caché.
   */
  private visibleAnchor(info: PartInfo, anchor: THREE.Vector3, out: THREE.Vector3): boolean {
    if (this.rayToPart(info.part, anchor, out, info.part.anchorExplicit)) return true;
    if (info.part.anchorExplicit || info.part.instanced) return false;
    const a = this.assembly!;
    a.worldBounds(info.part.id, _box);
    if (_box.isEmpty()) return false;
    _box.getCenter(_center);
    _box.getSize(_size).multiplyScalar(0.45);
    for (const axis of AXES) {
      if (this.rayBudget <= 0) return false;
      const side = this.camera.position[axis] > _center[axis] ? 1 : -1;
      _target.copy(_center);
      _target[axis] += side * _size[axis];
      if (this.rayToPart(info.part, _target, out, false)) return true;
    }
    return false;
  }

  /** Rayon caméra → `target` : la première surface touchée appartient-elle à la pièce ? */
  private rayToPart(part: PartRuntime, target: THREE.Vector3, out: THREE.Vector3, keepTarget: boolean): boolean {
    const a = this.assembly!;
    this.rayBudget--;
    _ray.origin.copy(this.camera.position);
    const distance = _ray.direction.subVectors(target, _ray.origin).length();
    _ray.direction.divideScalar(Math.max(distance, 1e-9));
    if (!this.picker.pick(_ray, this.hit) || this.hit.distance >= distance * 0.995 - 1e-4) {
      out.copy(target);
      return true;
    }
    for (let id: string | null = this.hit.partId; id; id = a.parts.get(id)?.parentId ?? null) {
      if (id === part.id) {
        out.copy(keepTarget ? target : this.hit.point);
        return true;
      }
    }
    return false;
  }

  /** Pièces affichées (au moins un maillage visible dans leur sous-arbre). */
  private visibleParts(a: Assembly): Set<string> {
    const out = new Set<string>();
    for (let i = a.order.length - 1; i >= 0; i--) {
      const part = a.order[i]!;
      let shown = part.children.some((c) => out.has(c));
      if (!shown) {
        for (const mesh of part.ownMeshes) {
          if (mesh.visible && nodeChainVisible(part.node, a.root)) {
            shown = true;
            break;
          }
        }
      }
      if (shown) out.add(part.id);
    }
    return out;
  }

  private layoutKnolling(labels: readonly KnollingLabel[], width: number, height: number): PlacedTag[] {
    // Hors des panneaux latéraux et de la frise (ils recouvrent la couche des étiquettes).
    const area: LabelArea = this.area(width, height);
    const candidates: TagCandidate[] = [];
    const p = { x: 0, y: 0 };
    const byId = new Map(this.infos.map((i) => [i.part.id, i] as const));
    for (const label of labels) {
      if (!this.project(label.position, width, height, p)) continue;
      const info = byId.get(label.partId);
      candidates.push({
        id: label.partId,
        x: p.x,
        y: p.y + 3,
        width: this.measureTag(label.partId, label.text),
        score: (info?.priority ?? 0) * 1000 + (info?.radius ?? 0) * 1000,
      });
    }
    return layoutTags(candidates, area, TAG_HEIGHT * this.state.textScale);
  }

  // --- DOM --------------------------------------------------------------------------------

  private setVisible(on: boolean): void {
    if (on === this.visible) return;
    this.visible = on;
    this.root.classList.toggle('is-visible', on);
  }

  private nodeFor(info: PartInfo): LabelNode {
    let node = this.nodes.get(info.part.id);
    if (!node) {
      const el = document.createElement('div');
      el.className = 'insp-label';
      el.style.display = 'none';
      const text = document.createElement('span');
      el.appendChild(text);
      this.root.appendChild(el);
      const under = document.createElementNS(SVG_NS, 'path');
      under.setAttribute('class', 'insp-leader-under');
      const line = document.createElementNS(SVG_NS, 'path');
      line.setAttribute('class', 'insp-leader');
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('class', 'insp-anchor');
      dot.setAttribute('r', '2.6');
      this.svg.append(under, line, dot);
      node = { el, text, under, line, dot, content: '', width: 0, shown: false };
      this.nodes.set(info.part.id, node);
    }
    return node;
  }

  /** Largeur de l'étiquette (mesurée une fois par texte et par échelle). */
  private measureLabel(info: PartInfo): number {
    const node = this.nodeFor(info);
    const content = info.count > 1 ? `${info.text}\u00a0×${info.count}` : info.text;
    if (node.content !== content) {
      node.content = content;
      node.text.textContent = content;
      node.el.style.display = '';
      node.width = Math.ceil(node.el.offsetWidth) + 1;
      if (!node.shown) node.el.style.display = 'none';
    }
    return node.width;
  }

  private measureTag(id: string, text: string): number {
    let tag = this.tags.get(id);
    if (!tag) {
      const el = document.createElement('div');
      el.className = 'insp-tag';
      el.style.display = 'none';
      this.root.appendChild(el);
      tag = { el, content: '', width: 0, shown: false };
      this.tags.set(id, tag);
    }
    if (tag.content !== text) {
      tag.content = text;
      tag.el.textContent = text;
      tag.el.style.display = '';
      tag.width = Math.ceil(tag.el.offsetWidth) + 1;
      if (!tag.shown) tag.el.style.display = 'none';
    }
    return tag.width;
  }

  private renderLabels(placed: readonly PlacedLabel[]): void {
    const used = new Set<string>();
    for (const p of placed) {
      const node = this.nodes.get(p.id);
      if (!node) continue;
      used.add(p.id);
      const pinned = p.id === this.state.selectedId;
      node.el.className = `insp-label is-${p.side}${pinned ? ' is-pinned' : ''}`;
      node.el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
      const d = `M${p.startX.toFixed(1)} ${p.startY.toFixed(1)}H${p.railX.toFixed(1)}L${p.anchorX.toFixed(1)} ${p.anchorY.toFixed(1)}`;
      node.under.setAttribute('d', d);
      node.line.setAttribute('d', d);
      node.line.setAttribute('class', pinned ? 'insp-leader is-pinned' : 'insp-leader');
      node.dot.setAttribute('cx', p.anchorX.toFixed(1));
      node.dot.setAttribute('cy', p.anchorY.toFixed(1));
      if (!node.shown) {
        node.shown = true;
        node.el.style.display = '';
        node.under.style.display = '';
        node.line.style.display = '';
        node.dot.style.display = '';
      }
    }
    for (const [id, node] of this.nodes) {
      if (used.has(id) || !node.shown) continue;
      node.shown = false;
      node.el.style.display = 'none';
      node.under.style.display = 'none';
      node.line.style.display = 'none';
      node.dot.style.display = 'none';
    }
  }

  private renderTags(placed: readonly PlacedTag[]): void {
    const used = new Set<string>();
    for (const p of placed) {
      const tag = this.tags.get(p.id);
      if (!tag) continue;
      used.add(p.id);
      tag.el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
      if (!tag.shown) {
        tag.shown = true;
        tag.el.style.display = '';
      }
    }
    for (const [id, tag] of this.tags) {
      if (used.has(id) || !tag.shown) continue;
      tag.shown = false;
      tag.el.style.display = 'none';
    }
  }

  private removeNode(node: LabelNode): void {
    node.el.remove();
    node.under.remove();
    node.line.remove();
    node.dot.remove();
  }

  dispose(): void {
    this.detach();
    this.root.remove();
  }
}

function nodeChainVisible(node: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = node; o; o = o.parent) {
    if (!o.visible) return false;
    if (o === root) return true;
  }
  return true;
}
