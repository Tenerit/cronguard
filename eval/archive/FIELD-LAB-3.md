# Labo terrain 3 — résultat (2026-11-14)

Tirage : suite de `eval/field-lab-draw.json` (graine 20261112, ordre 80 à 98, `eval/field-lab-questions-6.json`).
Vérité gelée avant les scénarios (`c861a90`), scénarios gelés avant le run (`d2beedb`). 19 questions, 5 reproductibles,
14 écartées (raisons dans `eval/field-lab-3-truth.json`). Debian, vrai cron, lignes enveloppées comme l'import, chaîne réelle
(API + worker + vérificateur). Première mesure indépendante de tout ce qui a été ajouté les 12 et 13/11.

Défaut du harnais : le 1er passage a planté à la fin (journal de requêtes absent → `docker exec` en erreur avant l'écriture
des résultats), corrigé (`a19bcc7`) et relancé à l'identique. Limite connue (labo 2) : les alertes ne sont comptées qu'après la
réduction de la grâce ; la détection est jugée sur le statut et l'analyse.

| Cas | Situation | Détecté | Cause montrée | Contre la réponse |
|---|---|---|---|---|
| h2 | ligne de /etc/crontab sans champ utilisateur | oui (retard) | « non établie », ligne citée : « TIMEOUT … n'a pas pingé » | non trouvée, rien de faux |
| h4 | `%` non échappés dans l'URL de curl | oui (retard) | idem | non trouvée, rien de faux |
| h10 | proxy seulement dans le profil, erreur attrapée, sortie 0 | **non** (7 × succès) | — | raté |
| h14 | `sqlite3.connect("test.db")` relatif, sortie 0 | **non** (7 × succès) | — | raté |
| h18 | arp hors du PATH du cron | oui (code 127) | « arp existe dans /usr/sbin, absent du PATH du cron (/usr/bin:/bin) » | **juste** |

**Détecté 3/5 · cause juste 1/5 · cause fausse 0/5.**
Cumul des trois labos terrain : détecté 19/28, cause juste 7/27, cause fausse 1/28.

Constats :
1. Les jobs « réussis » qui échouent restent le point aveugle (h10, h14 : 2/5 ; 9/28 sur les trois labos). La lecture du
   script n'y peut rien : le SDK ne l'envoie qu'en cas d'échec. Défense existante : CG_EXPECT (aucune sortie attendue
   proposable ici : h10 n'écrit rien, h14 écrit une base dont le chemin est justement faux).
2. Un job qui n'a JAMAIS pingé (h2, h4) était présenté avec « TIMEOUT » comme ligne d'erreur. Corrigé après coup
   (non indépendant) : fiche `never-pinged` — aucun ping depuis la création = la ligne n'est pas lancée par cron ou n'atteint
   pas le SDK ; action : lire le journal de cron à l'heure prévue.
3. h4 montre aussi que l'enveloppe de l'import ne protège pas d'un `%` non échappé : cron coupe la ligne avant le shell, la
   ligne entière (enveloppe comprise) ne s'exécute pas. L'import prévient déjà (`cmd-percent` au lint), ce labo ne le mesure pas.
