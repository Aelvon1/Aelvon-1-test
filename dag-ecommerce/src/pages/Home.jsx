import Anatomie from '../components/home/Anatomie';
import AtelierInvitation from '../components/home/AtelierInvitation';
import Cloture from '../components/home/Cloture';
import Engagements from '../components/home/Engagements';
import Manifeste from '../components/home/Manifeste';
import Ouverture from '../components/home/Ouverture';
import Ruban from '../components/home/Ruban';
import Selection from '../components/home/Selection';
import { usePageMeta } from '../hooks';

/** Accueil : faire aimer la maison en quelques secondes, puis conduire à la collection ou à l'Atelier. */
export default function Home() {
  // sans titre : la page d'accueil garde celui du site (« DAG — La ceinture, en mieux. »)
  usePageMeta({
    description:
      'DAG, maison de ceintures. Cuir pleine fleur, boucles en acier, finitions nettes. Découvrez la collection ou composez la vôtre à l’Atelier.',
  });

  return (
    <>
      <Ouverture />
      <Ruban />
      <Manifeste />
      <Anatomie />
      <Selection />
      <AtelierInvitation />
      <Engagements />
      <Cloture />
    </>
  );
}
