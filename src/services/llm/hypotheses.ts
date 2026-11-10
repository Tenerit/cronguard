// Raisonnement par hypothèses (2026-11-10). Mesuré : sur les pannes qu'aucune fiche ne couvre, llama3.2:3b
// RÉDIGE une cause fausse ou recopie le symptôme (4 causes justes sur 29). Un petit modèle sait mieux
// CHOISIR dans une liste fermée que rédiger. On découpe donc le raisonnement en étapes vérifiables :
//   1. le modèle CITE la ligne de log décisive          → le code vérifie qu'elle est dans les logs ;
//   2. il dit ce que cette ligne indique, en une phrase  → raisonnement AVANT le verdict (ordre des champs) ;
//   3. il CHOISIT un mécanisme dans la liste, ou « aucune » → le code reprend la cause et l'action de la liste.
// Le modèle ne rédige jamais la cause. Citation absente des logs ou « aucune » → on retombe sur l'analyse libre.
//
// Liste écrite à partir des jeux de RÉGLAGE (labo, public à public5, corpus) AVANT d'étiqueter public6
// (gelé brut, non lu, commit be20cdb). Activé par LLM_HYPOTHESES=on tant que l'A/B n'a pas tranché.
// Critère fixé avant le premier essai (eval/score.ts --ab LLM_HYPOTHESES=on, 2 runs, réglage) :
//   adopté si la note des pannes NON couvertes monte d'au moins +1,0 avec IC95 > 0,
//   et si les « fausses causes sûres d'elles » n'augmentent pas ; puis vérifié une fois sur public6.
import axios from 'axios'
import { llmHeaders, isAnthropic } from './analyzer'
import type { ErrorCategory } from './analyzer'

export interface Hypothesis {
  id: string
  when: string                 // ce que le modèle doit reconnaître (montré au modèle)
  category: ErrorCategory
  cause: string                // le mécanisme (jamais montré comme réponse à recopier : c'est la sortie)
  action: string
  checks: string[]
}

export const HYPOTHESES: Hypothesis[] = [
  { id: 'cron-path', category: 'dependency',
    when: "commande, interpréteur ou module introuvable, ou mauvaise version d'un outil (python, node, ruby, php, java) alors qu'il existe sur la machine",
    cause: "Sous cron, le PATH est minimal (/usr/bin:/bin) et les gestionnaires de versions (pyenv, nvm, rvm, venv) ne sont pas chargés : le job trouve un autre interpréteur ou aucun.",
    action: "Appeler l'interpréteur et les outils par leur chemin absolu (command -v <outil> dans votre shell), ou définir PATH= en tête de la crontab.",
    checks: ["Comparer `command -v <outil>` dans votre shell et dans le job (env > /tmp/cron-env.txt)", "Vérifier la version de l'interpréteur utilisée par le job"] },
  { id: 'cron-env-var', category: 'dependency',
    when: "variable, clé, configuration, locale ou proxy manquant ou vide, alors que tout marche lancé à la main",
    cause: "Le job dépend d'une variable définie dans votre shell de connexion (.bashrc, .profile) : cron ne lit pas ces fichiers, la variable est absente sous cron.",
    action: "Définir la variable dans la crontab ou dans le script (ou sourcer explicitement le fichier qui la définit).",
    checks: ["Comparer `env` dans votre shell et dans le job (env > /tmp/cron-env.txt)"] },
  { id: 'cron-cwd', category: 'code',
    when: "fichier ou dossier introuvable avec un chemin relatif",
    cause: "Le script utilise un chemin relatif : cron le lance depuis le dossier personnel, pas depuis le dossier du script.",
    action: "Utiliser des chemins absolus, ou faire cd vers le dossier du script en début de job.",
    checks: ["Afficher `pwd` au début du job"] },
  { id: 'cron-sh-not-bash', category: 'code',
    when: "erreur de syntaxe du shell (Syntax error, unexpected, not found sur source, [[, <( )",
    cause: "La commande utilise une syntaxe bash mais cron l'exécute avec /bin/sh, qui ne la comprend pas.",
    action: "Ajouter SHELL=/bin/bash en tête de la crontab, ou lancer le script avec bash explicitement.",
    checks: ["Vérifier le shebang du script et la variable SHELL de la crontab"] },
  { id: 'cron-percent', category: 'code',
    when: "commande coupée ou argument de date tronqué dans une ligne de crontab contenant %",
    cause: "Dans une crontab, % signifie fin de commande : la ligne est coupée au premier % non échappé (souvent dans date +%Y).",
    action: "Échapper chaque % en \\% dans la crontab, ou déplacer la commande dans un script.",
    checks: ["Chercher les % dans la ligne de crontab"] },
  { id: 'unquoted-args', category: 'code',
    when: "argument coupé ou mal interprété : mot de passe, chemin avec espaces ou caractères spéciaux (!, $, &, *) mal passé",
    cause: "Un argument contenant des espaces ou des caractères spéciaux n'est pas entre guillemets : le shell le coupe ou l'interprète.",
    action: "Mettre l'argument entre guillemets simples, ou le lire depuis un fichier de configuration.",
    checks: ["Afficher la commande exacte reçue (set -x)"] },
  { id: 'no-display', category: 'dependency',
    when: "programme graphique, navigateur, D-Bus ou notification qui ne trouve pas d'affichage (DISPLAY, X11, Xauthority)",
    cause: "Le job lance un programme graphique ou D-Bus, mais cron n'a pas de session graphique : DISPLAY et l'accès au bus sont absents.",
    action: "Utiliser le mode sans affichage (headless), ou définir DISPLAY et DBUS_SESSION_BUS_ADDRESS de la session voulue.",
    checks: ["Vérifier DISPLAY dans l'environnement du job"] },
  { id: 'no-tty', category: 'dependency',
    when: "le programme attend une saisie : mot de passe, confirmation, sudo, clé d'hôte SSH, terminal requis (tty)",
    cause: "Le programme attend une saisie interactive (mot de passe, confirmation, terminal) : sous cron, personne ne peut répondre.",
    action: "Fournir l'authentification sans saisie (clé, fichier d'identifiants, option non interactive) ou autoriser la commande sans mot de passe.",
    checks: ["Relancer la commande avec </dev/null pour reproduire"] },
  { id: 'cron-user', category: 'dependency',
    when: "droits refusés, clé SSH ou fichier de configuration introuvable parce que le job tourne sous un autre utilisateur (root ou un compte de service)",
    cause: "Le job tourne sous un autre utilisateur que vous : pas les mêmes droits, ni le même dossier personnel, ni les mêmes clés et configurations.",
    action: "Lancer le job sous l'utilisateur qui a les droits et la configuration (crontab de cet utilisateur), ou donner les droits au compte du job.",
    checks: ["Afficher `id` et `echo $HOME` au début du job"] },
  { id: 'wrong-interpreter', category: 'code',
    when: "le fichier est lu par le mauvais interpréteur (script shell lu par python, ou l'inverse), shebang absent ou fins de ligne Windows (\\r)",
    cause: "Le script est exécuté par le mauvais interpréteur : shebang absent ou faux, ou fins de ligne Windows qui cassent le shebang.",
    action: "Corriger le shebang (#!/usr/bin/env bash, python3…) ou appeler l'interpréteur explicitement ; convertir les fins de ligne (dos2unix).",
    checks: ["Afficher la première ligne du script (head -1 | cat -A)"] },
  { id: 'os-sandbox', category: 'dependency',
    when: "accès refusé par le système malgré des droits corrects : macOS (Operation not permitted, accès complet au disque), SELinux, AppArmor",
    cause: "Le système bloque l'accès du job malgré des droits fichiers corrects (protection macOS TCC, SELinux ou AppArmor).",
    action: "Autoriser cron (ou l'interpréteur) dans la protection concernée : « Accès complet au disque » sur macOS, règle SELinux/AppArmor sur Linux.",
    checks: ["Chercher le refus dans les journaux système (log show, audit.log)"] },
  { id: 'code-bad-input', category: 'code',
    when: "exception du code du job sur une valeur inattendue : null, None, undefined, clé ou index absent, conversion de type",
    cause: "Le code du job reçoit une donnée qu'il ne gère pas (valeur nulle, clé absente, type inattendu) : la donnée amont a changé ou le code ne prévoit pas ce cas.",
    action: "Identifier l'enregistrement fautif depuis la ligne de l'exception, puis corriger la donnée ou gérer ce cas dans le code.",
    checks: ["Retrouver l'enregistrement fautif", "Vérifier un changement récent de la source ou du code"] },
  { id: 'schema-changed', category: 'data',
    when: "format ou schéma des données différent de l'attendu : colonnes, champs, types, en-têtes",
    cause: "Le format des données source a changé (colonne, champ ou type ajouté, retiré ou renommé) et ne correspond plus à ce que le job attend.",
    action: "Comparer le schéma reçu à celui attendu, puis aligner le job ou la source.",
    checks: ["Comparer le schéma de la source et celui de la cible"] },
  { id: 'time-limit', category: 'timeout',
    when: "limite de durée dépassée : max_execution_time, timeout, délai expiré",
    cause: "Le job dépasse une limite de durée qui lui est imposée (limite du langage ou de l'outil, timeout).",
    action: "Relever la limite pour ce job seulement, ou découper le traitement.",
    checks: ["Comparer la durée du job à la limite configurée"] },
  { id: 'remote-unreachable', category: 'network',
    when: "service distant, base, DNS ou proxy injoignable : connexion refusée, nom introuvable, délai réseau",
    cause: "Le service distant n'est pas joignable depuis le job (service arrêté, DNS, pare-feu ou proxy non configuré sous cron).",
    action: "Tester la connexion depuis la machine du job (nc -zv, curl -v), avec l'environnement du job.",
    checks: ["Vérifier l'état du service distant", "Vérifier les variables de proxy sous cron"] },
  { id: 'auth-rejected', category: 'dependency',
    when: "identifiants refusés par un service : authentication failed, access denied, 401, 403",
    cause: "Le service refuse les identifiants du job (mot de passe ou jeton changé, expiré, ou fichier d'identifiants non lu sous cron).",
    action: "Vérifier les identifiants réellement lus par le job et leur validité, sous l'utilisateur du cron.",
    checks: ["Tester l'authentification seule avec les mêmes identifiants"] },
]

const IDS = HYPOTHESES.map(h => h.id)
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['ligne', 'indice', 'hypothese'],
  properties: { ligne: { type: 'string' }, indice: { type: 'string' }, hypothese: { type: 'string', enum: [...IDS, 'aucune'] } },
}

const SYSTEM = `Tu diagnostiques un cron job en échec. Tu ne rédiges pas de cause : tu choisis un mécanisme dans une liste.
Réponds en JSON, dans cet ordre :
"ligne" : la ligne du log qui montre l'erreur, recopiée exactement.
"indice" : en une phrase, ce que cette ligne indique.
"hypothese" : l'identifiant du mécanisme qui explique cette ligne, ou "aucune" si aucun ne l'explique clairement.
Mécanismes :
${HYPOTHESES.map(h => `- ${h.id} : ${h.when}`).join('\n')}`

export interface HypothesisChoice { hypothesis: Hypothesis; line: string; hint: string }

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

/** Un mécanisme choisi ET appuyé sur une ligne qui existe dans les logs ; sinon null (analyse libre ensuite). */
export function validateChoice(raw: unknown, logs: string): HypothesisChoice | null {
  if (!raw || typeof raw !== 'object') return null
  const { ligne, indice, hypothese } = raw as Record<string, unknown>
  const hypothesis = HYPOTHESES.find(h => h.id === hypothese)
  const line = typeof ligne === 'string' ? ligne.trim() : ''
  if (!hypothesis || norm(line).length < 12 || !norm(logs).includes(norm(line))) return null
  return { hypothesis, line: line.slice(0, 240), hint: typeof indice === 'string' ? indice.slice(0, 200) : '' }
}

export async function chooseHypothesis(logs: string, command: string | undefined, timeout: number): Promise<HypothesisChoice | null> {
  if (isAnthropic()) return null    // shortcut: OpenAI-compatible seulement (Ollama) ; Anthropic n'a pas response_format
  const user = `${command ? `Commande du cron : ${command}\n` : ''}Logs :\n${logs}`
  try {
    const { data } = await axios.post(`${process.env.LLM_BASE_URL}/chat/completions`, {
      model: process.env.LLM_MODEL ?? 'llama3.2:3b', max_tokens: 200, temperature: 0,
      response_format: { type: 'json_schema', json_schema: { name: 'hypothesis', strict: true, schema: SCHEMA } },
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
    }, { timeout, headers: llmHeaders() })
    const text: string = data.choices?.[0]?.message?.content ?? ''
    const json = text.match(/\{[\s\S]*\}/)
    return json ? validateChoice(JSON.parse(json[0]), logs) : null
  } catch { return null }
}
