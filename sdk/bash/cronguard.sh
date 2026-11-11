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
    output=$(tail -c 3000 "$_CG_OUTPUT_FILE" | python3 -c \
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
  rm -f "$_CG_OUTPUT_FILE"

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

  # Exécute la commande en capturant stdout + stderr
  "$@" > "$_CG_OUTPUT_FILE" 2>&1
  local exit_code=$?

  cg_end "$records" "$exit_code"
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
if mode == 'expect':  # ligne 1 : résultats JSON ; ligne 2 : message lisible des sorties non conformes
    res = _cg_expect(sys.argv[5], float(sys.argv[6]))
    print(json.dumps(res))
    print('; '.join('%s (%s)' % (r.get('path') or r['pattern'], r['reason']) for r in res if not r['ok']))
    sys.exit(0)
ctx.update(_cg_login(names))
_p = _cg_paths(out)
if _p:
    ctx['paths'] = _p
if fpfile and os.path.exists(fpfile):   # qu'est-ce qui a changé depuis la dernière réussite ?
    try:
        _ch = _cg_fp_diff(json.load(open(fpfile)), _cg_fingerprint(cmd))
        if _ch:
            ctx['changed'] = _ch
    except Exception:
        pass
if os.environ.get('_CG_EXPECT_JSON'):
    ctx['expect'] = json.loads(os.environ['_CG_EXPECT_JSON'])
sys.stdout.write((',"command":' + json.dumps(cmd) if cmd else '') + ',"context":' + json.dumps(ctx))
PY
}

_cg_ping() {
  curl -s -m 5 -X POST \
    -H "Content-Type: application/json" \
    -d "$2" \
    "${CRONGUARD_URL}/ping/$1" \
    > /dev/null 2>&1 || true   # Silencieux — ne jamais bloquer le job
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
