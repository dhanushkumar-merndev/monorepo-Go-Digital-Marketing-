# Before Production

Action items discovered while diagnosing the MFA verification failure of 2026-08-10. Each entry
records what was verified, not what was assumed. Items marked **Blocking** must be closed before the
API is promoted; the remainder are corrections and hygiene that should land in the same window.

Related: `KNOWN_ISSUES.md` for external release gates, `DEPLOYMENT.md` for promotion steps,
`LOCAL_DEVELOPMENT.md` for workstation setup.

## Database of record: hosted Supabase, not a local container

The workspace runs against a **hosted Supabase instance**, supplied through `DATABASE_URL`:

| Property           | Verified value                         |
| ------------------ | -------------------------------------- |
| Host               | `aws-1-ap-south-1.pooler.supabase.com` |
| Port               | `5432` (pooler)                        |
| `TimeZone`         | `UTC`                                  |
| Applied migrations | 36 of 36 files on disk                 |

This contradicts `LOCAL_DEVELOPMENT.md`, which documents PostgreSQL on `localhost:54322` via Docker
Compose and describes it as "Supabase-compatible local database behavior". No local container is in
use. Three consequences:

- Development queries cross the public network. A round trip of roughly 270 ms was measured, so
  local timings are not representative of production latency and must not be used as a baseline for
  the pending load and soak tests.
- `KNOWN_ISSUES.md` states that "no shared database was authorized" for the hosted Supabase
  migration, PITR and isolated-restore gate. Development is now pointed at a hosted instance, so
  that row needs re-checking against reality: confirm whether this instance is authorized, whether
  it is shared with anything else, and whether it is the same project intended for staging.
- Destructive local workflows (reseeding, `drizzle` push, fresh-database scripts) now act on a
  hosted database. Confirm the seed and reset paths cannot be pointed at a production project by
  accident before those scripts are used again.

**Action:** reconcile `LOCAL_DEVELOPMENT.md` with the hosted-Supabase reality, and state explicitly
which Supabase project backs development, staging and production.

## Blocking: timestamps are written from two different clocks

`mfa_login_challenges.created_at` defaulted to the database clock via `defaultNow()`, while
`expires_at` and `consumed_at` were supplied by the API from `new Date()`. The table's check
constraint compares those columns directly:

```sql
mfa_login_challenges_consumed_check:  consumed_at IS NULL OR consumed_at >= created_at
```

With the API clock behind the database clock, `consumed_at` lands before `created_at`, PostgreSQL
raises `23514`, and MFA verification fails as an opaque HTTP 500. This was reproduced repeatedly on
`POST /v1/auth/mfa/verify`.

Six constraints in `packages/database/src/schema/authentication.ts` share this cross-clock shape:

| Constraint                                | Comparison                                        | Skew tolerance |
| ----------------------------------------- | ------------------------------------------------- | -------------- |
| `mfa_login_challenges_consumed_check`     | `consumed_at` (API) ≥ `created_at` (DB)           | none           |
| `external_auth_challenges_consumed_check` | `consumed_at` (API) ≥ `created_at` (DB)           | none           |
| `mfa_login_challenges_expiry_check`       | `expires_at` (API) vs `created_at` (DB), ≤ 10 min | challenge TTL  |
| `external_auth_challenges_expiry_check`   | `expires_at` (API) > `created_at` (DB)            | challenge TTL  |
| `refresh_sessions_expiry_check`           | `expires_at` (API) > `created_at` (DB)            | refresh TTL    |
| `support_elevations_expiry_check`         | `expires_at` (API) vs `created_at` (DB), ≤ 60 min | 60 min         |

The two `consumed_at` constraints tolerate no skew at all and are the acute risk. The expiry
constraints are wide enough to survive ordinary drift but fail once skew approaches the relevant
TTL, which for MFA challenges is five minutes.

### Current state

A partial fix is applied: `CreateMfaLoginChallengeInput` now carries `createdAt`, and
`createMfaLoginChallenge` writes it explicitly from the API clock. This unblocks MFA verification
and passes the suite, but it is **not the intended production shape** and should not ship as-is:

- It moves `created_at` off the NTP-synced Supabase clock and onto the API host's clock, so a
  drifting host now writes incorrect timestamps into the audit trail rather than merely failing.
- It is only correct at one API instance. If the web service scales, a challenge issued by one
  instance and consumed by another reintroduces the identical failure as instance-to-instance skew.
- It leaves `mfa_login_challenges.created_at` on a different clock basis from every other table's
  `created_at`, which still defaults to `now()`, making cross-table audit ordering inconsistent.

### Required change

Put every side of these comparisons on the database clock, which is the single authoritative,
NTP-synced source and plainly what the constraints were written to assume:

- `created_at` — restore the `defaultNow()` default.
- `expires_at` — derive in SQL, for example `now() + interval '5 minutes'`, rather than a JS `Date`.
- `consumed_at` — write as ``sql`now()` `` rather than an API-supplied timestamp.

Apply to `mfa_login_challenges` and `external_auth_challenges` together; they share the pattern and
Google sign-in is exposed to the same failure on challenge consumption. `refresh_sessions` and
`support_elevations` should follow for consistency even though their windows make failure unlikely.

`acceptedTimeStep` must **stay** on the API clock: it is derived from TOTP and has to agree with the
user's authenticator device, not the database.

## Blocking: API host clock must be NTP-synced

TOTP verification compares a time step computed from the API host's clock against the code shown on
the user's phone. No database change can fix this, because the phone is the other party.

The workstation used for this investigation measured **36 seconds behind** the Supabase clock. The
configured verification window is ±1 step (±30 s), so that drift was already outside tolerance and
was only absorbed because the window rounds in the user's favour. Beyond roughly 60 seconds, MFA
stops working entirely with no diagnostic beyond a rejected code.

The same clock governs `jose` validation of Google ID tokens, which applies zero clock tolerance by
default, so drift consumes the margin on `exp` and `iat` directly.

**Action:** confirm NTP sync is enforced on every environment that runs the API, and add a clock-skew
check to the readiness probe or deployment checklist so drift is detected before it reaches users.
On Windows workstations, `w32tm /resync /force`.

## Non-blocking corrections

| Item                                            | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                | Status            |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `otpauth://` URI encodes spaces inconsistently  | `TotpService.createUri` builds the label with `encodeURIComponent` (`%20`) but the query with `URLSearchParams` (`+`). Since `otpauth` query strings are not form-encoded, `+` is a literal plus, so the label prefix and `issuer` parameter disagree. The Key URI spec requires them to be equal. With `AUTH_MFA_ISSUER` set to `Go Digital Automobile CRM`, this fires on every enrollment. Fix: `.replace(/\+/gu, '%20')` on the serialised query. | Open              |
| Production web build cannot complete            | `next build` compiles successfully, then fails prerendering `/_not-found` because `parseWebEnvironment` requires `NEXT_PUBLIC_GOOGLE_CLIENT_ID` for staging and production builds.                                                                                                                                                                                                                                                                    | Open, environment |
| `reports-integrations` integration test failing | CSV formula-neutralisation assertion expects `'=FORMULA_ACTION` and receives an empty string. Pre-existing and unrelated to the MFA work; the suite otherwise sits at 58 of 59.                                                                                                                                                                                                                                                                       | Open              |
| Database error context now logged               | `ApiExceptionFilter` records `db_code`, `db_constraint`, `db_table`, `db_column`, `db_routine`, `db_message` and a truncated `db_query` for failures carrying a driver cause. Bound parameters and the driver's `detail` field are deliberately excluded because both echo row values, and these tables hold token hashes and MFA secrets. Retain this: without it, every 5xx reports only `DrizzleQueryError`.                                       | Applied           |

## Verification baseline

Record results against these numbers when closing the items above.

| Check                                         | Baseline                                                   |
| --------------------------------------------- | ---------------------------------------------------------- |
| `pnpm --filter @gdm/api run type-check`       | clean                                                      |
| `pnpm --filter @gdm/api run test:unit`        | 76 passed, 0 failed                                        |
| `pnpm --filter @gdm/api run test:integration` | 58 passed, 1 failed (`reports-integrations`, pre-existing) |
| `pnpm --filter @gdm/web run type-check`       | clean                                                      |
| `pnpm --filter @gdm/web run test`             | 84 passed, 20 files                                        |
