# MY WORK — Phase 1 Strict Completion Audit (handoff notes)

> Temporary working file. The audit is **finished**. Read this for context, then delete the file.
> Created and completed 2026-08-02.

## What happened

Ran `PROMPTS/99_PHASE_COMPLETION_AUDIT.md` against Phase 1 (`PROMPTS/01_AUTH_TENANCY.md`),
implemented by commit `f702bed`.

The Phase 1 commit **had not passed its own completion protocol**. On a clean checkout, five
mandatory gates and both affected production builds failed. All of it was fixed in-phase and every
gate is now green. Nothing from Phase 2 was started.

## Gate results

| Check                            | Before   | After                            |
| -------------------------------- | -------- | -------------------------------- |
| `pnpm install --frozen-lockfile` | Pass     | Pass                             |
| `pnpm format:check`              | **Fail** | Pass                             |
| `pnpm db:check`                  | Pass     | Pass                             |
| `pnpm lint`                      | **Fail** | Pass (8 tasks)                   |
| `pnpm type-check`                | **Fail** | Pass (13 tasks)                  |
| `pnpm test`                      | **Fail** | Pass (187 tests / 13 tasks)      |
| `pnpm test:integration`          | **Fail** | Pass (26 tests / 7 tasks)        |
| `pnpm build`                     | **Fail** | Pass (8 tasks)                   |
| `pnpm build:web:cloudflare`      | **Fail** | **Still unverified** — see below |

## The two structural defects (worth understanding)

1. **Duplicate React → broken mobile tests and Android build.**
   `react-native-worklets@0.10.1` requires `@babel/traverse` without declaring it, so pnpm's
   isolated `node_modules` could not resolve it once Phase 1 made mobile import `@gdm/contracts`
   (Babel then transforms files outside `apps/mobile`). Fixing that exposed a second problem: web
   pinned React 19.2.8 and mobile 19.2.3, producing two `react-native` instances and intermittent
   "Invalid hook call" failures. Fixed with a root `@babel/traverse` devDependency plus aligning
   mobile on React 19.2.8. **A pnpm `packageExtensions` entry was tried first and made things
   worse** — it re-hashes the worklets package and flips which `react-native` gets linked. Recorded
   as ADR-0013.

2. **Login never emitted `status: 'AUTHENTICATED'`.**
   The shared contract models the login response as a discriminated union on `status`, but the API
   never set it. Both auth e2e tests failed with a Zod error, and
   `Omit<LoginResponse, 'requires_membership_selection'>` collapsed the union, breaking the API's
   own type-check in four places. Recorded as ADR-0014.

## Still open — read before Phase 2

- **`pnpm build:web:cloudflare` is unverified.** It fails with `EPERM` on `rm apps/web/.open-next`
  because a `next dev --port 3000` server (plus its `workerd` child) holds the directory. I did not
  kill your dev server. Stop it, delete `apps/web/.open-next`, and re-run. `next build` for
  `@gdm/web` passes, so only the OpenNext packaging step is unproved.
- **MFA is published-but-nonexistent (High).** `packages/contracts` exports MFA login, enrollment
  and verification schemas. There is no MFA route, no MFA table, no `AUTH_MFA_*` config, no module
  registration for `TotpService`/`MfaSecretProtector`, and no client handling. It is out of Phase 1
  scope and it is what broke the login typing. Decide: finish it in a named phase, or delete the
  services, their specs and the contract schemas. ADR-0015.
- Password reset issues tokens but `UnavailablePasswordResetDelivery` never sends them.
- `AuthorizationPolicy.canAccessResource` is unit-tested but has no production caller yet.

## Files I changed

Code: `apps/api/src/auth/{authentication.service,auth.dto,drizzle-auth.store,totp.service,
mfa-secret-protector,authentication-rate-limiter}.ts`,
`apps/api/test/{auth.e2e-spec,authentication.guard.spec,api-exception.filter.spec}.ts`,
`apps/mobile/src/auth/auth-response.ts`, `packages/database/src/migration.integration.test.ts`.

Dependencies: root `package.json` (`@babel/traverse`), `apps/mobile/package.json` (React 19.2.8),
`pnpm-lock.yaml`.

Docs: all four of `docs/implementation/{PHASE_STATUS,DECISIONS,KNOWN_ISSUES,NEXT_PHASE_HANDOFF}.md`
(they still described Phase 0 — the Phase 1 commit never updated them).

Nothing is committed. `git status` shows the working tree; review and commit when you are ready.

## Then

Delete this file.
