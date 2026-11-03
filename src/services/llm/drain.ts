// ─── Mineur de templates de logs (façon Drain) ───────────────────────────────
// Porté en TS, zéro dépendance. Regroupe des lignes quasi-identiques — mêmes mots,
// paramètres variables (host, id, nombre) — en UN template + compteur :
//   « Connection to db1:5432 refused » + « ... db2 ... db3 ... »
//     → template « Connection to <*> refused », count 3, sample « ...db1... »
// But : le dédup EXACT existant ne collapse que les lignes identiques ; ici on
// collapse aussi les variantes d'un même motif → moins de tokens envoyés au LLM,
// signal plus net, et un compteur qui reflète la vraie fréquence (systémique vs isolé).
// Réf : Drain (He et al., ICWS'17) — arbre à profondeur fixe + similarité par position.

export interface LogTemplate {
  template: string   // tokens avec <*> aux positions variables
  count:    number   // nombre de lignes brutes regroupées
  sample:   string   // une ligne d'origine représentative (valeurs concrètes préservées)
}

const WILDCARD = '<*>'

// Token « variable par nature » (id/nombre/hex/uuid/durée) → aide le clustering à
// converger. On ne considère volatils que des tokens manifestement non-sémantiques.
function looksVariable(tok: string): boolean {
  return (
    /^\d+$/.test(tok) ||                        // entier
    /^0x[0-9a-f]+$/i.test(tok) ||               // hex
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i.test(tok) || // uuid
    /^\d[\d.,:]*\d$/.test(tok) ||               // 02:00:01, 1.2.3, 10,000
    /^\d+(ms|s|m|h|kb|mb|gb)$/i.test(tok)       // durées/tailles
  )
}

interface Cluster { tokens: string[]; count: number; sample: string }

export interface MineOpts { simThreshold?: number; maxClusters?: number }

// Regroupe `lines` en templates. Ordre de sortie = ordre de première apparition.
export function mineTemplates(
  lines: string[],
  { simThreshold = 0.6, maxClusters = 60 }: MineOpts = {},
): LogTemplate[] {
  // Regroupement grossier (la « profondeur fixe » de Drain) : (nb de tokens, 1er token).
  // Un 1er token volatil est masqué pour la clé afin de regrouper « db1 down »/« db2 down ».
  const groups = new Map<string, Cluster[]>()
  const order: Cluster[] = []

  for (const raw of lines) {
    const tokens = raw.split(/\s+/).filter(Boolean)
    if (tokens.length === 0) continue

    const first = looksVariable(tokens[0]) ? WILDCARD : tokens[0].toLowerCase()
    const key = `${tokens.length}|${first}`
    const bucket = groups.get(key) ?? []

    // Cherche le cluster le plus similaire du bucket (même longueur garantie par la clé).
    let best: Cluster | null = null
    let bestSim = 0
    for (const c of bucket) {
      let same = 0
      for (let i = 0; i < tokens.length; i++) {
        if (c.tokens[i] === WILDCARD || c.tokens[i] === tokens[i]) same++
      }
      const sim = same / tokens.length
      if (sim > bestSim) { bestSim = sim; best = c }
    }

    if (best && bestSim >= simThreshold) {
      // Fusion : les positions divergentes deviennent des wildcards.
      for (let i = 0; i < tokens.length; i++) {
        if (best.tokens[i] !== tokens[i]) best.tokens[i] = WILDCARD
      }
      best.count++
    } else if (order.length < maxClusters) {
      const c: Cluster = { tokens: tokens.slice(), count: 1, sample: raw }
      bucket.push(c)
      order.push(c)
      groups.set(key, bucket)
    }
    // else : plafond de clusters atteint (garde-fou mémoire/tokens) → ligne ignorée.
  }

  return order.map(c => ({ template: c.tokens.join(' '), count: c.count, sample: c.sample }))
}
