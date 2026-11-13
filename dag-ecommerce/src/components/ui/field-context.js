import { createContext } from 'react';

/**
 * Lien entre <Field> et le contrôle qu'il contient :
 * { id, describedBy, invalid, required } — ou null hors d'un <Field>.
 */
export const FieldContext = createContext(null);
