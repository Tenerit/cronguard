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
def _cg_hits(q):
    import glob as g
    return sorted(g.glob(q))[:1] if '*' in q else ([q] if os.path.exists(q) else [])
def _cg_paths(text):
    cands, denied = [], set()
    for line in text.splitlines():
        if not re.search(r"No such file|Permission denied|cannot open|can't open|cannot access|cannot stat|Read-only file system", line, re.I):
            continue
        # Chemin non cité : jeton entier depuis un début de mot (« data/input.csv », pas « /input.csv »).
        for m in re.finditer(r"'([^'\s]{1,200})'|\"([^\"\s]{1,200})\"|(?:^|[\s(=])((?:~|\.{1,2})?/?[\w.@+*-]+(?:/[\w.@+*-]+)+)|(?:^|\s)([\w@+*-]+\.[\w*]{1,10}):\s*(?:No such file|Permission denied|cannot open|can't open|cannot access|cannot stat)", line):
            p = next(g for g in m.groups() if g)
            if ('/' in p or '.' in p) and p not in cands:
                cands.append(p)
            if ('/' in p or '.' in p) and re.search(r"Permission denied|Read-only file system", line, re.I):
                denied.add(p)
    todo = []
    for p in cands:
        todo.append(p)
        par = os.path.dirname(os.path.expanduser(p))
        if (p in denied or not _cg_hits(os.path.expanduser(p))) and par and os.path.isdir(par) and par not in todo:
            todo.append(par)   # fichier à créer ou refusé : le dossier parent porte les droits (relevé aussi à la réussite)
    res = []
    for p in todo[:5]:
        q = os.path.expanduser(p)
        hits = _cg_hits(q)
        d = {'path': p[:256], 'relative': not os.path.isabs(q), 'exists': bool(hits)}
        if d['exists']:
            q = hits[0]
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
def _cg_resources(oom_start, paths, text='', cmd=''):
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
    if not full and re.search(r'No space left|ENOSPC|Disk quota exceeded|disk full', text, re.I):
        # Message sans chemin (labo du 12/11 : pg_dump) : les chemins absolus de la commande et des sorties attendues.
        spec = ' '.join(x.split()[0] for x in os.environ.get('CG_EXPECT', '').split(';') if x.strip())
        full = [w for w in re.findall(r"(?:^|[\s=])(/[\w./@+*-]+)", cmd + ' ' + spec) if '*' not in os.path.dirname(w)]
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
    r'(?i)\b(?:password|passwd|pwd|secret)\s*[:=]\s*(?!(?:YES|NO)\b)(?![^\s:]+:(?:\s|$))(\S+)',
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


def _run_context(output: str = '', oom_start: Optional[int] = None) -> dict:
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
    ctx['resources'] = _cg_resources(oom_start, paths, out, _job_command())
    net = _cg_net(out, _job_command())
    if net:
        ctx['net'] = net
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

    def success(self, records: Optional[int] = None, duration_ms: Optional[int] = None, oom_start: Optional[int] = None):
        # oom_start : gardé pour l'interface. Une réussite n'est PAS changée en panne sur le seul compteur oom_kill : il vaut
        # pour tout le cgroup (autres jobs compris) et le SDK Python ne voit pas la sortie de ses sous-processus.
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

    def fail(self, exit_code: int = 1, output: str = '', duration_ms: Optional[int] = None, expect: Optional[list] = None,
             oom_start: Optional[int] = None):
        output = _cg_mask(output)   # secrets masqués sur la machine du job, avant tout envoi
        ctx = _run_context(output, oom_start)
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
        self._oom = _cg_oom_kills()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        duration_ms = int((time.time() - self._start) * 1000) if self._start else None

        if exc_type is None:
            self.success(records=self._records, duration_ms=duration_ms, oom_start=getattr(self, '_oom', None))
        else:
            self.fail(
                exit_code=1,
                output=f"{exc_type.__name__}: {exc_val}\n{''.join(traceback.format_tb(exc_tb))}",
                duration_ms=duration_ms,
                oom_start=getattr(self, '_oom', None),
            )
        return False  # Ne supprime pas l'exception

    # ── Interne ───────────────────────────────────────────────────────────────

    def _ping(self, payload: dict):
        # Nettoie les None pour ne pas polluer le payload
        body = {k: v for k, v in payload.items() if v is not None}
        ctx = body.get('context')
        if isinstance(ctx, dict):
            steps, ov = _cg_steps(), _cg_overlap()
            if steps:
                ctx['steps'], ctx['stepsEnd'] = steps, int(time.time() * 1000)
            if ov:
                ctx['overlap'] = ov
        # Ne jamais perdre une panne : pings en attente renvoyés d'abord, dans l'ordre ; sinon gardé sur disque.
        q = os.path.join(os.path.dirname(_marker(self.ping_key)), 'queue')
        try:
            for f in sorted(x for x in os.listdir(q) if '__' in x)[:50]:   # pas le compteur .seq
                with open(os.path.join(q, f)) as fh:
                    if not self._send(f.split('__', 1)[1], json.load(fh)):
                        break
                os.remove(os.path.join(q, f))
        except Exception:
            pass
        if self._send(self.ping_key, body):
            return
        try:
            os.makedirs(q, mode=0o700, exist_ok=True)
            # Même compteur que le SDK bash (fichier .seq) : l'ordre d'envoi est gardé, même dans la même seconde.
            try:
                n = int(open(os.path.join(q, '.seq')).read().strip() or 0) + 1
            except Exception:
                n = 1
            with open(os.path.join(q, '.seq'), 'w') as fh:
                fh.write(str(n))
            name = '%012d__%s' % (n, re.sub(r'[^A-Za-z0-9_-]', '_', self.ping_key))
            with os.fdopen(os.open(os.path.join(q, name), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), 'w') as fh:
                json.dump(body, fh)
            for old in sorted(x for x in os.listdir(q) if '__' in x)[:-200]:   # 200 en attente au plus
                os.remove(os.path.join(q, old))
        except Exception:
            pass  # Ne jamais crasher à cause du monitoring

    def _send(self, key: str, body: dict) -> bool:
        # Vrai si le serveur a répondu 2xx ou 4xx (un 4xx ne passerait pas mieux plus tard).
        try:
            r = requests.post(f"{self.base_url}/ping/{key}", json=body, timeout=TIMEOUT_S)
            return r.status_code < 500
        except Exception:
            return False


# ── Décorateur ────────────────────────────────────────────────────────────────

def cg_step(name: str) -> None:
    """Marque une étape du job : à l'échec, CronGuard dit laquelle a échoué et combien de temps chacune a pris."""
    f = os.environ.get('_CG_STEPS_FILE')
    if f:
        try:
            with open(f, 'a') as fh:
                fh.write('%d %s\n' % (int(time.time() * 1000), name))
        except Exception:
            pass


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
            oom = _cg_oom_kills()
            # Étapes (cg_step) et chevauchement : mêmes fichiers d'état que le SDK bash.
            import tempfile
            os.environ['_CG_STEPS_FILE'] = os.path.join(tempfile.gettempdir(), 'cg_steps_%d' % os.getpid())
            lock = _marker(ping_key)[:-5] + '.lock'
            os.environ['_CG_OVERLAP'] = ''
            try:
                prev = open(lock).read().split()
                os.kill(int(prev[0]), 0)
                os.environ['_CG_OVERLAP'] = ' '.join(prev[:2])
            except Exception:
                pass
            try:
                os.makedirs(os.path.dirname(lock), mode=0o700, exist_ok=True)
                with open(lock, 'w') as fh:
                    fh.write('%d %d' % (os.getpid(), int(time.time())))
            except Exception:
                pass
            try:
                result = fn(*args, **kwargs)
                duration_ms = int((time.time() - start) * 1000)
                records = None
                if isinstance(result, dict):
                    records = result.get('records') or result.get('count')
                CronGuard(ping_key, base_url).success(
                    records=records, duration_ms=duration_ms, oom_start=oom
                )
                return result
            except Exception as e:
                duration_ms = int((time.time() - start) * 1000)
                CronGuard(ping_key, base_url).fail(
                    exit_code=1,
                    output=traceback.format_exc(),
                    duration_ms=duration_ms,
                    oom_start=oom,
                )
                raise
            finally:
                for f in (os.environ.get('_CG_STEPS_FILE', ''),):
                    try:
                        os.remove(f)
                    except Exception:
                        pass
                try:
                    if open(lock).read().split()[0] == str(os.getpid()):
                        os.remove(lock)
                except Exception:
                    pass
        return wrapper
    return decorator


if __name__ == '__main__':
    # python3 cronguard.py doctor "<commande>" : vérifie une commande comme cron la lancera, sans l'exécuter.
    import sys
    if len(sys.argv) == 3 and sys.argv[1] == 'doctor':
        issues = _cg_doctor(sys.argv[2])
        print('cronguard doctor :' if issues else 'cronguard doctor : rien à signaler pour cette commande sous cron.')
        for i in issues:
            print('  - ' + i)
        sys.exit(1 if issues else 0)
    print('usage : python3 cronguard.py doctor "<commande>"')
    sys.exit(2)
