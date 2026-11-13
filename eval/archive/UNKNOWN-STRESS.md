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

## Mesure 2 — piste typée pour l'inconnu : RETIRÉE (2026-11-13)

Constat d'abord (`eval/unknown-gaps.ts`, données d'entraînement) : 584 textes, **776 formes d'erreur inconnues, presque
aucune ne revient** (5 familles, surtout du bruit). L'inconnu est une longue traîne : une fiche par message ne le couvrira jamais.

Essai : lire la STRUCTURE de l'erreur inconnue (type, outil, objet) et l'afficher comme piste typée, en confiance basse.
Attente fixée avant (commit `653599f`) : type juste ≥ 80 %. Mesure sur github4 (jeu neuf) : **3 pistes justes sur 8 (38 %)**.
Fautes : cases cochées d'un modèle d'issue (« cannot find a duplicate »), prose, `'NoneType' has no attribute` pris pour
« introuvable », « name is already in use » (redéclaration PHP) pris pour un verrou. **Piste retirée** comme prévu.
Limite de la mesure : github4 est du texte d'issue (prose comprise), pas de la sortie de job ; à re-tester sur de vraies
sorties de job (labo terrain) avant toute nouvelle tentative — avec un nouveau seuil fixé d'avance, jamais celui-ci assoupli.

Gardé : la fiche « pas de terminal » ne se déclenche plus sur un port série (`/dev/ttyACM0`), vu en écrivant le test.
