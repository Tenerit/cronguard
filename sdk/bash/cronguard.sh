#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# CronGuard — Bash SDK
# Source ce fichier dans ton script : source /usr/local/lib/cronguard.sh
#
# Variables d'environnement :
#   CRONGUARD_URL   (défaut: http://localhost:3000, ton instance auto-hébergée)
#
# Usage :
#   source /usr/local/lib/cronguard.sh
#
#   cg_start "ma-ping-key"           # Démarre le timer
#   ... ton code ...
#   cg_end                            # Envoie success ou fail selon $?
#
#   Ou tout-en-un :
#   cg_run "ma-ping-key" /scripts/backup.sh
#
# ─────────────────────────────────────────────────────────────────────────────

CRONGUARD_URL="${CRONGUARD_URL:-http://localhost:3000}"
_CG_PING_KEY=""
_CG_START_TIME=""
_CG_OUTPUT_FILE=""

# ms depuis epoch. busybox (Alpine) ignore %N et renvoie des secondes : complétées en ms.
_cg_now_ms() {
  local t
  t=$(date +%s%3N 2>/dev/null); t="${t//[!0-9]/}"
  [[ ${#t} -le 10 ]] && t=$(( $(date +%s) * 1000 ))
  echo "$t"
}

# ── cg_start : démarre le chrono, capture stdout/stderr ──────────────────────
cg_start() {
  _CG_PING_KEY="$1"
  _CG_START_TIME=$(_cg_now_ms)
  _CG_OUTPUT_FILE=$(mktemp /tmp/cg_XXXXXX)   # 6 X : minimum de busybox (Alpine), sinon aucun fichier et la sortie est perdue
  export _CG_STEPS_FILE="$_CG_OUTPUT_FILE.steps"   # cg_step l'alimente, y compris depuis le script du job
  # Compteur oom_kill du cgroup v2 au démarrage : à l'échec, un écart = le noyau a tué un processus du job (fait, pas déduction).
  _CG_OOM_START=$(awk '/^oom_kill /{print $2}' "/sys/fs/cgroup$(sed -n 's/^0:://p' /proc/self/cgroup 2>/dev/null)/memory.events" 2>/dev/null)
  export _CG_OOM_START
}

# ── cg_end : envoie le ping avec le statut du dernier exit code ───────────────
# Usage: cg_end [records] [exit_code_override]
cg_end() {
  local records="${1:-}"
  local exit_code="${2:-$?}"           # Capture $? avant qu'il soit écrasé
  local end_time
  end_time=$(_cg_now_ms)
  local duration_ms=$(( end_time - _CG_START_TIME ))

  local output='""' context="" expect_failed=0   # '""' : sans fichier de sortie, le JSON reste valide
  # Sorties attendues (CG_EXPECT) : un code 0 sans le fichier attendu, vide ou pas récrit, est un échec.
  if [[ "$exit_code" -eq 0 && -n "${CG_EXPECT:-}" ]]; then
    local exp exp_json exp_msg
    exp="$(_cg_context_fields expect)"
    exp_json="$(printf '%s\n' "$exp" | head -n 1)"; exp_msg="$(printf '%s\n' "$exp" | sed -n 2p)"
    if [[ "$exp_json" == *'"ok": false'* ]]; then
      expect_failed=1
      export _CG_EXPECT_JSON="$exp_json"
      printf '\ncronguard: sortie attendue non conforme : %s\n' "$exp_msg" >> "$_CG_OUTPUT_FILE"
    fi
  fi
  if [[ -f "$_CG_OUTPUT_FILE" ]]; then
    # Tronque les logs à 3000 chars, échappe les guillemets
    # Secrets masqués ICI, sur la machine du job, avant tout envoi (le serveur masque de nouveau derrière).
    output=$(_cg_context_fields mask)
    [[ -n "$output" ]] || output=$(tail -c 3000 "$_CG_OUTPUT_FILE" | python3 -c \
      "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo '""')
  fi
  # La sonde lit la sortie complète : avant la suppression du fichier.
  # Résolution constatée : à l'échec, on garde les seules lignes que lisent les sondes (commande introuvable,
  # chemin refusé ou absent) ; à la réussite suivante, les MÊMES sondes sont relancées sur ces lignes, pour
  # comparer avant/après. Fichier 600 dans le dossier d'état de l'utilisateur, supprimé à la réussite.
  local marker
  marker="${CG_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/cronguard}/${_CG_PING_KEY//[^A-Za-z0-9_-]/_}.fail"
  if [[ "$exit_code" -ne 0 || $expect_failed -eq 1 ]]; then
    context="$(_cg_context_fields)"   # if, pas && : sûr sous set -e
    ( umask 077; mkdir -p "${marker%/*}" && tail -c 20000 "$_CG_OUTPUT_FILE" \
      | grep -E 'not found|No such file|Permission denied|cannot open|can.t open|cannot access|cannot stat|Read-only file system' \
      | tail -n 20 > "$marker" ) 2>/dev/null || true
  elif [[ -f "$marker" ]]; then
    cp "$marker" "$_CG_OUTPUT_FILE" 2>/dev/null || true
    context="$(_cg_context_fields)"
    rm -f "$marker"
  fi
  # Vraie réussite : empreinte gardée pour répondre, au prochain échec, à « qu'est-ce qui a changé ? ».
  if [[ "$exit_code" -eq 0 && $expect_failed -eq 0 ]]; then _cg_context_fields save >/dev/null; fi
  unset _CG_EXPECT_JSON
  rm -f "$_CG_OUTPUT_FILE" "$_CG_OUTPUT_FILE.steps"

  if [[ "$exit_code" -eq 0 && $expect_failed -eq 0 ]]; then
    _cg_ping "$_CG_PING_KEY" \
      "{\"status\":\"success\",\"exit_code\":0,\"duration_ms\":$duration_ms$([ -n "$records" ] && echo ",\"records\":$records")$context}"
  else
    _cg_ping "$_CG_PING_KEY" \
      "{\"status\":\"fail\",\"exit_code\":$exit_code,\"duration_ms\":$duration_ms,\"output\":$output$context}"
  fi
}

# ── cg_run : exécute une commande et gère le monitoring automatiquement ───────
# Usage: cg_run "ping-key" /chemin/vers/script.sh [args...]
# Usage: cg_run "ping-key" --records-from="SELECT COUNT(*) FROM..." commande
cg_run() {
  local ping_key="$1"; shift
  local records=""

  # Option --records-from="requete sql"
  if [[ "$1" == --records-from=* ]]; then
    local query="${1#*=}"; shift
    records=$(psql "$DATABASE_URL" -t -c "$query" 2>/dev/null | tr -d ' \n')
  fi

  cg_start "$ping_key"
  # Commande envoyée à l'échec (vérifiée côté serveur). Forme de l'import : cg_run KEY bash -c "<cmd>".
  if [[ "${1:-}" == bash && "${2:-}" == -c ]]; then _CG_COMMAND="${3:-}"; else _CG_COMMAND="$*"; fi

  # Chevauchement : l'exécution précédente tourne-t-elle encore ? (pid vivant dans le verrou du job)
  local lock prev=""
  lock="${CG_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/cronguard}/${ping_key//[^A-Za-z0-9_-]/_}.lock"
  [[ -f "$lock" ]] && prev="$(cat "$lock" 2>/dev/null)" && { kill -0 "${prev%% *}" 2>/dev/null || prev=""; }
  export _CG_OVERLAP="$prev"
  if [[ -n "$prev" && "${CG_SKIP_IF_RUNNING:-0}" == 1 ]]; then
    printf 'cronguard: exécution précédente toujours en cours (pid %s) : exécution sautée (CG_SKIP_IF_RUNNING=1)\n' "${prev%% *}" > "$_CG_OUTPUT_FILE"
    cg_end "$records" 75   # EX_TEMPFAIL : signalée comme un échec, la commande n'a pas été lancée
    return 0
  fi
  ( umask 077; mkdir -p "${lock%/*}" && printf '%s %s\n' "$$" "$(date +%s)" > "$lock" ) 2>/dev/null

  # Exécute la commande en capturant stdout + stderr
  "$@" > "$_CG_OUTPUT_FILE" 2>&1
  local exit_code=$?

  cg_end "$records" "$exit_code"
  [[ "$(cat "$lock" 2>/dev/null)" == "$$ "* ]] && rm -f "$lock"   # seulement notre verrou
  return $exit_code
}

# ── cg_ping_success / cg_ping_fail : appels manuels simples ──────────────────
cg_ping_success() {
  local ping_key="$1"
  local records="${2:-}"
  _cg_ping "$ping_key" \
    "{\"status\":\"success\"$([ -n "$records" ] && echo ",\"records\":$records")}"
}

cg_ping_fail() {
  local ping_key="$1"
  local exit_code="${2:-1}"
  local message="${3:-}"
  local escaped
  escaped=$(echo "$message" | python3 -c \
    "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo '""')
  _cg_ping "$ping_key" \
    "{\"status\":\"fail\",\"exit_code\":$exit_code,\"output\":$escaped}"
}

# ── cg_systemd_report : service lancé par un timer systemd ───────────────────
# À mettre en ExecStopPost= (drop-in généré par cronguard-import.sh --systemd) :
#   ExecStopPost=/bin/bash -c 'source /usr/local/lib/cronguard.sh && cg_systemd_report <ping-key> %n'
# systemd ≥ 232 fournit SERVICE_RESULT, EXIT_STATUS et INVOCATION_ID : les logs envoyés sont
# ceux de CETTE exécution (journal filtré par invocation), pas les précédentes.
cg_systemd_report() {
  local ping_key="$1" unit="${2:-}" start end duration="" code output
  if [[ -n "$unit" ]]; then
    start=$(systemctl show -P ExecMainStartTimestampMonotonic "$unit" 2>/dev/null)
    end=$(systemctl show -P ExecMainExitTimestampMonotonic "$unit" 2>/dev/null)
    [[ "$start" =~ ^[1-9][0-9]*$ && "$end" =~ ^[1-9][0-9]*$ && $end -ge $start ]] && duration=",\"duration_ms\":$(( (end - start) / 1000 ))"
  fi
  if [[ "${SERVICE_RESULT:-success}" == success ]]; then
    _cg_ping "$ping_key" "{\"status\":\"success\",\"exit_code\":0$duration}"
    return 0
  fi
  # EXIT_STATUS vaut un nombre, ou un nom de signal (KILL, TERM…) quand le service a été tué.
  code="${EXIT_STATUS:-1}"; [[ "$code" =~ ^[0-9]+$ ]] || code=1
  output=$( { journalctl -q -o cat "_SYSTEMD_INVOCATION_ID=${INVOCATION_ID:-none}" 2>/dev/null | tail -c 2800
              echo "systemd: unit=$unit result=$SERVICE_RESULT exit_status=${EXIT_STATUS:-?}"; } | python3 -c \
    "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo '""')
  _cg_ping "$ping_key" "{\"status\":\"fail\",\"exit_code\":$code$duration,\"output\":$output}"
}

# ── Interne ───────────────────────────────────────────────────────────────────
# Sonde de contexte, à l'échec seulement : l'environnement RÉEL du cron (utilisateur, HOME, PATH,
# shell, locale, DISPLAY / agent SSH présents ou non) et, pour chaque « X: not found » de la sortie,
# l'endroit où X existe sur la machine. Noms, chemins et booléens : aucune valeur secrète.
# Renvoie ',"command":…,"context":{…}' à concaténer au JSON, ou rien si python3 manque.
_cg_context_fields() {
  local out="${_CG_OUTPUT_FILE:-}"
  [[ -n "$out" ]] && command -v cygpath >/dev/null 2>&1 && out="$(cygpath -w "$out")"   # Git Bash : python Windows
  local sdir="${CG_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/cronguard}"
  python3 - "$out" "${_CG_COMMAND:-}" "${1:-ctx}" "$sdir/${_CG_PING_KEY//[^A-Za-z0-9_-]/_}.ok.json" \
    "${CG_EXPECT:-}" "$(( ${_CG_START_TIME:-0} / 1000 ))" 2>/dev/null <<'PY' || true
import getpass, glob, json, os, re, sys
out = open(sys.argv[1], errors='replace').read()[-20000:] if sys.argv[1] and os.path.exists(sys.argv[1]) else ''
names = list(dict.fromkeys(m.group(1) for m in re.finditer(r'(?:^|\s)([\w.+-]+): (?:command )?not found', out, re.M)))[:5]
home = os.environ.get('HOME') or os.path.expanduser('~')   # HOME du cron (Windows ignore HOME dans expanduser)
homes = list(dict.fromkeys([home, '/root'] + glob.glob('/home/*')))
dirs = ['/usr/local/bin', '/usr/local/sbin', '/usr/sbin', '/sbin', '/snap/bin', '/opt/*/bin',
        '/usr/local/rvm/bin', '/usr/local/rvm/gems/*/bin', '/usr/local/rvm/rubies/*/bin']
for h in homes:
    dirs += [h + s for s in ('/.local/bin', '/bin', '/.rvm/bin', '/.rvm/gems/*/bin', '/.nvm/versions/node/*/bin',
                             '/.pyenv/shims', '/.rbenv/shims', '/.cargo/bin', '/go/bin', '/.npm-global/bin')]
found = {}
for n in names:
    for d in dirs:
        hit = next((p for p in sorted(glob.glob(os.path.join(d, n))) if os.access(p, os.X_OK)), None)
        if hit:
            found[n] = hit
            break
try:
    user = getpass.getuser()           # USER est souvent absent sous cron
except Exception:
    user = ''
ctx = {'user': user, 'home': home, 'path': os.environ.get('PATH', ''), 'shell': os.environ.get('SHELL', ''),
       'lang': os.environ.get('LC_ALL') or os.environ.get('LANG') or '', 'cwd': os.getcwd(),
       'display': bool(os.environ.get('DISPLAY')), 'sshAgent': bool(os.environ.get('SSH_AUTH_SOCK'))}
if found:
    ctx['found'] = found
# Lanceur (même règle que sdk/python _runner) : la cause d'une panne en dépend.
runner, cron, pid = '', False, os.getppid()
try:
    for _ in range(8):
        if open('/proc/%d/comm' % pid).read().strip() in ('cron', 'crond', 'anacron'):
            cron = True
            break
        pid = int(open('/proc/%d/stat' % pid).read().rsplit(')', 1)[1].split()[1])
        if pid <= 1:
            break
except Exception:
    pass
if os.environ.get('KUBERNETES_SERVICE_HOST'):
    runner = 'kubernetes'
elif os.environ.get('INVOCATION_ID'):
    runner = 'systemd'
elif os.path.exists('/.dockerenv') or os.path.exists('/run/.containerenv'):
    runner = 'container-cron' if cron else 'container'
elif cron:
    runner = 'crontab'
elif os.environ.get('XPC_SERVICE_NAME', '0') not in ('', '0'):
    runner = 'launchd'
if runner:
    ctx['runner'] = runner
# >>> cg-probes (copie identique dans sdk/python/cronguard.py, vérifiée par tests/sdk-probes.test.ts)
# Commandes de test, à l'échec seulement, en lecture seule (3 s max) : CronGuard ne devine pas, il constate.
#  1. Votre shell de connexion (là où le job « marche à la main ») : son PATH, où il trouve les commandes
#     introuvables sous cron, et les NOMS des variables qu'il a et que le cron n'a pas (jamais les valeurs).
#  2. Les chemins cités par l'erreur : existent-ils, relatifs ou non, propriétaire, droits de l'utilisateur du job.
# CG_PROBE_LOGIN=0 désactive la sonde 1 (shell de connexion lent ou bavard).
import subprocess
def _cg_login(names):
    if os.environ.get('CG_PROBE_LOGIN') == '0':
        return {}
    try:
        import pwd
        sh = pwd.getpwuid(os.getuid()).pw_shell or '/bin/sh'
    except Exception:
        sh = '/bin/sh'
    script = 'printf "__CG_PATH=%s\\n" "$PATH"; '
    for n in names:
        if re.match(r'^[\w.+-]+$', n):
            script += 'printf "__CG_W_%s=%s\\n" "' + n + '" "$(command -v -- \'' + n + '\' 2>/dev/null)"; '
    script += 'env'
    try:
        r = subprocess.run([sh, '-lic', script], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                           stderr=subprocess.DEVNULL, timeout=3, cwd=os.path.expanduser('~'))
    except Exception:
        return {}
    res, seen, where = {}, set(), {}
    for line in r.stdout.decode('utf-8', 'replace').splitlines():
        if line.startswith('__CG_PATH='):
            res['loginPath'] = line[10:][:1024]
        elif line.startswith('__CG_W_'):
            k, _, v = line[7:].partition('=')
            if v.startswith('/'):
                where[k] = v[:256]
        else:
            m = re.match(r'([A-Za-z_][A-Za-z0-9_]*)=', line)
            if m:
                seen.add(m.group(1))
    noise = ('_', 'SHLVL', 'PWD', 'OLDPWD', 'PS1', 'PS2', 'PS4', 'TERM', 'COLUMNS', 'LINES', 'MAIL', 'PROMPT_COMMAND')
    only = sorted(n for n in seen - set(os.environ)
                  if n not in noise and not n.startswith(('BASH_', 'HIST', 'LESS', 'LS_', '__CG')))
    if only:
        res['loginOnlyVars'] = only[:40]
    if where:
        res['loginFound'] = where
    return res
def _cg_paths(text):
    cands, denied = [], set()
    for line in text.splitlines():
        if not re.search(r"No such file|Permission denied|cannot open|can't open|cannot access|cannot stat|Read-only file system", line, re.I):
            continue
        # Chemin non cité : jeton entier depuis un début de mot (« data/input.csv », pas « /input.csv »).
        for m in re.finditer(r"'([^'\s]{1,200})'|\"([^\"\s]{1,200})\"|(?:^|[\s(=])((?:~|\.{1,2})?/?[\w.@+-]+(?:/[\w.@+-]+)+)", line):
            p = next(g for g in m.groups() if g)
            if ('/' in p or '.' in p) and p not in cands:
                cands.append(p)
            if ('/' in p or '.' in p) and re.search(r"Permission denied|Read-only file system", line, re.I):
                denied.add(p)
    todo = []
    for p in cands:
        todo.append(p)
        par = os.path.dirname(os.path.expanduser(p))
        if (p in denied or not os.path.exists(os.path.expanduser(p))) and par and os.path.isdir(par) and par not in todo:
            todo.append(par)   # fichier à créer ou refusé : le dossier parent porte les droits (relevé aussi à la réussite)
    res = []
    for p in todo[:5]:
        q = os.path.expanduser(p)
        d = {'path': p[:256], 'relative': not os.path.isabs(q), 'exists': os.path.exists(q)}
        if d['exists']:
            s = os.stat(q)
            try:
                import pwd
                d['owner'] = pwd.getpwuid(s.st_uid).pw_name
            except Exception:
                d['owner'] = str(s.st_uid)
            d['mode'] = oct(s.st_mode & 0o777)[2:]
            d['readable'] = os.access(q, os.R_OK)
            d['writable'] = os.access(q, os.W_OK)
        res.append(d)
    return res
import time
# Empreinte d'une exécution réussie (2026-11-11) : ce qui permet de répondre à « qu'est-ce qui a changé depuis la
# dernière réussite ? ». Noms, chemins, tailles, dates, versions : jamais une valeur de variable ni un contenu de fichier.
# Versions : seulement pour des outils connus (un --version sur un script quelconque pourrait avoir des effets).
_CG_TOOLS = ('pg_dump', 'pg_restore', 'psql', 'mysqldump', 'mysql', 'mongodump', 'redis-cli', 'rsync', 'curl', 'wget',
             'tar', 'gzip', 'zstd', 'python', 'python3', 'node', 'php', 'ruby', 'java', 'perl', 'aws', 'gcloud', 'az',
             'docker', 'kubectl', 'git', 'rclone', 'restic', 'borg', 'openssl', 'ssh', 'scp', 'gpg', 'bundle', 'rake')
def _cg_fingerprint(cmd):
    import hashlib, shlex, shutil
    fp = {'command': hashlib.sha256(cmd.encode()).hexdigest()[:16] if cmd else '', 'path': os.environ.get('PATH', '')[:1024],
          'cwd': os.getcwd()[:256], 'vars': sorted(k for k in os.environ if re.match(r'^[A-Z][A-Z0-9_]*$', k))[:200],
          'files': {}, 'tools': {}}
    try:
        words = shlex.split(cmd)
    except Exception:
        words = cmd.split()
    for w in words[:40]:
        p = os.path.expanduser(w)
        if ('/' in w or '.' in w) and os.path.isfile(p):
            st = os.stat(p)
            fp['files'][w[:200]] = '%d:%d' % (st.st_size, int(st.st_mtime))
    for w in words[:20]:
        name = os.path.basename(w)
        if name in _CG_TOOLS and name not in fp['tools']:
            exe = shutil.which(w)
            if not exe:
                continue
            try:
                r = subprocess.run([exe, '--version'], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT, timeout=2)
                line = r.stdout.decode('utf-8', 'replace').strip().splitlines()
                fp['tools'][name] = (line[0] if line else '')[:120]
            except Exception:
                pass
    return fp
def _cg_fp_diff(old, new):
    import time
    ch = []
    if old.get('command') and old.get('command') != new.get('command'):
        ch.append({'kind': 'command', 'label': 'commande modifiée'})
    for k, label in (('path', 'PATH'), ('cwd', 'dossier de lancement')):
        if old.get(k) is not None and old.get(k) != new.get(k):
            ch.append({'kind': 'env', 'label': label, 'before': str(old.get(k))[:256], 'after': str(new.get(k))[:256]})
    gone = sorted(set(old.get('vars', [])) - set(new.get('vars', [])))
    for v in gone[:10]:
        ch.append({'kind': 'var', 'label': 'variable %s absente depuis la dernière réussite' % v})
    show = lambda s: '—' if s is None else '%s octets, %s' % (s.split(':')[0], time.strftime('%Y-%m-%d %H:%M', time.localtime(int(s.split(':')[1]))))
    of, nf = old.get('files', {}), new.get('files', {})
    for f in sorted(set(of) | set(nf)):
        if of.get(f) != nf.get(f) and (f in of):
            ch.append({'kind': 'file', 'label': '%s modifié depuis la dernière réussite' % f if f in nf else '%s disparu' % f,
                       'before': show(of.get(f)), 'after': show(nf.get(f))})
    ot, nt = old.get('tools', {}), new.get('tools', {})
    for t in sorted(set(ot) & set(nt)):
        if ot[t] != nt[t]:
            ch.append({'kind': 'tool', 'label': 'version de %s' % t, 'before': ot[t], 'after': nt[t]})
    return ch[:20]
# Sorties attendues (CG_EXPECT) : « le job a réussi mais n'a rien produit ». Chaque élément, séparé par « ; » :
# un motif de fichier, puis min=1M (taille minimale) et age=26h (âge maximal ; par défaut : modifié pendant CETTE exécution).
def _cg_expect(spec, started):
    import glob as g
    units = {'k': 1024, 'm': 1024 ** 2, 'g': 1024 ** 3, '': 1}
    secs = {'s': 1, 'm': 60, 'h': 3600, 'd': 86400}
    out = []
    for item in [x.strip() for x in (spec or '').split(';') if x.strip()][:5]:
        parts = item.split()
        pattern, opts = os.path.expanduser(parts[0]), dict(p.split('=', 1) for p in parts[1:] if '=' in p)
        m = re.match(r'^(\d+)([kKmMgG]?)$', opts.get('min', '1'))
        minimum = int(m.group(1)) * units[m.group(2).lower()] if m else 1
        a = re.match(r'^(\d+)([smhd])$', opts.get('age', ''))
        oldest = time.time() - int(a.group(1)) * secs[a.group(2)] if a else started - 2
        hits = sorted(g.glob(pattern), key=lambda p: os.path.getmtime(p) if os.path.exists(p) else 0)
        res = {'pattern': parts[0][:200], 'ok': False}
        if not hits:
            res['reason'] = 'absent'
        else:
            p = hits[-1]
            st = os.stat(p)
            res.update({'path': p[:200], 'size': st.st_size, 'mtime': int(st.st_mtime)})
            if st.st_mtime < oldest:
                res['reason'] = 'pas modifié pendant cette exécution' if not a else 'plus vieux que %s' % opts['age']
            elif st.st_size < minimum:
                res['reason'] = 'vide' if st.st_size == 0 else 'trop petit (%d octets, minimum %d)' % (st.st_size, minimum)
            else:
                res['ok'] = True
        out.append(res)
    return out
# Mémoire et disque (2026-11-11) : des faits au lieu de « code 137, probablement la mémoire ». Compteur oom_kill du
# cgroup v2 du job (avant/après l'exécution), limite et pic mémoire, espace libre des dossiers concernés.
def _cg_cgroup_dir():
    try:
        for line in open('/proc/self/cgroup'):
            if line.startswith('0::'):
                return '/sys/fs/cgroup' + line[3:].strip().rstrip('/')
    except Exception:
        pass
    return None
def _cg_oom_kills():
    d = _cg_cgroup_dir()
    try:
        for line in open(d + '/memory.events'):
            if line.startswith('oom_kill '):
                return int(line.split()[1])
    except Exception:
        pass
    return None
def _cg_resources(oom_start, paths, text=''):
    res, d = {}, _cg_cgroup_dir()
    now = _cg_oom_kills()
    if oom_start not in (None, '') and now is not None and now > int(oom_start):
        res['oomKills'] = now - int(oom_start)
    for name, key in (('memory.max', 'memMax'), ('memory.peak', 'memPeak')):
        try:
            v = open(d + '/' + name).read().strip()
            res[key] = v[:32]
        except Exception:
            pass
    disk, seen = [], set()
    # Chemins cités par une erreur d'espace disque (« error writing '/full/big': No space left ») : c'est leur volume
    # qu'il faut mesurer, pas seulement le dossier de lancement (défaut trouvé par le labo du 11/11).
    full = [m.group(1) or m.group(2) for line in text.splitlines() if re.search(r'No space left|ENOSPC|Disk quota exceeded|disk full', line, re.I)
            for m in re.finditer(r"'(/[^']+)'|(?:^|\s)(/[\w./@+-]+)", line)]
    for p in full[:3] + [os.getcwd()] + [x['path'] for x in paths if x.get('exists')]:
        q = os.path.expanduser(p)
        q = q if os.path.isdir(q) else os.path.dirname(q) or '.'
        try:
            st = os.statvfs(q)
        except Exception:
            continue
        key = (st.f_fsid if hasattr(st, 'f_fsid') else q)
        if key in seen:
            continue
        seen.add(key)
        disk.append({'path': p[:200], 'free': st.f_bavail * st.f_frsize, 'total': st.f_blocks * st.f_frsize})
    if disk:
        res['disk'] = disk[:4]
    return res
# Réseau : pour les hôtes cités par une erreur réseau, résolution DNS puis connexion TCP (2 s max chacune), vers
# ces seuls hôtes, sans rien envoyer. CG_PROBE_NET=0 désactive.
_CG_PORTS = {'http': 80, 'https': 443, 'ftp': 21, 'postgres': 5432, 'postgresql': 5432, 'mysql': 3306, 'redis': 6379,
             'amqp': 5672, 'mongodb': 27017, 'smtp': 25, 'ldap': 389, 'ssh': 22}
def _cg_net(text, cmd=''):
    import socket
    if os.environ.get('CG_PROBE_NET') == '0':
        return []
    url = r'\b([a-z][a-z0-9+.-]*)://(?:[^@/\s]+@)?([A-Za-z0-9.-]+)(?::(\d{1,5}))?'
    cands, neterr = [], False
    for line in text.splitlines():
        if not re.search(r'refused|timed? ?out|resolve|unreachable|could not connect|couldn.t connect|no route|getaddrinfo|ENOTFOUND|ECONNREFUSED|EHOSTUNREACH|Name or service not known|Temporary failure in name resolution|Connection reset', line, re.I):
            continue
        neterr = True
        for m in re.finditer(url, line):
            cands.append((m.group(2), int(m.group(3)) if m.group(3) else _CG_PORTS.get(m.group(1).lower())))
        for m in re.finditer(r'\b((?:[A-Za-z0-9-]+\.)+[A-Za-z0-9-]+|localhost|\d+\.\d+\.\d+\.\d+)(?::|,? port | port )(\d{1,5})\b', line):
            cands.append((m.group(1), int(m.group(2))))
        for m in re.finditer(r'resolve host:? \'?([A-Za-z0-9.-]+)', line):
            cands.append((m.group(1), None))
    if neterr:   # l'erreur est réseau : les URL de la commande donnent souvent le port que le message tait
        for m in re.finditer(url, cmd):
            cands.append((m.group(2), int(m.group(3)) if m.group(3) else _CG_PORTS.get(m.group(1).lower())))
    best = {}
    for host, port in cands:   # un hôte : la version avec port l'emporte
        if host not in best or (best[host] is None and port):
            best[host] = port
    out = []
    for host, port in list(best.items())[:3]:
        r = {'host': host[:253], 'port': port or 0}
        try:
            ip = socket.getaddrinfo(host, port or 80, proto=socket.IPPROTO_TCP)[0][4][0]
            r['dns'] = 'ok'
        except Exception:
            r['dns'] = 'fail'
            out.append(r)
            continue
        if not port:
            out.append(r)
            continue
        s = None
        try:
            s = socket.create_connection((ip, port), timeout=2)
            r['tcp'] = 'open'
        except ConnectionRefusedError:
            r['tcp'] = 'refused'
        except socket.timeout:
            r['tcp'] = 'timeout'
        except OSError:
            r['tcp'] = 'unreachable'
        finally:
            if s:
                s.close()
        out.append(r)
    return out
# Secrets masqués sur la machine du job, avant tout envoi (mêmes formats que le masquage du serveur, qui repasse derrière).
_CG_MASK = [
    r'(?i)\b(?:password|passwd|pwd|secret)\s*[:=]\s*(?!(?:YES|NO)\b)(\S+)',
    r'(?i)\b[a-z][a-z0-9+.-]*://[^\s:/@]+:([^\s@/]+)@',
    r'(?i)\bbearer\s+([A-Za-z0-9_\-.]{20,})',
    r'(?i)\bAuthorization:\s*(?:Basic|Bearer|Token)\s+([A-Za-z0-9+/=._-]{8,})',
    r'(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)',
    r'\b(AKIA[0-9A-Z]{16})\b', r'(?i)\baws_secret_access_key[\s=:]+([A-Za-z0-9/+]{40})',
    r'(?i)\b((?:sk|pk|rk|re)_(?:live|test|prod|staging)_[A-Za-z0-9_-]{16,})',
    r'(?i)\b(?:api[_-]?key|x-api-key|apikey|auth[_-]?token|access[_-]?token|secret[_-]?key)\s*[=:]\s*([A-Za-z0-9_\-.]{20,})',
    r'\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{22,}|glpat-[A-Za-z0-9_-]{20,})',
    r'\b(xox[abposr]-[A-Za-z0-9-]{10,})', r'hooks\.slack\.com/services/([A-Za-z0-9]+/[A-Za-z0-9]+/[A-Za-z0-9]+)',
    r'\b(AIza[0-9A-Za-z_-]{30,})', r'\b(sk-(?:proj-|ant-[a-z0-9]+-)?[A-Za-z0-9_-]{20,})',
    r'\b(SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,})', r'\b(npm_[A-Za-z0-9]{30,}|pypi-[A-Za-z0-9_-]{30,})',
    r'/bot(\d{6,}:[A-Za-z0-9_-]{30,})', r'\b(?:AccountKey|SharedAccessKey|sig)=([A-Za-z0-9+/%=]{20,})',
    r'-----BEGIN [A-Z ]*PRIVATE KEY-----([\s\S]*?)-----END [A-Z ]*PRIVATE KEY-----',
    r'\bcurl\b[^\n]*?\s(?:-u|--user)\s+[^\s:]+:(\S+)',
    r'(?:\b(?:docker|podman|helm|oras)\s+(?:registry\s+)?login\b[^\n]*?\s-p|--password)(?:\s+|=)(?![-$])[\'"]?([^\s\'"]{4,})',
    r'(?i)\b(?:mysql(?:dump|admin|import)?)\b[^\n|;&]*?\s-p(?!\s)([^\s]+)', r'(?i)\bsshpass\s+-p\s*(\S+)',
    r'\b[A-Z][A-Z0-9_]*(?:PASS|PASSWORD|PASSWD|PWD|TOKEN|SECRET|API_KEY|APIKEY|PRIVATE_KEY|AUTH)\s*=\s*[\'"]?([^\s\'"]{4,})',
    r'(?i)"(?:api_?key|apiKey|token|secret|password|passwd|access_?token|client_?secret|private_?key(?:_?id)?)"\s*:\s*"([^"]{6,})"',
    r'\b(key-[0-9a-f]{32})\b', r'\b(do[por]_v1_[a-f0-9]{64})\b', r'\b(whsec_[A-Za-z0-9]{24,})\b',
    r'https://([0-9a-f]{32})@[\w.-]*sentry\.io', r'\bldap\w+\b[^\n]*?\s-w\s+[\'"]?([^\s\'"]{4,})',
    r'(?:^|\s)AUTH\s+(?!\[)([^\s]{6,})', r'(?im)^\s*[a-z_]*(?:secret|password|passwd|token|api_?key)[a-z_]*\s*=\s*(\S{4,})',
]
def _cg_mask(text):
    vals = set()
    for pat in _CG_MASK:
        for m in re.finditer(pat, text, re.M):
            v = next((g for g in m.groups() if g), m.group(0))
            if v and len(v) >= 4 and not re.match(r'^\$\{?\w+\}?$', v) and '[REDACTED' not in v:
                vals.add(v)
    for v in sorted(vals, key=len, reverse=True):
        text = text.replace(v, '[REDACTED]')
    return text
# Étapes du job (cg_step « dump », « upload »…) : fichier tenu par le SDK pendant l'exécution, lu à la fin.
def _cg_steps():
    f = os.environ.get('_CG_STEPS_FILE')
    out = []
    try:
        for line in open(f):
            at, _, name = line.strip().partition(' ')
            if at.isdigit() and name:
                out.append({'name': name[:60], 'at': int(at)})
    except Exception:
        pass
    return out[-20:]
# Chevauchement : l'exécution précédente du même job tournait encore (pid vivant au démarrage de celle-ci).
def _cg_overlap():
    v = os.environ.get('_CG_OVERLAP', '').split()
    return {'pid': int(v[0]), 'since': int(v[1])} if len(v) == 2 and v[0].isdigit() and v[1].isdigit() else None
# cronguard doctor : vérifie une commande comme cron la lancera, SANS l'exécuter (avant la première panne).
_CG_CRON_VARS = ('HOME', 'LOGNAME', 'PATH', 'SHELL', 'USER', 'PWD', 'MAILTO')
def _cg_doctor(cmd, cron_path='/usr/bin:/bin'):
    import shlex, shutil
    issues = []
    try:
        words = shlex.split(cmd)
    except Exception:
        words = cmd.split()
    exe = next((w for w in words if '=' not in w and w not in ('sudo', 'env', 'nice', 'ionice', 'timeout', 'flock', 'cd', '&&')), '')
    if exe and '/' not in exe and not shutil.which(exe, path=cron_path):
        where = shutil.which(exe) or (_cg_login([exe]).get('loginFound') or {}).get(exe)
        issues.append('« %s » est introuvable dans le PATH de cron (%s)%s' % (exe, cron_path, ' ; trouvé dans %s : chemin absolu ou PATH= en tête de crontab' % os.path.dirname(where) if where else ''))
    assigned = {w.split('=', 1)[0] for w in words if re.match(r'^[A-Za-z_][A-Za-z0-9_]*=', w)}
    for v in dict.fromkeys(re.findall(r'\$\{?([A-Za-z_][A-Za-z0-9_]*)', cmd)):
        if v not in _CG_CRON_VARS and v not in assigned:
            issues.append('variable $%s : absente sous cron, sauf si la crontab la définit' % v)
    for w in words:
        if w.startswith(('>', '<', '2>')) or w in ('>', '>>', '2>', '<'):
            continue
        if ('/' in w and not w.startswith(('/', '~', '$', '-')) and not re.match(r'^[a-z]+://', w)) or w.startswith('./'):
            issues.append('chemin relatif « %s » : cron démarre dans le HOME de l\'utilisateur, pas dans le dossier du script' % w)
    for m in re.finditer(r'(?:^|\s)\d?>>?\s*(/[^\s;|&]+)', cmd):
        d = os.path.dirname(m.group(1)) or '/'
        if not os.path.isdir(d):
            issues.append('redirection vers %s : le dossier %s n\'existe pas' % (m.group(1), d))
        elif not os.access(d, os.W_OK):
            issues.append('redirection vers %s : le dossier %s n\'est pas modifiable par %s' % (m.group(1), d, os.environ.get('USER') or 'cet utilisateur'))
    if re.search(r'(?<!\\)%', cmd):
        issues.append('« % » non échappé : dans une crontab, il coupe la commande (écrire \\%)')
    return issues
# <<< cg-probes
cmd = sys.argv[2][:1000]
mode = sys.argv[3] if len(sys.argv) > 3 else 'ctx'
fpfile = sys.argv[4] if len(sys.argv) > 4 else ''
if mode == 'save':   # empreinte de cette réussite, pour la comparer au prochain échec (fichier 600)
    try:
        os.makedirs(os.path.dirname(fpfile), mode=0o700, exist_ok=True)
        with os.fdopen(os.open(fpfile, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), 'w') as f:
            json.dump(_cg_fingerprint(cmd), f)
    except Exception:
        pass
    sys.exit(0)
if mode == 'doctor':  # cg_doctor : un risque par ligne, rien si la commande passera sous cron
    for i in _cg_doctor(cmd):
        print('  - ' + i)
    sys.exit(0)
if mode == 'mask':    # sortie envoyée (3 000 derniers caractères), secrets masqués sur la machine du job
    print(json.dumps(_cg_mask(out[-3000:])))
    sys.exit(0)
if mode == 'expect':  # ligne 1 : résultats JSON ; ligne 2 : message lisible des sorties non conformes
    res = _cg_expect(sys.argv[5], float(sys.argv[6]))
    print(json.dumps(res))
    print('; '.join('%s (%s)' % (r.get('path') or r['pattern'], r['reason']) for r in res if not r['ok']))
    sys.exit(0)
ctx.update(_cg_login(names))
_p = _cg_paths(out)
if _p:
    ctx['paths'] = _p
ctx['resources'] = _cg_resources(os.environ.get('_CG_OOM_START'), ctx.get('paths', []), out)
_net = _cg_net(out, cmd)
if _net:
    ctx['net'] = _net
if fpfile and os.path.exists(fpfile):   # qu'est-ce qui a changé depuis la dernière réussite ?
    try:
        _ch = _cg_fp_diff(json.load(open(fpfile)), _cg_fingerprint(cmd))
        if _ch:
            ctx['changed'] = _ch
    except Exception:
        pass
if os.environ.get('_CG_EXPECT_JSON'):
    ctx['expect'] = json.loads(os.environ['_CG_EXPECT_JSON'])
_st = _cg_steps()
if _st:
    ctx['steps'] = _st
    ctx['stepsEnd'] = int(time.time() * 1000)
_ov = _cg_overlap()
if _ov:
    ctx['overlap'] = _ov
sys.stdout.write((',"command":' + json.dumps(cmd) if cmd else '') + ',"context":' + json.dumps(ctx))
PY
}

# Ne jamais perdre une panne : un ping que le serveur n'a pas reçu est gardé sur disque (600, 200 au plus) et
# renvoyé, dans l'ordre, avant le prochain ping de n'importe quel job. Silencieux : ne bloque jamais le job.
_cg_send() {   # vrai si le serveur a répondu 2xx ou 4xx (un 4xx ne passerait pas mieux plus tard)
  local code
  # Sans curl rien ne part : le dire (stderr, donc dans les logs du cron) au lieu de tout garder en file en silence.
  command -v curl >/dev/null 2>&1 || { echo "cronguard: curl not found, ping kept in the queue" >&2; return 1; }
  code=$(curl -s -m 5 -o /dev/null -w '%{http_code}' -X POST -H "Content-Type: application/json" \
    -d "$2" "${CRONGUARD_URL}/ping/$1" 2>/dev/null)
  [[ "$code" =~ ^[24] ]]
}
_cg_ping() {
  local q="${CG_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/cronguard}/queue" f
  if [[ -d "$q" ]]; then
    for f in $(ls -1 "$q" 2>/dev/null | sort | head -n 50); do
      if _cg_send "${f#*__}" "$(cat "$q/$f")"; then rm -f "$q/$f"; else break; fi
    done
  fi
  _cg_send "$1" "$2" && return 0
  # Nom = compteur à zéros devant : l'ordre d'envoi est gardé même dans la même seconde (busybox n'a pas %N).
  ( umask 077; mkdir -p "$q" && n=$(( $(cat "$q/.seq" 2>/dev/null || echo 0) + 1 )) && echo "$n" > "$q/.seq" \
    && printf '%s' "$2" > "$q/$(printf '%012d' "$n")__${1//[^A-Za-z0-9_-]/_}" ) 2>/dev/null
  ls -1 "$q" 2>/dev/null | sort -r | tail -n +201 | while read -r f; do rm -f "$q/$f"; done   # garde les 200 plus récents
  return 0
}

# ── cg_step : marque une étape du job (« cg_step dump », « cg_step upload ») ──
# À l'échec, CronGuard dit dans quelle étape le job s'est arrêté et combien de temps chacune a pris.
cg_step() {
  [[ -n "${_CG_STEPS_FILE:-}" ]] && printf '%s %s\n' "$(_cg_now_ms)" "${1:-étape}" >> "$_CG_STEPS_FILE"
  return 0
}

# ── cg_doctor : vérifie une commande comme cron la lancera, SANS l'exécuter ──
# Usage : cg_doctor "pg_dump -Fc clients > /bak/c.dump"   (code de retour 1 si un risque est trouvé)
cg_doctor() {
  local r
  r="$(_CG_COMMAND="$1" _cg_context_fields doctor)"
  if [[ -z "$r" ]]; then echo "cronguard doctor : rien à signaler pour cette commande sous cron."; return 0; fi
  printf 'cronguard doctor :\n%s\n' "$r"; return 1
}

# ─────────────────────────────────────────────────────────────────────────────
# EXEMPLES D'UTILISATION
# ─────────────────────────────────────────────────────────────────────────────
#
# ── Exemple 1 : wrapper automatique ──────────────────────────────────────────
#   #!/bin/bash
#   source /usr/local/lib/cronguard.sh
#   cg_run "backup-key" /scripts/backup.sh
#
# ── Exemple 2 : avec comptage de records ─────────────────────────────────────
#   #!/bin/bash
#   source /usr/local/lib/cronguard.sh
#   cg_run "sync-key" \
#     --records-from="SELECT COUNT(*) FROM synced_items WHERE date=CURRENT_DATE" \
#     python3 /scripts/sync.py
#
# ── Exemple 3 : contrôle manuel ──────────────────────────────────────────────
#   #!/bin/bash
#   source /usr/local/lib/cronguard.sh
#   cg_start "etl-key"
#
#   RESULT=$(python3 etl.py 2>&1)
#   EXIT=$?
#
#   if [ $EXIT -eq 0 ]; then
#     RECORDS=$(echo "$RESULT" | grep "Processed:" | awk '{print $2}')
#     cg_end "$RECORDS" 0
#   else
#     echo "$RESULT" > "$_CG_OUTPUT_FILE"
#     cg_end "" $EXIT
#   fi
#
# ── Exemple 4 : crontab direct ───────────────────────────────────────────────
#   0 2 * * * source /usr/local/lib/cronguard.sh && cg_run "backup-key" /scripts/backup.sh
