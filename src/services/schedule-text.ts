// Planning d'une ligne de crontab en français, écrit par le CODE (essai 2 du nommage, 2026-11-11) : à l'essai 1,
// 12 des 22 erreurs de l'IA décrivaient mal le planning, que le code connaît exactement. Formes courantes seulement ;
// sinon l'expression est rendue telle quelle (jamais une traduction approximative).
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
const MONTHS = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const SPECIAL: Record<string, string> = {
  '@reboot': 'au démarrage de la machine', '@hourly': 'toutes les heures', '@daily': 'tous les jours à 00:00',
  '@midnight': 'tous les jours à 00:00', '@weekly': 'chaque dimanche à 00:00', '@monthly': 'le 1er de chaque mois à 00:00',
  '@yearly': 'le 1er janvier à 00:00', '@annually': 'le 1er janvier à 00:00',
}
const num = /^\d+$/
const list = (xs: string[]) => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} et ${xs[xs.length - 1]}`
const pad = (s: string) => s.padStart(2, '0')

function days(dow: string): string | null {
  if (dow === '*') return ''
  if (/^\d-\d$/.test(dow)) { const [a, b] = dow.split('-').map(Number); return a === 1 && b === 5 ? 'du lundi au vendredi' : `du ${DAYS[a]} au ${DAYS[b]}` }
  if (/^\d(,\d)*$/.test(dow)) { const d = dow.split(',').map(x => DAYS[Number(x)]); return d.length === 1 ? `le ${d[0]}` : `les ${list(d)}` }
  return null
}
function monthDays(dom: string): string | null {
  if (dom === '*') return ''
  if (num.test(dom)) return dom === '1' ? 'le 1er du mois' : `le ${dom} du mois`
  if (/^\d+(,\d+)+$/.test(dom)) return `les ${list(dom.split(','))} du mois`
  if (/^\d+-\d+$/.test(dom)) { const [a, b] = dom.split('-'); return `du ${a} au ${b} du mois` }
  return null
}
function months(mon: string): string | null {
  if (mon === '*') return ''
  if (/^\d+(,\d+)*$/.test(mon)) return `en ${list(mon.split(',').map(x => MONTHS[Number(x)] ?? x))}`
  return null
}
function time(m: string, h: string): string | null {
  if (m === '*' && h === '*') return 'toutes les minutes'
  const step = m.match(/^\*\/(\d+)$/)
  if (step && h === '*') return step[1] === '1' ? 'toutes les minutes' : `toutes les ${step[1]} minutes`
  if (m === '*' && num.test(h)) return `toutes les minutes de ${pad(h)}:00 à ${pad(h)}:59`
  const ms = /^\d+(,\d+)*$/.test(m) ? m.split(',') : null
  if (!ms) return null
  const mins = list(ms.map(pad))
  if (h === '*') return ms.length === 1 ? `toutes les heures à la minute ${ms[0]}` : `toutes les heures aux minutes ${mins}`
  const hstep = h.match(/^\*\/(\d+)$/)
  if (hstep) return `toutes les ${hstep[1]} heures, à la minute ${mins}`
  if (/^\d+-\d+$/.test(h)) { const [a, b] = h.split('-'); return `de ${pad(a)} h à ${pad(b)} h, aux minutes ${mins}` }
  if (/^\d+(,\d+)*$/.test(h) && ms.length === 1) return `à ${list(h.split(',').map(x => `${pad(x)}:${pad(ms[0])}`))}`
  return null
}

/** Planning lisible, ou `selon « expr »` si la forme n'est pas reconnue. */
export function scheduleText(expr: string): string {
  const e = expr.trim().replace(/\s+/g, ' ')
  if (SPECIAL[e]) return SPECIAL[e]
  const f = e.split(' ')
  if (f.length !== 5) return `selon « ${e} »`
  const [m, h, dom, mon, dow] = f
  // Jour du mois ET jour de semaine restreints : cron lance si l'UN OU L'AUTRE correspond — piège classique, on ne le traduit pas.
  if (dom !== '*' && dow !== '*') return `selon « ${e} »`
  const parts = [time(m, h), monthDays(dom), months(mon), days(dow)]
  if (parts.some(p => p === null)) return `selon « ${e} »`
  const [t, d, mo, w] = parts as string[]
  const when = [d, w].filter(Boolean).join(' et ') || (/^à /.test(t) ? 'tous les jours' : '')
  return [when, mo, t].filter(Boolean).join(', ')
}
