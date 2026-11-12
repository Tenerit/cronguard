// Directives Content-Security-Policy du dashboard / status page.
// Extrait ici pour être testable sans booter toute l'app (cf. csp.test.ts).
//
// script-src SANS 'unsafe-inline' (2026-11-07) : les handlers inline (onclick…) ont été remplacés
// par des attributs data-click/data-input/data-change lus par un seul écouteur délégué (dashboard.html,
// « Actions déclaratives »), et les blocs <script> inline sont autorisés par leur empreinte SHA-256,
// calculée ici au démarrage depuis les fichiers servis : rien à re-hasher à la main quand le JS change.
// La démo statique (?demo=1 sur un hébergeur sans backend) n'est pas concernée : pas d'en-tête CSP.
// Styles (2026-11-12) : les blocs <style> (style-src-elem) n'ont plus 'unsafe-inline', chacun est autorisé par son
// empreinte ; c'est le vecteur qui permet de lire un jeton par sélecteurs d'attributs. Les attributs style=
// (style-src-attr, ≈230 dans le dashboard, dont des bascules display faites par le JS) restent permis : ils ne
// peuvent que déplacer des éléments, et img-src/font-src/connect-src bloquent déjà toute url() sortante.
// style-src garde 'unsafe-inline' pour les navigateurs sans CSP 3 (qui ignorent style-src-elem/-attr).
// Vecteurs durs fermés : object/embed, base-tag hijack, clickjacking, POST cross-origin.
import { createHash }   from 'crypto'
import { readFileSync } from 'fs'
import { join }         from 'path'
import { REVIEW_CSS, PRICING_CSS } from './page-styles'

// Le parseur HTML convertit CRLF en LF avant de hasher le contenu du <script> : on fait pareil,
// sinon un checkout Windows (autocrlf) servirait des empreintes fausses et bloquerait le dashboard.
export const hashOf = (body: string) => `'sha256-${createHash('sha256').update(body.replace(/\r\n?/g, '\n'), 'utf8').digest('base64')}'`
function inlineHashes(html: string, re: RegExp): string[] {
  return [...html.replace(/\r\n?/g, '\n').matchAll(re)].map(m => hashOf(m[1]))
}
export const inlineScriptHashes = (html: string) => inlineHashes(html, /<script>([\s\S]*?)<\/script>/g)
export const inlineStyleHashes  = (html: string) => inlineHashes(html, /<style>([\s\S]*?)<\/style>/g)

const PAGES = ['dashboard.html', 'status.html']
const SCRIPT_HASHES = PAGES.flatMap(p => inlineScriptHashes(readFileSync(join(__dirname, p), 'utf8')))
const STYLE_HASHES  = [...PAGES.flatMap(p => inlineStyleHashes(readFileSync(join(__dirname, p), 'utf8'))), hashOf(REVIEW_CSS), hashOf(PRICING_CSS)]

export const CSP_DIRECTIVES: Record<string, string[]> = {
  defaultSrc:     ["'self'"],
  scriptSrc:      ["'self'", ...SCRIPT_HASHES],
  styleSrc:       ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],   // repli des navigateurs sans CSP 3
  styleSrcElem:   ["'self'", 'https://fonts.googleapis.com', ...STYLE_HASHES],
  styleSrcAttr:   ["'unsafe-inline'"],
  fontSrc:        ["'self'", 'https://fonts.gstatic.com'],
  imgSrc:         ["'self'", 'data:'],
  connectSrc:     ["'self'"],
  objectSrc:      ["'none'"],
  baseUri:        ["'self'"],
  frameAncestors: ["'none'"],
  formAction:     ["'self'"],
}
