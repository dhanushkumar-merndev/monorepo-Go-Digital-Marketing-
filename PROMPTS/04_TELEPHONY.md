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

# PHASE 4 — CALLING, TELEPHONY ADAPTER AND CALL OUTCOMES

## Objective

Implement provider-neutral calling and call-history support without unsafe Android permissions.

Create a `TelephonyProvider` interface for start call, webhook verification/parsing, recording retrieval, reconciliation, status mapping and health checks.

Create a development adapter, generic webhook framework, one real provider only when credentials/docs are available, and a `tel:` fallback.

## Entities

Calls, participants, call events, recordings, outcomes, reconciliation state, provider connection and webhook events.

## Outcomes

Interested, Callback, Test ride requested, Showroom visit, No answer, Busy, Wrong number, Not interested, Already purchased, Other.

## Rules

- Provider webhook is authoritative.
- Completed calls require outcome unless supervisor exception.
- Recording access is private and consent/provider-dependent.
- Webhooks are idempotent.
- Reconciliation repairs missed events.
- Do not request Android call log, SMS, contacts or accessibility permissions.
- Do not claim `tel:` fallback provides reliable duration/recording.

## Web screens

Connection configuration, call timeline/detail, recording access, missing-outcome queue, webhook health and reconciliation.

## Mobile screens

Click to call, provider call action where supported, post-call outcome, callback creation and assigned-lead call history.

## Acceptance criteria

- Retries do not duplicate events.
- Unauthorized recording access is blocked.
- Completed call creates an outcome requirement.
- Reconciliation restores missed events.
- Mobile functions without restricted permissions.
