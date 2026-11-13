// Apparence commune des champs de saisie (Input, Textarea, Select).
// 16 px minimum : évite le zoom automatique d'iOS à la prise de focus.
export const CONTROL =
  'control block w-full min-h-13 border bg-transparent px-4 font-sans text-base text-fg placeholder:text-muted ' +
  'transition-[border-color,box-shadow] duration-300 outline-none ' +
  'disabled:cursor-not-allowed disabled:opacity-45';

export const CONTROL_VALID =
  'border-fg/25 hover:border-fg/55 focus:border-accent focus:shadow-[inset_0_0_0_1px_var(--accent)]';

export const CONTROL_INVALID = 'border-danger focus:shadow-[inset_0_0_0_1px_var(--danger)]';

export const controlClass = (invalid) => `${CONTROL} ${invalid ? CONTROL_INVALID : CONTROL_VALID}`;
