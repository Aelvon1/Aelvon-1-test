/**
 * Astuces affichées pendant le chargement et la préparation d'un objet.
 */
export const LOADING_TIPS: readonly string[] = [
  'Dans l’inventaire, la recherche ignore les accents : « electronique » trouve « Électronique ».',
  'Espace ou → joue l’étape suivante du démontage ; ← remonte la dernière.',
  'En démontage libre, une pièce bloquée indique ce qu’il faut retirer avant elle.',
  'La molette rapproche la caméra jusqu’à lire le marquage d’une puce.',
  'X éclate l’objet, K range toutes les pièces à plat sur l’établi.',
  'Les rayons X et la coupe (C) montrent ce qui se cache à l’intérieur sans rien démonter.',
  'Double-cliquez sur une pièce pour la cadrer et ouvrir sa fiche.',
  'I isole la pièce sélectionnée ; Maj + H réaffiche tout.',
  'Les réglages permettent d’agrandir les textes de l’interface.',
  'Les étapes marquées d’un tampon rouge sont destructives : on ne les fait qu’une fois en vrai.',
  'F6 donne le focus aux panneaux de l’inspection pour les parcourir au clavier.',
  'Chaque objet possède des paramètres : format, variantes, options… changez-les depuis l’établi.',
];

/** Astuce suivante (cyclique) à partir d'un index quelconque. */
export function tipAt(index: number): string {
  const n = LOADING_TIPS.length;
  return LOADING_TIPS[((index % n) + n) % n]!;
}
