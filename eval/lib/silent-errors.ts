// « Réussi mais en erreur » — détecteur de référence pour l'essai pré-enregistré eval/silent-errors.ts (2026-11-12).
// Un job qui sort avec 0 alors que sa sortie contient une erreur forte (script sans set -e, exception attrapée…) :
// 2 ratés sur 11 au labo terrain. Liste FIXÉE avant la mesure ; sensible à la casse ; une ligne suffit.
export const SILENT_MARKERS: Array<[string, RegExp]> = [
  ['command not found',      /command not found/],
  ['not found (sh)',         /^(?:\S+: )?(?:\d+: )?\S+: not found$/],          // dash : « sh: 1: git: not found »
  ['traceback',              /^Traceback \(most recent call last\)/],
  ['unexpected operator',    /unexpected operator/],
  ['syntax error',           /syntax error/],
  ['permission denied',      /Permission denied/],
  ['no such file',           /No such file or directory/],
  ['killed',                 /\bKilled\b/],
  ['segfault',               /Segmentation fault/],
  ['no space',               /No space left on device/],
  ['cannot allocate',        /Cannot allocate memory/],
  ['fatal',                  /^fatal: |\bFATAL\b/],
  ['error at line start',    /^(?:Error|ERROR)[: ]/],
  ['apt error',              /^E: /],
  ['java exception',         /^Exception in thread /],
  ['access denied',          /Access denied for user/],
  ['connection refused',     /Connection refused/],
  ['dns',                    /Could not resolve host|Name or service not known|Temporary failure in name resolution/],
  ['aws credentials',        /Unable to locate credentials/],
]

/** Lignes de la sortie qui contiennent un marqueur fort (au plus 3), avec le nom du marqueur. */
export function silentErrors(output: string): Array<{ marker: string; line: string }> {
  const hits: Array<{ marker: string; line: string }> = []
  for (const line of output.split('\n')) {
    const t = line.trim()
    const m = SILENT_MARKERS.find(([, re]) => re.test(t))
    if (m) hits.push({ marker: m[0], line: t.slice(0, 200) })
    if (hits.length === 3) break
  }
  return hits
}
