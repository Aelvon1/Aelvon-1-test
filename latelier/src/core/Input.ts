/**
 * Entrées clavier/souris.
 *
 * - Les DÉPLACEMENTS sont liés à la position physique des touches (`event.code`) : la touche
 *   située à l'emplacement du W QWERTY (`KeyW`) fait avancer, qu'elle porte « Z » (AZERTY) ou
 *   « W » (QWERTY). Aucun réglage n'est nécessaire.
 * - Les RACCOURCIS mnémotechniques (X éclater, L étiquettes…) sont lus via `event.key`.
 * - Les libellés affichés à l'écran viennent de `navigator.keyboard.getLayoutMap()` quand il
 *   existe (Chrome/Edge), sinon d'une estimation selon la langue, affinée à chaque frappe.
 */
import type { AppStore } from './store';

/** Informations transmises aux abonnés clavier. */
export interface KeyInfo {
  /** Position physique (ex. "KeyW", "Tab", "Backquote"). */
  code: string;
  /** Caractère produit, en minuscules pour les lettres (ex. "z" en AZERTY sur KeyW). */
  key: string;
  repeat: boolean;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
  /** Vrai si la frappe a lieu dans un champ de saisie (recherche d'inventaire…). */
  inTextField: boolean;
  /** Empêche l'action par défaut du navigateur. */
  preventDefault(): void;
}

type KeyHandler = (info: KeyInfo) => void;

/** Codes dont le comportement par défaut du navigateur est bloqué (hors champs de saisie). */
const BLOCKED_DEFAULTS = new Set([
  'Tab',
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Backquote',
  'F1',
]);

/** Codes affichés dans l'interface (libellés résolus selon la disposition). */
export const DISPLAYED_CODES = [
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyE',
  'KeyC',
  'KeyX',
  'KeyL',
  'KeyK',
  'KeyF',
  'KeyR',
  'KeyI',
  'KeyH',
  'KeyQ',
  'KeyZ',
  'Backquote',
] as const;

const SPECIAL_LABELS: Record<string, string> = {
  Tab: 'Tab',
  Space: 'Espace',
  Escape: 'Échap',
  ShiftLeft: 'Maj',
  ShiftRight: 'Maj',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Enter: 'Entrée',
};

/** Estimation AZERTY (utilisée avant toute frappe si l'API Keyboard est absente, ex. Firefox). */
const AZERTY_GUESS: Record<string, string> = {
  KeyW: 'Z',
  KeyA: 'Q',
  KeyQ: 'A',
  KeyZ: 'W',
  Backquote: '²',
  KeyM: ',',
  Semicolon: 'M',
};

interface NavigatorKeyboard {
  getLayoutMap?: () => Promise<Map<string, string>>;
}

function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return !['checkbox', 'radio', 'range', 'button', 'submit'].includes(type);
  }
  return false;
}

export class Input {
  private readonly down = new Set<string>();
  private readonly keyDownHandlers = new Set<KeyHandler>();
  private readonly keyUpHandlers = new Set<KeyHandler>();
  private readonly lockHandlers = new Set<(locked: boolean) => void>();
  private mouseDX = 0;
  private mouseDY = 0;
  private labels: Record<string, string> = {};
  private readonly disposers: (() => void)[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly store: AppStore,
  ) {
    this.initLabels();
    const onKeyDown = (e: KeyboardEvent) => this.handleKey(e, true);
    const onKeyUp = (e: KeyboardEvent) => this.handleKey(e, false);
    const onBlur = () => this.down.clear();
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement === this.canvas) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    };
    const onLockChange = () => {
      const locked = document.pointerLockElement === this.canvas;
      this.store.setState((s) => ({ hud: { ...s.hud, pointerLocked: locked } }));
      if (!locked) this.down.clear();
      for (const handler of [...this.lockHandlers]) handler(locked);
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('keyup', onKeyUp, { capture: true });
    window.addEventListener('blur', onBlur);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onLockChange);
    this.disposers.push(
      () => window.removeEventListener('keydown', onKeyDown, { capture: true }),
      () => window.removeEventListener('keyup', onKeyUp, { capture: true }),
      () => window.removeEventListener('blur', onBlur),
      () => document.removeEventListener('mousemove', onMouseMove),
      () => document.removeEventListener('pointerlockchange', onLockChange),
    );
  }

  /** Touche physique enfoncée ? */
  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /**
   * Axes de déplacement (positions physiques ZQSD/WASD + flèches) :
   * `forward` +1 = avancer, `right` +1 = pas chassé à droite.
   */
  moveAxes(): { forward: number; right: number } {
    const f =
      (this.isDown('KeyW') || this.isDown('ArrowUp') ? 1 : 0) -
      (this.isDown('KeyS') || this.isDown('ArrowDown') ? 1 : 0);
    const r =
      (this.isDown('KeyD') || this.isDown('ArrowRight') ? 1 : 0) -
      (this.isDown('KeyA') || this.isDown('ArrowLeft') ? 1 : 0);
    return { forward: f, right: r };
  }

  /** Récupère et remet à zéro le déplacement souris accumulé (pixels) depuis le dernier appel. */
  consumeMouseDelta(): { x: number; y: number } {
    const delta = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return delta;
  }

  onKeyDown(handler: KeyHandler): () => void {
    this.keyDownHandlers.add(handler);
    return () => this.keyDownHandlers.delete(handler);
  }

  onKeyUp(handler: KeyHandler): () => void {
    this.keyUpHandlers.add(handler);
    return () => this.keyUpHandlers.delete(handler);
  }

  onPointerLockChange(handler: (locked: boolean) => void): () => void {
    this.lockHandlers.add(handler);
    return () => this.lockHandlers.delete(handler);
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  /**
   * Capture la souris. Doit être appelé depuis un geste utilisateur (clic, touche hors Échap).
   * Retourne `false` si le navigateur refuse (ex. navigation automatisée, délai après Échap).
   */
  async requestPointerLock(): Promise<boolean> {
    if (this.pointerLocked) return true;
    try {
      // `unadjustedMovement` supprime l'accélération OS quand c'est supporté.
      const request = this.canvas.requestPointerLock as (options?: {
        unadjustedMovement?: boolean;
      }) => Promise<void> | void;
      try {
        await request.call(this.canvas, { unadjustedMovement: true });
      } catch {
        await request.call(this.canvas);
      }
      return this.pointerLocked;
    } catch {
      return false;
    }
  }

  exitPointerLock(): void {
    if (this.pointerLocked) document.exitPointerLock();
    this.down.clear();
  }

  /** Libellé affiché pour un code physique (ex. KeyW → « Z » en AZERTY). */
  keyLabel(code: string): string {
    return this.labels[code] ?? SPECIAL_LABELS[code] ?? code.replace(/^Key|^Digit/, '');
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.keyDownHandlers.clear();
    this.keyUpHandlers.clear();
    this.lockHandlers.clear();
  }

  private handleKey(e: KeyboardEvent, isDown: boolean): void {
    const inTextField = isTextField(e.target);
    if (!inTextField && BLOCKED_DEFAULTS.has(e.code) && !(e.ctrlKey || e.metaKey)) e.preventDefault();

    // Apprentissage de la disposition : le caractère produit par une touche lettre.
    if (isDown && e.key.length === 1 && e.code && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const label = e.key === ' ' ? 'Espace' : e.key.toUpperCase();
      if (this.labels[e.code] !== label && (e.code.startsWith('Key') || e.code === 'Backquote')) {
        this.labels = { ...this.labels, [e.code]: label };
        this.publishLabels();
      }
    }

    if (inTextField) {
      // Dans un champ : seules Échap et Tab sont relayées (fermeture, navigation).
      if (e.code !== 'Escape' && e.code !== 'Tab') return;
    } else if (isDown) {
      this.down.add(e.code);
    } else {
      this.down.delete(e.code);
    }

    const info: KeyInfo = {
      code: e.code,
      key: e.key.length === 1 ? e.key.toLowerCase() : e.key,
      repeat: e.repeat,
      shift: e.shiftKey,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      meta: e.metaKey,
      inTextField,
      preventDefault: () => e.preventDefault(),
    };
    for (const handler of [...(isDown ? this.keyDownHandlers : this.keyUpHandlers)]) {
      try {
        handler(info);
      } catch (error) {
        console.error('[Input] Erreur dans un gestionnaire clavier :', error);
      }
    }
  }

  private initLabels(): void {
    const lang = (navigator.language || '').toLowerCase();
    // Estimation initiale : AZERTY pour le français de France/Belgique.
    const azerty = lang.startsWith('fr') && !lang.startsWith('fr-ca') && !lang.startsWith('fr-ch');
    for (const code of DISPLAYED_CODES) {
      this.labels[code] =
        azerty && AZERTY_GUESS[code] ? AZERTY_GUESS[code] : code === 'Backquote' ? '`' : code.slice(3);
    }
    this.publishLabels();

    const keyboard = (navigator as Navigator & { keyboard?: NavigatorKeyboard }).keyboard;
    keyboard
      ?.getLayoutMap?.()
      .then((map) => {
        const next = { ...this.labels };
        for (const code of DISPLAYED_CODES) {
          const key = map.get(code);
          if (key) next[code] = key.toUpperCase();
        }
        this.labels = next;
        this.publishLabels();
      })
      .catch(() => {
        // API refusée (iframe, permissions) : on garde l'estimation.
      });
  }

  private publishLabels(): void {
    const keyLabels: Record<string, string> = { ...SPECIAL_LABELS, ...this.labels };
    this.store.setState({ keyLabels });
  }
}
