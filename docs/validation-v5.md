# Vérification version 5

## Résultats

`npm test` : **79 réussites, 0 échec**. Le contrôle complet Chromium a réussi pour les menus, les caméras, la progression, les paramètres, les canaux audio, les médailles, les secteurs, les fantômes, les dégâts et la manette simulée.

Le HTML autonome a aussi réussi avec le réseau désactivé : cockpit à 82°, absence de roues extérieures, garage, paramètres en pause, moteur, musique et voix anglaise. La politique du navigateur de cet environnement interdit la navigation `file://` ; le test a exécuté le contenu exact du HTML en mémoire. Ce résultat ne constitue donc pas un essai de navigation `file://` sur Windows.

`npm run dist:win` a produit l’installateur NSIS et le portable Windows x64. La présence du script de préchargement, du jeu et de la nouvelle icône a été vérifiée dans le paquet Electron. Les exécutables restent non signés et n’ont pas été lancés sur Windows dans cet environnement.

## Ajouts vérifiés

Tests de logique : répartition motrice FWD/RWD/AWD, perte de puissance avec dégâts, niveaux d’adversaires fixés pour un championnat, médailles, sauvegarde des secteurs, échantillonnage et validation des fantômes, interpolation des angles, manettes analogiques, anti-répétition des rapports et reprise après pause. Les tests de la version 4 restent présents.

Les contrôles de navigateur couvrent aussi l’aide, le menu 3D, les dégâts après un contact contrôlé, le stockage/rechargement d’un fantôme de test, son affichage et la conduite par manette simulée. La manette simulée ne prouve pas la compatibilité avec un périphérique physique ; la vibration demande un essai matériel. Le champ de vision est vérifié au départ, en plus de l’attache rigide des caméras.

## Parcours physiques

Quatre spéciales ont été terminées par le pilote scripté avec la traction de départ et les pneus adaptés. Ce pilote commande réellement accélération, freinage et braquage à 120 Hz, sans placement aux checkpoints.

| Spéciale | Durée simulée | Portes | Hors piste | Contacts |
| --- | --- | --- | --- | --- |
| Col des Aiguilles | 165,76 s | 9 / 9 | 0 s | 0 |
| Porte du désert | 123,93 s | 9 / 9 | 0 s | 0 |
| Transfăgărășan | 127,32 s | 9 / 9 | 0 s | 0 |
| Village du Châtaignier | 123,74 s | 9 / 9 | 0 s | 0 |

Les tests de progression de carrière utilisent des placements contrôlés. Le fantôme de test est une trajectoire fabriquée uniquement dans le bundle de test pour vérifier le stockage et la lecture ; aucune donnée de test n’est incluse dans le jeu livré.

## Limites

Modèles et paysages procéduraux originaux ; un seul enregistrement moteur de base avec timbres adaptés ; voix française/allemande synthétiques et anglais partiellement enregistré ; physique au sol sans simulation complète des tonneaux/sauts ; absence de multijoueur et de classement en ligne. Les marques et noms servent à identifier les inspirations des voitures, sans affiliation officielle. Aucun essai natif sur PC Windows n’est possible dans cet environnement Linux. La compilation et les tests navigateur ne remplacent pas une campagne de tests joueurs et matériels.
