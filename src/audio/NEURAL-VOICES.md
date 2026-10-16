# Voix françaises et allemandes — version 6

Ces annonces sont de la **synthèse neuronale**, pas des prises de voix humaines enregistrées pour le jeu. Elles remplacent les clips français et allemands eSpeak des anciennes éditions. Le jeu lit des fichiers OGG locaux ; aucune synthèse, modèle ni connexion n’est nécessaire pendant la partie. Les phrases et le traitement sont dans `scripts/generate-neural-voices.py`.

- Français : **SIWIS / Piper, fr_FR-siwis-medium**. Dataset SIWIS French Speech Synthesis Database, https://datashare.is.ed.ac.uk/handle/10283/2353 — CC BY 4.0, https://creativecommons.org/licenses/by/4.0/ . Merci aux contributeurs du corpus SIWIS. Les annonces sont générées depuis des textes originaux, accélérées légèrement, normalisées et converties en OGG. L’audio français est redistribué avec cette attribution et sous CC BY 4.0 par précaution.
- Allemand : **Thorsten Müller / Piper, de_DE-thorsten-medium**. Dataset Thorsten Voice, https://github.com/thorstenMueller/Thorsten-Voice — CC0, https://creativecommons.org/publicdomain/zero/1.0/ . Les annonces originales générées sont mises à disposition sous CC0.

Les fiches exactes des modèles téléchargés sont conservées dans `model-cards/`. La conversion ONNX est distribuée par k2-fsa/sherpa-onnx :

- https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-fr_FR-siwis-medium.tar.bz2
- https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-de_DE-thorsten-medium.tar.bz2

Empreintes SHA-256 des modèles ONNX utilisés :

```text
b015076c2bedcff22fbedd5da6ffb49b7d0abb2e3bdc51e1a7906e0000e411ed  fr_FR-siwis-medium.onnx
2d98b40baac55e4206f64114110a3474807e26440b80d465cd202af1e95be5e0  de_DE-thorsten-medium.onnx
```

Pour reproduire : installer `sherpa-onnx`, `soundfile` et FFmpeg, extraire les deux archives dans un même répertoire, puis lancer `python3 scripts/generate-neural-voices.py --models /chemin/des/modeles`. Les modèles ne sont pas distribués dans le jeu. Les annonces anglaises principales restent les mots humains enregistrés du pack AB, avec leur licence GPL indiquée dans `LICENSE.txt`. Un pack enregistré personnel peut remplacer chaque langue depuis les options.
