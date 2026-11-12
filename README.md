# CronGuard

**Self-hosted cron monitoring that observes why a job failed — and what fixed it — on your own machine. Observed, never guessed.**

A job fails at 2:40 a.m. Other monitors tell you *that* it broke. CronGuard tells you *why*:

1. **It observes.** On failure the SDK runs read-only test commands on the job's host: what your login shell finds that cron does not (commands, the *names* of environment variables), who owns the files the error mentions, who launched the job (crontab, container, systemd, Kubernetes, launchd).
2. **It diagnoses from facts.** Those observations, the cron command itself, a library of ~110 known cron failures and official exit codes establish the cause. Nothing is guessed: when nothing establishes it, CronGuard says *"cause not established"* and gives the command that reproduces the failure in cron's exact environment.
3. **A local AI explains it in plain words.** The model never picks the cause; it rewrites the established one for whoever is on call. Code rejects any sentence that cites a path, command or option absent from the facts, or that drops one of the listed possibilities.
4. **It observes the repair too.** At the first success after a failure, the SDK reruns the same checks and shows what changed — a variable now provided, a directory now writable, a different command. One click (**✓ That was the fix**) records it as your team's fix; a repair outside what the checks see (a database grant, a remote server) is said plainly instead of guessed.
5. **It learns from your team.** Fix a failure from the alert (✏️) and CronGuard serves your fix the next time — on every job of your team. **Draft the report** opens the incident report in your own mail app, prefilled with the facts, for you to complete and send.

**Who it's for:** ops / SRE / data teams whose critical jobs (backups, ETL, billing sync) run where logs must not go to a third-party SaaS: regulated, air-gapped, or simply private. Nothing leaves your infra, the AI included.

🇫🇷 [Version française](README.fr.md)

---

## What on-call looks like

Your nightly backup fails. CronGuard posts to Teams (or Slack, Discord, ntfy…). Alert texts are in French today; translated here:

> 🟠 **backup-db failed (production)**
> **Cause (observed):** your login shell finds `pg_dump` in `/usr/lib/postgresql/16/bin`; cron does not — its PATH is `/usr/bin:/bin`.
> **Action:** call `/usr/lib/postgresql/16/bin/pg_dump` by absolute path, or add that folder to `PATH=` at the top of the crontab.
> `pg_dump: command not found`
> **[✅ Analysis right]** **[✏️ Correct]** **[Status page]**

- Right? One tap on **✅**, no login.
- Partly wrong? **✏️ Correct**, type what really fixed it. Next time the same failure happens — on this job or another — CronGuard serves *your* fix.

A few seconds after the alert, the dashboard adds a plain-words explanation by the local AI, checked by code. A real one from our test set (`qwen2.5:7b`, translated):

> *In plain words:* the `rake` command cannot be found because cron starts with a minimal PATH that does not contain /usr/local/bin. Call the command by its absolute path or set PATH= at the top of the crontab.

A classic monitor would have said `backup-db is DOWN`.

---

## Why it's different

| Layer | What it does |
|---|---|
| **Test commands on the host** | On failure the SDK (bash, Python) checks the job's real user, HOME, PATH, shell and launcher, compares with your login shell (where it finds the commands cron cannot, the *names* of variables cron lacks — never their values), and inspects the files the error cites (exists, relative, owner, permissions). Read-only, 3 s cap, `CG_PROBE_LOGIN=0` to skip the login shell. |
| **Command check** | Reads the cron command itself: unescaped `%`, a password after `-p `, bash syntax run by `sh`, unquoted `rsync -e`, relative paths, `sudo`. Also warns at **import time**, before anything fails. |
| **Known-fix library** (~110 sheets) | Standard messages of cron jobs and their tools (PostgreSQL, MySQL, rsync, SSH, GPG, certificates, cloud credentials, Docker, memory, disk…) mapped to the mechanism and the fix. A sheet whose trigger fits several causes lists them all instead of picking one. Each sheet is tested against the failures it must not match. |
| **Official codes** | Shell exit status (126, 127, 128+N signals), `curl: (N)`, `rsync (code N)` from their man pages. |
| **Honest abstention** | No fact, no guess: "cause not established" plus the command that reproduces the failure under cron's exact environment (`env -i HOME=… PATH=… /bin/sh -c '<your command>'`). |
| **Observed fix** | The run context of the failure and of the first success after it are compared: what changed is shown on the failed analysis and confirmed in one click. Lab: the repair was visible in 7/11 cases as pre-registered, 11/11 after fixing two defects the test found (same scenarios). |
| **Incident report** | One click drafts it in your own mail app (or copies the text for a ticket): times, observed cause, log lines, observed fix, a "what was done" section. CronGuard sends nothing, no SMTP needed, no AI rewriting. |
| **Crontab import** | Paste a crontab in the dashboard (or run `cronguard-import.sh`): the schedule is written in plain words by code, the local AI suggests a readable name and flags critical jobs, you review and create. |
| **Verified local AI** | Explains an established cause in plain words, after the alert, cached per failure type; names jobs at import. Guard-railed in code (see below). Optional. |
| **Team memory** | Fixes confirmed from the alert are reused for the same failure. A failure CronGuard did not recognise, once fixed by the team, becomes a **team sheet** in one click (Settings › Learning, admins): prefilled from the failure line and the real fix, checked against the original logs, then recognised on every job of the team without a model. Failures nobody recognises yet are also listed in the weekly report. |

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

Open **http://localhost:3000/dashboard**. Without a model, failures get everything but the plain-words explanation; add it with `-e LLM_BASE_URL=http://<ollama-host>:11434/v1 -e LLM_EXPLAIN_MODEL=qwen2.5:7b-instruct-q4_K_M`. Data lives in the `cronguard-data` volume, with a PostgreSQL backup at start-up and every 24 h in `/data/backups`, kept 7 days (`BACKUP_INTERVAL_HOURS`, `BACKUP_KEEP_DAYS`, `BACKUP_ENABLED=false`; restore with `pg_restore --clean`). Copy that folder off the host.

**Demo with sample data and the AI model:**

```bash
docker compose -f docker-compose.demo.yml up     # then log in with API key cg_demo_dockerdemo123456
```

Boots PostgreSQL, Redis and Ollama, seeds 9 monitors with realistic failures and pulls the explanation model (`qwen2.5:7b`, ~4.7 GB on first boot; causes show immediately, plain-words explanations once the pull is done).

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

If the server has a local explanation model, the preview suggests a readable name and role for each job (`postgres-backup — backs up the clients database with pg_dump — every day at 02:30 ⚑ critical`); the schedule is always written by code. Measured on 77 real crontab lines: right 90 % of the time, which is why you review the preview before `--apply`. `--no-ai` keeps the command name.

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

Plain `curl` only reports success or failure: no logs masked on the host, no facts. On a host without bash or python3, the [static binary](sdk/go) sends the same facts as the SDKs.

**What the bash and Python SDKs add** (read-only, never a variable value or a file content):
- **What changed since the last success.** Every success leaves a fingerprint on the host (command, PATH, launch dir, variable *names*, size and date of the files the command names, version of known tools). On failure the alert says what changed: `pg_dump version: 15.4 → 16.1`, `variable API_TOKEN missing since the last success`. A fact next to the diagnosis, never presented as the cause.
- **"Succeeded but produced nothing."** Declare what a job must produce; an exit code 0 without it becomes a failure:
  ```bash
  CG_EXPECT="/bak/db-*.dump min=1M" cg_run "your-ping-key" /scripts/backup.sh   # by default the file must be written during this run; age=26h to relax
  ```

Lab (pre-registered, `eval/sdk-lab.ts`): the responsible change shown in 8/8 broken jobs and nothing shown when nothing changed; empty, stale, missing or too small outputs caught 5/5 with 0 false alarm on 22 normal runs.

**Also in the bash and Python SDKs:** `cg_step dump` / `cg_step upload` (the failure says in which step it stopped and how long the previous ones took); a ping the server did not receive is kept and replayed in order; an overlap with the previous run is reported (`CG_SKIP_IF_RUNNING=1` skips the run); memory (OOM from the cgroup), full volume and network (DNS, refused, no answer) are established as facts; secrets are masked on the host before sending. Before the first failure, `cg_doctor "<command>"` checks a command as cron will run it, without running it.

**Static binary (no bash, python3 or curl on the host):** [`sdk/go`](sdk/go), standard library only, ~6 MB.

```bash
docker run --rm -v "$PWD/sdk/go:/src" -w /src -e CGO_ENABLED=0 golang:1.23-alpine go build -ldflags "-s -w" -o cronguard .
cronguard run your-ping-key -- /scripts/backup.sh      # exit code = the command's; output still printed
cronguard step upload                                   # from inside the job, like cg_step
```

Same state files as the bash and Python SDKs (you can switch without losing the fingerprint or the queued pings), same masking list (checked by a test against Python), and the same facts except the login-shell comparison. It survives the OOM kill of its command, so the kernel's kill is reported as a fact. Lab in a bare Alpine container with `--memory=100m`: OOM kill and full volume established, pings replayed in order, a bash success followed by a Go failure shows only the two real changes. Linux and macOS; not Windows.

**Kubernetes:** [`sdk/kubernetes/cronjob.yaml`](sdk/kubernetes/cronjob.yaml) runs the bash SDK in a CronJob (image with bash, curl and python3; a small volume keeps the fingerprint and the unsent pings between pods). Checked in a container with the same paths and command, not on a real cluster.

The Node SDK does the same inside `monitor()` (`cgStep('upload')` for steps), with three gaps: no OOM counter (a Node process killed by the kernel takes the SDK with it; the missing ping alerts), no `CG_SKIP_IF_RUNNING` and no `doctor`, and `CG_EXPECT` wildcards only in the file name.

---

## Pilot report

At the end of a trial, measure it on your own server; nothing is sent anywhere:

```bash
docker compose exec api node dist/services/pilot-report.js --days 30 > pilot.md
```

Failures, share whose cause was established and by which source (observed on the host, team fix, exit code, generic library, not established), 👍/👎 from the team, fixes observed and confirmed, time to restore. Anonymised by default; `--names` and `--signatures` add job names and the unrecognised error lines (review before sharing).

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

---

## How good is the diagnosis?

Measured, not asserted. Criteria are written down before each test; failures are published like successes ([CHANGELOG](CHANGELOG.md), [docs/EVALUATION.md](docs/EVALUATION.md)).

| Test | Result |
|---|---|
| **Real cron failures in a container** (real `crond`, a user with their own `~/.profile`, bash and Python SDKs, 11 failures with a known cause) | **11/11 causes established with the test commands, 3/11 without**; the genuine application bug left as "not established", nothing invented. Scenarios written by us: proof it works on real cron, not a coverage figure. |
| **Held-out StackExchange failures** (public6, 15 cases collected before the changes) | Wrong causes stated as fact: **12/30 without model deduction vs 20/30 with it**, for the same number of right causes. Score 3.9/10 vs 4.2 (not significant). These cases have logs only — no host probes. |
| Failures the known-fix library covers | 9.2/10 on the cases we tuned on, **5.0 on held-out ones**: the library generalises imperfectly, which is why it learns from your team. |

**The number to judge us on is not out yet:** how many of *your* failures CronGuard explains. Run it on your jobs; the weekly report shows what it did not recognise.

---

## Local AI — verified, optional

We measured what a local model is good at. Asked to **find** an unknown cause, a 3B model was wrong about half the time and never found a mechanism the log did not state (0/78). So the model **never picks the cause** anymore. Asked to **explain** an established cause in plain words, a 7B model does it well:

| `qwen2.5:7b-instruct`, 80 established causes (expectations fixed before the run) | Result |
|---|---|
| Explanations produced (accepted by the guards) | **84 %** |
| Nothing invented (no path, option or file absent from the facts) | **100 %** |
| Mechanism kept | **97 %** |
| Human read of every accepted text: meaning distorted | 4 of 67 (6 %) |
| Median time, after the alert | 15.5 s |

`llama3.2:3b` failed the same test (76 % mechanism kept): the explainer needs the 7B.

**Second job — naming jobs at import.** With the schedule written by code and only the command given to the model, what CronGuard shows (name, role, schedule) was right for 69 of 77 real crontab lines (90 %), and critical jobs were flagged right 96 % of the time. You review the names before anything is created.

**Jobs we tried and dropped**, each measured against expectations fixed beforehand: rewriting the team's fix report (meaning distorted 1 time in 5), asking investigation questions (generic, 19 % pointed at the cause), recalling a similar past fix by embeddings (46 % precision), spotting secrets the rules miss (18 % of clean logs masked by mistake). Pattern: a 7B model is good at rewording or naming a short, trusted input; it fails as soon as it must judge or guess. Details in the [CHANGELOG](CHANGELOG.md).

**The guards are code, not prompt:** an explanation is dropped (the verified cause is shown alone) if it cites an identifier absent from the facts, drops one of the possibilities the cause lists, or runs past three sentences. The verified cause always stays above it, labelled.

**Cost, kept small:**
- **Light install by default** — no model; everything above except the plain-words explanation.
- **AI install:** `ollama pull qwen2.5:7b-instruct-q4_K_M` (~4.7 GB, ~5 GB RAM, CPU is fine) and `LLM_EXPLAIN_MODEL=qwen2.5:7b-instruct-q4_K_M`.
- **Never on the alert path:** the explanation is written after the alert is sent.
- **Once per failure type:** cached 30 days by cause and normalised error line, so a recurring failure never runs the model again.
- **One AI server for the whole company:** point `LLM_BASE_URL` at a shared Ollama box (GPU or not) on your network; every CronGuard install uses it, nothing leaves your infra.

`LLM_DEDUCTION=on` restores the old free-text diagnosis by the model (for comparison; not recommended). Any local OpenAI-compatible server works (vLLM, llama.cpp, LM Studio). Incident memory (`MEMORY_ENABLED`, local `nomic-embed-text`) and per-monitor runbook notes are unchanged.

---

## How it compares

| | **CronGuard** | Healthchecks.io | Cronitor |
|---|---|---|---|
| Missed / late / hung jobs (cron-aware) | ✅ | ✅ | ✅ |
| **Cause and fix from your logs and host** | ✅ host test commands + library, explained by verified local AI | ❌ | ❌ |
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
   ├─ analysis          host facts → command check → known fixes → codes → │
   │                    alerts → verified local AI explanation (cached)    │
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

See [CONTRIBUTING.md](CONTRIBUTING.md) — including the product rule: a feature gets in only if it observes one more fact or shortens the time to a confirmed fix; anything that makes a model judge or guess is measured first. `npm run ci` runs what must pass: types, both test suites (jest and vitest), the production dependency audit, the build and an end-to-end run on a real PostgreSQL and Redis.

## License

[MIT](LICENSE)

Built with Node.js · TypeScript · Express · BullMQ · PostgreSQL · Redis · Ollama
