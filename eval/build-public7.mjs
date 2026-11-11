// Construit eval/public-cases-7.ts depuis eval/public7-raw.json (collecte du 2026-11-11, requêtes figées avant le travail de
// précision des fiches, brut gelé en cc9e6ff). Étiquettes écrites AVANT tout run sur ce jeu.
import { readFileSync, writeFileSync } from 'fs'
import { extractCommand } from './public4-extract.mjs'
const raw = JSON.parse(readFileSync(new URL('./public7-raw.json', import.meta.url), 'utf8'))

const KEEP = [
  [0,  'p7-quartz-job-already-stored', 'code'],
  [3,  'p7-php-killed-oom',            'resources'],
  [4,  'p7-node-heap-parallel',        'resources'],
  [6,  'p7-cron-mail-postfix-domain',  'dependency'],
  [13, 'p7-docker-cron-not-installed', 'dependency'],
  [16, 'p7-conda-activate-bashrc',     'dependency'],
  [17, 'p7-crontab-and-chained-line',  'code'],
  [18, 'p7-k8s-busybox-no-kubectl',    'dependency'],
  [21, 'p7-php-relative-backup-dir',   'code'],
  [28, 'p7-readonly-fs-errors',        'resources'],
  [30, 'p7-bad-interpreter-not-exec',  'dependency'],
  [31, 'p7-crontab-pasted-in-bash',    'code'],
]
const EXCLUDED = {
  1: 'pas une panne de job (câblage Spring au démarrage)', 2: 'réponse sans cause établie', 5: "réponse sans cause établie (conseil d'optimisation)",
  7: 'cause seulement supposée', 8: 'aucun résultat', 9: 'aucun résultat', 10: 'aucun résultat', 11: 'pas un job planifié (CI GitLab)',
  12: "pas de log d'erreur (code)", 14: 'pas un job planifié (appel REST)', 15: 'aucun résultat', 19: 'pas une panne (sortie à masquer)',
  20: "pas de log d'erreur (code)", 22: 'pas une panne', 23: "pas de log d'erreur (code)", 24: "pas de log d'erreur (code)",
  25: 'pas un job planifié (commande manuelle)', 26: 'pas une panne', 27: "pas de log d'erreur (code)", 29: 'aucun résultat',
  32: 'aucun résultat', 33: 'pas un job planifié (démarrage Sidekiq)', 34: 'pas une panne de job', 35: 'aucun résultat',
  36: 'cause non établie (contournement)', 37: 'réponse sans cause établie', 38: 'réponse sans cause établie (outil remplacé)', 39: 'pas une panne',
}
const esc = s => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
const cases = KEEP.map(([i, name, category]) => {
  const r = raw[i], command = extractCommand(r.question)
  return `  {\n    name: '${name}', category: '${category}', severity: 'medium', exitCode: 1,\n    source: '${r.url}',\n` +
    (command ? `    command: \`${esc(command)}\`,\n` : '') + `    logs: \`${esc(r.logs)}\`,\n  },`
}).join('\n')
writeFileSync(new URL('./public-cases-7.ts', import.meta.url), `// Jeu de TEST « public7 » : pannes de jobs planifiés publiées sur StackExchange, collectées le 2026-11-11 par
// eval/collect-public7.mjs (40 requêtes figées avant le travail de précision des fiches, URLs de public2-6 et du corpus
// exclues), gelées brutes (cc9e6ff). ${KEEP.length} gardés ; écartés ci-dessous.
// Étiquettes (eval/rubric.ts) = cause établie par la réponse acceptée, écrites avant tout run. Ne JAMAIS régler sur ce jeu.
//
// Écartés : ${Object.entries(EXCLUDED).map(([i, w]) => `#${i} ${w}`).join(' · ')}
import type { EvalCase } from './cases'

export const PUBLIC7_CASES: EvalCase[] = [
${cases}
]
`)
console.log(`${KEEP.length} cas écrits (public7), ${KEEP.filter(([i]) => extractCommand(raw[i].question)).length} avec commande`)
