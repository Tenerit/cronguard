# Lecture du script (script-lint) — première mesure (2026-11-13)

Source : issues GitHub « marche à la main, pas sous cron » (`eval/collect-github3.mjs`, 158 issues fermées, avant 2025,
avec bloc de code). Découpe tirée au sort avant lecture (graine 20261116) : 79 entraînement, 79 test.
Étiquettes du test écrites avant le run (`eval/script-lint-labels.json`, commit `eval: script-lint labels…`).

| | Entraînement (réglage) | Test (jamais lu pendant le réglage) |
|---|---|---|
| Issues avec un vrai bloc de script | 12 / 79 | 10 / 79 |
| Cas dont la cause établie se lit dans le script avec nos règles | 1 (docker -ti, #5) | **0** sur 5 étiquetés (5 écartés) |
| Risques signalés | 2 (#5 juste ; #19 chemin relatif, risque réel mais pas la cause) | **0** |
| Fausses alertes | — | **0 / 10** |

Ce que ça dit, sans enjoliver :
- **Aucune fausse alerte** sur des scripts réels jamais vus : la lecture du script ne crie pas au loup.
- **Le rappel n'est pas mesuré** : dans les issues GitHub, la cause se lit rarement dans le script (1 cas sur 22 scripts).
  Les causes y sont surtout ailleurs : droits du fichier, permissions macOS, session utilisateur, données, démon absent.
- L'argument pour cette fonction vient des **labos terrain** : 4 pannes sur 23 s'y lisaient dans le script
  (script sans #! en syntaxe bash, « ~ » entre guillemets, chemins relatifs du script de sauvegarde, dézippage relatif),
  dont 3 sorties avec 0, donc invisibles sans CG_EXPECT. Ces cas ont servi à écrire les règles : ils ne mesurent rien.
  La vraie mesure sera le labo terrain 3 (le SDK envoie maintenant le script).
