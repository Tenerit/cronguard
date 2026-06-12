# CronGuard Setup - Windows PowerShell
# Usage : .\setup.ps1
# Si erreur "scripts desactives" : Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

$ErrorActionPreference = "Stop"

function OK($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function WARN($msg) { Write-Host "  [!!] $msg" -ForegroundColor Yellow }
function FAIL($msg) { Write-Host "  [ERR] $msg" -ForegroundColor Red; exit 1 }
function STEP($n, $msg) { Write-Host ""; Write-Host "[$n/5] $msg" -ForegroundColor Cyan }

Clear-Host
Write-Host "==========================================" -ForegroundColor Green
Write-Host "       CronGuard Setup - Windows          " -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green

# -- 1. Prerequisites ----------------------------------------------------------
STEP 1 "Verification des prerequis"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    FAIL "Node.js manquant. Installe depuis https://nodejs.org"
}

$nodeVer = (node --version).Replace("v","").Split(".")[0]
if ([int]$nodeVer -lt 18) {
    FAIL "Node.js >= 18 requis. Version actuelle : $(node --version)"
}
OK "Node.js $(node --version)"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    FAIL "Docker manquant. Installe depuis https://docs.docker.com/desktop/windows/"
}

$dockerInfo = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    FAIL "Docker Desktop n'est pas demarre. Lance Docker Desktop d'abord."
}
OK "Docker en cours d'execution"

# -- 2. Environment ------------------------------------------------------------
STEP 2 "Configuration de l'environnement"

if (Test-Path ".env") {
    WARN ".env existant conserve"
} else {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        OK ".env cree depuis .env.example"
    } else {
        Set-Content ".env" @"
DATABASE_URL=postgres://cronguard:secret@localhost:5432/cronguard
REDIS_URL=redis://localhost:6379
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=qwen3:8b
PORT=3000
NODE_ENV=development
APP_URL=http://localhost:3000
"@
        OK ".env minimal cree"
    }
}

# -- 3. Install ----------------------------------------------------------------
STEP 3 "Installation des dependances et compilation"

Write-Host "  npm install..." -ForegroundColor Gray
npm install
if ($LASTEXITCODE -ne 0) { FAIL "npm install echoue" }
OK "Dependances installees"

Write-Host "  npm run build..." -ForegroundColor Gray
npm run build
if ($LASTEXITCODE -ne 0) { FAIL "Compilation TypeScript echouee" }
OK "TypeScript compile"

# -- 4. Docker -----------------------------------------------------------------
STEP 4 "Demarrage des services Docker"

docker compose up -d postgres redis ollama
if ($LASTEXITCODE -ne 0) { FAIL "docker compose up echoue" }

Write-Host "  Attente de PostgreSQL (15s)..." -ForegroundColor Gray
Start-Sleep 15

$pgReady = $false
for ($i = 0; $i -lt 10; $i++) {
    docker compose exec -T postgres pg_isready -U cronguard 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $pgReady = $true
        break
    }
    Start-Sleep 2
}

if (-not $pgReady) {
    FAIL "PostgreSQL ne repond pas. Verifie Docker Desktop."
}
OK "PostgreSQL pret"

Write-Host "  Verification de la configuration .env..." -ForegroundColor Gray
# Ecrase les URLs dans .env avec les credentials Docker corrects
$envLines = @()
if (Test-Path ".env") { $envLines = Get-Content ".env" }
$urlsDocker = @{
    "DATABASE_URL" = "postgres://cronguard:secret@localhost:5432/cronguard"
    "REDIS_URL"    = "redis://localhost:6379"
    "LLM_BASE_URL" = "http://localhost:11434/v1"
}
foreach ($key in $urlsDocker.Keys) {
    $val = $urlsDocker[$key]
    $exists = $envLines | Where-Object { $_ -match "^$key=" }
    if ($exists) {
        $envLines = $envLines | ForEach-Object { if ($_ -match "^$key=") { "$key=$val" } else { $_ } }
    } else {
        $envLines += "$key=$val"
    }
}
$envLines | Set-Content ".env" -Encoding UTF8
OK ".env mis a jour avec les credentials Docker corrects"

Write-Host "  Migration base de donnees..." -ForegroundColor Gray
node dist/db/migrations.js
if ($LASTEXITCODE -eq 0) {
    OK "Migrations OK"
} else {
    WARN "Migrations ignorees (deja a jour)"
}

# LLM model download
$envContent = Get-Content ".env" -Raw -ErrorAction SilentlyContinue
if ($envContent -match "LLM_MODEL=(.+)") {
    $llmModel = $matches[1].Trim()
} else {
    $llmModel = "qwen3:8b"
}
$modelBase = $llmModel.Split(":")[0]

$ollamaList = docker compose exec -T ollama ollama list 2>&1
if ($ollamaList -match $modelBase) {
    OK "Modele LLM deja present ($llmModel)"
} else {
    Write-Host "  Telechargement du modele LLM ($llmModel)..." -ForegroundColor Yellow
    Write-Host "  (Peut prendre 5-15 minutes)" -ForegroundColor Gray
    docker compose exec -T ollama ollama pull $llmModel
    if ($LASTEXITCODE -eq 0) {
        OK "Modele LLM telecharge"
    } else {
        WARN "Telechargement LLM echoue - vous pourrez le faire plus tard"
    }
}

# -- 5. Seed -------------------------------------------------------------------
STEP 5 "Creation du compte de demo"

node dist/db/seed.js
if ($LASTEXITCODE -eq 0) {
    OK "Compte demo cree - voir .env.seed pour la cle API"
} else {
    WARN "Seed ignore"
}

# -- Summary -------------------------------------------------------------------
Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "         Setup termine avec succes !      " -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Prochaines etapes :" -ForegroundColor White
Write-Host ""
Write-Host "  Option A - 3 terminaux separes :" -ForegroundColor Gray
Write-Host "    Terminal 1 :  npm run dev" -ForegroundColor Green
Write-Host "    Terminal 2 :  npm run worker:dev" -ForegroundColor Green
Write-Host "    Terminal 3 :  npm run checker:dev" -ForegroundColor Green
Write-Host ""
Write-Host "  Option B - 1 seul terminal :" -ForegroundColor Gray
Write-Host "    npm run dev:all" -ForegroundColor Green
Write-Host ""
Write-Host "  Dashboard  :  http://localhost:3000/dashboard" -ForegroundColor Cyan
Write-Host "  Cle API    :  voir le fichier .env.seed" -ForegroundColor Cyan
Write-Host ""
