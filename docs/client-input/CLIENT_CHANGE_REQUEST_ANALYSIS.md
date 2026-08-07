# Client Change Request Analysis

## Evidence status

- Analysis date: 2026-08-07.
- Available inputs: the phase-order recovery/client-amendment directive, the editable v4.0 PRD,
  `Car_Dealership_CRM_Core_Functions.pdf`, `Car_Dealership_CRM_User_Roles.pdf`, canonical phase
  prompts, implementation documents and repository source/tests/migrations.
- On 2026-08-07, all four pages of the core-functions PDF and both pages of the user-roles PDF
  were text-extracted and visually reviewed. Their stated roles and functions reconcile with PRD
  Appendix F and the matrix in `CLIENT_REQUIREMENT_PHASE_MAPPING.md`; no additional Phase 2 or
  Phase 3 scope, conflict or unmapped requirement was found.

## Reconciliation decisions

| Client request                                      | Existing implementation / conflict                                                                                                                           | Reconciled decision                                                                                                                                              | Status                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Department and reporting hierarchy                  | Phase 2 had clients, branches, teams and membership authorization scopes, but no Department, actual team membership, Team Manager history or reporting lines | Add canonical `departments`, effective-dated `team_memberships`, `team_manager_assignments` and `reporting_lines`; retain optional hierarchy levels              | Implemented in Phase 2 recovery              |
| Team Manager                                        | No canonical internal role or manager relationship; Lead access could only use generic scope                                                                 | Add stable `TEAM_MANAGER` role and derive managed-team Lead visibility from active Phase 2 assignments                                                           | Implemented and tested                       |
| CRM Admin                                           | Existing `CLIENT_ADMIN`; client wording risked confusion with Agency Admin                                                                                   | Keep `CLIENT_ADMIN` internal code with `CRM Admin` job title; no platform/cross-tenant authority                                                                 | Implemented                                  |
| Sales Consultant                                    | Existing `SALESPERSON` code                                                                                                                                  | Preserve code; display `Sales Consultant`; keep assigned-only Lead access                                                                                        | Implemented                                  |
| Business Owner / GM / Sales Head / Showroom Manager | Existing MANAGER and SALES_MANAGER profiles                                                                                                                  | Use profile + job title + branch/department/team scope + reporting line; do not add duplicate codes solely for wording                                           | Supported by Phase 2 foundation              |
| Specialist department roles                         | Some existing operational roles; some modules do not exist yet                                                                                               | Use job title/department/team now; introduce module permissions only in the owning later phase                                                                   | Foundation implemented; module work deferred |
| Client Lead-source examples                         | Phase 3 intentionally has six exact core sources                                                                                                             | Keep exact enum. Store Tele-in, Facebook, IndiaMART, Justdial, CarWale, CarDekho and similar detail in `source_name`, provider metadata and campaign attribution | Implemented                                  |
| Lead ownership and manager visibility               | Three-owner Lead model already existed                                                                                                                       | Preserve three owners and all history. Derive manager access from Phase 2; do not add Lead manager IDs                                                           | Implemented and tested                       |
| AI image creation                                   | Not in Phase 2/3                                                                                                                                             | Assign to Phase 13 with provider-neutral generation, object storage, moderation and human approval                                                               | Prompt/PRD mapped; not implemented           |
| AI transcript and CRM suggestions                   | Not in Phase 2/3                                                                                                                                             | Phase 13 consumes Phase 4 recordings; suggestions require human review and explicit save                                                                         | Prompt/PRD mapped; not implemented           |
| AI auto calling                                     | Provider/compliance unresolved                                                                                                                               | Block until provider, consent, telecom and privacy approval                                                                                                      | Blocked                                      |
| Personal WhatsApp QR                                | Conflicts with official-provider/security requirements                                                                                                       | Do not implement unofficial WhatsApp Web automation; prefer WhatsApp Business Platform / Cloud API                                                               | Blocked / product decision required          |
| SIM/mobile recording                                | Conflicts with Android/Play/privacy constraints                                                                                                              | Do not use accessibility abuse, hidden capture or restricted-permission bypasses; prefer provider-side recording                                                 | Blocked pending validation                   |
| Social publishing / Google Reviews                  | Official API permissions required                                                                                                                            | Phase 13 only, with official APIs and human approval for generated content                                                                                       | Deferred/provider-dependent                  |

The PDF cross-check confirms the client role set: Telecaller, Sales Consultant, Team Manager,
Showroom Manager, GM/Sales Head, Business Owner, Stock/Inventory, Used/Exchange, Finance/Loan,
Insurance, RTO, Accessories, Delivery Coordinator, Customer Relationship/Feedback, CRM Admin and
Super Admin. It also confirms the supplied functions, including Lead Management, calling,
communications, test-ride GPS, inventory/commercial/delivery/post-sale operations, reporting,
RBAC/audit/security, API/integration/export and AI/social requests. Each is accounted for by the
canonical phase sequence; no function was pulled into Phase 2 or Phase 3 outside its assigned phase.

## Phase 2 recovery compatibility

The recovery is additive. Existing branches receive one `RECOVERY_DEFAULT` / `General` department
before `teams.department_id` becomes mandatory. Existing explicit selected team authorization
scopes seed effective-dated team membership evidence. Neither mapping changes IDs or Lead records.
Client administrators must review/rename compatibility departments and confirm inferred team
membership after applying migrations `0009` and `0010`.

Phase 3 now checks actual active team membership and department scope for team queue eligibility.
Migration `0011` adds branch/team queue consistency and prior-assignee tenant foreign keys. It fails
with a descriptive error rather than inventing a repair if legacy inconsistent data exists.

## Explicit non-scope for this recovery

No Phase 4 calling, WhatsApp messaging, test-ride operations, inventory, quotation, finance,
booking, delivery, RTO, post-sale, AI generation or social publishing functionality was added.
