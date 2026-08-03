# Phase Status

- **Current phase:** Phase 2 agency, client, branch, team and user administration
- **Current status:** Phase 2 backend administration commands, migration, contracts, seed data and
  initial web console are implemented and repository-verified. Completion remains **partial**:
  the browser console still needs direct profile, role/scope-assignment and working-hours editors,
  and feature flags need to be attached to the future module routes they will govern. OpenNext's
  Windows-only symlink packaging failure still requires a Linux run, and signed Android/iOS Google
  verification still requires provider/release credentials and devices. Phase 2 has not started.
- **Completed phases:** Phase 0 foundation, Phase 0 deployment amendment, Phase 1 core
  authentication / tenancy / authorization and its strict audit
- **Last updated:** 2026-08-03

## Phase 2 implementation status

- [x] Agency client creation, suspension/reactivation, usage counts, support-elevation reuse and
      safe defaults are implemented with immutable audit events.
- [x] Client-scoped branch/team CRUD, invited memberships, membership status/role/scope commands,
      session revocation, module flags, integration readiness, retention/lead readiness and audit
      timeline contracts/routes are implemented.
- [x] Migration `0004_fast_blink.sql` adds administrative settings/readiness/flag/working-hours
      tables and additional least-privilege permissions; seed data includes realistic defaults.
- [x] PGlite business-rule coverage proves default propagation and the final active Client Admin
      cannot be removed; migration/integration suites pass.
- [ ] Web console needs direct editors for dealership profile, working hours and role/team/branch
      scope assignment before Phase 2 can be declared complete.
- [ ] Feature-flag middleware must be attached when the gated operational module routes are added;
      the current phase has no operational module endpoint to guard.

## Phase 2 verification (2026-08-03)

`pnpm format:check`, `pnpm lint`, `pnpm type-check`, `pnpm test`, `pnpm test:integration`,
`pnpm db:check` and `pnpm build` passed. `pnpm build:web:cloudflare` compiled Next.js and the new
`/administration` route, then hit the existing Windows OpenNext symlink `EPERM` limitation.

## Google authentication amendment acceptance criteria

- [x] Email/password login and the existing NestJS access-token/rotating-refresh session model are
      unchanged; Google is an additional identity provider.
- [x] No public registration or automatic membership creation exists. A real migrated-database
      integration test proves Google activation reuses an eligible invitation and its membership.
- [x] Google ID tokens are verified server-side for RS256 signature, Google issuer, the sole Web
      client audience, expiry, nonce, subject, verified email and multi-audience `azp`.
- [x] Random challenges are stored only as hashes and consumed once with expiry, purpose,
      client-type and, for linking, user/session binding.
- [x] Existing active local accounts require an authenticated controlled-linking flow; matching an
      email string alone never silently merges accounts.
- [x] Google identities are separate records. Unlinking requires another supported active login
      method and revokes every CRM session bound to the disabled Google identity.
- [x] Disabled users, suspended users, inactive clients, inactive memberships and cross-tenant or
      out-of-scope authorization remain blocked by the shared live-session policy.
- [x] Web uses the official GIS-rendered button, explicit failure/invitation states, profile
      link/unlink UI and the existing Secure/HttpOnly refresh cookie.
- [x] Mobile uses an Expo-compatible native Google flow, keeps only CRM sessions in SecureStore,
      and has separate EAS development/preview/production environments with fail-closed IDs.
- [x] The requested valid/invalid provider, provisioning, conflict, refresh, logout/revocation,
      duplicate identity, audit, cross-tenant, branch and team cases are covered by unit, HTTP and
      migrated-PGlite integration tests. Invalid issuer now has a dedicated test.
- [x] Configuration, OpenAPI DTOs, deployment/setup guides and all four tracking documents are
      updated without adding Google secrets to a client bundle.
- [ ] `pnpm build:web:cloudflare` completes the Next.js build but OpenNext 1.20.2 fails while
      creating a Windows symlink (`EPERM`). Re-run this packaging step under Linux/WSL or Windows
      Developer Mode before release.
- [ ] Live Android SHA/client registration, iOS client configuration and signed-device Google token
      exchange require the real provider credentials and release signing environment.

## Original Phase 1 acceptance criteria

- [x] Cross-tenant requests are denied. Tenant context is read only from the resolved session
      membership; `OrganizationAccessService` derives `client_organization_id` from
      `AuthorizationContext` and never from a request body, header or path.
- [x] Suspended users cannot obtain or refresh sessions. `resolveSession` returns `user_inactive`
      and the guard raises `ACCOUNT_SUSPENDED`; the refresh route clears the refresh cookie.
- [x] Revoked refresh tokens cannot be reused. Rotation sequence is compared with the session
      version; a mismatch terminates the session and writes a `REFRESH_REUSE_DETECTED` audit event.
- [x] Branch-scoped users cannot access another branch. `@BranchParameter` plus
      `AuthorizationPolicy.canAccessBranch` returns `SCOPE_DENIED` and records `ACCESS_DENIED`.
- [x] Mobile field roles cannot access admin APIs. Role application (`WEB`/`MOBILE`) and permission
      mappings are enforced in the backend and asserted in `mobile-access.test.ts`.
- [x] Support elevation expires and is audited. Reason is mandatory, TTL is
      `AUTH_SUPPORT_ELEVATION_TTL_SECONDS` (default 900s, max 3600s), state is visible in the web
      shell, and creation/revocation write immutable audit events.
- [x] Web and mobile recover correctly from expired access tokens. The web client refreshes through
      the `HttpOnly` cookie and falls back to the session-expired route; the mobile auth manager
      refreshes from the secure credential vault.
- [x] Authorization tests cover every role family. Canonical roles, permissions and least-privilege
      mappings are asserted in the database integration suite and the guard/policy specs.
- [x] Formatting, migration metadata, lint, strict type-check, unit tests, integration tests and
      the monorepo production build all pass.
- [ ] `pnpm build:web:cloudflare` was re-run. Next.js compile/type/static generation passed, then
      OpenNext failed at the documented Windows symlink operation. See KNOWN_ISSUES.md.

## Remediation applied during this audit

The Phase 1 commit did not pass its own completion protocol. Five mandatory gates failed on a clean
checkout and were fixed inside this phase:

1. **Mobile tests and mobile production build were broken.** `react-native-worklets@0.10.1` needs
   `@babel/traverse` without declaring it, and the workspace carried two React versions
   (`apps/web` 19.2.8, `apps/mobile` 19.2.3) which produced two `react-native` instances and
   nondeterministic Jest resolution ("Invalid hook call"). Fixed by adding a root `@babel/traverse`
   devDependency and aligning `apps/mobile` on React 19.2.8. See ADR-0013.
2. **The API never emitted `status: 'AUTHENTICATED'`.** Login responses violated the shared
   `loginResponseSchema` contract, the API failed its own type-check, and both auth e2e tests
   failed. Fixed in `authentication.service.ts`, `LoginResult` and `LoginResponseDto`. See ADR-0014.
3. **17 ESLint errors** in `@gdm/api` (dead `sessionSummaryFor`, non-null assertions in
   `totp.service.ts`/`mfa-secret-protector.ts`, missing return types, empty test stubs).
4. **14 TypeScript errors** in `apps/mobile/src/auth/auth-response.ts` — the `AuthenticationGrant`
   union was dereferenced without narrowing.
5. **Stale migration assertion** — the integration test asserted two applied migrations while three
   exist. It now derives the expected count from `meta/_journal.json`.

6. **Required Google security evidence was incomplete.** Added direct invalid-issuer coverage,
   Google-session branch/team denial, duplicate provider-subject/provider constraints, invitation
   audit assertions and real-database unlink/session-revocation/audit assertions.
7. **Linux CI could not reach the OpenNext validation step after the Google amendment.** The
   production web build now receives explicit non-production public OAuth IDs in Ubuntu CI; no
   client secret is present, and a repository test locks the Linux Cloudflare/Docker steps in place.
8. **OpenAPI hardcoded the default refresh-cookie name.** Swagger now reads the validated runtime
   cookie name, with an integration assertion using a non-default name.

## Last verified results

Run from the repository root on 2026-08-03 with Node.js 24.18.1 and pnpm 11.18.0 on Windows.

| Check                                                 | Result              | Actual evidence                                                                                                   |
| ----------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                      | Pass                | All 11 workspace projects matched the single root lockfile                                                        |
| `pnpm format:check`                                   | Pass                | All matched files use the configured Prettier style                                                               |
| `pnpm db:check`                                       | Pass                | Drizzle migration journal and snapshots are valid                                                                 |
| `pnpm lint`                                           | Pass                | 8 workspace lint tasks                                                                                            |
| `pnpm type-check`                                     | Pass                | 13 strict TypeScript tasks                                                                                        |
| `pnpm test`                                           | Pass                | 256 tests: API 56 unit + 21 integration, web 58, mobile 70, config 24, contracts 13, database 12, design tokens 2 |
| `pnpm test:integration`                               | Pass                | 34 tests: API/real-store 21 and migrated-database 13                                                              |
| Focused authentication and Google suite               | Pass                | 40 tests across service, provider, linking, HTTP and migrated-store behavior                                      |
| Focused tenant and authorization suite                | Pass                | 18 tests across policy, guard and HTTP session/scope behavior                                                     |
| `pnpm --filter @gdm/mobile exec expo install --check` | Pass                | Expo dependency validation reports dependencies are up to date                                                    |
| `pnpm build`                                          | Pass                | 8 tasks: NestJS, Next.js, shared packages, Android 4.6 MB and iOS 4.4 MB production exports                       |
| `pnpm build:web:cloudflare`                           | Environment failure | Next compile/type/static generation pass; OpenNext bundle symlink fails with Windows `EPERM`                      |
| Hosted Ubuntu CI and Docker build                     | Not run             | Workflow and non-production public-ID wiring are repository-tested; external execution evidence is still required |

## Database migrations

Four reviewed migrations exist and all apply cleanly in the PGlite integration run:

- `0000_neat_shadowcat.sql` — Phase 0 platform tables (unchanged)
- `0001_gifted_bloodscream.sql` — Phase 1 identity/tenancy: 17 tables, 15 enums, 32 foreign keys,
  40 indexes, plus canonical role/permission/mapping seed inserts
- `0002_free_vulture.sql` — Phase 1 hardening: replaces the support-elevation revocation check and
  adds two partial unique indexes (one unconsumed password-reset token per user, one unrevoked
  support elevation per actor session), guarded by an explicit `DO $$` preflight that raises
  `23514` rather than silently discarding security evidence
- `0003_mighty_wonder_man.sql` — Google provider email/identity uniqueness, one-time external-auth
  challenges and immutable identity-link/unlink/invitation audit event types, with duplicate/legacy
  Google-row preflight checks

## Scope and security review

The Cloudflare Worker remains presentation-only; all authentication, session and authorization
authority is in NestJS. The global `APP_GUARD` defaults to deny: a protected route without a
`@RequirePermissions` policy returns 403 rather than allowing the request. Every 5xx
`HttpException` is sanitized to `INTERNAL_ERROR` with empty details; provider outages retain only a
sanitized `PROVIDER_UNAVAILABLE` envelope.

The strict Google tests separately prove invalid issuer, invalid audience, expiry, unverified
email, nonce mismatch, multi-audience `azp`, unknown key, provider outage, invitation-only
activation, duplicate identities, controlled linking, final-method unlink denial, successful
unlink audit/session revocation, CRM session creation and post-Google tenant/branch/team scope.

Out-of-scope surface was found and is **not** wired in: `TotpService` and `MfaSecretProtector`
exist with unit tests but have no module registration, no route, no database column, no
`AUTH_MFA_*` configuration and no client handling, while `packages/contracts` publishes MFA login,
enrollment and verification schemas. MFA is not a Phase 1 acceptance criterion. It is recorded in
KNOWN_ISSUES.md and ADR-0015 and must be either completed or removed by its owning phase.

Password reset is architecturally complete but delivery is an explicitly labelled unavailable
adapter (`UnavailablePasswordResetDelivery`), which never logs or retains tokens.
