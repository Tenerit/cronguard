// Construit eval/public-cases-6.ts depuis eval/public6-raw.json (collecte du 2026-11-10, gelée brute dans be20cdb AVANT
// le retrait de la déduction, les commandes de test et l'analyse d'erreurs). Étiquettes écrites AVANT tout run sur ce jeu.
import { readFileSync, writeFileSync } from 'fs'
import { extractCommand } from './public4-extract.mjs'
const raw = JSON.parse(readFileSync(new URL('./public6-raw.json', import.meta.url), 'utf8'))

const KEEP = [
  [2,  'p6-sysctl-path',               'dependency'],
  [6,  'p6-rvm-gem-path',              'dependency'],
  [8,  'p6-java-noclassdef-pom',       'dependency'],
  [9,  'p6-rake-bundle-env',           'dependency'],
  [14, 'p6-pgdump-crlf',               'code'],
  [16, 'p6-redis-dump-umask',          'dependency'],
  [17, 'p6-wget-503-auth',             'dependency'],
  [19, 'p6-logrotate-create-perms',    'dependency'],
  [21, 'p6-php-unlink-cwd',            'code'],
  [22, 'p6-meteor-fiber',              'code'],
  [24, 'p6-date-unquoted-format',      'code'],
  [25, 'p6-sphinx-path',               'dependency'],
  [26, 'p6-sudo-root-module',          'dependency'],
  [29, 'p6-selenium-firefox-version',  'dependency'],
  [38, 'p6-mysql-2002-disk-full',      'resources'],
]
const EXCLUDED = {
  0: "pas de log d'erreur (code)", 1: "pas de log d'erreur (code)", 3: 'réponse sans cause établie (liste de vérifications)', 4: 'aucun résultat',
  5: 'réponse sans cause établie', 7: "pas de log d'erreur (code)", 10: 'pas un job planifié', 11: 'pas une panne (question de méthode)',
  12: 'aucun résultat', 13: 'aucun résultat', 15: 'réponse sans cause établie (contournement)', 18: 'aucun résultat', 20: 'pas un job planifié (YAML Ansible)',
  23: 'pas un job planifié (script de mise à jour de crontab)', 27: 'cas malveillant (reverse shell)', 28: "pas de log d'erreur (code)", 30: 'aucun résultat',
  31: 'aucun résultat', 32: 'cause seulement supposée', 33: 'cause seulement supposée', 34: 'réponse sans cause établie', 35: 'pas une panne de job (requête SQL)',
  36: "pas de log d'erreur (code)", 37: 'aucun résultat', 39: "pas de log d'erreur (code)",
}
const esc = s => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
const cases = KEEP.map(([i, name, category]) => {
  const r = raw[i], command = extractCommand(r.question)
  return `  {\n    name: '${name}', category: '${category}', severity: 'medium', exitCode: 1,\n    source: '${r.url}',\n` +
    (command ? `    command: \`${esc(command)}\`,\n` : '') + `    logs: \`${esc(r.logs)}\`,\n  },`
}).join('\n')
writeFileSync(new URL('./public-cases-6.ts', import.meta.url), `// Jeu de TEST « public6 » : pannes de jobs planifiés publiées sur StackExchange, collectées le 2026-11-10 par
// eval/collect-public6.mjs (40 requêtes, premier résultat avec log d'erreur et réponse acceptée, URLs de public2-5 et du
// corpus exclues), gelées brutes (be20cdb) avant les changements testés. ${KEEP.length} gardés ; écartés ci-dessous.
// Étiquettes (eval/rubric.ts) = cause établie par la réponse acceptée, écrites avant tout run. Ne JAMAIS régler sur ce jeu.
//
// Écartés : ${Object.entries(EXCLUDED).map(([i, w]) => `#${i} ${w}`).join(' · ')}
import type { EvalCase } from './cases'

export const PUBLIC6_CASES: EvalCase[] = [
${cases}
]
`)
console.log(`${KEEP.length} cas écrits (public6), ${KEEP.filter(([i]) => extractCommand(raw[i].question)).length} avec commande`)
