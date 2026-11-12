// Proposer CG_EXPECT à l'import d'une crontab (2026-11-12, essai pré-enregistré : eval/expect-suggest.ts).
// « Réussi mais n'a rien produit » est la panne silencieuse la plus chère ; encore faut-il savoir quel fichier
// attendre. Essai : la règle (redirections, -O/-o, -f, tar cf) fait jeu égal avec le modèle local (12/14 chacun,
// 0 faux) ; seule la règle est livrée, le modèle reste dans eval/lib/expect-ai.ts.
// Le code garde la main : un journal (.log, erreurs), /dev/null ou un chemin absent de la
// commande n'est jamais proposé.

// Dates calculées dans un nom de fichier (`date +%F`, $(date …), %d) → joker, pour que CG_EXPECT trouve le fichier du jour.
export function globDates(p: string): string {
  return p.replace(/`[^`]*`/g, '*').replace(/\$\([^)]*\)/g, '*').replace(/\\?%[A-Za-z]/g, '*').replace(/\*+(?:[-_.]?\*+)*/g, '*')
}

const LOGLIKE = /(^|[/._-])(logs?|err|errors?|stderr|stdout)([/._-]|$)|\.log$|^\/dev\/|^-$|^&\d$/i
const strip = (t: string) => t.replace(/^['"]|['"]$/g, '')

/** Vrai si le chemin proposé est un fichier produit plausible ET vient de la commande (rien d'inventé). */
export function acceptablePath(path: string, command: string): boolean {
  const p = path.trim()
  if (!p || p.length > 200 || p.startsWith('-') || LOGLIKE.test(p) || /\s/.test(p)) return false   // « -O --q » : une option, pas un fichier
  // Chaque morceau fixe (hors jokers) doit se lire dans la commande.
  return p.split('*').filter(Boolean).every(part => command.includes(part))
}

/** Règle : la cible d'une redirection de stdout, de -O/-o (wget, curl), de -f (pg_dump) ou de tar c…f. */
export function ruleExpect(raw: string): string | null {
  // Dates calculées remplacées AVANT le découpage : « $(date +%F) » contient un espace qui coupait le chemin
  // (défaut trouvé par les tests unitaires pendant l'essai pré-enregistré ; corrigé après, chiffre non indépendant).
  const command = globDates(raw)
  const cands: string[] = []
  const tok = String.raw`("[^"]+"|'[^']+'|[^\s;|&]+)`
  for (const m of command.matchAll(new RegExp(String.raw`(?:^|[^0-9&2])(?:1?>>?|&>>?)\s*` + tok, 'g'))) cands.push(m[1])
  for (const m of command.matchAll(new RegExp(String.raw`\s-[Oo]\s+` + tok, 'g'))) cands.push(m[1])
  if (/\bpg_dump\b/.test(command)) for (const m of command.matchAll(new RegExp(String.raw`\s(?:-f|--file=?)\s*` + tok, 'g'))) cands.push(m[1])
  for (const m of command.matchAll(new RegExp(String.raw`\btar\s+-?[a-zA-Z]*c[a-zA-Z]*f\s+` + tok, 'g'))) cands.push(m[1])
  for (const c of cands) {
    const p = globDates(strip(c))
    if (acceptablePath(p, globDates(command))) return p
  }
  return null
}
