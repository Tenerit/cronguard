# Local AI (optional)

What the local model does, what it does not, and how it was measured. Back to the [README](../README.md).

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

**Jobs we tried and dropped**, each measured against expectations fixed beforehand: rewriting the team's fix report (meaning distorted 1 time in 5), asking investigation questions (generic, 19 % pointed at the cause), recalling a similar past fix by embeddings (46 % precision), spotting secrets the rules miss (18 % of clean logs masked by mistake). Pattern: a 7B model is good at rewording or naming a short, trusted input; it fails as soon as it must judge or guess. Details in the [CHANGELOG](../CHANGELOG.md).

**The guards are code, not prompt:** an explanation is dropped (the verified cause is shown alone) if it cites an identifier absent from the facts, drops one of the possibilities the cause lists, or runs past three sentences. The verified cause always stays above it, labelled.

**Cost, kept small:**
- **Light install by default** — no model; everything above except the plain-words explanation.
- **AI install:** `ollama pull qwen2.5:7b-instruct-q4_K_M` (~4.7 GB, ~5 GB RAM, CPU is fine) and `LLM_EXPLAIN_MODEL=qwen2.5:7b-instruct-q4_K_M`.
- **Never on the alert path:** the explanation is written after the alert is sent.
- **Once per failure type:** cached 30 days by cause and normalised error line, so a recurring failure never runs the model again.
- **One AI server for the whole company:** point `LLM_BASE_URL` at a shared Ollama box (GPU or not) on your network; every CronGuard install uses it, nothing leaves your infra.

`LLM_DEDUCTION=on` restores the old free-text diagnosis by the model (for comparison; not recommended). Any local OpenAI-compatible server works (vLLM, llama.cpp, LM Studio). Incident memory (`MEMORY_ENABLED`, local `nomic-embed-text`) and per-monitor runbook notes are unchanged.
