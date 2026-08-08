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

# PHASE 9 — DELIVERY OPERATIONS AND ACTIVE TRACKING

## Client-state rules

Zustand may coordinate the delivery UI step, local checklist presentation and drawer/sheet state.
API/TanStack Query remains authoritative for Delivery jobs, PDI, proof, customer location and
completion state; SQLite remains authoritative for durable offline replay. Do not persist sensitive
proof/location/customer payloads in ordinary stores, and reset transient workflow state on logout
and every account/membership/tenant/support-context change.

## Objective

Implement delivery scheduling, readiness enforcement, mobile execution and proof.

Consume canonical booking, inventory, customer and Phase 2 delivery-team identities. Accessories,
PDI and delivery readiness remain operational state separate from the Lead pipeline.

## States

Vehicle Allocated, Vehicle Preparation, Ready for Delivery, Delivery Scheduled, Out for Delivery, Delivered, Delayed, Failed, Rescheduled and controlled Cancelled.

## Rules

- Valid booking required.
- Cannot start while readiness is blocked.
- Delivery Executive sees only necessary information.
- Active location follows test-ride privacy rules.
- Completion requires configured proof.
- Delay/failure/reschedule require reason.
- Permanent RC is not required for delivery completion.
- Delivery and registration remain parallel.

## Mobile

Today/upcoming, call, navigation, start, visible location notice, PDI/accessories/documents/fuel-battery/condition checklists, OTP/signature, photo, received-by, completion, delay/failure, reschedule and offline outbox.

## Manager web

Today totals, active map, delayed/failed queue, last update/stale state, proof review, reschedule approval and audit timeline.

## Acceptance criteria

- Blocked delivery cannot start.
- Location stops immediately after completion.
- Proof is private and tenant-scoped.
- Offline completion is idempotent.
- RC is not incorrectly required.
