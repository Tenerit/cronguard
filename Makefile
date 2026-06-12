# ─── CronGuard Makefile ────────────────────────────────────────────────────────
# Toutes les commandes utiles en un seul endroit.
# Usage : make <commande>

.PHONY: help setup dev stop logs test build seed ping-test open clean deploy

# ── Couleurs ──────────────────────────────────────────────────────────────────
GREEN  := \033[0;32m
AMBER  := \033[0;33m
BLUE   := \033[0;34m
BOLD   := \033[1m
NC     := \033[0m

# ── Config ────────────────────────────────────────────────────────────────────
API_URL    ?= http://localhost:3000
API_KEY    ?= $(shell grep -E '^# Demo API key:' .env.seed 2>/dev/null | cut -d: -f2 | tr -d ' ')
PING_KEY   ?= $(shell grep -E '^# Demo ping key:' .env.seed 2>/dev/null | cut -d: -f2 | tr -d ' ')

# ── help ──────────────────────────────────────────────────────────────────────

help: ## Affiche cette aide
	@echo ""
	@echo "$(BOLD)CronGuard — Commandes disponibles$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-18s$(NC) %s\n", $$1, $$2}'
	@echo ""

# ── Setup & démarrage ─────────────────────────────────────────────────────────

setup: ## Premier lancement : installe, configure et démarre tout
	@bash setup.sh

dev: ## Lance l'API + workers en mode développement (hot reload)
	@echo "$(BLUE)→$(NC) Démarrage des services Docker..."
	@docker compose up -d postgres redis ollama
	@echo "$(BLUE)→$(NC) Lancement de l'API (port 3000)..."
	@echo "$(BLUE)→$(NC) Lancement des workers..."
	@npx concurrently \
		--names "api,worker,checker" \
		--prefix-colors "green,blue,yellow" \
		"npm run dev" \
		"npm run worker:dev" \
		"npx tsx watch src/workers/timeout.checker.ts"

stop: ## Arrête tous les services
	@docker compose down
	@echo "$(GREEN)✓$(NC) Services arrêtés"

restart: ## Redémarre les containers Docker
	@docker compose restart
	@echo "$(GREEN)✓$(NC) Redémarré"

# ── Build & Tests ─────────────────────────────────────────────────────────────

build: ## Compile TypeScript
	@npm run build
	@echo "$(GREEN)✓$(NC) Build OK"

test: ## Lance tous les tests
	@npm test -- --no-coverage

test-watch: ## Lance les tests en mode watch
	@npm run test:watch

test-coverage: ## Lance les tests avec rapport de couverture
	@npm test -- --coverage

lint: ## Vérifie les types TypeScript
	@npx tsc --noEmit && echo "$(GREEN)✓$(NC) Aucune erreur TypeScript"

audit: ## Vérifie les vulnérabilités npm
	@npm audit

# ── Base de données ───────────────────────────────────────────────────────────

migrate: ## Exécute les migrations de base de données
	@node dist/db/index.js && node dist/db/migrate.v2.js
	@echo "$(GREEN)✓$(NC) Migrations OK"

seed: ## Crée des données de démo (client test + monitors)
	@node dist/db/seed.js
	@echo "$(GREEN)✓$(NC) Données de démo créées"

db-reset: ## Remet la DB à zéro (DESTRUCTIF)
	@read -p "⚠ Supprimer toutes les données ? [y/N] " confirm && [ "$$confirm" = "y" ]
	@docker compose exec postgres psql -U cronguard -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
	@make migrate
	@echo "$(GREEN)✓$(NC) DB réinitialisée"

db-shell: ## Ouvre un shell PostgreSQL interactif
	@docker compose exec postgres psql -U cronguard cronguard

redis-shell: ## Ouvre un shell Redis interactif
	@docker compose exec redis redis-cli

# ── Monitoring ────────────────────────────────────────────────────────────────

logs: ## Affiche les logs Docker en temps réel
	@docker compose logs -f --tail=50

logs-api: ## Logs de l'API uniquement
	@docker compose logs -f api --tail=50

logs-worker: ## Logs des workers uniquement
	@docker compose logs -f worker checker --tail=50

status: ## Statut des containers Docker
	@docker compose ps

queue-status: ## Taille des queues BullMQ (Redis)
	@echo "$(BOLD)Queues BullMQ :$(NC)"
	@docker compose exec redis redis-cli LLEN bull:ping-processor:waiting  | xargs -I{} echo "  ping-processor waiting : {}"
	@docker compose exec redis redis-cli LLEN bull:llm-analysis:waiting    | xargs -I{} echo "  llm-analysis waiting   : {}"
	@docker compose exec redis redis-cli GET llm:circuit_breaker           | xargs -I{} echo "  circuit breaker        : {}"

# ── Tests rapides ─────────────────────────────────────────────────────────────

ping-test: ## Envoie un ping de test (nécessite make seed)
	@if [ -z "$(PING_KEY)" ]; then \
		echo "$(AMBER)⚠$(NC)  Clé de ping non trouvée. Lancez 'make seed' d'abord."; \
		exit 1; \
	fi
	@echo "$(BLUE)→$(NC) Envoi d'un ping succès..."
	@curl -s -X POST $(API_URL)/ping/$(PING_KEY) \
		-H "Content-Type: application/json" \
		-d '{"status":"success","duration_ms":1234,"records":5000}' | python3 -m json.tool
	@echo ""
	@echo "$(BLUE)→$(NC) Envoi d'un ping échec..."
	@curl -s -X POST $(API_URL)/ping/$(PING_KEY) \
		-H "Content-Type: application/json" \
		-d '{"status":"fail","exit_code":1,"output":"ERROR: Database connection refused at line 42"}' | python3 -m json.tool

health: ## Vérifie la santé de l'API
	@curl -s $(API_URL)/health | python3 -m json.tool

api-test: ## Lance une série de tests sur l'API live
	@echo "$(BOLD)Test de l'API $(API_URL)$(NC)"
	@echo "$(BLUE)→$(NC) Health check..."
	@curl -sf $(API_URL)/health > /dev/null && echo "  $(GREEN)✓$(NC) /health OK" || echo "  $(RED)✗$(NC) /health FAIL"
	@echo "$(BLUE)→$(NC) Auth sans clé..."
	@STATUS=$$(curl -s -o /dev/null -w "%{http_code}" $(API_URL)/monitors); \
		[ "$$STATUS" = "401" ] && echo "  $(GREEN)✓$(NC) 401 sans clé" || echo "  $(RED)✗$(NC) Attendu 401, reçu $$STATUS"
	@if [ -n "$(API_KEY)" ]; then \
		echo "$(BLUE)→$(NC) Auth avec clé..."; \
		STATUS=$$(curl -s -o /dev/null -w "%{http_code}" -H "X-API-Key: $(API_KEY)" $(API_URL)/monitors); \
		[ "$$STATUS" = "200" ] && echo "  $(GREEN)✓$(NC) 200 avec clé" || echo "  $(RED)✗$(NC) Attendu 200, reçu $$STATUS"; \
	fi
	@echo ""

# ── Dashboard ─────────────────────────────────────────────────────────────────

open: ## Ouvre le dashboard dans le navigateur
	@echo "$(BLUE)→$(NC) Ouverture du dashboard..."
	@(command -v open && open $(API_URL)/dashboard) || \
	 (command -v xdg-open && xdg-open $(API_URL)/dashboard) || \
	 echo "  Dashboard : $(API_URL)/dashboard"

# ── Déploiement ───────────────────────────────────────────────────────────────

deploy-fly: ## Déploie sur Fly.io
	@echo "$(BLUE)→$(NC) Déploiement sur Fly.io..."
	@fly deploy
	@echo "$(GREEN)✓$(NC) Déployé"

deploy-check: ## Vérifie que l'app est prête pour la prod
	@echo "$(BOLD)Checklist de déploiement :$(NC)"
	@grep -q "^DATABASE_URL=" .env && echo "  $(GREEN)✓$(NC) DATABASE_URL" || echo "  $(RED)✗$(NC) DATABASE_URL manquant"
	@grep -q "^REDIS_URL=" .env    && echo "  $(GREEN)✓$(NC) REDIS_URL"    || echo "  $(RED)✗$(NC) REDIS_URL manquant"
	@grep -q "^LLM_BASE_URL=" .env && echo "  $(GREEN)✓$(NC) LLM_BASE_URL" || echo "  $(RED)✗$(NC) LLM_BASE_URL manquant"
	@grep -q "^STRIPE_SECRET_KEY=sk_live" .env && echo "  $(GREEN)✓$(NC) Stripe live key" || echo "  $(AMBER)⚠$(NC)  Stripe non configuré (paiements désactivés)"
	@grep -q "^SMTP_PASS=." .env   && echo "  $(GREEN)✓$(NC) SMTP configuré" || echo "  $(AMBER)⚠$(NC)  SMTP non configuré (emails désactivés)"
	@node dist/db/index.js 2>/dev/null && echo "  $(GREEN)✓$(NC) DB accessible" || echo "  $(RED)✗$(NC) DB inaccessible"
	@make lint 2>/dev/null && echo "  $(GREEN)✓$(NC) TypeScript OK" || echo "  $(RED)✗$(NC) Erreurs TypeScript"
	@make test 2>/dev/null | grep -q "45 passed" && echo "  $(GREEN)✓$(NC) 45 tests passés" || echo "  $(RED)✗$(NC) Tests échoués"
	@echo ""

# ── Nettoyage ─────────────────────────────────────────────────────────────────

clean: ## Supprime les fichiers compilés
	@rm -rf dist
	@echo "$(GREEN)✓$(NC) dist/ supprimé"

clean-all: clean ## Supprime tout (dist + node_modules + containers)
	@rm -rf node_modules
	@docker compose down -v
	@echo "$(GREEN)✓$(NC) Tout nettoyé"

.DEFAULT_GOAL := help
