#!/usr/bin/env node
/**
 * CronGuard Setup — Script universel
 * Windows, macOS, Linux.
 * Usage : node setup.js
 */

const { spawnSync } = require('child_process')
const fs            = require('fs')
const os            = require('os')

// ─── Helpers ──────────────────────────────────────────────────────────────────

const color  = process.platform !== 'win32' || process.env.TERM_PROGRAM
const G = color ? '\x1b[32m' : '', A = color ? '\x1b[33m' : ''
const B = color ? '\x1b[34m' : '', X = color ? '\x1b[0m'  : ''
const BOLD = color ? '\x1b[1m' : ''

const ok   = msg => console.log(G + '  [OK] ' + X + msg)
const warn = msg => console.log(A + '  [!!] ' + X + msg)
const fail = msg => { console.log('\x1b[31m  [ERR] \x1b[0m' + msg); process.exit(1) }
const step = (n, msg) => { console.log(''); console.log(BOLD + B + `[${n}/5] ${msg}` + X) }
const run  = (cmd, opts = {}) => {
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8', ...opts })
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || '') }
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ─── Main ─────────────────────────────────────────────────────────────────────

async function setup() {
  console.log('')
  console.log(BOLD + G + '============================================' + X)
  console.log(BOLD + G + '          CronGuard Setup v3.0' + X)
  console.log(BOLD + G + '============================================' + X)
  console.log('')
  console.log('  OS      : ' + os.platform() + ' ' + os.arch())
  console.log('  Node.js : ' + process.version)
  console.log('  Dossier : ' + process.cwd())

  // ── 1. Prérequis ─────────────────────────────────────────────────────────
  step(1, 'Vérification des prérequis')

  const nodeVer = parseInt(process.version.slice(1).split('.')[0])
  if (nodeVer < 18) fail(`Node.js >= 18 requis (actuel : ${process.version})\nhttps://nodejs.org`)
  ok(`Node.js ${process.version}`)

  if (!run('docker --version').ok) fail('Docker manquant.\nhttps://docs.docker.com/desktop/')
  if (!run('docker info').ok)      fail('Docker Desktop non démarré. Lance-le d\'abord.')
  ok('Docker en cours d\'exécution')

  // ── 2. Configuration ─────────────────────────────────────────────────────
  step(2, 'Configuration')

  if (fs.existsSync('.env')) {
    warn('.env existant conservé')
  } else {
    fs.copyFileSync('.env.example', '.env')
    ok('.env créé depuis .env.example')
  }

  // ── 3. Dépendances ───────────────────────────────────────────────────────
  step(3, 'Installation des dépendances')

  if (!fs.existsSync('node_modules')) {
    process.stdout.write('  npm install... ')
    const r = run('npm install')
    if (!r.ok) fail('npm install échoué\n' + r.out.slice(0, 300))
    console.log('OK')
  } else { ok('node_modules présent') }

  process.stdout.write('  Compilation TypeScript... ')
  const build = run('npm run build')
  if (!build.ok) fail('Build échoué\n' + build.out.slice(0, 300))
  console.log('OK')

  // ── 4. Docker ────────────────────────────────────────────────────────────
  step(4, 'Démarrage des services Docker')

  run('docker compose up -d postgres redis ollama')
  ok('Containers lancés')

  // Écrase les URLs dans .env avec les valeurs Docker correctes
  let envContent = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : ''
  const urls = {
    'DATABASE_URL': 'postgres://cronguard:secret@localhost:5432/cronguard',
    'REDIS_URL':    'redis://localhost:6379',
    'LLM_BASE_URL': 'http://localhost:11434/v1',
  }
  for (const [key, val] of Object.entries(urls)) {
    if (envContent.includes(key + '=')) {
      envContent = envContent.replace(new RegExp(key + '=.*'), key + '=' + val)
    } else {
      envContent += '\n' + key + '=' + val
    }
  }
  fs.writeFileSync('.env', envContent)
  ok('.env mis à jour avec les URLs Docker')

  process.stdout.write('  Attente de PostgreSQL')
  let pg = false
  for (let i = 0; i < 30; i++) {
    await sleep(1000); process.stdout.write('.')
    if (run('docker compose exec -T postgres pg_isready -U cronguard').ok) { pg = true; break }
  }
  console.log('')
  if (!pg) fail('PostgreSQL ne répond pas. Vérifiez Docker Desktop.')
  ok('PostgreSQL prêt')

  const migr = run('node dist/db/migrations.js')
  migr.ok ? ok('Migrations OK') : warn('Migrations ignorées (déjà à jour)')

  // Modèle LLM
  const env       = fs.readFileSync('.env', 'utf8')
  const llmModel  = (env.match(/LLM_MODEL=(.+)/) || [])[1]?.trim() || 'llama3.2:3b'
  const modelBase = llmModel.split(':')[0]
  const list      = run('docker compose exec -T ollama ollama list')
  if (!list.out.includes(modelBase)) {
    console.log(`  Téléchargement du modèle LLM (${llmModel})...`)
    console.log('  (Peut prendre 5-15 minutes selon votre connexion)')
    const dl = run(`docker compose exec -T ollama ollama pull ${llmModel}`)
    dl.ok ? ok('Modèle LLM téléchargé') : warn('LLM non disponible — retentez avec : npm run llm:pull')
  } else { ok(`Modèle LLM présent (${llmModel})`) }

  // ── 5. Données de démo ───────────────────────────────────────────────────
  step(5, 'Données de démonstration')

  const seed = run('npm run seed')
  seed.ok ? ok('Compte démo créé — voir .env.seed') : warn('Seed ignoré')

  // ── Résumé ───────────────────────────────────────────────────────────────
  console.log('')
  console.log(BOLD + G + '============================================' + X)
  console.log(BOLD + G + '         ✓ Setup terminé !' + X)
  console.log(BOLD + G + '============================================' + X)
  console.log('')
  console.log('  ' + G + 'npm run dev:all' + X + '      tout en 1 terminal')
  console.log('  ' + G + 'npm run dev' + X + '          API    (terminal 1)')
  console.log('  ' + G + 'npm run worker:dev' + X + '   Workers (terminal 2)')
  console.log('  ' + G + 'npm run checker:dev' + X + '  Checker (terminal 3)')
  console.log('')
  console.log('  Dashboard : ' + B + 'http://localhost:3000/dashboard' + X)
  console.log('  Clé API   : ' + B + 'voir .env.seed' + X)
  console.log('')
}

setup().catch(err => { console.error('\n[ERR]', err.message); process.exit(1) })
