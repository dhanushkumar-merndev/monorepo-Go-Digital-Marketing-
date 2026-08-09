# Go Digital Automobile CRM

Production foundation for the Go Digital Automobile CRM: a pnpm/Turborepo monorepo with a
Next.js office dashboard, NestJS API, Expo Android/iOS application, shared contracts and design
tokens, and a portable PostgreSQL/Redis/S3 infrastructure boundary.

Phases 1-4 provide invitation-only authentication, rotating CRM sessions, tenant administration,
the lead-management foundation, and provider-neutral calling. Leads include public/manual capture,
tenant-scoped contact deduplication, assignment, lifecycle history, follow-ups/tasks, SLA escalation,
web operations and an offline-aware salesperson mobile flow. Calling adds canonical Lead/Contact call
history, outcome requirements, idempotent provider webhooks, reconciliation and private,
consent-aware recording references. Phases 7-11 add canonical physical inventory, commercial
booking/payment/document readiness, delivery operations, registration/RC, Customer Vehicles and
post-sale reminders. Phases 12-14 add scoped reports/exports, audited provider-readiness and
human-reviewed AI proposals, plus production release controls. The repository is a runnable local
prototype; hosted provider, restore, signing, load/soak and dealership-pilot evidence remains
deliberately gated.

Phase 2 is the canonical organization source: Client → Branch/Showroom → Department → Team, with
effective-dated team membership, Team Manager assignment and configurable reporting lines. CRM
Admin uses the tenant-only `CLIENT_ADMIN` profile; Sales Consultant retains the stable
`SALESPERSON` code plus a display job title. Phase 3 derives assignment eligibility and manager
visibility from those live relationships.

## Quick start

Prerequisites: Node.js 24 LTS, pnpm 11.18.0, and Docker with Compose for local backing services.

```bash
corepack enable
corepack prepare pnpm@11.18.0 --activate
cp .env.example .env
pnpm install
pnpm services:up
pnpm db:migrate
pnpm db:seed
```

Start each application independently in a separate terminal:

```bash
pnpm dev:web
pnpm dev:api
pnpm dev:mobile
```

Run all workspace development processes with `pnpm dev`. To exercise a dedicated BullMQ worker,
run `pnpm dev:worker` in a separate terminal with PostgreSQL and Redis available.

- Web: `http://localhost:3000`
- API: `http://localhost:4000/v1/health`
- OpenAPI: `http://localhost:4000/docs`
- MinIO development console: `http://localhost:9001`

Google authentication uses a native module and therefore requires an Expo development build, not
Expo Go. For an Android emulator, set
`EXPO_PUBLIC_API_URL=http://10.0.2.2:4000/v1` because Android does not map its own `localhost` to
the host computer.

## Quality commands

```bash
pnpm format:check
pnpm lint
pnpm type-check
pnpm test
pnpm test:integration
pnpm build
pnpm build:web:cloudflare
pnpm security:audit:release
```

Deployment entry points are also run from the root:

```bash
pnpm preview:web
pnpm deploy:web
pnpm start:api
pnpm start:worker
```

The Cloudflare deployment command changes external state and requires an authenticated,
authorized Wrangler session. The production start commands require a prior `pnpm build`.

Database commands are run from the repository root:

```bash
pnpm db:generate
pnpm db:check
pnpm db:migrate
pnpm db:studio
```

See [local development](docs/implementation/LOCAL_DEVELOPMENT.md),
[architecture](docs/ARCHITECTURE.md), and the
[migration workflow](docs/implementation/DATABASE_MIGRATIONS.md) for the complete setup. The
[deployment guide](docs/implementation/DEPLOYMENT.md) covers Cloudflare/OpenNext, Render,
Supabase, Upstash, Tigris/R2 and all BullMQ worker modes.
The [Google authentication setup](docs/implementation/GOOGLE_AUTH_SETUP.md) lists the exact web,
Android, and iOS OAuth client configuration.

Agency Admin accounts require TOTP MFA before a refresh session is created. First login performs
encrypted enrollment and displays one-time recovery codes; subsequent logins accept a replay-safe
TOTP or single-use recovery code. Configure independent `AUTH_MFA_*` secrets from `.env.example`.
Release operation and evidence are defined in the
[production release runbook](docs/implementation/runbooks/PRODUCTION_RELEASE.md) and
[release evidence template](docs/implementation/RELEASE_EVIDENCE_TEMPLATE.md).

The development seed enables `LEADS`, creates the `PUNE-INBOUND` round-robin queue and publishes
form key `alpha-pune-website`. Public capture is
`POST /v1/public/lead-forms/alpha-pune-website` and requires an `Idempotency-Key`, affirmative
lead-response consent, the active notice version, an Indian mobile number and originating page URL.
Set `LEAD_PHONE_LOOKUP_PEPPER` to an independent backend-only secret before using non-development
data; changing it requires a controlled phone-hash backfill.

When upgrading an existing Phase 3 database, review the forward-only recovery migrations
`0009_mean_domino.sql` through `0011_yielding_barracuda.sql` before `pnpm db:migrate`. After staging
apply, rename `RECOVERY_DEFAULT` Departments and confirm team memberships inferred from explicit
selected team scopes. See [Database migration workflow](docs/implementation/DATABASE_MIGRATIONS.md).

Phase 4 adds only the HMAC-signed development telephony adapter. Its seed connection key is
`seed-alpha-development-telephony`; it is not a live calling provider and does not create real calls
or recordings. Configure backend-only `TELEPHONY_DEVELOPMENT_WEBHOOK_SECRET` (32+ characters),
`TELEPHONY_RECORDING_URL_TTL_SECONDS` (30-900, default 300), and
`TELEPHONY_MANUAL_RECORDING_MAX_BYTES` (1 MiB-100 MiB, default 25 MiB), and
`TELEPHONY_WEBHOOK_RAW_RETENTION_HOURS` (1-720, default 168) from `.env.example`. Manual recordings
are private, consent-gated uploads with explicit provider/manual provenance; their binary is never
stored in PostgreSQL. Do not add Android call-log, SMS, contacts or accessibility permissions. `tel:`
fallback opens the native dialer only; it is not duration, answer-state or recording evidence.

Phase 5 adds a provider-neutral unified inbox and an official WhatsApp Cloud API boundary. The Alpha
development seed exposes the signed development connection key
`development-messaging-20000000-0000-4000-8000-000000000001`; it never connects to personal
WhatsApp, WhatsApp Web, or QR automation. Configure the backend-only `MESSAGING_*` values in
`.env.example`. A 32-byte base64 `MESSAGING_CREDENTIAL_ENCRYPTION_KEY` is mandatory before saving
live Cloud API credentials; the API stores only AES-256-GCM ciphertext and metadata. Provider
activation still requires an approved tenant WABA, phone-number ID, token, app secret, verify token,
template review, consent/retention policy, and webhook URL. Media objects remain private and use
short-lived signed URLs plus the `MESSAGING_MEDIA_RETENTION_DAYS` retention placeholder. Phase 5
enables official WhatsApp only; SMS/email and Instagram Direct/Facebook Messenger are deferred and
must extend the same canonical Unified Inbox rather than create separate inbox products. Web and
mobile use separate, non-persisted Zustand inbox stores for transient composer/panel workflow only;
API/TanStack Query remains server truth and the inbox stores reset when authentication or tenant
context changes. Mobile text/template sends use the tenant-bound SQLite outbox when offline; media
upload requires connectivity.

Phase 6 adds test-ride scheduling, confirmation, assignment, execution, lifecycle evidence and
active-job location tracking. Configure the backend-only `TEST_RIDE_*` values in `.env.example`;
`TEST_RIDE_OTP_PEPPER` must be an independent 32+ character secret in staging and production. The
Android client requests only foreground/while-in-use location and starts its location foreground
service after the assigned executive acknowledges the disclosure and explicitly starts the ride.
It does not request background-location permission. The ongoing notification remains visible while
tracking, and local location samples expire from SQLite if they cannot be replayed. Terminal mobile
commands use stable idempotency keys and the server command-receipt transaction for exactly-once
replay. The development seed enables `TEST_RIDES` only for Alpha and includes one assigned ride for
`test.ride@seed.godigital.test`; the development adapter never represents employee off-duty
tracking. A physical Android-device foreground-service/permission validation remains required
before release distribution.

Phase 7 adds the tenant-owned vehicle catalogue and physical stock authority at `/v1/inventory`.
VIN/chassis/engine identities are normalized and unique inside a tenant, list responses mask them
unless the role has sensitive-stock access, and branch scope is checked in the backend. Reservation,
allocation, VIN reallocation and transfer commands require an `Idempotency-Key`, expected unit
version and reason/evidence. PostgreSQL row locks plus partial unique indexes prevent concurrent
double allocation; transfer and status history are append-only, and a delivered unit cannot return
to available through an ordinary edit. Existing Phase 6 demo references remain historical snapshots
and are linked additively to a matching canonical unit. Alpha seed enables `INVENTORY` and maps
`DEMO-EV-ZX-01` to its deterministic demo unit. Phase 7 introduces no provider credential or public
client environment variable; reservation expiry is supplied by the validated command and released
by the safe 60-second API monitor or the authorized idempotent reconciliation route.

Phase 8 adds the commercial authority at `/v1/commercial` and the office workspace at `/bookings`.
Quotations retain immutable versions and price components, tenant-configured thresholds control
discount approval, and bookings snapshot the exact approved quotation version. Payment rows are
append-only evidence: uploads and pending entries never count as paid, verification is separately
permissioned, overpayment is rejected, and corrections use linked reversals. Finance approval and
disbursement are separate milestones. Delivery readiness is computed from canonical booking,
allocation, verified payment, finance, invoice, insurance, customer-confirmation and approved
document records. Commercial objects use integer minor currency units and tenant/branch composite
foreign keys. Private document upload/download uses the existing S3-compatible adapter and signed
URLs; the default malware-scanner adapter fails closed, so approval remains blocked with
`PENDING_EXTERNAL_SCAN` until a reviewed production scanner is configured. Alpha development seed
enables `BOOKING_BILLING` and includes one partial-payment finance booking for UI/API validation.

Phase 9 adds tenant-owned delivery authority at `/v1/delivery`, the manager workspace at
`/deliveries` and an assigned Delivery Executive mobile workspace. A delivery consumes the exact
confirmed booking and active physical allocation, keeps preparation/proof state separate from the
Lead pipeline, and performs a fresh Phase 8 readiness evaluation before Start. Active-job location
requires explicit disclosure, uses a visible foreground notification and stops on every terminal or
exception path; tenant-bound SQLite replays terminal commands with stable idempotency keys. Private
photo/signature proof reuses signed S3-compatible storage and fails closed without a clean scanner;
received-by evidence is the seeded default. Completion atomically marks the job, allocation and unit
Delivered while remaining independent from permanent RC status. Set an independent backend-only
`DELIVERY_OTP_PEPPER` in hosted environments; OTP delivery remains visibly unavailable until a
reviewed provider is bound.

Phase 10 adds registration/RTO/RC authority at `/v1/registration-cases`, customer-owned vehicles at
`/v1/customer-vehicles`, and office workspaces at `/registrations` and `/customer-vehicles`.
Registration may begin before delivery and advances on its own append-only timeline. RTO submission,
number allotment, RC receipt, verified private RC delivery, closure and reasoned reopening are
server-authoritative idempotent commands. Corrections append a linked event instead of rewriting
history. Customer Vehicles reuse the canonical Contact and delivered booking/unit or carry the
explicit `EXTERNAL` ownership source; tenant booking, VIN and registration uniqueness prevent
duplicates. Private RC copies reuse signed S3-compatible storage, metadata/checksum validation and
audited access, and remain unverified while the fail-closed scanner is unavailable.

Phase 11 adds post-sale reminder authority at `/v1/reminders` and the office workspace at
`/reminders`. Fixed tenant/model rules schedule independent service, insurance, PUC, warranty, AMC,
roadside-assistance, RC, appointment, exchange and upgrade reminders by date or kilometre threshold.
Unique materialization keys make duplicate workers harmless; vehicle/rule version changes cancel
superseded scheduled instances and append a new schedule. Operational rules require Utility
templates, promotional rules require Marketing templates, and every due send rechecks current
preference, consent and suppression before committing durable dispatch work. BullMQ accelerates the
provider-neutral messaging outbox; PostgreSQL remains recoverable truth. Feedback, complaints and
escalations append to Customer Activity without rewriting Lead history.

## Repository layout

```text
apps/
  api/                  NestJS REST API and infrastructure adapters
  mobile/               Expo Router Android/iOS application
  web/                  Next.js App Router office shell
packages/
  config/               environment validation and secret/public boundaries
  contracts/            shared Zod API contracts
  database/             Drizzle schema, migrations and connection utilities
  design-tokens/        cross-platform semantic values
  eslint-config/        shared flat ESLint configurations
  typescript-config/    shared strict TypeScript configurations
  ui/                   project-owned web-only shadcn components
docs/implementation/    phase evidence, decisions, issues and handoff
infrastructure/local/   PostgreSQL, Redis and S3-compatible local services
```

Use pnpm only from the root. Do not create per-app lockfiles or import `@gdm/ui` into mobile.
Dependency lifecycle scripts are governed by the reviewed `allowBuilds` policy in
`pnpm-workspace.yaml`; do not bypass it to install a package.
