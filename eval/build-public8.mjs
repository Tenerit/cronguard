// Construit eval/public-cases-8.ts depuis la moitié TEST de public8 (logs bruts recopiés tels quels).
// Choix des cas gardés fait sur la question et la réponse acceptée, AVANT tout run (règles de public7).
//   node eval/build-public8.mjs
import { readFileSync, writeFileSync } from 'fs'
const raw = JSON.parse(readFileSync(new URL('./public8-raw.json', import.meta.url), 'utf8'))
const { test } = JSON.parse(readFileSync(new URL('./public8-split.json', import.meta.url), 'utf8'))
const KEEP = [
  [1, 'p8-mysqldump-invalid-view', 'database', 2],
  [6, 'p8-python-relative-tar', 'code', 1],
  [7, 'p8-scrapy-venv-cron', 'dependency', 1],
  [10, 'p8-magento-php-run-by-sh', 'code', 2],
  [11, 'p8-pm2-home-env', 'dependency', 1],
  [12, 'p8-selenium-no-display', 'dependency', 1],
  [14, 'p8-wget-not-installed', 'dependency', 127],
  [15, 'p8-python-not-in-path', 'dependency', 127],
  [16, 'p8-laravel-cron-six-fields', 'code', 1],
  [18, 'p8-perl-inc-env-var', 'dependency', 2],
  [23, 'p8-r-here-working-dir', 'code', 1],
]
const EXCLUDED = '#0 pas de log d\'erreur (ligne de crontab) · #2 pas un job planifié (test kitchen) · #3 pas de log d\'erreur (code) · #4 pas un job planifié (config SSH) · #5 pas de log d\'erreur (code) · #8 pas de log d\'erreur (code) · #9 pas un job planifié (GitHub Actions) · #13 pas un job planifié (tâche Ansible) · #17 pas une panne de job cron (format telegraf) · #19 cause non établie (contournement : renommer le fichier) · #20 pas une panne (sortie mail de cron) · #21 pas un job planifié (validation de manifeste) · #22 pas de log d\'erreur (code) · #24 pas de log d\'erreur (code) · #25 pas de log d\'erreur (code)'
const bt = s => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
const body = KEEP.map(([i, name, cat, exit]) => {
  const x = raw.find(r => r.url === test[i])
  return `  {\n    name: '${name}', category: '${cat}', severity: 'medium', exitCode: ${exit},\n    source: '${x.url}',\n    logs: \`${bt(x.logs)}\`,\n  },`
}).join('\n')
writeFileSync(new URL('./public-cases-8.ts', import.meta.url), `// Jeu de TEST « public8 » : moitié test de eval/public8-raw.json (collecte 2026-11-13, eval/collect-public8.mjs, découpe
// eval/split-public8.mjs, graine 20261113). Les fiches du 13/11 ont été réglées sur l'AUTRE moitié uniquement.
// Étiquettes (eval/rubric.ts) = cause établie par la réponse acceptée, écrites avant tout run. Ne JAMAIS régler sur ce jeu.
//
// Écartés : ${EXCLUDED}
import type { EvalCase } from './cases'

export const PUBLIC8_CASES: EvalCase[] = [
${body}
]
`)
console.log(KEEP.length, 'cas')
