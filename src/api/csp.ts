// Directives Content-Security-Policy du dashboard / status page.
// Extrait ici pour être testable sans booter toute l'app (cf. csp.test.ts).
//
// script-src SANS 'unsafe-inline' (2026-11-07) : les handlers inline (onclick…) ont été remplacés
// par des attributs data-click/data-input/data-change lus par un seul écouteur délégué (dashboard.html,
// « Actions déclaratives »), et les blocs <script> inline sont autorisés par leur empreinte SHA-256,
// calculée ici au démarrage depuis les fichiers servis : rien à re-hasher à la main quand le JS change.
// La démo statique (?demo=1 sur un hébergeur sans backend) n'est pas concernée : pas d'en-tête CSP.
// style-src garde 'unsafe-inline' (≈190 attributs style=, injection de style = risque faible).
// Vecteurs durs fermés : object/embed, base-tag hijack, clickjacking, POST cross-origin.
import { createHash }   from 'crypto'
import { readFileSync } from 'fs'
import { join }         from 'path'

// Le parseur HTML convertit CRLF en LF avant de hasher le contenu du <script> : on fait pareil,
// sinon un checkout Windows (autocrlf) servirait des empreintes fausses et bloquerait le dashboard.
export function inlineScriptHashes(html: string): string[] {
  const out: string[] = []
  for (const [, body] of html.replace(/\r\n?/g, '\n').matchAll(/<script>([\s\S]*?)<\/script>/g))
    out.push(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`)
  return out
}

const PAGES = ['dashboard.html', 'status.html']
const SCRIPT_HASHES = PAGES.flatMap(p => inlineScriptHashes(readFileSync(join(__dirname, p), 'utf8')))

export const CSP_DIRECTIVES: Record<string, string[]> = {
  defaultSrc:     ["'self'"],
  scriptSrc:      ["'self'", ...SCRIPT_HASHES],
  styleSrc:       ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  fontSrc:        ["'self'", 'https://fonts.gstatic.com'],
  imgSrc:         ["'self'", 'data:'],
  connectSrc:     ["'self'"],
  objectSrc:      ["'none'"],
  baseUri:        ["'self'"],
  frameAncestors: ["'none'"],
  formAction:     ["'self'"],
}
