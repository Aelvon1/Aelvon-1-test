/** Préfixe un chemin de /public avec la base du build (gère le mode statique `./`). */
export const asset = (path) => `${import.meta.env.BASE_URL}${String(path).replace(/^\/+/, '')}`;
