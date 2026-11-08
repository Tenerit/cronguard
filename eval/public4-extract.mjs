// Extraction LITTÉRALE depuis le texte d'une question (aucune inférence) :
//   command : la ligne de crontab (5 champs ou @raccourci) telle qu'écrite par l'auteur
//   cronEnv : les en-têtes X-Cron-Env du mail de cron (PATH, HOME, SHELL, LOGNAME…), valeurs réelles
export function extractCommand(q) {
  const line = q.split('\n').map(l => l.trim()).find(l =>
    /^(@(reboot|yearly|annually|monthly|weekly|daily|midnight|hourly)|([\d*\/,-]+\s+){4}[\d*\/,A-Za-z-]+)\s+\S/.test(l) && !/^\d{4}-\d\d-\d\d/.test(l))
  if (!line) return undefined
  return line.replace(/^(@\w+|([\d*\/,-]+\s+){4}[\d*\/,A-Za-z-]+)\s+/, '')
}
export function extractCronEnv(q) {
  const env = {}
  for (const m of q.matchAll(/X-Cron-Env:\s*<([A-Z_]+)=([^>]*)>/g)) env[m[1]] = m[2]
  return Object.keys(env).length ? env : undefined
}
