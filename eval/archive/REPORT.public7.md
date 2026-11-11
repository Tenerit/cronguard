# Note de l'IA CronGuard — 3.8/10

> Validation : ⏳ à valider — relire la note et les 5 pires cas, puis `npx tsx eval/score.ts --validate`

Mesuré le 2026-11-11 · modèle `llama3.2:3b` · 1 run(s) · jeu `public7` · notation automatique (`eval/rubric.ts`).

| | Note /10 |
|---|---|
| **Globale** | **3.8** (IC95 3.8 à 3.8, runs 3.8) |
| Pannes couvertes par une correction connue (6 cas) | 5.0 |
| Pannes **non** couvertes (6 cas) — le vrai test du modèle | 2.5 |
| Jeu labo (réglage) / public (sourcé, vu avant le gel) | — / — |
| Jeu public2 (collecté après le gel des fiches, puis lu : devenu réglage) | — |
| Jeu public3 (lu le 2026-11-08 : devenu réglage) | — |
| Jeu public4 (lu le 2026-11-08 : devenu réglage) | — |
| **Jeu public5 — TEST hors échantillon (collecté après tous les changements)** | **—** |

| Critère (poids) | Taux |
|---|---|
| Cause = le mécanisme (4) | 17 % |
| Action juste et sûre (3) | 25 % |
| Catégorie (1) | 42 % |
| Rien d'inventé (1) | 92 % |
| Preuve liée (1) | 83 % |

Latence médiane 0.0 s · réponses parsables 100 %.

## Par cas (pires d'abord, bras A)

| Cas | Jeu | Couvert | Note | Ce qui manque | Cause donnée |
|---|---|---|---|---|---|
| p7-quartz-job-already-stored | public7 | oui | 1.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Une autre transaction tient un verrou sur les mêmes lignes ou tables trop longtemps (job c |
| p7-crontab-pasted-in-bash | public7 | non | 1.0 | cause : symptôme ou mauvaise cause ; action hors sujet | La commande appelle un script par un chemin relatif : sous cron, le dossier courant est le |
| p7-cron-mail-postfix-domain | public7 | oui | 2.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Rien n'écoute sur l'adresse et le port appelés : service arrêté ou redémarré, mauvais port |
| p7-docker-cron-not-installed | public7 | oui | 2.0 | cause : symptôme ou mauvaise cause ; action hors sujet | cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/l |
| p7-k8s-busybox-no-kubectl | public7 | non | 2.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Cause non établie (aucune fiche ne correspond) : le job s'arrête sur « Pods Statuses:  0 R |
| p7-php-killed-oom | public7 | non | 3.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Cause non établie (aucune fiche ne correspond) : le job s'arrête sur « Killed ». |
| p7-crontab-and-chained-line | public7 | non | 3.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Cause non établie (aucune fiche ne correspond) : le job s'arrête sur « /bin/ash: */5: not  |
| p7-php-relative-backup-dir | public7 | non | 3.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Cause non établie (aucune fiche ne correspond) : le job s'arrête sur « sh: site-backups/CL |
| p7-readonly-fs-errors | public7 | non | 3.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Cause non établie (aucune fiche ne correspond) : le job s'arrête sur « Jun 26 10:07:07 mal |
| p7-node-heap-parallel | public7 | oui | 5.0 | cause : symptôme ou mauvaise cause ; fausse cause sûre d'elle (−1) | Le traitement charge plus de données que la limite de tas Node.js par défaut. |
| p7-conda-activate-bashrc | public7 | oui | 10.0 | — | Le script active un virtualenv par un chemin introuvable sous cron (chemin relatif, PATH r |
| p7-bad-interpreter-not-exec | public7 | oui | 10.0 | — | L'utilisateur qui exécute le cron n'a pas les droits sur ce fichier ou dossier : il appart |
