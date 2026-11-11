# Rôle IA n°1 — expliquer une panne établie (2026-11-11)

- **cas** : 5
- **rejetes_par_garde_fou** : 2
- **couverture** : 71 % des 7 causes établies (essai 3 : attente ≥ 50 %)
- **fidelite** : 100 % (attente ≥ 95 %)
- **mecanisme_garde** : 0 % sur 1 (attente ≥ 90 %)
- **mots_mediane** : 47 (attente ≤ 60)
- **phrases_max** : 3 (attente ≤ 3)
- **latence_mediane_s** : 18.3 (attente ≤ 8)

## Exemples (à relire)

### p7-quartz-job-already-stored
- Cause : Une autre transaction tient un verrou sur les mêmes lignes ou tables trop longtemps (job concurrent, transaction restée ouverte).
- Explication : Une autre transaction tient un verrou sur les mêmes lignes ou tables. Cela peut être dû à une transaction restée ouverte ou à un job concurrent. Pour résoudre le problème, vous devez identifier la session bloquante et la terminer.

### p7-node-heap-parallel
- Cause : Le traitement charge plus de données que la limite de tas Node.js par défaut.
- Explication : Le programme a essayé de charger trop de données dans la mémoire, ce qui dépasse la limite par défaut de Node.js. Pour résoudre le problème, vous pouvez traiter les données par lots ou augmenter la taille du tas avec NODE_OPTIONS=--max-old-space-size, sans dépasser la capacité de votre RAM.

### p7-docker-cron-not-installed
- Cause : cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/local/bin, nvm, pyenv) est introuvable.
- Explication : Le cron ne peut pas trouver l'outil crontab car son PATH est réduit à /usr/bin:/bin, et l'outil se trouve dans /usr/local/bin. Pour résoudre ce problème, vous pouvez appeler la commande en chemin absolu (utilisez command -v crontab pour le trouver) ou définir PATH= en tête de la crontab.

### p7-conda-activate-bashrc — ⚠ mécanisme perdu
- Cause : Le script active un virtualenv par un chemin introuvable sous cron (chemin relatif, PATH réduit, ou sh qui ne connaît pas source) : le bon environnement Python n'est jamais chargé.
- Explication : Le script utilise un chemin introuvable pour activer le virtualenv sous cron. Pour résoudre ce problème, ne pas activer le virtualenv et appeler directement le Python du virtualenv en spécifiant son chemin absolu. Vérifiez le chemin exact de bin/activate et remplacez 'source activate && python' par '/chemin/venv/bin/python'.

### p7-crontab-pasted-in-bash
- Cause : La commande appelle un script par un chemin relatif : sous cron, le dossier courant est le HOME de l'utilisateur, pas celui du script.
- Explication : La commande est exécutée depuis le HOME de l'utilisateur plutôt que du dossier où se trouve le script. Pour résoudre ce problème, utilisez un chemin absolu pour le script ou changez d'abord de répertoire avec cd /chemin/du/projet && avant la commande.


## Rejetées par les garde-fous (cause brute affichée à la place)

### p7-cron-mail-postfix-domain — possibilité perdue ou trop court
- Texte du modèle : Le service SMTP sur l'hôte einstein.example.com pourrait être arrêté ou ne pas écouter sur le port 25. Il faut vérifier que le service tourne et écoute bien sur ce port avant de relancer le job.

### p7-bad-interpreter-not-exec — possibilité perdue ou trop court
- Texte du modèle : Le job cron n'a pas les droits nécessaires sur le fichier ou dossier concerné. Le propriétaire du fichier est www-data, root ou un autre utilisateur différent de celui qui exécute le cron. Il faut vérifier le propriétaire et les droits du fichier en utilisant ls -l <chemin>. L'action à prendre peut être d'exécuter le job sous l'utilisateur propriétaire (crontab -u <user>) ou d'ajuster le propriétaire et les droits du dossier concerné.
