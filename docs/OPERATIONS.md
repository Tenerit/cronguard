# Running CronGuard

Other ways to run it, notifications, security, observability and architecture. Back to the [README](../README.md).

## Other ways to run it

**Look at the UI, nothing installed.** Open `src/api/dashboard.html?demo=1` in a browser (or host that single file anywhere): sample monitors, analyses and the AI playground with pre-recorded replies, read-only.

**Demo with sample data and the AI model:**

```bash
docker compose -f docker-compose.demo.yml up     # then log in with API key cg_demo_dockerdemo123456
```

Boots PostgreSQL, Redis and Ollama, seeds 9 monitors with realistic failures and pulls the explanation model (`qwen2.5:7b`, ~4.7 GB on first boot; causes show immediately, plain-words explanations once the pull is done).

**Plain-words explanation (optional AI).** Without a model, failures get everything but that explanation; add it with `-e LLM_BASE_URL=http://<ollama-host>:11434/v1 -e LLM_EXPLAIN_MODEL=qwen2.5:7b-instruct-q4_K_M`.

**Backups.** Data lives in the `cronguard-data` volume, with a PostgreSQL backup at start-up and every 24 h in `/data/backups`, kept 7 days (`BACKUP_INTERVAL_HOURS`, `BACKUP_KEEP_DAYS`, `BACKUP_ENABLED=false`; restore with `pg_restore --clean`). Copy that folder off the host.

**Air-gapped server:** on a connected machine, `scripts/offline-bundle.sh [folder] [--with-model]` writes the image (~80 MB), `install.sh` and `SHA256SUMS`; `--with-model` adds the Ollama image and the model (several GB). Copy the folder, then `sha256sum -c SHA256SUMS && ./install.sh`. No network needed.

**Production with Docker Compose:** `docker-compose.yml` (separate API, workers and services), see [DEPLOY.md](../DEPLOY.md). For development: `./setup.sh` then `make dev`.

## Notifications

Alerts go out on every configured channel, followed by a recovery notice with the downtime. Alert language is an account setting (Settings › Account › Alert language, French or English): labels, buttons, recovery and escalation messages, and the facts reported by the SDKs. The diagnosis text of the fix library is still French.

| Channel | Setup |
|---|---|
| Email | `SMTP_*` variables |
| Slack | incoming webhook, Settings › Notifications |
| Microsoft Teams | Workflows webhook ("post to a channel when a webhook request is received"), native card |
| Discord · Google Chat · Mattermost / Rocket.Chat | webhook URL, Settings › Notifications › Other platforms |
| ntfy | push notification to the phone, high priority; can be self-hosted |
| PagerDuty | routing key; the incident resolves itself on recovery |
| Generic webhook | any URL (n8n, Zapier, in-house tool), JSON payload, optional HMAC signature (`WEBHOOK_SIGNING_SECRET`) |

**Validate or correct from the alert, without logging in.** The **✅** and **✏️** buttons open a page signed for that one analysis (HMAC, 30 days, no API key). Opening the link records nothing, because chat apps open links to build previews; only the page's button does. Every action is in the audit log. `APP_URL` must be reachable from the on-call phone (VPN or intranet is fine).

Escalation to a second contact when an alert is not acknowledged, maintenance windows that silence alerts, and per-monitor runbook notes are in the dashboard.

## Security and access

- **API keys** stored as SHA-256 digests, only accepted in the `X-API-Key` header; roles `viewer < member < admin < owner`, link-based team invites, key rotation, audit log.
- **SSO through your reverse proxy** (oauth2-proxy, Authelia, Pomerium, a SAML/OIDC gateway): the proxy authenticates, CronGuard maps the email to a role. The app never talks to an identity provider itself.
  ```bash
  SSO_ENABLED=true
  SSO_TRUSTED_PROXIES=10.0.0.10        # or SSO_SHARED_SECRET=... (at least one: fail-closed)
  SSO_EMAIL_HEADER=X-Forwarded-Email
  SSO_ALLOWED_DOMAINS=corp.com         # just-in-time accounts as viewers, never owner
  ```
- **Hardening:** strict script Content-Security-Policy, secrets (passwords, tokens, keys, credentials in URLs, `mysql -p…`) redacted from job output and commands as they arrive, before anything is queued or stored, prompt-injection isolation, SSRF guard on every outbound webhook (cloud metadata and loopback always blocked, DNS rebinding checked), per-client and global rate limits, circuit breaker on the model. See [SECURITY.md](../SECURITY.md).

## Observability

`GET /metrics` (Prometheus; protect with `METRICS_TOKEN`). Alert on CronGuard itself: `cronguard_worker_heartbeat_age_seconds > 600`, `cronguard_analysis_queue_depth`, `cronguard_notification_failures_total{channel}`, `cronguard_analysis_dlq_depth`. A monitor cannot see its own host die: scrape it from an **external** Prometheus, rules in [docs/cronguard.rules.yml](cronguard.rules.yml).

## Architecture

```
cron job ──(SDK: logs, exit code, command, context)──▶ API (Express) ──▶ BullMQ / Redis
                                                                           │
   ┌──────────────────────────────── workers ──────────────────────────────┤
   ├─ ping processor    stores the run, validates output, recovery notice  │
   ├─ analysis          host facts → command check → known fixes → codes → │
   │                    alerts → verified local AI explanation (cached)    │
   ├─ timeout checker   missed / late / hung / slow jobs, escalation       │
   ├─ retention         purges old pings and analyses                      │
   └─ self-monitor      API, workers and queue health                      │
                                                                           │
PostgreSQL (monitors, runs, analyses, verified fixes, audit)  ◀────────────┘
```
