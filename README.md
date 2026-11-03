# CronGuard

**Cron job monitoring that tells you *why* it broke — not just that it broke.**

Self-hosted, AI-powered failure analysis. A job fails, CronGuard reads the logs and hands you the root cause, the fix, and how to prevent it. In seconds, without opening a single log file.

**Who it's for:** ops / SRE / data teams in **regulated or air-gapped** environments — where critical crons (backups, ETL, billing sync) can't ship their logs to a third-party SaaS. The AI runs **locally**; nothing leaves your infra.

**▶ See it now — zero install.** Open the dashboard in read-only demo mode (full UI + AI playground, no backend, no signup): **[live demo](https://YOUR-DEMO-URL.example/dashboard.html?demo=1)** ← *host `src/api/dashboard.html` on any static host (Netlify/Pages) and drop the URL here; or open it locally with `?demo=1`.* The static demo's AI replies are **pre-recorded samples** — run it for real (below) to see live `llama3.2` analysis.

🇫🇷 [Version française](README.fr.md)

---

## The difference

Your nightly `pg_dump` backup fails. Here is what each tool tells you:

> **A classic monitor (Healthchecks, Cronitor):**
> 🔴 `backup-postgres is DOWN`

> **CronGuard:**
> 🔴 `backup-postgres failed (exit 1) — severity: high`
> **Root cause:** pg_dump fails on the standby replica — WAL recovery conflict on tables `events` and `orders`.
> **Fix now:** raise `max_standby_streaming_delay` to 300s in postgresql.conf on the replica, then reload.
> **Prevent:** schedule the backup on the primary, or enable `hot_standby_feedback=on`.
> **Check first:** replication lag in `pg_stat_replication` · current `max_standby_streaming_delay` · pending WAL size.

One alert is a notification. The other is a head start on the fix.

<!-- demo.gif: record dashboard → failed job → AI analysis drawer. Place in docs/demo.gif -->
<!-- ![CronGuard demo](docs/demo.gif) -->

---

## See it without installing anything

`dashboard.html` has a built-in read-only demo — embedded fixtures, **no backend, no database, no signup**. Open it with `?demo=1`:

```
.../dashboard.html?demo=1
```

Sample monitors, AI analyses, MTTR/impact and a working **AI playground** (pre-recorded replies), all client-side. Host the single file on any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages), or serve it from a `demo.*` subdomain to auto-enable. Mutations are disabled — a safe public showcase.

## Run it for real — one command

```bash
git clone https://github.com/Tenerit/cronguard && cd cronguard
docker compose -f docker-compose.demo.yml up
```

Then open **http://localhost:3000/dashboard** and log in with API key `cg_demo_dockerdemo123456`.

The demo boots Postgres, Redis and Ollama, migrates the schema, seeds 9 monitors with realistic failure scenarios (disk full, OOM kill, deadlock, rate limit, data corruption…) and pulls the LLM model in the background. No `.env`, no setup. First boot pulls ~2 GB (model) — give it a few minutes; the playground shows a "model loading" state until ready.

---

## How it compares

| | **CronGuard** | Healthchecks.io | Cronitor |
|---|---|---|---|
| Detects missed / late jobs (cron-aware) | ✅ | ✅ | ✅ |
| Detects hung jobs (`/start` ping) | ✅ | ✅ | ✅ |
| **AI root-cause analysis from your logs** | ✅ | ❌ | ❌ |
| **Suggested fix + prevention + checklist** | ✅ | ❌ | ❌ |
| Incident history with MTTR & downtime | ✅ | ❌ | partial |
| Output validation (records min/max) | ✅ | ❌ | ✅ |
| Recovery notifications | ✅ | ✅ | ✅ |
| Email / Slack / generic webhook | ✅ | ✅ | ✅ |
| Prometheus `/metrics` | ✅ | ✅ | ❌ |
| Self-hosted, your data stays home | ✅ | ✅ | ❌ |
| LLM runs locally (no log leaves your infra) | ✅ | — | — |
| License | MIT | BSD-3 | proprietary |

CronGuard is not trying to out-feature Healthchecks on integrations. It does one thing they don't: **it reads the logs so you don't have to.**

---

## Pricing

**Self-hosted: free, forever (MIT).** Every feature ships in the open-source build — local AI analysis, alerts, escalation, maintenance windows, RBAC, SSO forward-auth, audit log, key rotation, status pages, Prometheus metrics. **No feature gates.**

| | For | Price |
|---|---|---|
| **Self-host** | You run it — full features, your infra, zero egress. | **Free (MIT)** |
| **Managed / Support** | We host & operate it, or back your self-host with SLA support. | Contact — [open an issue](https://github.com/Tenerit/cronguard/issues) |

Revenue is hosting and support, not locked features. The thing you'd pay for (running PG + Redis + Ollama + the workers) is exactly what self-hosters who *want* the no-egress guarantee already choose to run.

---

## Full setup (3 minutes)

```bash
git clone https://github.com/Tenerit/cronguard
cd cronguard
./setup.sh        # installs, configures, migrates, downloads the LLM model
make dev          # starts API + workers
make seed         # creates a demo account with data
make open         # opens the dashboard
```

The setup script detects your environment and configures everything automatically.

---

## Instrument your jobs

### Bash (simplest)
```bash
source sdk/bash/cronguard.sh
cg_run "your-ping-key" /scripts/my-script.sh
```

### Node.js
```javascript
import { monitor } from './sdk/node/cronguard'

await monitor('your-ping-key', async () => {
  const count = await syncDatabase()
  return { records: count }
})
```

### Python
```python
from sdk.python.cronguard import monitor

@monitor('your-ping-key')
def my_job():
    count = sync_database()
    return {'records': count}
```

### Plain cURL
```bash
# Full payload (JSON) — logs enable the AI analysis
curl -X POST http://localhost:3000/ping/your-ping-key \
  -d '{"status":"success","duration_ms":1200,"records":5000}'

# One-liner, no JSON (Healthchecks style)
curl http://localhost:3000/ping/your-ping-key/$?      # exit code: 0 = success, else fail
curl http://localhost:3000/ping/your-ping-key/fail    # explicit failure
curl "http://localhost:3000/ping/your-ping-key/success?duration_ms=1200"

# Hung job detection: ping /start first, completion at the end
curl http://localhost:3000/ping/your-ping-key/start   # job started
./my-script.sh
curl http://localhost:3000/ping/your-ping-key/$?      # done — silent too long → "hung" alert
```

---

## Notifications

Alerts go out on **every** configured channel, followed by a **recovery**
notification ("✅ resolved", with downtime duration) when the job goes green again.

| Channel | Configuration |
|---------|---------------|
| Email | `SMTP_*` variables |
| Slack | incoming webhook — Settings › Notifications |
| Generic webhook | custom URL (Discord, Teams, PagerDuty, n8n…) — receives the alert/recovery/escalation JSON |

Outbound generic webhooks can be **HMAC-signed** for authenticity: set `WEBHOOK_SIGNING_SECRET` and each request carries `X-CronGuard-Signature: sha256=<hmac>` over `<X-CronGuard-Timestamp>.<raw body>`. Receivers recompute it (constant-time compare) and reject stale timestamps to prevent replay. Slack uses its own scheme and is left untouched.

---

## Observability

```bash
curl http://localhost:3000/metrics    # Prometheus format (monitors, alerts, pings 24h…)
```

Optionally protected with `METRICS_TOKEN` (`Authorization: Bearer <token>` or `?token=`).

**Self-watch metrics** (alert on these — a monitoring tool that dies silently is worthless):
- `cronguard_worker_heartbeat_age_seconds` — dead-man; alert if `> 600` (worker dead).
- `cronguard_analysis_queue_depth` — balloons if the analysis worker stalls.
- `cronguard_analysis_failures_24h` — failed pings with no AI analysis produced.
- `cronguard_notification_failures_total{channel}` — alert deliveries that failed (bad SMTP, dead webhook) instead of dying in the logs.
- `cronguard_analysis_dlq_depth` — analysis jobs that exhausted retries, parked in a dead-letter queue. Inspect with `GET /clients/dlq` and re-run them with `POST /clients/dlq/replay` (admin; scoped to your tenant).

⚠️ **A monitoring tool cannot detect its own host dying.** If the box hosting CronGuard dies, its self-watch dies with it. **Scrape `/metrics` from an *external* Prometheus** so a failed scrape (`up == 0` / `absent`) is itself the dead-man. Ready-made alert rules: [`docs/cronguard.rules.yml`](docs/cronguard.rules.yml) (drop into your `rule_files:`).

---

## Authentication & SSO

By default, access is by **API key** (`X-API-Key`) with role-based access (`viewer < member < admin < owner`) and link-based team invites — no passwords, no sessions.

For enterprise deployments, CronGuard supports **SSO via forward-auth**: put it behind your existing SSO reverse-proxy (oauth2-proxy, Authelia, Pomerium, Cloudflare Access, or your corporate SAML/OIDC gateway). The proxy authenticates the user and injects their email; CronGuard maps it to a team member and role. **The app never talks to an IdP itself** — keeping the no-egress guarantee intact, ideal for air-gapped/regulated environments.

```bash
SSO_ENABLED=true
SSO_TRUSTED_PROXIES=10.0.0.10        # or SSO_SHARED_SECRET=... (at least one — fail-closed)
SSO_EMAIL_HEADER=X-Forwarded-Email   # header your proxy injects
SSO_ALLOWED_DOMAINS=corp.com         # JIT-provision these domains as viewers (never owner)
```

The dashboard, served from behind the proxy, detects the SSO session (`/auth/whoami`) and skips the API-key prompt. The identity header is only trusted from the configured proxy IP or with a matching shared secret.

---

## LLM model

Default: **llama3.2:3b** through local Ollama (free, private, non-reasoning → fast on CPU).
No log ever leaves your infrastructure.

**Benchmark (lab set)** — 26 curated failure scenarios ([eval/](eval/), `npm run eval`), default model on CPU, **5-run mean ± std** ([eval/results.json](eval/results.json)):
**100%** valid structured output · **76% ± 7%** exact root-cause category (runs ranged 69–85%) · **57% ± 4%** exact severity (**100%** within ±1 rank) · ~20s per analysis.
These fixtures are deliberately unambiguous, so treat this as an **upper bound, not a field number** — it measures the model on clean cases we authored, and the category score swings run-to-run (the model is non-deterministic).

**Measure it on YOUR logs (the number that matters).** The harness reports **mean ± std over N runs** and takes an independent real-incident set:
```bash
npx tsx eval/run.ts --runs 5                       # 5 runs on the lab set → mean ± std
cp eval/real-cases.example.ts eval/real-cases.ts   # paste ~20 of your real incident logs + expected labels
npx tsx eval/run.ts --set real --runs 5            # the honest score; exits non-zero if category < 75%
LLM_RAW_LOGS=true npx tsx eval/run.ts --runs 5      # model alone, no regex preprocessing (isolates each contribution)
LLM_MODEL=qwen3.5:4b npx tsx eval/run.ts --runs 5   # try another model → writes eval/results.qwen3.5_4b.json (canonical results.json untouched)
```
Only the default model writes the canonical `eval/results.json`; any other `LLM_MODEL` lands in `eval/results.<model>.json` (or pass `--out <path>`), so a comparison run never clobbers the published numbers. Don't trust our headline — point `LLM_API_KEY` at a stronger model, or run `--set real` and judge on your own data.

For higher quality, point to any **OpenAI-compatible** endpoint —
setting `LLM_API_KEY` enables auth and switches to cloud mode:

```bash
# OpenAI
LLM_BASE_URL=https://api.openai.com/v1   LLM_MODEL=gpt-4o-mini        LLM_API_KEY=sk-...
# OpenRouter (Claude, etc.)
LLM_BASE_URL=https://openrouter.ai/api/v1 LLM_MODEL=anthropic/claude-haiku-4-5 LLM_API_KEY=sk-or-...
# Groq (Llama 70B, very fast)
LLM_BASE_URL=https://api.groq.com/openai/v1 LLM_MODEL=llama-3.3-70b-versatile  LLM_API_KEY=gsk_...
```

Anthropic's native API (`api.anthropic.com`) isn't OpenAI-compatible, so it's handled
directly — auto-detected from the URL (or force `LLM_PROVIDER=anthropic`):

```bash
LLM_BASE_URL=https://api.anthropic.com/v1 LLM_MODEL=claude-haiku-4-5 LLM_API_KEY=sk-ant-...
```

> Cloud models send your logs off-box — this breaks the no-egress guarantee. Keep it
> opt-in; local Ollama stays the privacy-preserving default.

The context pipeline (7-day history, cross-job correlations, timing patterns,
few-shot from your feedback) stays identical — only the model changes.

### Incident memory (optional)

Incident memory is **on by default** (`MEMORY_ENABLED=true`; `setup.*` and the Docker demo pull the embedding model). Every analysis you mark 👍 is embedded (locally, via Ollama `nomic-embed-text` — no egress, ~274 MB) and, on the next failure, the most **similar** past incidents across all your jobs are retrieved as few-shot examples (cosine similarity), instead of just the most recent. This is the moat: it compounds with use and never leaves your box. The cache also dedupes by a normalized error fingerprint (timestamps/PIDs/UUIDs/IPs stripped), so a recurring error is answered from cache instead of re-calling the model. No pgvector required — embeddings live in a `real[]` column, ranking is done in-app. Set `MEMORY_ENABLED=false` to drop the embedding model on a minimal/air-gapped box; if the model is absent the embed call fails cleanly (no-op, no breakage).

You can also give each monitor a **runbook / notes** field (in its edit dialog) — known gotchas, dependencies, who to wake. It's injected into the prompt so the analysis is grounded in your operational context.

**Token budget.** Before sending logs to the model, CronGuard groups error lines by **template** (a lightweight, dependency-free port of the Drain algorithm, on by default — `LLM_TEMPLATE_MINING`): variants of one pattern (`Connection to db1 refused`, `…db2…`, `…db3…`) collapse to a single `[×3] Connection to db1 refused` line — fewer tokens on logs with repetitive variant spam (on already-unique logs it simply matches exact dedup, no extra saving), and the `×N` count tells the model whether a failure is systemic or isolated while keeping one concrete sample. It also caps over-long single lines and bounds the total log slice — tunable with `LLM_LOG_BUDGET` (characters, default `2400`) — which trims input tokens on every analysis, local and cloud alike. The biggest saver stays the cache: a recurring error (same fingerprint) is answered for free without calling the model at all.

**Structured output.** On the OpenAI-compatible path (Ollama's native engine, OpenAI, Groq, …) CronGuard asks the provider to constrain decoding to valid JSON (`response_format`, on by default — `LLM_JSON_MODE`). This hardens the "100% parsable" guarantee and makes swapping in a different model safe. Set `LLM_JSON_MODE=off` for an older provider that rejects the field; the native Anthropic path is unaffected.

---

## Useful commands

```bash
make help          # list all commands
make dev           # development (hot reload)
make test          # run the test suite (jest + vitest)
make ping-test     # send a test ping
make api-test      # check the API responds correctly
make queue-status  # BullMQ queue state
make db-shell      # interactive PostgreSQL shell
make deploy-check  # pre-production checklist
make deploy-fly    # deploy to Fly.io
```

---

## Architecture

```
Client script
    ↓ POST /ping/:key
API (Express)
    ↓ Queue (BullMQ + Redis)
Workers
    ├── Ping processor     → stores in DB, validates output, recovery notification
    ├── Analysis worker    → calls the LLM, sends alerts (email/Slack/webhook)
    └── Timeout checker    → silent jobs (cron-aware) + hung jobs + slowdowns · 60s
                                       ↓
                               Ollama (llama3.2:3b — instruct, non-reasoning)
                               internal network only
```

**Active protections:**
- Per-client rate limiting (10 analyses/hour) + global (30/minute)
- Redis-backed circuit breaker (cuts the LLM off after 5 errors)
- Alert deduplication (30-min cooldown, acknowledge, snooze)
- Log sanitization (9 patterns: JWT, API keys, URLs with creds…)
- Prompt-injection hardening (logs isolated in XML inside the prompt)
- SQL injection (column whitelist on PATCH)
- Outbound-webhook SSRF guard (cloud-metadata/loopback/link-local always blocked; DNS-rebinding checked on the resolved IP; RFC1918 opt-in via `WEBHOOK_BLOCK_PRIVATE`)

---

## Production deployment

See [DEPLOY.md](DEPLOY.md) for complete Fly.io and Hetzner VPS guides.

```bash
make deploy-check  # verifies everything is ready
make deploy-fly    # deploys
```

---

## Contributing

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for setup,
tests and architecture. In short: `npm test` + `npx vitest run`
+ `npx tsc --noEmit` must be green before any PR.

## License

[MIT](LICENSE) — use it, modify it, host it freely.

---

## Built with

Node.js · TypeScript · Express · BullMQ · PostgreSQL · Redis · Ollama (llama3.2:3b) · Stripe · Docker
