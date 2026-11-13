import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { searchParamsToBelt } from '../../lib/atelier-url';
import { browserStorage, cleanConfig, readDraft, resolveInitialState, saveDraft, withBeltParams } from './atelier-state';

// L'URL suit la composition avec un léger retard : une rafale de choix ne produit qu'une écriture
// (certains navigateurs plafonnent le nombre de remplacements d'historique).
const URL_DELAY_MS = 250;

// Marque posée sur nos propres écritures d'URL, pour les distinguer d'une navigation du visiteur.
const OWN_WRITE = 'atelierWrite';

/**
 * État de l'Atelier : composition, taille, surface de la scène.
 * - À l'ouverture : l'URL l'emporte, sinon le dernier brouillon, sinon la ceinture par défaut.
 * - Après la première modification : l'URL est remplacée (aucune entrée d'historique) et le
 *   brouillon enregistré. Tant que le visiteur n'a rien touché, ni l'un ni l'autre ne change :
 *   ouvrir un lien partagé n'écrase pas son propre brouillon.
 * - Un lien vers une autre composition suivi sans quitter la page (panier, retour arrière)
 *   s'applique comme à l'ouverture.
 */
export function useAtelier() {
  const location = useLocation();
  const navigate = useNavigate();

  const [initial] = useState(() => resolveInitialState(location.search, readDraft(browserStorage())));
  const [config, setConfig] = useState(initial.config);
  const [size, setSize] = useState(initial.size);
  const [surface, setSurface] = useState(initial.surface);
  const [dirty, setDirty] = useState(false);

  // Entrée d'historique rejointe par un retour arrière ou avant (clé du routeur).
  const [poppedKey, setPoppedKey] = useState(null);
  useEffect(() => {
    const onPop = () => setPoppedKey(window.history.state?.key ?? null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // L'URL a changé sans que la page soit remontée. Nos propres écritures sont ignorées : elles
  // arrivent avec un temps de retard et ramèneraient une composition déjà dépassée. Le type de
  // navigation du routeur ne peut pas servir ici (la coque fige la « location » des pages).
  const [seenSearch, setSeenSearch] = useState(location.search);
  if (location.search !== seenSearch) {
    setSeenSearch(location.search);
    const ownWrite = location.state?.[OWN_WRITE] === true && location.key !== poppedKey;
    if (!ownWrite) {
      const incoming = searchParamsToBelt(location.search);
      if (incoming.hasConfig) setConfig(cleanConfig(incoming.config));
      if (incoming.size) setSize(incoming.size);
    }
  }

  const search = useRef(location.search);
  useEffect(() => {
    search.current = location.search;
  });

  useEffect(() => {
    if (!dirty) return undefined;
    const timer = setTimeout(() => {
      const next = withBeltParams(search.current, config).toString();
      if (next === new URLSearchParams(search.current).toString()) return;
      navigate(`?${next}`, { replace: true, preventScrollReset: true, state: { [OWN_WRITE]: true } });
    }, URL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [dirty, config, navigate]);

  useEffect(() => {
    if (dirty) saveDraft(browserStorage(), { config, size });
  }, [dirty, config, size]);

  /** Modifie un ou plusieurs réglages de la composition. */
  const edit = useCallback((patch) => {
    setConfig((current) => cleanConfig({ ...current, ...patch }));
    setDirty(true);
  }, []);

  const chooseSize = useCallback((value) => {
    setSize(String(value));
    setDirty(true);
  }, []);

  const chooseSurface = useCallback((value) => {
    setSurface(value);
    saveDraft(browserStorage(), { surface: value });
  }, []);

  return { config, size, surface, hintSeen: initial.hintSeen, edit, chooseSize, chooseSurface };
}
