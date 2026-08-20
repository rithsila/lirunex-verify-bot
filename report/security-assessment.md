# Security Review: rithsila/SafetyScore Lirunex verification snapshot

## Scope

Security diff review of the parent working-tree implementation plus every tracked file at the nested Lirunex bot revision 01db18e3430271cf71347271600684fd6e447f0b.

- Scan mode: working_tree
- Target kind: git_worktree
- Target ID: target_sha256_902b55b1303973ae0a5e0f1c39b8dbeb771b19ec676201cad73481447477a83a
- Revision: 84446aa14057161a8a02fab3ab3947a3a19c4ede
- Snapshot digest: codex-security-snapshot/v1:sha256:931a734e5489da7b55858529462d96e2aa78590ffe3540e4ba5c5fa1e8ea5e9b
- Inventory strategy: diff
- Included paths: .codex/config.toml, AGENTS.md, deno.lock, supabase/functions/_shared/lirunex-client.test.ts, supabase/functions/_shared/lirunex-client.ts, supabase/functions/claim-referral/index.ts, supabase/migrations/058_lirunex_verification.sql, lirunex-verify-bot/
- Excluded paths: lirunex-verify-bot/.env, lirunex-verify-bot/.git/, lirunex-verify-bot/node_modules/
- Runtime or test status: Baseline targeted suites passed: 7 Deno tests and 5 Node tests. Focused status and currency probes reproduced the vulnerable behavior.
- Artifacts reviewed: 25-file deterministic inventory, parent Git patch against 84446aa14057161a8a02fab3ab3947a3a19c4ede, nested bot revision 01db18e3430271cf71347271600684fd6e447f0b, Deno decision tests, Node parser and HMAC tests, deployment and migration configuration
- Scan context: The supplied AGENTS.md was used unchanged as the authoritative repository threat model body.

Limitations and exclusions:
- No live Lirunex portal, production Supabase database, Railway service, image registry, or production-equivalent load test was used.
- The real .env file contents were intentionally not read; only existence, size, and mode metadata were inspected.
- TAC advisory status could not be captured, so protected hosted output visibility was not verified.
- Excluded lirunex-verify-bot/.env contents: Secret values were intentionally not accessed; only file existence, size, and mode metadata were inspected.
- Excluded lirunex-verify-bot/node_modules/\*\*: Vendored install output was excluded; package.json and the integrity-pinned lockfile were reviewed instead.
- Excluded live production services and data: No production Lirunex portal, Supabase database, Railway runtime, registry, or real customer data was accessed.

### Scan Summary

| Field | Value |
| --- | --- |
| Reportable findings | 6 |
| Severity mix | medium: 4, low: 2 |
| Confidence mix | high: 6 |
| Coverage | complete |
| Validation mode | Targeted runtime probes where feasible, with complete static source-control-sink tracing for deployment and resource findings. |

Canonical artifacts: `scan-manifest.json`, `findings.json`, and `coverage.json`. This report is a deterministic projection of those files.

## Threat Model

EA Safety Score issues commercial and referral licenses through privileged Supabase paths. The Lirunex flow adds a public authenticated claim boundary, a signed Edge-to-bot boundary, a browser-to-broker boundary, and deployment/logging boundaries.

### Assets

- Referral-license issuance integrity and one-account binding
- Supabase service-role write authority
- Lirunex portal credentials, HMAC secret, and encrypted browser session key
- Broker customer contact and financial data
- Verification-service availability

### Trust Boundaries

- Authenticated user to claim-referral Edge Function
- Supabase Edge Function to public Lirunex bot over HMAC-authenticated HTTPS
- Lirunex bot browser to the external partner portal
- Local source/build context to deployable container image
- Broker portal data to service logs

### Attacker Capabilities

- An authenticated user can choose program and MT5 account identifiers and issue concurrent claims.
- An unauthenticated remote actor can send JSON to the public bot but cannot forge HMAC without the shared secret.
- Broker-controlled DOM content can influence parsed account rows.
- An image, container, or log reader may gain access after a separate deployment-platform boundary is crossed.

### Security Objectives

- Issue a referral license only for the exact qualifying account, referrer, status, currency, and deposit.
- Keep service-role writes behind authenticated and fail-closed broker verification.
- Keep broker credentials and cryptographic secrets out of images and logs.
- Bound expensive browser work across all callers.
- Minimize broker customer data copied into operational logs.

### Assumptions

- The Lirunex partner table and checked-in fixture reflect the live column order, including Currency and Status.
- The HMAC secret is shared only by the Edge Function and bot.
- Referral programs and their gate configuration are controlled by trusted operators.
- Production communication uses HTTPS as documented.

## Findings

| Finding | Severity | Confidence | Detailed write-up |
| --- | --- | --- | --- |
| [Cent-account deposits bypass the configured currency threshold](#finding-1) | medium | high | inline below |
| [Inactive broker accounts are marked active before license eligibility](#finding-2) | medium | high | inline below |
| [A local secret-bearing .env can be baked into the production image](#finding-3) | medium | high | inline below |
| [Concurrent claims can fan out into unbounded Chromium processes](#finding-4) | medium | high | inline below |
| [Raw broker contact and financial data is written to service logs](#finding-5) | low | high | inline below |
| [Unauthenticated account input can forge service log entries](#finding-6) | low | high | inline below |

### Confidence Scale

| Label | Meaning |
| --- | --- |
| high | Direct evidence supports the finding with no material unresolved blocker. |
| medium | Evidence supports a plausible issue, but material runtime or reachability proof remains. |
| low | Evidence is incomplete and the item is retained only for explicit follow-up. |

<a id="finding-1"></a>

### [1] Cent-account deposits bypass the configured currency threshold

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | A targeted Deno probe accepted USC 200.00 against a USD 10000-cent threshold, and the checked fixture uses USC while the migration requires currency normalization. |
| Category | Authorization bypass / monetary unit confusion |
| CWE | CWE-20 |
| Affected lines | supabase/functions/_shared/lirunex-client.ts:63-67, supabase/functions/claim-referral/index.ts:475-483, lirunex-verify-bot/tests/fixtures/trading-accounts-1row.html:30-31, supabase/functions/claim-referral/index.ts:686-706, supabase/migrations/058_lirunex_verification.sql:19-21 |

#### Summary

The Edge gate receives both expected and observed currency but ignores them, multiplying USC values as if they were USD and allowing deposits below the intended threshold to qualify.

#### Root Cause

The monetary invariant requires a broker deposit to be normalized into the same minor unit as minDepositCents. The implementation applies a universal times-100 conversion and ignores both currency fields.

**Currency-free deposit comparison** — `supabase/functions/_shared/lirunex-client.ts:63-67`

The comparison does not read match.currency or gate.depositCurrency.

```typescript
  if (gate.minDepositCents !== null) {
    const cents = depositToCents(match.depositRaw);
    if (cents === null) return { valid: false, reason: "deposit_unparseable" };
    if (cents < gate.minDepositCents) return { valid: false, reason: "deposit_too_low" };
  }
```

#### Validation

Validation outcomes are recorded below.

Validation method: Targeted Deno decision probe plus fixture and migration trace

- **Disposition:** reportable

**Currency-free deposit comparison** — `supabase/functions/_shared/lirunex-client.ts:63-67`

The comparison does not read match.currency or gate.depositCurrency.

```typescript
  if (gate.minDepositCents !== null) {
    const cents = depositToCents(match.depositRaw);
    if (cents === null) return { valid: false, reason: "deposit_unparseable" };
    if (cents < gate.minDepositCents) return { valid: false, reason: "deposit_too_low" };
  }
```

Assertions:
- Configured currency reaches the gate.
- Observed currency reaches the row.
- Neither affects the comparison.
- The USC/USD mismatch returns valid.

Evidence:
- USC 200.00 returned valid against a USD 10000-cent minimum.

Limitations:
- No funded production account was queried.

#### Dataflow

A monetary unit crosses the authorization boundary without normalization.

Attack steps:
- Submit an exact USC account under the expected referrer.
- The bot returns currency USC and depositRaw.
- The gate ignores currency and multiplies the raw value by 100.
- The comparison passes and the service-role flow inserts a license.

- **Source:** Broker Currency and Deposit cells

- **Sink:** Service-role license creation

- **Outcome:** Below-threshold account receives a referral entitlement

Transformations:
- DOM row projection
- depositToCents universal USD conversion
- minimum comparison without currency check

**Currency-free deposit comparison** — `supabase/functions/_shared/lirunex-client.ts:63-67`

The comparison does not read match.currency or gate.depositCurrency.

```typescript
  if (gate.minDepositCents !== null) {
    const cents = depositToCents(match.depositRaw);
    if (cents === null) return { valid: false, reason: "deposit_unparseable" };
    if (cents < gate.minDepositCents) return { valid: false, reason: "deposit_too_low" };
  }
```

#### Reachability

No secret compromise is required.

- **Attacker:** Remote authenticated SafetyScore user

- **Entry point:** claim-referral Edge Function

- **Outcome:** One-year license bound to the selected account

Preconditions:
- Exact qualifying Lirunex account
- Currency differs from the configured threshold units

Existing controls:
- Authentication and rate limiting
- Exact account and referrer match
- Active-status check
- Immediate account binding

Blind spots:
- Live Lirunex USC display semantics

**Currency-free deposit comparison** — `supabase/functions/_shared/lirunex-client.ts:63-67`

The comparison does not read match.currency or gate.depositCurrency.

```typescript
  if (gate.minDepositCents !== null) {
    const cents = depositToCents(match.depositRaw);
    if (cents === null) return { valid: false, reason: "deposit_unparseable" };
    if (cents < gate.minDepositCents) return { valid: false, reason: "deposit_too_low" };
  }
```

#### Severity

**Medium** — A remote authenticated user with a genuine low-funded cent account under the referral can obtain a paid entitlement without secret compromise. The license remains bound to the selected account.

Severity would rise if the bypass can be repeated at scale or keys are transferable; it would fall if live portal semantics prove USC values already represent USD amounts.

Impact assessment:
- **Level:** medium
- **Rationale:** The configured commercial eligibility threshold is bypassed.

Likelihood assessment:
- **Level:** high
- **Rationale:** The checked fixture demonstrates the cent-account currency and the path is a normal authenticated claim.

#### Remediation

Require the observed currency to match the configured currency and normalize supported units explicitly: USD values to cents and USC values as already-denominated US cents; reject missing or unsupported currencies.

Tests:
- Reject a USC row when the gate expects USD.
- Normalize USC 200.00 to 200 USD cents and reject a 10000-cent minimum.
- Accept USD 200.00 for a 10000-cent minimum.
- Reject unsupported or missing currency when a deposit gate is enabled.

Preventive controls:
- Use currency-aware monetary value types.
- Constrain configured deposit currencies to supported values.

<a id="finding-2"></a>

### [2] Inactive broker accounts are marked active before license eligibility

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | A targeted runtime probe converted an Inactive status cell to Active, and the checked fixture proves a real Status column exists. |
| Category | Authorization bypass / business eligibility |
| CWE | CWE-20, CWE-807 |
| Affected lines | lirunex-verify-bot/src/lirunexSearch.js:37, lirunex-verify-bot/tests/fixtures/trading-accounts-1row.html:37, supabase/functions/_shared/lirunex-client.ts:59-61, supabase/functions/claim-referral/index.ts:686-706 |

#### Summary

The scraper discards the real Status column and writes Active for every row, so an inactive account can satisfy the downstream active-account gate and receive a one-year referral license.

#### Root Cause

The eligibility invariant requires the status used by decideValidity to come from the same broker row as the account. rowsFromCells instead manufactures Active and makes the later status check circular.

**Fabricated status** — `lirunex-verify-bot/src/lirunexSearch.js:37`

Every parsed row receives Active regardless of the broker-provided status cell.

```javascript
        status: 'Active',
```

#### Validation

Validation outcomes are recorded below.

Validation method: Targeted Node runtime probe plus downstream static trace

- **Disposition:** reportable

**Fabricated status** — `lirunex-verify-bot/src/lirunexSearch.js:37`

Every parsed row receives Active regardless of the broker-provided status cell.

```javascript
        status: 'Active',
```

Assertions:
- The fixture contains an explicit Status column.
- An Inactive input row is returned as Active.
- The downstream gate accepts Active and reaches privileged license creation.

Evidence:
- The runtime probe returned a row whose status was Active after the input status cell was Inactive.

Limitations:
- No production inactive account was queried.

#### Dataflow

Broker status is replaced before the authorization decision.

Attack steps:
- Submit the exact inactive MT5 account to the authenticated claim route.
- The signed bot lookup returns the matching portal row.
- The scraper replaces its real status with Active.
- The Edge decision accepts the row and inserts an active bound referral license.

- **Source:** Broker Status cell selected by an authenticated account claim

- **Sink:** Service-role licenses insert

- **Outcome:** Ineligible inactive account receives a referral entitlement

Transformations:
- DOM row to cell array
- rowsFromCells overwrites status
- decideValidity trusts overwritten status

**Fabricated status** — `lirunex-verify-bot/src/lirunexSearch.js:37`

Every parsed row receives Active regardless of the broker-provided status cell.

```javascript
        status: 'Active',
```

#### Reachability

The path needs no broker or service secret and crosses from user input to privileged license issuance.

- **Attacker:** Remote authenticated SafetyScore user

- **Entry point:** claim-referral Edge Function

- **Outcome:** One-year license bound to the submitted account

Preconditions:
- Active Lirunex referral program
- Inactive account remains visible
- Exact account, referrer, and deposit checks otherwise pass

Existing controls:
- Supabase authentication
- Rate limiting
- Exact account and referrer matching
- Immediate account binding

Blind spots:
- Production retention behavior for inactive rows

**Fabricated status** — `lirunex-verify-bot/src/lirunexSearch.js:37`

Every parsed row receives Active regardless of the broker-provided status cell.

```javascript
        status: 'Active',
```

#### Severity

**Medium** — A remote authenticated user can cross the commercial entitlement boundary without secrets if an inactive account remains visible and meets the other checks. The impact is limited to a referral license bound to that exact account.

Severity would increase if inactive accounts are commonly retained and the resulting keys can be monetized across additional accounts; it would decrease if the production portal proves inactive rows can never appear.

Impact assessment:
- **Level:** medium
- **Rationale:** Commercial entitlement integrity is bypassed for one exact account.

Likelihood assessment:
- **Level:** high
- **Rationale:** Once an inactive row is visible, exploitation is a normal authenticated claim.

#### Remediation

Parse the actual Status column and fail closed when it is missing or not Active.

Tests:
- Parse an Inactive fixture row and assert status remains Inactive.
- Pass the parsed row to decideValidity and assert rejection.

Preventive controls:
- Bind column indexes to explicit table headers or schema tests.
- Never synthesize security-decision fields.

<a id="finding-3"></a>

### [3] A local secret-bearing .env can be baked into the production image

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | The source-to-image path is direct: a non-empty ignored .env exists, the runtime loads it, no Docker exclusion exists, and the Dockerfile copies the complete context. |
| Category | Secret exposure in container image |
| CWE | CWE-200, CWE-538 |
| Affected lines | lirunex-verify-bot/Dockerfile:5, lirunex-verify-bot/.env.example:3-10, lirunex-verify-bot/.gitignore:1-3, lirunex-verify-bot/railway.json:3-5, lirunex-verify-bot/src/config.js:5-23 |

#### Summary

The service uses a project-local .env, but no .dockerignore exists and COPY . . stores the whole build context in the final image and its layers.

#### Root Cause

The build assumes .gitignore constrains Docker, but Docker sends its own context. The final broad copy crosses secrets from local runtime configuration into an image artifact.

**Whole-context copy** — `lirunex-verify-bot/Dockerfile:5`

Without a Docker-specific exclusion, the normal local .env is copied into /app.

```dockerfile
COPY . .
```

#### Validation

Validation outcomes are recorded below.

Validation method: Static build-context trace plus metadata-only file checks

- **Disposition:** reportable

**Whole-context copy** — `lirunex-verify-bot/Dockerfile:5`

Without a Docker-specific exclusion, the normal local .env is copied into /app.

```dockerfile
COPY . .
```

Assertions:
- The service expects a project-local .env.
- The file contains secret categories defined by .env.example.
- A non-empty ignored .env exists.
- No .dockerignore exists.
- The final stage copies the full context.

Evidence:
- The .env exists with size 349 bytes and mode 0644; its contents were not read.

Limitations:
- Registry visibility and Railway local-source upload behavior are not recorded.

#### Dataflow

A local secret file becomes a deployable artifact.

Attack steps:
- Create .env with portal, HMAC, and session secrets.
- Build the Dockerfile from that local directory.
- COPY . . stores .env in the final image.
- Publish, share, cache, or inspect the image.
- Use recovered credentials against the broker portal or bot.

- **Source:** Project-local .env

- **Sink:** Final image and layers

- **Outcome:** Broker and bot credential disclosure

Transformations:
- Docker build context
- COPY into /app

**Whole-context copy** — `lirunex-verify-bot/Dockerfile:5`

Without a Docker-specific exclusion, the normal local .env is copied into /app.

```dockerfile
COPY . .
```

#### Reachability

The exact reader population is deployment-dependent, but the cross-boundary copy is definite.

- **Attacker:** Image, layer, or container filesystem reader

- **Entry point:** Local-context Docker build

- **Outcome:** Portal login, HMAC secret, and session key can be recovered

Preconditions:
- Configured checkout contains .env
- Image or layer becomes readable

Existing controls:
- .env is Git-ignored
- Railway Git builds normally omit ignored local files

Blind spots:
- Registry access policy
- Production build source

**Whole-context copy** — `lirunex-verify-bot/Dockerfile:5`

Without a Docker-specific exclusion, the normal local .env is copied into /app.

```dockerfile
COPY . .
```

#### Severity

**Medium** — If a configured local checkout is built and its image or layers are shared, readers can recover broker credentials, the HMAC secret, and the session key. Git-clone-only builds reduce likelihood but do not protect local-context builds.

Public or broadly shared registry evidence would raise severity; proof that all production builds are clean Git checkouts with no local context would lower it.

Impact assessment:
- **Level:** high
- **Rationale:** The copied file holds credentials and cryptographic secrets for separate protected systems.

Likelihood assessment:
- **Level:** unknown
- **Rationale:** A local-context build and later artifact access are plausible but not proven as the production path.

#### Remediation

Add a strict .dockerignore and replace COPY . . with allowlisted source copies so .env, .git, data, tests, and node_modules cannot enter the final image.

Tests:
- Build a context containing a sentinel .env and assert it is absent from the image.
- Inspect the final image file list for only required runtime files.

Preventive controls:
- Use runtime secret injection.
- Scan built images for secret filenames before publishing.

<a id="finding-4"></a>

### [4] Concurrent claims can fan out into unbounded Chromium processes

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | The full call chain and absence of a global guard are direct source facts; only the exact failure threshold remains unmeasured. |
| Category | Uncontrolled resource consumption |
| CWE | CWE-400, CWE-770 |
| Affected lines | lirunex-verify-bot/src/server.js:14-29, supabase/functions/claim-referral/index.ts:274-281, supabase/functions/_shared/lirunex-client.ts:94-98, lirunex-verify-bot/src/browser.js:4-21, lirunex-verify-bot/src/lirunexSearch.js:57-94 |

#### Summary

Every HMAC-valid verification starts a separate Chromium process with no service-wide permit limit, while the documented deployment has only 1 GB RAM and upstream limits do not bound global concurrency.

#### Root Cause

The service protects request authenticity but not resource admission. Express can execute all accepted handlers concurrently and each handler launches a new Chromium process.

**Immediate browser-backed search** — `lirunex-verify-bot/src/server.js:25-27`

Every accepted request enters the expensive search immediately; no global permit is acquired first.

```javascript
  try {
    console.log('[POST /verify] Searching account:', account);
    const rows = await searchAccount(cfg, account);
```

#### Validation

Validation outcomes are recorded below.

Validation method: Complete static source-control-sink trace with deployment sizing evidence

- **Disposition:** reportable

**Immediate browser-backed search** — `lirunex-verify-bot/src/server.js:25-27`

Every accepted request enters the expensive search immediately; no global permit is acquired first.

```javascript
  try {
    console.log('[POST /verify] Searching account:', account);
    const rows = await searchAccount(cfg, account);
```

Assertions:
- Authenticated user requests reach the bot.
- Permitted requests can overlap.
- Each request launches Chromium.
- No global cap or queue exists.
- The documented deployment has 1 GB RAM and 1-2 vCPUs.

Evidence:
- The route immediately calls searchAccount, whose first successful path launches a browser and includes at least 12.5 seconds of fixed waits.

Limitations:
- No live OOM or production-equivalent load test was run.

#### Dataflow

Authentication does not provide global resource admission.

Attack steps:
- Send concurrent authenticated claims for an active Lirunex program.
- Upstream rate checks permit the initial burst and sign each bot request.
- Express runs the handlers concurrently.
- Each handler launches and retains Chromium during portal waits.
- CPU or memory pressure stalls or restarts verification.

- **Source:** Concurrent authenticated claim requests

- **Sink:** chromium.launch per request

- **Outcome:** Verification-service outage or restart

Transformations:
- Upstream per-user/IP rate check
- HMAC signing
- Concurrent Express handlers

**Immediate browser-backed search** — `lirunex-verify-bot/src/server.js:25-27`

Every accepted request enters the expensive search immediately; no global permit is acquired first.

```javascript
  try {
    console.log('[POST /verify] Searching account:', account);
    const rows = await searchAccount(cfg, account);
```

#### Reachability

HMAC prevents direct anonymous browser launches but upstream callers can still amplify globally.

- **Attacker:** Remote authenticated SafetyScore users

- **Entry point:** claim-referral Edge Function

- **Outcome:** Referral verification becomes unavailable

Preconditions:
- Active Lirunex program
- Concurrent requests, potentially from multiple users or IPs

Existing controls:
- HMAC request authentication
- Ten requests per minute per IP/user upstream
- Browser cleanup in finally
- Navigation timeouts

Blind spots:
- Production CPU and memory limits
- Exact concurrent-browser failure threshold

**Immediate browser-backed search** — `lirunex-verify-bot/src/server.js:25-27`

Every accepted request enters the expensive search immediately; no global permit is acquired first.

```javascript
  try {
    console.log('[POST /verify] Searching account:', account);
    const rows = await searchAccount(cfg, account);
```

#### Severity

**Medium** — Remote authenticated users can cause many expensive browsers to overlap and disrupt referral verification. HMAC and per-user/IP rate limits reduce reachability but do not cap concurrent work across callers.

A production-equivalent load test showing graceful handling would lower severity; an observed OOM, restart loop, or portal lockout at ten concurrent requests would strengthen it.

Impact assessment:
- **Level:** medium
- **Rationale:** Availability of the only Lirunex verification path can be disrupted.

Likelihood assessment:
- **Level:** high
- **Rationale:** A permitted authenticated burst creates the fan-out without another vulnerability.

#### Remediation

Add a process-wide admission gate that permits only a small bounded number of browser searches and returns a retryable 503 when all permits are occupied.

Tests:
- Acquire the single permit and assert a concurrent acquisition is rejected.
- Release the permit and assert the next acquisition succeeds.
- Exercise POST /verify and assert busy responses do not invoke searchAccount.

Preventive controls:
- Track active browser count and rejected busy requests.
- Use a production load test sized to the deployment memory limit.

<a id="finding-5"></a>

### [5] Raw broker contact and financial data is written to service logs

| Field | Value |
| --- | --- |
| Severity | low |
| Confidence | high |
| Confidence rationale | The logger receives the entire cell array, and the fixture explicitly maps those cells to contact and financial data. |
| Category | Sensitive data in logs |
| CWE | CWE-532 |
| Affected lines | lirunex-verify-bot/src/lirunexSearch.js:150-152, lirunex-verify-bot/src/lirunexSearch.js:146-148, lirunex-verify-bot/tests/fixtures/trading-accounts-1row.html:23-37 |

#### Summary

A successful search serializes the first full portal row before projection, including client contact and financial columns not needed by the verification response.

#### Root Cause

Debug logging occurs before data minimization, crossing broker-only client and financial fields into a separate retained log system.

**Full row log** — `lirunex-verify-bot/src/lirunexSearch.js:150-152`

The raw cell array is logged before it is reduced to the fields needed for eligibility.

```javascript
  if (rowsCells.length > 0) {
    console.log('[search] First row sample:', JSON.stringify(rowsCells[0]));
  }
```

#### Validation

Validation outcomes are recorded below.

Validation method: Mocked search sink probe plus fixture trace

- **Disposition:** reportable

**Full row log** — `lirunex-verify-bot/src/lirunexSearch.js:150-152`

The raw cell array is logged before it is reduced to the fields needed for eligibility.

```javascript
  if (rowsCells.length > 0) {
    console.log('[search] First row sample:', JSON.stringify(rowsCells[0]));
  }
```

Assertions:
- The raw row contains contact and financial fields.
- The complete row reaches console.log.
- The response projection does not need those fields.

Evidence:
- The full fixture-style cell array was passed to the logging sink.

Limitations:
- Production log retention and reader permissions are unknown.

#### Dataflow

Logging happens before field minimization.

Attack steps:
- Trigger a successful signed account lookup.
- Receive a portal row containing client and financial fields.
- Serialize the complete row to service logs.
- Read or export the retained logs.

- **Source:** Broker portal table row

- **Sink:** Railway or PM2 logs

- **Outcome:** Contact and financial data copied into a wider system

Transformations:
- DOM cells
- JSON serialization

**Full row log** — `lirunex-verify-bot/src/lirunexSearch.js:150-152`

The raw cell array is logged before it is reduced to the fields needed for eligibility.

```javascript
  if (rowsCells.length > 0) {
    console.log('[search] First row sample:', JSON.stringify(rowsCells[0]));
  }
```

#### Reachability

Public users can trigger the copy but cannot read logs from repository evidence.

- **Attacker:** Operator, log reader, or logging-platform attacker

- **Entry point:** Successful account verification

- **Outcome:** Exposure of broker customer and financial data

Preconditions:
- A matching row exists
- Actor can read retained logs

Existing controls:
- HMAC protects the bot request
- Only the first row is logged

Blind spots:
- Log retention and exports
- Log-reader population

**Full row log** — `lirunex-verify-bot/src/lirunexSearch.js:150-152`

The raw cell array is logged before it is reduced to the fields needed for eligibility.

```javascript
  if (rowsCells.length > 0) {
    console.log('[search] First row sample:', JSON.stringify(rowsCells[0]));
  }
```

#### Severity

**Low** — The data exposure is definite but requires operator or logging-platform read access; public callers do not receive the log.

Broad log-reader access, long retention, or external exports would increase severity; strict short-lived operator-only logs would reduce it.

Impact assessment:
- **Level:** low
- **Rationale:** The exposed data is sensitive but the reader boundary is privileged or unknown.

Likelihood assessment:
- **Level:** medium
- **Rationale:** Successful lookups are normal, while unauthorized log access is not established.

#### Remediation

Remove the raw row sample log and retain only non-sensitive operational counts or masked identifiers.

Tests:
- Exercise a successful search with a fixture containing contact data and assert logs do not contain any cell value.

Preventive controls:
- Project broker rows before logging.
- Use structured logging with a field allowlist.

<a id="finding-6"></a>

### [6] Unauthenticated account input can forge service log entries

| Field | Value |
| --- | --- |
| Severity | low |
| Confidence | high |
| Confidence rationale | Source order is direct and a bounded console probe showed a newline creates a forged second line. |
| Category | Log injection |
| CWE | CWE-117 |
| Affected lines | lirunex-verify-bot/src/server.js:14-20, lirunex-verify-bot/PROXMOX_LXC_GUIDE.md:94-127 |

#### Summary

The public bot logs req.body.account before HMAC and format validation, so multiline JSON input can create forged log lines and repeatable log-processing amplification.

#### Root Cause

Authentication and boundary parsing are ordered after a text log sink, so the logger consumes untrusted control characters.

**Log before authentication** — `lirunex-verify-bot/src/server.js:14-18`

Attacker text reaches console.log before the HMAC check.

```javascript
app.post('/verify', async (req, res) => {
  console.log('[POST /verify] Incoming request from:', req.ip, 'account:', req.body?.account);
  const sig = req.header('X-Signature') || '';
  if (!verify(req.rawBody || '', sig, cfg.hmacSecret)) {
    console.warn('[POST /verify] Bad signature rejected');
```

#### Validation

Validation outcomes are recorded below.

Validation method: Static route-order trace plus bounded Node console probe

- **Disposition:** reportable

**Log before authentication** — `lirunex-verify-bot/src/server.js:14-18`

Attacker text reaches console.log before the HMAC check.

```javascript
app.post('/verify', async (req, res) => {
  console.log('[POST /verify] Incoming request from:', req.ip, 'account:', req.body?.account);
  const sig = req.header('X-Signature') || '';
  if (!verify(req.rawBody || '', sig, cfg.hmacSecret)) {
    console.warn('[POST /verify] Bad signature rejected');
```

Assertions:
- The endpoint is public.
- JSON is parsed before HMAC.
- The account value is logged before HMAC.
- A newline creates a second apparent log entry.

Evidence:
- A sample account containing a newline produced a forged second console line.

Limitations:
- The deployed logging transport may add escaping not visible in console output.

#### Dataflow

The authentication guard is misordered relative to the log sink.

Attack steps:
- Send a public POST /verify with a multiline account string and invalid signature.
- Express parses the body.
- console.log writes the attacker string.
- HMAC verification rejects only after the forged line exists.

- **Source:** Unauthenticated JSON account field

- **Sink:** Service console logs

- **Outcome:** Forged audit lines and log amplification

Transformations:
- Express JSON parser

**Log before authentication** — `lirunex-verify-bot/src/server.js:14-18`

Attacker text reaches console.log before the HMAC check.

```javascript
app.post('/verify', async (req, res) => {
  console.log('[POST /verify] Incoming request from:', req.ip, 'account:', req.body?.account);
  const sig = req.header('X-Signature') || '';
  if (!verify(req.rawBody || '', sig, cfg.hmacSecret)) {
    console.warn('[POST /verify] Bad signature rejected');
```

#### Reachability

No HMAC or SafetyScore account is required.

- **Attacker:** Unauthenticated remote actor

- **Entry point:** Public POST /verify

- **Outcome:** Audit-log integrity loss

Preconditions:
- Knowledge of the public bot URL

Existing controls:
- Express default 100 KB JSON limit
- HMAC rejects the request after logging

Blind spots:
- Platform-specific console escaping

**Log before authentication** — `lirunex-verify-bot/src/server.js:14-18`

Attacker text reaches console.log before the HMAC check.

```javascript
app.post('/verify', async (req, res) => {
  console.log('[POST /verify] Incoming request from:', req.ip, 'account:', req.body?.account);
  const sig = req.header('X-Signature') || '';
  if (!verify(req.rawBody || '', sig, cfg.hmacSecret)) {
    console.warn('[POST /verify] Bad signature rejected');
```

#### Severity

**Low** — The issue is remotely reachable without authentication but affects audit integrity and bounded log volume rather than credentials or protected state.

Security automation that trusts these logs for incident response or blocking would increase severity; structured logging that escapes controls would eliminate the path.

Impact assessment:
- **Level:** low
- **Rationale:** The outcome is bounded log integrity and processing impact.

Likelihood assessment:
- **Level:** high
- **Rationale:** The public path needs no authentication.

#### Remediation

Verify HMAC and parse the numeric account before logging; log only a masked validated identifier with structured fields.

Tests:
- Send invalid-HMAC multiline input and assert the raw account is never logged.
- Send a valid request and assert only a masked numeric account is logged.

Preventive controls:
- Authenticate before observability sinks.
- Use structured logging and escape control characters.

## Reviewed Surfaces

| Surface | Risk Area | Outcome | Notes |
| --- | --- | --- | --- |
| Broker status eligibility | Entitlement authorization | Reported | The scraper overwrites the portal Status column with Active before the license gate. Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/02_discovery/candidate_ledger.jsonl, artifacts/05_findings/status-bypass/validation_artifacts/runtime_probe.txt |
| Deposit currency and units | Entitlement authorization | Reported | USC and configured USD values are compared without currency or unit normalization. Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/02_discovery/candidate_ledger.jsonl, artifacts/05_findings/currency-bypass/validation_artifacts/runtime_probe.txt |
| Browser concurrency and resource control | Availability | Reported | Every accepted request immediately launches Chromium with no global in-flight limit. Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/02_discovery/candidate_ledger.jsonl |
| Container build secret boundary | Secret exposure | Reported | The full local context, including a normal .env, can be copied into the final image. Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/02_discovery/candidate_ledger.jsonl, artifacts/05_findings/secret-in-image/validation_artifacts/context_metadata.txt |
| Request and broker-data logging | Audit integrity and sensitive data | Reported | Unauthenticated multiline input reaches logs, and successful searches log a complete raw broker row. Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/02_discovery/candidate_ledger.jsonl |
| HMAC and session cryptography | Authentication and secret storage | Rejected | Timing-safe HMAC verification and AES-256-GCM are effective. Replay and session-file concerns lacked a realistic added privilege or impact path. Evidence: artifacts/02_discovery/work_ledger.jsonl |
| Supabase authentication, RLS, and service-role ordering | Authorization and tenant isolation | No issue found | User tokens, body-user binding, rate limits, runtime controls, and active-program checks precede privileged writes; the migration adds no new RLS exposure. Evidence: artifacts/02_discovery/work_ledger.jsonl |
| Dependencies and deployment guidance | Supply chain and least privilege | Rejected | Integrity-pinned lockfiles were clean. Mutable installation guidance and root-runtime concerns require operator or upstream compromise and did not survive the reportability policy. Evidence: artifacts/02_discovery/work_ledger.jsonl |
