import request from 'supertest'
import express from 'express'
import helmet from 'helmet'
import { CSP_DIRECTIVES } from '../api/csp'

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

  it('allowlists Google Fonts and keeps inline handlers working', async () => {
    const csp = (await request(app).get('/x')).headers['content-security-policy']
    expect(csp).toContain('https://fonts.googleapis.com')
    expect(csp).toContain('https://fonts.gstatic.com')
    expect(csp).toMatch(/script-src[^;]*'unsafe-inline'/)   // handlers inline non cassés
  })
})
