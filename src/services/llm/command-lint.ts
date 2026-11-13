// Vérification de la commande lancée par le cron (connue via cg_run ou l'import de crontab).
// Beaucoup de pannes « marche à la main, pas en cron » se lisent dans la commande elle-même :
// % non échappé, mot de passe après « -p » espacé, -e ssh sans guillemets, syntaxe bash sous sh…
// Une règle n'explique une panne que si la ligne d'erreur correspondante est dans les logs ;
// sans logs (import), lintCommand(cmd) liste les risques pour les prévenir.
// Les causes ne recopient jamais la commande : elle peut contenir un mot de passe.
import type { Finding } from './run-context'

interface Rule extends Finding { test: (cmd: string) => boolean; when: RegExp }

const RULES: Rule[] = [
  { id: 'cmd-percent', category: 'code',
    test: c => /(^|[^\\])%/.test(c),
    when: /unexpected EOF while looking for matching|EOF in backquote|unterminated quoted string|bad ` sign|Syntax error/i,
    cause: "La commande contient un % non échappé : dans une crontab, % est un saut de ligne, la commande est coupée à cet endroit.",
    action: 'Échapper chaque % en \\% dans la crontab (ex. date +\\%Y\\%m\\%d), ou déplacer la commande dans un script.' },
  { id: 'cmd-mysql-p-space', category: 'database',
    test: c => /\bmysql(dump|admin)?\b[^|;&]*\s-p\s+[^-\s]/.test(c),
    when: /using password: NO|Access denied for user|Enter password|1045/i,
    cause: "Le mot de passe est séparé de -p par un espace : mysql le prend pour un nom de base et n'envoie aucun mot de passe.",
    action: 'Coller le mot de passe à -p (-pMOTDEPASSE), ou mieux le mettre dans un fichier d\'options (--defaults-extra-file, chmod 600).' },
  { id: 'cmd-rsync-e-unquoted', category: 'code',
    test: c => /\brsync\b[^|;&]*\s-e\s+ssh\s+-/.test(c),
    when: /rsync|link_stat|No such file or directory/i,
    cause: "L'option -e de rsync n'est pas entre guillemets : seul « ssh » est pris comme commande, ses options deviennent des fichiers à copier.",
    action: 'Mettre toute la commande ssh entre guillemets : rsync -e "ssh -i ~/.ssh/cle -p 22" …' },
  { id: 'cmd-bashism-sh', category: 'code',
    test: c => /^\s*(\/bin\/)?sh\s/.test(c) || /(^|[;&|]\s*)(source\s|\.\s+\S*activate)|<\(/.test(c),
    when: /source: not found|activate: not found|Syntax error|Bad substitution|failed to open files-from|\[\[: not found/i,
    cause: 'La commande utilise une syntaxe bash (source, <( ), [[ ]]) mais elle est exécutée par sh, qui ne la comprend pas.',
    action: 'Lancer le script avec bash (bash script.sh, shebang #!/bin/bash) ou mettre SHELL=/bin/bash en tête de la crontab.' },
  { id: 'cmd-unquoted-subst', category: 'code',
    test: c => /(^|[\s=\/])[^"'\s]*\$\([^)]*\)/.test(c) && !/"[^"]*\$\([^)]*\)[^"]*"/.test(c),
    when: /No such file or directory|Cannot open|ambiguous redirect|too many arguments/i,
    cause: 'Une substitution $(…) non entre guillemets fait partie d\'un chemin : si elle produit un espace, le chemin est coupé en deux.',
    action: 'Mettre le chemin entre guillemets doubles : "…/fichier_$(date +\\%F).log".' },
  { id: 'cmd-relative-path', category: 'code',
    test: c => { const first = c.trim().replace(/^(sudo\s+|nice\s+|\w+=\S+\s+)+/, '').split(/\s+/)[0] ?? ''; return /^(\.\.?\/|[\w.-]+\.(sh|py|php|rb|pl|js)$)/.test(first) },
    when: /No such file or directory|not found|can't open file|Failed opening/i,
    cause: 'La commande appelle un script par un chemin relatif : sous cron, le dossier courant est le HOME de l\'utilisateur, pas celui du script.',
    action: 'Utiliser le chemin absolu du script, ou faire cd /chemin/du/projet && avant la commande.' },
  { id: 'cmd-sudo', category: 'dependency',
    test: c => /(^|[;&|]\s*)sudo\s/.test(c),
    when: /a terminal is required|no tty present|a password is required|sudo: /i,
    cause: 'La commande utilise sudo, qui demande un mot de passe ou un terminal, absents sous cron.',
    action: 'Mettre le job dans la crontab de root (sudo crontab -e) au lieu d\'appeler sudo, ou autoriser cette commande précise sans mot de passe dans sudoers.' },
  // Échecs MASQUÉS (labo terrain 2, g12) : la ligne sort avec 0, ni cron ni CronGuard ne voient la panne. Prévention
  // seulement (when ne correspond jamais : il n'y a pas de log d'échec à expliquer).
  { id: 'cmd-or-masks', category: 'code',
    test: c => /\|\|\s*(mailx?|sendmail|echo|printf|true|:|logger|exit\s+0)\b/.test(c),
    when: /(?!)/,
    cause: "Après « || », la commande de secours réussit quand le job échoue : la ligne sort avec 0, l'échec n'est plus visible.",
    action: "Retirer le « || … » (CronGuard alerte déjà) ou finir par « exit 1 » : cmd || { mail …; exit 1; }." },
  { id: 'cmd-pipe-masks', category: 'code',
    test: c => /(^|[^|])\|\s*(gzip|bzip2|xz|zstd|tee|logger|mailx?|sendmail)\b/.test(c) && !/pipefail/.test(c),
    when: /(?!)/,
    cause: "Le code de sortie d'un pipe est celui de sa dernière commande (gzip, tee…) : si la première échoue, la ligne sort quand même avec 0.",
    action: "Mettre la commande dans un script bash avec « set -o pipefail », ou vérifier le fichier produit (CG_EXPECT)." },
]

/** La règle qui explique l'échec (ligne d'erreur présente dans les logs), sinon null. */
export function commandFinding(command: string | undefined, logs: string): Finding | null {
  if (!command || !logs) return null
  const r = RULES.find(x => x.test(command) && x.when.test(logs))
  return r ? { id: r.id, category: r.category, cause: r.cause, action: r.action } : null
}

/** Tous les risques d'une commande, sans échec (prévention à l'import). */
export function lintCommand(command: string): Finding[] {
  return RULES.filter(x => x.test(command)).map(({ id, category, cause, action }) => ({ id, category, cause, action }))
}
