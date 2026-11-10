# Note de l'IA CronGuard — 4.7/10

> Validation : ⏳ à valider — relire la note et les 5 pires cas, puis `npx tsx eval/score.ts --validate`

Mesuré le 2026-11-10 · modèle `llama3.2:3b` · 3 run(s) · jeu `public5` · notation automatique (`eval/rubric.ts`).

| | Note /10 |
|---|---|
| **Globale** | **4.7** (IC95 4.4 à 5.0, runs 4.8 · 4.4 · 4.8) |
| Pannes couvertes par une correction connue (4 cas) | 8.0 |
| Pannes **non** couvertes (8 cas) — le vrai test du modèle | 3.0 |
| Jeu labo (réglage) / public (sourcé, vu avant le gel) | — / — |
| Jeu public2 (collecté après le gel des fiches, puis lu : devenu réglage) | — |
| Jeu public3 (lu le 2026-11-08 : devenu réglage) | — |
| Jeu public4 (lu le 2026-11-08 : devenu réglage) | — |
| **Jeu public5 — TEST hors échantillon (collecté après tous les changements)** | **4.7** |

| Critère (poids) | Taux |
|---|---|
| Cause = le mécanisme (4) | 31 % |
| Action juste et sûre (3) | 33 % |
| Catégorie (1) | 47 % |
| Rien d'inventé (1) | 83 % |
| Preuve liée (1) | 92 % |

Latence médiane 13.1 s · réponses parsables 100 %.

## A/B : LLM_KNOWLEDGE=off

| | A (actuel) | B |
|---|---|---|
| Note | 4.7 | 1.9 |
| Couvertes / non couvertes | 8.0 / 3.0 | 1.8 / 1.9 |
| Cause = mécanisme | 31 % | 6 % |

Différence B − A : **-2.8** (IC95 -4.0 à -1.7)

## Par cas (pires d'abord, bras A)

| Cas | Jeu | Couvert | Note | Ce qui manque | Cause donnée |
|---|---|---|---|---|---|
| p5-ruby-shebang-127 | public5 | non | 1.0 | cause : symptôme ou mauvaise cause ; action hors sujet | exit code 127, erreur de syntaxe |
| p5-perl-env-login-shell | public5 | non | 1.0 | cause : symptôme ou mauvaise cause ; action hors sujet | mémoire insuffisante |
| p5-cronhourly-crontab-syntax | public5 | non | 1.7 | cause : symptôme ou mauvaise cause ; action hors sujet | commande 'bin' introuvable |
| p5-proxy-env-cron | public5 | oui | 2.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Le service distant ne répond pas dans le délai : indisponible, surchargé, ou pare-feu qui  |
| p5-crontab-percent-expr | public5 | non | 3.0 | cause : symptôme ou mauvaise cause ; action hors sujet | erreur de grand-child du cron |
| p5-php-set-time-limit | public5 | non | 3.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Cause non établie par l'analyse : le job s'arrête sur « [01-Mar-2012 00:32:57 UTC] PHP Fat |
| p5-macos-tcc-trash | public5 | non | 3.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Cause non établie par l'analyse : le job s'arrête sur « PermissionError: [Errno 1] Operati |
| p5-wget-ssl-status5 | public5 | non | 3.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Cause non établie par l'analyse : le job s'arrête sur « grandchild #20349 failed with stat |
| p5-svn-sshpass-noninteractive | public5 | non | 8.7 | cause : symptôme ou mauvaise cause | Cause non établie par l'analyse : le job s'arrête sur « svn: E215004: Authentication faile |
| p5-python-version-import | public5 | oui | 10.0 | — | cron lance un autre interpréteur Python que le vôtre (virtualenv non activé, autre version |
| p5-env-node-bashrc | public5 | oui | 10.0 | — | L'interpréteur indiqué par le shebang (#!) n'existe pas à ce chemin, ou /usr/bin/env ne le |
| p5-unixcat-path | public5 | oui | 10.0 | — | cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/l |
