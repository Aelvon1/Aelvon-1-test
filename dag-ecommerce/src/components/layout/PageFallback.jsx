/** Attente minimale pendant le chargement d'une page : une surface noire et le mot-symbole. */
export default function PageFallback() {
  return (
    <div className="theme-noir grid min-h-svh place-items-center" role="status" aria-label="Chargement de la page">
      <span aria-hidden="true" className="font-display text-[1.625rem] font-medium tracking-[0.22em] text-fg/35">
        DAG
      </span>
    </div>
  );
}
