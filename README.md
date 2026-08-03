# Go Digital Automobile CRM

Production foundation for the Go Digital Automobile CRM: a pnpm/Turborepo monorepo with a
Next.js office dashboard, NestJS API, Expo Android/iOS application, shared contracts and design
tokens, and a portable PostgreSQL/Redis/S3 infrastructure boundary.

Phase 1 provides invitation-only email/password and Google authentication, rotating CRM sessions,
tenant selection, and default-deny authorization. Dealership workflows such as leads, inventory,
bookings, delivery, registration, and post-sale remain deferred to later approved phases.

## Quick start

Prerequisites: Node.js 24 LTS, pnpm 11.18.0, and Docker with Compose for local backing services.

```bash
corepack enable
corepack prepare pnpm@11.18.0 --activate
cp .env.example .env
pnpm install
pnpm services:up
pnpm db:migrate
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
