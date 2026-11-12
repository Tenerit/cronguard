# « Réussi mais en erreur » — essai pré-enregistré (2026-11-12) : abandonné

Question : signaler un job sorti avec 0 dont la sortie contient une erreur forte (point aveugle du labo terrain : 2/11).
Détecteur figé avant la mesure (`eval/lib/silent-errors.ts`, 19 marqueurs sensibles à la casse), commit `10a1f21`.

| Mesure | Résultat | Attendu |
|---|---|---|
| Fausses alertes : 40 commandes cron courantes réellement exécutées dans Debian, toutes sorties avec 0 | 1/40 (2,5 %) | ≤ 2 % (défaut), ≤ 5 % (option) |
| Rappel : 98 journaux d'erreur réels (jeux publics StackExchange) | 47/98 (48 %) | ≥ 50 %, sinon abandon |

**Abandonné** : rappel sous le seuil fixé d'avance (de 2 cas). Aucun marqueur ajouté après coup.

- Fausse alerte : `find /etc` sous `nobody` écrit « Permission denied » sur `/etc/ssl/private` alors que le job fait son travail.
- Limite de fond : un mot dans la sortie ne voit qu'un journal d'erreur sur deux, et rien de ce qu'un script écrit
  ailleurs (cas 18 du labo terrain : « I failed: … » dans un fichier).
- Défense qui reste : `CG_EXPECT` (« réussi mais rien produit »), proposé à l'import depuis le 12/11.
