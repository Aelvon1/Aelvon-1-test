/**
 * Paramètres d'URL de développement (tests, captures automatisées). Exemples :
 * - `?backend=webgl`            force le repli WebGL2 ;
 * - `?skip=home`                entre directement en exploration (sans capture souris) ;
 * - `?inspect=bldc-inrunner`    ouvre directement l'inspection d'un objet ;
 * - `?quality=low|medium|high|ultra` ;
 * - `?cam=x,y,z,tx,ty,tz`       place la caméra (exploration : position + cible) ;
 * - `?debug=1`                  ouvre le panneau de debug ;
 * - `?explode=0.5`, `?steps=3`, `?select=rotor.shaft`, `?xray=1`, `?section=x,0.5`,
 *   `?knolling=1`, `?labels=1`, `?neutral=1`, `?view=dx,dy,dz,distance` (inspection) ;
 * - `?time=12.5`                fige le temps d'animation du décor (captures reproductibles) ;
 * - `?ui=0`                     masque l'interface (captures).
 */
export interface DevParams {
  backend: 'auto' | 'webgl';
  skipHome: boolean;
  inspect: string | null;
  quality: 'low' | 'medium' | 'high' | 'ultra' | null;
  cam: number[] | null;
  debug: boolean;
  explode: number | null;
  steps: number | null;
  select: string | null;
  xray: boolean;
  section: { axis: 'x' | 'y' | 'z'; position: number } | null;
  knolling: boolean;
  labels: boolean;
  neutral: boolean;
  view: number[] | null;
  frozenTime: number | null;
  hideUi: boolean;
  raw: URLSearchParams;
}

const numbers = (value: string | null): number[] | null => {
  if (!value) return null;
  const parts = value.split(',').map(Number);
  return parts.every(Number.isFinite) ? parts : null;
};

const num = (value: string | null): number | null => {
  if (value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export function parseDevParams(
  search: string = typeof location === 'undefined' ? '' : location.search,
): DevParams {
  const p = new URLSearchParams(search);
  const quality = p.get('quality');
  const section = p.get('section');
  let sectionValue: DevParams['section'] = null;
  if (section) {
    const [axis, pos] = section.split(',');
    if (axis === 'x' || axis === 'y' || axis === 'z')
      sectionValue = { axis, position: num(pos ?? '0.5') ?? 0.5 };
  }
  return {
    backend: p.get('backend') === 'webgl' ? 'webgl' : 'auto',
    skipHome: p.get('skip') === 'home',
    inspect: p.get('inspect'),
    quality:
      quality === 'low' || quality === 'medium' || quality === 'high' || quality === 'ultra' ? quality : null,
    cam: numbers(p.get('cam')),
    debug: p.get('debug') === '1',
    explode: num(p.get('explode')),
    steps: num(p.get('steps')),
    select: p.get('select'),
    xray: p.get('xray') === '1',
    section: sectionValue,
    knolling: p.get('knolling') === '1',
    labels: p.get('labels') === '1',
    neutral: p.get('neutral') === '1',
    view: numbers(p.get('view')),
    frozenTime: num(p.get('time')),
    hideUi: p.get('ui') === '0',
    raw: p,
  };
}
