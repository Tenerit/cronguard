# Note de l'IA CronGuard — 3.9/10

> Validation : ⏳ à valider — relire la note et les 5 pires cas, puis `npx tsx eval/score.ts --validate`

Mesuré le 2026-11-10 · modèle `llama3.2:3b` · 2 run(s) · jeu `public6` · notation automatique (`eval/rubric.ts`).

| | Note /10 |
|---|---|
| **Globale** | **3.9** (IC95 3.9 à 3.9, runs 3.9 · 3.9) |
| Pannes couvertes par une correction connue (8 cas) | 5.0 |
| Pannes **non** couvertes (7 cas) — le vrai test du modèle | 2.6 |
| Jeu labo (réglage) / public (sourcé, vu avant le gel) | — / — |
| Jeu public2 (collecté après le gel des fiches, puis lu : devenu réglage) | — |
| Jeu public3 (lu le 2026-11-08 : devenu réglage) | — |
| Jeu public4 (lu le 2026-11-08 : devenu réglage) | — |
| **Jeu public5 — TEST hors échantillon (collecté après tous les changements)** | **—** |

| Critère (poids) | Taux |
|---|---|
| Cause = le mécanisme (4) | 20 % |
| Action juste et sûre (3) | 33 % |
| Catégorie (1) | 40 % |
| Rien d'inventé (1) | 53 % |
| Preuve liée (1) | 80 % |

Latence médiane 0.0 s · réponses parsables 100 %.

## A/B : LLM_DEDUCTION=on

| | A (actuel) | B |
|---|---|---|
| Note | 3.9 | 4.2 |
| Couvertes / non couvertes | 5.0 / 2.6 | 5.0 / 3.4 |
| Cause = mécanisme | 20 % | 20 % |

Différence B − A : **0.4** (IC95 -0.1 à 0.8)

## Par cas (pires d'abord, bras A)

| Cas | Jeu | Couvert | Note | Ce qui manque | Cause donnée |
|---|---|---|---|---|---|
| p6-sysctl-path | public6 | non | 1.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Cause non établie : aucune ligne d'erreur reconnue dans les logs. |
| p6-pgdump-crlf | public6 | oui | 1.0 | cause : symptôme ou mauvaise cause ; action hors sujet | PostgreSQL refuse les identifiants du job : mot de passe changé, ~/.pgpass absent pour l'u |
| p6-php-unlink-cwd | public6 | non | 1.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Cause non établie : aucune ligne d'erreur reconnue dans les logs. |
| p6-date-unquoted-format | public6 | non | 2.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Cause non établie (aucune fiche ne correspond) : le job s'arrête sur « awk -vDate=`date +% |
| p6-sphinx-path | public6 | non | 2.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Cause non établie (aucune fiche ne correspond) : le job s'arrête sur « Sphinx cannot be fo |
| p6-sudo-root-module | public6 | oui | 2.0 | cause : symptôme ou mauvaise cause ; action hors sujet | cron lance un autre interpréteur Python que le vôtre (virtualenv non activé, autre version |
| p6-selenium-firefox-version | public6 | non | 2.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Cause non établie (aucune fiche ne correspond) : le job s'arrête sur « selenium.common.exc |
| p6-mysql-2002-disk-full | public6 | oui | 2.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Le serveur MySQL local est arrêté, ou le client cherche le socket à un autre chemin que ce |
| p6-wget-503-auth | public6 | oui | 3.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Le service appelé est temporairement indisponible (maintenance ou surcharge) : la panne es |
| p6-rvm-gem-path | public6 | non | 5.0 | cause : symptôme ou mauvaise cause ; catégorie unknown ≠ dependency | Cause non établie (aucune fiche ne correspond) : le job s'arrête sur « /Users/sam/deggy/on |
| p6-meteor-fiber | public6 | non | 5.0 | action hors sujet ; catégorie unknown ≠ code | Cause non établie (aucune fiche ne correspond) : le job s'arrête sur « Error: Can't wait w |
| p6-redis-dump-umask | public6 | oui | 6.0 | cause : symptôme ou mauvaise cause | L'utilisateur qui exécute le cron n'a pas les droits sur ce fichier ou dossier : il appart |
| p6-logrotate-create-perms | public6 | oui | 6.0 | cause : symptôme ou mauvaise cause | L'utilisateur qui exécute le cron n'a pas les droits sur ce fichier ou dossier : il appart |
| p6-java-noclassdef-pom | public6 | oui | 10.0 | — | La JVM ne trouve pas une classe : le classpath du job est incomplet sous cron (jars désign |
| p6-rake-bundle-env | public6 | oui | 10.0 | — | cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/l |
