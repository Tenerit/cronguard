// Construit eval/public-cases-2.ts depuis eval/public2-raw.json (collecte du 2026-11-08, après
// le gel des fiches 05beeb6). Logs recopiés tels quels ; étiquettes d'après la réponse acceptée.
import { readFileSync, writeFileSync } from 'fs'
const raw = JSON.parse(readFileSync(new URL('./public2-raw.json', import.meta.url), 'utf8'))

// [index, nom, catégorie, logs de remplacement (titre de la question quand le bloc de code est le script, pas l'erreur)]
const KEEP = [
  [0,  'p2-cron-perm-denied-owner',   'dependency'],
  [1,  'p2-php-mysqli-env-vars',      'dependency', 'PHP Warning: mysqli::__construct(): (HY000/2002): No such file or directory'],
  [2,  'p2-rake-path-rvm',            'dependency'],
  [5,  'p2-crontab-percent',          'code'],
  [7,  'p2-mysqldump-p-space',        'database'],
  [8,  'p2-pg-dump-pgpass-root',      'database'],
  [10, 'p2-docker-no-space',          'resources'],
  [11, 'p2-cron-malware',             'unknown'],
  [12, 'p2-curl-60-ca-bundle',        'network'],
  [14, 'p2-spring-sftp-duplicate',    'code'],
  [15, 'p2-ffmpeg-display-boot',      'dependency', 'No protocol specified\nCannot open display :0.0'],
  [16, 'p2-python-ascii-encode',      'dependency'],
  [17, 'p2-node-path-global',         'dependency'],
  [18, 'p2-php-oom-ssh-safe-mode',    'resources'],
  [21, 'p2-aws-env-cron',             'dependency'],
  [22, 'p2-selenium-path',            'dependency'],
  [28, 'p2-git-ssh-key-cron',         'network'],
]
const EXCLUDED = {
  3: "GitHub Actions, pas un job planifié", 4: 'hors sujet (pickle)', 6: 'hors sujet (SSL Apache)',
  9: "réponse acceptée sans cause établie", 13: 'hors sujet (Chef)', 19: "question d'usage, pas une panne",
  20: "pas de log d'erreur (seulement la commande)", 23: 'réponse acceptée sans cause établie',
  24: "pas de log d'erreur (YAML seulement)", 25: "question de code, pas de panne", 26: "cause seulement « probable »",
  27: 'hors sujet', 29: 'pas une panne',
}
const esc = s => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
const cases = KEEP.map(([i, name, category, logs]) => {
  const r = raw[i]
  return `  {\n    name: '${name}', category: '${category}', severity: 'medium', exitCode: 1,\n    source: '${r.url}',\n    logs: \`${esc(logs ?? r.logs)}\`,\n  },`
}).join('\n')
writeFileSync(new URL('./public-cases-2.ts', import.meta.url), `// Jeu de TEST « public2 » : pannes de jobs planifiés publiées sur StackExchange, collectées le
// 2026-11-08 APRÈS le gel des 78 fiches (commit 05beeb6), par eval/collect-public2.mjs : pour
// 30 requêtes fixées d'avance, le premier résultat avec un log d'erreur et une réponse acceptée.
// 17 gardés ; 13 écartés pour une raison écrite ci-dessous, jamais selon la couverture par une fiche.
// Étiquettes (eval/rubric.ts) = cause établie par la réponse acceptée. Ne pas régler sur ce jeu.
//
// Écartés : ${Object.entries(EXCLUDED).map(([i, w]) => `#${i} ${w}`).join(' · ')}
import type { EvalCase } from './cases'

export const PUBLIC2_CASES: EvalCase[] = [
${cases}
]
`)
console.log(`${KEEP.length} cas écrits`)
