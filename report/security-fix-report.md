# Lirunex Verification Security Fix Report

## Outcome

`fixed`

All six validated findings in the sealed snapshot report were remediated in the
working tree and their original triggers no longer reproduce.

- Assessment: [security-assessment.md](./security-assessment.md)
- Snapshot: `codex-security-snapshot/v1:sha256:931a734e5489da7b55858529462d96e2aa78590ffe3540e4ba5c5fa1e8ea5e9b`
- Verified image: `sha256:9aaf2ab6c04e9c0b2bef538f5cc72079249d408a8b1fc5f02f9a104fa7941705`

## Security Boundary and Patch Strategy

The protected invariant is that a referral license may be issued only for the exact
broker account whose referrer, live status, currency, and deposit satisfy the trusted
program configuration. The browser service must authenticate callers before processing
or logging account input, bound Chromium work, and keep runtime secrets and broker rows
out of build artifacts and logs.

The narrowest repository-native fix was applied at the two shared enforcement boundaries:

1. The Edge decision helper now compares configured and observed currency, explicitly
   normalizes supported USD/USC units, and fails closed for unsupported units.
2. The bot parser now returns the broker's real status, while the HTTP app authenticates
   before account handling and owns one process-wide browser permit.

The Docker build now copies only manifests and `src`, uses `npm ci`, and pins the
Playwright image and package to the same exact version.

## Closed Findings

| Snapshot finding | Resolution | Proof |
| --- | --- | --- |
| Cent-account deposits bypass the configured currency threshold | Exact currency match plus explicit USD/USC normalization | Currency mismatch, low USC, valid USC, valid USD, and unsupported-currency tests |
| Inactive broker accounts are marked active | Parser reads the real Status column | Inactive fixture remains inactive and downstream gate rejects non-active rows |
| A local `.env` can be baked into the image | `.dockerignore` plus source-only `COPY` | Built image contains neither `/app/.env` nor `/app/tests` |
| Concurrent claims fan out into Chromium processes | One process-wide permit; excess work returns 503 with `Retry-After: 5` | Concurrent real-HTTP test and manual driver |
| Raw broker contact and financial data is logged | Removed raw-row sample logging | Search test proves contact email never reaches logs |
| Unauthenticated input can forge log entries | HMAC check precedes account parsing/logging; accepted accounts are last-four masked | Invalid-HMAC multiline input returns 401, performs no search, and is not logged |

## Files Changed

- `supabase/functions/_shared/lirunex-client.ts`
- `supabase/functions/_shared/lirunex-client.test.ts`
- `supabase/functions/claim-referral/index.ts`
- `supabase/migrations/058_lirunex_verification.sql`
- `lirunex-verify-bot/.dockerignore`
- `lirunex-verify-bot/Dockerfile`
- `lirunex-verify-bot/package.json`
- `lirunex-verify-bot/package-lock.json`
- `lirunex-verify-bot/src/app.js`
- `lirunex-verify-bot/src/server.js`
- `lirunex-verify-bot/src/lirunexSearch.js`
- `lirunex-verify-bot/tests/docker-config.test.js`
- `lirunex-verify-bot/tests/lirunexSearch.parse.test.js`
- `lirunex-verify-bot/tests/server.test.js`

## Ordered Verification

### 1. Syntax, formatting, type, and build

- `deno fmt --check ...`: pass
- `deno lint ...`: pass (the repository's existing ignored `allowJs` warning remains)
- `deno check supabase/functions/claim-referral/index.ts`: pass
- `node --check` over bot source and tests: pass
- `git diff --check` in parent and nested repositories: pass
- `docker build --progress=plain -t lirunex-verify-bot:security-hardening .`: pass
- Image Playwright package: `1.62.1`; bundled Chromium launched successfully as `151.0.7922.34`

The optional TypeScript-7 no-excuse helper could not load against this repository's
lockfile-pinned TypeScript 5.9.3. Equivalent forbidden-pattern inspection returned no
matches, and Deno's native lint and type-check passed.

### 2. Security-trigger reproduction

- `deno test --allow-all supabase/functions/_shared/lirunex-client.test.ts`: 11 passed
- `npm test`: 11 passed
- Manual real-HTTP driver: health 200, bad HMAC 401, valid request 200, simultaneous
  request 503 with `Retry-After: 5`, one search call, and no attacker text in logs
- Built-image assertions: `.env` absent, tests absent, application source present

The original currency, fabricated-status, unbounded-concurrency, secret-copy, raw-row-log,
and unauthenticated-log-injection triggers all fail safely after the patch.

### 3. Legitimate behavior and owning-package checks

- `deno test --allow-all supabase/functions/_shared/`: 196 passed
- `npm audit --omit=dev`: zero vulnerabilities
- `npm ci --dry-run --omit=dev`: pass
- Built container `/health`: 200 with `{"ok":true}`
- Valid USD and USC threshold controls pass; valid HMAC verification still returns the
  expected `found`, `rows`, and `checkedAt` response shape.

## Remaining Uncertainty and Deployment Prerequisites

- No production Lirunex portal, Railway service, customer account, or production Supabase
  database was accessed. The checked fixture remains the evidence for live column order.
- The local Supabase stack was not running (`supabase_db_referral-method-for-lirunex` was
  absent), so migration 058 was reviewed but not applied with `supabase db reset --local`.
  Run the normal local/staging migration gate before production deployment.
- Capacity was verified with concurrent real HTTP requests, not a production-equivalent
  multi-replica load test. The one-search limit is intentionally per process/replica.
