# Vérification version 6

## Conduite et parcours

88 tests de logique réussis avant publication, dont les nouveaux contrôles des frottements sur garde-corps, des chocs frontaux et décentrés, de la stabilité de l’Alpine, de la déformation/réparation des panneaux, de l’archivage des anciens temps et de l’absence de musique dans toute la session de conduite. Les 18 spéciales vérifient la continuité de la chaussée, la position des obstacles, les checkpoints et le contact des roues. Les parcours techniques possèdent plusieurs lacets et des changements de cap opposés supérieurs à 2,2 radians.

Le pilote scripté commande réellement accélération, freinage et direction à 120 Hz, avec la même physique et les mêmes collisions que le jeu, sans placement aux checkpoints. Il adapte sa vitesse à la courbure et utilise les pneus adaptés. Tous les parcours ci-dessous ont validé neuf portes, sans sortie de route ni contact :

| Voiture | Spéciale | Durée simulée | Vitesse maximale |
| --- | --- | --- | --- |
| Club 1600 | Col des Aiguilles | 233,40 s | 91,0 km/h |
| Club 1600 | Porte du désert | 167,64 s | 110,1 km/h |
| Club 1600 | Pine Ridge | 171,86 s | 118,8 km/h |
| Club 1600 | Transfăgărășan | 185,71 s | 108,0 km/h |
| Alpine | Col des Aiguilles | 226,28 s | 91,3 km/h |
| Alpine | Porte du désert | 158,88 s | 111,3 km/h |

Reproduction : `npm run test:driving`, puis `RALLY_DRIVER_CAR=alpine npm run test:driving -- alps-1 dakar-1`. Ce pilote n’est ni un test joueur ni une garantie de temps pour tous les styles de conduite.

## Navigateur et rendu

La suite Chromium a réussi : menu immobile au repos, préparation avant départ, roues et caméras embarquées, paramètres en pause, audio, persistance, victoire dans les cinq championnats, fantôme, manette simulée et arrêt sur dégâts critiques. Les tests de progression utilisent des placements contrôlés, distincts des parcours physiques ci-dessus. Les images de revue peuvent aussi utiliser un placement contrôlé pour examiner le décor et les dégâts ; ces commandes n’existent pas dans le jeu livré.

Les caméras pilote et capot sont vérifiées par des rayons sur les six modèles. Les mains restent attachées au volant et reviennent au levier/volant pendant le passage des rapports. Le menu n’exécute plus de rendu permanent et n’effectue pas de précalcul PMREM au démarrage. Les corps et feuillages sont allégés ; les composants internes détaillés sont visibles uniquement en vue pilote, avec un habitacle simplifié visible de l’extérieur pour les modèles à vitrage transparent.

Budgets mesurés de géométrie visible des voitures, roues comprises, sans le décor : Club 12 172 triangles en poursuite, Alpine 22 080 et Quattro 22 280 ; cockpit 7 852. Un contrôle plafonne chaque vue extérieure à 30 000 triangles. Il ne s’agit pas d’une mesure de FPS sur carte graphique Windows.

Le HTML autonome est contrôlé réseau désactivé et conserve aussi les sources OBJ/MTL/PNG et les enregistrements WAV sous GPL. La politique de Chromium dans cet environnement interdit `file://` : le test exécute le contenu exact en mémoire et le signale. Cela ne constitue pas une navigation locale sur un PC Windows.

## Limites explicites

Trois carrosseries communautaires texturées, trois modèles procéduraux et des arbres avec troncs/branches en 3D et plans de feuillage texturés ; le résultat n’est pas photoréaliste. Les interprétations des voitures ne sont pas des reproductions officielles. La conduite reste un modèle de jeu au sol, sans simulation complète des sauts/tonneaux. Les dégâts déforment les panneaux et fissurent le vitrage ; ils ne simulent pas chaque élément mécanique détachable.

Les voix françaises et allemandes sont de nouvelles synthèses neuronales, **pas des prises de voix humaines**. Les virages/arrivée/surfaces anglais utilisent les enregistrements humains AB ; huit annonces complémentaires restent synthétiques. Les licences et les fiches des modèles sont conservées dans `src/audio/`. L’import de packs enregistrés reste disponible.

La compilation Windows x64 utilise Electron Builder et NSIS sous Linux ; les exécutables sont non signés. Aucun essai d’installation Windows ni test avec une vraie manette n’est possible ici. La validation automatique ne remplace pas un essai matériel sur le PC du joueur.
