// Directives Content-Security-Policy du dashboard / status page.
// Extrait ici pour être testable sans booter toute l'app (cf. csp.test.ts).
//
// 'unsafe-inline' est conservé pour script/style : le dashboard a des blocs <script>
// inline + ~111 handlers inline (onclick…) + styles inline. Un script-src strict
// (nonce/hash) imposerait de refactorer tous les handlers en addEventListener — chantier
// séparé, à valider en navigateur. Ici on ferme déjà les vecteurs durs : object/embed,
// base-tag hijack, clickjacking (frame-ancestors), POST de formulaire cross-origin, et
// on borne connect/img. Seule ressource externe légitime : Google Fonts.
//
// Pourquoi on ne passe PAS au nonce (décision pesée 2026-11-06) : dashboard.html est servi
// statiquement (res.sendFile, pas de templating) ET la démo (§11) est hébergeable en statique
// SANS backend → aucun serveur pour injecter un nonce par requête. Un nonce casserait donc la
// démo statique, qui est un différenciateur (lever de conversion). Les hashes marcheraient en
// statique mais = 111 hashes + re-hash à chaque changement JS (fragile). Le gain (checkbox revue
// de sécu, utile ICP régulé) ne vaut pas ce coût tant que les sorties XSS sont déjà échappées (§9).
// À rouvrir seulement si un deal régulé l'exige explicitement.
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
