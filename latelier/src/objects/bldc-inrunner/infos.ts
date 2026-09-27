/**
 * Fiches pédagogiques des pièces (panneau droit), calculées à partir des cotes réelles des
 * paramètres. Valeurs incertaines marquées « typique ».
 */
import type { PartInfo } from '../types';
import { fr, PHASE_COLORS_FR, type BldcDims } from './params';

const mm = (v: number, digits = 1) => `${fr(v, digits)} mm`;

export function infos(d: BldcDims): Record<string, PartInfo> {
  const p = d.params;
  const w = d.winding;
  const sp = w.spec;
  const st = d.stator;
  const b = d.bearing;
  const sc = d.screw;
  const rpm = w.noLoadRpm;
  const omega = (rpm * 2 * Math.PI) / 60;
  const fElec = (sp.polePairs * rpm) / 60;
  const tipSpeed = omega * d.rotorR * 1e-3;
  // Masse d'un aimant (NdFeB ≈ 7,5 g/cm³) et effort centrifuge à la vitesse à vide.
  const magnetArea = (Math.PI * (d.magnetOuterR ** 2 - d.magnetInnerR ** 2)) / sp.poles;
  const magnetMass = (7.5e-3 * magnetArea * (d.magnetX1 - d.magnetX0)) / 1000; // kg
  const rG = ((d.magnetOuterR + d.magnetInnerR) / 2) * 1e-3;
  const centrifugal = magnetMass * omega * omega * rG;
  const schema =
    sp.kind === 'concentrated'
      ? `bobinage concentré sur dents (${sp.slots} bobines, une par dent), double couche`
      : `bobinage réparti simple couche, pas de ${sp.pitch} encoches (${sp.slots / 2} bobines)`;
  const bearingInfo = `${b.ref} : Ø ${fr(b.d, 3)} × Ø ${fr(b.D, 3)} × ${fr(b.B, 3)} mm`;
  const turnsTxt = `${fr(w.turns, w.turns % 1 ? 1 : 0)} spire${w.turns > 1 ? 's' : ''} par bobine`;

  const phaseInfo = (k: 0 | 1 | 2): PartInfo => ({
    role: `Phase ${'ABC'[k]} : ${sp.coilsPerPhase} bobines en série qui créent, avec les deux autres phases alimentées à tour de rôle par le variateur, le champ tournant qui entraîne les aimants.`,
    material: `Cuivre émaillé grade 2 (classe thermique 180–200 °C, typique), ${w.strands} brin${w.strands > 1 ? 's' : ''} en parallèle de Ø ${fr(w.strandD, 2)} mm. Émail teinté ${PHASE_COLORS_FR[k]} : repère du simulateur (en réalité, fil identique, repéré par gaine).`,
    dimensions: `${turnsTxt}, ${w.conductorsPerSlot} conducteurs par encoche, environ ${fr(w.wirePerPhase / 1000, 2)} m de faisceau par phase`,
    reference: `${sp.slots}N${sp.poles}P, ${schema}`,
    tip: 'Court-circuit entre spires : un émail brûlé par une surchauffe relie deux spires voisines ; la spire en court-circuit se comporte comme le secondaire d’un transformateur, chauffe fortement et fait « cogner » le moteur. Contrôle : les trois résistances phase-phase doivent être égales à ±2 %.',
    extra: [
      { label: 'Spires', value: `${turnsTxt} (calcul : ${fr(w.turnsExact, 2)}, arrondi au demi-tour)` },
      {
        label: 'Fil',
        value: `${w.strands} × Ø ${fr(w.strandD, 2)} mm = ${fr(w.strands * Math.PI * (w.strandD / 2) ** 2, 2)} mm² de cuivre par conducteur`,
      },
      {
        label: 'KV ↔ spires',
        value: `La FCEM par spire vaut ω·kw·B·π·D·L/2 : elle ne dépend pas du nombre de pôles (flux par pôle ∝ 1/p, fréquence électrique ∝ p). Pour ${p.kv} KV, il faut donc N·c = ${fr(w.turns * sp.coilsPerPhase, 1)} spires en série par phase (c = ${sp.coilsPerPhase} bobines, kw = ${fr(sp.windingFactor, 3)}, Ø rotor ${mm(2 * d.rotorR)}, paquet ${mm(st.stackLength)}). Doubler le KV divise les spires par deux.`,
      },
      {
        label: 'Section constante',
        value: `Section de cuivre par encoche fixe (${fr(w.copperPerSlot, 2)} mm², remplissage ${Math.round(w.fillFactor * 100)} %) : moins de spires ⇒ fil plus gros ⇒ résistance plus faible (≈ ${fr(w.lineResistance * 1000, 0)} mΩ entre phases, typique) et courant admissible plus élevé.`,
      },
      {
        label: 'Constantes',
        value: `Ke ≈ ${fr(w.keVperKrpm, 3)} V/1000 tr/min ; Kt ≈ ${fr(w.kt * 1000, 2)} mN·m/A (Kt = 60 / (2π·KV))`,
      },
      {
        label: 'KV obtenu',
        value: `≈ ${Math.round(w.kvEffective)} tr/min/V avec le nombre de spires arrondi`,
      },
    ],
  });

  const bearingPart = (what: string): PartInfo => {
    switch (what) {
      case 'outer':
        return {
          role: 'Bague extérieure : reçoit le chemin de roulement extérieur, montée serrée dans la portée de la flasque.',
          material: 'Acier à roulement 100Cr6 trempé (60–64 HRC), piste rectifiée et superfinie',
          dimensions: `Ø ${fr(b.D, 3)} × ${fr(b.B, 3)} mm`,
          reference: b.ref,
          tip: 'Des marques régulières (« brinelling ») sur la piste viennent d’un choc ou d’un emmanchement fait en appuyant sur la mauvaise bague : l’effort est alors passé par les billes.',
        };
      case 'inner':
        return {
          role: 'Bague intérieure : tourne avec l’arbre, porte le chemin de roulement intérieur (gorge torique).',
          material: 'Acier à roulement 100Cr6 trempé, rectifié',
          dimensions: `Alésage Ø ${fr(b.d, 3)} mm × ${fr(b.B, 3)} mm`,
          reference: b.ref,
          tip: 'Rayon de gorge ≈ 0,52 × Ø bille : un peu plus grand que la bille pour limiter le frottement tout en gardant une bonne surface de contact.',
        };
      case 'shield':
        return {
          role: 'Flasque de protection (ZZ) : retient la graisse et arrête les grosses particules, sans contact avec la bague intérieure (jeu de quelques centièmes).',
          material: 'Tôle d’acier emboutie, sertie dans un chambrage de la bague extérieure',
          dimensions: `Ø ${fr(2 * (d.bearing.pitchR + 0.62 * b.ballD), 2)} mm environ, épaisseur 0,2 mm (typique)`,
          reference: `${b.ref} (ZZ = deux flasques métalliques ; 2RS = joints caoutchouc frottants)`,
          tip: 'Une flasque déposée ne se remet pas : sa lèvre sertie est déformée. On la retire pour nettoyer ou inspecter, puis on change le roulement.',
        };
      case 'cage':
        return {
          role: 'Cage : maintient l’écartement régulier des billes et les empêche de frotter entre elles.',
          material: 'Deux demi-cages en tôle d’acier emboutie, assemblées par rivets (cage « à ruban »)',
          dimensions: `${b.ballCount} alvéoles au diamètre primitif Ø ${fr(2 * b.pitchR, 2)} mm`,
          reference: b.ref,
          tip: 'Une cage usée (alvéoles ovalisées, rivets lâches) produit un bruit de « crécelle » irrégulier ; à très haute vitesse, sa rupture bloque le roulement.',
        };
      default:
        return {
          role: 'Billes : éléments roulants entre les deux bagues ; elles transmettent la charge radiale et une partie de la charge axiale.',
          material: 'Acier 100Cr6 poli, grade G10 (sphéricité ≈ 0,25 µm, typique)',
          dimensions: `${b.ballCount} billes de Ø ${fr(b.ballD, 3)} mm (1/${Math.round(25.4 / b.ballD)} po)`,
          reference: b.ref,
          tip: 'Graisse évaporée ou polluée : les billes glissent au lieu de rouler, s’échauffent, bleuissent puis le roulement grippe. Un moteur haut KV use ses roulements en quelques dizaines d’heures de fonctionnement (ordre de grandeur).',
        };
    }
  };

  return {
    can: {
      role: 'Carter : enveloppe structurelle et dissipateur. Il maintient le paquet de tôles (emmanché et collé), porte les deux flasques et évacue par ses ailettes la chaleur des pertes cuivre et fer.',
      material:
        'Aluminium 6061-T6 (typique), anodisé (couche de 10 à 15 µm colorée), finition satinée microbillée',
      dimensions: `Ø ${mm(d.format.canOD, 0)} aux ailettes × ${mm(2 * d.tubeHalf, 0)} (${mm(d.length, 0)} avec flasques), alésage Ø ${mm(2 * d.boreR)}`,
      reference: `VELKOR VK-${p.format} (marque fictive)`,
      tip: 'La gravure laser n’est pas une peinture : le faisceau détruit localement le colorant de l’anodisation, d’où un marquage indélébile gris clair. Une anodisation qui brunit signale une surchauffe (au-delà de ~150 °C) : moteur sous-dimensionné ou mal refroidi.',
      extra: [
        {
          label: 'Marquage',
          value: `${p.kv} KV · ${sp.slots}N${sp.poles}P${p.sensors ? ' · capteurs' : ''}`,
        },
        {
          label: 'Vitesse à vide',
          value: `≈ ${Math.round(rpm).toLocaleString('fr-FR')} tr/min sous ${fr(w.nominalVoltage, 1)} V (${d.format.cells}S)`,
        },
      ],
    },
    pinion: {
      role: 'Pignon moteur : transmet le couple à la couronne de la transmission (réduction). Il est bloqué sur le méplat de l’arbre par une vis sans tête.',
      material: 'Acier 20MnCr5 cémenté-trempé (typique), denture taillée puis rectifiée',
      dimensions: `${d.pinion.teeth} dents, module ${fr(d.pinion.module, 1)}, Ø primitif ${mm(2 * d.pinion.pitchR)}, Ø de tête ${mm(2 * d.pinion.tipR)}, largeur ${mm(d.pinion.width, 0)}`,
      reference: `Pignon M${fr(d.pinion.module, 1)} Z${d.pinion.teeth}, alésage Ø ${fr(d.format.shaftD, 3)}`,
      tip: 'Le jeu d’engrènement se règle avec une bande de papier glissée entre pignon et couronne : trop serré, le moteur force et chauffe ; trop lâche, les dents s’arrachent au premier choc.',
      extra: [{ label: 'Denture', value: 'Développante de cercle, angle de pression 20°' }],
    },
    'pinion.setscrew': {
      role: 'Vis sans tête : bloque le pignon en serrant sur le méplat de l’arbre (le méplat évite qu’elle ne marque la partie cylindrique).',
      material: 'Acier allié trempé 45H, bruni',
      dimensions: `M3 × ${fr(d.pinion.setScrewL, 1)} mm, bout cuvette, six pans creux de 1,5 mm`,
      reference: 'ISO 4029 M3',
      tip: 'Toujours serrer sur le méplat, avec un point de frein-filet faible. Une vis serrée à côté du méplat laisse un bourrelet sur l’arbre qui empêche ensuite de sortir le pignon.',
    },
    sensorCable: {
      role: 'Câble capteurs : alimente les capteurs Hall (5 V) et renvoie au variateur la position du rotor (A, B, C) et la température.',
      material: 'Nappe PVC 6 conducteurs, fiche polyamide à verrou',
      dimensions: '6 conducteurs au pas de 1,27 mm ; fiche au pas de 1,5 mm (typique)',
      reference: 'Câble capteurs 6 points (standard du modélisme sensored)',
      tip: 'Une fiche mal enfoncée ou un conducteur coupé fait passer le variateur en mode sans capteurs : démarrages saccadés, « cogging » à bas régime.',
    },
    'leads.joints': {
      role: 'Soudures des sorties : relient les queues de bobinage (et les fils de puissance) aux languettes, pour des courants de plusieurs dizaines d’ampères.',
      material: 'Étain Sn60Pb40 ou sans plomb SAC305 (typique), flux colophane',
      dimensions: 'Ménisque d’environ 3 × 2 mm par languette',
      reference: 'Brasage tendre au fer (≥ 60 W, panne large)',
      tip: 'Une soudure « sèche » (terne, granuleuse) présente une résistance de contact élevée : elle chauffe sous fort courant et finit par couper la phase. Il faut une panne large et assez de puissance pour chauffer la languette.',
    },
    sensors: {
      role: 'Platine capteurs : trois capteurs Hall à 120° électriques qui donnent la position du rotor au variateur pour un démarrage doux et un couple maximal dès l’arrêt.',
      material: 'Circuit FR4, composants traversants',
      dimensions: `Secteur annulaire Ø ${mm(2 * d.pcb.rIn)} / Ø ${mm(2 * d.pcb.rOut)}, épaisseur ${mm(d.pcb.t)}`,
      reference: 'VK-HS3 rév. B (fictive)',
      tip: `Capteurs espacés de ${fr(120 / sp.polePairs, 0)}° mécaniques (= 120° électriques pour ${sp.polePairs} paire${sp.polePairs > 1 ? 's' : ''} de pôles). Une platine remontée décalée d’un seul trou fausse l’avance de commutation : le moteur tourne mais chauffe et perd du rendement.`,
    },
    'sensors.pcb': {
      role: 'Circuit imprimé : relie les capteurs Hall au connecteur ; plage de masse et piste 5 V en arc.',
      material:
        'Stratifié verre-époxy FR4, cuivre 35 µm, vernis épargne vert, finition or (ENIG), sérigraphie blanche',
      dimensions: `Épaisseur ${mm(d.pcb.t)}, rayon extérieur ${mm(d.pcb.rOut)}`,
      reference: 'VK-HS3 rév. B (fictive)',
      tip: 'La tranche montre la fibre de verre du FR4 : un circuit qui a chauffé brunit et peut délaminer (cloques).',
    },
    'sensors.connector': {
      role: 'Embase du câble capteurs : +5 V, masse, signaux A, B, C et sonde de température.',
      material: 'Polyamide PA66 (UL94 V-0), contacts laiton doré',
      dimensions: '6 points au pas de 1,5 mm, 10,5 × 3,8 × 4,5 mm (typique)',
      reference: 'Embase 6 points pas 1,5 mm, verrouillage à rampe',
      tip: 'Débrancher en tirant sur la fiche, jamais sur les fils : les contacts sertis se désolidarisent facilement.',
    },
    'sensors.hall': {
      role: 'Capteurs à effet Hall : chaque capteur bascule quand le pôle de l’aimant qui passe devant lui change (sortie tout-ou-rien, verrouillée).',
      material: 'Puce silicium, boîtier époxy SIP-3 (TO-92S)',
      dimensions: '4 × 3 × 1,5 mm, 3 pattes au pas de 1,27 mm',
      reference:
        'Capteur Hall bipolaire à verrouillage, type SS41F (marquage « 41F »), sortie collecteur ouvert',
      tip: 'Diagnostic : alimenter en 5 V et tourner le rotor à la main ; chaque sortie doit basculer à chaque passage de pôle (LED + résistance de tirage, ou oscilloscope). Un capteur mort fait démarrer le moteur par à-coups.',
    },
    'sensors.screws': {
      role: 'Vis de fixation de la platine dans son logement.',
      material: 'Acier zingué',
      dimensions: 'M2 × 3 mm, tête cylindrique cruciforme Ø 3,5 mm',
      reference: 'ISO 7045 M2 × 3 (typique)',
      tip: 'Un tournevis de précision de taille exacte évite de « cruciformer » ces petites têtes.',
    },
    rearBell: {
      role: 'Flasque arrière : centre et porte le roulement arrière, le bornier des sorties de phase et le logement de la platine capteurs.',
      material: 'Aluminium 6061-T6 anodisé (typique)',
      dimensions: `Ø ${mm(2 * d.flangeR)} ; collerette de centrage Ø ${mm(2 * d.spigotR)} ; portée de roulement Ø ${fr(b.D, 3)} mm`,
      reference: `Flasque arrière VK-${p.format}`,
      tip: 'Sur un moteur à capteurs, la position angulaire de la flasque arrière fixe le calage des capteurs : remonter la flasque dans la même position (repère au feutre avant démontage).',
    },
    'rearBell.screws': {
      role: 'Vis de flasque arrière : maintiennent la flasque contre le carter (vissées dans les trous taraudés du tube).',
      material: 'Acier allié classe 12.9, bruni',
      dimensions: `${sc.name} × ${fr(sc.length, 0)} mm, tête Ø ${fr(sc.headD, 1)} × ${fr(sc.headH, 1)} mm, six pans creux de ${fr(sc.key, 1)} mm`,
      reference: `ISO 4762 ${sc.name} × ${fr(sc.length, 0)}`,
      tip: `Serrer en croix et modérément (≈ ${sc.d > 2.2 ? '0,4' : '0,2'} N·m typique dans l’aluminium). Une clé usée ou au pas impérial arrondit l’empreinte : utiliser une clé de ${fr(sc.key, 1)} mm en bon état.`,
    },
    'rearBell.block': {
      role: 'Bornier : isole les languettes de la flasque (masse) et guide les queues de bobinage.',
      material: 'PBT chargé verre, noir (typique)',
      dimensions: `${mm(2 * d.block.z)} × ${mm(d.block.y1 - d.block.y0)} × ${mm(d.block.x0 - d.block.x1)}`,
      reference: 'Bornier 3 voies',
      tip: 'Un bornier fondu (fer laissé trop longtemps) peut mettre une phase à la masse du carter.',
    },
    'rearBell.tabs': {
      role: `Languettes à souder A, B, C : reçoivent les fils du variateur. Les queues de bobinage traversent leur œillet.`,
      material: 'Cuivre étamé',
      dimensions: `${mm(d.tabs.width)} × ${mm(d.tabs.t)}, œillet Ø ${mm(1.4 * d.s)}`,
      reference: 'Languettes de puissance',
      tip: 'Permuter deux fils de phase inverse le sens de rotation (sur un moteur à capteurs, il faut alors aussi adapter le câblage ou le réglage du variateur).',
    },
    frontBell: {
      role: 'Flasque avant : reçoit le roulement côté sortie d’arbre et les efforts de la transmission ; ses deux trous taraudés M3 fixent le moteur sur son support.',
      material: 'Aluminium 6061-T6 anodisé (typique)',
      dimensions: `Ø ${mm(2 * d.flangeR)}, entraxe de fixation ${mm(d.format.mountSpacing, 0)}, bossage de centrage Ø ${mm(2 * d.pilotR)}`,
      reference: `Flasque avant VK-${p.format}`,
      tip: 'Vis de fixation trop longues : elles butent au fond des taraudages et arrachent les filets de l’aluminium. Longueur = épaisseur du support + 2 mm environ, et un frein-filet faible contre les vibrations.',
    },
    'frontBell.screws': {
      role: 'Vis de flasque avant : maintiennent la flasque contre le carter.',
      material: 'Acier allié classe 12.9, bruni',
      dimensions: `${sc.name} × ${fr(sc.length, 0)} mm, six pans creux de ${fr(sc.key, 1)} mm`,
      reference: `ISO 4762 ${sc.name} × ${fr(sc.length, 0)}`,
      tip: 'Le filet réel est visible au zoom : profil ISO à 60°, pas de ' + fr(sc.pitch, 2) + ' mm.',
    },
    'rearBell.bearing': {
      role: 'Roulement arrière : guide l’arbre côté capteurs ; précharge axiale appliquée par la rondelle ondulée.',
      material: 'Acier 100Cr6, graisse au lithium',
      dimensions: bearingInfo,
      reference: b.ref,
      tip: 'Un roulement qui « gratte » à la main est à changer : il ne s’améliore jamais en rodant.',
    },
    'frontBell.bearing': {
      role: 'Roulement avant : supporte l’effort radial du pignon (le plus chargé des deux).',
      material: 'Acier 100Cr6, graisse au lithium',
      dimensions: bearingInfo,
      reference: b.ref,
      tip: 'Un engrènement trop serré surcharge ce roulement : il est le premier à gripper.',
    },
    waveWasher: {
      role: 'Rondelle ondulée : applique une précharge axiale (quelques newtons) qui rattrape le jeu interne des roulements : moins de bruit et de vibrations.',
      material: 'Acier à ressort (C75) trempé, bruni',
      dimensions: `Ø ${mm(2 * d.wave.innerR)} / Ø ${mm(2 * d.wave.outerR)}, ${d.wave.waves} ondes, épaisseur ${mm(d.wave.t, 2)}`,
      reference: 'Rondelle ondulée 3 ondes (typique)',
      tip: 'Une rondelle écrasée (fatiguée) ne précharge plus : le rotor « claque » axialement et les billes marquent les pistes.',
    },
    shims: {
      role: 'Cales de réglage : ajustent le jeu axial du rotor à quelques centièmes de millimètre.',
      material: 'Acier inox laminé',
      dimensions: `${d.shims.count} × ${mm(d.shims.t, 2)}, Ø ${mm(2 * d.shims.innerR)} / Ø ${mm(2 * d.shims.outerR)}`,
      reference: 'Rondelles de calage DIN 988 (typique)',
      tip: 'Noter leur nombre et leur ordre au démontage : un calage différent modifie la précharge et l’alignement des aimants avec les capteurs.',
    },
    circlip: {
      role: 'Circlip : arrête axialement l’arbre derrière le rotor (il tient les cales et la rondelle ondulée).',
      material: 'Acier à ressort phosphaté (bruni)',
      dimensions: `Pour arbre Ø ${fr(d.format.shaftD, 2)} mm, gorge Ø ${fr(d.circlip.d2, 2)} mm, épaisseur ${fr(d.circlip.s, 1)} mm`,
      reference: `DIN 471 — ${fr(d.format.shaftD, 0)}`,
      tip: 'Ouvert au-delà de sa limite élastique, un circlip ne serre plus dans sa gorge : toujours le remplacer s’il est déformé.',
    },
    rotor: {
      role: `Rotor à aimants permanents (${sp.poles} pôles) : ses aimants sont entraînés par le champ tournant du stator.`,
      material: 'Arbre et culasse acier, aimants NdFeB, frette fibre',
      dimensions: `Ø ${mm(2 * d.rotorR)} × ${mm(d.magnetX1 - d.magnetX0)} (partie active), arbre Ø ${fr(d.format.shaftD, 3)} mm`,
      reference: `Rotor ${sp.poles} pôles VK-${p.format}`,
      tip: 'L’attraction des aimants vers le stator est forte : on l’extrait dans l’axe, d’un geste franc, sans laisser les aimants frotter sur les dents (ils s’écaillent).',
      extra: [
        {
          label: 'Entrefer',
          value: `${mm(d.gap, 2)} mécanique, ${mm(d.gap + d.sleeveT, 2)} magnétique (avec la frette)`,
        },
      ],
    },
    'rotor.shaft': {
      role: 'Arbre : porte le rotor et le pignon, tourne dans les deux roulements. Méplat pour la vis sans tête, gorge de circlip à l’arrière.',
      material: 'Acier inoxydable martensitique X46Cr13 trempé, rectifié (typique)',
      dimensions: `Ø ${fr(d.format.shaftD, 3)} mm h6 × ${mm(d.shaftX1 - d.shaftX0)}, dépassement ${mm(d.format.shaftOut, 0)}`,
      reference: d.format.shaftD < 4 ? 'Arbre 1/8 po (3,175 mm)' : 'Arbre Ø 5 mm',
      tip: 'Un arbre voilé (chute du modèle, choc sur le pignon) se voit en faisant tourner l’arbre lentement : le bout décrit un petit cercle. Il vibre, fait chanter le moteur et détruit les roulements.',
    },
    'rotor.yoke': {
      role: 'Culasse rotorique : referme le flux magnétique des aimants côté intérieur ; son moyeu avant cale le rotor contre le roulement avant.',
      material: 'Acier doux (S235 ou C15, typique)',
      dimensions: `Ø ${mm(2 * d.magnetInnerR)} × ${mm(d.yokeX1 - d.yokeX0)}, emmanchée sur l’arbre`,
      reference: `Culasse ${sp.poles} pôles`,
      tip: 'Elle est emmanchée (serrage) et souvent collée : la séparer de l’arbre demande une presse, et le serrage n’est plus garanti au remontage.',
    },
    'rotor.magnets': {
      role: `Aimants permanents : ${sp.poles} segments d’arc aimantés radialement, polarités alternées (N-S-N-S…), qui créent le champ du rotor.`,
      material: 'Néodyme-fer-bore fritté, nuance N42SH (typique), revêtement nickel Ni-Cu-Ni',
      dimensions: `Arc ${fr(360 / sp.poles, 0)}°, épaisseur ${mm(d.magnetOuterR - d.magnetInnerR, 2)}, longueur ${mm(d.magnetX1 - d.magnetX0)}${p.sensors ? ' (débord arrière de 2 mm lu par les capteurs)' : ''}`,
      reference: `${sp.poles} segments, collés sur la culasse`,
      tip: 'Démagnétisation : au-delà de ~150 °C (nuance SH), l’aimant perd une partie de son aimantation de façon irréversible ; le KV augmente, le couple chute et le moteur chauffe encore plus. Un aimant écaillé rouille vite : le NdFeB nu s’oxyde à l’air humide.',
      extra: [{ label: 'Masse d’un aimant', value: `≈ ${fr(magnetMass * 1000, 1)} g` }],
    },
    'rotor.sleeve': {
      role: 'Frette : manchon enroulé sous tension qui retient les aimants contre la force centrifuge.',
      material: 'Fibre d’aramide tissée (toile 1/1), imprégnée époxy ; parfois fibre de verre ou de carbone',
      dimensions: `Ø ${mm(2 * d.rotorR)}, épaisseur ${mm(d.sleeveT, 2)}`,
      reference: 'Frette composite',
      tip: `À ${Math.round(rpm).toLocaleString('fr-FR')} tr/min, la surface du rotor file à ${fr(tipSpeed, 0)} m/s et chaque aimant « tire » sur la frette avec environ ${fr(centrifugal, 0)} N. En survitesse (moteur à vide sous trop de tension), la frette éclate et les aimants arrachent les dents : destruction immédiate.`,
    },
    stator: {
      role: 'Stator : paquet de tôles denté portant le bobinage triphasé ; il est emmanché (et souvent collé) dans le carter, qui évacue sa chaleur.',
      material: 'Tôles Fe-Si, cuivre émaillé, isolants, vernis',
      dimensions: `Ø ${mm(2 * st.Ro)} / Ø ${mm(2 * st.Ri)} × ${mm(st.stackLength)}, ${st.slots} encoches`,
      reference: `Stator ${sp.slots}N${sp.poles}P`,
      tip: 'Le sortir du carter est destructif : il est collé et emmanché. On le pousse à la presse par la tôle, jamais par le bobinage.',
      extra: [{ label: 'Schéma', value: schema }],
    },
    'stator.core': {
      role: 'Paquet de tôles : canalise le flux magnétique ; les dents concentrent le champ vers le rotor, la culasse statorique le referme.',
      material: `Acier électrique non orienté Fe-Si 3 %, ${fr(st.lamThickness, 2)} mm, isolé par vernis (typique M${st.lamThickness < 0.3 ? '235-20' : '270-35'}A)`,
      dimensions: `${st.lamCount} tôles de ${fr(st.lamThickness, 2)} mm (paquet de ${mm(st.stackLength)}), Ø ${mm(2 * st.Ro)}`,
      reference: `${st.slots} encoches semi-fermées, ouverture ${mm(st.slotOpening, 2)}`,
      tip: `Les pertes par courants de Foucault croissent comme (épaisseur × fréquence)². Ici la fréquence électrique atteint ${fr(fElec, 0)} Hz à vide : d’où des tôles fines, isolées entre elles. La tranche bleuie vient du recuit après découpe.`,
    },
    'stator.insulators': {
      role: 'Isolants d’encoche : protègent l’émail du fil contre les arêtes des tôles et isolent le bobinage de la masse.',
      material: 'Papier aramide (type Nomex 410)',
      dimensions: `Épaisseur ${mm(st.liner, 2)}, dépassement de 0,8 mm de chaque côté du paquet`,
      reference: `${st.slots} isolants en U`,
      tip: 'Un isolant déchiré au bobinage = court-circuit franc entre une phase et la masse (le carter devient « sous tension ») : le variateur se met en défaut dès la mise sous tension.',
    },
    'stator.phaseA': phaseInfo(0),
    'stator.phaseB': phaseInfo(1),
    'stator.phaseC': phaseInfo(2),
    'stator.neutral': {
      role: 'Point neutre : les trois fins de phase sont soudées ensemble (couplage en étoile).',
      material: 'Soudure étain sous gaine tressée en fibre de verre',
      dimensions: `Gaine Ø ${mm(2 * 1.2, 1)} environ × ${mm(3.6 * d.s)}`,
      reference: 'Couplage étoile (Y)',
      tip:
        'Le même bobinage couplé en triangle (Δ) donnerait un KV √3 fois plus élevé (≈ ' +
        Math.round(p.kv * Math.sqrt(3)) +
        ' KV) : certains fabricants déclinent ainsi deux KV avec une seule série de stators.',
    },
    'stator.varnish': {
      role: 'Vernis d’imprégnation : bloque les spires (vibrations, efforts électromagnétiques), améliore l’isolation et la conduction de la chaleur vers les tôles.',
      material: 'Résine polyester-imide ou époxy (classe H), cuite au four (typique)',
      dimensions: `Coque sur les têtes de bobines, hauteur ≈ ${mm(w.endTurnHeight)} de chaque côté`,
      reference: 'Imprégnation par trempage',
      tip: 'Un vernis bruni, craquelé ou qui sent le brûlé signale une surchauffe : l’émail dessous est probablement abîmé (risque de court-circuit entre spires).',
    },
    ...Object.fromEntries(
      (['rearBell.bearing', 'frontBell.bearing'] as const).flatMap((bid) => [
        [`${bid}.outer`, bearingPart('outer')],
        [`${bid}.inner`, bearingPart('inner')],
        [`${bid}.shieldOut`, bearingPart('shield')],
        [`${bid}.shieldIn`, bearingPart('shield')],
        [`${bid}.cage`, bearingPart('cage')],
        [`${bid}.balls`, bearingPart('balls')],
      ]),
    ),
    ...Object.fromEntries(
      ([0, 1, 2] as const).flatMap((k) => {
        const id = `lead.${'abc'[k]}`;
        const color = ['jaune', 'rouge', 'bleu'][k]!;
        return [
          [
            id,
            {
              role: `Fil de puissance de la phase ${'ABC'[k]} (repère ${color}) : relie la languette au variateur.`,
              material: 'Cuivre multibrin très fin (souple), isolant silicone 200 °C',
              dimensions: `${d.params.format === '2848' ? '16 AWG (1,3 mm²)' : '14 AWG (2,1 mm²)'}, longueur ≈ 80 mm (écourtée)`,
              reference: 'Fil silicone haute souplesse',
              tip: 'La silicone supporte la chaleur du fer, mais un fil qui durcit ou jaunit près du moteur signale des surchauffes répétées.',
            } satisfies PartInfo,
          ],
          [
            `${id}.bullet`,
            {
              role: 'Connecteur bullet mâle : raccordement démontable au variateur.',
              material: 'Laiton (souvent doré), fente élastique',
              dimensions: 'Broche Ø 4 mm, coupelle de soudure',
              reference: 'Bullet 4 mm',
              tip: 'Supporte environ 60 A en continu (typique) ; une fiche qui a chauffé perd son élasticité et crée un faux contact.',
            } satisfies PartInfo,
          ],
          [
            `${id}.shrink`,
            {
              role: `Gaine thermorétractable : isole la coupelle du bullet et repère la phase (${color}).`,
              material: 'Polyoléfine réticulée, rapport de rétreint 2:1',
              dimensions: 'Ø 6 mm avant rétreint, longueur ≈ 15 mm',
              reference: 'Gaine thermo 2:1',
              tip: 'Chauffer au pistolet à air chaud, pas à la flamme : une gaine brûlée devient cassante.',
            } satisfies PartInfo,
          ],
        ];
      }),
    ),
  };
}
