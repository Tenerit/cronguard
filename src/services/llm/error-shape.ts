// Lecture de la STRUCTURE d'une erreur inconnue (2026-11-13). Mesuré sur 584 textes d'entraînement : 776 formes d'erreur
// non reconnues, presque aucune ne revient (eval/unknown-gaps.ts). Une fiche par message ne couvrira jamais l'inconnu ;
// en revanche presque toute erreur dit QUI parle (l'outil), de QUEL TYPE elle est, et SUR QUOI (chemin, hôte, nom).
// Ce n'est pas une cause : c'est une piste typée, présentée comme telle, avec les vérifications propres au type.
import type { ErrorCategory } from './analyzer'

export type ErrorKind = 'permission' | 'not-found' | 'network' | 'auth' | 'resources' | 'syntax' | 'busy'

// Ordre = priorité : le plus précis d'abord (« permission denied » avant « not found » dans la même ligne).
const KINDS: Array<[ErrorKind, RegExp]> = [
  ['resources',  /no space left|disk (?:is )?full|out of memory|cannot allocate memory|memory exhausted|too many open files|quota exceeded|\bkilled\b/i],
  ['permission', /permission denied|\bEACCES\b|\bEPERM\b|operation not permitted|access (?:is )?denied|not allowed to|read-only file system/i],
  ['auth',       /authentication failed|auth(?:entication|orization)? (?:error|required)|invalid (?:credentials|password|token|api key)|login failed|\b401\b|unauthori[sz]ed|token (?:has )?expired/i],
  ['network',    /connection (?:refused|reset|timed out)|could not resolve|name or service not known|temporary failure in name resolution|network is unreachable|no route to host|\bECONN\w+|\bETIMEDOUT\b|\bEHOSTUNREACH\b|ssl|certificate/i],
  ['busy',       /\block(?:ed)?\b|already (?:running|in use)|resource busy|address already in use|\bEBUSY\b|\bEADDRINUSE\b/i],
  ['syntax',     /syntax error|parse error|unexpected (?:token|end|character|eof)|unrecognized (?:option|argument)|invalid (?:option|argument|syntax)|unknown option|usage: /i],
  ['not-found',  /no such file|not found|does not exist|cannot find|could not find|can't (?:find|open)|missing|\bENOENT\b|undefined (?:variable|index|method|function)|\bKeyError\b|has no attribute|is not defined/i],
]
const CATEGORY: Record<ErrorKind, ErrorCategory> = {
  permission: 'resources', 'not-found': 'dependency', network: 'network', auth: 'dependency', resources: 'resources', syntax: 'code', busy: 'resources',
}
export const KIND_LABEL: Record<ErrorKind, string> = {
  permission: 'droits refusés', 'not-found': 'élément introuvable', network: 'réseau', auth: 'identifiants refusés',
  resources: 'ressources épuisées', syntax: 'syntaxe ou options invalides', busy: 'ressource verrouillée ou occupée',
}
const CHECKS: Record<ErrorKind, (o: string) => string[]> = {
  permission: o => [`ls -ld ${o} sous l'utilisateur du cron (sudo -u <user>) : propriétaire et droits.`, "Comparer l'utilisateur du cron (crontab -l -u <user>) avec celui pour qui ça marche."],
  'not-found': o => [`Sous cron, chercher ${o} : le dossier courant est le HOME et le PATH est minimal (/usr/bin:/bin).`, 'Remplacer les noms et chemins relatifs par des chemins absolus.'],
  network: o => [`Depuis la machine du job : getent hosts ${o} puis nc -zv ${o} <port>.`, 'Le service visé tourne-t-il ? Un proxy ou un pare-feu est-il requis sous cron ?'],
  auth: () => ["D'où viennent les identifiants sous cron (variable d'environnement, fichier dans le HOME de l'utilisateur du cron) ?", 'Ont-ils été changés ou ont-ils expiré récemment ?'],
  resources: o => [`df -h ${o === '<objet>' ? '' : o} ; free -m ; ulimit -a sous l'utilisateur du cron.`.replace('  ', ' '), "dmesg | tail : le noyau a-t-il tué le processus ?"],
  syntax: () => ['Relancer la commande exacte du cron à la main : les guillemets et % de la crontab changent souvent la ligne.', "Comparer la version de l'outil sous cron et dans votre shell (options différentes)."],
  busy: () => ["Une exécution précédente tourne-t-elle encore ? (ps, fichier de verrou) — protéger le job avec flock.", 'Un autre job ou service utilise-t-il la même ressource au même moment ?'],
}

export interface ErrorShape { kind: ErrorKind; tool: string | null; object: string | null }

/** Type, outil et objet d'une ligne d'erreur ; null si aucun type sûr n'est reconnu. */
export function errorShape(line: string): ErrorShape | null {
  const kind = KINDS.find(([, re]) => re.test(line))?.[0]
  if (!kind) return null
  const t = line.replace(/^\s*(?:\[[^\]]*\]\s*|\d{4}-\d\d-\d\d[T ][\d:.,]+\S*\s*)+/, '')
  const tool = /^((?:PHP )?(?:Fatal|Warning)|[A-Za-z][\w.+-]{1,30}(?:Error|Exception))\b/.exec(t)?.[1]
    ?? /^([a-z][\w.+-]{1,30})(?:\[\d+\])?:\s/.exec(t)?.[1] ?? null
  const object = /['"‘“`]([^'"’”`\n]{2,120})['"’”`]/.exec(t)?.[1]
    ?? /(?:^|\s)((?:~|\.{1,2})?\/[\w.@+~/-]{2,})/.exec(t)?.[1]
    ?? (kind === 'network' ? /\b((?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?)\b/i.exec(t)?.[1] : undefined) ?? null   // hôte : réseau seulement
  return { kind, tool: tool && !/^(error|warning|fatal|info|debug)$/i.test(tool) ? tool : null, object }
}

/** Piste typée pour une erreur que rien ne reconnaît : cause prudente, catégorie, vérifications du type. */
export function unknownErrorLead(line: string): { cause: string; category: ErrorCategory; checks: string[]; kind: ErrorKind } | null {
  const s = errorShape(line)
  if (!s) return null
  const o = s.object ?? '<objet>'
  const who = s.tool ? ` signalée par ${s.tool}` : ''
  const on = s.object ? ` sur « ${s.object.slice(0, 80)} »` : ''
  return {
    kind: s.kind, category: CATEGORY[s.kind], checks: CHECKS[s.kind](o).map(c => `Piste (${KIND_LABEL[s.kind]}) : ${c}`),
    cause: `Cause précise non établie. Type d'erreur : ${KIND_LABEL[s.kind]}${who}${on}. Ligne : « ${line.slice(0, 160)} ».`,
  }
}
