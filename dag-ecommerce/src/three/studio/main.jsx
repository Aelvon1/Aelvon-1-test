import { createRoot } from 'react-dom/client';
import '@fontsource-variable/cormorant-garamond/wght.css';
import '@fontsource-variable/cormorant-garamond/wght-italic.css';
import '@fontsource-variable/manrope/wght.css';
import '../../index.css';
import Lab from './Lab.jsx';
import Studio from './Studio.jsx';

// Page de studio (développement uniquement) : pilote la scène 3D par l'URL et par window.__studio.
// studio.html?lab ouvre le banc de robustesse (plusieurs canvas, StrictMode, hors écran…).
const lab = new URLSearchParams(window.location.search).has('lab');
createRoot(document.getElementById('studio')).render(lab ? <Lab /> : <Studio />);
