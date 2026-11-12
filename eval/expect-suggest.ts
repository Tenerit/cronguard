/**
 * Proposer CG_EXPECT à l'import — essai pré-enregistré (2026-11-12). Règle du code contre modèle local (+ garde-fous).
 * Jeu : les 161 lignes réelles de eval/crontab-lines.json + crontab-lines-2.json (StackExchange, déjà collectées pour le
 * nommage). Étiquetées à la main AVANT tout lancement, selon une définition écrite :
 *   - sortie attendue = le fichier que le job est censé PRODUIRE (sauvegarde, archive, export, téléchargement, rapport) ;
 *   - un journal (>> x.log, 2> erreurs, /dev/null) n'en est pas une : il est écrit même quand le job échoue ;
 *   - rien de lisible dans la commande (script opaque, appel d'URL) → aucune ; date calculée → *.
 * 14 positifs, 139 négatifs, 8 ambiguës exclues du score (rsync de dossier, stdout capturé en .txt, débogage).
 * Biais déclaré : la règle a été écrite APRÈS avoir lu les 161 lignes pour les étiqueter → elle est avantagée.
 *
 * Attentes fixées AVANT le lancement :
 *   - proposition fausse sur un négatif (on proposerait un fichier qui n'est pas attendu) ≤ 5 % ;
 *   - 0 chemin inventé (garanti par acceptablePath, vérifié quand même) ;
 *   - l'IA n'est adoptée que si son rappel sur les positifs dépasse celui de la règle d'au moins 10 points, avec les
 *     deux contraintes ci-dessus. Sinon : on livre la règle seule si rappel ≥ 70 % et faux ≤ 5 %, ou rien.
 *   - petit échantillon (14 positifs) : un cas = 7 points ; écart de moins de 2 cas = non concluant.
 *   LLM_EXPLAIN_MODEL=qwen2.5:7b-instruct-q4_K_M npx tsx eval/expect-suggest.ts
 */
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'fs'
import { ruleExpect, globDates } from '../src/services/expect-suggest'
import { aiExpect } from './lib/expect-ai'

const LINES = [...JSON.parse(readFileSync('eval/crontab-lines.json', 'utf8')), ...JSON.parse(readFileSync('eval/crontab-lines-2.json', 'utf8'))] as Array<{ command: string }>
// Étiquettes (index dans la concaténation des deux fichiers) : chemin attendu, avec * pour une date calculée.
const GOLD: Record<number, string> = {
  18: '/path/to/test.txt', 19: '/var/www/eDialog/test.txt', 21: '/path/to/test.txt', 24: 'results.txt',
  42: '/root/file.log.*',                       // cp du journal de la veille : le fichier copié est le produit
  88: 'backup_*.sql', 89: '/var/www/cloud/dump_komplett.sql',
  91: '/home/backup/database_*.sql',            // passé en argument à mysqldump (bogue de l'auteur) : l'intention est ce fichier
  92: '/backup-nfs/dump_dbkp_TEST1*.sql', 105: 'test.txt', 111: '/Users/me/Downloads/example.txt',
  122: '/home/backup/backup_data.gz', 138: 'folder/backup/back.tar', 139: 'backupfolder/localhost.tar.gz',
}
const AMBIGUOUS = new Set([50, 75, 93, 94, 95, 96, 108, 137])

// Juste si même dossier et le motif proposé reconnaît un fichier réel du motif attendu (date remplacée).
function matches(sugg: string, gold: string): boolean {
  const sample = gold.replace(/\*/g, '2026-11-12')
  const re = new RegExp('^' + sugg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$')
  const dir = (p: string) => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''
  return re.test(sample) && dir(sugg) === dir(gold)
}

type Row = { i: number; cmd: string; gold: string | null; rule: string | null; ai: string | null; aiRaw: unknown; ms: number }
async function main() {
  const rows: Row[] = []
  for (let i = 0; i < LINES.length; i++) {
    if (AMBIGUOUS.has(i)) continue
    const cmd = LINES[i].command, t0 = Date.now()
    const r = await aiExpect(cmd)
    rows.push({ i, cmd, gold: GOLD[i] ?? null, rule: ruleExpect(cmd), ai: r?.path ?? null, aiRaw: r?.raw ?? 'erreur', ms: Date.now() - t0 })
    process.stdout.write(`\r${rows.length}/${LINES.length - AMBIGUOUS.size}`)
  }
  const score = (k: 'rule' | 'ai') => {
    const pos = rows.filter(r => r.gold), neg = rows.filter(r => !r.gold)
    const hit = pos.filter(r => r[k] && matches(r[k]!, r.gold!)).length
    const falseNeg = neg.filter(r => r[k]).length
    const invented = rows.filter(r => r[k] && !r[k]!.split('*').filter(Boolean).every(p => globDates(r.cmd).includes(p))).length
    return { recall: `${hit}/${pos.length} (${Math.round(100 * hit / pos.length)} %)`, falseOnNegatives: `${falseNeg}/${neg.length} (${(100 * falseNeg / neg.length).toFixed(1)} %)`, invented }
  }
  const ms = rows.map(r => r.ms).sort((a, b) => a - b)
  const out = { model: process.env.LLM_EXPLAIN_MODEL || process.env.LLM_MODEL, rule: score('rule'), ai: score('ai'), medianMs: ms[Math.floor(ms.length / 2)],
    rows: rows.filter(r => r.gold || r.rule || r.ai) }
  writeFileSync('eval/expect-suggest-results.json', JSON.stringify(out, null, 1))
  console.log('\n', JSON.stringify({ rule: out.rule, ai: out.ai, medianMs: out.medianMs }, null, 1))
}
main()
