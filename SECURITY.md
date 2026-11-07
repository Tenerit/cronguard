# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's **"Report a vulnerability"** button
(Security tab of this repository). Do not open a public issue.

Include the affected version or commit, the steps to reproduce, and the impact you observed.
You should get a first answer within 7 days.

## Supported versions

Only the latest release on `master` receives security fixes.

## Design choices that matter for security

- **No data egress by default.** Analysis runs on a local model (Ollama). A cloud LLM is opt-in
  (`LLM_BASE_URL`), and logs are stripped of secrets before they reach any model.
- **Outgoing webhooks are SSRF-guarded.** Loopback, link-local and cloud metadata addresses are
  always blocked; private ranges can be blocked too with `WEBHOOK_BLOCK_PRIVATE=true`.
- **API keys are only accepted in the `X-API-Key` header**, never in the URL.
- **API keys are stored as SHA-256 digests only.** A database dump or backup gives access to no
  account. A key is shown once, when it is created; account recovery issues a new key.
- **`/metrics` is closed by default** (set `METRICS_TOKEN`, or `METRICS_PUBLIC=true` on a trusted network).

## Known limitations

- The dashboard's Content Security Policy allows inline scripts (`'unsafe-inline'`) because the
  page uses inline event handlers. Every value inserted into the page is escaped, and a test
  (`tests/dashboard-xss.test.ts`) guards the patterns that led to past issues.
