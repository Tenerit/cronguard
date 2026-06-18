#!/usr/bin/env bash
# ─── CronGuard Setup ──────────────────────────────────────────────────────────
set -e

# Couleurs
G='\033[0;32m' A='\033[0;33m' R='\033[0;31m' B='\033[0;34m' NC='\033[0m' BOLD='\033[1m'
ok()   { echo -e "${G}✓${NC} $1"; }
warn() { echo -e "${A}⚠${NC}  $1"; }
err()  { echo -e "${R}✗${NC}  $1"; exit 1; }
step() { echo -e "\n${BOLD}$1${NC}"; }

# Test immédiat que le script s'affiche
echo ""
echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}║         CronGuard Setup v1.0         ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
echo ""
echo "  Système : $(uname -s) $(uname -m)"
echo "  Shell   : $SHELL"
echo "  Répertoire : $(pwd)"
echo ""

# ── Prérequis ─────────────────────────────────────────────────────────────────
step "1/5 — Prérequis"

command -v node &>/dev/null || err "Node.js manquant → https://nodejs.org"
NODE_VER=$(node --version | sed 's/v//' | cut -d. -f1)
[[ $NODE_VER -ge 18 ]] && ok "Node.js v$(node --version)" || err "Node.js >= 18 requis"

command -v docker &>/dev/null || err "Docker manquant → https://docs.docker.com/desktop/"
docker info &>/dev/null 2>&1 || err "Docker Desktop non démarré — lance Docker Desktop d'abord"
ok "Docker $(docker --version | cut -d' ' -f3 | tr -d ',')"

# ── .env ──────────────────────────────────────────────────────────────────────
step "2/5 — Configuration"

if [[ -f .env ]]; then
  warn ".env existant conservé"
else
  cp .env.example .env
  ok ".env créé"
fi

# ── Install ───────────────────────────────────────────────────────────────────
step "3/5 — Dépendances et compilation"

[[ -d node_modules ]] && ok "node_modules présent" || { npm install --silent && ok "npm install OK"; }
npm run build --silent && ok "TypeScript compilé"

# ── Docker ────────────────────────────────────────────────────────────────────
step "4/5 — Services Docker"

docker compose up -d postgres redis ollama
echo -e "${B}→${NC} Attente de PostgreSQL..."
for i in $(seq 1 20); do
  docker compose exec -T postgres pg_isready -U cronguard &>/dev/null && break
  sleep 1
done
docker compose exec -T postgres pg_isready -U cronguard &>/dev/null && ok "PostgreSQL prêt" || err "PostgreSQL timeout"

node dist/db/migrations.js 2>/dev/null && ok "Migrations OK" || warn "Migrations déjà à jour"

LLM_MODEL=$(grep "^LLM_MODEL" .env 2>/dev/null | cut -d= -f2 | tr -d '"' || echo "llama3.2:3b")
if docker compose exec -T ollama ollama list 2>/dev/null | grep -q "${LLM_MODEL%%:*}"; then
  ok "Modèle LLM déjà présent"
else
  echo -e "${B}→${NC} Téléchargement du modèle LLM (peut prendre quelques minutes)..."
  docker compose exec -T ollama ollama pull "$LLM_MODEL" && ok "Modèle LLM téléchargé"
fi

# ── Seed ──────────────────────────────────────────────────────────────────────
step "5/5 — Données de démo"
npm run seed --silent 2>/dev/null && ok "Compte démo créé" || warn "Seed ignoré"

# ── Résumé ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║              ✓ Setup terminé !               ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${G}npm run dev${NC}           Lance l'API (terminal 1)"
echo -e "  ${G}npm run worker:dev${NC}    Lance les workers (terminal 2)"
echo ""
echo -e "  ${B}Dashboard${NC} : http://localhost:3000/dashboard"
echo -e "  ${B}Clé API${NC}   : voir .env.seed"
echo ""
