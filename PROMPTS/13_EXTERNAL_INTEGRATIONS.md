You are working inside the existing Go Digital Automobile CRM repository.

Read these before making changes:

1. `Go_Digital_Automobile_CRM_10_on_10_Final_Technical_PRD_v4_0.docx`
2. `DESIGN.md`
3. `AGENTS.md`
4. `docs/implementation/PHASE_STATUS.md`
5. `docs/implementation/DECISIONS.md`
6. `docs/implementation/KNOWN_ISSUES.md`
7. `docs/implementation/NEXT_PHASE_HANDOFF.md`
8. Existing source code, migrations and tests related to this phase

Do not regenerate the entire project. Inspect the current implementation first and preserve working code and accepted architectural decisions.

Before coding:

- Summarize the existing state.
- Identify this phase's dependencies.
- List the modules/files you expect to change.
- Identify blocking inconsistencies.
- Then proceed without waiting unless an irreversible business decision is genuinely missing.

Implement only the phase below. At completion, run the mandatory checks and update all implementation tracking documents required by `AGENTS.md`.

---

# PHASE 13 — EXTERNAL INTEGRATIONS, AI, SOCIAL AND CLIENT ONBOARDING

## Unified Inbox and client-state rules

Instagram Direct Messages and Facebook Messenger, when approved, must extend the Phase 5
channel-neutral Conversation/Message model, Contact/Lead context, Conversation Owner, timeline,
authorization and Unified Inbox UI. Do not build separate channel inbox products. Keep
provider-specific OAuth, webhook, media and policy logic behind provider adapters; SMS and email
remain separate future provider integrations using the same canonical inbox foundation where
appropriate. Official provider APIs are mandatory.

Zustand may coordinate transient integration/onboarding wizard progress, local selection and panel
state. Provider connections, OAuth state, sync status, failures and onboarding completion remain
server state. Never place OAuth codes, access/refresh tokens, provider secrets, webhook secrets,
customer messages or signed URLs in Zustand or persisted browser/mobile storage. Reset transient
stores on logout and every account, membership, tenant or support-context change.

## Objective

Connect production providers using already-built adapters and workflows.

Consume the canonical Phase 2 organization model and Phase 3 Lead/Contact/activity identities.
Providers must create Leads through the canonical Lead service rather than writing Lead tables
directly.

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
11. AI image generation provider
12. AI transcription and structured CRM-suggestion provider
13. Supported social publishing and Google Reviews APIs

## AI image creation

Implement Brand Profile → Brand Template → Creative Request → provider-neutral AI Image Adapter →
Generated Asset → Moderation → Human Review → Approval → Download or supported publishing →
History. Store binary assets in private object storage and metadata/references in PostgreSQL. Human
approval is mandatory before publishing.

## Transcript and CRM suggestions

Implement Call → Recording → Transcript → Summary → structured suggested CRM changes → Human
Review → Explicit Save. AI must never silently overwrite authoritative Lead data.

AI auto-calling remains blocked until provider, consent and telecom/privacy compliance are approved.
Social publishing requires official APIs and granted platform permissions. Personal WhatsApp QR or
unofficial WhatsApp Web automation is prohibited.

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
