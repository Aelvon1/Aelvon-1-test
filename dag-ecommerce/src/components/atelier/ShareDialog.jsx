import { useRef } from 'react';
import { Button, Field, Input, Modal } from '../ui';

/**
 * Repli du partage quand le presse-papiers est inaccessible : le lien est présenté dans un champ,
 * déjà sélectionné, prêt à être copié à la main.
 * @param {{ url: string|null, onClose: () => void }} props  url : lien à montrer ; null = fermé
 */
export default function ShareDialog({ url, onClose }) {
  const field = useRef(null);

  return (
    <Modal
      open={url != null}
      onClose={onClose}
      size="sm"
      title="Partager cette ceinture"
      description="Ce lien ouvre l’Atelier sur votre composition."
      initialFocus={field}
      footer={
        <Button variant="solid" fullWidth onClick={onClose}>
          Fermer
        </Button>
      }
    >
      <Field label="Lien de votre composition" hint={'Le lien est sélectionné\xa0: copiez-le.'}>
        <Input
          ref={field}
          name="lien"
          readOnly
          value={url ?? ''}
          onFocus={(event) => event.target.select()}
          onClick={(event) => event.target.select()}
          className="text-[0.875rem]"
        />
      </Field>
    </Modal>
  );
}
