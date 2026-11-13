import { createContext } from 'react';

/** true quand un <Reveal> est placé dans un <RevealGroup> (il hérite alors du décalage du groupe). */
export const RevealGroupContext = createContext(false);
