import request from 'supertest'
import express from 'express'
import helmet from 'helmet'
import { readFileSync } from 'fs'
import { join } from 'path'
import { CSP_DIRECTIVES, inlineScriptHashes, inlineStyleHashes } from '../api/csp'

// Monte exactement la même config que l'app réelle (index.ts) sur une app minimale,
// pour vérifier que les directives produisent bien le header attendu — sans booter
// toute l'API (qui exige DB/Redis).
const app = express()
app.use(helmet({ contentSecurityPolicy: { useDefaults: false, directives: CSP_DIRECTIVES } }))
app.get('/x', (_req, res) => res.send('ok'))

describe('Content-Security-Policy header', () => {
  it('blocks the hard vectors (object / base / clickjacking / form)', async () => {
    const csp = (await request(app).get('/x')).headers['content-security-policy']
    expect(csp).toBeDefined()
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("form-action 'self'")
  })

  it('allowlists Google Fonts; scripts only by hash, never unsafe-inline', async () => {
    const csp = (await request(app).get('/x')).headers['content-security-policy']
    expect(csp).toContain('https://fonts.googleapis.com')
    expect(csp).toContain('https://fonts.gstatic.com')
    const scriptSrc = /script-src([^;]*)/.exec(csp)![1]
    expect(scriptSrc).not.toContain("'unsafe-inline'")
    expect(scriptSrc.match(/'sha256-[A-Za-z0-9+/]+=*'/g)).toHaveLength(2)   // 1 bloc dashboard (anti-flash du thème) + 1 status : le reste est servi en fichiers
  })

  it('<style> blocks only by hash (style-src-elem), style attributes allowed (style-src-attr)', async () => {
    const csp = (await request(app).get('/x')).headers['content-security-policy']
    const elem = /style-src-elem([^;]*)/.exec(csp)![1]
    expect(elem).not.toContain("'unsafe-inline'")
    expect(elem.match(/'sha256-[A-Za-z0-9+/]+=*'/g)).toHaveLength(3)   // status.html + page de retour + /pricing
    expect(csp).toContain("style-src-attr 'unsafe-inline'")
    expect(inlineStyleHashes('<style>a{}</style><style>b{}</style>')).toHaveLength(2)
  })

  it('hashes the text the browser sees (CRLF normalised to LF)', () => {
    expect(inlineScriptHashes('<script>a\r\nb</script>')).toEqual(inlineScriptHashes('<script>a\nb</script>'))
  })

  // Sous cette CSP, un handler inline ne lève aucune erreur visible : le bouton ne fait juste rien.
  it.each(['dashboard.html', 'dashboard.js', 'status.html'])('%s has no inline event handler', (page) => {
    const html = readFileSync(join(__dirname, '../api', page), 'utf8')
    expect(html).not.toMatch(/\son[a-z]+\s*=\s*["']/i)
    expect(html).not.toMatch(/javascript:/i)
  })
})
