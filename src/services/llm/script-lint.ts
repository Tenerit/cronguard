// Lecture du SCRIPT lancé par le cron (2026-11-13). Beaucoup de pannes « marche à la main, pas en cron » se lisent dans
// le code, avant toute panne : -it sans terminal, ~ entre guillemets, syntaxe bash sans #!, chemins relatifs…
// Règles réglées sur la moitié ENTRAÎNEMENT de eval/github3-raw.json (issues GitHub) et sur les labos terrain.
// Comme command-lint : une règle n'EXPLIQUE une panne que si sa ligne d'erreur (when) est dans les logs ;
// sans logs, lintScript liste les risques (prévention). Les causes ne recopient jamais le script (secrets possibles).
import type { Finding } from './run-context'

type Kind = 'shell' | 'python'
interface Rule extends Finding { kind: Kind; test: (code: string, raw: string) => boolean; when: RegExp; en: [string, string] }

// Lignes de code sans les commentaires (un « # sudo » commenté ne compte pas), fins de ligne Unix.
const code = (s: string, kind: Kind) => s.replace(/\r/g, '').split('\n').filter(l => !/^\s*#/.test(l) || (kind === 'shell' && /^#!/.test(l))).join('\n')
const hasCd = (s: string) => /(^|[;&|]\s*|\s)cd\s+\S/m.test(s) || /chdir\(/.test(s)

const RULES: Rule[] = [
  { id: 'script-crlf', kind: 'shell', category: 'code',
    test: (_c, raw) => /\r\n/.test(raw),
    when: /\$'\\r'|\^M|bad interpreter|\r/,
    cause: "Le script a des fins de ligne Windows (\\r\\n) : le shell lit « #!/bin/bash\\r » ou « commande\\r » et échoue (bad interpreter, $'\\r': command not found).",
    action: "Convertir le script en fins de ligne Unix : dos2unix script.sh (ou sed -i 's/\\r$//' script.sh).",
    en: ["The script has Windows line endings (\\r\\n): the shell reads \"#!/bin/bash\\r\" or \"command\\r\" and fails (bad interpreter, $'\\r': command not found).",
      "Convert the script to Unix line endings: dos2unix script.sh (or sed -i 's/\\r$//' script.sh)."] },
  { id: 'script-docker-tty', kind: 'shell', category: 'dependency',
    test: c => /\bdocker(?:-compose| compose)?\s+(?:run|exec)\b[^\n]*\s-(?:it|ti|t)\b/.test(c),
    when: /not a TTY|not a tty/i,
    cause: "Le script lance docker run/exec avec -t (ou -it) : cron n'a pas de terminal, docker refuse (« the input device is not a TTY »).",
    action: 'Retirer -t : docker exec -i (ou sans option) dans un script lancé par cron.',
    en: ['The script runs docker run/exec with -t (or -it): cron has no terminal, so docker refuses ("the input device is not a TTY").',
      'Drop -t: use docker exec -i (or no option) in a script run by cron.'] },
  { id: 'script-tilde-quoted', kind: 'shell', category: 'code',
    test: c => /["']~\//.test(c),
    when: /No such file|cannot (open|access|stat)|not found/i,
    cause: '« ~ » entre guillemets n\'est jamais remplacé par le dossier personnel : le chemin « ~/… » est cherché tel quel et n\'existe pas.',
    action: 'Écrire "$HOME/…" (ou le chemin absolu) au lieu de "~/…".',
    en: ['A quoted "~" is never replaced by the home directory: the path "~/…" is looked up literally and does not exist.',
      'Write "$HOME/…" (or the absolute path) instead of "~/…".'] },
  { id: 'script-bash-without-shebang', kind: 'shell', category: 'code',
    test: c => !/^\s*#!/.test(c) && /\[\[|\bsource\s|^\s*function\s+\w+|\[ [^\]]*==|\$\{[^}]*\/[^}]*\}|<\(|\w+=\(/m.test(c),
    when: /unexpected operator|not found|Syntax error|Bad substitution/i,
    cause: "Le script n'a pas de ligne #! et utilise une syntaxe bash ([[ ]], ==, source, tableaux) : cron le fait lire par /bin/sh, qui ne la comprend pas.",
    action: 'Ajouter #!/bin/bash en première ligne (et chmod +x), ou lancer « bash script.sh » dans la crontab.',
    en: ['The script has no #! line and uses bash syntax ([[ ]], ==, source, arrays): cron has it read by /bin/sh, which does not understand it.',
      'Add #!/bin/bash as the first line (and chmod +x), or run "bash script.sh" in the crontab.'] },
  { id: 'script-relative-files', kind: 'shell', category: 'code',
    // Pas de cd dans le script ET un fichier désigné en relatif (./x, dossier/x, ou redirection vers un nom nu).
    test: c => !hasCd(c) && /(?:^|\s)(?:\.\.?\/[\w.-]|[<>]\s*(?![\/&$~-])[\w][\w.-]*\.\w+\b)|\b(?:unzip|tar|cat|cp|mv|rm|python3?|php|node)\s+(?:-\S+\s+)*(?![\/$~-])[\w-]+\/[\w./-]+/m.test(c),
    when: /No such file|cannot (open|access|stat)|not found|can't open/i,
    cause: "Le script désigne des fichiers par des chemins relatifs sans faire de cd : sous cron, le dossier courant est le HOME de l'utilisateur, pas celui du script.",
    action: 'Faire cd "$(dirname "$0")" en tête du script, ou utiliser des chemins absolus.',
    en: ["The script uses relative paths without a cd: under cron, the current directory is the user's HOME, not the script's.",
      'Add cd "$(dirname "$0")" at the top of the script, or use absolute paths.'] },
  { id: 'script-interactive-read', kind: 'shell', category: 'code',
    test: c => /(^|[;&|]\s*)read\s+(-p\b|-r\s+\w+\s*$|\w+\s*$)/m.test(c) && !/\bwhile\s+(IFS=\S*\s+)?read\b|\|\s*while\b/.test(c),
    when: /(?!)/,
    cause: 'Le script attend une saisie (read) : sous cron, personne ne répond, la lecture reçoit une entrée vide et le script continue avec une valeur vide.',
    action: 'Passer la valeur en argument ou en variable d\'environnement au lieu de la demander.',
    en: ['The script waits for input (read): under cron nobody answers, the read gets empty input and the script goes on with an empty value.',
      'Pass the value as an argument or an environment variable instead of asking for it.'] },
  { id: 'script-sudo', kind: 'shell', category: 'dependency',
    test: c => /(^|[;&|]\s*|\s)sudo\s/m.test(c),
    when: /a terminal is required|no tty present|a password is required|sudo: /i,
    cause: 'Le script appelle sudo, qui demande un mot de passe ou un terminal, absents sous cron.',
    action: 'Mettre le job dans la crontab de root au lieu d\'appeler sudo, ou autoriser cette commande précise sans mot de passe (sudoers).',
    en: ['The script calls sudo, which asks for a password or a terminal, both missing under cron.',
      "Put the job in root's crontab instead of calling sudo, or allow this exact command without a password (sudoers)."] },
  { id: 'script-desktop-session', kind: 'shell', category: 'dependency',
    test: c => /\b(notify-send|xdotool|xdg-open|gsettings|swww|feh\s+--bg|zenity|osascript|wmctrl|xrandr|pactl|dbus-send)\b/.test(c) && !/\b(DISPLAY|DBUS_SESSION_BUS_ADDRESS|XDG_RUNTIME_DIR|WAYLAND_DISPLAY)=/.test(c),
    when: /display|DBUS|socket|XDG_RUNTIME_DIR|Wayland|Can't open|not running/i,
    cause: "Le script pilote le bureau (notification, fond d'écran, son…) : sous cron, les variables de la session graphique (DISPLAY, DBUS_SESSION_BUS_ADDRESS, XDG_RUNTIME_DIR) sont absentes.",
    action: 'Définir ces variables dans le script (DISPLAY=:0, XDG_RUNTIME_DIR=/run/user/$(id -u), DBUS_SESSION_BUS_ADDRESS=unix:path=$XDG_RUNTIME_DIR/bus).',
    en: ['The script drives the desktop (notification, wallpaper, sound…): under cron the graphical session variables (DISPLAY, DBUS_SESSION_BUS_ADDRESS, XDG_RUNTIME_DIR) are missing.',
      'Set them in the script (DISPLAY=:0, XDG_RUNTIME_DIR=/run/user/$(id -u), DBUS_SESSION_BUS_ADDRESS=unix:path=$XDG_RUNTIME_DIR/bus).'] },
  { id: 'py-relative-open', kind: 'python', category: 'code',
    test: c => !hasCd(c) && !/__file__/.test(c) && /\b(?:open|read_csv|read_excel|read_json|load_workbook|Path|ZipFile|tarfile\.open)\(\s*[rfb]?["'](?![\/~]|[A-Za-z]:|https?:)[^"'\s]+["']/.test(c),
    when: /FileNotFoundError|No such file|Errno 2/i,
    cause: "Le script Python ouvre des fichiers par des chemins relatifs : ils sont résolus depuis le dossier courant, qui sous cron est le HOME de l'utilisateur, pas le dossier du script.",
    action: 'Construire les chemins depuis le script : Path(__file__).parent / "fichier", ou os.chdir(os.path.dirname(os.path.abspath(__file__))) au début.',
    en: ["The Python script opens files by relative paths: they resolve from the current directory, which under cron is the user's HOME, not the script's folder.",
      'Build paths from the script: Path(__file__).parent / "file", or os.chdir(os.path.dirname(os.path.abspath(__file__))) at the start.'] },
  { id: 'py-env-required', kind: 'python', category: 'dependency',
    test: c => /os\.environ\[\s*["'][A-Z][A-Z0-9_]*["']\s*\]/.test(c) && !/load_dotenv|dotenv/.test(c),
    when: /KeyError|is not set|NoneType/i,
    cause: "Le script lit des variables d'environnement obligatoires (os.environ[…]) : définies dans votre shell (.bashrc, .profile), elles n'existent pas sous cron.",
    action: 'Définir ces variables en tête de la crontab, ou les charger depuis un fichier (python-dotenv) dans le script.',
    en: ['The script reads required environment variables (os.environ[…]): defined in your shell (.bashrc, .profile), they do not exist under cron.',
      'Define them at the top of the crontab, or load them from a file (python-dotenv) in the script.'] },
]

/** Langage du script : #! ou extension du chemin ; shell par défaut. */
export function scriptKind(text: string, path = ''): Kind {
  const bang = /^#!\s*(\S+)(?:\s+(\S+))?/.exec(text)
  const interp = bang ? (bang[1].endsWith('/env') ? bang[2] ?? '' : bang[1]) : ''
  return /python/.test(interp) || (!bang && /\.py$/.test(path)) ? 'python' : 'shell'
}

function matching(text: string, path: string): Rule[] {
  const raw = text.slice(0, 50_000), kind = scriptKind(raw, path), c = code(raw, kind)
  return RULES.filter(r => r.kind === kind && r.test(c, raw))
}

/** Tous les risques du script (prévention, sans logs). */
export function lintScript(text: string, path = '', lang: 'fr' | 'en' = 'fr'): Finding[] {
  return matching(text, path).map(r =>
    ({ id: r.id, category: r.category, cause: lang === 'en' ? r.en[0] : r.cause, action: lang === 'en' ? r.en[1] : r.action }))
}

/** La règle du script qui explique l'échec (sa ligne d'erreur est dans les logs), sinon null. */
export function scriptFinding(text: string | undefined, logs: string, path = ''): Finding | null {
  if (!text || !logs) return null
  const r = matching(text, path).find(x => x.when.test(logs))
  return r ? { id: r.id, category: r.category, cause: r.cause, action: r.action } : null
}

/** Risques déjà relevés (ids, sans le texte du script) : celui dont la ligne d'erreur est dans les logs explique l'échec. */
export function explainScriptRisks(risks: string[] | undefined, logs: string): Finding | null {
  if (!risks?.length || !logs) return null
  const r = RULES.find(x => risks.includes(x.id) && x.when.test(logs))
  return r ? { id: r.id, category: r.category, cause: r.cause, action: r.action } : null
}
