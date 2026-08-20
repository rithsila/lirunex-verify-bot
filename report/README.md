# Lirunex Verification Security Reports

This directory contains the durable output of the Codex Security assessment completed on
2026-08-20 for the Lirunex referral verification integration and browser bot.

## Review order

1. [Security assessment](./security-assessment.md) — threat model, six validated findings,
   severity, evidence, and remediation recommendations.
2. [Security fix report](./security-fix-report.md) — implemented controls and verification
   evidence showing all six findings are fixed.
3. [Canonical findings](./findings.json) — machine-readable finding records.
4. [Coverage](./coverage.json) — reviewed surfaces, exclusions, and follow-up context.
5. [Scan manifest](./scan-manifest.json) — frozen snapshot identity and scan metadata.
6. [SARIF results](./results.sarif) — importable scanner output for compatible tools.

Focused reproductions are preserved under [evidence](./evidence/).

## Current result

Outcome: **fixed**.

The source hardening, automated suites, real HTTP scenarios, Docker build, Chromium launch,
image-content checks, and container health check passed. Production deployment and a live
Lirunex customer-account verification were outside the assessment scope.
