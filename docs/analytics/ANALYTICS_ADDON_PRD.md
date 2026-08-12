# Analytics + Reporting + Data-grid Add-on PRD

## 1. Objective

Add role-aware, server-authoritative analytics and a consistent scalable list experience without
changing canonical CRM workflows, weakening authorization or inventing unavailable business facts.

## 2. Scope

The add-on covers the 12 implemented roles, client and agency aggregate analytics, ECharts, shared
date/comparison/filter contracts, web and mobile overview surfaces, pagination/cursor utilities,
network-search debounce, justified virtualization, additive indexes, tests and durable standards.

## 3. Roles

The canonical role inventory and persona mapping is maintained in
`docs/analytics/ROLE_ANALYTICS_MATRIX.md`. No future role or module is activated by this add-on.

## 4. Authorization

NestJS derives tenant and active membership from the session. Analytics SQL includes tenant and
effective branch/team/department/assignment predicates before grouping. Requested filters are
validated against policy. Default deny applies. Agency context uses a separate aggregate endpoint
and cannot submit client row-level dimensions.

## 5. Metric definitions

Definitions, cohorts, comparison semantics and unavailable facts are canonical in
`docs/analytics/METRIC_DEFINITIONS.md`. Zero is a valid value; unavailable and not permitted are not
rendered as zero.

## 6. Domain analytics

Implemented facts cover Leads, calls, conversations, test rides, inventory, bookings, delivery,
registration/reminders, finance and insurance. Lead trend/source and status funnels use database
aggregation. Attention reports overdue follow-ups, SLA breaches and unassigned Leads within scope.

## 7. Agency Admin privacy

`GET /v1/analytics/platform` returns client names/IDs, statuses, aggregate counts/rates, active/total
users, branches, enabled module count and integration health. It never returns Contact or Lead row
objects, PII, messages, recordings, documents or row drilldown. Tests assert this boundary.

## 8. Client Admin analytics

`GET /v1/analytics/overview` returns tenant-wide metrics only for permissions granted to the active
membership. Other manager roles use the same contract with stricter scope predicates.

## 9. Role dashboards

The secure web home embeds a compact analytics subset; `/analytics` provides the detailed workspace.
Mobile home shows at most four metrics plus attention. The server filters metrics/series by permission
and role presentation.

## 10. Chart system

Apache ECharts 6 is modularly lazy-loaded through `AnalyticsChart`. Narrow datasets, ARIA, textual
summaries, responsive resize and instance disposal are mandatory. Raw domain rows are prohibited in
chart options/tooltips.

## 11. Filters

The shared query supports authorized branch, department, team and user identifiers plus source,
model and channel dimensions. The UI exposes date, comparison, source, model and channel, and loads
branch, team and user pickers only when the current session has permission to read those scoped
organization dimensions. Department remains API/shareable-URL capable for authorized drilldowns.

## 12. Date handling

Presets are 7 days, 30 days and month-to-date, plus custom inclusive dates. The client organization
timezone stored in PostgreSQL is authoritative. Comparison modes are none, previous period, previous
month and previous year.

## 13. Pagination

Resource tables default to 25 rows and allow only 25/50/100 with a hard maximum of 100. Filter/search
changes reset to page one. Stable secondary ID ordering prevents duplicates within offset paging.
Message history uses a stable opaque timestamp+ID cursor and 50-message pages.

## 14. Virtualization

TanStack Virtual renders the incrementally loaded chat timeline. Ordinary resource tables are not
virtualized because their bounded page size keeps the DOM small.

## 15. Debounce

Network-backed Lead and conversation search, plus analytics model/channel text filters, use 300 ms.
Buttons and mutations are never debounced.

## 16. Exports

Existing asynchronous CSV/XLSX reporting jobs snapshot effective authorization and filters on the
server. Private object keys are not exposed. Agency cross-client row export is not enabled; platform
analytics remain aggregate-only.

## 17. Caching

TanStack Query owns response caching with complete filter keys, 30-second staleness and 60-second
refresh for analytics. No complete analytics response is persisted in Zustand. No Redis cache was
added because correct indexed near-real-time queries are currently sufficient.

## 18. Performance

Aggregations execute in PostgreSQL in parallel by authorized domain. Composite tenant/time indexes
support observed predicates. There is no per-row analytics query. Payloads contain aggregate datasets
only; page/cursor responses bound long lists.

## 19. Responsive behavior

Web moves from four KPI/two-chart desktop grids to reduced tablet/mobile columns. Native mobile keeps
KPIs and work queues only. Tables preserve horizontal overflow rather than collapsing semantic data.

## 20. Accessibility

Charts expose ARIA plus text summaries, KPI values remain textual, filters are labelled, tables use
semantic headers, and pagination controls include labels/disabled states. Outcome is not encoded by
color alone.

## 21. Acceptance criteria

Acceptance requires all 12 role surfaces audited, aggregate-only Agency Admin security, authorized
server analytics, canonical ECharts, tenant dates/comparisons, high-volume list bounding, debounce,
justified virtualization, additive migration, tests/builds, DESIGN standards and the two audit
matrices. Hosted release and provider validation remain governed by Phase 14 and are not claimed here.

## 22. Table audit matrix

The exhaustive inventory and each intentional non-paginated list are in
`docs/analytics/TABLE_AUDIT_MATRIX.md`.

## 23. Analytics role matrix

See `docs/analytics/ROLE_ANALYTICS_MATRIX.md`.
