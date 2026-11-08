// Construit eval/public-cases-4.ts depuis eval/public4-raw.json (collecte du 2026-11-08, AVANT les
// leviers « contexte d'exécution » et « vérification de la commande »). Logs recopiés ; commande
// = ligne de crontab recopiée de la question (eval/public4-extract.mjs), jamais reconstituée.
import { readFileSync, writeFileSync } from 'fs'
import { extractCommand } from './public4-extract.mjs'
const raw = JSON.parse(readFileSync(new URL('./public4-raw.json', import.meta.url), 'utf8'))

const KEEP = [
  [1,  'p4-python-version-cron',     'dependency'],
  [2,  'p4-laravel-mail-template',   'code'],
  [3,  'p4-python3-import',          'dependency'],
  [4,  'p4-shebang-hidden-chars',    'code'],
  [7,  'p4-rsync-process-subst-sh',  'code'],
  [8,  'p4-git-ssh-agent',           'network'],
  [12, 'p4-npm-path',                'dependency'],
  [14, 'p4-java-path',               'dependency'],
  [17, 'p4-gsutil-path',             'dependency'],
  [18, 'p4-date-percent',            'code'],
  [19, 'p4-crontab-backquote',       'code'],
  [20, 'p4-php-relative-require',    'code'],
  [21, 'p4-pgpassword-quotes',       'database'],
  [22, 'p4-bundle-path-environment', 'dependency'],
  [24, 'p4-sh-run-by-python',        'code'],
  [25, 'p4-cron-no-user-var',        'dependency'],
  [26, 'p4-display-xauthority',      'dependency'],
]
const EXCLUDED = {
  0: "pas de log d'erreur (code)", 5: 'pas une panne', 6: 'pas un job planifié (psql à la main)', 9: 'réponse sans cause établie (contournement)',
  10: 'réponse sans cause établie', 11: "pas de log d'erreur", 13: 'réponse sans cause établie', 15: "pas de log d'erreur de la panne",
  16: 'pas un job planifié', 23: "pas de log d'erreur (code)", 27: "pas de log d'erreur (code)", 28: 'réponse sans cause établie',
  29: "pas de log d'erreur (code)",
}
const esc = s => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
const cases = KEEP.map(([i, name, category]) => {
  const r = raw[i], command = extractCommand(r.question)
  return `  {\n    name: '${name}', category: '${category}', severity: 'medium', exitCode: 1,\n    source: '${r.url}',\n` +
    (command ? `    command: \`${esc(command)}\`,\n` : '') + `    logs: \`${esc(r.logs)}\`,\n  },`
}).join('\n')
writeFileSync(new URL('./public-cases-4.ts', import.meta.url), `// Jeu de TEST « public4 » : pannes de jobs planifiés publiées sur StackExchange, collectées le
// 2026-11-08 AVANT d'écrire les leviers « contexte d'exécution » et « vérification de la commande »,
// par eval/collect-public4.mjs (30 requêtes fixées d'avance, premier résultat avec log d'erreur et
// réponse acceptée, URLs de public2/public3 exclues). « command » = ligne de crontab recopiée de la
// question quand elle y figure. 17 gardés ; 13 écartés (raison ci-dessous), jamais selon la couverture.
// Étiquettes (eval/rubric.ts) = cause établie par la réponse acceptée. Ne JAMAIS régler sur ce jeu.
//
// Écartés : ${Object.entries(EXCLUDED).map(([i, w]) => `#${i} ${w}`).join(' · ')}
import type { EvalCase } from './cases'

export const PUBLIC4_CASES: EvalCase[] = [
${cases}
]
`)
console.log(`${KEEP.length} cas écrits (public4), ${KEEP.filter(([i]) => extractCommand(raw[i].question)).length} avec commande`)
