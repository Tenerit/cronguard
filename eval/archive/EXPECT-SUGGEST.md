# Proposer CG_EXPECT à l'import — essai pré-enregistré (2026-11-12)

Jeu : 161 lignes de crontab réelles (StackExchange), étiquetées à la main avant tout lancement (`eval/expect-suggest.ts`,
commit `cabd42a`) : 14 produisent un fichier, 139 non, 8 ambiguës exclues. Modèle : `qwen2.5:7b-instruct-q4_K_M`, local.
Biais déclaré : la règle a été écrite après lecture des lignes.

## Résultat pré-enregistré

| | Règle du code | Modèle local + garde-fous |
|---|---|---|
| Sorties attendues retrouvées | 10/14 (71 %) | 12/14 (86 %) |
| Fausses sur les négatifs | 2/139 | 2/139 |
| Chemins inventés | 0 | 0 |
| Temps médian | instantané | 5,2 s |

Critère (modèle ≥ règle + 10 points, faux ≤ 5 %, 0 inventé) : **rempli**, à la limite (2 cas d'écart).

## Pourquoi le modèle n'est quand même pas adopté

Les 2 cas gagnés par le modèle (88, 92) sont exactement le défaut de la règle trouvé par les tests unitaires pendant le run :
une date calculée avec un espace (`$(date +%F)`) coupait le chemin. Règle corrigée (chiffre **non indépendant**,
`eval/expect-suggest-rule2.ts`) : **12/14, 0/139 faux** une fois l'option `-O --q` refusée comme nom de fichier.

- La règle rate 42 (copie dont le nom dépend de la veille) et 91 (chemin passé par erreur à mysqldump : le modèle a compris
  l'intention).
- Le modèle rate 138 (archive `tar -zcvf`) et propose 2 fois le script exécuté lui-même comme fichier produit (10, 15).

À rappel égal, la règle est instantanée et ne demande pas de modèle : **seule la règle est livrée** (proposée à l'import
du dashboard, ajoutée à la ligne de crontab). La combinaison règle puis modèle (13/14 possible) est une idée d'après coup :
elle demanderait un nouvel essai sur des données neuves.
