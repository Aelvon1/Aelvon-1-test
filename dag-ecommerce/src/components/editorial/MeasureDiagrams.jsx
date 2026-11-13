import { cn } from '../ui';

// Schémas originaux du guide des tailles : dessins au trait sur une tuile de papier.
// Le trait prend la couleur du texte, les cotes celle de l'accent ; les légendes sont du HTML
// posé par-dessus (leur taille ne dépend pas de l'échelle du dessin).

const TILE = 'tone-papier relative isolate overflow-hidden bg-papier';
const STROKE = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' };

// Ceinture du pantalon : deux courbes parallèles (hauteur 44). bandY(x) suit la courbe haute.
const bandY = (x) => {
  const t = (x - 58) / 284;
  return 214 + 44 * t * (1 - t);
};
// Le ruban dépasse un peu de chaque côté : il fait le tour.
const tapeY = (x) => {
  const t = (x - 46) / 308;
  return 235 + 48 * t * (1 - t);
};
const LOOPS = [108, 170, 230, 292];
const TAPE_TICKS = Array.from({ length: 29 }, (_, index) => 60 + index * 10);

/**
 * Fig. 1 — Où mesurer : un mètre ruban passé dans les passants, là où se porte le pantalon.
 * @param {{ className?: string }} props
 */
export function WaistDiagram({ className }) {
  return (
    <div className={cn(TILE, className)} style={{ aspectRatio: '4 / 5' }}>
      <span aria-hidden="true" className="studio-light pointer-events-none absolute inset-0" />
      <svg
        viewBox="0 0 400 500"
        role="img"
        aria-label="Schéma : un mètre ruban fait le tour de la taille en passant dans les passants du pantalon, à l’endroit où il se porte."
        className="absolute inset-0 size-full text-fg"
      >
        {/* le buste, à peine suggéré */}
        <g {...STROKE} opacity="0.3">
          <path d="M78 20C66 96 56 160 58 214" />
          <path d="M322 20C334 96 344 160 342 214" />
        </g>

        {/* le pantalon */}
        <g {...STROKE}>
          <path d="M58 214Q200 236 342 214" />
          <path d="M54 258Q200 280 346 258" />
          <path d="M58 214L54 258M342 214L346 258" />
          <path d="M54 258C44 330 40 420 42 500" />
          <path d="M346 258C356 330 360 420 358 500" />
          <path d="M200 280V438" />
          <path d="M200 438C197 460 195 482 194 500M200 438C203 460 205 482 206 500" />
          <path d="M96 263C102 312 82 346 46 360M304 263C298 312 318 346 354 360" />
        </g>
        <path d="M220 278V388Q219 414 200 422" {...STROKE} strokeWidth="1" opacity="0.55" strokeDasharray="3 4" />
        <circle cx="210" cy="250" r="6" {...STROKE} strokeWidth="1.2" />

        {/* le mètre ruban : devant en trait plein, derrière en pointillé */}
        <g className="text-accent">
          <path d="M46 235C8 214 90 190 200 190C310 190 392 214 354 235" {...STROKE} strokeWidth="1.2" strokeDasharray="2 5" />
          <path d="M46 235Q200 259 354 235" fill="none" stroke="currentColor" strokeWidth="14" opacity="0.2" />
          <path d="M46 228Q200 252 354 228M46 242Q200 266 354 242" {...STROKE} strokeWidth="1.1" />
          {TAPE_TICKS.map((x, index) => {
            const top = tapeY(x) - 7;
            return <line key={x} x1={x} x2={x} y1={top} y2={top + (index % 5 === 0 ? 14 : 5)} stroke="currentColor" strokeWidth="1" />;
          })}
          <path d="M200 150V186" {...STROKE} strokeWidth="1" />
          <circle cx="200" cy="190" r="2.8" fill="currentColor" />
        </g>

        {/* les passants, par-dessus le ruban */}
        <g {...STROKE} strokeWidth="1.3">
          {LOOPS.map((x) => (
            <rect key={x} x={x - 6} y={bandY(x) - 6} width="12" height="56" rx="2" fill="var(--bg)" />
          ))}
        </g>
      </svg>

      <p className="eyebrow absolute left-5 top-5 text-muted">Fig. 1</p>
      <p className="eyebrow absolute left-1/2 top-[24%] -translate-x-1/2 whitespace-nowrap text-accent">Tour de taille</p>
    </div>
  );
}

const HOLES = [330, 353, 376, 399, 422];
const MIDDLE = HOLES[2];

/**
 * Fig. 2 — Ce que dit la taille : la longueur de la base de la boucle au trou du milieu.
 * @param {{ size?: string|number, className?: string }} props  size : taille citée en exemple (défaut 100)
 */
export function BeltDiagram({ size = 100, className }) {
  return (
    <div className={cn(TILE, className)} style={{ aspectRatio: '4 / 5' }}>
      <span aria-hidden="true" className="studio-light pointer-events-none absolute inset-0" />
      <svg
        viewBox="0 0 400 500"
        role="img"
        aria-label={`Schéma : une ceinture à plat. La taille, ici ${size} centimètres, se mesure de la base de la boucle au trou du milieu.`}
        className="absolute inset-0 size-full text-fg"
      >
        {/* la lanière */}
        <path d="M118 98V436Q118 458 140 467Q162 458 162 436V98Z" {...STROKE} fill="currentColor" fillOpacity="0.07" />
        <g {...STROKE} strokeWidth="0.9" strokeDasharray="4 4" opacity="0.5">
          <path d="M123.5 146V436M156.5 146V436" />
          <path d="M123.5 112H156.5" />
        </g>
        <rect x="113" y="124" width="54" height="12" rx="2" {...STROKE} fill="var(--bg)" />

        {/* la boucle et son ardillon */}
        <rect x="102" y="44" width="76" height="60" rx="10" {...STROKE} strokeWidth="6" />
        <path d="M140 108V41" {...STROKE} strokeWidth="4.5" />

        {/* les crans */}
        {HOLES.map((y) =>
          y === MIDDLE ? null : <circle key={y} cx="140" cy={y} r="3.2" {...STROKE} strokeWidth="1.2" fill="var(--bg)" />,
        )}
        <g className="text-accent">
          <circle cx="140" cy={MIDDLE} r="9" {...STROKE} strokeWidth="1" />
          <circle cx="140" cy={MIDDLE} r="3.6" fill="currentColor" />

          {/* la cote */}
          <path d={`M186 104H232M158 ${MIDDLE}H232`} {...STROKE} strokeWidth="0.9" strokeDasharray="2 4" />
          <path d={`M222 104V${MIDDLE}`} {...STROKE} strokeWidth="1.3" />
          <path d={`M216 110L228 98M216 ${MIDDLE + 6}L228 ${MIDDLE - 6}`} {...STROKE} strokeWidth="1.3" />
        </g>
      </svg>

      <p className="eyebrow absolute left-5 top-5 text-muted">Fig. 2</p>
      <p className="absolute left-[61%] top-[20.8%] -translate-y-1/2 text-[0.75rem] leading-tight text-muted">Base de la boucle</p>
      <p className="absolute left-[61%] top-[48%] -translate-y-1/2">
        <span className="block font-display text-[clamp(1.75rem,2.6vw,2.5rem)] leading-none text-accent lining-nums">
          {size}&nbsp;<span className="text-[0.55em]">cm</span>
        </span>
        <span className="eyebrow mt-2 block text-muted">Taille DAG</span>
      </p>
      <p className="absolute left-[61%] top-[75.2%] -translate-y-1/2 text-[0.75rem] leading-tight text-muted">Trou du milieu</p>
    </div>
  );
}
