You are working inside the existing Go Digital Automobile CRM repository.

Read these before making changes:

1. `Go_Digital_Automobile_CRM_10_on_10_Final_Technical_PRD_v4_0.docx`
2. `AGENTS.md`
3. `docs/implementation/PHASE_STATUS.md`
4. `docs/implementation/DECISIONS.md`
5. `docs/implementation/KNOWN_ISSUES.md`
6. `docs/implementation/NEXT_PHASE_HANDOFF.md`
7. Existing source code, migrations and tests related to this phase

Do not regenerate the entire project. Inspect the current implementation first and preserve working code and accepted architectural decisions.

Before coding:

- Summarize the existing state.
- Identify this phase's dependencies.
- List the modules/files you expect to change.
- Identify blocking inconsistencies.
- Then proceed without waiting unless an irreversible business decision is genuinely missing.

Implement only the phase below. At completion, run the mandatory checks and update all implementation tracking documents required by `AGENTS.md`.

---

# PHASE 14 — SECURITY, QUALITY, DEPLOYMENT AND PILOT RELEASE

## Objective

Harden the complete product and prepare a controlled one-dealership pilot.

The release gate must confirm Phase 1 → Phase 2 → Phase 3 dependency consistency, additive migration
execution, compatibility-department review, provider approvals and human-approval controls for AI
or social publishing before pilot sign-off.

## Security work

Tenant/authorization review, OWASP API checks, CSRF/XSS, rate limits, brute-force protection, token revocation, secret rotation, signed URLs, upload validation, malware-scan adapter, audit integrity, support controls, export protection, backup/restore drill, lost-device revocation and dependency/container scanning.

## Test requirements

Unit, API integration, DB constraints, tenant isolation, permissions, transition tests, webhook idempotency, queue retries, offline replay, location lifecycle, inventory concurrency, payment correction, delivery readiness, RC parallel flow, critical E2E and basic load/soak tests.

## Critical E2E journey

Lead capture → dedupe → assignment → follow-up → test ride → completion → negotiation → booking → VIN allocation → payment verification → delivery readiness → delivery → registration/RC → customer vehicle → service reminder.

## Deployment

Development/staging/production, Vercel web, Render Docker API/workers, Supabase PostgreSQL, Upstash Redis, Tigris, mobile staging/production builds, migrations, rollback, backup, monitoring, alerts, Sentry, logs, uptime and queue/webhook dashboards.

## Pilot gate

One approved dealership, limited branches, named users, verified integrations, test/imported data, training, support escalation, daily reconciliation, pilot metrics and signed acceptance.

## Acceptance criteria

- Mandatory tests and builds pass.
- Critical/high security issues are resolved.
- Restore drill succeeds.
- Rollback is documented.
- Pilot users complete the full journey.
- Limitations are documented and approved.
