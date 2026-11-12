# Labo terrain 2 — résultat (2026-11-12)

Suite du même tirage (ordre 26 à 72, questions jamais vues par les corrections du 12/11). Vérité : `eval/field-lab-2-truth.json`,
recopiée avant tout scénario. Observé brut : `eval/field-lab-2-observed.jsonl`. Jugement : moi, après le run.
Scénarios g12 et g44 reconstitués (les questions ne montrent pas le script).

**Limite de mesure** : le harnais ne comptait les alertes webhook qu'après la phase de démarrage ; les jobs en échec avaient
déjà alerté (une alerte par incident) pendant celle-ci. Détection jugée sur le statut « en échec » et l'analyse.

| Cas | Situation | Détecté | Cause montrée | Contre la réponse |
|---|---|---|---|---|
| g1 | dézippage dans le mauvais dossier courant | non (code 0) | — | raté |
| g7 | Django : variables du conteneur absentes de cron | oui | échec sans log (sortie redirigée) | non établie |
| g10 | clé SSH à phrase de passe, pas d'agent | oui | « identifiants d'un autre compte » | **cause fausse** (même compte) |
| g12 | « \|\| mail » masque l'échec | non (code 0) | — | raté |
| g19 | run-parts ignore un nom avec un point | oui (retard) | non établie | non trouvée |
| g20 | « ~ » entre guillemets, fichier relatif | oui | ligne d'erreur, cause non établie | non trouvée (nom sans « / » ignoré par la sonde) |
| g29 | URL wget mal écrite | oui (code 4) | échec sans log (-q) | non établie |
| g30 | pg_dump sous root, identifiants chez un autre utilisateur | oui | identifiants de /root, pas du compte interactif | **juste** |
| g40 | <( ) sous sh | oui | 192.168.1.31 injoignable | cause masquée par l'enveloppe bash de l'import |
| g42 | chemins relatifs du script de sauvegarde | non (code 0) | — | raté |
| g44 | /usr/sbin absent du PATH | non (code 0) | — | raté |
| g46 | find -exec tar écrase l'archive | non (code 0) | — | raté |

**Détection 7/12 · cause juste 1/12 · cause fausse affirmée 1/12** (labo 1 : 9/11, 5/10, 0/11).

Trouvé en plus :
1. **Fausses alertes « job lent »** sur 8 jobs sains (« Durée : 291 ms, moyenne : 66 ms ») : pas de plancher sur la lenteur.
2. Cause « identifiants d'un autre compte » affirmée sans preuve que le compte diffère (g10).
3. L'enveloppe de l'import (`bash -c`) change le shell du job (sh → bash) : elle masque un bogue réel (g40).
4. Jobs « réussis » qui échouent : 5/12.
5. Le masquage a pris « pg_dump: » pour un mot de passe après l'invite « Password: » (sortie de g30 abîmée).
6. Un nom de fichier relatif sans « / » dans l'erreur (« hw1_input.txt: No such file ») n'est pas vérifié par la sonde.
