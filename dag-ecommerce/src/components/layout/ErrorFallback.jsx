import Button from '../ui/Button';
import Eyebrow from '../ui/Eyebrow';
import { ROUTER_MODE } from './router-mode';

// Site embarqué (navigation en mémoire) : recharger ramène de toute façon à l'accueil, et un lien
// vers la base du site ferait naviguer le cadre lui-même. Un seul bouton, qui recharge.
const EMBEDDED = ROUTER_MODE === 'memory';

/**
 * Écran affiché quand une page échoue à se rendre.
 * @param {{ onRetry?: () => void }} props
 */
export default function ErrorFallback({ onRetry }) {
  return (
    <section className="theme-noir grid min-h-svh place-items-center" role="alert">
      <div className="container-luxe flex max-w-3xl flex-col items-start py-32">
        <Eyebrow rule tone="accent">
          Un instant
        </Eyebrow>
        <h1 className="text-display mt-8">
          Un fil s’est <em className="italic">défait</em>.
        </h1>
        <p className="text-lead mt-6 max-w-[44ch] text-muted">
          Cette page n’a pas pu s’afficher. {EMBEDDED ? 'Revenez' : 'Rechargez-la, ou revenez'} à l’accueil&nbsp;: votre panier, lui, n’a pas bougé.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          {EMBEDDED ? (
            <Button onClick={onRetry} icon="return" iconPosition="left">
              Retour à l’accueil
            </Button>
          ) : (
            <>
              <Button onClick={onRetry} icon="return" iconPosition="left">
                Recharger la page
              </Button>
              <Button href={import.meta.env.BASE_URL} variant="outline">
                Retour à l’accueil
              </Button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
