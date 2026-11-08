// Levier 3 (2026-11-08) : sens OFFICIEL des codes, sans modèle.
//   · code de sortie du shell (manuel bash « EXIT STATUS ») : 126, 127, 128+N = tué par le signal N ;
//   · code de curl « curl: (N) » (man curl, EXIT CODES) ;
//   · code de rsync « (code N) » (man rsync, EXIT VALUES).
// Écrit d'après ces tables, AVANT la collecte du jeu de test public5. Les codes trop vagues
// (1, 2…) ne disent rien : on ne conclut pas sur eux.
import type { Finding } from './run-context'

const SIGNALS: Record<number, [string, string, string]> = {   // signal → [nom, mécanisme, action]
  2:  ['SIGINT',  "le job a été interrompu (Ctrl-C ou arrêt demandé par un autre processus)", "Chercher qui interrompt le job (autre script, arrêt manuel) ; relancer."],
  6:  ['SIGABRT', "le programme s'est arrêté lui-même sur une erreur fatale (assertion, double libération mémoire, abort())", "Lire les dernières lignes du log avant l'arrêt ; vérifier une mise à jour récente du programme ou de ses bibliothèques."],
  9:  ['SIGKILL', "le job a été tué sans préavis : le plus souvent par le noyau faute de mémoire (OOM killer), sinon par un timeout dur ou un kill -9", 'Vérifier dmesg -T | grep -i "killed process" ; réduire le pic mémoire ou relever la limite.'],
  11: ['SIGSEGV', "le programme a planté sur un accès mémoire invalide (bug, ou bibliothèque incompatible)", 'Vérifier les mises à jour récentes du programme et des bibliothèques ; reproduire à la main pour obtenir la trace.'],
  13: ['SIGPIPE', "le job écrivait dans un tube dont le lecteur s'est fermé (ex. commande | head), ou une connexion coupée", "Vérifier la commande en aval du tube ; ignorer SIGPIPE si la sortie tronquée est voulue."],
  15: ['SIGTERM', "le job a reçu une demande d'arrêt : timeout (timeout, TimeoutStartSec), arrêt ou redémarrage de la machine ou du conteneur, ou kill", "Chercher l'origine : limite de durée du job, redémarrage planifié, déploiement du conteneur à la même heure."],
}

const CURL: Record<number, [string, string]> = {
  3:  ['L\'URL appelée par curl est mal formée (variable vide ou mal échappée dans la commande).', 'Afficher l\'URL réellement passée à curl (echo) ; mettre l\'URL entre guillemets.'],
  7:  ["curl n'a pas pu se connecter : rien n'écoute sur l'hôte et le port appelés (service arrêté, mauvais port, pare-feu qui refuse).", "Vérifier que le service tourne et écoute (nc -zv <hôte> <port>), puis relancer."],
  18: ['Le transfert curl s\'est terminé avant la fin du fichier : connexion coupée en cours de route.', 'Relancer avec reprise (curl -C -) et des tentatives (--retry).'],
  22: ["Le serveur a répondu par une erreur HTTP ≥ 400 (curl -f) : URL, droits ou service côté serveur.", "Relancer sans -f pour lire le code et le corps de la réponse (curl -i)."],
  23: ["curl n'a pas pu écrire ce qu'il recevait : disque plein ou dossier de destination non inscriptible pour l'utilisateur du cron.", "Vérifier l'espace disque (df -h) et les droits sur le dossier de destination."],
  28: ["L'opération curl a dépassé son délai : le service distant ne répond pas ou trop lentement.", "Vérifier l'état du service distant ; augmenter --max-time seulement si la durée est normale."],
  35: ['La négociation TLS a échoué (protocole ou chiffrement non supporté des deux côtés, ou proxy qui interfère).', 'Tester avec curl -v pour voir l\'étape qui échoue ; mettre à jour curl/OpenSSL.'],
  47: ['Trop de redirections : l\'URL boucle (souvent http ↔ https ou une page de connexion).', 'Appeler directement l\'URL finale ; vérifier une redirection vers une page de connexion.'],
  51: ['Le certificat du serveur ne correspond pas au nom appelé.', 'Appeler l\'hôte par un nom couvert par le certificat ; ne pas désactiver la vérification.'],
  52: ['Le serveur a fermé la connexion sans rien répondre (application plantée derrière, ou mauvais protocole/port).', 'Vérifier les logs du service appelé à la même heure.'],
  56: ['La connexion a été coupée pendant la réception (réinitialisée par le serveur ou un équipement réseau).', 'Relancer avec --retry ; vérifier les logs du serveur.'],
  60: ["Le certificat du serveur n'est pas vérifiable avec les autorités connues de la machine (CA interne, chaîne incomplète, ou magasin de certificats périmé).", "Mettre à jour le magasin (update-ca-certificates) ou passer la CA à curl (--cacert) ; ne pas utiliser -k."],
  67: ['Le serveur FTP/SFTP a refusé l\'identifiant ou le mot de passe.', 'Vérifier les identifiants lus par le job (fichier .netrc de l\'utilisateur du cron, variables).'],
  78: ["Le fichier distant demandé n'existe pas (chemin ou nom calculé faux, ex. date).", 'Afficher le chemin distant réellement demandé ; vérifier son calcul.'],
}

const RSYNC: Record<number, [string, string]> = {
  1:   ['rsync refuse la commande : erreur de syntaxe ou option inconnue (souvent des guillemets manquants autour de -e).', 'Afficher la commande rsync exacte ; mettre -e "ssh …" entre guillemets.'],
  2:   ['Les deux rsync sont incompatibles (versions ou options), ou le shell distant écrit du texte parasite au login.', "Vérifier que rien n'est affiché au login SSH distant (.bashrc) ; aligner les versions."],
  3:   ['rsync ne trouve pas un fichier ou dossier source/destination demandé.', 'Vérifier les chemins (absolus) et les droits de l\'utilisateur du cron.'],
  5:   ['Le protocole rsync n\'a pas pu démarrer côté distant (rsync absent du serveur, ou commande distante refusée).', 'Vérifier que rsync est installé côté distant et que la clé SSH autorise la commande.'],
  10:  ['Erreur réseau entre les deux machines (connexion impossible ou coupée).', 'Tester la connexion SSH seule ; vérifier le réseau et le pare-feu.'],
  11:  ['rsync n\'a pas pu lire ou écrire un fichier (disque plein, droits, système de fichiers en lecture seule).', 'Vérifier l\'espace disque et les droits côté destination.'],
  12:  ['Le flux rsync s\'est interrompu : la connexion SSH a été coupée, le rsync distant a planté, ou le disque distant est plein.', 'Lire les lignes juste au-dessus (côté distant) ; vérifier l\'espace disque distant et la connexion SSH.'],
  14:  ['rsync n\'a pas pu créer de processus (mémoire épuisée, souvent sur de très gros arbres de fichiers).', 'Vérifier la mémoire disponible ; découper la synchronisation par sous-dossiers.'],
  30:  ['rsync a dépassé son délai d\'attente (--timeout) : réseau ou disque trop lent.', 'Vérifier le réseau et la charge disque ; ajuster --timeout si nécessaire.'],
  255: ['La connexion SSH utilisée par rsync a échoué (clé refusée, hôte injoignable, clé d\'hôte inconnue).', 'Tester ssh seul avec la même clé, sous l\'utilisateur du cron.'],
}

/** Code de curl ou de rsync lu dans les logs (prioritaire : plus précis qu'un code de sortie). */
export function toolCodeFinding(logs: string): Finding | null {
  const c = /curl: \((\d+)\)|\[curl\] (\d+):/.exec(logs)
  const cn = c ? Number(c[1] ?? c[2]) : NaN
  if (CURL[cn]) return { id: `curl-${cn}`, category: cn === 23 ? 'resources' : cn === 22 || cn === 67 ? 'dependency' : 'network', cause: CURL[cn][0], action: CURL[cn][1] }
  const r = /rsync (?:error|warning):[^\n]*\(code (\d+)\)/.exec(logs)
  const rn = r ? Number(r[1]) : NaN
  if (RSYNC[rn]) return { id: `rsync-${rn}`, category: rn === 11 || rn === 14 ? 'resources' : rn === 1 || rn === 3 ? 'code' : 'network', cause: RSYNC[rn][0], action: RSYNC[rn][1] }
  return null
}

/** Code de sortie du job : seulement les codes qui ont un sens précis (126, 127, 128+N). */
export function exitCodeFinding(exitCode: number | undefined): Finding | null {
  if (exitCode === 126) return { id: 'exit-126', category: 'code',
    cause: "Code 126 : la commande a été trouvée mais ne peut pas être exécutée (droit d'exécution manquant, volume monté noexec, ou fichier qui n'est pas un exécutable).",
    action: 'Vérifier les droits (chmod +x) et le montage (findmnt -T <fichier>), ou lancer via son interpréteur (bash script.sh).' }
  if (exitCode === 127) return { id: 'exit-127', category: 'dependency',
    cause: "Code 127 : la commande est introuvable dans le PATH du cron (PATH minimal /usr/bin:/bin) ou son nom est faux.",
    action: 'Appeler la commande en chemin absolu (command -v <outil>) ou définir PATH= en tête de la crontab.' }
  if (exitCode !== undefined && exitCode > 128 && SIGNALS[exitCode - 128]) {
    const [name, why, fix] = SIGNALS[exitCode - 128]
    return { id: `exit-${exitCode}`, category: exitCode === 137 ? 'resources' : exitCode === 143 ? 'timeout' : 'code',
      cause: `Code ${exitCode} = ${name} : ${why}.`, action: fix }
  }
  return null
}
