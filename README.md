# lirunex-verify-bot

A lightweight Node.js + Playwright microservice for verifying Lirunex partner referral accounts.

## Features
- Logs into Lirunex partner portal and caches encrypted session (AES-256-GCM).
- Searches accounts under IB contacts.
- Authenticates incoming requests via HMAC-SHA256 signatures (`X-Signature`).

## Endpoints
- `GET /health` - Health check endpoint.
- `POST /verify` - Verify an MT5 account under IB. Expects `{ "account": "123456", "requestId": "uuid" }` and header `X-Signature`.
