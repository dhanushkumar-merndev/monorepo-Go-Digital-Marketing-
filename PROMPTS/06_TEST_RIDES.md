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

# PHASE 6 — TEST-RIDE OPERATIONS AND ACTIVE LOCATION TRACKING

## Client-state rules

TanStack Query/API remains authoritative for Test Ride jobs, assignments, vehicle allocation, GPS
history and lifecycle. A feature-scoped Zustand store may coordinate the active Test Ride UI,
selected-ride presentation, non-shareable filters, panels/sheets and temporary map presentation.
Keep deep-linkable state in the URL/navigation route, isolated state local, durable offline work in
SQLite and sensitive location/customer data out of persisted Zustand. Reset workflow state on
logout, account/membership/tenant and support-context changes.

## Objective

Implement complete test-ride scheduling, assignment, execution and active-job tracking.

Consume canonical Phase 2 users/teams and Phase 3 Lead/Contact identities. Active location starts
only after explicit job action and stops immediately when the job ends.

## States

Requested, Booked, Customer Confirmed, Executive Assigned, Active, Completed, Cancelled and No-show.

## Capabilities

Salesperson schedules model/vehicle, branch, time, customer location/notes and confirmation.

Manager/Sales Manager assigns/reassigns, views today, active map, delay and stale jobs.

Test Ride Executive mobile sees jobs, calls/navigates, starts with disclosure, optional OTP, kilometres, condition checklist, active location, feedback and completion/cancel/no-show reasons.

## Location rules

- Starts only after explicit action.
- Tracks only active assigned jobs.
- Target 30–60-second updates.
- Show timestamp, accuracy and stale state.
- Stop on complete/cancel/timeout/manual stop.
- No unnecessary off-duty history.
- Queue temporary offline samples safely.
- Reject unauthorized/inactive-job updates server-side.

## Acceptance criteria

- Executive cannot start another employee's job.
- No location before start or after stop.
- Manager sees active jobs only.
- Stale data is labelled.
- Completion enforces checklist/evidence.
- Offline completion replays exactly once.
