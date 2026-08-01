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

# PHASE 12 — DASHBOARDS, REPORTS, AUDIT AND EXPORTS

## Objective

Implement role-specific operational reporting using authoritative KPI definitions.

## Dashboards

Agency Admin: client status, active users, integration health, usage and webhook failures.

Client Admin/Manager: funnel, source/branch/team performance, test rides, bookings, payments, inventory, deliveries, RC aging and reminders.

Sales Manager: response SLA, assignment, salesperson performance, follow-ups, test-ride/booking conversion and loss/rejection reasons.

Operational roles: assigned queues and permitted completion metrics only.

## KPI contract

Define numerator, denominator, inclusion/exclusion, time basis, tenant timezone, owner attribution and source attribution for every KPI. Use one authoritative definition across screens.

## Audit explorer

Actor, action, entity, old/new values, timestamp, correlation ID, support session, reason and appropriate device/IP metadata.

## Exports

Asynchronous CSV/XLSX, permission checks, tenant scope, expiring private files, export audit and failure states.

## Acceptance criteria

- Dashboard totals reconcile with transactions.
- Timezone boundaries are deterministic.
- Attribution follows Relationship Owner rules.
- Export scope is enforced.
- Audit events are searchable and immutable.
