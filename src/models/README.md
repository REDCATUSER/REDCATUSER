# Modèles texturés de rallye

Trois carrosseries communautaires de Trigger Rally 0.6.6.1 sont utilisées comme interprétations visuelles de la berline Club, de la RS et de la compacte Integrale. Elles ne constituent pas des reproductions officielles des constructeurs mentionnés dans le jeu.

- Maillages OBJ et MTL : Richard Langridge, Farrer, Iwan Gabovitch, **GPL-2.0-or-later**.
- Textures de carrosserie : Onsemeliot, **GPL-2.0-or-later**.
- Sources et attributions exactes : `source/`, dont `AUTHORS.txt` et `GPL-2.0.txt`.
- Source amont : https://deb.debian.org/debian/pool/main/t/trigger-rally/trigger-rally_0.6.6.1.orig.tar.gz et https://deb.debian.org/debian/pool/main/t/trigger-rally/trigger-rally-data_0.6.6.1-4_all.deb .

`app/vehicle-assets.js` adapte les axes, dimensions et normales, recolore la peinture et applique les déformations d’impact. Les fichiers originaux sont conservés sans modification. Les roues, habitacles et autres carrosseries sont développés dans le projet. Le HTML autonome inclut aussi les originaux dans le bloc JSON `modelSources` encodé en base64. Les modèles et textures GPL restent sous leur licence ; le code indépendant du jeu reste MIT.

Les fichiers `vehicles-data.js` regroupent le texte OBJ des carrosseries et roues ainsi que les PNG originaux en data URL, sans chargement réseau. Les sources complètes sont la référence.

Regénération du fichier embarqué : `node scripts/generate-model-data.mjs`.
