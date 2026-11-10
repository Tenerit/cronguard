// Contexte d'exécution réel du cron, relevé SUR LA MACHINE par le SDK au moment de l'échec
// (cg_run / cg_end). Un SaaS ne voit que des logs ; CronGuard, installé chez le client, peut
// constater le PATH, l'utilisateur, la locale… et transformer « marche à la main, pas en cron »
// en fait établi. Aucune valeur secrète : noms, chemins et booléens seulement.
import type { ErrorCategory } from './analyzer'

export interface RunContext {
  user?:      string
  home?:      string
  path?:      string
  shell?:     string
  lang?:      string                  // LC_ALL || LANG, vide si absent
  cwd?:       string
  display?:   boolean                 // DISPLAY défini
  sshAgent?:  boolean                 // SSH_AUTH_SOCK défini
  found?:     Record<string, string>  // commande introuvable dans le PATH → chemin où elle existe sur la machine
  runner?:    Runner                  // qui a lancé le job (relevé par le SDK) : la cause d'une panne en dépend
}

/** Lanceur du job. container-cron = démon cron DANS un conteneur ; container = conteneur lancé par un ordonnanceur externe. */
export const RUNNERS = ['crontab', 'container-cron', 'container', 'systemd', 'kubernetes', 'launchd'] as const
export type Runner = typeof RUNNERS[number]

/** Lanceur : celui relevé par le SDK, sinon déduit des logs (traces propres à chaque lanceur), sinon inconnu. */
export function inferRunner(logs: string, reported?: Runner): Runner | undefined {
  if (reported) return reported
  if (/\bkubectl\b|\bCronJob\b|OOMKilled|BackoffLimitExceeded|ImagePullBackOff|ErrImagePull|CreateContainerConfigError|\bpod\/[\w-]/.test(logs)) return 'kubernetes'
  if (/\bsystemd\[\d+\]|\.timer\b|\.service: (Main process|Failed)|journalctl/.test(logs)) return 'systemd'
  if (/\blaunchd\b|\blaunchctl\b/.test(logs)) return 'launchd'
  if (/\bCRON\[\d+\]|\(CRON\)|\bcrond\[\d+\]|\banacron\b/.test(logs)) return 'crontab'
  return undefined
}

export interface Finding { id: string; category: ErrorCategory; cause: string; action: string }

const NOT_FOUND = /(?:^|\s)([\w.+-]+): (?:command )?not found|exec: "?([\w.+-]+)"?: executable file not found/m
// Identifiants ABSENTS (pas faux) : un mauvais mot de passe ne dit rien de l'utilisateur du cron.
const CREDS     = /fe_sendauth: no password supplied|\(using password: NO\)|Unable to locate credentials|NoCredentialsError|Permission denied \(publickey|gpg: .*(No secret key|No public key)/i

export function contextFinding(logs: string, c?: RunContext): Finding | null {
  if (!c || !logs) return null

  // 1. Commande introuvable… mais présente ailleurs sur la machine : le fait, pas une hypothèse.
  const nf = NOT_FOUND.exec(logs)
  const cmd = nf?.[1] ?? nf?.[2]
  if (cmd && c.found?.[cmd]) {
    const dir = c.found[cmd].replace(/\/[^/]+$/, '')
    return { id: 'ctx-path-missing', category: 'dependency',
      cause: `« ${cmd} » existe dans ${dir}, mais ce dossier n'est pas dans le PATH du cron (${c.path ?? 'PATH minimal'}).`,
      action: `Appeler ${c.found[cmd]} en chemin absolu, ou ajouter PATH=${dir}:${c.path ?? '/usr/bin:/bin'} en tête de la crontab.` }
  }

  // 2. Identifiants lus dans le HOME : le cron tourne sous un autre compte que le vôtre.
  if (CREDS.test(logs) && c.user && c.home) {
    return { id: 'ctx-other-user', category: 'dependency',
      cause: `Le cron tourne sous « ${c.user} » (HOME=${c.home}) : il lit les identifiants de ${c.home} (.pgpass, .my.cnf, .aws, .ssh, trousseau GPG), pas ceux du compte où le job marche à la main.`,
      action: `Placer les identifiants dans ${c.home} pour ${c.user} (droits 600), ou installer le job dans la crontab du bon utilisateur (crontab -u <user> -e).` }
  }

  // 3. Locale C / POSIX : pas d'UTF-8 sous cron.
  if (/UnicodeEncodeError|UnicodeDecodeError: 'ascii'|'ascii' codec can't/.test(logs) && (!c.lang || /^(C|POSIX)(\.|$)/i.test(c.lang))) {
    return { id: 'ctx-locale', category: 'dependency',
      cause: `Le cron s'exécute sans locale UTF-8 (LANG/LC_ALL = ${c.lang || 'vide'}) : le programme retombe en ASCII.`,
      action: 'Ajouter LC_ALL=C.UTF-8 (ou LANG=fr_FR.UTF-8) en tête de la crontab ; pour Python, PYTHONIOENCODING=utf-8.' }
  }

  // 4. Pas de session graphique.
  if (c.display === false && /cannot open display|could not open display|Can't open display|\$DISPLAY|Cannot autolaunch D-Bus/i.test(logs)) {
    return { id: 'ctx-no-display', category: 'dependency',
      cause: "La variable DISPLAY est absente dans l'environnement du cron : le programme graphique n'a aucune session X à laquelle se connecter.",
      action: 'Définir DISPLAY=:0 et XAUTHORITY (fichier .Xauthority de la session) dans la crontab, ou utiliser un mode sans affichage (headless, xvfb-run).' }
  }

  // 5. Pas d'agent SSH.
  if (c.sshAgent === false && /Permission denied \(publickey|Could not read from remote repository|agent refused|Could not open a connection to your authentication agent/i.test(logs)) {
    return { id: 'ctx-no-ssh-agent', category: 'network',
      cause: "SSH_AUTH_SOCK est absent dans l'environnement du cron : la clé chargée dans l'agent de votre session n'est pas disponible.",
      action: 'Utiliser une clé dédiée au job, sans passphrase, indiquée explicitement (ssh -i / IdentityFile, GIT_SSH_COMMAND="ssh -i …").' }
  }

  // 6. Script bash exécuté par /bin/sh.
  if (c.shell && /\/(da)?sh$/.test(c.shell) && /Syntax error: "?\(|\[\[: not found|source: not found|Bad substitution|failed to open files-from <\(/.test(logs)) {
    return { id: 'ctx-sh-not-bash', category: 'code',
      cause: `Le cron exécute la commande avec ${c.shell}, qui refuse la syntaxe bash ([[ ]], source, <( ), tableaux).`,
      action: 'Mettre SHELL=/bin/bash en tête de la crontab, ou lancer le script avec bash et un shebang #!/bin/bash.' }
  }
  return null
}
