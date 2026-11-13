// Langue des alertes (2026-11-12) : réglée par compte (clients.lang, Réglages › Compte), car une alerte n'a pas de
// navigateur pour la deviner. NULL = français (comptes existants inchangés).
// Traduit ici : l'habillage de toutes les alertes et les faits relevés par les SDK. Pas encore : les causes et
// actions des fiches et des constats du serveur (texte de diagnostic, à relire avant traduction).
export type Lang = 'fr' | 'en'
export const langOf = (v: unknown): Lang => v === 'en' ? 'en' : 'fr'

const fr = {
  failed: (job: string) => `Job en échec : ${job}`,
  failedShort: (job: string, env: string) => `${job} en échec (${env})`,
  env: 'Environnement', lastPing: 'Dernier ping', lastPingReceived: 'Dernier ping reçu', never: 'Jamais',
  alertsSent: 'Alertes envoyées', incidentDuration: 'Durée incident',
  diagnosis: 'Diagnostic', cause: 'Cause', prevention: 'Prévention',
  verifiedFix: 'Correction vérifiée', toCheck: 'Piste à vérifier',
  changed: 'Changé depuis la dernière réussite', step: 'Étape', severity: 'Sévérité', confidence: 'confiance',
  knownFix: 'Correction connue (à adapter)', logLines: 'Lignes de log liées', decisiveLine: 'Ligne décisive',
  analysis: 'Analyse', unavailable: 'Indisponible (voir les logs)', unavailableMail: 'Diagnostic indisponible — vérifiez les logs manuellement.',
  statusPage: 'Page de statut', statusShort: 'Statut', seeStatus: 'Voir la page de statut', analysisRight: '✅ Analyse juste', fix: '✏️ Corriger', recordCause: '✏️ Enregistrer la vraie cause',
  whatFixed: 'Ce qui a réglé la panne', manageAlerts: 'Gérer les alertes',
  restored: (job: string) => `Rétabli : ${job}`, jobRestored: (job: string) => `Job rétabli : ${job}`,
  restoredBody: (d: string | null) => `Le job a de nouveau pingé avec succès${d ? ` après ${d} d'incident` : ''}.`,
  incidentLength: "Durée de l'incident",
  escSubject: (job: string, d: string) => `🚨 [ESCALADE] Job toujours en échec : ${job} (${d})`,
  escTitle: (job: string) => `Escalade : ${job}`,
  escBody: (d: string, n: number) => `Ce job est en échec depuis <strong>${d}</strong> et n'a pas été pris en charge (${n} alerte${n > 1 ? 's' : ''} envoyée${n > 1 ? 's' : ''}).`,
  knownCause: 'Cause connue', noAnalysis: 'Aucune analyse disponible.', ackStatus: 'Voir le statut et acquitter', autoEsc: 'Escalade automatique',
}
type Dict = typeof fr
const en: Dict = {
  failed: (job) => `Job failed: ${job}`,
  failedShort: (job, env) => `${job} failed (${env})`,
  env: 'Environment', lastPing: 'Last ping', lastPingReceived: 'Last ping received', never: 'Never',
  alertsSent: 'Alerts sent', incidentDuration: 'Incident duration',
  diagnosis: 'Diagnosis', cause: 'Cause', prevention: 'Prevention',
  verifiedFix: 'Verified fix', toCheck: 'Lead to check',
  changed: 'Changed since the last success', step: 'Step', severity: 'Severity', confidence: 'confidence',
  knownFix: 'Known fix (adapt it)', logLines: 'Related log lines', decisiveLine: 'Decisive line',
  analysis: 'Analysis', unavailable: 'Unavailable (see the logs)', unavailableMail: 'Diagnosis unavailable — check the logs manually.',
  statusPage: 'Status page', statusShort: 'Status', seeStatus: 'Open the status page', analysisRight: '✅ Analysis right', fix: '✏️ Correct it', recordCause: '✏️ Record the real cause',
  whatFixed: 'What fixed it', manageAlerts: 'Manage alerts',
  restored: (job) => `Restored: ${job}`, jobRestored: (job) => `Job restored: ${job}`,
  restoredBody: (d) => `The job pinged successfully again${d ? ` after ${d} of incident` : ''}.`,
  incidentLength: 'Incident duration',
  escSubject: (job, d) => `🚨 [ESCALATION] Job still failing: ${job} (${d})`,
  escTitle: (job) => `Escalation: ${job}`,
  escBody: (d, n) => `This job has been failing for <strong>${d}</strong> and nobody has taken it (${n} alert${n > 1 ? 's' : ''} sent).`,
  knownCause: 'Known cause', noAnalysis: 'No analysis available.', ackStatus: 'See the status and acknowledge', autoEsc: 'Automatic escalation',
}
export const T: Record<Lang, Dict> = { fr, en }

// Faits relevés par les SDK : libellés français fixés dans les 4 SDK (et dans ceux déjà installés chez les clients).
// Traduits ici, au rendu, plutôt que dans chaque SDK : un SDK ancien reçoit aussi des alertes en anglais.
const FACTS: Array<[RegExp, string]> = [
  [/^variable (\S+) absente depuis la dernière réussite/, 'variable $1 missing since the last success'],
  [/^(.+) modifié depuis la dernière réussite/, '$1 changed since the last success'],
  [/^(.+) disparu\b/, '$1 gone'],
  [/^version de (\S+)/, '$1 version'],
  [/^commande modifiée/, 'command changed'],
  [/^dossier de lancement/, 'launch directory'],
  [/^Arrêté pendant l'étape « (.+?) »/, 'Stopped during step "$1"'],
  [/ \(après ([^)]+)\)/g, ' (after $1)'],
  [/ — avant : /, ' — before: '],
  [/(\d+) octets/g, '$1 bytes'],
]
export function localizeFact(lang: Lang, s: string): string {
  if (lang === 'fr') return s
  for (const [re, to] of FACTS) s = s.replace(re, to)
  return s
}

// Cause inconnue (2026-11-13) : le bouton ✏️ demande la VRAIE cause, qui sera reconnue la prochaine fois (boucle
// d'apprentissage : correction → fiche d'équipe). Inconnue = ni fiche, ni constat, ni correction déjà validée, confiance basse.
export function alertLabels(lang: Lang, a: { knownFix?: unknown; finding?: string; verifiedFix?: string | null; confidence?: string } | null | undefined): Dict {
  const L = T[lang]
  const unknown = !a || (!a.knownFix && !a.finding && !a.verifiedFix && a.confidence === 'low')
  return unknown ? { ...L, fix: L.recordCause } : L
}
