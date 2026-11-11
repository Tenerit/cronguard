"""
CronGuard SDK — Python

pip install requests  (seule dépendance)

Usage :
    from cronguard import monitor, CronGuard

    # Décorateur (le plus simple)
    @monitor('ma-ping-key')
    def my_job():
        records = sync_database()
        return {'records': records}

    my_job()

    # Context manager
    with CronGuard('ma-ping-key') as cg:
        records = sync_database()
        cg.set_records(records)

    # Manuel
    cg = CronGuard('ma-ping-key')
    cg.success(records=1500, duration_ms=4200)
    cg.fail(exit_code=1, output=str(e))
"""

import json
import time
import traceback
import functools
import os
import re
from typing import Optional, Callable, Any
import requests

CRONGUARD_URL = os.environ.get('CRONGUARD_URL', 'http://localhost:3000')
TIMEOUT_S = 5


def _runner() -> str:
    """Qui a lancé le job : la cause d'une panne en dépend (crontab, conteneur, systemd, Kubernetes, launchd).
    Signaux posés par le lanceur lui-même ; vide si inconnu."""
    e = os.environ
    if e.get('KUBERNETES_SERVICE_HOST'):
        return 'kubernetes'
    if e.get('INVOCATION_ID'):                       # posé par systemd pour chaque unité lancée
        return 'systemd'
    cron = False
    try:                                             # Linux : un ancêtre s'appelle cron / crond / anacron ?
        pid = os.getppid()
        for _ in range(8):
            if open(f'/proc/{pid}/comm').read().strip() in ('cron', 'crond', 'anacron'):
                cron = True
                break
            pid = int(open(f'/proc/{pid}/stat').read().rsplit(')', 1)[1].split()[1])
            if pid <= 1:
                break
    except Exception:
        pass
    if os.path.exists('/.dockerenv') or os.path.exists('/run/.containerenv'):
        return 'container-cron' if cron else 'container'
    if cron:
        return 'crontab'
    if e.get('XPC_SERVICE_NAME', '0') not in ('', '0'):   # macOS : job lancé par launchd
        return 'launchd'
    return ''


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


def _run_context(output: str = '') -> dict:
    """Environnement réel du job à l'échec (noms, chemins, booléens ; aucune valeur secrète).
    Permet au serveur d'établir les pannes « marche à la main, pas en cron » (locale, HOME, agent SSH…)."""
    import getpass
    try:
        user = getpass.getuser()
    except Exception:
        user = ''
    ctx = {
        'user': user, 'home': os.environ.get('HOME', ''), 'path': os.environ.get('PATH', '')[:1024],
        'shell': os.environ.get('SHELL', ''), 'lang': os.environ.get('LC_ALL') or os.environ.get('LANG') or '',
        'cwd': os.getcwd()[:256], 'display': bool(os.environ.get('DISPLAY')), 'sshAgent': bool(os.environ.get('SSH_AUTH_SOCK')),
        **({'runner': r} if (r := _runner()) else {}),
    }
    out = output[-20000:]
    names = list(dict.fromkeys(m.group(1) for m in re.finditer(r'(?:^|\s)([\w.+-]+): (?:command )?not found', out, re.M)))[:5]
    ctx.update(_cg_login(names))
    paths = _cg_paths(out)
    if paths:
        ctx['paths'] = paths
    return ctx


# Résolution constatée : à l'échec, on garde les seules lignes que lisent les sondes ; à la réussite suivante,
# les MÊMES sondes sont relancées sur ces lignes pour comparer avant/après (même règle que le SDK bash).
_PROBE_LINE = re.compile(r"not found|No such file|Permission denied|cannot open|can.t open|cannot access|cannot stat|Read-only file system")


def _marker(ping_key: str) -> str:
    base = os.environ.get('CG_STATE_DIR') or os.path.join(
        os.environ.get('XDG_STATE_HOME') or os.path.join(os.path.expanduser('~'), '.local', 'state'), 'cronguard')
    return os.path.join(base, re.sub(r'[^A-Za-z0-9_-]', '_', ping_key) + '.fail')


def _remember_failure(ping_key: str, output: str) -> None:
    try:
        path = _marker(ping_key)
        os.makedirs(os.path.dirname(path), mode=0o700, exist_ok=True)
        lines = [l for l in output[-20000:].splitlines() if _PROBE_LINE.search(l)][-20:]
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w') as f:
            f.write(chr(10).join(lines))
    except Exception:
        pass


def _job_command() -> str:
    # Le job Python est le script lancé : son chemin (et ses arguments) entre dans l'empreinte.
    import sys
    return ' '.join(sys.argv)[:1000]


def _job_fingerprint() -> dict:
    import platform
    fp = _cg_fingerprint(_job_command())
    fp['tools']['python'] = platform.python_version()   # l'interpréteur du job, que la ligne de commande ne nomme pas
    return fp


def _save_fingerprint(ping_key: str) -> None:
    try:
        path = _marker(ping_key)[:-5] + '.ok.json'
        os.makedirs(os.path.dirname(path), mode=0o700, exist_ok=True)
        with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), 'w') as f:
            json.dump(_job_fingerprint(), f)
    except Exception:
        pass


def _changes_since_success(ping_key: str) -> list:
    try:
        with open(_marker(ping_key)[:-5] + '.ok.json') as f:
            return _cg_fp_diff(json.load(f), _job_fingerprint())
    except Exception:
        return []


def _resolution_context(ping_key: str) -> Optional[dict]:
    """Contexte relevé à la première réussite après un échec, sinon None."""
    path = _marker(ping_key)
    try:
        with open(path, errors='replace') as f:
            lines = f.read()
        os.remove(path)
    except Exception:
        return None
    return _run_context(lines)


class CronGuard:
    def __init__(self, ping_key: str, base_url: str = CRONGUARD_URL):
        self.ping_key  = ping_key
        self.base_url  = base_url.rstrip('/')
        self._records  = None
        self._start    = None

    # ── API directe ───────────────────────────────────────────────────────────

    def success(self, records: Optional[int] = None, duration_ms: Optional[int] = None):
        # Sorties attendues (CG_EXPECT) : réussi sans le fichier attendu, vide ou pas récrit = échec (code 0).
        spec = os.environ.get('CG_EXPECT')
        if spec:
            started = time.time() - (duration_ms or 0) / 1000
            res = _cg_expect(spec, started)
            bad = [r for r in res if not r['ok']]
            if bad:
                msg = 'cronguard: sortie attendue non conforme : ' + '; '.join('%s (%s)' % (r.get('path') or r['pattern'], r['reason']) for r in bad)
                return self.fail(exit_code=0, output=msg, duration_ms=duration_ms, expect=res)
        self._ping({'status': 'success', 'records': records, 'duration_ms': duration_ms,
                    'context': _resolution_context(self.ping_key)})
        _save_fingerprint(self.ping_key)

    def fail(self, exit_code: int = 1, output: str = '', duration_ms: Optional[int] = None, expect: Optional[list] = None):
        ctx = _run_context(output)
        changed = _changes_since_success(self.ping_key)
        if changed:
            ctx['changed'] = changed
        if expect:
            ctx['expect'] = expect
        self._ping({
            'status':      'fail',
            'exit_code':   exit_code,
            'output':      output[:3000],
            'duration_ms': duration_ms,
            'context':     ctx,
        })
        _remember_failure(self.ping_key, output)

    def set_records(self, count: int):
        """Utilisé dans le context manager pour transmettre le nb de records."""
        self._records = count

    # ── Context manager ───────────────────────────────────────────────────────

    def __enter__(self):
        self._start = time.time()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        duration_ms = int((time.time() - self._start) * 1000) if self._start else None

        if exc_type is None:
            self.success(records=self._records, duration_ms=duration_ms)
        else:
            self.fail(
                exit_code=1,
                output=f"{exc_type.__name__}: {exc_val}\n{''.join(traceback.format_tb(exc_tb))}",
                duration_ms=duration_ms,
            )
        return False  # Ne supprime pas l'exception

    # ── Interne ───────────────────────────────────────────────────────────────

    def _ping(self, payload: dict):
        # Nettoie les None pour ne pas polluer le payload
        body = {k: v for k, v in payload.items() if v is not None}
        try:
            requests.post(
                f"{self.base_url}/ping/{self.ping_key}",
                json=body,
                timeout=TIMEOUT_S,
            )
        except Exception:
            pass  # Ne jamais crasher à cause du monitoring


# ── Décorateur ────────────────────────────────────────────────────────────────

def monitor(ping_key: str, base_url: str = CRONGUARD_URL):
    """
    Décorateur qui wrappe automatiquement une fonction avec le monitoring.

    @monitor('ma-ping-key')
    def my_job():
        ...
        return {'records': 1500}   # 'records' est extrait automatiquement
    """
    def decorator(fn: Callable) -> Callable:
        @functools.wraps(fn)
        def wrapper(*args, **kwargs) -> Any:
            start = time.time()
            try:
                result = fn(*args, **kwargs)
                duration_ms = int((time.time() - start) * 1000)
                records = None
                if isinstance(result, dict):
                    records = result.get('records') or result.get('count')
                CronGuard(ping_key, base_url).success(
                    records=records, duration_ms=duration_ms
                )
                return result
            except Exception as e:
                duration_ms = int((time.time() - start) * 1000)
                CronGuard(ping_key, base_url).fail(
                    exit_code=1,
                    output=traceback.format_exc(),
                    duration_ms=duration_ms,
                )
                raise
        return wrapper
    return decorator
