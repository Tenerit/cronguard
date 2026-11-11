// Résolution constatée (2026-11-11) : ce qui a changé dans l'environnement réel du job entre l'échec et la
// première réussite qui suit. Le SDK relève le même contexte aux deux moments (mêmes chemins, mêmes commandes
// introuvables) ; on compare deux relevés, rien n'est deviné. Une réparation hors du champ des sondes
// (GRANT en base, serveur distant relancé, code corrigé) ne laisse AUCUNE différence : on le dit, sans inventer.
import type { RunContext, PathFact } from './llm/run-context'

export interface Change { kind: 'command' | 'env' | 'var' | 'path'; label: string; before?: string; after?: string }
type Run = { command?: string; context?: RunContext }

const ENV: Array<[keyof RunContext, string]> = [
  ['user', 'utilisateur'], ['home', 'HOME'], ['path', 'PATH'], ['shell', 'shell'], ['lang', 'langue (LANG)'],
  ['cwd', 'dossier de lancement'], ['runner', 'lanceur'], ['display', 'DISPLAY'], ['sshAgent', 'agent SSH'],
]
const PATH_FIELDS: Array<[keyof PathFact, string]> = [
  ['exists', 'existe'], ['owner', 'propriétaire'], ['mode', 'droits'], ['readable', 'lisible'], ['writable', 'modifiable'],
]
const show = (v: unknown) => v === undefined || v === '' ? '—' : typeof v === 'boolean' ? (v ? 'oui' : 'non') : String(v)

/** Texte enregistré comme correction quand l'équipe confirme (même limite que la correction saisie : 500). */
export function resolutionText(changes: Change[]): string {
  const parts = changes.map(c => c.kind === 'command' ? `commande remplacée par « ${c.after} »`
    : c.before !== undefined ? `${c.label} : ${c.before} → ${c.after}` : c.label)
  return `Réparation constatée : ${parts.join(' ; ')}`.slice(0, 500)
}

export function contextDiff(fail: Run, ok: Run): Change[] {
  const out: Change[] = []
  if (fail.command && ok.command && fail.command !== ok.command) out.push({ kind: 'command', label: 'commande modifiée', before: fail.command, after: ok.command })
  const a = fail.context ?? {}, b = ok.context ?? {}
  for (const [k, label] of ENV) {
    if (a[k] === undefined || b[k] === undefined || a[k] === b[k]) continue
    out.push({ kind: 'env', label, before: show(a[k]), after: show(b[k]) })
  }
  // Variable du shell de connexion absente sous cron à l'échec, plus absente à la réussite : elle a été fournie au job.
  if (b.loginPath !== undefined) {
    const still = new Set(b.loginOnlyVars ?? [])
    for (const v of a.loginOnlyVars ?? []) if (!still.has(v)) out.push({ kind: 'var', label: `variable ${v} désormais fournie au job` })
  }
  const after = new Map((b.paths ?? []).map(p => [p.path, p]))
  const probed = new Set((a.paths ?? []).map(p => p.path))
  for (const p of a.paths ?? []) {
    const q = after.get(p.path)
    if (!q) continue
    // Fichier que le job devait créer (son dossier parent est relevé) : qu'il existe après la réussite est une
    // conséquence, pas la réparation — c'est le dossier qui porte la cause.
    if (!p.exists && probed.has(p.path.replace(/\/[^/]+$/, ''))) continue
    // Apparu ou disparu : c'est le changement ; ses droits d'avant/après n'ont pas de « avant » à comparer.
    if (p.exists !== q.exists) { out.push({ kind: 'path', label: `${p.path} : existe`, before: show(p.exists), after: show(q.exists) }); continue }
    for (const [k, label] of PATH_FIELDS) {
      if (p[k] === undefined && q[k] === undefined) continue
      if (p[k] !== q[k]) out.push({ kind: 'path', label: `${p.path} : ${label}`, before: show(p[k]), after: show(q[k]) })
    }
  }
  return out
}
