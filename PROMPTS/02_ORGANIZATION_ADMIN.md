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

# PHASE 2 — AGENCY, CLIENT, BRANCH, TEAM AND USER ADMINISTRATION

## Objective

Implement operational administration required to onboard and manage dealerships.

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
- Create/manage branches and teams
- Invite users
- Assign roles, branches and team scopes
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

## Web screens

- Agency client list/create/detail/suspension
- Branch management
- Team management
- User directory and invitation
- Role and scope assignment
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
