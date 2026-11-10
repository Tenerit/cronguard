# CronGuard

**Self-hosted cron monitoring that diagnoses failures on your own machine.**

A job fails at 2:40 a.m. Other monitors tell you *that* it broke. CronGuard tells you *why*, when it can know, from three sources that never leave your servers: a library of known cron failures, what it observes on the host (the cron command, the job's real environment, exit codes), and a local AI model for the rest. When it cannot establish a cause, it says so instead of guessing.

**Who it's for:** ops / SRE / data teams whose critical jobs (backups, ETL, billing sync) run on infrastructure where logs must not go to a third-party SaaS: regulated, air-gapped, or simply private. Nothing leaves your infra, the AI included.

🇫🇷 [Version française](README.fr.md)

---

## What on-call looks like

Your nightly backup fails. CronGuard posts to Teams (or Slack, Discord, ntfy…). Alert texts are in French today; translated here:

> 🟠 **backup-db failed (production)**
> **Cause:** the `pg_dump` binary used by the cron is older than the PostgreSQL server (lower major version).
> **To check:** call a `pg_dump` of the server's version by absolute path, or install an up-to-date `postgresql-client`.
> `pg_dump: error: aborting because of server version mismatch`
> **[✅ Analysis right]** **[✏️ Correct]** **[Status page]**

- Right? One tap on **✅**, no login.
- Partly wrong? **✏️ Correct**, type what really fixed it. Next time the same failure happens, CronGuard serves *your* fix, without calling the model.

A classic monitor would have said `backup-db is DOWN`.

---

## Why it's different

| Source of the diagnosis | What it does |
|---|---|
| **Known-fix library** (106 sheets) | Standard messages of cron jobs and their tools (PostgreSQL, MySQL, rsync, SSH, GPG, certificates, cloud credentials, Docker, memory, disk…) mapped to the mechanism and the fix. Each sheet is tested against the failures it must not match. |
| **Command check** | Reads the cron command itself: unescaped `%`, a password after `-p `, bash syntax run by `sh`, unquoted `rsync -e`, relative paths, `sudo`. Also warns at **import time**, before anything fails. |
| **Execution-context probe** | On failure the SDK reports the cron's real user, HOME, PATH, shell, locale, DISPLAY / SSH-agent presence, and where a "command not found" actually lives on the machine. Names and paths only, no secret values. |
| **Official codes** | Shell exit status (126, 127, 128+N signals: 137 OOM/SIGKILL, 143 SIGTERM…), `curl: (N)` and `rsync (code N)` from their man pages. |
| **Local AI model** | `llama3.2:3b` through Ollama, on CPU. Called only when none of the above applies (the others answer instantly: 44 of 54 tuning cases, median 12.6 s → 0 s), with its confidence capped; when it only restates the error line, the alert says the cause is not established. |
| **Team memory** | Fixes confirmed from the alert are reused for the same failure, per job. It compounds with use and stays on your box. |

---

## Quick start

**Look at the UI, nothing installed.** Open `src/api/dashboard.html?demo=1` in a browser (or host that single file anywhere): sample monitors, analyses and the AI playground with pre-recorded replies, read-only.

**Run it, one container** (PostgreSQL, Redis, API and workers inside; AI optional):

```bash
git clone https://github.com/Tenerit/cronguard && cd cronguard
docker build -f Dockerfile.allinone -t cronguard .
docker run -d --restart unless-stopped -p 3000:3000 -v cronguard-data:/data --name cronguard cronguard
curl -X POST http://localhost:3000/auth/register -H "Content-Type: application/json" -d '{"email":"you@example.com"}'   # prints your API key, once
```

Open **http://localhost:3000/dashboard**. Without a model, failures still get the known fixes, the command and context checks and the related log lines; add local AI with `-e LLM_BASE_URL=http://<ollama-host>:11434/v1`. Data lives in the `cronguard-data` volume, with a PostgreSQL backup at start-up and every 24 h in `/data/backups`, kept 7 days (`BACKUP_INTERVAL_HOURS`, `BACKUP_KEEP_DAYS`, `BACKUP_ENABLED=false`; restore with `pg_restore --clean`). Copy that folder off the host.

**Demo with sample data and the AI model:**

```bash
docker compose -f docker-compose.demo.yml up     # then log in with API key cg_demo_dockerdemo123456
```

Boots PostgreSQL, Redis and Ollama, seeds 9 monitors with realistic failures and pulls the model (~2 GB on first boot).

**Air-gapped server:** on a connected machine, `scripts/offline-bundle.sh [folder] [--with-model]` writes the image (~80 MB), `install.sh` and `SHA256SUMS`; `--with-model` adds the Ollama image and the model (several GB). Copy the folder, then `sha256sum -c SHA256SUMS && ./install.sh`. No network needed.

**Production with Docker Compose:** `docker-compose.yml` (separate API, workers and services), see [DEPLOY.md](DEPLOY.md). For development: `./setup.sh` then `make dev`.

---

## Instrument your jobs

### Import an existing crontab

Creates one monitor per job and prints the crontab with each command wrapped by `cg_run`. Your crontab is never modified: you review and paste the result. With an API key, it also lists each command's risks before they fail.

```bash
sudo cp sdk/bash/cronguard.sh /usr/local/lib/cronguard.sh
CRONGUARD_API_KEY=cg_live_... sdk/bash/cronguard-import.sh            # preview
CRONGUARD_API_KEY=cg_live_... sdk/bash/cronguard-import.sh --apply    # create monitors
```

For `/etc/crontab` or `/etc/cron.d/*` (extra user column), pass the file and `--system`.

### systemd timers

`--systemd` creates one monitor per enabled timer and prints a root script that adds an `ExecStopPost=` drop-in to each service: it reports the result, the exit status and the journal of that run. The service's own command is not changed.

```bash
CRONGUARD_API_KEY=cg_live_... sdk/bash/cronguard-import.sh --systemd --apply > add-cronguard.sh
less add-cronguard.sh && sudo sh add-cronguard.sh
```

Common `OnCalendar=` forms become cron schedules; others use a grace period of 1.5 × the interval. System timers only.

### Bash, Node.js, Python, cURL

```bash
source /usr/local/lib/cronguard.sh
cg_run "your-ping-key" /scripts/backup.sh      # sends logs, exit code, duration, and the context probe on failure
```

```javascript
import { monitor } from './sdk/node/cronguard'
await monitor('your-ping-key', async () => ({ records: await syncDatabase() }))
```

```python
from sdk.python.cronguard import monitor

@monitor('your-ping-key')
def my_job():
    return {'records': sync_database()}
```

```bash
curl -X POST http://localhost:3000/ping/your-ping-key -d '{"status":"fail","exit_code":1,"output":"..."}'
curl http://localhost:3000/ping/your-ping-key/$?          # one-liner: 0 = success, else failure
curl http://localhost:3000/ping/your-ping-key/start       # hung-job detection: start, then the result at the end
```

---

## Notifications

Alerts go out on every configured channel, followed by a recovery notice with the downtime.

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

---

## How good is the diagnosis?

Measured automatically on real failures, not asserted. Each answer is graded out of 10 by code ([eval/rubric.ts](eval/rubric.ts)): the mechanism named (4), a correct and safe action (3), the category (1), nothing invented (1), the decisive log line linked (1), ±1 for honesty.

| Set | Score /10 |
|---|---|
| Failures the known-fix library covers | **9.2** |
| Failures it does not cover (the local model alone) | **3.7** |
| All 85 cases used while tuning (lab + 4 public sets) | **7.8**, optimistic since these cases were read |
| **Held-out test (public5): 12 StackExchange cron failures collected after every change** | **4.7** (runs 4.4–4.8); the local model alone: 1.9 |

The held-out number is the one to judge us on. On it, CronGuard recognised 4 of 12 failures with a known fix (8.0 on those) and scored 3.0 on the rest. Real cron failures are often one-off mistakes that no library describes, and a 3B model mostly restates them; that is why the probe, the command check and your team's fixes matter more than the model. Full method, every experiment (including the ones that did not help) and how to score your own logs: [docs/EVALUATION.md](docs/EVALUATION.md).

---

## Local AI model

Default: **`llama3.2:3b` through Ollama**, non-reasoning, fast on CPU. **The model is optional**: leave `LLM_BASE_URL` unset (or `LLM_ENABLED=false`) and everything except the model's free-text fallback still works; the same fallback applies when the model is down.

- **Any local OpenAI-compatible server** works the same way (`LLM_BASE_URL`, `LLM_MODEL`): vLLM, llama.cpp server, LM Studio. Pointing it at a remote provider would send logs off your infrastructure; CronGuard is not designed for that.
- **Incident memory** (on by default, `MEMORY_ENABLED`): incidents you confirm are embedded locally (`nomic-embed-text`) and the most similar ones guide the next analysis. A recurring error with the same fingerprint (timestamps, PIDs, UUIDs, IPs stripped) is served from cache without calling the model.
- **Bounded prompts:** repeated error lines collapse into templates, long lines are capped and the log slice is bounded (`LLM_LOG_BUDGET`), so every analysis costs a predictable amount.
- **Runbook notes** per monitor (known gotchas, who to wake) are given to the model as context.

---

## How it compares

| | **CronGuard** | Healthchecks.io | Cronitor |
|---|---|---|---|
| Missed / late / hung jobs (cron-aware) | ✅ | ✅ | ✅ |
| **Cause and fix from your logs** | ✅ library + host checks + local AI | ❌ | ❌ |
| **Validate or correct a diagnosis from the alert; reused next time** | ✅ | ❌ | ❌ |
| **Checks the cron command and the job's real environment** | ✅ | ❌ | ❌ |
| Output validation (records min/max) | ✅ | ❌ | ✅ |
| Incident history with MTTR and downtime | ✅ | ❌ | partial |
| Chat and on-call integrations | email, Slack, Teams, Discord, Google Chat, Mattermost, ntfy, PagerDuty, webhook | many more | many |
| Self-hosted, data stays home | ✅ | ✅ | ❌ |
| License | MIT | BSD-3 | proprietary |

Healthchecks has far more integrations. CronGuard does one thing it doesn't: it reads the failure for you.

---

## Security and access

- **API keys** stored as SHA-256 digests, only accepted in the `X-API-Key` header; roles `viewer < member < admin < owner`, link-based team invites, key rotation, audit log.
- **SSO through your reverse proxy** (oauth2-proxy, Authelia, Pomerium, a SAML/OIDC gateway): the proxy authenticates, CronGuard maps the email to a role. The app never talks to an identity provider itself.
  ```bash
  SSO_ENABLED=true
  SSO_TRUSTED_PROXIES=10.0.0.10        # or SSO_SHARED_SECRET=... (at least one: fail-closed)
  SSO_EMAIL_HEADER=X-Forwarded-Email
  SSO_ALLOWED_DOMAINS=corp.com         # just-in-time accounts as viewers, never owner
  ```
- **Hardening:** strict script Content-Security-Policy, secrets (passwords, tokens, keys, credentials in URLs, `mysql -p…`) redacted from job output and commands as they arrive, before anything is queued or stored, prompt-injection isolation, SSRF guard on every outbound webhook (cloud metadata and loopback always blocked, DNS rebinding checked), per-client and global rate limits, circuit breaker on the model. See [SECURITY.md](SECURITY.md).

---

## Observability

`GET /metrics` (Prometheus; protect with `METRICS_TOKEN`). Alert on CronGuard itself: `cronguard_worker_heartbeat_age_seconds > 600`, `cronguard_analysis_queue_depth`, `cronguard_notification_failures_total{channel}`, `cronguard_analysis_dlq_depth`. A monitor cannot see its own host die: scrape it from an **external** Prometheus, rules in [docs/cronguard.rules.yml](docs/cronguard.rules.yml).

---

## Architecture

```
cron job ──(SDK: logs, exit code, command, context)──▶ API (Express) ──▶ BullMQ / Redis
                                                                           │
   ┌──────────────────────────────── workers ──────────────────────────────┤
   ├─ ping processor    stores the run, validates output, recovery notice  │
   ├─ analysis          command check → context probe → known fixes →      │
   │                    official codes → local model (Ollama) → alerts     │
   ├─ timeout checker   missed / late / hung / slow jobs, escalation       │
   ├─ retention         purges old pings and analyses                      │
   └─ self-monitor      API, workers and queue health                      │
                                                                           │
PostgreSQL (monitors, runs, analyses, verified fixes, audit)  ◀────────────┘
```

---

## Pricing

**Self-hosted: free, MIT, every feature.** Paid offers are hosting and support, not locked features: [open an issue](https://github.com/Tenerit/cronguard/issues) to talk about it.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). `npm run ci` runs what must pass: types, both test suites (jest and vitest), the production dependency audit, the build and an end-to-end run on a real PostgreSQL and Redis.

## License

[MIT](LICENSE)

Built with Node.js · TypeScript · Express · BullMQ · PostgreSQL · Redis · Ollama
