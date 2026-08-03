# Next Phase Handoff

## Completed phase

### Phase 2 interim handoff (not complete)

Phase 2 added `packages/database/migrations/0004_fast_blink.sql`, administrative contracts,
`AdministrationService`/`AdministrationController`, development seed settings and the web
`/administration` console. New routes live under `/v1/administration` and cover client lifecycle,
branches, teams, working hours, invitations, membership role/scope/status, settings, module flags,
readiness, agency defaults and audit reads. New permissions are seeded with least privilege.

The PGlite Phase 2 suite proves agency-default flag propagation and prevents removal of the final
active Client Admin. All normal verification gates pass; `pnpm build:web:cloudflare` remains blocked
only by the known Windows OpenNext symlink `EPERM` after successful Next build.

Before marking Phase 2 complete, add the missing web editors for profile, role/scope and working
hours, attach the persisted module flags to the first operational module routes, and add their UI/
HTTP authorization coverage. Invitation delivery is intentionally `UNAVAILABLE` pending an approved
provider; invitations still create actual `INVITED` users/memberships for the existing activation flow.

Phase 1 core authentication, tenancy and authorization passed its strict audit on 2026-08-02. The
Google authentication amendment was implemented and repository-verified on 2026-08-03. Phase 2 has
not started. Do not treat the amendment as release-cleared until the OpenNext bundle is packaged on
Linux/WSL and signed Android/iOS builds complete a live provider exchange; see `PHASE_STATUS.md`.

The deployment topology is unchanged: Cloudflare OpenNext for `apps/web`, a Render NestJS web
service for `apps/api`, an optional Render worker from the same image, Supabase PostgreSQL, Upstash
Redis/BullMQ and private Tigris or R2 storage. Google sign-in still terminates in the existing CRM
access/rotating-refresh session system and added no background processor; `WORKER_MODE` is
unchanged.

## Strict audit disposition

### Fully passed implementation requirements

- Email/password authentication, short-lived access tokens, rotating refresh sessions, refresh
  reuse detection, device/session listing, individual revocation, logout and logout-all are
  implemented and automated-test covered.
- Default-deny tenant, membership, permission, branch, team and support-elevation policies are
  enforced in NestJS. Google-issued CRM sessions traverse the same guard and policy paths.
- Google login/link challenges are short-lived, single-use and nonce bound. ID-token verification
  covers signature, both allowed issuers, the sole Web audience, multi-audience `azp`, expiry,
  subject and verified email.
- Existing invited-user activation, controlled linking, identity uniqueness, last-login-method
  protection, identity-bound session revocation and immutable audit events are covered in the real
  migrated-PGlite integration suite.
- Web keeps refresh tokens in the validated Secure/HttpOnly cookie and access tokens in memory.
  Mobile keeps CRM tokens in SecureStore and never persists Google tokens.
- No public sign-up, Google client secret, client-trusted tenant ID or competing UI/auth system was
  introduced.

### Repository issues fixed

- Added a dedicated invalid-Google-issuer test and Google-session branch, team and cross-tenant
  authorization assertions.
- Expanded real-store Google coverage for invitation audits, duplicate provider/subject rejection,
  successful unlink, session revocation and unlink audit evidence.
- Supplied explicit non-production public OAuth identifiers to Linux CI so production packaging can
  reach the OpenNext and Docker gates; a repository test locks that workflow and verifies no Google
  client secret is present.
- Made the Swagger refresh-cookie security scheme use validated `AUTH_REFRESH_COOKIE_NAME` and
  added an application e2e regression test with a non-default name.

### Remaining code issues

No unresolved defect remains in the Phase 1 acceptance surface. The published-but-unimplemented MFA
scaffolding, unavailable password-reset delivery adapter, unused resource-ownership policy hook and
external-auth challenge retention policy remain explicitly deferred items in `KNOWN_ISSUES.md`;
none was silently treated as implemented.

### External credential requirements

- The private local audit environment contains matching backend, browser and native Web/server
  client identifiers. Their values were not printed, copied into documentation or committed.
- A development/staging/production iOS OAuth client must be created for bundle identifier
  `in.godigitalmarketing.automobilecrm` and exposed only as the public
  `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` for the matching EAS environment.
- Android OAuth registrations must be created for package
  `in.godigitalmarketing.automobilecrm` and every actual debug, EAS upload/release and Play App
  Signing SHA-1 certificate. This host could not extract or validate a signing SHA.
- Hosted Web origins must be registered on environment-specific Web clients. Each API
  `GOOGLE_AUTH_WEB_CLIENT_ID` must equal its web/mobile requested Web audience.

### Physical-device validation requirements

A signed Android build and signed iOS development/preview build must each perform real invited
login, unknown-user rejection, account-conflict rejection, disabled-user and suspended-tenant
rejection, controlled link, last-method unlink rejection, successful unlink/session revocation,
refresh rotation and logout. No physical device, emulator with registered credentials, signed iOS
artifact or live Google provider token was available during this audit, so none is reported as
passed.

### Linux/Cloudflare packaging validation

Next.js compilation, type-checking, page-data collection and static generation pass on this host.
OpenNext 1.20.2 then fails with `EPERM` while creating a dependency symlink, a documented Windows
host limitation. The Ubuntu CI workflow is configured and repository-tested to run the unchanged
OpenNext and Docker build commands with public non-production OAuth identifiers, but no hosted CI
execution was available. Linux OpenNext packaging/preview and Docker Engine execution therefore
remain external release-validation gates.

## Modules created or updated

| Module             | Actual Phase 1 plus Google-amendment state                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| apps/api           | Existing local auth/session/authorization plus nonce challenge, Google verifier/identity adapter, invitation activation, link/method/unlink controller and audit/rate-limit/log-redaction paths         |
| apps/web           | Existing auth/tenancy UI plus GIS login, invitation/linking error states and `/profile/authentication` connected-method management; refresh remains cookie-only                                         |
| apps/mobile        | Existing SecureStore CRM session manager plus Nitro native Google client, Google login states, Android/iOS identifiers, dynamic iOS scheme, development-client dependency and explicit EAS environments |
| packages/contracts | Existing Phase 1 contracts plus Google challenge/login/link/method/unlink schemas, responses and stable errors                                                                                          |
| packages/database  | Phase 1 auth/tenant schema plus provider email, provider uniqueness, `external_auth_challenges`, Google audit event types, migration `0003`, and a test-only migrated-PGlite harness                    |
| packages/config    | Existing `AUTH_*` validation plus the sole server `GOOGLE_AUTH_WEB_CLIENT_ID`, challenge TTL, and public web/mobile client-ID validation                                                                |
| packages/ui        | Existing Phase 1 shadcn wrappers; no competing UI framework added                                                                                                                                       |
| Root               | Phase-grouped `.env.example`, private `.env` organization, build-variable isolation, lockfile updates and Turbo inputs for public Google/EAS configuration                                              |

## Database migrations

| Migration                     | Contents                                                                                                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0000_neat_shadowcat.sql`     | Phase 0 platform tables. **Do not edit.**                                                                                                                                    |
| `0001_gifted_bloodscream.sql` | 17 tables, 15 enums, 32 foreign keys, 40 indexes, and canonical role/permission/mapping inserts                                                                              |
| `0002_free_vulture.sql`       | Support-elevation revocation constraint replacement plus two partial unique indexes, preceded by a `DO $$` preflight that raises SQLSTATE `23514` on pre-existing duplicates |
| `0003_mighty_wonder_man.sql`  | Provider email/uniqueness constraints, one-time external-auth challenges and immutable Google link/unlink/invitation audit types, with legacy-row preflight checks           |

Tables now present: `agencies`, `client_organizations`, `branches`, `teams`, `users`,
`authentication_identities`, `memberships`, `membership_branch_scopes`, `membership_team_scopes`,
`roles`, `permissions`, `role_permission_mappings`, `refresh_sessions`, `refresh_token_rotations`,
`password_reset_tokens`, `support_elevations`, `authentication_audit_events`,
`external_auth_challenges`, plus the Phase 0 `outbox_events`, `webhook_events` and `audit_events`.

Rollback considerations: `0003` changes enums and identity constraints and is not safely reversible
after Google identities/audits exist; restore a reviewed backup instead of deleting identity
evidence. `0002` can be reversed by dropping its indexes and restoring its prior check. `0001` is
also restore-from-backup only once tenant data exists. `pnpm db:migrate` still prefers
`DIRECT_DATABASE_URL` and must run once as a controlled pre-deployment job; replicas never migrate
on startup.

## Routes and API contracts

All under `/v1`. Every route except `@Public()` ones is denied by default by the global
`AuthenticationGuard`; a protected route with no `@RequirePermissions` policy returns 403.

| Route                                                  | Notes                                                                                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /auth/login`                                     | Public. Returns `status: 'AUTHENTICATED'`; web receives the refresh token in an `HttpOnly` cookie scoped to `/v1/auth`, mobile receives it in the body |
| `POST /auth/google/challenge`                          | Public, rate-limited and trusted-origin checked for web; creates a single-use login nonce                                                              |
| `POST /auth/google/login`                              | Public; verifies only the Google token/challenge and then issues the existing CRM session                                                              |
| `POST /auth/google/link-challenge`                     | Protected/profile-update; derives client type from the current live session and binds the challenge to it                                              |
| `POST /auth/google/link`                               | Protected/profile-update; controlled link for the current internal user                                                                                |
| `GET /auth/methods`                                    | Protected/profile-read; lists supported connected methods and server-computed unlink availability                                                      |
| `DELETE /auth/google`                                  | Protected/profile-update; disables Google only if another supported active login method remains                                                        |
| `POST /auth/refresh`                                   | Public. Rotates the refresh token; reuse terminates the session and audits `REFRESH_REUSE_DETECTED`                                                    |
| `POST /auth/forgot-password`                           | Public. Issues a token; delivery is currently an unavailable adapter                                                                                   |
| `POST /auth/reset-password`                            | Public                                                                                                                                                 |
| `POST /auth/switch-membership`                         | Returns a new access token for a permitted membership                                                                                                  |
| `POST /auth/logout`                                    | Current session                                                                                                                                        |
| `POST /auth/logout-all`                                | All sessions for the user                                                                                                                              |
| `GET /auth/sessions`                                   | Session/device listing                                                                                                                                 |
| `DELETE /auth/sessions/:sessionId`                     | Revoke one session                                                                                                                                     |
| `GET /me`                                              | Live profile, memberships, active membership, permissions, support elevation                                                                           |
| `GET /clients`                                         | Agency memberships only                                                                                                                                |
| `GET /branches`, `/branches/:branchId`                 | Branch-scope enforced by `@BranchParameter`                                                                                                            |
| `GET /teams`, `/teams/:teamId`                         | Team-scope enforced by `@TeamParameter`                                                                                                                |
| `GET /users`                                           | Tenant users, filtered by the caller's branch and team scope                                                                                           |
| `POST /support-elevation`, `DELETE /support-elevation` | Requires `platform.support_elevation.manage`, a reason, and audits both directions                                                                     |

All responses keep the Phase 0 error envelope. Generic 5xx responses become `INTERNAL_ERROR`;
provider outages retain only a sanitized retryable `PROVIDER_UNAVAILABLE` envelope.

## Important files

- Guard and policy: `apps/api/src/authorization/authentication.guard.ts`,
  `authorization-policy.ts`, `authorization.decorators.ts`
- Auth core: `apps/api/src/auth/authentication.service.ts`, `drizzle-auth.store.ts`,
  `access-token.service.ts`, `opaque-token.ts`, `password-hasher.ts`, `refresh-cookie.ts`
- Google API: `google-auth.controller.ts`, `google-authentication.service.ts`,
  `google-identity-provider.adapter.ts`
- Contracts: `packages/contracts/src/auth/`
- Schema/migration/test harness: `packages/database/src/schema/`,
  `packages/database/migrations/0003_mighty_wonder_man.sql`, `packages/database/src/testing.ts`
- Web: `apps/web/src/features/auth/`, `apps/web/src/app/(app)/profile/authentication/`
- Mobile: `apps/mobile/src/auth/`, `apps/mobile/src/api/auth-transport.ts`,
  `apps/mobile/app.config.ts`, `apps/mobile/eas.json`
- Operator guide: `docs/implementation/GOOGLE_AUTH_SETUP.md`

## Environment variables

Fifteen new `AUTH_*` variables are validated in `packages/config/src/auth.ts` and all fifteen are
present in `.env.example`:

`AUTH_ACCESS_TOKEN_SECRET`, `AUTH_ACCESS_TOKEN_TTL_SECONDS`, `AUTH_AUDIENCE`, `AUTH_ISSUER`,
`AUTH_LOGIN_LOCKOUT_SECONDS`, `AUTH_LOGIN_MAX_ATTEMPTS`, `AUTH_PASSWORD_PEPPER`,
`AUTH_PASSWORD_RESET_TOKEN_TTL_SECONDS`, `AUTH_REFRESH_COOKIE_DOMAIN`, `AUTH_REFRESH_COOKIE_NAME`,
`AUTH_REFRESH_COOKIE_SAME_SITE`, `AUTH_REFRESH_COOKIE_SECURE`, `AUTH_REFRESH_TOKEN_PEPPER`,
`AUTH_REFRESH_TOKEN_TTL_SECONDS`, `AUTH_SUPPORT_ELEVATION_TTL_SECONDS`.

`SEED_DEVELOPMENT_PASSWORD` optionally overrides the development seed password. There is no
`AUTH_MFA_*` variable because MFA is not implemented (KNOWN_ISSUES.md, ADR-0015).

`AUTH_ACCESS_TOKEN_SECRET`, `AUTH_PASSWORD_PEPPER` and `AUTH_REFRESH_TOKEN_PEPPER` are backend-only
secrets. They belong in Render or a private uncommitted `.env` and must never reach Cloudflare, a
`NEXT_PUBLIC_`/`EXPO_PUBLIC_` variable, a bundle, a fixture or a log. Rotating the peppers
invalidates every stored password digest and refresh token.

Google amendment variables:

- `GOOGLE_AUTH_WEB_CLIENT_ID` — sole NestJS Google ID-token audience; required in staging and
  production.
- `GOOGLE_AUTH_CHALLENGE_TTL_SECONDS` — 60-600 seconds, default 300.
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — browser GIS identifier; must equal the API Web ID.
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` — native requested server audience; must equal the target API
  Web ID.
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` — iOS app registration/reversed scheme only; never an API
  audience.

No Android client-ID variable or Google client secret is consumed. Android is registered in Google
Cloud using `in.godigitalmarketing.automobilecrm` plus each real signing SHA. EAS development,
preview and production environments must carry their matching public API/client identifiers.

## Verified commands and results

Run from the repository root on 2026-08-03 (Node.js 24.18.1, pnpm 11.18.0):

- `pnpm install --frozen-lockfile` — pass
- `pnpm format:check` — pass
- `pnpm db:check` — pass
- `pnpm lint` — pass, 8 tasks
- `pnpm type-check` — pass, 13 tasks
- `pnpm test` — pass, 256 tests / 13 tasks (API 56 unit + 21 integration, web 58, mobile
  70, config 24, contracts 13, database 12, design tokens 2)
- `pnpm test:integration` — pass, 34 tests / 7 tasks (21 API/real-store, 13 migration/isolation)
- Focused authentication/Google command — pass, 40 tests across provider, service, HTTP, linking
  and migrated-store behavior
- Focused authorization/tenant command — pass, 18 policy, guard and HTTP scope tests
- `pnpm --filter @gdm/mobile exec expo install --check` — pass; dependencies up to date
- `pnpm build` — pass, 8 tasks including Next.js, NestJS, Android 4.6 MB and iOS 4.4 MB exports
- `pnpm build:web:cloudflare` — **environment failure** after successful Next compile/type/static
  generation; OpenNext cannot create a required Windows symlink (`EPERM`). Re-run under Linux/WSL.
- Hosted Ubuntu CI and Docker Engine — not run; workflow configuration and required public-ID
  wiring are repository-tested, but external execution evidence is still required.

## Seed accounts and data

`pnpm db:seed` refuses to run when `NODE_ENV=production`. It creates one agency, two client
organizations, branches, teams and one user per canonical role:

`agency.admin@`, `client.admin@`, `manager@`, `sales.manager@`, `telecaller@`, `salesperson@`,
`test.ride@`, `inventory@`, `billing@`, `delivery@`, `registration@` and `client.admin.beta@`, all
at `seed.godigital.test`. The shared development password is `GoDigital-Dev-Only-2026!` unless
`SEED_DEVELOPMENT_PASSWORD` is set. These are development-only credentials and must never exist in
a hosted environment.

## Known limitations and deferred work

- MFA contract schemas are published but nothing implements them (High — see KNOWN_ISSUES.md).
- Password reset issues tokens but cannot deliver them.
- `AuthorizationPolicy.canAccessResource` is unit-tested but has no production caller yet.
- OpenNext packaging needs a Linux/WSL or symlink-enabled Windows runner; hosted staging smoke is
  still unverified.
- Real Android signing SHA registration, the iOS client ID, signed-device Google login and live
  token verification remain release prerequisites.
- External-auth challenges have an expiry/consumption index but no retention job because a
  retention policy has not been approved.

## Exact prerequisites for Phase 2

Phase 2 is governed by `PROMPTS/02_ORGANIZATION_ADMIN.md`, the PRD and `AGENTS.md`.

1. Run the existing Ubuntu CI workflow (or `pnpm build:web:cloudflare` and `pnpm preview:web` on an
   equivalent Linux host) and record successful OpenNext package/preview and Docker build results.
2. Register the real Web origins, Android package/signing SHAs and iOS bundle client. Configure
   matching development/production API and EAS environments, then verify invited login, controlled
   linking, unlink/session revocation and blocked-account behavior with real Google tokens on signed
   web/Android/iOS builds.
3. Decide the MFA question explicitly — complete it in a named phase or remove the services, specs
   and contract schemas. Do not leave a published contract that no route can satisfy.
4. Reuse the existing authorization primitives. New protected routes must carry
   `@RequirePermissions`; the guard denies any protected route without a policy. Derive
   `client_organization_id` from `AuthorizationContext`, never from request input.
5. Add permission codes to `packages/contracts/src/auth/authorization.ts` and the
   `role_permission_mappings` seed together, and extend the integration suite that asserts
   least-privilege mappings.
6. Add a new Drizzle migration. Do not edit `0000` through `0003`. Every new client-owned table
   needs `client_organization_id NOT NULL` with a foreign key.
7. Keep `WORKER_MODE=disabled` unless Phase 2 adds an approved idempotent processor.
8. Before declaring Phase 2 complete, run the full gate list above — including
   `pnpm build:web:cloudflare` — and update all four tracking documents with real numbers.
