# public8 — protocole (2026-11-13), écrit AVANT le run sur la moitié test

1. Collecte : `eval/collect-public8.mjs`, 60 requêtes figées, premier résultat pertinent avec réponse acceptée et log d'erreur,
   URLs déjà vues exclues (public2-7, corpus, labos terrain). 52 questions.
2. Découpe : `eval/split-public8.mjs`, graine 20261113, sur l'URL : 26 entraînement, 26 test. Gelé au commit `378a083`, avant lecture.
3. Réglage : 5 fiches ajoutées en lisant **uniquement** la moitié entraînement (`eval/train8.ts`) :
   exec-format-error, php-no-input-file, set-e-grep-no-match, script-without-dot-slash, logrotate-postrotate.
   Plus : wget code 1 retiré (régression vue sur public5), prévention des échecs masqués à l'import (`|| mail`, pipe vers gzip).
4. Test : 11 cas gardés sur 26 (`eval/public-cases-8.ts`, règles d'exclusion de public7), étiquettes dans `eval/rubric.ts`,
   écrites d'après la réponse acceptée avant tout run.

## Mesure (une seule fois)
`npm run eval:fiches`, ligne public8 : code d'avant (`98447c1`) contre code d'après, mêmes cas, mêmes étiquettes.

## Attentes fixées avant
- Cause juste (critère « mécanisme ») : gain de **0 à +2 cas** sur 11. Les fiches ajoutées sont génériques ; aucune n'a été écrite pour ces cas.
- Ratés (une fiche répond à côté) : **pas plus qu'avant**. Un raté nouveau est publié, la fiche n'est pas retouchée sur ce jeu.
- Un résultat sous l'attente est publié tel quel.
