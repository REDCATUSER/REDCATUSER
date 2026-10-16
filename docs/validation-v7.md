# Vérification version 7 — Retro Rally

## Logique et conduite

110 tests de logique réussis : transmission R/N/1–6, point mort et moteur libre, changement de sens sécurisé, charges par essieu, surfaces, caméras et mains, carrosseries/cockpits distincts, dégâts, progression, migration de sauvegarde, difficultés, reconnaissance et annonces vocales. Les 18 spéciales vérifient leurs propres tracés, le contact avec la chaussée, la continuité des checkpoints et le dégagement des obstacles. Les tests du public vérifient aussi la texture pixelisée et le déclenchement des flashs au passage.

Le pilote scripté commande accélération, freinage et direction à 120 Hz avec la physique et les collisions du jeu. Il adapte sa vitesse aux courbes, sans replacement aux checkpoints. Les 18 spéciales ont été terminées avec la Club. Ces parcours ciblés ont également été vérifiés :

| Voiture | Spéciale | Durée simulée | Vitesse maximale | Checkpoints |
| --- | --- | --- | --- | --- |
| Club 1600 | Col des Aiguilles | 233,12 s | 90,8 km/h | 9/9 |
| Club 1600 | Porte du désert | 146,01 s | 110,3 km/h | 9/9 |
| Club 1600 | Pine Ridge | 160,32 s | 118,7 km/h | 9/9 |
| Club 1600 | Transfăgărășan | 179,74 s | 117,4 km/h | 9/9 |
| Alpine | Col des Aiguilles | 225,95 s | 91,3 km/h | 9/9 |
| Alpine | Porte du désert | 136,88 s | 111,3 km/h | 9/9 |

Aucune sortie de piste ni collision dans ces essais. Reproduction : `npm run test:driving`, puis `RALLY_DRIVER_CAR=alpine npm run test:driving -- alps-1 dakar-1`. Pour toutes les spéciales, passer leurs identifiants au même script. Il ne s’agit pas d’un essai joueur ni d’une garantie de temps.

## Rendu et parcours de jeu

Les six modèles sont vérifiés par rayons en caméra pilote/capot. Les roues sont masquées dans ces vues ; les mains suivent le volant et rejoignent le levier pendant le changement de rapport. Les six carrosseries utilisent des profils originaux, des arches ouvertes et des pneus facettés ; les six cockpits possèdent des dispositions et cadrans distincts. Les vues extérieures restent sous 30 000 triangles chacune (environ 15–16 k mesurés), sans charger les détails complets du cockpit.

L’interface a été examinée dans Chromium à 1280×820, 960×640 et 390×844, sans débordement horizontal ni erreur JavaScript. Les captures du menu, garage et préparation proviennent du jeu réel. Le menu 3D cesse de rendre lorsqu’il n’y a plus de changement.

Le test navigateur couvre la montée en régime en N sans déplacement, les feux rouge/jaune/vert, les commandes, les caméras rigides, les paramètres en pause, les volumes indépendants, les trois langues/imports, le fantôme, la manette simulée, les dégâts critiques et les cinq championnats. La progression utilise des placements contrôlés aux checkpoints, distincts des essais physiques ci-dessus. Le test Hardcore vérifie l’absence de carte/notes, aucun score ni récompense en reconnaissance, les choix refaire/lancer, la phase après recommencement et la nouvelle reconnaissance lors d’une reprise.

Le HTML autonome a été exécuté avec le réseau désactivé : sons, cockpit, garage et pause fonctionnent sans requête externe. Ici, la politique de Chromium bloque `file://` : le contenu exact est exécuté en mémoire. Cela ne valide pas une navigation locale sur Windows. Les sources audio et anciennes sources de modèles GPL restent intégrées et attribuées.

## Limites

Les modèles restent des interprétations rétro originales et non des reproductions officielles. La physique simule des contacts au sol, sans dynamique complète des sauts/tonneaux. Les temps adversaires sont déterministes, sans voitures IA physiques.

Les voix FR/DE et les notes numérotées/décomptes/réactions anglaises sont neuronales, pas des enregistrements humains. Dix annonces anglaises complémentaires conservent les enregistrements AB. Les 36 clips de chaque langue sont intégrés au jeu ; les modèles vocaux ne sont pas distribués. L’import de packs enregistrés reste disponible.

Windows x64 est compilé sous Linux avec Electron Builder/NSIS. Les exécutables sont non signés. Le démarrage, l’installation/désinstallation sur Windows et une vraie manette restent à vérifier sur ce matériel. Aucun chiffre de FPS Windows n’est revendiqué.
