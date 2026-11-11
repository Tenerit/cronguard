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
  // Commandes de test du SDK (2026-11-10) : le shell de connexion = là où le job « marche à la main ».
  loginPath?:     string
  loginOnlyVars?: string[]               // NOMS des variables présentes dans le shell de connexion, absentes sous cron
  loginFound?:    Record<string, string> // commande introuvable sous cron → où le shell de connexion la trouve
  paths?:         PathFact[]             // chemins cités par l'erreur, constatés sur la machine
  changed?:       ChangeFact[]           // ce qui a changé depuis la dernière réussite (empreinte du SDK)
  expect?:        ExpectFact[]           // sorties attendues (CG_EXPECT) vérifiées après un code 0
  resources?:     { oomKills?: number; memMax?: string; memPeak?: string; disk?: Array<{ path: string; free: number; total: number }> }
  net?:           Array<{ host: string; port: number; dns: 'ok' | 'fail'; tcp?: 'open' | 'refused' | 'timeout' | 'unreachable' }>
}

export interface ChangeFact { kind: 'command' | 'env' | 'var' | 'file' | 'tool'; label: string; before?: string; after?: string }
export interface ExpectFact { pattern: string; ok: boolean; reason?: string; path?: string; size?: number; mtime?: number }

export interface PathFact { path: string; relative: boolean; exists: boolean; owner?: string; mode?: string; readable?: boolean; writable?: boolean }

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

/** Taille lisible : 1536 → « 1,5 Ko », 67108864 → « 64 Mo ». */
function bytes(n: number): string {
  const u = ['octets', 'Ko', 'Mo', 'Go', 'To']
  let i = 0
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
  return `${i ? n.toFixed(n < 10 ? 1 : 0).replace('.', ',') : n} ${u[i]}`
}

const NOT_FOUND = /(?:^|\s)([\w.+-]+): (?:command )?not found|exec: "?([\w.+-]+)"?: executable file not found/m
// Identifiants ABSENTS (pas faux) : un mauvais mot de passe ne dit rien de l'utilisateur du cron.
const CREDS     = /fe_sendauth: no password supplied|\(using password: NO\)|Unable to locate credentials|NoCredentialsError|Permission denied \(publickey|gpg: .*(No secret key|No public key)/i

export function contextFinding(logs: string, c?: RunContext): Finding | null {
  if (!c || !logs) return null

  // 0. Le job a réussi (code 0)… sans produire ce qui est attendu : le constat le plus grave pour une sauvegarde.
  const bad = c.expect?.filter(e => !e.ok) ?? []
  if (bad.length) {
    const what = bad.map(e => `${e.path ?? e.pattern} : ${e.reason ?? 'non conforme'}`).join(' ; ')
    return { id: 'ctx-expect', category: 'data',
      cause: `Le job s'est terminé sans erreur (code 0), mais ce qu'il doit produire n'est pas là : ${what}.`,
      action: "Vérifier l'étape qui écrit ce fichier (destination, droits, filtre, source vide) : un code 0 ne prouve pas que la sauvegarde existe." }
  }

  // Mémoire : le compteur oom_kill du cgroup a bougé pendant l'exécution — le noyau a tué un processus du job.
  const r = c.resources
  if (r?.oomKills) {
    const lim = r.memMax && /^\d+$/.test(r.memMax) ? `, limite ${bytes(+r.memMax)}` : ''
    const peak = r.memPeak && /^\d+$/.test(r.memPeak) ? `, pic ${bytes(+r.memPeak)}` : ''
    return { id: 'ctx-oom', category: 'resources',
      cause: `Le noyau a tué un processus du job faute de mémoire (OOM) : compteur oom_kill du cgroup +${r.oomKills} pendant l'exécution${lim}${peak}.`,
      action: 'Augmenter la limite mémoire du conteneur ou du service, ou réduire la consommation du job (lots plus petits, traitement en flux).' }
  }
  // Disque plein : l'erreur le dit ET le SDK l'a constaté sur le volume concerné.
  const full = /No space left|ENOSPC|disk full|Disk quota exceeded/i.test(logs)
    ? r?.disk?.find(d => d.total > 0 && (d.free / d.total < 0.02 || d.free < 64 * 1024 ** 2)) : undefined
  if (full) {
    return { id: 'ctx-disk-full', category: 'resources',
      cause: `Le volume de ${full.path} est plein : ${bytes(full.free)} libres sur ${bytes(full.total)} (${(100 * full.free / full.total).toFixed(1)} %), constaté par le SDK au moment de la panne.`,
      action: 'Libérer de la place ou agrandir le volume ; vérifier la rotation des sauvegardes, des logs et des fichiers temporaires.' }
  }
  // Réseau : DNS puis TCP vers l'hôte cité par l'erreur, au moment de la panne.
  const n = c.net?.[0]
  if (n) {
    const at = `${n.host}:${n.port}`
    if (n.dns === 'fail') return { id: 'ctx-net-dns', category: 'network',
      cause: `Le nom « ${n.host} » ne se résout pas depuis la machine du job (constaté par le SDK au moment de la panne).`,
      action: 'Vérifier le nom, le DNS de la machine (/etc/resolv.conf) et le réseau du conteneur.' }
    if (n.tcp === 'refused') return { id: 'ctx-net-refused', category: 'network',
      cause: `Rien n'écoute sur ${at} : connexion refusée, constatée par le SDK au moment de la panne.`,
      action: 'Vérifier que le service cible tourne et écoute sur ce port (systemctl status, ss -ltnp), ou que le port est le bon.' }
    if (n.tcp === 'timeout' || n.tcp === 'unreachable') return { id: 'ctx-net-timeout', category: 'network',
      cause: `${at} ne répond pas (${n.tcp === 'timeout' ? 'aucune réponse en 2 s' : 'hôte injoignable'}) : pare-feu, filtrage réseau ou machine éteinte.`,
      action: 'Vérifier la route et les règles de pare-feu entre la machine du job et la cible, et que la cible est allumée.' }
    if (n.tcp === 'open') return { id: 'ctx-net-open', category: 'network',
      cause: `${at} répond au moment de la vérification : la panne était passagère, ou vient d'après la connexion (authentification, requête).`,
      action: 'Relancer le job ; si ça recommence, regarder le service cible au moment de la panne (redémarrage, saturation).' }
  }

  // 1. Commande introuvable… mais présente ailleurs sur la machine : le fait, pas une hypothèse.
  const nf = NOT_FOUND.exec(logs)
  const cmd = nf?.[1] ?? nf?.[2]
  if (cmd && c.loginFound?.[cmd]) {   // vu par la commande de test : votre shell de connexion la trouve
    const dir = c.loginFound[cmd].replace(/\/[^/]+$/, '')
    return { id: 'ctx-login-path', category: 'dependency',
      cause: `Votre shell de connexion trouve « ${cmd} » dans ${dir}, le cron non : son PATH (${c.path ?? 'minimal'}) ne contient pas ce dossier.`,
      action: `Appeler ${c.loginFound[cmd]} en chemin absolu, ou ajouter PATH=${dir}:${c.path ?? '/usr/bin:/bin'} en tête de la crontab.` }
  }

  // 1b. Variable présente dans votre shell de connexion, absente sous cron, et citée par l'erreur.
  const missingVar = c.loginOnlyVars?.find(v => v.length >= 3 && new RegExp(`\\b${v}\\b`).test(logs))
  if (missingVar) {
    const where = c.runner === 'container-cron' ? "le démon cron du conteneur ne transmet pas l'environnement du conteneur"
      : c.runner === 'systemd' ? "l'unité systemd ne lit pas votre shell de connexion"
      : 'cron ne lit pas .bashrc / .profile'
    return { id: 'ctx-env-missing', category: 'dependency',
      cause: `La variable ${missingVar} existe dans votre shell de connexion mais pas dans l'environnement du job : ${where}.`,
      action: c.runner === 'systemd' ? `Déclarer ${missingVar} dans l'unité (Environment= ou EnvironmentFile=).`
        : c.runner === 'container-cron' ? `Écrire l'environnement du conteneur au démarrage (printenv > /etc/environment) et le lire dans le job.`
        : `Définir ${missingVar} dans un fichier lu explicitement par le script (droits 600 si c'est un secret), ou en tête de la crontab.` }
  }

  // 1c. Chemin relatif cherché depuis le dossier courant du cron, où il n'existe pas (constaté).
  const rel = /No such file|can't open|cannot open|cannot access|cannot stat/i.test(logs) && c.paths?.find(p => p.relative && !p.exists)
  if (rel) {
    return { id: 'ctx-relative-path', category: 'code',
      cause: `Le chemin relatif « ${rel.path} » est cherché depuis ${c.cwd ?? 'le dossier courant du cron'} (dossier courant du job), où il n'existe pas.`,
      action: 'Utiliser un chemin absolu, ou faire cd vers le dossier du script en début de job.' }
  }

  // 1d. Droits constatés : le fichier existe, l'utilisateur du job ne peut pas le lire ou y écrire.
  const perm = /Permission denied|EACCES/i.test(logs) && c.paths?.find(p => p.exists && (p.readable === false || p.writable === false))
  if (perm) {
    return { id: 'ctx-permission', category: 'dependency',
      cause: `« ${perm.path} » appartient à ${perm.owner ?? '?'} (droits ${perm.mode ?? '?'}) : le job tourne sous ${c.user || '?'}, qui ne peut pas ${perm.readable === false ? 'le lire' : 'y écrire'}.`,
      action: `Donner ce droit à ${c.user || "l'utilisateur du job"} sur ${perm.path}, ou lancer le job sous ${perm.owner ?? 'le propriétaire'}.` }
  }

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

  // 7. Chemin absolu cité par l'erreur et absent de la machine (constaté) : le fait, sans deviner pourquoi.
  const gone = /No such file/i.test(logs) && c.paths?.find(p => !p.relative && !p.exists)
  if (gone) {
    return { id: 'ctx-path-absent', category: 'dependency',
      cause: `« ${gone.path} » n'existe pas sur la machine au moment de l'échec (vérifié par CronGuard).`,
      action: `Vérifier ce qui doit créer ou monter « ${gone.path} » (étape précédente, montage, nom calculé à partir de la date).` }
  }
  return null
}

/** Commandes de test à lancer soi-même quand rien n'établit la cause : reproduire la panne dans
 *  l'environnement exact du cron, et les différences constatées avec votre shell. Aucune déduction. */
export function diagnosticChecks(command: string | undefined, c?: RunContext): string[] {
  const out: string[] = []
  if (command) {
    const q = command.replace(/'/g, `'\\''`)
    out.push(`Reproduire avec l'environnement du cron : env -i HOME=${c?.home || '$HOME'} LOGNAME=${c?.user || '$USER'} PATH=${c?.path || '/usr/bin:/bin'} SHELL=/bin/sh /bin/sh -c '${q}'`)
  }
  if (c?.loginOnlyVars?.length) out.push(`Variables présentes dans votre shell mais absentes sous cron : ${c.loginOnlyVars.slice(0, 12).join(', ')}`)
  if (c?.loginPath && c.path && c.loginPath !== c.path) out.push(`PATH de votre shell : ${c.loginPath.slice(0, 200)} — PATH du cron : ${c.path.slice(0, 200)}`)
  if (!command) out.push("Relancer le job à la main sous l'utilisateur du cron : sudo -u <utilisateur> env -i /bin/sh -c '<commande>'")
  return out
}
