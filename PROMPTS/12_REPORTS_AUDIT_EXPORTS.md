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

# PHASE 12 — DASHBOARDS, REPORTS, AUDIT AND EXPORTS

## Client-state rules

Prefer URL state for shareable report filters, date ranges, tabs, sort order and drill-down context.
Zustand may coordinate only non-shareable dashboard layout, temporary selection and export-dialog
presentation. API/TanStack Query remains authoritative for KPI results, audit events and export job
status. Do not persist report payloads, audit records or signed export URLs, and reset transient state
on logout and every account, membership, tenant or support-context change.

## Objective

Implement role-specific operational reporting using authoritative KPI definitions.

Report over canonical Phase 2 organization/hierarchy and Phase 3+ domain records. Reporting scope
must match live tenant/branch/department/team authorization, including Team Manager assignments.

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
