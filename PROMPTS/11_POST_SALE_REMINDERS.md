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

# PHASE 11 — POST-SALE REMINDERS AND CUSTOMER LIFECYCLE

## Client-state rules

Zustand may coordinate transient reminder-list filters, selection, composer presentation and local
workflow panels. Reminder definitions, schedules, consent/suppression, dispatch attempts and status
history remain authoritative in the API/TanStack Query layer. Use URL state for shareable filters,
local state for isolated inputs, durable outbox storage for dispatch/offline commands, and reset
transient stores on logout and every account, membership, tenant or support-context change.

## Objective

Implement configurable post-sale reminder plans without a full service-centre module.

Consume the canonical customer/vehicle lifecycle. Feedback, complaints and escalation append to
the shared customer activity model without rewriting Phase 3 Lead history.

## Reminder types

Service Due, Insurance Expiry, PUC Expiry, Warranty Expiry, AMC Expiry, Roadside Assistance Expiry, RC Pending, Service Appointment, Exchange Eligibility and Upgrade Opportunity.

## Rules

- Schedule by manufacturer/model/variant/year/delivery date.
- Never hardcode one-month service for all vehicles.
- Support date and kilometre thresholds.
- Separate operational and marketing communication.
- Marketing requires consent.
- Respect suppression/withdrawal.
- Idempotent generation and dispatch.
- Delivery may create reminder plans.
- Use communication outbox/adapters.
- Track scheduled, queued, sent, delivered, failed, cancelled and suppressed.

## Web screens

Service-plan configuration, reminder types, customer plans, upcoming/failed/suppressed reminders, history, reschedule and consent/preferences.

## Acceptance criteria

- Duplicate workers do not duplicate reminders.
- Withdrawn marketing consent blocks marketing.
- Operational/promotional templates remain distinct.
- Plans update safely when vehicle details change.
