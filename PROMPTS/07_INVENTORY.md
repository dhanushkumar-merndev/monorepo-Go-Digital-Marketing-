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

# PHASE 7 — VEHICLE INVENTORY AND ALLOCATION

## Client-state rules

Zustand may coordinate non-shareable table filters, selection, layout and temporary inventory UI
workflow. API/TanStack Query remains authoritative for stock, VIN, physical units, reservations,
allocations and concurrency/version state. Prefer URL state for shareable filters, React state for
isolated controls, no sensitive persistence by default, and reset transient state on every
user/tenant/support-context change.

## Objective

Implement MVP inventory needed for booking, test rides and delivery.

This phase owns physical stock. Use canonical Phase 2 branches/departments/users and do not encode
inventory state in the Phase 3 Lead lifecycle.

## Entities

Brands, models, variants, colours, physical units, VIN/chassis, engine number, branch stock, status history, reservations, allocations, transfers, demo designation and expected arrivals.

## States

Expected, Available, Reserved, Allocated, Demo, In Transfer, Delivered, Blocked and controlled Cancelled/Removed.

## Rules

- VIN/chassis uniqueness.
- One physical unit cannot serve two active bookings.
- Reservation expiry and controlled release.
- Immutable transfer history.
- Demo vehicle requires authorized transition before sale.
- Delivered cannot return to available through ordinary edit.
- Reallocation requires reason and permission.
- Inventory role cannot modify payment.
- Billing cannot silently replace VIN.

## Web screens

Catalogue, stock list/detail, creation/import, reservations, allocation queue, transfer, demos, expected arrivals, aging and history.

## Acceptance criteria

- Concurrent allocation cannot double-allocate a VIN.
- Expired reservations release correctly.
- Transfer history is immutable.
- Tenant/branch scope is enforced.
- Unauthorized corrections are blocked.
