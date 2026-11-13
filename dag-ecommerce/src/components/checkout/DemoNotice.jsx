import { Icon, cn } from '../ui';

/**
 * Avis de l'étape de paiement : le site est une démonstration. Aucun paiement n'est prélevé,
 * aucune donnée bancaire n'est demandée ; Stripe prendra le relais une fois branché.
 * À remplacer par le module de paiement Stripe le jour de sa mise en service.
 */
export default function DemoNotice({ className }) {
  return (
    <div className={cn('border border-line bg-surface p-6 sm:p-8', className)}>
      <p className="eyebrow flex items-center gap-3 text-accent">
        <Icon name="info" size={17} />
        Démonstration
      </p>
      <p className="text-subtitle mt-5 max-w-[24ch]">Aucun paiement ne vous est demandé.</p>
      <p className="mt-4 max-w-[52ch] text-[0.9375rem] leading-relaxed text-muted">
        Ce site est présenté en démonstration. En confirmant, vous enregistrez une commande d’essai&nbsp;: aucune somme n’est prélevée
        et aucune donnée bancaire ne vous est demandée.
      </p>
      <p className="mt-6 flex items-start gap-3 border-t border-line pt-5 text-[0.8125rem] leading-snug text-muted">
        <Icon name="lock" size={17} className="text-accent" />
        Le paiement sera pris en charge par Stripe dès sa mise en service.
      </p>
    </div>
  );
}
