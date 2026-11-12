# Labo « une journée chez trois clients » — 2026-11-12T19:13

1. Phase saine : 36 exécutions, 0 job(s) en échec, 0 alerte(s). Attendu 0 / 0 → OK
2. Pannes : cause attendue 5/8 (seuil 7) → ÉCHEC ; alertes livrées 7/8

| Job | Attendu | Établi par | Alerte | Cause affichée | Changé |
|---|---|---|---|---|---|
| backup-db | ctx-disk-full | disk-full | oui | Le volume de destination est plein : des fichiers s'accumulent (sauvegardes, logs) faute de rétention. |  |
| sync-invoices | ctx-net-refused | connection-refused | oui | Rien n'écoute sur l'adresse et le port appelés : service arrêté ou redémarré, mauvais port, ou service lié à u |  |
| sitemap | ctx-login-path | ctx-login-path | oui | Votre shell de connexion trouve « sitemapgen » dans /opt/tools/bin, le cron non : son PATH (/usr/local/sbin:/u | /opt/jobs/sitemap.sh modifié depuis la dernière réussite |
| etl-nightly | ctx-env-missing | ctx-env-missing | oui | La variable WAREHOUSE_URL existe dans votre shell de connexion mais pas dans l'environnement du job : le démon | variable WAREHOUSE_URL absente depuis la dernière réussite |
| export-report | ctx-expect | ctx-expect | oui | Le job s'est terminé sans erreur (code 0), mais ce qu'il doit produire n'est pas là : /exports/report.csv : vi |  |
| archive-data | ctx-permission | ctx-permission | oui | « /archive » appartient à root (droits 755) : le job tourne sous app, qui ne peut pas y écrire. |  |
| renew-certs | (rien d'affirmé) | — | oui | Cause non établie (aucune fiche ne correspond) : le job s'arrête sur « certbot: error: unrecognized arguments: | /opt/jobs/renew-certs.sh modifié depuis la dernière réussite |
| cleanup-tmp | ctx-oom | — | non | (aucune analyse) |  |

3. Heartbeat témoin en échec pendant les pannes : non → OK
4. Réparation : 8/8 de retour « ok », 7/8 avis de rétablissement ; tableau de bord : {"ok":9,"failed":0,"late":0,"unknown":0,"total":9}
   - cleanup-tmp : ok=true rétablissement=false
5. Machine ops arrêtée : heartbeat « en retard » oui, alerte livrée après 2.4 min (seuil 5 min)
6. Rapport de pilote : OK (38 analyses en base)

## Lecture (écrite après le run)

Critère 2 **non atteint : 5/8** (seuil 7). Publié tel quel.

- **backup-db** : cause juste (volume plein) mais par la fiche générique, pas par un constat : `pg_dump` dit « No space left »
  sans nommer le fichier, le SDK ne sait pas quel volume mesurer (prévu avant le run, non corrigé).
- **sync-invoices** : cause juste (rien n'écoute) mais par fiche : le message de Python ne contient ni hôte ni port, l'adresse
  est dans le script.
- **cleanup-tmp** : **panne non détectée**. Le noyau a tué le processus Python (mémoire), mais le script se termine par
  `exit 0` : le job « réussit ». Le SDK ne compare le compteur OOM qu'en cas d'échec.
- Défaut du harnais : `pkill -f billing.py` s'est tué lui-même (son propre motif) ; l'API de facturation a quand même été
  arrêtée (la panne a eu lieu).
- Biais rappelé : scénarios écrits par moi en connaissant les détecteurs. Le labo terrain (`eval/FIELD-LAB-PROTOCOL.md`)
  mesure l'adaptation à des pannes tirées au sort.

## Rapport de pilote produit

# CronGuard pilot report — last 1 days

Generated on 2026-11-12 on your own server. Nothing was sent anywhere.
**Contains job names or error text: review before sharing.**

## Activity

| | |
|---|---|
| Monitored jobs that ran | 9 |
| Runs | 102 |
| Failed runs | 35 |
| Diagnosed failures | 38 |

## Was the cause established?

**79 %** of diagnosed failures (30/38) had a cause established without guessing.

| Source | Failures | Share |
|---|---|---|
| Observed on the host by the SDK (fact) | 20 | 53 % |
| Generic CronGuard fix library (may be off-target on new failures) | 10 | 26 % |
| Not established | 8 | 21 % |

## Feedback and fixes

| | |
|---|---|
| Diagnoses marked right by the team (👍) | 0 |
| Diagnoses marked wrong by the team (👎) | 0 |
| Failures without feedback | 38 |
| Fix observed by the SDK at the next success | 7 (18 %) |
| Fix written and confirmed by the team | 0 (0 %) |

## Time to restore

| | |
|---|---|
| Incidents resolved | 7 |
| Median time to restore | 5 min |
| Mean time to restore | 5 min |
| Total downtime | 35 min |

## Jobs with the most failures

| Job | Failures |
|---|---|
| renew-certs | 6 |
| sitemap | 5 |
| backup-db | 5 |
| sync-invoices | 5 |
| etl-nightly | 5 |
| export-report | 5 |
| archive-data | 5 |
| heartbeat | 1 |
| cleanup-tmp | 1 |

## How to read it

- "Established" counts the source that answered; it does not say the answer was right. The 👍/👎 rows do, for the failures the team reviewed.
- The generic library is measured at about 4/10 on failures it has never seen; facts observed on the host and team fixes are the reliable sources.
