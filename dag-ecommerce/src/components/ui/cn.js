/** Assemble des classes CSS en ignorant les valeurs vides : cn('a', cond && 'b'). */
export function cn(...parts) {
  return parts.flat().filter(Boolean).join(' ');
}
