/**
 * Disposition clavier déduite des libellés (`store.keyLabels`) : AZERTY si la touche en position
 * W porte « Z » et celle en position A porte « Q », QWERTY si elles portent « W » et « A », etc.
 */
export function detectLayout(labels: Readonly<Record<string, string>>): string {
  const w = (labels.KeyW ?? '').toUpperCase();
  const a = (labels.KeyA ?? '').toUpperCase();
  const y = (labels.KeyY ?? '').toUpperCase();
  if (w === 'Z' && a === 'Q') return 'AZERTY';
  if (w === 'W' && a === 'A') return y === 'Z' ? 'QWERTZ' : 'QWERTY';
  if (w === 'É') return 'BÉPO';
  if (w === ',') return 'Dvorak';
  return 'personnalisé';
}
