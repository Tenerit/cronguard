// Directives Content-Security-Policy du dashboard / status page.
// Extrait ici pour être testable sans booter toute l'app (cf. csp.test.ts).
//
// 'unsafe-inline' est conservé pour script/style : le dashboard a des blocs <script>
// inline + ~111 handlers inline (onclick…) + styles inline. Un script-src strict
// (nonce/hash) imposerait de refactorer tous les handlers en addEventListener — chantier
// séparé, à valider en navigateur. Ici on ferme déjà les vecteurs durs : object/embed,
// base-tag hijack, clickjacking (frame-ancestors), POST de formulaire cross-origin, et
// on borne connect/img. Seule ressource externe légitime : Google Fonts.
export const CSP_DIRECTIVES: Record<string, string[]> = {
  defaultSrc:     ["'self'"],
  scriptSrc:      ["'self'", "'unsafe-inline'"],
  styleSrc:       ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  fontSrc:        ["'self'", 'https://fonts.gstatic.com'],
  imgSrc:         ["'self'", 'data:'],
  connectSrc:     ["'self'"],
  objectSrc:      ["'none'"],
  baseUri:        ["'self'"],
  frameAncestors: ["'none'"],
  formAction:     ["'self'"],
}
