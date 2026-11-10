# Note de l'IA CronGuard — 5.0/10

> Validation : ⏳ à valider — relire la note et les 5 pires cas, puis `npx tsx eval/score.ts --validate`

Mesuré le 2026-11-08 · modèle `llama3.2:3b` · 3 run(s) · jeu `public4` · notation automatique (`eval/rubric.ts`).

| | Note /10 |
|---|---|
| **Globale** | **5.0** (IC95 4.6 à 5.4, runs 4.8 · 4.8 · 5.4) |
| Pannes couvertes par une correction connue (5 cas) | 8.8 |
| Pannes **non** couvertes (12 cas) — le vrai test du modèle | 3.4 |
| Jeu labo (réglage) / public (sourcé, vu avant le gel) | — / — |
| Jeu public2 (collecté après le gel des fiches, puis lu : devenu réglage) | — |
| Jeu public3 (test du 2026-11-08 avant les leviers contexte / commande) | — |
| **Jeu public4 — TEST hors échantillon des leviers contexte / commande** | **5.0** |

| Critère (poids) | Taux |
|---|---|
| Cause = le mécanisme (4) | 37 % |
| Action juste et sûre (3) | 45 % |
| Catégorie (1) | 67 % |
| Rien d'inventé (1) | 88 % |
| Preuve liée (1) | 67 % |

Latence médiane 12.4 s · réponses parsables 96 %.

## A/B : LLM_CONTEXT=off

| | A (actuel) | B |
|---|---|---|
| Note | 5.0 | 4.6 |
| Couvertes / non couvertes | 8.8 / 3.4 | 8.8 / 2.8 |
| Cause = mécanisme | 37 % | 29 % |

Différence B − A : **-0.4** (IC95 -1.2 à 0.4)

## Par cas (pires d'abord, bras A)

| Cas | Jeu | Couvert | Note | Ce qui manque | Cause donnée |
|---|---|---|---|---|---|
| p4-crontab-backquote | public4 | non | 1.0 | cause : symptôme ou mauvaise cause ; action hors sujet | can't install |
| p4-python-version-cron | public4 | non | 2.0 | cause : symptôme ou mauvaise cause ; action hors sujet | syntax error |
| p4-shebang-hidden-chars | public4 | non | 2.0 | cause : symptôme ou mauvaise cause ; action hors sujet | élément introuvable (fichier non trouvé) |
| p4-git-ssh-agent | public4 | non | 2.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Could not read from remote repository. |
| p4-gsutil-path | public4 | non | 2.0 | cause : symptôme ou mauvaise cause ; action hors sujet | élément introuvable (gsutil: not found) |
| p4-display-xauthority | public4 | non | 2.0 | cause : symptôme ou mauvaise cause ; action hors sujet | could not open display |
| p4-php-relative-require | public4 | non | 3.0 | cause : symptôme ou mauvaise cause ; action hors sujet | require() failed due to missing common.php |
| p4-sh-run-by-python | public4 | non | 3.0 | cause : symptôme ou mauvaise cause ; action hors sujet | SyntaxError: invalid syntax |
| p4-cron-no-user-var | public4 | non | 3.0 | réponse absente ou non parsable ; catégorie code ≠ dependency | — |
| p4-laravel-mail-template | public4 | non | 4.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Undefined variable: errors |
| p4-pgpassword-quotes | public4 | oui | 5.0 | cause : symptôme ou mauvaise cause ; fausse cause sûre d'elle (−1) | PostgreSQL refuse les identifiants du job : mot de passe changé, ~/.pgpass absent pour l'u |
| p4-rsync-process-subst-sh | public4 | non | 8.0 | preuve : ligne décisive non liée ; inventé : script.sh, /bin/bash | La commande utilise une syntaxe bash (source, <( ), [[ ]]) mais elle est exécutée par sh,  |
| p4-java-path | public4 | oui | 9.0 | preuve : ligne décisive non liée | cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/l |
| p4-date-percent | public4 | non | 9.0 | preuve : ligne décisive non liée | La commande contient un % non échappé : dans une crontab, % est un saut de ligne, la comma |
| p4-python3-import | public4 | oui | 10.0 | — | cron lance un autre interpréteur Python que le vôtre (virtualenv non activé, autre version |
| p4-npm-path | public4 | oui | 10.0 | — | cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/l |
| p4-bundle-path-environment | public4 | oui | 10.0 | — | cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/l |
