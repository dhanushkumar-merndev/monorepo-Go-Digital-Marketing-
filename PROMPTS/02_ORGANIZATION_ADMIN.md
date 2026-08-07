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

# PHASE 2 — ORGANIZATION, HIERARCHY, ROLE/SCOPE AND USER ADMINISTRATION

## Objective

Implement the canonical organization and access foundation required to onboard and manage
dealerships. Phase 3 and every later business module must consume these relationships rather than
create parallel branch, department, team or manager models.

## Canonical organization model

Support Client Organization / Tenant → Branch / Showroom → Department → Team → Team Members,
with effective-dated Team Manager assignments and configurable reporting lines. Management layers
are optional; do not force every dealership to use every title.

## Agency Admin capabilities

- Create client organizations
- Suspend/reactivate clients
- View integration-readiness placeholders
- Configure enabled modules
- View usage summaries
- Enter audited support mode
- Define safe global defaults

## Client Admin capabilities

- Manage dealership profile
- Create/manage branches, departments and teams
- Invite users
- Assign internal role/profile, display job title, branch, department and team scopes
- Assign/end team membership, replace Team Manager and configure reporting relationships
- Activate/deactivate users
- Configure working hours
- Configure lead-assignment readiness
- Configure feature flags and basic retention preferences
- Review account/permission audit events

## Domain rules

- At least one active Client Admin must remain for an active client.
- A client with business history cannot be hard-deleted.
- Suspending a client blocks access without deleting data.
- Deactivating an employee revokes sessions.
- Historical ownership remains intact.
- Role changes apply immediately and are audited.
- Branch transfer never rewrites historical records silently.
- Team membership, Team Manager replacement and reporting changes require a reason, retain history
  and create immutable audit evidence.
- Reject cross-tenant, invalid branch/department/team relationships, self-reporting, reporting
  cycles, unauthorized cross-team management and unauthorized cross-branch management.
- Team Manager scope derives only from active canonical manager assignments and never implies
  whole-branch access.

## Role and job-title reconciliation

- Preserve stable internal codes such as CLIENT_ADMIN, MANAGER, SALES_MANAGER, TELECALLER and
  SALESPERSON.
- Add the canonical TEAM_MANAGER profile.
- Represent CRM Admin as tenant CLIENT_ADMIN + job title, never as Agency Admin / Super Admin.
- Represent Sales Consultant as SALESPERSON + job title.
- Use job title + department + team + permission set + scope for Business Owner, GM / Sales Head,
  Showroom Manager and specialist department wording where this avoids duplicate hard-coded roles.
- CRM Admin receives no cross-tenant, deployment, infrastructure, unrestricted-secret or platform
  security authority.

## Web screens

- Agency client list/create/detail/suspension
- Branch management
- Department management
- Team management
- Team membership, Team Manager and reporting hierarchy management
- User directory and invitation
- Role, job-title and branch/department/team scope assignment
- Module feature flags
- Working hours
- Permission view
- Audit timeline

## Acceptance criteria

- Agency Admin manages multiple clients without leakage.
- Client Admin cannot manage another client.
- Deactivation revokes sessions.
- Historical references remain intact.
- Feature flags are enforced in UI and backend.
- Permission changes audit old/new values.
- Departments and teams are tenant/branch consistent at the database boundary.
- Team Manager replacement preserves prior history and management visibility is team-scoped.
- Reporting cycles, self-reporting and unauthorized cross-team/cross-branch changes are rejected.
- CRM Admin remains tenant-only and Sales Consultant retains the stable SALESPERSON internal code.
