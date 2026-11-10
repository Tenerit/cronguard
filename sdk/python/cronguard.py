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
    cands = []
    for line in text.splitlines():
        if not re.search(r"No such file|Permission denied|cannot open|can't open|cannot access|cannot stat|Read-only file system", line, re.I):
            continue
        for m in re.finditer(r"'([^'\s]{1,200})'|\"([^\"\s]{1,200})\"|((?:~|\.{1,2})?/[^\s:'\"]{1,200})", line):
            p = next(g for g in m.groups() if g)
            if ('/' in p or '.' in p) and p not in cands:
                cands.append(p)
    res = []
    for p in cands[:5]:
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


class CronGuard:
    def __init__(self, ping_key: str, base_url: str = CRONGUARD_URL):
        self.ping_key  = ping_key
        self.base_url  = base_url.rstrip('/')
        self._records  = None
        self._start    = None

    # ── API directe ───────────────────────────────────────────────────────────

    def success(self, records: Optional[int] = None, duration_ms: Optional[int] = None):
        self._ping({'status': 'success', 'records': records, 'duration_ms': duration_ms})

    def fail(self, exit_code: int = 1, output: str = '', duration_ms: Optional[int] = None):
        self._ping({
            'status':      'fail',
            'exit_code':   exit_code,
            'output':      output[:3000],
            'duration_ms': duration_ms,
            'context':     _run_context(output),
        })

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
