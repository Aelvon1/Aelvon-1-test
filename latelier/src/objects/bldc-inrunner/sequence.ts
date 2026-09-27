/**
 * Séquence de référence du démontage A → Z (14 étapes). L'ordre effectif est le tri
 * topologique des dépendances, départagé par l'ordre de déclaration.
 */
import type { StepDef } from '../types';
import type { BldcParams } from './params';
import { deriveDimensions } from './params';

export function bldcSteps(p: BldcParams): StepDef[] {
  const d = deriveDimensions(p);
  const sc = d.screw;
  const key = sc.key.toString().replace('.', ',');
  const wires = p.leads === 'wires';
  const sensors = (q: Record<string, unknown>) => q.sensors === true;
  return [
    {
      id: 'pinion',
      title: 'Desserrer la vis sans tête et retirer le pignon',
      description:
        'Clé Allen 1,5 mm : desserrer la vis sans tête qui serre sur le méplat, puis faire glisser le pignon hors de l’arbre.',
      parts: ['pinion.setscrew', 'pinion'],
      tool: 'hex-key-1.5',
    },
    {
      id: 'sensor-cable',
      title: 'Débrancher le câble capteurs',
      description: 'Appuyer sur le verrou de la fiche et la tirer dans l’axe, sans tirer sur la nappe.',
      parts: ['sensorCable'],
      tool: 'hands',
      enabled: sensors,
    },
    {
      id: 'phases',
      title: wires ? 'Dessouder et déconnecter les trois fils de phase' : 'Dessouder les trois phases',
      description: wires
        ? 'Fer chaud et pompe à dessouder : libérer chaque languette (queue de bobinage et fil silicone), puis dégager les fils.'
        : 'Fer chaud et pompe à dessouder : aspirer l’étain de chaque languette pour libérer les queues de bobinage.',
      parts: ['leads.joints', '#leadwire'],
      tool: 'soldering-iron',
    },
    {
      id: 'sensor-board',
      title: 'Dévisser et retirer la platine capteurs',
      description:
        'Dévisser les deux vis cruciformes, sortir la platine de son logement, puis dessouder si besoin les capteurs Hall.',
      parts: ['sensors.screws', 'sensors', 'sensors.hall'],
      tool: 'screwdriver-precision',
      enabled: sensors,
    },
    {
      id: 'rear-bell',
      title: 'Dévisser la flasque arrière et la retirer avec son roulement',
      description: `Clé Allen ${key} mm : dévisser les trois vis en croix, puis retirer la flasque dans l’axe (le roulement glisse sur l’arbre).`,
      parts: ['rearBell.screws', 'rearBell'],
      tool: sc.tool,
    },
    {
      id: 'circlip',
      title: 'Retirer circlip, cales et rondelle ondulée',
      description:
        'Retirer la rondelle ondulée et les cales (noter leur nombre), puis ouvrir le circlip à la pince et le dégager de sa gorge.',
      parts: ['waveWasher', 'shims', 'circlip'],
      tool: 'pliers-circlip',
    },
    {
      id: 'rotor',
      title: 'Extraire le rotor',
      description:
        'Tirer le rotor vers l’arrière, bien dans l’axe : les aimants résistent fortement puis décrochent d’un coup.',
      parts: ['rotor'],
      tool: 'hands',
    },
    {
      id: 'front-bell',
      title: 'Dévisser et retirer la flasque avant',
      description: `Clé Allen ${key} mm : dévisser les trois vis, puis retirer la flasque avant avec son roulement.`,
      parts: ['frontBell.screws', 'frontBell'],
      tool: sc.tool,
    },
    {
      id: 'bearings-out',
      title: 'Extraire les roulements de leurs flasques',
      description:
        'Extracteur à griffes en appui sur la bague extérieure : sortir chaque roulement de sa portée.',
      parts: ['rearBell.bearing', 'frontBell.bearing'],
      tool: 'bearing-puller',
    },
    {
      id: 'bearings-strip',
      title: 'Démonter les roulements jusqu’aux billes',
      description:
        'Déposer les deux flasques de protection, cisailler la cage à ruban, dégager la bague extérieure puis libérer les billes (les deux roulements).',
      parts: ['#bearingpart'],
      tool: 'screwdriver-precision',
    },
    {
      id: 'rotor-strip',
      title: 'Déshabiller le rotor : frette, aimants, arbre',
      description:
        'Inciser et peler la frette, décoller les aimants (collés), puis chasser l’arbre hors de la culasse à la presse.',
      parts: ['rotor.sleeve', 'rotor.magnets', 'rotor.shaft'],
      tool: 'scalpel',
      destructive: true,
    },
    {
      id: 'stator-out',
      title: 'Sortir le stator du carter',
      description:
        'Presse à main, appui sur le paquet de tôles (jamais sur le bobinage) : le stator collé et emmanché sort par l’arrière.',
      parts: ['stator'],
      tool: 'arbor-press',
      destructive: true,
    },
    {
      id: 'unwind',
      title: 'Débobiner les phases et retirer les isolants',
      description:
        'Peler le vernis, couper le point neutre, débobiner chaque phase depuis sa fin (un brin libre sort), puis retirer les isolants d’encoche.',
      parts: ['stator.varnish', 'stator.neutral', '#phase', 'stator.insulators'],
      tool: 'scalpel',
      destructive: true,
    },
    {
      id: 'laminations',
      title: 'Séparer le paquet en tôles individuelles',
      description: `Décoller les ${d.stator.lamCount} tôles de ${d.stator.lamThickness.toString().replace('.', ',')} mm une à une le long de l’axe.`,
      parts: ['stator.core'],
      tool: 'hands',
    },
  ];
}
