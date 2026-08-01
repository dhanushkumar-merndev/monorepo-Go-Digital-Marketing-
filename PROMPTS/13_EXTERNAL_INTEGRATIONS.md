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

# PHASE 13 — EXTERNAL INTEGRATIONS AND CLIENT ONBOARDING

## Objective

Connect production providers using already-built adapters and workflows.

## Priority

1. Website lead endpoint
2. Meta lead webhook
3. WhatsApp Cloud API
4. Selected telephony provider
5. Email
6. SMS
7. Google Ads lead forms when required
8. Google Business Profile
9. Google Maps/routing
10. Push notifications

## Integration centre

Connection/authentication state, credential rotation, webhook verification, last success, failures, retries, reconciliation, quota state, connection test, disconnect and tenant configuration.

## Provider standards

Verification, parsing, canonical mapping, idempotency, retry classification, rate-limit handling, health checks, reconciliation, secret protection and structured logging without secrets.

## Onboarding checklist

Legal business details, branches, users, sources, telephony, WhatsApp, email, SMS, Google accounts, consent notices, templates, retention, hours, assignment rules and pilot verification.

Never mark a mock/dev connection production-ready.

## Acceptance criteria

- Outage does not lose internal state.
- Repeated webhooks are safe.
- Tenant secrets remain isolated.
- Disconnect blocks future sends without deleting history.
- Pilot onboarding is visible and audited.
