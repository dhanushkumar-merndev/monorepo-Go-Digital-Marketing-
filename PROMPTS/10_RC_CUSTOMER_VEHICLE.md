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

# PHASE 10 — REGISTRATION, RC AND CUSTOMER-OWNED VEHICLES

## Client-state rules

Zustand may coordinate non-shareable UI filters, local selection and workflow presentation. Keep RC,
registration, customer-vehicle and document truth in the API/TanStack Query layer; use URL state for
deep links and React state for isolated controls. Do not persist government documents, sensitive
customer-vehicle data or signed URLs in ordinary Zustand/browser/mobile storage. Reset transient
state on logout and every context switch.

## Objective

Implement registration/RC as a parallel post-booking process.

Reuse the canonical Customer/Contact and delivered-vehicle identities; do not create a second
customer record for registration work.

## States

Documents Ready, Registration Started, RTO Submitted, Temporary Registration/Number Allotted, RC Pending, RC Received, RC Shared/Collected and Case Closed.

## Entities

Registration cases/events, RTO data, temporary/permanent registration, RC documents/delivery records, customer vehicles, ownership source, warranty and insurance details.

## Rules

- Registration may start before delivery.
- RC may finish after delivery.
- History is append-only.
- Corrections use correction events.
- Aging uses configured timestamps.
- Documents are private and sharing is audited.
- Closure enforces mandatory fields.
- Customer Vehicle creation is idempotent.
- Authorized external vehicles do not pretend to be dealership sales.

## Web screens

Registration queue, aging dashboard, case detail, RTO update, number allotment, RC upload/verification, customer notification, delivery mode, closure and customer vehicle list/detail.

## Acceptance criteria

- Delivery and RC completion are independent.
- Duplicate vehicle creation is prevented.
- RC history cannot be overwritten.
- Secure access/sharing is audited.
