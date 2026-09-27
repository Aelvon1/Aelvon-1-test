/** Touche de clavier stylisée (libellé selon la disposition réelle). */
import { useKeyLabel } from '../UiContext';

export function Key({ code, label }: { code?: string; label?: string }) {
  const keyLabel = useKeyLabel();
  return <kbd className="key">{label ?? (code ? keyLabel(code) : '?')}</kbd>;
}
