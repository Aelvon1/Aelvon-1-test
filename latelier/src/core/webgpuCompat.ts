/**
 * Correctifs de compatibilité WebGPU (et de three r186).
 *
 * - three r186 renseigne toujours `swizzle: 'rgba'` dans les descripteurs de vues de texture.
 *   Certains navigateurs Chromium (versions antérieures à la finalisation de la fonctionnalité
 *   `texture-component-swizzle`) rejettent ce champ avec une TypeError. On retire alors ce champ,
 *   ce qui est sans effet visuel puisque 'rgba' est l'identité.
 * - Textures de copie de `ViewportTextureNode` partagées entre cibles : voir
 *   `installViewportTextureFix`.
 */
import { TextureSource, ViewportTextureNode, type Texture } from 'three/webgpu';

export function installWebGPUCompat(): void {
  installViewportTextureFix();
  const gpuTexture = (globalThis as { GPUTexture?: { prototype: { createView: (d?: unknown) => unknown } } })
    .GPUTexture;
  if (!gpuTexture) return;
  const proto = gpuTexture.prototype;
  const marker = '__latelierCompat';
  if ((proto as Record<string, unknown>)[marker]) return;
  const original = proto.createView;
  let stripSwizzle = false;
  const withoutSwizzle = (descriptor: Record<string, unknown>) => {
    const copy = { ...descriptor };
    delete copy.swizzle;
    return copy;
  };
  proto.createView = function (this: unknown, descriptor?: unknown) {
    const desc = descriptor as Record<string, unknown> | undefined;
    if (stripSwizzle && desc && 'swizzle' in desc) return original.call(this, withoutSwizzle(desc));
    try {
      return original.call(this, descriptor);
    } catch (error) {
      if (desc && 'swizzle' in desc && String(error).includes('swizzle')) {
        stripSwizzle = true;
        return original.call(this, withoutSwizzle(desc));
      }
      throw error;
    }
  };
  (proto as Record<string, unknown>)[marker] = true;
}

const VIEWPORT_FIX_MARKER = '__latelierViewportFix';

/**
 * three r186 : `ViewportTextureNode` (copie de l'image rendue pour la transmission, la
 * réfraction…) crée une texture par cible de rendu en CLONANT sa texture par défaut ; or
 * `Texture.clone()` partage la source des données (`TextureSource`), donc l'objet `image` et sa
 * taille, entre tous les clones. Dès que le même nœud sert à deux cibles de tailles différentes
 * (rendu principal et miniatures de l'inventaire avec un matériau à transmission des deux côtés),
 * chaque rendu impose sa taille à l'autre : la texture GPU de l'autre cible est détruite et
 * recréée à chaque image, le rendu suivant soumet une texture détruite (« Destroyed texture used
 * in a submit ») et three marque en échec les pipelines compilés à ce moment-là (maillages alors
 * jamais dessinés). Correctif : chaque texture par cible reçoit sa propre source à sa création.
 */
export function installViewportTextureFix(): void {
  const proto = ViewportTextureNode.prototype as ViewportTextureNode & Record<string, unknown>;
  if (proto[VIEWPORT_FIX_MARKER]) return;
  const original = proto.getTextureForReference;
  const own = new WeakSet<Texture>();
  proto.getTextureForReference = function (
    this: ViewportTextureNode,
    reference?: Parameters<ViewportTextureNode['getTextureForReference']>[0],
  ): Texture {
    const texture = original.call(this, reference);
    // Sans référence : texture par défaut du nœud (non clonée), laissée telle quelle.
    if (reference && !own.has(texture)) {
      own.add(texture);
      const image = texture.image as { width?: number; height?: number } | null;
      texture.source = new TextureSource({ width: image?.width ?? 1, height: image?.height ?? 1 });
    }
    return texture;
  };
  proto[VIEWPORT_FIX_MARKER] = true;
}
