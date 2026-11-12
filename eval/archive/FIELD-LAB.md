# Labo terrain — résultat (2026-11-12)

Protocole : `eval/FIELD-LAB-PROTOCOL.md`. Tirage au sort (graine 20261112) parmi de vraies questions StackExchange ; vérité =
réponse acceptée, recopiée avant le run (`eval/field-lab-truth.json`) ; Debian et son vrai cron ; lignes de crontab des
questions, enveloppées comme l'import du dashboard. Observé brut : `eval/field-lab-observed.jsonl`. Jugement : moi, après le run.

**Écarts de méthode, signalés :**
- Cas 1 (mysqldump) : le symptôme de la question (le dump dans le journal) ne s'est pas reproduit ; le job a échoué (code 2).
  Exclu comme prévu (« impossible à reproduire »). Le cas de réserve n'a pas été lancé : **11 cas**.
- Défaut du harnais : les monitors ont été créés pendant l'installation de Debian, d'où une alerte « en retard » au début
  pour chaque job. Pour 4, 18a, 18b, ces alertes ne viennent pas de leur exécution : non comptées.

| # | Situation | Alerte | Cause montrée | Contre la réponse |
|---|---|---|---|---|
| 0 | crontab à 2 liens physiques ignorée par Debian | oui (retard) | non établie | non trouvée, rien de faux |
| 2 | tar, chemin relatif, crontab de root | oui | chemin relatif cherché depuis /root | **juste** |
| 4 | script sans #!, syntaxe bash, sortie 0 | **non** | — | non détecté |
| 6 | git hors du PATH de cron | oui | le shell trouve git, le cron non | **juste** |
| 7 | php hors du PATH de cron | oui | idem php | **juste** |
| 13 | fonction shell dans la crontab | oui (retard) | non établie | non trouvée (Debian a rejeté le fichier entier) |
| 14 | script en erreur, sortie redirigée, pas de mail de cron | oui, 2 lignes | sans objet | ce que CronGuard règle |
| 16 | identifiants aws dans /home/ubuntu, cron sous root | oui | le cron lit /root, pas le compte où ça marche | **juste** |
| 18 | variables du conteneur absentes de cron, exception attrapée, sortie 0 | **non** | — | non détecté |
| 20 | rake via le shell de connexion seulement | oui | le shell trouve rake (.rbenv/shims), le cron non | **juste** |
| 21 | logrotate -f efface tous les journaux | oui (2e run) | les fichiers n'existent pas | partielle (conséquence, pas -f) |

**Détection 9/11 · cause juste 5/10 (+1 partielle ; 14 sans objet) · cause fausse affirmée 0/11.**

Ce que ça apprend :
1. Point aveugle : les jobs qui échouent en sortant avec 0 (4, 18 ; et le nettoyage tué par OOM du labo clients).
2. Les sondes ont besoin d'un nom (fichier, hôte) dans l'erreur ; sans lui, la fiche générique ou rien.
3. Affichage : `laravel-*.log` coupé au joker dans le constat du cas 21.
Toute correction faite après ce run est notée « non indépendante » et ne change pas ces chiffres.
