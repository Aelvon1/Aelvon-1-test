let support;

/** WebGL 2 disponible ? Même critère que la scène 3D ; testé une seule fois, contexte aussitôt libéré. */
export function hasWebGL() {
  if (support !== undefined) return support;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    support = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    support = false;
  }
  return support;
}
