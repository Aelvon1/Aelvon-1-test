// Mode de routage, fixé à la construction du site.
//   VITE_ROUTER=memory           → MemoryRouter : site embarqué dans un cadre isolé, dont l'URL
//                                  ne peut pas changer. La navigation vit en mémoire, depuis « / ».
//   VITE_ROUTER=hash, VITE_STATIC=1 → HashRouter : hébergement statique sans réécriture d'URL.
//   sinon                        → BrowserRouter.
// La coque lit ROUTER_MODE pour ne jamais toucher à l'URL réelle quand elle n'est pas la sienne.

const requested = import.meta.env.VITE_ROUTER;

/** @type {'browser'|'hash'|'memory'} */
export const ROUTER_MODE =
  requested === 'memory'
    ? 'memory'
    : requested === 'hash' || import.meta.env.VITE_STATIC === '1'
      ? 'hash'
      : 'browser';
