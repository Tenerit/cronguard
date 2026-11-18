# Instrumenting your jobs

Everything about connecting jobs to CronGuard: crontab import, systemd timers, the SDKs, what they observe, and the pilot report. Back to the [README](../README.md).

## Import an existing crontab

Creates one monitor per job and prints the crontab with each command wrapped by `cg_run`. Your crontab is never modified: you review and paste the result. With an API key, it also lists each command's risks before they fail.

```bash
sudo cp sdk/bash/cronguard.sh /usr/local/lib/cronguard.sh
CRONGUARD_API_KEY=cg_live_... sdk/bash/cronguard-import.sh            # preview
CRONGUARD_API_KEY=cg_live_... sdk/bash/cronguard-import.sh --apply    # create monitors
```

For `/etc/crontab` or `/etc/cron.d/*` (extra user column), pass the file and `--system`.

If the server has a local explanation model, the preview suggests a readable name and role for each job (`postgres-backup — backs up the clients database with pg_dump — every day at 02:30 ⚑ critical`); the schedule is always written by code. Measured on 77 real crontab lines: right 90 % of the time, which is why you review the preview before `--apply`. `--no-ai` keeps the command name.

## systemd timers

`--systemd` creates one monitor per enabled timer and prints a root script that adds an `ExecStopPost=` drop-in to each service: it reports the result, the exit status and the journal of that run. The service's own command is not changed.

```bash
CRONGUARD_API_KEY=cg_live_... sdk/bash/cronguard-import.sh --systemd --apply > add-cronguard.sh
less add-cronguard.sh && sudo sh add-cronguard.sh
```

Common `OnCalendar=` forms become cron schedules; others use a grace period of 1.5 × the interval. System timers only.

## Bash, Node.js, Python, cURL

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

Plain `curl` only reports success or failure: no logs masked on the host, no facts. On a host without bash or python3, the [static binary](../sdk/go) sends the same facts as the SDKs.

**What the bash and Python SDKs add** (read-only, never a variable value or a file content):
- **What changed since the last success.** Every success leaves a fingerprint on the host (command, PATH, launch dir, variable *names*, size and date of the files the command names, version of known tools). On failure the alert says what changed: `pg_dump version: 15.4 → 16.1`, `variable API_TOKEN missing since the last success`. A fact next to the diagnosis, never presented as the cause.
- **"Succeeded but produced nothing."** Declare what a job must produce; an exit code 0 without it becomes a failure:
  ```bash
  CG_EXPECT="/bak/db-*.dump min=1M" cg_run "your-ping-key" /scripts/backup.sh   # by default the file must be written during this run; age=26h to relax
  ```

Lab (pre-registered, `eval/sdk-lab.ts`): the responsible change shown in 8/8 broken jobs and nothing shown when nothing changed; empty, stale, missing or too small outputs caught 5/5 with 0 false alarm on 22 normal runs.

**Also in the bash and Python SDKs:** `cg_step dump` / `cg_step upload` (the failure says in which step it stopped and how long the previous ones took); a ping the server did not receive is kept and replayed in order; an overlap with the previous run is reported (`CG_SKIP_IF_RUNNING=1` skips the run); memory (OOM from the cgroup), full volume and network (DNS, refused, no answer) are established as facts; secrets are masked on the host before sending. Before the first failure, `cg_doctor "<command>"` checks a command as cron will run it, without running it.

**Static binary (no bash, python3 or curl on the host):** [`sdk/go`](../sdk/go), standard library only, ~6 MB.

```bash
docker run --rm -v "$PWD/sdk/go:/src" -w /src -e CGO_ENABLED=0 golang:1.23-alpine go build -ldflags "-s -w" -o cronguard .
cronguard run your-ping-key -- /scripts/backup.sh      # exit code = the command's; output still printed
cronguard step upload                                   # from inside the job, like cg_step
```

Same state files as the bash and Python SDKs (you can switch without losing the fingerprint or the queued pings), same masking list (checked by a test against Python), and the same facts except the login-shell comparison. It survives the OOM kill of its command, so the kernel's kill is reported as a fact. Lab in a bare Alpine container with `--memory=100m`: OOM kill and full volume established, pings replayed in order, a bash success followed by a Go failure shows only the two real changes. Linux and macOS; not Windows.

**Kubernetes:** [`sdk/kubernetes/cronjob.yaml`](../sdk/kubernetes/cronjob.yaml) runs the bash SDK in a CronJob (image with bash, curl and python3; a small volume keeps the fingerprint and the unsent pings between pods). Checked in a container with the same paths and command, not on a real cluster.

The Node SDK does the same inside `monitor()` (`cgStep('upload')` for steps), with three gaps: no OOM counter (a Node process killed by the kernel takes the SDK with it; the missing ping alerts), no `CG_SKIP_IF_RUNNING` and no `doctor`, and `CG_EXPECT` wildcards only in the file name.

## Pilot report

At the end of a trial, measure it on your own server; nothing is sent anywhere:

```bash
docker compose exec api node dist/services/pilot-report.js --days 30 > pilot.md
```

Failures, share whose cause was established and by which source (observed on the host, team fix, exit code, generic library, not established), 👍/👎 from the team, fixes observed and confirmed, time to restore. Anonymised by default; `--names` and `--signatures` add job names and the unrecognised error lines (review before sharing).
