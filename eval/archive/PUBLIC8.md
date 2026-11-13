# public8 — résultat (2026-11-13)

Protocole : `eval/PUBLIC8-PROTOCOL.md` (gelé au commit `0d71c0a`, avant le run). Mesure sans modèle (`npm run eval:fiches`).

| public8 test (11 cas jamais lus pendant le réglage) | Avant (`98447c1`) | Après |
|---|---|---|
| Couverts par une fiche | 2/11 | 2/11 |
| Cause juste | 1/11 | 1/11 |
| Ratés (fiche à côté) | 1 (`wget command not found` → « PATH » au lieu de « wget pas installé ») | 1, le même |

**Gain mesuré : 0.** C'est dans l'attente fixée (0 à +2), mais au plancher : les 5 fiches tirées de la moitié entraînement
ne touchent aucun cas de la moitié test. Aucun raté nouveau.

Ce que ça dit :
- Sur des questions neuves, les fiches ne couvrent que **18 %** des pannes (public7 : 58 %). La connaissance écrite à la main
  plafonne : chaque fiche couvre une famille étroite, et les pannes réelles sont très variées.
- Les causes des cas non couverts sont surtout **l'environnement du cron** (venv, PATH, variable PM2_HOME / PERL5LIB, dossier
  courant, affichage) : la réponse vient des sondes du SDK sur la machine du job, pas d'une fiche lue dans un log.
  Ces cas ne se mesurent qu'en labo terrain (vrai cron, vrai SDK).
- Le raté `wget command not found` reste : « commande introuvable » ne distingue pas « hors du PATH » de « pas installée » dans
  un log seul ; la sonde du SDK (`command -v` dans le shell de l'utilisateur) le distingue en vrai.

Non retouché sur ce jeu : le raté est publié, pas corrigé ici (le corriger après coup ferait de public8 un jeu d'entraînement).
