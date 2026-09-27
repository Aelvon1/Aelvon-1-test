// Copie de l'exemple minimal du README (section « Ajouter un objet ») : garantit qu'il reste valide.
import * as THREE from 'three/webgpu';
import type { BuildContext, ObjectDef, PartDef } from '../../src/objects/types';

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
