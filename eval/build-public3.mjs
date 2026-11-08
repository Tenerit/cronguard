// Construit eval/public-cases-3.ts depuis eval/public3-raw.json (collecte du 2026-11-08, après la
// lecture des sorties sur public2 : public2 est devenu jeu de réglage, public3 est le test final).
import { readFileSync, writeFileSync } from 'fs'
const raw = JSON.parse(readFileSync(new URL('./public3-raw.json', import.meta.url), 'utf8'))

// [index, nom, catégorie, logs de remplacement (titre de la question quand le bloc de code est le script, pas l'erreur)]
const KEEP = [
  [0,  'p3-ruby-rvm-env',              'dependency'],
  [1,  'p3-smtp-port-blocked',         'network'],
  [4,  'p3-mysqldump-password-unquoted', 'code'],
  [6,  'p3-venv-env-var',              'dependency'],
  [9,  'p3-crontab-percent-date',      'code'],
  [11, 'p3-rsync-e-quotes',            'code'],
  [13, 'p3-node-full-path',            'dependency'],
  [14, 'p3-java-classpath',            'dependency'],
  [17, 'p3-scp-agent',                 'network'],
  [18, 'p3-tar-path-spaces',           'code'],
  [22, 'p3-venv-activate-path',        'dependency'],
  [23, 'p3-activate-path-bashrc',      'dependency'],
  [27, 'p3-git-push-root-home',        'network'],
  [29, 'p3-notify-send-display',       'dependency'],
]
const EXCLUDED = {
  2: 'réponse sans cause établie', 3: "pas de log d'erreur (script)", 5: "pas de log d'erreur (code)", 7: "pas de log d'erreur (script)",
  8: 'pas un job planifié', 10: 'réponse sans cause établie', 12: 'cause seulement supposée', 15: 'pas une panne', 16: 'pas une panne',
  19: 'aucun résultat', 20: 'réponse sans cause établie', 21: "pas de log d'erreur", 24: "pas de log d'erreur (code)", 25: 'question floue',
  26: 'ligne décisive hors de l\x27extrait', 28: 'cause seulement supposée',
}
const esc = s => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
const cases = KEEP.map(([i, name, category, logs]) => {
  const r = raw[i]
  return `  {\n    name: '${name}', category: '${category}', severity: 'medium', exitCode: 1,\n    source: '${r.url}',\n    logs: \`${esc(logs ?? r.logs)}\`,\n  },`
}).join('\n')
writeFileSync(new URL('./public-cases-3.ts', import.meta.url), `// Jeu de TEST FINAL « public3 » : pannes de jobs planifiés publiées sur StackExchange, collectées
// le 2026-11-08 après la lecture des sorties sur public2, par eval/collect-public3.mjs (30 requêtes
// fixées d'avance, premier résultat avec log d'erreur et réponse acceptée, URLs de public2 exclues).
// 14 gardés ; 16 écartés pour une raison écrite ci-dessous, jamais selon la couverture par une fiche.
// Étiquettes (eval/rubric.ts) = cause établie par la réponse acceptée. Ne JAMAIS régler sur ce jeu.
//
// Écartés : ${Object.entries(EXCLUDED).map(([i, w]) => `#${i} ${w}`).join(' · ')}
import type { EvalCase } from './cases'

export const PUBLIC3_CASES: EvalCase[] = [
${cases}
]
`)
console.log(`${KEEP.length} cas écrits (public3)`)
