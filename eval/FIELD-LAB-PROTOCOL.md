# Labo terrain — protocole fixé AVANT de lire les questions (2026-11-12)

But : savoir si CronGuard s'adapte à des pannes qu'il n'a pas choisies, et non l'inverse.

1. **Pannes tirées au sort**, pas choisies : `eval/field-lab-draw.mjs`, graine 20261112, parmi les 99 questions
   StackExchange derrière `eval/crontab-lines*.json`, moins les 23 déjà vues par les jeux qui ont réglé les fiches.
   On prend les questions dans l'ordre du tirage jusqu'à 12 cas reproduits.
2. **Vérité extérieure** : la cause attendue est celle de la réponse acceptée (sinon la réponse la mieux notée),
   recopiée AVANT de lancer CronGuard. Pas d'identifiant de constat de notre outil.
3. **Exclusions prévues** (et listées avec leur raison) : impossible à reproduire dans un conteneur Linux (Windows,
   macOS, matériel, service tiers payant), pas de réponse, ou réponse qui ne donne pas de cause.
4. **Reproduction fidèle à la question** : crontab, commande et environnement tels que décrits (crontab désordonnée
   comprise), SDK branché comme le ferait l'import (`cg_run`). Je ne regarde pas la liste des détecteurs pour écrire
   le scénario.
5. **Mesures, pour chaque cas** :
   - **Alerte** : CronGuard signale-t-il une panne ? (un job « réussi » qui n'a pas fait son travail compte comme non détecté)
   - **Cause juste** : la cause affichée (ou le constat, ou « changé depuis ») correspond-elle à la réponse acceptée ?
     Jugement par moi selon la réponse recopiée ; les cas litigieux sont notés « partiel ».
   - **Cause fausse affirmée** : CronGuard affirme-t-il une autre cause ? C'est le pire résultat.
6. **Pas de seuil de réussite** : c'est une mesure, pas un examen. Le chiffre est publié tel quel, avec chaque cas.
   Toute correction de l'outil faite après le run est notée et ne compte pas dans ce chiffre.
