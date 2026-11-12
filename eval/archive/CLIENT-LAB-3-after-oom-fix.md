# Labo « une journée chez trois clients » — 2026-11-12T19:42

1. Phase saine : 27 exécutions, 0 job(s) en échec, 0 alerte(s). Attendu 0 / 0 → OK
2. Pannes : cause attendue 7/8 (seuil 7) → OK ; alertes livrées 8/8

| Job | Attendu | Établi par | Alerte | Cause affichée | Changé |
|---|---|---|---|---|---|
| backup-db | ctx-disk-full | ctx-disk-full | oui | Le volume de /backups/shop-*.sql est plein : 0 octets libres sur 2,0 Mo (0,0 %), constaté par le SDK au moment |  |
| sync-invoices | ctx-net-refused | connection-refused | oui | Rien n'écoute sur l'adresse et le port appelés : service arrêté ou redémarré, mauvais port, ou service lié à u |  |
| sitemap | ctx-login-path | ctx-login-path | oui | Votre shell de connexion trouve « sitemapgen » dans /opt/tools/bin, le cron non : son PATH (/usr/local/sbin:/u | /opt/jobs/sitemap.sh modifié depuis la dernière réussite |
| etl-nightly | ctx-env-missing | ctx-env-missing | oui | La variable WAREHOUSE_URL existe dans votre shell de connexion mais pas dans l'environnement du job : le démon | variable WAREHOUSE_URL absente depuis la dernière réussite |
| export-report | ctx-expect | ctx-expect | oui | Le job s'est terminé sans erreur (code 0), mais ce qu'il doit produire n'est pas là : /exports/report.csv : vi |  |
| archive-data | ctx-permission | ctx-permission | oui | « /archive » appartient à root (droits 755) : le job tourne sous app, qui ne peut pas y écrire. |  |
| renew-certs | (rien d'affirmé) | — | oui | Cause non établie (aucune fiche ne correspond) : le job s'arrête sur « certbot: error: unrecognized arguments: | /opt/jobs/renew-certs.sh modifié depuis la dernière réussite |
| cleanup-tmp | ctx-oom | ctx-oom | oui | Le noyau a tué un processus du job faute de mémoire (OOM) : compteur oom_kill du cgroup +1 pendant l'exécution |  |

3. Heartbeat témoin en échec pendant les pannes : non → OK
4. Réparation : 8/8 de retour « ok », 8/8 avis de rétablissement ; tableau de bord : {"ok":9,"failed":0,"late":0,"unknown":0,"total":9}
5. Machine ops arrêtée : heartbeat « en retard » oui, alerte livrée après 2.2 min (seuil 5 min)
6. Rapport de pilote : OK (11 analyses en base)

## Rapport de pilote produit

# CronGuard pilot report — last 1 days

Generated on 2026-11-12 on your own server. Nothing was sent anywhere.
**Contains job names or error text: review before sharing.**

## Activity

| | |
|---|---|
| Monitored jobs that ran | 9 |
| Runs | 57 |
| Failed runs | 8 |
| Diagnosed failures | 11 |

## Was the cause established?

**64 %** of diagnosed failures (7/11) had a cause established without guessing.

| Source | Failures | Share |
|---|---|---|
| Observed on the host by the SDK (fact) | 6 | 55 % |
| Generic CronGuard fix library (may be off-target on new failures) | 1 | 9 % |
| Not established | 4 | 36 % |

## Feedback and fixes

| | |
|---|---|
| Diagnoses marked right by the team (👍) | 0 |
| Diagnoses marked wrong by the team (👎) | 0 |
| Failures without feedback | 11 |
| Fix observed by the SDK at the next success | 8 (73 %) |
| Fix written and confirmed by the team | 0 (0 %) |

## Time to restore

| | |
|---|---|
| Incidents resolved | 8 |
| Median time to restore | 1 min |
| Mean time to restore | 1 min |
| Total downtime | 8 min |

## Jobs with the most failures

| Job | Failures |
|---|---|
| renew-certs | 2 |
| cleanup-tmp | 2 |
| sync-invoices | 1 |
| backup-db | 1 |
| etl-nightly | 1 |
| sitemap | 1 |
| archive-data | 1 |
| export-report | 1 |
| heartbeat | 1 |

## How to read it

- "Established" counts the source that answered; it does not say the answer was right. The 👍/👎 rows do, for the failures the team reviewed.
- The generic library is measured at about 4/10 on failures it has never seen; facts observed on the host and team fixes are the reliable sources.
