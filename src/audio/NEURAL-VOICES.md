# Voix neuronales — version 7

Les voix françaises et allemandes, les notes anglaises numérotées, le décompte et les réactions aux accidents sont de la **synthèse neuronale**, pas des prises de voix humaines enregistrées pour le jeu. Les fichiers OGG sont embarqués : aucun modèle, service distant ni synthèse ne fonctionne pendant la partie. Les textes originaux sont dans `voice-texts.json` et leur génération dans `scripts/generate-neural-voices.py`.

- Français : **SIWIS / Piper, fr_FR-siwis-medium**. Dataset SIWIS French Speech Synthesis Database, https://datashare.is.ed.ac.uk/handle/10283/2353 — CC BY 4.0, https://creativecommons.org/licenses/by/4.0/ . Merci aux contributeurs du corpus SIWIS. Les annonces générées sont accélérées légèrement, rognées, normalisées et converties en OGG. L’audio français est redistribué avec cette attribution et sous CC BY 4.0 par précaution.
- Allemand : **Thorsten Müller / Piper, de_DE-thorsten-medium**. Dataset Thorsten Voice, https://github.com/thorstenMueller/Thorsten-Voice — CC0, https://creativecommons.org/publicdomain/zero/1.0/ . Les annonces originales générées sont mises à disposition sous CC0.
- Anglais : **LJ Speech / Piper, en_US-ljspeech-medium**. Corpus lu par Linda Johnson, compilé par Keith Ito, modèle entraîné par Bryce Beattie. https://keithito.com/LJ-Speech-Dataset/ ; https://brycebeattie.com/files/tts/ . Le corpus est dans le domaine public selon la fiche du modèle. Les annonces originales générées sont mises à disposition sous CC0. Elles remplacent les anciens compléments eSpeak et les anciennes associations « Hard Left » afin de prononcer réellement « Left 2 ».

Les dix annonces anglaises non numériques restantes sont les enregistrements humains AB de Trigger Rally, par Andrei Bondor, sous GPL-2.0-or-later. Le pack anglais est donc identifié comme **mixte**. L’origine et les sources exactes sont dans `LICENSE.txt`. Des packs personnels enregistrés peuvent remplacer les annonces depuis les options.

Les fiches exactes des trois modèles utilisés sont conservées dans `model-cards/`. La conversion ONNX est distribuée par k2-fsa/sherpa-onnx :

- https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-fr_FR-siwis-medium.tar.bz2
- https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-de_DE-thorsten-medium.tar.bz2
- https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-ljspeech-medium.tar.bz2

Empreintes SHA-256 des modèles ONNX utilisés :

```text
b015076c2bedcff22fbedd5da6ffb49b7d0abb2e3bdc51e1a7906e0000e411ed  fr_FR-siwis-medium.onnx
2d98b40baac55e4206f64114110a3474807e26440b80d465cd202af1e95be5e0  de_DE-thorsten-medium.onnx
8ceba58a4b540d4e7e7e24ad079cf0d92762a4fd334e059f12940787c6c37b3d  en_US-ljspeech-medium.onnx
```

Pour reproduire : installer `sherpa-onnx`, `numpy`, `soundfile` et FFmpeg, extraire les trois archives dans un même répertoire, puis lancer `python3 scripts/generate-neural-voices.py --models /chemin/des/modeles`. Les modèles ne sont pas distribués dans le jeu. Le script conserve les annonces AB non numériques préexistantes, modifie les notes numérotées et génère les nouvelles annonces. Les modèles Lessac et Ryan, examinés mais non retenus, ne sont pas utilisés.
