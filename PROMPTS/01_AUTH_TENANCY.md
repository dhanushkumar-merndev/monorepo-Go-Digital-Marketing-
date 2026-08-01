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

# PHASE 1 — AUTHENTICATION, TENANCY AND AUTHORIZATION

## Objective

Implement secure identity, sessions, memberships, roles and tenant-scoped authorization.

## Roles

- Agency Admin
- Client Admin
- Manager
- Sales Manager
- Telecaller
- Salesperson
- Test Ride Executive
- Inventory Executive
- Billing and Documentation Executive
- Delivery Executive
- RC and Registration Executive

## Required backend modules

Implement users, authentication identities, refresh sessions, agencies, client organizations, memberships, branch scopes, team scopes where required, permission definitions, role-permission mappings, support elevation sessions and authentication audit events.

Authentication must support email/password baseline login, refresh-token rotation, current-session logout, all-session logout, password-reset architecture, suspended-account blocking, session/device listing and a future OAuth adapter boundary.

## Authorization requirements

Every protected request must verify authenticated user, active membership, active client, tenant scope, permission, branch/team scope and object ownership/assignment where applicable.

Never accept a client-provided tenant ID as authorization proof.

Agency support access requires a reason, short lifetime, visible state and immutable audit event.

## Web screens

- Login
- Forgot password
- Reset password
- Session-expired state
- Unauthorized page
- Permitted tenant/client selector
- User profile
- Active sessions
- Role-aware application shell and navigation

## Mobile screens

- Login
- Secure token persistence
- Session refresh
- Logout
- Disabled-account handling
- Role-aware mobile shell

## Acceptance criteria

- Cross-tenant requests are denied.
- Suspended users cannot obtain or refresh sessions.
- Revoked refresh tokens cannot be reused.
- Branch-scoped users cannot access another branch.
- Mobile field roles cannot access admin APIs.
- Support elevation expires and is audited.
- Web and mobile recover correctly from expired access tokens.
- Authorization tests cover every role family.
