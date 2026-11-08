# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's **"Report a vulnerability"** button
(Security tab of this repository). Do not open a public issue.

Include the affected version or commit, the steps to reproduce, and the impact you observed.
You should get a first answer within 7 days.

## Supported versions

Only the latest release on `master` receives security fixes.

## Design choices that matter for security

- **No data egress.** Analysis runs on a local model (Ollama or another local server).
- **Secrets are redacted on arrival.** Job output and the cron command are cleaned by the `/ping`
  route (passwords, tokens, API keys, JWTs, credentials in URLs, `mysql -p…`, `sshpass -p`) before
  they are queued, stored, analysed or sent in an alert. Output stored by earlier versions is
  cleaned once by migration v21. Redaction is pattern-based: an unusual secret format can slip
  through, so keep secrets out of job output where you can.
- **Outgoing webhooks are SSRF-guarded.** Loopback, link-local and cloud metadata addresses are
  always blocked; private ranges can be blocked too with `WEBHOOK_BLOCK_PRIVATE=true`.
- **API keys are only accepted in the `X-API-Key` header**, never in the URL.
- **API keys are stored as SHA-256 digests only.** A database dump or backup gives access to no
  account. A key is shown once, when it is created; account recovery issues a new key.
- **`/metrics` is closed by default** (set `METRICS_TOKEN`, or `METRICS_PUBLIC=true` on a trusted network).
- **Strict script policy.** The dashboard and status page run no inline event handlers; their
  `<script>` blocks are allowed by SHA-256 hash only (`script-src` has no `'unsafe-inline'`), so
  injected markup cannot run script. Every inserted value is also escaped, and tests guard both.

## Known limitations

- `style-src` still allows inline styles (`'unsafe-inline'`): the dashboard sets many `style`
  attributes. Injected CSS cannot run script, but could restyle the page.
- `npm audit` reports 20 low/moderate advisories, all inside the jest test toolchain (glob, minimatch, deepmerge via jest 30). They are dev dependencies: not in the Docker images and not run in production. npm's suggested fix is a downgrade to jest 25, so they stay until jest ships patched versions. Production dependencies report 0 vulnerabilities (`npm audit --omit=dev`).
