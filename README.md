# CronGuard

**Cron job monitoring that tells you *why* it broke — not just that it broke.**

Self-hosted, AI-powered failure analysis. A job fails, CronGuard reads the logs and hands you the root cause, the fix, and how to prevent it. In seconds, without opening a single log file.

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

## Try it in one command

```bash
git clone https://github.com/Tenerit/cronguard && cd cronguard
docker compose -f docker-compose.demo.yml up
```

Then open **http://localhost:3000/dashboard** and log in with API key `cg_demo_dockerdemo123456`.

The demo boots Postgres, Redis and Ollama, migrates the schema, seeds 9 monitors with realistic failure scenarios (disk full, OOM kill, deadlock, rate limit, data corruption…) and pulls the LLM model in the background. No `.env`, no setup.

### Zero-install demo (static, read-only)

Want to *look* before running anything? `dashboard.html` has a built-in read-only demo mode driven by embedded fixtures — **no backend, no database**. Open it with `?demo=1`:

```
.../dashboard.html?demo=1
```

It auto-loads sample monitors, AI analyses, MTTR/impact and a working **AI playground** (canned responses), all client-side. Host the single file on any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages) — or serve it from a subdomain starting with `demo.` to enable it automatically. Mutations are disabled; it's a safe public showcase.

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

**Benchmark** — 26 real-world failure scenarios ([eval/](eval/), `npm run eval`), default model on CPU:
**100%** valid structured output · **81%** exact root-cause category · **96%** severity within one rank · ~15s per analysis.
Most misses are genuinely ambiguous boundaries (is a disk-full `pg_dump` failure *database* or *resources*?).
The fixtures and scoring are in the repo — rerun it, or point `LLM_API_KEY` at a stronger model and compare.

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

Set `MEMORY_ENABLED=true` to turn the feedback loop into a real memory: every analysis you mark 👍 is embedded (locally, via Ollama `nomic-embed-text` — no egress) and, on the next failure, the most **similar** past incidents across all your jobs are retrieved as few-shot examples (cosine similarity), instead of just the most recent. The cache also dedupes by a normalized error fingerprint (timestamps/PIDs/UUIDs/IPs stripped), so a recurring error is answered from cache instead of re-calling the model. No pgvector required — embeddings live in a `real[]` column and ranking is done in-app.

You can also give each monitor a **runbook / notes** field (in its edit dialog) — known gotchas, dependencies, who to wake. It's injected into the prompt so the analysis is grounded in your operational context.

**Token budget.** Before sending logs to the model, CronGuard deduplicates repeated error lines (a job spewing the same line 100× adds cost, not signal), caps over-long single lines, and bounds the total log slice — tunable with `LLM_LOG_BUDGET` (characters, default `2400`). This trims input tokens on every analysis, local and cloud alike. The biggest saver stays the cache: a recurring error (same fingerprint) is answered for free without calling the model at all.

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
