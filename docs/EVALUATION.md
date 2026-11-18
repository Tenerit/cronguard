# How CronGuard's diagnosis is measured

Every number in the README comes from a script in [`eval/`](../eval) that anyone can re-run. The latest outputs sit in `eval/REPORT.md`, `eval/report.json` and `eval/EXPLAIN.md`; every dated trial is kept in [`eval/archive/`](../eval/archive). This page explains the method, gives every result, including the experiments that did not help, and shows how to score CronGuard on your own logs.

## Results at a glance

Measured, not asserted. Criteria are written down before each test; failures are published like successes ([CHANGELOG](../CHANGELOG.md)).

| Test | Result |
|---|---|
| **Field labs: real failures drawn at random** (28 StackExchange questions, seed fixed before reading, replayed in a real Debian cron with the real SDK; truth written from the accepted answer before each run — [lab 1](../eval/archive/FIELD-LAB.md), [2](../eval/archive/FIELD-LAB-2.md), [3](../eval/archive/FIELD-LAB-3.md)) | **Detected 19/28. Right cause 7/27. Wrong cause stated 1/28** — when it states a cause, it is right 7 times out of 8; otherwise it says "not established". Blind spot: jobs that exit 0 while failing (9/28); use `CG_EXPECT` for those. |
| **Real cron failures in a container** (real `crond`, a user with their own `~/.profile`, bash and Python SDKs, 11 failures with a known cause) | **11/11 causes established with the test commands, 3/11 without**; the genuine application bug left as "not established", nothing invented. Scenarios written by us: proof it works on real cron, not a coverage figure. |
| **Held-out StackExchange failures** (public6, 15 cases collected before the changes) | Wrong causes stated as fact: **12/30 without model deduction vs 20/30 with it**, for the same number of right causes. Score 3.9/10 vs 4.2 (not significant). These cases have logs only — no host probes. |
| Failures the known-fix library covers | 9.2/10 on the cases we tuned on, **5.0 on held-out ones**: the library generalises imperfectly, which is why it learns from your team. |

**The number to judge us on is not out yet:** how many of *your* failures CronGuard explains. Run it on your jobs; the weekly report shows what it did not recognise.

## The score out of 10

Each diagnosis is graded by code ([`eval/rubric.ts`](../eval/rubric.ts)), never by hand and never by another model:

| Criterion | Points | Rule |
|---|---|---|
| Mechanism named | 4 | the case's label (a regex describing *why*, not the error text) matches the cause |
| Correct and safe action | 3 | the action matches the expected fix and contains nothing dangerous (disabling TLS checks, `rm -rf /`…; negated advice such as "do not disable" is not counted) |
| Category | 1 | exact category |
| Nothing invented | 1 | no path, flag or identifier absent from the logs (text copied from a reviewed known-fix sheet is not an invention) |
| Evidence | 1 | the decisive log line is among the lines shown |
| Honesty | ±1 | +1 when the cause says it is not established with low confidence; −1 for a wrong cause given with high confidence |

Labels are written from the cause established by the source (accepted answer, maintainer, or the scenario's own note), before the model runs on that set. Guard tests ([`tests/eval-rubric.test.ts`](../tests/eval-rubric.test.ts)) check that copying the error line does not earn the mechanism points and that dangerous actions score zero.

```bash
npx tsx eval/score.ts --set all --runs 3        # tuning sets → eval/REPORT.md
npx tsx eval/score.ts --set final --runs 3      # everything, including the held-out sets
npx tsx eval/score.ts --set all --runs 2 --ab LLM_DEDUCTION=on   # paired A/B: same session, alternating order
npx tsx eval/score.ts --validate                # stamp the last report as reviewed
```

Comparisons are only made **paired, in the same session**: between sessions the same code moved by up to 14 points of category accuracy and doubled its latency.

## The sets

| Set | Cases | Source | Status |
|---|---|---|---|
| lab | 26 | scenarios written for CronGuard | tuning |
| public | 11 | public issues and forum threads, cause established in the thread | read, tuning |
| public2 | 17 | StackExchange, collected after the known-fix library was frozen | read, tuning |
| public3 | 14 | StackExchange, collected later | read, tuning |
| public4 | 17 | StackExchange, with the cron command when the post gives it, collected before the command and context levers | read, tuning |
| public5 | 12 | StackExchange, collected 2026-11-10 after every change | read, tuning |
| public6 | 15 | StackExchange, frozen raw before removing model deduction; labels written before any run | read, tuning |
| public7 | 12 | StackExchange, 40 queries fixed before the sheet-precision work, frozen raw (cc9e6ff), labels before any run | held-out test 2026-11-11: **3.5/10** (3.8 after the evidence-line fix); sheet misfires 5 of 7 covered: the precision work did not generalise |
| cron lab | 11 | real failures under a real `crond` in a container, bash and Python SDKs ([`eval/cron-lab.ts`](../eval/cron-lab.ts)) | functional proof, written by us: 11/11 with the test commands, 3/11 without |

Every public set follows a rule fixed before seeing any result: for a list of pre-written queries, take the **first** StackExchange result that has an error log and an accepted answer; drop a case only when the answer establishes no cause, with the reason written in the file ([`eval/public-cases-*.ts`](../eval)). Once a set's outputs have been read to understand failures, it becomes a tuning set and a new one is collected for the next honest measurement.

## Results (2026-11-08, `llama3.2:3b` on CPU)

| Step | Score /10 |
|---|---|
| Starting point (model plus 25 sheets shown on the side) | 4.4 |
| Known-fix sheets give the cause | 6.7 on the tuning sets; public2 held-out 2.5 → 4.7 |
| public3 held-out, 89 sheets | 3.5 (raw model 2.0) |
| public4 held-out, with command check and context probe | 5.0 (4.6 without) |
| After fixing the measured point losses, 97 sheets, all 85 cases (read) | 7.8: covered 9.2, not covered 3.7 |
| **public5 held-out (2026-11-10), 12 failures collected after every change** | **4.7** (CI 4.4–5.0): covered 4/12 at 8.0, not covered 3.0; raw model 1.9, difference +2.8 (CI +1.7 to +4.0) |

The held-out figures are the honest ones; 7.8 is optimistic because those cases were read while tuning. The gap between 7.8 and 4.7 is mostly coverage: the library recognised 76% of the cases it was tuned on, but 33% of new ones. One public5 case scored 9 with "cause not established" because the quoted error line itself contained the mechanism word (`interactive prompting is disabled`): the rubric gives that point, a reader may not. The execution-context probe cannot be measured on public posts, which never include the cron's environment: it needs real SDK logs.

## 2026-11-10: facts instead of deduction

**Why the model failed** ([`eval/error-analysis.ts`](../eval/error-analysis.ts), 150 free-text answers on uncovered failures): 8 right, all where the log itself states the mechanism; **0 of 78** where it has to be deduced. Three causes were on our side: the error-line filter removed the explaining line in 9 of 12 cases, 29 of 73 wrong causes copied our own "pattern detected" hint, and the prompt asked to "cite the exact log value" as the cause. Two pre-registered attempts to make the 3B reason by choosing among mechanisms failed (+0.4 then −0.4 on uncovered failures).

**Decision:** the model no longer writes causes (`LLM_DEDUCTION=on` restores it). Without a sheet or an observed fact, the answer is "cause not established" plus test commands.

| Measure | Result |
|---|---|
| Cron lab, with vs without the SDK test commands | **11/11 vs 3/11** (bash and Python SDKs; the real application bug stays "not established") |
| public6 held-out, without vs with model deduction | score 3.9 vs 4.2 (diff 0.4, CI −0.1 to +0.8, n.s.); **wrong causes stated as fact 12 vs 20 of 30** |
| Covered failures, tuning vs held-out | 9.2 vs **5.0** on public6: the sheets generalise imperfectly |
| Sheet precision (misfires on read sets) | 15 → 5 after placing decisive signals first and listing alternatives in generic sheets (tuning figure; public7 will judge) |

**AI role: explain an established cause in plain words** ([`eval/explain.ts`](../eval/explain.ts); expectations fixed before each trial):

| Trial | Model and rule | Coverage | Nothing invented | Mechanism kept | Verdict |
|---|---|---|---|---|---|
| 1 | `llama3.2:3b` | — | 98 % | 76 % | fails |
| 2 | `qwen2.5:7b` | — | 99 % | 87 % | fails |
| 3 | 7B, single-mechanism causes only | 35 % | 96 % | 96 % | coverage fails |
| 4 | 7B, all possibilities kept (code guard) | 80 % | 100 % | 93 % | met; review found a splitter bug |
| **4b** | same, splitter fixed | **84 %** | **100 %** | **97 %** | **adopted**; human read: 4 of 67 texts distort the meaning (6 %) |

Median 15.5 s, after the alert, cached per failure type. Grid fix decided before public7: commands built by code (the cron-environment reproduction) are not counted as invented identifiers.

### Speed: known fixes first, the model only when needed (2026-11-10)

When a sheet, the command check, the context probe or a curl/rsync code establishes the cause, CronGuard answers without calling the model. Paired A/B on the tuning sets: score 8.4 → 8.3 (−0.1, CI −0.2 to +0.1, not significant), median latency 12.6 s → 0 s, mean 13.0 s → 2.4 s; 44 of 54 answers no longer need the model. 

### Writing sheets from StackExchange

`node eval/collect-corpus.mjs` gathers the most-voted `cron` questions with an accepted answer (160 on 2026-11-10; test-set URLs excluded) and `npx tsx eval/mine-corpus.ts` groups the failures the library does not recognise by error signature. The real-world tail is long: 112 uncovered failures fell into 101 different signatures. Sheets are written for the recurring families only; corpus coverage is a tuning figure, never a measurement. StackExchange excerpts in `eval/*-raw.json` are CC BY-SA 4.0, attributed by their URL.

### What did not help, measured

- Asking the model for "the why, not the message" in the prompt: mechanism 0% → 0% (`eval/ab-root-cause.ts`).
- Listing cron traps in the system prompt: +0.1, not significant.
- `qwen2.5:7b` instead of `llama3.2:3b`: −0.2 and 1.7× slower.
- A keyword category classifier: 58% vs the model's 50%, on cases already seen, worth about +0.03; dropped.

### Earlier metrics

On the lab set (5 runs): 100% valid structured output, exact category 72% ± 4 (a constant answer scores 15%), invented identifiers 1.5%, about 14 s per analysis on our test machine. Severity is not reliable (57% exact against 46% for always answering `high`): it is informational and never decides whether an alert is sent.

## 2026-11-11: learned grace and shared fixes

- **Learned grace** ([`eval/grace-sim.ts`](../eval/grace-sim.ts), simulation with the real `isLate`/`graceMs`, hourly jobs, 5 min grace): false "late" alerts −98 % to −100 % on jobs longer than their grace, none changed on short jobs; added detection delay for a truly missing run ≤ 1.2 × p95, and since this run capped at the cron interval.
- **Fixes shared across jobs** ([`eval/shared-fix-risk.ts`](../eval/shared-fix-risk.ts)): different failures sharing a signature, 5.4 % of the 112 labelled cases (4/112 after reading them, i.e. genuinely different causes) and 8.1 % of the corpus (upper bound). Above the 5 % expectation in raw terms: the shared fix stays at medium confidence and names its source job.

## Score it on your own logs

```bash
cp eval/real-cases.example.ts eval/real-cases.ts   # paste ~20 real incident logs with their expected labels
npx tsx eval/run.ts --set real --runs 5             # exits non-zero if category accuracy < 75%
```

Only your own failures tell you how CronGuard will do on your systems.
