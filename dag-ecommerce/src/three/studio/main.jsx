import { createRoot } from 'react-dom/client';
import '@fontsource-variable/cormorant-garamond/wght.css';
import '@fontsource-variable/cormorant-garamond/wght-italic.css';
import '@fontsource-variable/manrope/wght.css';
import '../../index.css';
import Lab from './Lab.jsx';
import Studio from './Studio.jsx';

// Page de studio (développement uniquement) : pilote la scène 3D par l'URL et par window.__studio.
// studio.html?lab ouvre le banc de robustesse (plusieurs canvas, StrictMode, hors écran…).
// Bancs d'essai : le rendu logiciel (Chromium sans carte graphique) est accepté comme un rendu normal.
// studio.html?software=0 laisse au contraire <BeltCanvas /> réagir comme en production (poster ou scène
// immobile) ; software=watch accepte le rendu logiciel mais garde le chien de garde de fluidité.
const query = new URLSearchParams(window.location.search);
const software = query.get('software');
if (software === 'watch') window.__DAG_BELT_SOFTWARE_OK__ = 'watch';
else if (software !== '0') window.__DAG_BELT_SOFTWARE_OK__ = true;
const lab = query.has('lab');
createRoot(document.getElementById('studio')).render(lab ? <Lab /> : <Studio />);
