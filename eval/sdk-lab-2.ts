/**
 * Labo SDK, étape 3 (eval/sdk-lab-2/setup.sh) — attentes fixées AVANT le premier run (2026-11-11) :
 *  C. mémoire et disque : OOM et disque plein ÉTABLIS par le serveur (ctx-oom, ctx-disk-full) 2 sur 2 ;
 *     SIGTERM et timeout : AUCUN faux constat mémoire ou disque, 2 sur 2 ;
 *  D. réseau : nom introuvable, port fermé, pas de réponse, service qui répond → le bon constat (ctx-net-*), 4 sur 4 ;
 *  E. secrets : la sortie ENVOYÉE par le SDK ne contient aucun des 5 secrets (5 sur 5), et une sortie sans secret
 *     (versions, chemins, hash de commit, -p d'un mkdir ou d'un ssh) arrive intacte.
 *   npx tsx eval/sdk-lab-2.ts      (Docker requis)
 */
import { execFileSync } from 'child_process'
import { mkdtempSync, copyFileSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { analysisWithoutModel } from '../src/services/llm/analyzer'

const lab = mkdtempSync(join(tmpdir(), 'cg-sdklab2-'))
copyFileSync(join(__dirname, '..', 'sdk', 'bash', 'cronguard.sh'), join(lab, 'sdk.sh'))
copyFileSync(join(__dirname, 'sdk-lab-2', 'setup.sh'), join(lab, 'setup.sh'))
execFileSync('docker', ['run', '--rm', '--memory=200m', '--tmpfs', '/full:size=1m', '--user', 'root', '--entrypoint', 'sh',
  '-v', `${lab}:/lab`, 'cronguard-api:latest', '-c', "tr -d '\\r' < /lab/setup.sh > /tmp/s.sh && sh /tmp/s.sh"],
  { stdio: 'inherit', env: { ...process.env, MSYS_NO_PATHCONV: '1' } })

const out = join(lab, 'out')
type Ping = { status: string; exit_code?: number; output?: string; command?: string; context?: Record<string, unknown> }
const ping = (k: string): Ping | undefined => readdirSync(out).filter(f => f.startsWith(k + '-1.json')).map(f => JSON.parse(readFileSync(join(out, f), 'utf8')))[0]
const verdict = (p?: Ping) => p ? analysisWithoutModel({ logs: p.output ?? '', command: p.command, exitCode: p.exit_code, runContext: p.context as never }) : null

let c1 = 0, c2 = 0, d = 0, e = 0
console.log('\nC. Mémoire et disque')
for (const [k, want] of [['oom', 'ctx-oom'], ['disk-full', 'ctx-disk-full']]) {
  const v = verdict(ping(k)); const ok = v?.finding === want; c1 += +ok
  console.log(`${ok ? '✓' : '✗'} ${k.padEnd(12)} ${v?.finding ?? v?.knownFix?.id ?? '—'} — ${v?.cause.slice(0, 120) ?? 'aucun ping'}`)
  if (!ok) console.log(`    contexte : ${JSON.stringify(ping(k)?.context?.resources ?? null)} · sortie : ${(ping(k)?.output ?? '').slice(0, 120)}`)
}
for (const k of ['sigterm', 'timeout']) {
  const v = verdict(ping(k)); const ok = !!v && !['ctx-oom', 'ctx-disk-full'].includes(v.finding ?? ''); c2 += +ok
  console.log(`${ok ? '✓' : '✗'} ${k.padEnd(12)} pas de faux constat · ${v?.finding ?? v?.knownFix?.id ?? '—'} — ${v?.cause.slice(0, 100) ?? 'aucun ping'}`)
}
console.log('\nD. Réseau')
for (const [k, want] of [['net-dns', 'ctx-net-dns'], ['net-refused', 'ctx-net-refused'], ['net-timeout', 'ctx-net-timeout'], ['net-open', 'ctx-net-open']]) {
  const p = ping(k); const v = verdict(p); const ok = v?.finding === want; d += +ok
  console.log(`${ok ? '✓' : '✗'} ${k.padEnd(12)} ${v?.finding ?? v?.knownFix?.id ?? '—'} — ${v?.cause.slice(0, 110) ?? 'aucun ping'}`)
  if (!ok) console.log(`    net : ${JSON.stringify(p?.context?.net ?? null)} · sortie : ${(p?.output ?? '').slice(0, 140)}`)
}
console.log('\nE. Secrets masqués à la source')
const sent = ping('mask-secrets')?.output ?? ''
const secrets = ['A'.repeat(36), 'Wq8.Lm3-Zk1', 'Zx9-Qw8!', 'Hk2_mN7qR4', 'abcdefghijklmnopqrstuvwxyz123456']
for (const s of secrets) { const ok = !!sent && !sent.includes(s); e += +ok; console.log(`${ok ? '✓' : '✗'} ${s.slice(0, 6)}… ${ok ? 'absent de la sortie envoyée' : 'ENVOYÉ'}`) }
const clean = ping('mask-clean')?.output ?? ''
const intact = clean.includes('4f427c8fc6082dcd21221c2b8aaba237d01997f4') && clean.includes('ssh -p 2222') && !clean.includes('[REDACTED')
console.log(`${intact ? '✓' : '✗'} sortie sans secret intacte : ${clean.trim().slice(0, 140)}`)

console.log(`\nC : établis ${c1}/2 · sans faux constat ${c2}/2 · D : ${d}/4 · E : ${e}/5 masqués, sortie propre ${intact ? 'intacte' : 'ALTÉRÉE'}`)
