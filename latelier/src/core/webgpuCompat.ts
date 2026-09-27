/**
 * Correctifs de compatibilité WebGPU.
 *
 * three r186 renseigne toujours `swizzle: 'rgba'` dans les descripteurs de vues de texture.
 * Certains navigateurs Chromium (versions antérieures à la finalisation de la fonctionnalité
 * `texture-component-swizzle`) rejettent ce champ avec une TypeError. On retire alors ce champ,
 * ce qui est sans effet visuel puisque 'rgba' est l'identité.
 */
export function installWebGPUCompat(): void {
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
