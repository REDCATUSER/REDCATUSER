# Voitures rétro : silhouettes originales

Les six voitures affichées dans la version 7 sont créées dans le projet. `app/vehicle-assets.js` contient leurs profils de carrosserie ; `app/car.js` construit les surfaces, arches ouvertes, roues, livrées pixelisées et habitacles. Les proportions et équipements varient entre compacte, berlinette, berline deux portes, hatchback, coupé fastback et coupé Groupe B. Chaque voiture possède son propre tableau de bord et un volant animé. Ces interprétations rétro ne sont pas des modèles officiels des constructeurs mentionnés dans le jeu.

Les peintures, numéros, marques fictives, matériaux de l'habitacle et cadrans sont dessinés localement. Aucun modèle distant n'est nécessaire. Ces créations originales et leur code sont sous la licence MIT du projet.

## Archives des anciens modèles communautaires

Les trois carrosseries de Trigger Rally 0.6.6.1 employées dans la version 6 restent archivées dans `source/` ; elles ne sont plus affichées dans le jeu actuel.

- Maillages OBJ et MTL : Richard Langridge, Farrer, Iwan Gabovitch, **GPL-2.0-or-later**.
- Textures de carrosserie : Onsemeliot, **GPL-2.0-or-later**.
- Sources et attributions exactes : `source/`, dont `AUTHORS.txt` et `GPL-2.0.txt`.
- Source amont : https://deb.debian.org/debian/pool/main/t/trigger-rally/trigger-rally_0.6.6.1.orig.tar.gz et https://deb.debian.org/debian/pool/main/t/trigger-rally/trigger-rally-data_0.6.6.1-4_all.deb .

Ces originaux sont conservés sans modification. `vehicles-data.js` en est une ancienne copie embarquée (OBJ et PNG en data URL), non importée par le moteur de la version 7. Le HTML autonome conserve également les originaux dans son bloc JSON `modelSources` en base64. Ces archives et leurs textures restent sous GPL-2.0-or-later ; leur présence ne change pas la licence du code indépendant ni des nouvelles carrosseries originales.

Pour régénérer l'archive embarquée : `node scripts/generate-model-data.mjs`.
