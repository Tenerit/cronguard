// Raisonnement par hypothèses v2 (2026-11-10, 2e essai sur les jeux de réglage). La v1 (choix parmi 16
// mécanismes d'un coup) n'a pas rempli son critère : +0,4 (IC −0,35 à +1,1), le modèle choisit mal dans
// une longue liste. v2 découpe davantage :
//   1. le CODE présélectionne 2 à 4 mécanismes compatibles avec la ligne d'erreur décisive et le lanceur ;
//   2. le modèle répond OUI ou NON à une seule question à la fois (raison avant réponse) ;
//   3. accepté seulement si UN SEUL mécanisme reçoit « oui » (un petit modèle dit volontiers oui à tout) ;
//      zéro ou plusieurs « oui » → analyse libre.
// Critère fixé AVANT le premier essai (identique à v1) : eval/score.ts --ab LLM_HYPOTHESES=v2, 2 runs,
// pannes non couvertes ≥ +1,0 avec IC95 > 0, fausses causes sûres d'elles non augmentées ; puis public6 une fois.
import axios from 'axios'
import { llmHeaders, isAnthropic } from './analyzer'
import { hypothesesFor, Hypothesis, HypothesisChoice } from './hypotheses'
import { evidenceLines } from './evidence'
import type { Runner } from './run-context'

// Ligne d'erreur → mécanismes plausibles, dans l'ordre de priorité. Écrit d'après les jeux de réglage.
const RULES: Array<[RegExp, string[]]> = [
  [/OOMKilled|Evicted|BackoffLimitExceeded|DeadlineExceeded|missed start|ImagePull|ErrImage|CreateContainerConfigError/i,
    ['k8s-memory-limit', 'k8s-schedule', 'k8s-pod-start']],
  [/DISPLAY|cannot open display|could not open display|X11|Xauthority|dbus|D-Bus|Gtk|no display/i, ['no-display']],
  [/Operation not permitted|EPERM|TCC|SELinux|AppArmor|avc: +denied/i, ['os-sandbox', 'cron-user']],
  [/Host key verification|passphrase|password:|Password for|a terminal is required|not a tty|no tty|interactive|prompt/i,
    ['no-tty', 'auth-rejected']],
  [/syntax error|unexpected|SyntaxError|invalid syntax|bad interpreter|\r|exec format error/i,
    ['cron-sh-not-bash', 'wrong-interpreter', 'cron-path', 'cron-percent']],
  [/command not found|: not found|No such file or directory|cannot find|not recognized|ModuleNotFoundError|No module named|ImportError|LoadError|cannot load such file|Can't locate|Could not find|gem .*not found|version/i,
    ['cron-path', 'unquoted-args', 'cron-cwd', 'cron-percent', 'container-cron-env', 'systemd-env']],
  [/environ|env(ironment)? var|not set|is empty|undefined variable|unbound variable/i,
    ['cron-env-var', 'container-cron-env', 'systemd-env', 'code-bad-input']],
  [/Permission denied|EACCES|access denied/i, ['cron-user', 'auth-rejected', 'os-sandbox']],
  [/authenticat|unauthori[sz]ed|\b401\b|\b403\b|credentials|login failed|invalid password|access denied for user/i,
    ['auth-rejected', 'cron-env-var', 'cron-user']],
  [/time ?limit|execution time|timed? ?out|deadline/i, ['time-limit', 'remote-unreachable']],
  [/refused|unreachable|could not resolve|Name or service not known|getaddrinfo|proxy|Connection reset|certificate|SSL/i,
    ['remote-unreachable', 'cron-env-var']],
  [/schema|column|field|header|mismatch/i, ['schema-changed', 'code-bad-input']],
  [/KeyError|TypeError|NoneType|null|undefined|IndexError|ValueError|NullPointer|Cannot read propert|Cannot destructure/i,
    ['code-bad-input', 'schema-changed', 'cron-env-var']],
]

/** Mécanismes à tester pour cette ligne et ce lanceur (2 à 4) ; vide si aucune règle ne s'applique. */
export function candidatesFor(line: string, runner?: Runner): Hypothesis[] {
  const allowed = hypothesesFor(runner)
  const ids: string[] = []
  for (const [re, list] of RULES) if (re.test(line)) for (const id of list) if (!ids.includes(id)) ids.push(id)
  return ids.map(id => allowed.find(h => h.id === id)).filter((h): h is Hypothesis => !!h).slice(0, 4)
}

const SCHEMA = { type: 'object', additionalProperties: false, required: ['raison', 'reponse'],
  properties: { raison: { type: 'string' }, reponse: { type: 'string', enum: ['oui', 'non'] } } }

async function askYesNo(h: Hypothesis, line: string, logs: string, command: string | undefined, runner: Runner | undefined, timeout: number): Promise<boolean> {
  const user = `${runner ? `Lanceur du job : ${runner}\n` : ''}${command ? `Commande : ${command}\n` : ''}Ligne d'erreur : ${line}\n` +
    `Autres lignes du log :\n${logs}\n\nQuestion : cette erreur s'explique-t-elle par ce mécanisme ? « ${h.when} »`
  const { data } = await axios.post(`${process.env.LLM_BASE_URL}/chat/completions`, {
    model: process.env.LLM_MODEL ?? 'llama3.2:3b', max_tokens: 120, temperature: 0,
    response_format: { type: 'json_schema', json_schema: { name: 'yes_no', strict: true, schema: SCHEMA } },
    messages: [
      { role: 'system', content: 'Tu vérifies UNE hypothèse sur un job planifié en échec. Réponds en JSON : "raison" (une phrase, ce que la ligne montre), puis "reponse" : "oui" seulement si la ligne montre clairement ce mécanisme, sinon "non".' },
      { role: 'user', content: user },
    ],
  }, { timeout, headers: llmHeaders() })
  const text: string = data.choices?.[0]?.message?.content ?? ''
  const json = text.match(/\{[\s\S]*\}/)
  return !!json && JSON.parse(json[0]).reponse === 'oui'
}

/** Un seul mécanisme confirmé par le modèle → ce mécanisme ; sinon null (analyse libre). */
export async function checkHypotheses(keyLines: string, cleanLogs: string, command: string | undefined, timeout: number, runner?: Runner): Promise<HypothesisChoice | null> {
  if (isAnthropic()) return null    // shortcut: OpenAI-compatible seulement (Ollama)
  const line = evidenceLines(cleanLogs, '', 1)[0]
  if (!line) return null
  const candidates = candidatesFor(line, runner)
  if (candidates.length === 0) return null
  try {
    const yes: Hypothesis[] = []
    for (const h of candidates) if (await askYesNo(h, line, keyLines, command, runner, timeout)) yes.push(h)
    return yes.length === 1 ? { hypothesis: yes[0], line, hint: '' } : null
  } catch { return null }
}
