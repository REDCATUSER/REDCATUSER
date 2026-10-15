# Rally Horizon — First Edition

Jeu de rallye 3D en français, hors ligne, pour Windows 10/11 x64. Cette édition remplace les boucles par des spéciales de point à point et ajoute carrière, garage, copilote et nouveaux véhicules. Les routes et modèles sont des créations procédurales inspirées du rallye ; il ne s’agit pas de reproductions photographiques ou de parcours géographiques exacts.

## Télécharger et installer

Dans GitHub **Actions → Jeu Windows**, ouvrir la dernière exécution réussie puis télécharger l’artefact souhaité (connexion GitHub nécessaire). Extraire le ZIP avant de lancer le programme.

- **Windows-Installation** : assistant d’installation français, raccourci et désinstallation Windows.
- **Windows-Portable** : jeu sans installation.
- **Navigateur-Hors-Ligne** : fichier HTML autonome à ouvrir dans Edge/Chrome avec WebGL 2 et accélération graphique.

Les téléchargements sont conservés 30 jours. Le workflow peut être relancé dans Actions. Les exécutables ne sont pas signés numériquement ; les contrôles Windows peuvent demander de vérifier l’éditeur. La compilation est réalisée sous Linux avec Electron Builder et NSIS. Les fonctionnalités du jeu sont testées dans Chromium ; le démarrage et l’installation sur un PC Windows restent à vérifier sur cette plateforme.

## Modes de jeu

Le menu principal s’affiche avant la course, avec **Championnat**, **Spéciale libre**, **Garage** et **Options**. La progression est sauvegardée sur l’ordinateur, séparément des anciennes éditions.

18 spéciales originales de **3,25 à 3,8 km** sont disponibles : neige des Alpes, sable d’Afrique/Dakar, asphalte français, cols de Monte-Carlo, gravier américain et routes sinueuses dégradées de Roumanie. La durée dépend du pilote et de la voiture ; elles sont dimensionnées pour plusieurs minutes, sans attente artificielle à l’arrivée. Les neuf portes après le départ doivent être franchies dans l’ordre. Les barrières, arbres, maisons et rochers peuvent ralentir la voiture lors d’un contact.

La météo et l’ambiance varient selon la spéciale : neige ou pluie animées, brouillard changeant, poussière, ciel couvert, soleil et une étape nocturne. Les décors comprennent arbres volumétriques avec branches, herbe, bâtiments, rochers et garde-corps.

Les cinq championnats sont **Alpes, Dakar, France, Monte-Carlo et États-Unis**, avec trois spéciales chacun. Six adversaires sont représentés par leurs temps déterministes au classement, sans voitures IA sur la route. Le classement utilise les temps cumulés et pénalités. Chaque championnat remporté débloque le suivant et une voiture :

1. Alpine A110 Rallye.
2. Ford Escort RS Rallye.
3. Lancia Delta Integrale.
4. Toyota Celica GT-Four.
5. **Audi Quattro WRC**, récompense finale.

La voiture initiale est la Horizon Club 1600. Les six silhouettes sont des modèles procéduraux originaux ; elles ne proviennent pas de scans de constructeurs. La Roumanie est accessible en spéciale libre. Une course libre ne supprime pas le championnat en cours ; le menu permet de reprendre la prochaine spéciale non terminée.

## Garage et physique

Choisir une voiture débloquée, la couleur, les pneus (asphalte/gravier/neige/sable), la suspension et l’étagement de boîte. Les réglages influencent réellement la conduite : adhérence, relances, résistance au roulement, débattement et régime moteur. Le modèle utilise des forces de pneus avant/arrière, une inertie de lacet, la charge et le glissement des roues, les bosses et la pente. La neige reste glissante, les pneus neige améliorent la motricité, et le sable oppose davantage de résistance. Il s’agit d’une conduite de jeu évoluée, pas d’une simulation automobile professionnelle.

## Commandes

| Action | Touches |
| --- | --- |
| Accélérer | ↑, Z ou W |
| Freiner / reculer en maintenant à l’arrêt | ↓ ou S |
| Tourner | ← / →, Q / D ou A / D |
| Monter un rapport | **Maj** gauche ou droite |
| Descendre un rapport | **Ctrl gauche** |
| Boîte automatique / manuelle | M, ou Options |
| Frein à main | Espace |
| Phares allumés / éteints | **H** |
| Poursuite / capot / pilote | 1 / 2 / 3, ou C |
| Replacer au dernier checkpoint | R, +5 secondes hors entraînement |
| Pause | Échap |

Les vues pilote et capot sont fixées au châssis dans son repère local, sans interpolation indépendante ni secousses artificielles. Le volant et les mains suivent le braquage ; la main droite rejoint le levier pendant les passages de vitesses et revient ensuite. Les phares utilisent des faisceaux 3D. Le jeu se met en pause lorsque la fenêtre perd le focus.

## Audio et copilote

Une véritable boucle moteur enregistrée, un claquement de boîte et un roulement sur gravier, sous CC0, sont associés à des couches de combustion, admission, turbo, vent et pneus. Le régime et le timbre évoluent avec le rapport et la charge, avec coupure au passage des vitesses. Le cockpit possède un filtrage différent. Un même enregistrement de base sert aux six voitures, enrichi de caractères synthétiques ; ce ne sont pas six enregistrements authentiques de modèles particuliers.

Le copilote dispose de **30 clips français embarqués**, synthétisés dans un style radio : gauche/droite 1 à 6, à fond, épingles, prudence, etc. Les notes de virage sont calculées depuis le tracé et annoncées en avance selon la vitesse ; elles apparaissent aussi à l’écran. Les fichiers audio sont intégrés au jeu et au HTML autonome : aucune voix Windows ou connexion n’est nécessaire. Copilote désactivable et volume réglable dans Options.

Attributions et licences : `THIRD_PARTY_NOTICES.txt` et `src/audio/LICENSE.txt`. Les fichiers d’origine sont conservés dans `src/audio/`.

## Développement et vérification

Node.js 22 ou ultérieur. `npm ci`, puis :

- `npm test` : tests de physique, véhicules, carrière, checkpoints, copilote et 18 spéciales.
- `npm run test:browser` : contrôles d’interface Chromium (navigateur système ou `npx playwright install chromium` ; chemin possible via `RALLY_BROWSER`).
- `npm run build` : compiler `app/` vers `src/game.js` et générer `dist/Rally-Horizon-3D.html` avec code, sons et notices intégrés.
- `npm start` : lancer Electron avec interface graphique.
- `python3 -m http.server 8000 --directory src` : servir la version navigateur compilée.
- `npm run dist:win` : produire installateur et portable Windows x64 dans `dist/`. Le manifeste de désinstallation est généré automatiquement par le hook `afterPack` ; il ne supprime que les fichiers distribués et conserve les fichiers supplémentaires de l’utilisateur.

Sous environnement Linux avec répertoire utilisateur en lecture seule : `npm ci --cache /tmp/rally-npm-cache`, puis `XDG_CACHE_HOME=/tmp/rally-cache ELECTRON_CACHE=/tmp/rally-electron-cache ELECTRON_BUILDER_CACHE=/tmp/rally-builder-cache npm run dist:win`.

Les tests de progression utilisent notamment des placements contrôlés aux checkpoints pour vérifier les états de course. Ils ne remplacent pas le pilotage physique d’une spéciale entière. Les contrôles de navigateur vérifient le rendu, les caméras fixées au véhicule, les touches, le signal audio et la persistance. Réglage graphique **Légère** disponible pour diminuer la résolution et désactiver les ombres.
