/**
 * Correctif `installViewportTextureFix` : les textures de copie de `ViewportTextureNode` (une par
 * cible de rendu) ne partagent plus leur taille. Sans lui, deux cibles de tailles différentes se
 * renvoient la taille à chaque rendu (texture GPU détruite puis soumise).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { installViewportTextureFix } from '../src/core/webgpuCompat';

describe('correctif des textures de ViewportTextureNode', () => {
  it('une texture (et une taille) propre à chaque cible de rendu', () => {
    installViewportTextureFix();
    installViewportTextureFix(); // idempotent
    const node = new THREE.ViewportTextureNode();
    const main = new THREE.RenderTarget(640, 360);
    const thumb = new THREE.RenderTarget(384, 384);
    const a = node.getTextureForReference(main);
    const b = node.getTextureForReference(thumb);
    expect(a).not.toBe(b);
    expect(a.source).not.toBe(b.source);
    // Même cible : même texture, source inchangée.
    expect(node.getTextureForReference(main)).toBe(a);
    const imageA = a.image as { width: number; height: number };
    const imageB = b.image as { width: number; height: number };
    imageA.width = 640;
    imageB.width = 384;
    expect(imageA.width).toBe(640);
    // La texture par défaut (sans cible) reste celle du nœud.
    expect(node.getTextureForReference(null)).toBe(node.getTextureForReference());
    main.dispose();
    thumb.dispose();
  });
});
