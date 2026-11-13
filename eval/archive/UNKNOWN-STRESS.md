# Banc « inconnu » — résultat (2026-11-13)

Protocole : `eval/UNKNOWN-STRESS-PROTOCOL.md` (gelé au commit `cceea4f`, avant le run). Analyse sans modèle sur des issues
GitHub entières (corps + commentaires) : logs d'autres écosystèmes, code incomplet, JSON, chinois, prose.

| Jeu | Textes | Plantages | > 200 ms | Déclenchements | Faux |
|---|---|---|---|---|---|
| Moitiés entraînement github 1-3 (chasse aux défauts) | 259 | 0 | 0 | 35 | 4 motifs trop lâches corrigés |
| Moitiés test github2/3, avant correctifs | 139 | 0 | 0 | 18 | **6 (33 %)** |
| **github4, neuf, gelé avant lecture** | 120 | **0** | **0** | 7 | **1 (14 %)** |

Faux sur github4 : « [Errno 110] Operation timed out » d'un périphérique USB pris pour un timeout réseau. Non corrigé sur
ce jeu (il mesure).

Ce que ça dit :
- Face à du texte jamais vu, l'analyse ne plante pas et reste rapide.
- Les fausses causes venaient surtout de fiches **génériques** qui affirment une seule cause là où le message en a plusieurs
  (module Python manquant : environnement OU versions OU Python trop récent ; socket refusé : réseau OU session locale).
  Les découper a fait passer les fausses causes de 33 % à 14 %, mesuré sur un jeu neuf — sur 7 déclenchements seulement :
  l'écart est encourageant, pas établi.
- La couverture sur ce jeu est faible (7/120) : la plupart des issues n'ont pas de log de panne de job.
