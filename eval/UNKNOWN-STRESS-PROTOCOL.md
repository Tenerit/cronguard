# Banc « inconnu » — protocole (2026-11-13), écrit AVANT le run sur github4

Idée du fondateur : confronter l'app à des situations qu'elle n'a jamais vues pour la préparer à l'inconnu.
Outil : `eval/unknown-stress.ts` — l'analyse sans modèle sur des issues GitHub entières (corps + commentaires).

1. Chasse aux défauts sur les moitiés entraînement de github / github2 / github3 : corrigés `EACCES` dans les mots,
   `TimeoutStartSec` seul, « repository password » seul ; ajoutés socket local refusé, module Unix sous Windows.
2. Mesure sur les moitiés test github2/3 (code d'avant contre code d'après) : identique, 18 déclenchements,
   jugés 9 justes, 3 partiels, **6 faux (33 %)**. Ces moitiés ont ensuite servi à corriger les modules Python
   (retirés de Python, sous-modules privés) et PulseAudio : elles ne mesurent plus rien.
3. Mesure honnête : **github4**, 120 issues neuves (`eval/collect-github4.mjs`), gelées avant lecture, lues seulement
   par le banc, une seule fois. Chaque déclenchement est jugé juste / partiel / faux contre la discussion de l'issue.

## Attentes fixées avant
- 0 plantage, aucun texte > 200 ms.
- Fausses causes parmi les déclenchements : **≤ 33 %** (taux mesuré avant ces correctifs). Au-dessus : publié tel quel,
  et les fiches génériques fautives passent en formulation « plusieurs causes possibles ».
