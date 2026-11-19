# Kit vidéo ARICI pour Fable 5.2

Joindre tout le dossier `images/` et `polices/` avec le prompt 1. Ajouter si possible 6 à 10 photos originales de `~/arici-photos` (réduites à 2000 px de large).

---

## Prompt 1 : brief principal

Tu es motion designer senior et développeur créatif. Réalise une pub Instagram Reels **sans son** pour l'application mobile de la boulangerie-pâtisserie ARICI.

Une première version a été refusée parce qu'elle faisait « débutant » : animations 2D plates, tout apparaissait de la même façon (fondu et petit rebond), plans trop longs, décor immobile, aucune profondeur. Le niveau attendu est celui d'une pub d'application faite en studio : rythme serré, vraie 3D, transitions raccord, typographie cinétique, lumière et matière.

### Fichiers joints
- `01_flyer_reference.png` : le flyer. C'est la charte à suivre et le modèle exact de la dernière image.
- `02_flyer_source_calques.pdf` : le flyer en PDF, avec les calques séparés et les placements exacts.
- `03_qr_application_officiel.svg` : le QR officiel (il ouvre https://boulangeries-arici.fr/app). Il doit rester scannable.
- `04_capture_app_accueil.png`, `05_capture_app_produits.png`, `06_capture_app_roulette.png` : les vrais écrans de l'app. Les refaire en HTML/CSS, ne jamais agrandir les captures.
- `07_logo_arici_rond.png` : le logo rond noir et blanc. `08_logo_arici_app_noir.png` : l'avatar noir de l'app.
- `09` à `12` : les décors du flyer (épis de blé, feuilles, vagues espresso et cuivre).
- `13_iphone_cadre_flyer.png` : le modèle de téléphone du flyer, à reproduire en 3D.
- `14` et `15` : les logos Apple et Google Play pour les badges.
- `16` à `21` : les vraies photos de produits (croissant, pain au chocolat, baguette tradition, pains spéciaux, tartelettes, éclairs). Les coins du haut sont arrondis : les recadrer ou les masquer. `22` : la texture de la carte « L'offre du moment ».
- `polices/` : Montserrat et Inter.

### Charte (reprendre le flyer exactement)
- Couleurs : fond crème #F7F1E8 (un peu plus clair au centre, #FCF9F4), espresso #2A1A10, noir #0E0D0C, dégradé caramel → cuivre #C8782F → #8B5A2B. La carte « MES POINTS » va en diagonale de #CE8036 à #1B140E. Titres en marron #7C4414 ou #8B5A2B et en noir.
- Typographie : Montserrat 800 à 900 pour les titres, interlettrage −2 à −3 %. Inter pour les petits textes d'interface.
- Décor : logo rond ARICI, épis de blé et feuilles dorés dans les coins, vagues espresso et cuivre en bas.
- Téléphone : le même que sur le flyer (Dynamic Island, cadre titane clair, bords fins).

### Format
- 1080×1920, 30 images par seconde, 15 à 17 s.
- MP4 H.264, yuv420p, CRF 18 ou moins, **sans piste audio**.
- Tout texte important doit éviter les zones cachées par Instagram : 250 px en haut, 350 px en bas, 120 px à droite.
- La dernière image reste parfaitement fixe pendant au moins 1,5 s.

### Méthode technique (obligatoire pour la qualité)
Ne dessine pas les images une par une en Python ou Pillow. Construis la vidéo en HTML, CSS et JS :
- Une page de 1080×1920. Toutes les animations dans une seule timeline GSAP 3.12, en pause.
- Vraie 3D CSS : perspective de 1800 à 2400 px et `transform-style: preserve-3d`.
- Écrans de l'app refaits en HTML/CSS d'après les captures, pour qu'ils restent nets à tous les zooms.
- Rendu image par image avec Playwright (Chromium est déjà installé). Pour chaque image : `timeline.seek(f / 30)`, attendre `document.fonts.ready` et le décodage des images, faire la capture PNG, puis l'envoyer à ffmpeg.
- Flou de mouvement : sur les mouvements rapides, faire la moyenne de 8 à 16 sous-images par image, ou utiliser un flou directionnel SVG. On ne doit jamais voir d'échos.
- Grain très léger (2 à 3 %) et vignettage doux sur tout le film. Le grain ne doit pas bouger sur l'image finale.

### Règles de mouvement (ce qui fait « pro »)
1. **Rythme.** Un temps fort toutes les 0,5 s, comme une grille à 120 bpm, même sans son. Aucun plan de plus de 1,5 s sans nouvelle action. Coupes et impacts calés sur cette grille.
2. **Courbes.** Jamais de mouvement linéaire. Entrées en expo-out (`cubic-bezier(0.16, 1, 0.3, 1)`), sorties en expo-in, ressort ou dépassement sur les impacts, accélérations et ralentis sur les grands mouvements.
3. **Profondeur.** Toujours au moins trois plans : un premier plan flou (épis, feuilles, farine), le sujet net, un fond en parallaxe. La caméra dérive en continu (léger rapprochement, légère rotation). Les ombres suivent la rotation du téléphone, et un reflet glisse sur la vitre quand il tourne.
4. **Transitions raccord** plutôt que des fondus. Le logo rond devient l'avatar de l'app ou le moyeu de la roue. La carte « LA ROUE DU JOUR » grandit jusqu'à remplir l'écran. On plonge dans l'écran du téléphone. On utilise des balayages de formes caramel et espresso, et des panoramiques rapides avec flou directionnel.
5. **Typographie cinétique.** Deux à cinq mots par écran, très gros (110 à 160 px), révélés par un masque (les lettres montent derrière une ligne). Le mot-clé est en dégradé caramel, avec un reflet qui passe. Le texte joue avec les objets : le téléphone passe devant ou derrière.
6. **Une seule chose importante à la fois.** L'œil sait toujours où regarder.
7. **À éviter :** le même fondu partout, tous les éléments qui apparaissent de la même façon, un écran vide, du texte qui se chevauche, une image pixelisée, un décor qui ne bouge jamais.

### Découpage (environ 16 s)

**0,0 – 1,8 s : accroche**
- Fond espresso. Une traînée de lumière caramel traverse l'écran en diagonale, avec une éruption de farine et de particules dorées.
- Le logo rond ARICI arrive en tournant en 3D (rotation Y de 540° à 0°) et se pose avec une onde de choc.
- Le fond s'ouvre en crème par un masque circulaire qui part du logo. Les épis de blé poussent dans les coins, les feuilles passent au premier plan, floues.
- Texte : « Tout l'univers » / « ARICI » (énorme, en dégradé caramel, avec reflet) / « dans votre poche. ». Le mot « poche » glisse et devient le téléphone, qui tombe dans le cadre.

**1,8 – 4,6 s : produits**
- Le téléphone arrive incliné en 3D (rotation X 18°, rotation Y −22°) puis se redresse. L'écran « Produits » défile vite, avec accélération, ralenti et rebond.
- Trois produits (croissant, pain au chocolat, baguette tradition) jaillissent de l'écran vers la caméra, en vraie profondeur (translation Z). Un par temps fort, avec ombre, flou de profondeur, miettes et farine. Ils se placent en éventail, jamais en rangée.
- Texte : « Retrouvez » / « tous nos produits », révélé mot par mot sur les temps forts.

**4,6 – 5,2 s : transition**
- La caméra plonge dans l'écran et ressort sur l'Accueil, centrée sur la carte « LA ROUE DU JOUR ».

**5,2 – 8,8 s : roulette**
- La carte grandit jusqu'au plein écran sombre. Un doigt, ou un indicateur de toucher élégant, appuie sur « Jouer » : onde, et le bouton s'enfonce.
- La roue reprend exactement les cases de la capture : 20 points, Perdu, 50 points, Un café, 10 points, Perdu, 100 points, Viennoiserie. Elle accélère très fort et tourne avec un vrai flou de rotation. Des ampoules clignotent en chenillard autour, et le pointeur claque à chaque case.
- La caméra se rapproche lentement pendant que la roue ralentit. La roue s'arrête avec un rebond sur « 50 points » : flash doré, rayons, confettis aux couleurs ARICI, légère secousse.
- Texte : « Tentez votre chance » / « chaque jour ».

**8,8 – 11,2 s : points**
- Le « +50 » se transforme en pièces et étincelles qui volent en arc jusqu'à la carte « MES POINTS ».
- Compteur à rouleaux, où chaque chiffre roule : 174 → 224. La barre se remplit avec un reflet. « Encore 26 pts : croissant » devient « Croissant débloqué ! », avec une pulsation lumineuse.
- Texte : « Gagnez des points ».

**11,2 – 13,6 s : en profiter**
- La carte pivote en 3D et révèle la récompense : la photo du croissant sort de la carte, ou un cadeau s'ouvre.
- Le téléphone pivote vers la caméra et montre l'écran « Mon QR » comme en caisse : faisceau de scan, coche, petit flash.
- Texte : « … et profitez-en ! »

**13,6 – 16,0 s : image finale (identique au flyer)**
- Tout sort en balayage. Le téléphone arrive en glissant avec une rotation 3D (rotation Y de 300° à 0°) et se pose exactement comme sur le flyer : à droite, sur l'écran d'Accueil. Cet écran montre : Bonjour Camille, Bron, « MES POINTS 174 pts », « Encore 26 pts : croissant », Mon QR, quatre icônes rondes, « LA ROUE DU JOUR », et « L'OFFRE DU MOMENT – La formule petit-déjeuner ».
- Autour, les éléments du flyer se placent un par un sur les temps forts : le logo rond en haut, « Découvrez notre » / « Application », le trait, « Tout l'univers ARICI dans votre poche. », « Scannez pour télécharger » avec le QR officiel, les badges App Store et Google Play, et en dessous « Installez-la dès maintenant ».
- Les décors des quatre coins comme sur le flyer.
- Tout est en place à 15,9 s, puis l'image reste fixe jusqu'à la fin.

### Contenus et interdits
- Textes exacts ci-dessus, avec les accents et les apostrophes typographiques (’).
- Données de l'app : reprendre exactement les captures (points des produits, cases de la roue).
- Aucun prix, aucun numéro de téléphone, aucune promesse inventée. Ne pas écrire « cuit sur place ».
- Pas de petits surtitres décoratifs, pas de pastilles décoratives, pas de barre de couleur à gauche, pas de rangée de cartes identiques.
- Uniquement les photos fournies, aucune image générée par IA. Réduire les originaux à 2000 px au maximum.

### Vérification avant de me rendre la vidéo
1. Extraire une planche contact avec une image toutes les 0,25 s, et la regarder en entier. Il ne doit y avoir ni écran vide, ni écho de flou, ni texte coupé ou caché, et chaque image doit avoir un point d'attention clair.
2. Vérifier les zones cachées d'Instagram sur chaque plan qui contient du texte.
3. Vérifier que la roue tourne vraiment (8 images à la suite) et que le compteur roule.
4. Mettre la dernière image et le flyer côte à côte, et vérifier que le QR se scanne.
5. Vérifier le format : 1080×1920, 30 images par seconde, la durée, l'absence de piste audio, et une image finale fixe d'au moins 1,5 s.

À me rendre : le MP4, la planche contact, la comparaison avec le flyer, et la liste des écarts s'il y en a.

---

## Prompt 2 : relecture et correction (après le premier rendu)

Regarde ta planche contact image par image comme un directeur artistique exigeant. Relève les 10 moments les plus faibles : plats, lents, vides, confus, sans profondeur, transitions banales, texte peu lisible, mouvement linéaire. Pour chacun, donne une correction concrète : courbe, durée, transition raccord, plan de profondeur, particules ou lumière. Applique toutes les corrections, refais le rendu, puis renvoie la nouvelle planche et la vidéo.

---

## Prompt 3 : si c'est encore trop sage

Rends la vidéo plus nerveuse :
- Raccourcis chaque plan de 20 %.
- Sur chaque temps fort important, ajoute un impact : rapprochement de 4 à 6 %, secousse de 6 à 10 px et flash doré bref.
- Mets une transition raccord entre chaque scène.
- Augmente l'amplitude 3D du téléphone (rotations jusqu'à ±25°).
- Ajoute des particules de farine et des éclats dorés en premier plan sur les moments forts.

Ne touche pas à l'image finale : elle doit rester identique au flyer et fixe pendant au moins 1,5 s.
