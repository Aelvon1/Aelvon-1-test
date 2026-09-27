/** Touches de clavier stylisées (libellés selon la disposition réelle) et gestes souris. */
import { useAppState } from '../UiContext';
import { comboText, keyLabelFor, tokenText, type KeyToken } from '../logic/keys';

/**
 * Touche : `code` = position physique (libellé selon la disposition), `char` = caractère
 * affiché tel quel (raccourcis mnémotechniques lus via `event.key`).
 */
export function Key({ code, char }: { code?: string; char?: string }) {
  const labels = useAppState((s) => s.keyLabels);
  const text = char ?? (code ? keyLabelFor(labels, code) : '?');
  return <kbd className="key">{text}</kbd>;
}

/** Combinaison de jetons (touches, caractères, gestes souris). */
export function KeyCombo({ combo }: { combo: readonly KeyToken[] }) {
  const labels = useAppState((s) => s.keyLabels);
  const withPlus = combo.some((t) => 'code' in t && /^(Shift|Control|Alt)/.test(t.code));
  return (
    <span className="key-combo" aria-label={comboText(labels, combo)}>
      {combo.map((token, i) => (
        <span key={i} className="key-combo-part" aria-hidden="true">
          {withPlus && i > 0 && <span className="plus">+</span>}
          <kbd className={'mouse' in token ? 'key is-mouse' : 'key'}>{tokenText(labels, token)}</kbd>
        </span>
      ))}
    </span>
  );
}
