# L'Atelier

Simulateur 3D web à la première personne (PC, clavier + souris). On se promène dans un petit
atelier-garage de bricoleur, forestier et pluvieux, aux années 80-90. On choisit un objet dans
l'**inventaire** : il se pose sur l'établi, puis on le **démonte intégralement**, de A à Z, avec
vue éclatée hiérarchique et zoom macro jusqu'au marquage d'une puce.

- Deux objets : un **moteur brushless inrunner à haut KV**, entièrement paramétrique, et une
  **carte de développement type Uno R3** (« ATELIER-328 ») avec tous ses composants.
- Architecture **100 % pilotée par les données** : ajouter un objet ne demande que de nouveaux
  fichiers dans `src/objects/`.
- Tout est généré par le code : géométries, textures (Web Workers + OffscreenCanvas), sons
  (Web Audio). Aucun asset externe, aucune marque réelle.

> Ambiance inspirée du garage du jeu _Pacific Drive_, sans en reprendre aucun élément, logo,
> personnage ni asset.

## Démarrage

```bash
npm install
npm run dev        # http://localhost:5173
```

| Commande            | Rôle                                                   |
| ------------------- | ------------------------------------------------------ |
| `npm run dev`       | serveur de développement Vite (rechargement à chaud)   |
| `npm run build`     | vérification TypeScript puis build de production       |
| `npm run preview`   | sert le build de production                            |
| `npm test`          | tests Vitest (graphe, séquences, objets, logique pure) |
| `npm run typecheck` | TypeScript strict sans émission                        |
| `npm run lint`      | ESLint                                                 |
| `npm run format`    | Prettier                                               |

Navigateurs visés : Chrome et Edge récents (WebGPU), Firefox (repli automatique WebGL 2). Le
backend effectif est affiché sur l'écran d'accueil et dans le panneau de debug.

## Commandes

Les **déplacements** dépendent de la position physique des touches (`event.code`) : ZQSD en
AZERTY, WASD en QWERTY, sans aucun réglage. Les libellés affichés sont ceux de votre clavier
(`navigator.keyboard.getLayoutMap()` quand il existe, sinon estimation affinée à chaque frappe).
Les **raccourcis** mnémotechniques (X, L, K…) sont lus via `event.key`.

| Exploration                | Action                                                      |
| -------------------------- | ----------------------------------------------------------- |
| Z Q S D (AZERTY) / W A S D | se déplacer                                                 |
| Maj                        | marche rapide                                               |
| C                          | s'accroupir                                                 |
| E                          | interagir (interrupteur, lampe, radio, ventilateur, établi) |
| Tab                        | inventaire                                                  |
| Échap                      | pause (Reprendre, Réglages, Commandes, Accueil)             |
| ² (touche sous Échap)      | panneau de debug (lil-gui)                                  |

| Inspection                        | Action                                                    |
| --------------------------------- | --------------------------------------------------------- |
| clic gauche + glisser             | orbite                                                    |
| clic droit (ou molette) + glisser | panoramique                                               |
| molette                           | zoom vers le point sous le curseur                        |
| clic                              | sélection (en mode **Libre** : retire / remonte la pièce) |
| double-clic                       | centrer sur la pièce                                      |
| Espace ou → / ←                   | étape suivante / précédente (remontage)                   |
| X                                 | vue éclatée (ou curseur 0 → 100 %)                        |
| L                                 | étiquettes à traits de rappel                             |
| K                                 | vue rangée (knolling)                                     |
| C                                 | plan de coupe                                             |
| F / R                             | cadrer la sélection / vue initiale                        |
| I / H / Maj+H                     | isoler / masquer / tout afficher                          |
| F6                                | donner le focus clavier aux panneaux                      |
| Tab / Échap                       | inventaire / retour à l'exploration                       |

## Architecture

```
src/
  core/        Engine (WebGPURenderer, profondeur inversée, repli WebGL2), App (composition +
               machine à états), EventBus typé, store Zustand, réglages, Input, Physics (Rapier),
               profils de qualité, découpage du travail en tranches, chargeurs d'assets optionnels
  world/       layout.ts (plan de la salle, source unique), salle, établi, éclairage chaud/froid,
               atmosphère (brume, faisceaux, poussière, pluie sur la vitre), props/ (accessoires)
  player/      contrôleur première personne (capsule cinématique), pas, interactions
  inspection/  graph.ts (dépendances, tri A → Z, remontage), Assembly (construction et poses),
               motions (11 types de mouvements), Sequencer (pas à pas / libre), explode, knolling,
               detail (niveau de détail), camera/, selection/ (three-mesh-bvh), view/ (rayons X,
               coupe, éclairage studio), labels/, thumbnails/, tools/ (outils 3D animés)
  objects/     types.ts (contrat), registre auto-découvert, validation, bldc-inrunner/, uno-board/,
               _exemple-boitier/
  materials/   bibliothèque PBR en TSL (usure, clearcoat, anisotropie, transmission, sheen)
  textures/    service + worker de textures procédurales (drawlist, channels, bruits…)
  render/      post-traitement TSL (GTAO, bloom, DOF, contours, AgX, étalonnage, grain, SMAA)
  audio/       moteur Web Audio, sons et boucles synthétisés
  ui/          React : accueil, chargement, HUD, inventaire, inspection, réglages, debug
  dev/         bancs de mise au point (?preview=, ?materials=1, ?tools=1)
tests/         Vitest
```

**Principes**

- **Moteur 3D en three.js pur** (`three/webgpu` + TSL), sans React Three Fiber. Aucun
  `ShaderMaterial` GLSL : tous les matériaux et effets sont des `NodeMaterial` écrits en TSL.
- **UI découplée** : l'état durable vit dans un store Zustand « vanilla » (lu par React et par le
  moteur) ; les commandes et notifications ponctuelles passent par un bus d'événements typé
  (`core/events.ts`). L'interface n'agit jamais directement sur la 3D.
- **Machine à états** (`core/phases.ts`) :
  `loading → home → exploration ⇄ inventory → transition → inspection → transition → exploration`,
  avec `paused` depuis l'exploration.
- **Profondeur inversée** : la plage near/far suit en continu la distance de la surface visée,
  ce qui supprime le scintillement de profondeur du macro (quelques mm) jusqu'à la vue d'ensemble.
  En WebGL 2, elle exige `EXT_clip_control` ; sinon la plage est bornée (compromis documenté dans
  la caméra d'inspection).
- **Pas de gel d'affichage** : textures générées dans des workers, construction des objets
  découpée en tranches de ~8 ms, niveau de détail fin construit à l'approche pendant les temps morts.
- **Qualité** Bas / Moyen / Élevé / Ultra (`core/quality.ts`) et résolution dynamique optionnelle,
  appliquées à chaud.

## Modèle de données d'un objet

Un objet est un `ObjectDef` (voir `src/objects/types.ts`, entièrement commenté) :

- `id`, `name`, `category`, `difficulty`, `estimatedMinutes`, `description` : la fiche d'inventaire ;
- `paramSchema`, `defaultParams`, `presets` : paramètres (ex. format, KV, variantes) ;
- `parts` : liste de `PartDef` (ou fonction des paramètres) ;
- `steps` : étapes A → Z (`StepDef`) ;
- `prepare` (optionnel, asynchrone) : calculs lourds, textures, chargement d'assets ;
- `materials`, `tools` (optionnels) : matériaux TSL et outils propres à l'objet.

Une `PartDef` décrit une pièce ou un sous-ensemble :

```ts
{
  id: 'rotor.shaft',             // identifiant unique
  name: 'Arbre',                 // nom affiché
  parent: 'rotor',               // sous-ensemble (kind: 'assembly')
  build: (ctx) => Object3D,      // géométrie ; l'origine est le pivot
  info: { role, material, dimensions, reference?, tip?, extra? },
  explode: { direction, distance, stage? },           // repère du parent
  removal: {
    requires: ['circlip', '#fixation'],               // pièces ou tags à retirer avant
    tool: 'arbor-press',                              // src/inspection/tools/ids.ts
    motion: 'pressOut',  // translate | unscrew | magneticPull | desolder | pressOut | unwind
                         // | unclip | lift | spread | peel | cut
    axis: [1, 0, 0], distance: 0.04, turns?, pitch?, duration?, destructive?,
  },
  quantity?, detail?, knolling?, label?, enabled?(params),
}
```

**Dépendances.** `requires` liste les pièces qui bloquent la pièce. En plus, une pièce d'un
sous-ensemble retirable exige que ce sous-ensemble soit retiré d'abord, sauf `inPlace: true`.
Retrait autorisé ⇔ tous les bloqueurs sont retirés ; remontage autorisé ⇔ les bloqueurs sont
encore retirés et tout ce que la pièce bloque est déjà remonté. Le démontage libre et le pas à pas
partagent le même état.

**Ordre A → Z.** C'est un tri topologique des étapes (une étape en précède une autre si l'une de
ses pièces bloque une pièce de l'autre), départagé par `priority` puis par l'ordre de déclaration.
Les pièces retirables sans étape reçoivent une étape générée. Dans une étape, les pièces s'animent
par couches topologiques.

**Validation.** En développement, chaque objet est validé au démarrage, pour les paramètres par
défaut et chaque préréglage. Sont vérifiés : identifiants uniques, parents et dépendances
existants, absence de cycle, fiches complètes, axes non nuls et outils connus. Les erreurs
s'affichent dans la console et dans un message à l'écran. `tests/objects.test.ts` applique les
mêmes règles à **tous** les objets, simule le démontage complet puis le remontage complet, et
construit chaque pièce sous Node.

## Ajouter un objet

1. Créer un dossier `src/objects/mon-objet/` avec un `index.ts` qui exporte par défaut un
   `ObjectDef`. Le registre le découvre automatiquement (`import.meta.glob`) : aucune modification
   du moteur.
2. Préfixer les clés de textures de l'objet par `mon-objet/`. Les matériaux déclarés dans
   `materials` sont enregistrés sous `mon-objet/<clé>`. Tout est libéré au changement d'objet.
3. Vérifier avec `npm test` puis visuellement avec `?preview=mon-objet` (banc sans le moteur
   d'inspection) et `?inspect=mon-objet`.

Exemple minimal complet — une boîte à couvercle vissé :

```ts
// src/objects/boite/index.ts
import * as THREE from 'three/webgpu';
import type { BuildContext, ObjectDef, PartDef } from '../types';

type P = { vis: number };

const boite = (ctx: BuildContext<P>) =>
  new THREE.Mesh(
    ctx.geometry.get('boite', () => new THREE.BoxGeometry(0.08, 0.03, 0.06)),
    ctx.materials.get('plastic.black'),
  );

const couvercle = (ctx: BuildContext<P>) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.004, 0.06), ctx.materials.get('alu.anodized.blue'));
  m.position.y = 0.032; // posé sur la boîte (l'objet repose sur y = 0)
  return m;
};

const vis = (ctx: BuildContext<P>) => {
  const n = ctx.params.vis;
  const mesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.002, 0.002, 0.01),
    ctx.materials.get('steel.zinc'),
    n,
  );
  for (let i = 0; i < n; i++) {
    mesh.setMatrixAt(
      i,
      new THREE.Matrix4().makeTranslation(i % 2 ? 0.035 : -0.035, 0.034, i < 2 ? 0.025 : -0.025),
    );
  }
  return { object: mesh, instanced: mesh, instanceLabel: (i: number) => `Vis n° ${i + 1}` };
};

const info = (role: string, material: string, dimensions: string) => ({ role, material, dimensions });

const parts: PartDef<P>[] = [
  {
    id: 'boite',
    name: 'Boîte',
    build: boite,
    info: info('Enveloppe', 'ABS', '80 × 30 × 60 mm'),
    explode: { direction: [0, 0, 0], distance: 0 },
  },
  {
    id: 'vis',
    name: 'Vis',
    build: vis,
    quantity: (p) => p.vis,
    info: info('Fixation', 'Acier zingué', 'M2 × 10'),
    explode: { direction: [0, 1, 0], distance: 0.04 },
    removal: {
      motion: 'unscrew',
      axis: [0, 1, 0],
      distance: 0.012,
      turns: 6,
      pitch: 0.0004,
      tool: 'screwdriver-phillips',
    },
  },
  {
    id: 'couvercle',
    name: 'Couvercle',
    build: couvercle,
    info: info('Fermeture', 'Aluminium', '80 × 4 × 60 mm'),
    explode: { direction: [0, 1, 0], distance: 0.02 },
    removal: { requires: ['vis'], motion: 'translate', axis: [0, 1, 0], distance: 0.03 },
  },
];

const def: ObjectDef<P> = {
  id: 'boite',
  name: 'Boîte vissée',
  category: 'Exemples',
  difficulty: 1,
  estimatedMinutes: 2,
  description: 'Une boîte fermée par un couvercle vissé.',
  paramSchema: [{ key: 'vis', label: 'Nombre de vis', kind: 'number', min: 2, max: 4, step: 2 }],
  defaultParams: { vis: 4 },
  parts,
  steps: [
    {
      id: 'ouvrir',
      title: 'Ouvrir la boîte',
      description: 'Dévisser les vis puis soulever le couvercle.',
      parts: ['vis', 'couvercle'],
    },
  ],
};
export default def;
```

Un exemple plus riche et commenté se trouve dans `src/objects/_exemple-boitier/`. Il montre des
matériaux et textures propres, des variantes, des préréglages, des instances, les hooks de
déformation et la plupart des mouvements. Les dossiers préfixés par « _ » sont des objets de
développement, visibles dans l'inventaire uniquement avec `?devobjects=1`.

**Assets externes (optionnel).** Le pipeline accepte des modèles glTF (Draco ou Meshopt) et des
textures KTX2 : `getAssetLoaders()` (`src/core/assets.ts`) dans le `prepare()` de l'objet, résultat
rangé dans `ctx.shared` puis cloné dans `build()`. Les décodeurs sont servis sous `/decoders/`.

## Les objets

**Moteur brushless inrunner** (`bldc-inrunner`) : préréglages 2848 / 3650 / 3660, KV 3000 à
6000, combinaisons encoches/pôles 12/4, 12/2, 9/6, capteurs Hall optionnels, sorties par languettes
ou fils silicone. Le KV pilote le bobinage visible : un KV élevé donne moins de spires d'un fil plus
gros, et le nombre de spires est expliqué dans la fiche du bobinage. Tôles en quantité réelle,
instanciées. Démontage en 14 étapes jusqu'aux billes des roulements et aux tôles individuelles
(dévissage au pas du filet, extraction du rotor contre l'attraction magnétique, presse, débobinage).

**Carte type Uno R3** (`uno-board`) : FR4 2 couches 68,6 × 53,4 mm, vernis sarcelle, sérigraphie
générique, routage deux couches plausible calculé puis enregistré (`pcb/routing.data.ts`). Tous
les composants sont modélisés avec ménisques de soudure et marquages lisibles au zoom. Trois
niveaux de démontage : composants, puis couches du circuit nu, puis intérieur de composants clés
(ATmega328P décapsulé, quartz, électrolytique déroulé, bouton, USB-B). Après toute modification de
l'implantation, regénérer le routage :
`UNO_ROUTING_UPDATE=1 npx vitest run tests/uno-board.test.ts`.

## Paramètres d'URL de développement

| Paramètre                                                                                                | Effet                                                 |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `?backend=webgl`                                                                                         | force le repli WebGL 2                                |
| `?quality=low\|medium\|high\|ultra`                                                                      | profil graphique                                      |
| `?skip=home`                                                                                             | exploration directe                                   |
| `?inspect=<objet>`                                                                                       | ouvre directement l'inspection                        |
| `?explode=0.5&steps=3&knolling=1&labels=1&xray=1&section=x,0.5&neutral=1&select=<pièce>&view=dx,dy,dz,d` | état initial de l'inspection                          |
| `?animspeed=N`                                                                                           | accélère les animations de démontage                  |
| `?preview=<objet>&explode=1&only=a,b&p.<param>=v`                                                        | banc d'aperçu d'un objet (sans moteur d'inspection)   |
| `?materials=1`, `?tools=1`                                                                               | vitrines des matériaux et des outils                  |
| `?devobjects=1`                                                                                          | objets de développement dans l'inventaire             |
| `?cam=x,y,z,tx,ty,tz&ui=0&time=12`                                                                       | caméra fixe, interface masquée, temps figé (captures) |
| `?debug=1`                                                                                               | panneau de debug ouvert                               |

## Limites connues

- **Performances non mesurées sur GPU réel.** La cible de 60 i/s en 1080p Élevé (RTX 3060 /
  RX 6600) et le chargement < 5 s n'ont pas pu être mesurés : le développement s'est fait sur un
  rendu logiciel (SwiftShader, < 1 i/s). Le code est conçu pour ce budget : instanciation, géométrie
  statique fusionnée, ombres limitées à 2–3 lumières, textures en workers. Il reste à le valider sur
  une vraie carte (panneau ², résolution dynamique).
- **Approximations physiques et visuelles.** Elles sont signalées dans le code par des commentaires
  « Approximation : … » : brume analytique, réfraction simplifiée des gouttes, routage de la carte
  plausible mais non électriquement vérifié, codes de date fictifs, etc.
- **Plan de coupe.** Les sections sont remplies par rendu des faces arrière (couleur unie), pas par
  un calcul exact des surfaces coupées.
- **Mémoire au changement d'objet.** Chaque objet libère ses géométries, matériaux et textures
  (`dispose`). La revue d'intégration a corrigé plusieurs rétentions (sélection, maillages temporaires,
  arbre d'objets). Une rétention résiduelle de quelques géométries après de nombreuses ouvertures et
  fermetures successives était encore en cours d'analyse ; son origine n'est pas établie (cache du
  moteur de rendu three.js possible).
- **Sons synthétisés.** Ce sont des modèles phénoménologiques, pas des enregistrements.
