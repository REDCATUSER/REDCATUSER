# Rally Horizon 3D

Jeu de rallye arcade en français pour Windows 10/11 x64. Environnements 3D de style low poly : forêt, désert et alpes, avec relief, végétation, rochers, poussière, traces de dérapage et collisions avec le décor.

## Installer et jouer

Télécharger `Rally-Horizon-3D-Installation.exe`, lancer le programme et suivre l’assistant. Le jeu fonctionne hors ligne, avec raccourci et désinstallation Windows. Une version portable `Rally-Horizon-3D-Windows.exe` est aussi disponible, sans installation. Ces programmes ne sont pas signés numériquement ; Windows peut demander une vérification de l’éditeur. Leur lancement effectif sous Windows doit encore être vérifié sur un ordinateur Windows : la compilation a lieu sous Linux.

La version `Rally-Horizon-3D.html` contient également tout le jeu : la télécharger puis l’ouvrir dans Edge ou Chrome, avec accélération graphique et WebGL 2 activés. Aucun serveur ni téléchargement de ressources n’est nécessaire. La disponibilité de l’audio et de la sauvegarde locale dépend des réglages du navigateur.

## Trois caméras

- **1** : poursuite, derrière la voiture, avec suivi amorti.
- **2** : capot.
- **3** : habitacle à la place du conducteur, tableau de bord, volant et mains gantées visibles.
- **C** ou le bouton VUE : changer de caméra.

Le volant et les mains suivent le braquage. La main droite se déplace vers le levier à chaque changement de rapport, automatique ou manuel, puis revient sur le volant. Les bras suivent ce mouvement. Animation stylisée ; pas de simulation complète du corps humain ou de croisement des mains.

## Conduite

Flèches ou ZQSD : accélérer, freiner/reculer et tourner. WASD disponible en boîte automatique. En boîte manuelle, **A** sert à rétrograder : utiliser Q ou la flèche gauche pour tourner à gauche.

- **Espace** : frein à main.
- **M** : boîte automatique / manuelle, six rapports.
- **E / A** : rapport supérieur / inférieur en mode manuel.
- **R** : replacer au dernier checkpoint (+5 secondes en course, gratuit en entraînement).
- **Échap** : pause / reprise. Le jeu se met en pause lorsque la fenêtre perd le focus.

Franchir les 12 portes dans l’ordre et revenir à l’arrivée. Le terrain affecte l’adhérence ; sortir de la piste ralentit la voiture. Les records sont enregistrés localement, séparément de l’ancienne version 2D. L’entraînement n’enregistre pas de record. Réglage « Légère » pour limiter la résolution et désactiver les ombres.

## Son

Le son démarre au clic sur « Prendre le départ ». Volume réglable dans le menu, bouton SON pour couper/rétablir. Moteur quatre cylindres synthétisé à partir d’impulsions de combustion, harmoniques et résonance d’échappement ; régime lié à la vitesse et au rapport, coupure de couple et baisse du régime au passage de vitesse, bruit du gravier, glissement des pneus et sifflement du turbo. Filtrage différent depuis le cockpit. Ce sont des sons procéduraux, pas des enregistrements d’un véhicule réel. Pas de promesse de fidélité acoustique à un modèle de voiture particulier.

## Développement

Node.js 22 ou ultérieur. `npm ci`, puis :

- `npm test` : tests de physique et des trois circuits.
- `npm run build` : compiler les sources de `app/` vers `src/game.js`, Three.js inclus, et générer `dist/Rally-Horizon-3D.html`.
- `npm start` : lancer Electron (environnement graphique nécessaire).
- `npm run dist:win` : créer installateur et portable Windows x64 dans `dist/`.
- `python3 -m http.server 8000 --directory src` : tester localement la version navigateur après compilation.

Sous Linux, si le répertoire utilisateur est en lecture seule, utiliser des caches autorisés : `npm ci --cache /tmp/rally-npm-cache`, puis `XDG_CACHE_HOME=/tmp/rally-cache ELECTRON_CACHE=/tmp/rally-electron-cache ELECTRON_BUILDER_CACHE=/tmp/rally-builder-cache npm run dist:win`.

Les fichiers HTML de distribution sont générés en incorporant `src/style.css` et `src/game.js` dans `src/index.html`. Conserver les notices Three.js lors de la redistribution. Aucun accès réseau n’est requis pendant le jeu.

## Télécharger depuis GitHub

Le workflow `.github/workflows/windows.yml` compile le jeu sur Windows à chaque envoi sur `main`, ou sur lancement manuel dans **Actions → Jeu Windows → Run workflow**. Après une exécution réussie, ouvrir le résultat puis télécharger **Rally-Horizon-3D-Windows** dans **Artifacts** (connexion GitHub nécessaire). Extraire le ZIP, puis lancer l’installateur ou le programme portable. Les fichiers restent disponibles 30 jours ; relancer le workflow pour les régénérer. Aucune GitHub Release publique n’est créée par ce workflow.
