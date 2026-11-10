// Construit eval/public-cases-5.ts depuis eval/public5-raw.json (collecte du 2026-11-10, APRÈS tous les
// changements du 2026-11-08 : fiches 97, codes officiels, vérification de commande). Test hors échantillon.
import { readFileSync, writeFileSync } from 'fs'
import { extractCommand } from './public4-extract.mjs'
const raw = JSON.parse(readFileSync(new URL('./public5-raw.json', import.meta.url), 'utf8'))

const KEEP = [
  [0,  'p5-ruby-shebang-127',           'dependency'],
  [2,  'p5-crontab-percent-expr',       'code'],
  [3,  'p5-cronhourly-crontab-syntax',  'code'],
  [5,  'p5-svn-sshpass-noninteractive', 'dependency'],
  [6,  'p5-perl-env-login-shell',       'dependency'],
  [13, 'p5-python-version-import',      'dependency'],
  [14, 'p5-php-set-time-limit',         'code'],
  [15, 'p5-env-node-bashrc',            'dependency'],
  [17, 'p5-unixcat-path',               'dependency'],
  [22, 'p5-macos-tcc-trash',            'dependency'],
  [24, 'p5-proxy-env-cron',             'network'],
  [25, 'p5-wget-ssl-status5',           'network'],
]
const EXCLUDED = {
  1: 'pas un job planifié (npm install)', 4: "pas de log d'erreur (code)", 7: "pas de log d'erreur (code)", 8: 'question Kubernetes, pas une panne',
  9: 'réponse sans cause établie', 10: 'cause seulement supposée', 11: 'pas une panne', 12: 'pas un job planifié', 16: "pas de log d'erreur (script)",
  18: 'réponse sans cause établie', 19: 'question Kubernetes, pas une panne', 20: 'pas une panne', 21: 'pas une panne', 23: 'pas un job planifié',
  26: 'pas un job planifié', 27: "pas de log d'erreur (configuration)", 28: 'pas une panne', 29: "pas de log d'erreur (code)",
}
const esc = s => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
const cases = KEEP.map(([i, name, category]) => {
  const r = raw[i], command = extractCommand(r.question)
  return `  {\n    name: '${name}', category: '${category}', severity: 'medium', exitCode: 1,\n    source: '${r.url}',\n` +
    (command ? `    command: \`${esc(command)}\`,\n` : '') + `    logs: \`${esc(r.logs)}\`,\n  },`
}).join('\n')
writeFileSync(new URL('./public-cases-5.ts', import.meta.url), `// Jeu de TEST « public5 » : pannes de jobs planifiés publiées sur StackExchange, collectées le
// 2026-11-10 APRÈS tous les changements du 2026-11-08 (97 fiches, codes officiels, vérification de commande,
// corrections par morceaux), par eval/collect-public5.mjs (30 requêtes écrites le 2026-11-08, premier résultat
// avec log d'erreur et réponse acceptée, URLs de public2-4 exclues). 12 gardés ; 18 écartés (raison ci-dessous).
// Étiquettes (eval/rubric.ts) = cause établie par la réponse acceptée. Ne JAMAIS régler sur ce jeu.
//
// Écartés : ${Object.entries(EXCLUDED).map(([i, w]) => `#${i} ${w}`).join(' · ')}
import type { EvalCase } from './cases'

export const PUBLIC5_CASES: EvalCase[] = [
${cases}
]
`)
console.log(`${KEEP.length} cas écrits (public5), ${KEEP.filter(([i]) => extractCommand(raw[i].question)).length} avec commande`)
