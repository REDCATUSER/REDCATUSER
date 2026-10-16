# Vérification de la version 4

- Installation npm depuis le verrou : réussie, Node.js 24 localement (22 en CI).
- 67 tests de logique : réussis, notamment migration de sauvegarde, quatre contacts au sol, pentes et dévers, visibilité des roues, mains, carrière et packs vocaux.
- Chromium : menus, conduite, caméras rigides, Maj / Ctrl, phares, checkpoints, progression des cinq championnats et Audi Quattro ; paramètres sans avancer le chrono, recommencer, résolution, plein écran, volumes séparés, conflits/remappage et import vocal : réussis.
- HTML autonome : réseau désactivé, moteur, musique House, copilote anglais, cockpit, garage, paramètres et sources WAV intégrées : réussis. La politique du Chromium local bloque la navigation file:// ; le contenu HTML exact a été exécuté en mémoire. Cela ne prouve pas la navigation file:// sur cette machine.
- Compilation croisée Linux → Windows x64, installateur NSIS et portable : réussie. Aucun PC Windows disponible pour exécuter ces programmes ici. Les exécutables ne sont pas signés.

## Parcours physiques avec pilote scripté

Le pilote commande seulement accélération, freinage et braquage, à 120 Hz, avec la voiture de départ et les pneus adaptés. Aucun placement aux checkpoints ni téléportation pour ces quatre parcours.

| Spéciale | Durée simulée | Checkpoints | Hors piste | Contacts |
| --- | --- | --- | --- | --- |
| Alpes, Col des Aiguilles | 155,74 s | 9 / 9 | 0 s | 0 |
| Dakar, Porte du désert | 122,58 s | 9 / 9 | 0 s | 0 |
| Roumanie, Transfăgărășan | 125,42 s | 9 / 9 | 0 s | 0 |
| France, Village du Châtaignier | 123,70 s | 9 / 9 | 0 s | 0 |

Ces parcours automatisés ne remplacent pas une appréciation humaine de la conduite. Les autres tests de progression utilisent des placements contrôlés aux checkpoints.

## Limites explicites

Les voitures sont des modèles procéduraux originaux, sans scans ni modèles officiels. La physique reste un modèle au sol, sans simulation complète des sauts/tonneaux. Le moteur utilise un enregistrement réel commun avec des couches synthétiques, pas un enregistrement distinct pour chaque voiture. Le pack AB anglais contient des mots enregistrés ; les annonces complémentaires anglaises et les voix française/allemande sont synthétiques. Les vrais enregistrements français et allemands ne sont pas fournis ; leur import est pris en charge, avec attribution et licence déclarées.
