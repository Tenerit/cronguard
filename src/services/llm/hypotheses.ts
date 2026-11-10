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
//
// Lanceur (2026-11-10, demande fondateur) : la cause dépend de QUI lance le job. Une crontab n'a ni le PATH
// ni les variables du shell ; un timer systemd a son propre environnement ; le cron d'un conteneur ne voit
// pas les variables du conteneur ; un CronJob Kubernetes tombe sur ses limites et sa planification.
// La liste montrée au modèle ne garde que les mécanismes possibles pour ce lanceur (`runners`).
// Lanceur inconnu → mécanismes génériques + ceux de crontab (le cas le plus courant).
import axios from 'axios'
import { llmHeaders, isAnthropic } from './analyzer'
import type { ErrorCategory } from './analyzer'
import type { Runner } from './run-context'

export interface Hypothesis {
  id: string
  when: string                 // ce que le modèle doit reconnaître (montré au modèle)
  category: ErrorCategory
  cause: string                // le mécanisme (jamais montré comme réponse à recopier : c'est la sortie)
  action: string
  checks: string[]
  runners?: Runner[]           // lanceurs où ce mécanisme existe ; absent = tous
}

const CRON_LIKE: Runner[] = ['crontab', 'container-cron', 'launchd']

export const HYPOTHESES: Hypothesis[] = [
  { id: 'cron-path', runners: CRON_LIKE, category: 'dependency',
    when: "commande, interpréteur ou module introuvable, ou mauvaise version d'un outil (python, node, ruby, php, java) alors qu'il existe sur la machine",
    cause: "Sous cron, le PATH est minimal (/usr/bin:/bin) et les gestionnaires de versions (pyenv, nvm, rvm, venv) ne sont pas chargés : le job trouve un autre interpréteur ou aucun.",
    action: "Appeler l'interpréteur et les outils par leur chemin absolu (command -v <outil> dans votre shell), ou définir PATH= en tête de la crontab.",
    checks: ["Comparer `command -v <outil>` dans votre shell et dans le job (env > /tmp/cron-env.txt)", "Vérifier la version de l'interpréteur utilisée par le job"] },
  { id: 'cron-env-var', runners: ['crontab', 'launchd'], category: 'dependency',
    when: "variable, clé, configuration, locale ou proxy manquant ou vide, alors que tout marche lancé à la main",
    cause: "Le job dépend d'une variable définie dans votre shell de connexion (.bashrc, .profile) : cron ne lit pas ces fichiers, la variable est absente sous cron.",
    action: "Définir la variable dans la crontab ou dans le script (ou sourcer explicitement le fichier qui la définit).",
    checks: ["Comparer `env` dans votre shell et dans le job (env > /tmp/cron-env.txt)"] },
  { id: 'cron-cwd', runners: ['crontab', 'container-cron', 'systemd', 'launchd'], category: 'code',
    when: "fichier ou dossier introuvable avec un chemin relatif",
    cause: "Le script utilise un chemin relatif : cron le lance depuis le dossier personnel, pas depuis le dossier du script.",
    action: "Utiliser des chemins absolus, ou faire cd vers le dossier du script en début de job.",
    checks: ["Afficher `pwd` au début du job"] },
  { id: 'cron-sh-not-bash', runners: ['crontab', 'container-cron'], category: 'code',
    when: "erreur de syntaxe du shell (Syntax error, unexpected, not found sur source, [[, <( )",
    cause: "La commande utilise une syntaxe bash mais cron l'exécute avec /bin/sh, qui ne la comprend pas.",
    action: "Ajouter SHELL=/bin/bash en tête de la crontab, ou lancer le script avec bash explicitement.",
    checks: ["Vérifier le shebang du script et la variable SHELL de la crontab"] },
  { id: 'cron-percent', runners: ['crontab', 'container-cron'], category: 'code',
    when: "commande coupée ou argument de date tronqué dans une ligne de crontab contenant %",
    cause: "Dans une crontab, % signifie fin de commande : la ligne est coupée au premier % non échappé (souvent dans date +%Y).",
    action: "Échapper chaque % en \\% dans la crontab, ou déplacer la commande dans un script.",
    checks: ["Chercher les % dans la ligne de crontab"] },
  { id: 'unquoted-args', category: 'code',
    when: "argument coupé ou mal interprété : mot de passe, chemin avec espaces ou caractères spéciaux (!, $, &, *) mal passé",
    cause: "Un argument contenant des espaces ou des caractères spéciaux n'est pas entre guillemets : le shell le coupe ou l'interprète.",
    action: "Mettre l'argument entre guillemets simples, ou le lire depuis un fichier de configuration.",
    checks: ["Afficher la commande exacte reçue (set -x)"] },
  { id: 'no-display', runners: ['crontab', 'systemd', 'launchd'], category: 'dependency',
    when: "programme graphique, navigateur, D-Bus ou notification qui ne trouve pas d'affichage (DISPLAY, X11, Xauthority)",
    cause: "Le job lance un programme graphique ou D-Bus, mais cron n'a pas de session graphique : DISPLAY et l'accès au bus sont absents.",
    action: "Utiliser le mode sans affichage (headless), ou définir DISPLAY et DBUS_SESSION_BUS_ADDRESS de la session voulue.",
    checks: ["Vérifier DISPLAY dans l'environnement du job"] },
  { id: 'no-tty', category: 'dependency',
    when: "le programme attend une saisie : mot de passe, confirmation, sudo, clé d'hôte SSH, terminal requis (tty)",
    cause: "Le programme attend une saisie interactive (mot de passe, confirmation, terminal) : sous cron, personne ne peut répondre.",
    action: "Fournir l'authentification sans saisie (clé, fichier d'identifiants, option non interactive) ou autoriser la commande sans mot de passe.",
    checks: ["Relancer la commande avec </dev/null pour reproduire"] },
  { id: 'cron-user', runners: ['crontab', 'systemd', 'launchd'], category: 'dependency',
    when: "droits refusés, clé SSH ou fichier de configuration introuvable parce que le job tourne sous un autre utilisateur (root ou un compte de service)",
    cause: "Le job tourne sous un autre utilisateur que vous : pas les mêmes droits, ni le même dossier personnel, ni les mêmes clés et configurations.",
    action: "Lancer le job sous l'utilisateur qui a les droits et la configuration (crontab de cet utilisateur), ou donner les droits au compte du job.",
    checks: ["Afficher `id` et `echo $HOME` au début du job"] },
  { id: 'wrong-interpreter', category: 'code',
    when: "le fichier est lu par le mauvais interpréteur (script shell lu par python, ou l'inverse), shebang absent ou fins de ligne Windows (\\r)",
    cause: "Le script est exécuté par le mauvais interpréteur : shebang absent ou faux, ou fins de ligne Windows qui cassent le shebang.",
    action: "Corriger le shebang (#!/usr/bin/env bash, python3…) ou appeler l'interpréteur explicitement ; convertir les fins de ligne (dos2unix).",
    checks: ["Afficher la première ligne du script (head -1 | cat -A)"] },
  { id: 'os-sandbox', runners: ['crontab', 'systemd', 'launchd'], category: 'dependency',
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
  // ─── Propres à un lanceur ───
  { id: 'container-cron-env', category: 'dependency', runners: ['container-cron'],
    when: "variable, clé ou configuration absente dans un job lancé par le démon cron d'un conteneur, alors que le conteneur la reçoit",
    cause: "Dans un conteneur, le démon cron lance les jobs avec un environnement vide : les variables passées au conteneur (docker run -e, env_file, secrets) ne sont pas transmises aux jobs.",
    action: "Écrire l'environnement du conteneur dans un fichier au démarrage (printenv > /etc/environment) et le lire dans le job, ou remplacer cron par un ordonnanceur qui transmet l'environnement (supercronic).",
    checks: ["Comparer `env` dans le conteneur (docker exec) et dans le job"] },
  { id: 'systemd-env', category: 'dependency', runners: ['systemd'],
    when: "variable, commande ou configuration absente dans un service lancé par un timer systemd",
    cause: "Un service systemd ne lit pas votre shell de connexion : PATH réduit, aucune variable de .bashrc/.profile, et il tourne sous l'utilisateur et le dossier déclarés dans l'unité.",
    action: "Déclarer les variables dans l'unité (Environment=, EnvironmentFile=), appeler les outils par chemin absolu, vérifier User= et WorkingDirectory=.",
    checks: ["systemctl show <unité> -p Environment -p User -p WorkingDirectory", "journalctl -u <unité>"] },
  { id: 'k8s-memory-limit', category: 'resources', runners: ['kubernetes'],
    when: "conteneur tué : OOMKilled, code 137, Evicted, limite mémoire",
    cause: "Le conteneur du CronJob dépasse sa limite mémoire (resources.limits.memory) : Kubernetes le tue (OOMKilled).",
    action: "Relever resources.limits.memory du CronJob ou réduire le pic mémoire du job.",
    checks: ["kubectl describe pod <pod> : Last State OOMKilled", "Comparer la consommation réelle à la limite"] },
  { id: 'k8s-schedule', category: 'timeout', runners: ['kubernetes'],
    when: "Job non lancé ou abandonné : deadline, too many missed start times, BackoffLimitExceeded, Job précédent encore actif",
    cause: "Le CronJob n'a pas lancé ou a abandonné le Job : startingDeadlineSeconds dépassé, concurrencyPolicy Forbid avec un Job précédent encore actif, ou backoffLimit atteint.",
    action: "Lire les événements (kubectl describe cronjob, kubectl describe job) puis ajuster startingDeadlineSeconds, concurrencyPolicy ou backoffLimit.",
    checks: ["kubectl get jobs : un Job précédent tourne-t-il encore ?"] },
  { id: 'k8s-pod-start', category: 'dependency', runners: ['kubernetes'],
    when: "le pod ne démarre pas : ImagePullBackOff, ErrImagePull, CreateContainerConfigError, Secret ou ConfigMap introuvable",
    cause: "Le pod du CronJob ne démarre pas : image introuvable ou non autorisée, ou Secret/ConfigMap référencé absent du namespace.",
    action: "Vérifier le nom et le tag de l'image, le secret de registre (imagePullSecrets), et que les Secrets/ConfigMaps référencés existent dans le namespace.",
    checks: ["kubectl describe pod <pod> : section Events"] },
]

/** Mécanismes possibles pour ce lanceur. Inconnu → génériques + crontab. */
export function hypothesesFor(runner?: Runner): Hypothesis[] {
  return HYPOTHESES.filter(h => !h.runners || h.runners.includes(runner ?? 'crontab'))
}

const RUNNER_LABEL: Record<Runner, string> = {
  'crontab': 'crontab (démon cron du système)', 'container-cron': 'démon cron à l\'intérieur d\'un conteneur',
  'container': 'conteneur lancé par un ordonnanceur', 'systemd': 'timer systemd', 'kubernetes': 'CronJob Kubernetes', 'launchd': 'launchd (macOS)',
}

function systemPrompt(list: Hypothesis[], runner?: Runner): string {
  return `Tu diagnostiques un job planifié en échec. Tu ne rédiges pas de cause : tu choisis un mécanisme dans une liste.
${runner ? `Lanceur du job : ${RUNNER_LABEL[runner]}.\n` : ''}Réponds en JSON, dans cet ordre :
"ligne" : la ligne du log qui montre l'erreur, recopiée exactement.
"indice" : en une phrase, ce que cette ligne indique.
"hypothese" : l'identifiant du mécanisme qui explique cette ligne, ou "aucune" si aucun ne l'explique clairement.
Mécanismes :
${list.map(h => `- ${h.id} : ${h.when}`).join('\n')}`
}

export interface HypothesisChoice { hypothesis: Hypothesis; line: string; hint: string }

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

/** Un mécanisme choisi ET appuyé sur une ligne qui existe dans les logs ; sinon null (analyse libre ensuite). */
export function validateChoice(raw: unknown, logs: string, allowed: Hypothesis[] = HYPOTHESES): HypothesisChoice | null {
  if (!raw || typeof raw !== 'object') return null
  const { ligne, indice, hypothese } = raw as Record<string, unknown>
  const hypothesis = allowed.find(h => h.id === hypothese)   // hors de la liste montrée : refusé
  const line = typeof ligne === 'string' ? ligne.trim() : ''
  if (!hypothesis || norm(line).length < 12 || !norm(logs).includes(norm(line))) return null
  return { hypothesis, line: line.slice(0, 240), hint: typeof indice === 'string' ? indice.slice(0, 200) : '' }
}

export async function chooseHypothesis(logs: string, command: string | undefined, timeout: number, runner?: Runner): Promise<HypothesisChoice | null> {
  if (isAnthropic()) return null    // shortcut: OpenAI-compatible seulement (Ollama) ; Anthropic n'a pas response_format
  const list = hypothesesFor(runner)
  const schema = { type: 'object', additionalProperties: false, required: ['ligne', 'indice', 'hypothese'],
    properties: { ligne: { type: 'string' }, indice: { type: 'string' }, hypothese: { type: 'string', enum: [...list.map(h => h.id), 'aucune'] } } }
  const user = `${command ? `Commande du cron : ${command}\n` : ''}Logs :\n${logs}`
  try {
    const { data } = await axios.post(`${process.env.LLM_BASE_URL}/chat/completions`, {
      model: process.env.LLM_MODEL ?? 'llama3.2:3b', max_tokens: 200, temperature: 0,
      response_format: { type: 'json_schema', json_schema: { name: 'hypothesis', strict: true, schema } },
      messages: [{ role: 'system', content: systemPrompt(list, runner) }, { role: 'user', content: user }],
    }, { timeout, headers: llmHeaders() })
    const text: string = data.choices?.[0]?.message?.content ?? ''
    const json = text.match(/\{[\s\S]*\}/)
    return json ? validateChoice(JSON.parse(json[0]), logs, list) : null
  } catch { return null }
}
