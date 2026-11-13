// Lecture du script (2026-11-13) : cas de la moitié entraînement de github3 et des labos terrain.
import { describe, it, expect } from 'vitest'
import { lintScript, scriptFinding, scriptKind, explainScriptRisks } from '../src/services/llm/script-lint'

const ids = (s: string, p = '') => lintScript(s, p).map(f => f.id)

describe('lecture du script', () => {
  it('docker -ti dans un script de renouvellement (github3 #5)', () => {
    expect(ids('#!/bin/bash\ndocker run -ti --rm -v "/etc/letsencrypt:/etc/letsencrypt" certbot certonly -n')).toContain('script-docker-tty')
    expect(ids('#!/bin/bash\ndocker exec -i db pg_dump app > /b/app.sql')).not.toContain('script-docker-tty')
  })
  it('~ entre guillemets (labo terrain 2, g20)', () => {
    expect(ids('#!/bin/bash\nwhile read l; do echo $l; done < "~/hw1_input.txt"')).toContain('script-tilde-quoted')
    expect(ids('#!/bin/bash\ncat ~/x.txt "$HOME/y.txt"')).not.toContain('script-tilde-quoted')
  })
  it('syntaxe bash sans #! (labo terrain 1, cas 4)', () => {
    expect(ids('if [ "$a" == "b" ]; then echo ok; fi')).toContain('script-bash-without-shebang')
    expect(ids('#!/bin/bash\nif [[ $a == b ]]; then echo ok; fi')).not.toContain('script-bash-without-shebang')
  })
  it('chemins relatifs sans cd (labo terrain 2, g1 et g42)', () => {
    expect(ids('#!/bin/bash\nunzip data/archive.zip\ntar czf backup.tar.gz files/')).toContain('script-relative-files')
    expect(ids('#!/bin/bash\ncd /opt/app || exit 1\nunzip data/archive.zip')).not.toContain('script-relative-files')
    expect(ids('#!/bin/bash\n/usr/bin/rsync -a /src/ /dst/ > /var/log/sync.log 2>&1')).not.toContain('script-relative-files')
  })
  it('read, sudo, session graphique (github3 #70)', () => {
    expect(ids('#!/bin/bash\nread -p "Continuer ?" ok')).toContain('script-interactive-read')
    expect(ids('#!/bin/bash\nwhile read -r l; do echo "$l"; done < /etc/hosts')).not.toContain('script-interactive-read')
    expect(ids('#!/bin/bash\nsudo systemctl restart nginx')).toContain('script-sudo')
    expect(ids('#!/bin/bash\n# sudo est inutile ici\nsystemctl restart nginx')).not.toContain('script-sudo')
    expect(ids('#!/bin/bash\nswww img "$(< ~/.cache/wal/wal)"')).toContain('script-desktop-session')
    expect(ids('#!/bin/bash\nDISPLAY=:0 notify-send hi')).not.toContain('script-desktop-session')
  })
  it('Python : open relatif (github3 #53), os.environ obligatoire', () => {
    expect(scriptKind('#!/usr/bin/env python3\nprint(1)')).toBe('python')
    expect(ids("with open('Shaper.csv') as f:\n    pass", 'LibreQoS.py')).toContain('py-relative-open')
    expect(ids("from pathlib import Path\nopen(Path(__file__).parent / 'Shaper.csv')", 'a.py')).not.toContain('py-relative-open')
    expect(ids("open('/etc/app/conf.csv')", 'a.py')).not.toContain('py-relative-open')
    expect(ids("import os\ntoken = os.environ['API_TOKEN']", 'a.py')).toContain('py-env-required')
  })
  it('explique une panne seulement avec sa ligne d’erreur', () => {
    const s = "with open('Shaper.csv') as f:\n    pass"
    expect(scriptFinding(s, "FileNotFoundError: [Errno 2] No such file or directory: 'Shaper.csv'", 'x.py')?.id).toBe('py-relative-open')
    expect(scriptFinding(s, 'ConnectionError: timeout', 'x.py')).toBeNull()
  })
  it('risques déjà relevés (sans texte) : expliquent la panne avec leur ligne d’erreur', () => {
    expect(explainScriptRisks(['script-docker-tty'], 'the input device is not a TTY')?.id).toBe('script-docker-tty')
    expect(explainScriptRisks(['script-docker-tty'], 'connection refused')).toBeNull()
    expect(explainScriptRisks(undefined, 'the input device is not a TTY')).toBeNull()
  })
  it('anglais', () => {
    expect(lintScript('#!/bin/bash\nsudo ls', '', 'en')[0].cause).toMatch(/^The script calls sudo/)
  })
})
