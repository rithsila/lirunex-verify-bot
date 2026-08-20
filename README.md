# Lirunex Verify Bot

Internal Node.js and Playwright service used by EA Safety Score to verify whether a
Lirunex MT5 trading account appears under the expected partner referral.

The bot authenticates to the Lirunex partner portal, searches the Trading Accounts
table, and returns the matching broker rows to the trusted SafetyScore Edge Function.
The Edge Function owns the final eligibility decision: exact account, referrer, live
status, currency, and minimum deposit.

## Contents

- [Security model](#security-model)
- [Requirements](#requirements)
- [Local installation](#local-installation)
- [Configuration](#configuration)
- [Run and test](#run-and-test)
- [API](#api)
- [Run with Docker](#run-with-docker)
- [Publish to Docker Hub](#publish-to-docker-hub)
- [Deploy from Docker Hub](#deploy-from-docker-hub)
- [Operations](#operations)
- [Security reports](#security-reports)

## Security model

- `POST /verify` requires an HMAC-SHA256 signature in `X-Signature`.
- HMAC verification happens before account parsing or logging.
- Account identifiers must contain 6 to 12 digits.
- The request body is limited to 8 KB.
- Each process runs at most one Chromium verification at a time. A concurrent request
  receives `503 verification_busy` and `Retry-After: 5`.
- Browser session state is encrypted with AES-256-GCM before it is written to disk.
- Runtime secrets are excluded from the Docker build context and image.
- The service logs only the last four digits of accepted account identifiers and never
  logs raw broker rows.

Do not call this service directly from browser code or expose its HMAC secret to a
frontend. It is an internal server-to-server service and should be published only behind
HTTPS, a private network, or both.

## Requirements

For a native installation:

- Node.js 20 or later
- npm
- Git
- A supported Playwright Chromium environment

For the recommended container installation:

- Docker Engine or Docker Desktop with BuildKit

## Local installation

```bash
git clone https://github.com/rithsila/lirunex-verify-bot.git
cd lirunex-verify-bot
npm ci
```

Install Chromium for Playwright:

```bash
npx playwright install chromium
```

On supported Debian or Ubuntu hosts, install Chromium and its operating-system
dependencies together:

```bash
npx playwright install --with-deps chromium
```

Create the local configuration:

```bash
cp .env.example .env
chmod 600 .env
```

Generate separate random values for session encryption and request authentication:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Put one value in `SESSION_ENCRYPTION_KEY` and the other in
`LIRUNEX_BOT_HMAC_SECRET`. Do not reuse either value for another purpose.

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `LIRUNEX_PORTAL_URL` | Yes | Lirunex portal origin, normally `https://client.lirunex.online` |
| `LIRUNEX_LOGIN_EMAIL` | Yes | Partner portal login email |
| `LIRUNEX_LOGIN_PASSWORD` | Yes | Partner portal login password |
| `LIRUNEX_REFERRER_NAME` | Yes | Expected partner name retained for deployment compatibility |
| `SESSION_ENCRYPTION_KEY` | Yes | Exactly 64 hexadecimal characters, used as the AES-256-GCM key |
| `LIRUNEX_BOT_HMAC_SECRET` | Yes | Shared secret used to authenticate raw request bodies |
| `PORT` | No | HTTP port; defaults to `3000` |

The encrypted Playwright session is stored at:

```text
data/.lirunex_session.enc
```

Persist `data/` between restarts. Losing the file is safe, but forces the bot to log in
again. Losing or changing `SESSION_ENCRYPTION_KEY` makes an existing session file
unreadable and also forces a new login.

## Run and test

Run the full bot test suite:

```bash
npm test
```

Start the service:

```bash
npm start
```

Verify health from another terminal:

```bash
curl --fail http://127.0.0.1:3000/health
```

Expected response:

```json
{"ok":true}
```

## API

### `GET /health`

No authentication is required.

```json
{"ok":true}
```

### `POST /verify`

The HMAC is the lowercase hexadecimal SHA-256 signature of the exact raw UTF-8 request
body. The caller and bot must share `LIRUNEX_BOT_HMAC_SECRET`.

Request body:

```json
{
  "account": "569307908",
  "requestId": "035f7338-a09f-4f85-8b70-e743a950c706"
}
```

Example Node.js caller:

```js
'use strict';

const crypto = require('node:crypto');

async function verifyAccount(account) {
  const body = JSON.stringify({ account, requestId: crypto.randomUUID() });
  const signature = crypto
    .createHmac('sha256', process.env.LIRUNEX_BOT_HMAC_SECRET)
    .update(body, 'utf8')
    .digest('hex');

  const response = await fetch(`${process.env.LIRUNEX_BOT_URL}/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature': signature,
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Lirunex verification failed with HTTP ${response.status}`);
  }

  return await response.json();
}
```

Successful response:

```json
{
  "found": true,
  "rows": [
    {
      "account": "569307908",
      "accountType": "Advance Cent Plus MT5",
      "referrerName": "Example Partner",
      "country": "Cambodia",
      "currency": "USC",
      "depositRaw": "10000.00",
      "status": "Active"
    }
  ],
  "checkedAt": "2026-08-20T13:00:00.000Z"
}
```

Error responses:

| Status | Error | Meaning |
| --- | --- | --- |
| `400` | `invalid account` | Account is not 6 to 12 digits |
| `401` | `bad signature` | Missing or invalid HMAC signature |
| `503` | `verification_busy` | This process already has an active browser search |
| `502` | `verification_unavailable` | Portal navigation, login, or scraping failed |

## Run with Docker

The Docker image pins the Playwright package and browser image to the same version.
Build it from the repository root:

```bash
docker build --tag lirunex-verify-bot:0.1.0 .
```

Run the service with secrets injected at runtime and a persistent encrypted-session
volume:

```bash
docker run --rm \
  --name lirunex-verify-bot \
  --init \
  --ipc=host \
  --env-file .env \
  --volume lirunex-session:/app/data \
  --publish 127.0.0.1:3000:3000 \
  lirunex-verify-bot:0.1.0
```

`--init` gives Chromium correct process reaping, while `--ipc=host` prevents Chromium
from exhausting a small container shared-memory allocation. These are recommended by
the [Playwright Docker guide](https://playwright.dev/docs/docker).

The current image runs the browser as root with Chromium's sandbox disabled. Use it only
against the trusted Lirunex portal. Do not repurpose this image as a general-purpose
browser for untrusted URLs.

Confirm that no secret was copied into the image:

```bash
docker run --rm --entrypoint sh lirunex-verify-bot:0.1.0 \
  -c 'test ! -e /app/.env && echo runtime-secrets-not-baked-in'
```

## Publish to Docker Hub

### 1. Create the repository

Sign in to [Docker Hub](https://hub.docker.com/), open **My Hub → Repositories**, and
create a repository named `lirunex-verify-bot` under your user or organization namespace.
Use a **private** repository unless there is a deliberate decision to publish this
internal service.

Docker Hub repository names cannot be renamed after creation, so confirm the namespace,
name, and visibility before saving. See Docker's
[repository creation guide](https://docs.docker.com/docker-hub/repos/create/).

### 2. Authenticate securely

Create a Docker Hub personal access token with the minimum required permission, normally
**Read & Write** for a publisher. Store it in a password manager and never add it to
`.env`, the repository, the Dockerfile, build arguments, or shell scripts.

Authenticate interactively:

```bash
docker login --username YOUR_DOCKERHUB_USERNAME
```

Paste the access token when Docker asks for the password. Docker documents PAT creation
and rotation in [Personal access tokens](https://docs.docker.com/security/access-tokens/).

### 3. Build versioned tags

Replace `YOUR_DOCKERHUB_NAMESPACE` with the Docker Hub user or organization that owns the
repository:

```bash
docker build \
  --tag YOUR_DOCKERHUB_NAMESPACE/lirunex-verify-bot:0.1.0 \
  --tag YOUR_DOCKERHUB_NAMESPACE/lirunex-verify-bot:latest \
  .
```

Use immutable semantic-version tags for production. `latest` is a convenience pointer,
not a deployment lock.

### 4. Push the tags

```bash
docker push YOUR_DOCKERHUB_NAMESPACE/lirunex-verify-bot:0.1.0
docker push YOUR_DOCKERHUB_NAMESPACE/lirunex-verify-bot:latest
```

Open the repository's **Tags** page in Docker Hub and confirm both tags and their digest.
The official process is documented in
[Push images to a repository](https://docs.docker.com/docker-hub/repos/manage/hub-images/push/).

### 5. Optional multi-platform publish

To publish one manifest for both standard x86-64 servers and ARM64 hosts:

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag YOUR_DOCKERHUB_NAMESPACE/lirunex-verify-bot:0.1.0 \
  --tag YOUR_DOCKERHUB_NAMESPACE/lirunex-verify-bot:latest \
  --push \
  .
```

Multi-platform builds push directly to the registry rather than loading the manifest into
the classic local image store. See Docker's
[multi-platform build documentation](https://docs.docker.com/build/building/multi-platform/).

### 6. Verify the published image

```bash
docker pull YOUR_DOCKERHUB_NAMESPACE/lirunex-verify-bot:0.1.0

docker run --rm \
  --init \
  --ipc=host \
  --env-file .env \
  --volume lirunex-session:/app/data \
  --publish 127.0.0.1:3000:3000 \
  YOUR_DOCKERHUB_NAMESPACE/lirunex-verify-bot:0.1.0
```

In another terminal:

```bash
curl --fail http://127.0.0.1:3000/health
```

For production, record and deploy the immutable digest shown by `docker push` or inspect
it later with:

```bash
docker buildx imagetools inspect \
  YOUR_DOCKERHUB_NAMESPACE/lirunex-verify-bot:0.1.0
```

## Deploy from Docker Hub

On the target host, authenticate first if the repository is private, then pull the exact
version and run it behind an HTTPS reverse proxy:

```bash
docker pull YOUR_DOCKERHUB_NAMESPACE/lirunex-verify-bot:0.1.0

docker run --detach \
  --name lirunex-verify-bot \
  --restart unless-stopped \
  --init \
  --ipc=host \
  --env-file /opt/lirunex-verify-bot/.env \
  --volume lirunex-session:/app/data \
  --publish 127.0.0.1:3000:3000 \
  YOUR_DOCKERHUB_NAMESPACE/lirunex-verify-bot:0.1.0
```

Configure the SafetyScore Edge Function with the public HTTPS origin and the same HMAC
secret:

```bash
supabase secrets set \
  LIRUNEX_BOT_URL=https://lirunex-bot.example.com \
  LIRUNEX_BOT_HMAC_SECRET=REPLACE_WITH_THE_SHARED_SECRET
```

Do not paste a real secret into shell history on a shared machine. Prefer the deployment
platform's secret manager or an interactive/temporary environment when setting secrets.

## Operations

### Health and logs

```bash
curl --fail http://127.0.0.1:3000/health
docker logs --follow lirunex-verify-bot
```

### Publish an update

1. Update the application version in `package.json`.
2. Run `npm ci`, `npm test`, and `npm audit --omit=dev`.
3. Build and run the new image locally.
4. Publish a new immutable version tag.
5. Verify the remote tag and digest.
6. Update the deployment to the new version or digest.
7. Move `latest` only after the versioned image is verified.

Never overwrite an existing production version tag with different image contents.

### `503 verification_busy`

This is expected when a browser verification is already running in the same process.
Honor `Retry-After: 5` and retry with bounded backoff. Each replica has its own one-search
permit; increasing replicas increases total portal traffic.

### Session or login failures

- Confirm the portal URL and credentials.
- Confirm `/app/data` is writable and persistent.
- Confirm `SESSION_ENCRYPTION_KEY` is unchanged and exactly 64 hexadecimal characters.
- Check whether the Lirunex login flow or Trading Accounts table structure changed.

## Security reports

The completed assessment and hardening evidence are stored in
[report/](./report/README.md):

- [Security assessment](./report/security-assessment.md)
- [Security fix report](./report/security-fix-report.md)
- [Canonical findings JSON](./report/findings.json)
- [SARIF output](./report/results.sarif)

Current assessment outcome: **all six validated findings are fixed**.

## Additional deployment guide

For a non-Docker Proxmox installation, see
[docs/PROXMOX_LXC_GUIDE.md](./docs/PROXMOX_LXC_GUIDE.md).

## License

This repository does not currently declare an open-source license. Treat it as private,
proprietary software unless the repository owner adds a license.
