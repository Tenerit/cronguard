#!/usr/bin/env bash
# CI locale : les mêmes contrôles que .github/workflows/ci.yml, sur ta machine, sans GitHub Actions.
#   npm run ci                 # tout
#   CI_SKIP_E2E=1 npm run ci   # sans le test de bout en bout (pas de Docker sous la main)
# Le test de bout en bout a besoin de PostgreSQL et Redis (docker compose up -d postgres redis).
set -uo pipefail
cd "$(dirname "$0")/.."

failed=()
step() {
  local name="$1"; shift
  local t0=$SECONDS
  if "$@" > "/tmp/cronguard-ci-$name.log" 2>&1; then
    printf '  ✓ %-22s %4ss\n' "$name" $((SECONDS - t0))
  else
    printf '  ✗ %-22s %4ss  → /tmp/cronguard-ci-%s.log\n' "$name" $((SECONDS - t0)) "$name"
    tail -15 "/tmp/cronguard-ci-$name.log" | sed 's/^/      /'
    failed+=("$name")
  fi
}

echo "CI locale CronGuard"
step typescript  npx tsc --noEmit
step jest        npm test
step vitest      npx vitest run
step audit-prod  npm audit --omit=dev --audit-level=high
step build       npm run build
if command -v go >/dev/null; then
  step sdk-go bash -c 'cd sdk/go && go vet ./... && go build -o /tmp/cg-go . && CG_TEST_BIN=/tmp/cg-go go test -count=1 ./...'
elif docker image inspect golang:1.23-alpine >/dev/null 2>&1; then
  step sdk-go env MSYS_NO_PATHCONV=1 docker run --rm -v "$PWD/sdk:/src" -w /src/go -e CGO_ENABLED=0 -e GOFLAGS=-buildvcs=false     golang:1.23-alpine sh -c 'test -z "$(gofmt -l .)" && go vet ./... && go build -o /tmp/cg-go . && CG_TEST_BIN=/tmp/cg-go go test -count=1 ./...'
else
  echo "  - sdk-go                 ignoré (ni Go ni l'image golang:1.23-alpine)"
fi
if [[ "${CI_SKIP_E2E:-}" == 1 ]]; then
  echo "  - e2e                    ignoré (CI_SKIP_E2E=1)"
else
  step e2e env NODE_ENV=test npm run -s test:e2e
fi

if ((${#failed[@]})); then
  echo "ÉCHEC : ${failed[*]}"
  exit 1
fi
echo "CI OK"
