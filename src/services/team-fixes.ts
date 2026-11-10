// Fin de la boucle d'apprentissage (2026-11-11) : une correction saisie par l'équipe (✏️) sur une panne que CronGuard
// ne reconnaissait pas devient, après validation par un admin, une FICHE D'ÉQUIPE active sur tous les jobs du client.
// Déclencheur = texte LITTÉRAL (pas d'expression régulière fournie par l'utilisateur : aucun risque de ReDoS),
// cherché sans casse dans les logs nettoyés. Il doit apparaître dans la panne d'origine (vérifié à la création).
import { db } from '../db'
import { redis } from '../config/redis'
import { sanitizeLogs } from './sanitizer'
import { evidenceLines } from './llm/evidence'
import type { AnalysisResult, ErrorCategory } from './llm/analyzer'

export interface TeamFix {
  id: string; match: string; title: string; cause: string; action: string; category: ErrorCategory
  created_by: string | null; created_at: string; source_analysis: string | null
}

// Cache par processus, invalidé par un numéro de version dans Redis (incrémenté à chaque création ou désactivation,
// quel que soit le processus) : l'API crée la fiche, le worker la voit à la panne suivante, sans requête SQL à chaque fois.
const cache = new Map<string, { ver: string; fixes: TeamFix[] }>()
const verKey = (clientId: string) => `teamfix:ver:${clientId}`
export async function forgetTeamFixes(clientId: string): Promise<void> {
  cache.delete(clientId)
  await redis.incr(verKey(clientId)).catch(() => null)
}

export async function teamFixes(clientId: string): Promise<TeamFix[]> {
  const ver = (await redis.get(verKey(clientId)).catch(() => null)) ?? '0'
  const hit = cache.get(clientId)
  if (hit && hit.ver === ver) return hit.fixes
  const { rows } = await db.query(
    `SELECT id, match, title, cause, action, category, created_by, created_at, source_analysis
       FROM team_fixes WHERE client_id = $1 AND active = true ORDER BY created_at DESC`, [clientId])
  cache.set(clientId, { ver, fixes: rows })
  return rows
}

/** Première fiche d'équipe dont le déclencheur figure dans les logs (nettoyés), ou null. */
export function matchTeamFix(fixes: TeamFix[], cleanLogs: string): TeamFix | null {
  const logs = cleanLogs.toLowerCase()
  return fixes.find(f => f.match && logs.includes(f.match.toLowerCase())) ?? null
}

/** Analyse servie par une fiche d'équipe : validée par un admin pour cette infra, donc confiance haute. */
export async function teamFixAnalysis(clientId: string, rawLogs: string, extra: { failCount7d?: number; correlatedFailures?: string[] } = {}): Promise<AnalysisResult | null> {
  if (!rawLogs.trim()) return null
  const f = matchTeamFix(await teamFixes(clientId), sanitizeLogs(rawLogs).clean)
  if (!f) return null
  return {
    cause: f.cause, action: f.action, prevention: '', checks: [], category: f.category,
    severity: (extra.failCount7d ?? 0) >= 3 ? 'high' : 'medium', confidence: 'high', data_impact: 'possible', fix_minutes: 15,
    fromCache: false, model: 'team-fix', finding: `team-${f.id}`, correlatedMonitors: extra.correlatedFailures,
  }
}

/** Ligne d'erreur sans son horodatage ni son préfixe de PID : un déclencheur qui resservira la fois suivante. */
export function stableTrigger(line: string): string {
  return line
    .replace(/^\[?\d{4}-\d{2}-\d{2}[T ][\d:.,]+(Z|[+-]\d{2}:?\d{2})?\]?\s*/, '')   // horodatage ISO en tête
    .replace(/^[A-Z][a-z]{2}\s+\d+\s+[\d:]+\s+\S+\s+/, '')                           // syslog : « Nov 10 02:00:01 host »
    .replace(/^\S+\[\d+\]:\s*/, '')                                                     // « prog[123]: »
    .trim().slice(0, 200)
}

/** Brouillon de fiche à partir d'une panne corrigée par l'équipe : rien d'inventé, tout vient de la panne et de la correction. */
export function draftTeamFix(output: string, verifiedFix: string, category: ErrorCategory = 'unknown') {
  const clean = sanitizeLogs(output).clean
  const line = evidenceLines(clean, '', 1)[0] ?? ''
  const match = stableTrigger(line)
  return {
    match, category,
    title: match.slice(0, 80),
    cause: `Panne déjà rencontrée et corrigée par votre équipe : « ${match.slice(0, 160)} ».`,
    action: verifiedFix,
  }
}
