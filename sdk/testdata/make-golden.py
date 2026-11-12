# Cas dorés communs aux 4 SDK (2026-11-12) : mêmes entrées, mêmes sorties attendues pour le bloc partagé
# bash/Python, le SDK Node et le binaire Go (tests/sdk-golden.test.ts, sdk/go/golden_test.go).
# Référence : le bloc partagé (# >>> cg-probes). Regénérer seulement pour un changement voulu :
#   python sdk/testdata/make-golden.py   puis relire le diff de golden.json.
# Les secrets ci-dessous sont faux (formats de test), découpés pour ne pas déclencher les scanners de dépôt.
import json, os, sys

here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, '..', 'python', 'cronguard.py'), encoding='utf-8').read()
block = src[src.index('# >>> cg-probes'):src.index('# <<< cg-probes')]
g = {}
exec('import os, re, time, json, subprocess\n' + block, g)

J = ''.join
MASK = [
    'password=hunter22 failed',
    'PermitRootLogin password=NO',                                 # (?!(?:YES|NO)\b) : Go la remplace par un refus
    'secret: YES',
    'connect postgres://app:S3cretPw@db.internal:5432/shop failed',
    'mongodb+srv://u:' + 'p%40ss:w0rd' + '@cluster0.x.mongodb.net/db',
    'Authorization: Bearer ' + J(['eyJhbGciOiJIUzI1NiJ9', '.eyJzdWIiOiIxIn0', '.c2lnbmF0dXJlMTIz']),
    'AWS key ' + 'AKIA' + 'IOSFODNN7EXAMPLE' + ' rejected',
    'git clone https://' + 'ghp_' + 'a' * 36 + '@github.com/x/y',
    'curl -u admin:' + 'Tr0ub4dor' + ' https://api.local',
    'docker login -p $REG_PASS registry.local',                    # (?![-$]) : variable shell, pas un secret
    'docker login -p ' + 'Sup3rS3cret' + ' registry.local',
    'mysqldump -u root -p' + 'r00tpw' + ' shop',
    'AUTH [REDACTED]',                                             # (?!\[) : déjà masqué
    'AUTH ' + 'redispass123',
    '{"api_key": "' + 'k' * 24 + '", "user": "bob"}',
    'DB_PASSWORD=' + 'zx81spectrum' + ' ./run.sh',
    'export API_TOKEN=${API_TOKEN}',
    'hooks.slack.com/services/' + 'T000/B000/' + 'XXXXXXXXXXXXXXXXXXXXXXXX',
    '-----BEGIN RSA PRIVATE KEY-----\nMIIEow' + 'IBAAKCAQEA\n-----END RSA PRIVATE KEY-----',
    'nothing secret here: exit 1',
    # Cas où chaque assertion retirée en Go compte (les filtres communs ne les couvrent pas) :
    'password=NOPE1234',                                           # « NO » suivi d'une lettre : masqué
    'password=NO,retry',                                           # masqué quand même : la règle « clé=valeur » en début de ligne le prend
    'mode secret: NO,fallback',                                    # (?!(?:YES|NO)\b) : seule la 1re règle s'applique, pas masqué
    'docker login -u bob -p --password-stdin registry.local',      # (?![-$]) : une option, pas un secret
    'AUTH [user-list]',
    'Password: pg_dump: error: connection to server failed',     # invite suivie d'une étiquette (labo terrain 2) : rien à masquer
    'password: hunter22secret',                                            # (?!\[) : pas un secret
]

base = {'command': 'abc', 'path': '/usr/bin:/bin', 'cwd': '/srv', 'vars': ['HOME', 'PGPASSWORD', 'TOKEN'],
        'files': {'/srv/run.sh': '18:1700000000'}, 'tools': {'pg_dump': 'pg_dump (PostgreSQL) 15.4'}}
def fp(**kw):
    d = json.loads(json.dumps(base)); d.update(kw); return d
DIFF = [
    ('rien n’a changé', base, fp()),
    ('variable disparue', base, fp(vars=['HOME', 'TOKEN'])),
    ('PATH et dossier', base, fp(path='/usr/local/bin:/usr/bin', cwd='/'),),
    ('version d’outil', base, fp(tools={'pg_dump': 'pg_dump (PostgreSQL) 16.1'})),
    ('commande modifiée', base, fp(command='def')),
    ('fichier modifié', base, fp(files={'/srv/run.sh': '45:1700000300'})),
    ('fichier disparu', base, fp(files={})),
    ('outil nouveau : rien (on ne compare que les outils déjà vus)', fp(tools={}), base),
]

out = {
    'mask': [{'in': s, 'out': g['_cg_mask'](s)} for s in MASK],
    'fpdiff': [{'name': n, 'old': o, 'new': nw, 'out': g['_cg_fp_diff'](o, nw)} for n, o, nw in DIFF],
}
with open(os.path.join(here, 'golden.json'), 'w', encoding='utf-8', newline='\n') as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
    f.write('\n')
print('golden.json :', len(out['mask']), 'masquage,', len(out['fpdiff']), 'empreinte')
