# Go Digital Automobile CRM

Production foundation for the Go Digital Automobile CRM: a pnpm/Turborepo monorepo with a
Next.js office dashboard, NestJS API, Expo Android/iOS application, shared contracts and design
tokens, and a portable PostgreSQL/Redis/S3 infrastructure boundary.

Phases 1-4 provide invitation-only authentication, rotating CRM sessions, tenant administration,
the lead-management foundation, and provider-neutral calling. Leads include public/manual capture,
tenant-scoped contact deduplication, assignment, lifecycle history, follow-ups/tasks, SLA escalation,
web operations and an offline-aware salesperson mobile flow. Calling adds canonical Lead/Contact call
history, outcome requirements, idempotent provider webhooks, reconciliation and private,
consent-aware recording references. Inventory, booking, delivery, registration and post-sale remain
deferred to their approved phases.

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
