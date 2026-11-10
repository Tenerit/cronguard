# How CronGuard's diagnosis is measured

Every number in the README comes from a script in [`eval/`](../eval) that anyone can re-run. This page explains the method, gives every result, including the experiments that did not help, and shows how to score CronGuard on your own logs.

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
npx tsx eval/score.ts --set all --runs 2 --ab LLM_CONTEXT=off   # paired A/B: same session, alternating order
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
| public5 | 12 | StackExchange, collected 2026-11-10 after every change | held-out test |

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

### What did not help, measured

- Asking the model for "the why, not the message" in the prompt: mechanism 0% → 0% (`eval/ab-root-cause.ts`).
- Listing cron traps in the system prompt: +0.1, not significant.
- `qwen2.5:7b` instead of `llama3.2:3b`: −0.2 and 1.7× slower.
- A keyword category classifier: 58% vs the model's 50%, on cases already seen, worth about +0.03; dropped.

### Earlier metrics

On the lab set (5 runs): 100% valid structured output, exact category 72% ± 4 (a constant answer scores 15%), invented identifiers 1.5%, about 14 s per analysis on our test machine. Severity is not reliable (57% exact against 46% for always answering `high`): it is informational and never decides whether an alert is sent.

## Score it on your own logs

```bash
cp eval/real-cases.example.ts eval/real-cases.ts   # paste ~20 real incident logs with their expected labels
npx tsx eval/run.ts --set real --runs 5             # exits non-zero if category accuracy < 75%
```

Only your own failures tell you how CronGuard will do on your systems.
