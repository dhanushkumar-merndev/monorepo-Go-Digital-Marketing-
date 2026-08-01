# PHASE 0 — MONOREPO AND ARCHITECTURE FOUNDATION

## Starting condition

The repository may be empty. Only these files are guaranteed to exist:

1. `Go_Digital_Automobile_CRM_10_on_10_Final_Technical_PRD_v4_0.docx`
2. `AGENTS.md`

Read them first. If the following files do not exist, create them during this phase:

- `docs/implementation/PHASE_STATUS.md`
- `docs/implementation/DECISIONS.md`
- `docs/implementation/KNOWN_ISSUES.md`
- `docs/implementation/NEXT_PHASE_HANDOFF.md`

Inspect and preserve any useful existing repository files, but do not assume business modules already exist.

## Objective

Create the production-ready project foundation without implementing dealership business workflows.

## Required work

Create and configure:

- pnpm workspace
- Turborepo
- Root private `package.json`
- One root `pnpm-lock.yaml`
- Next.js web application in `apps/web`
- NestJS API application in `apps/api`
- React Native Expo prebuild mobile application in `apps/mobile`
- Shared contracts package
- Database package
- Shared configuration package
- Web UI package where appropriate
- Shared ESLint and TypeScript configurations

Configure:

- TypeScript strict mode
- ESLint and formatting
- Environment validation with Zod
- Dockerfile for NestJS
- Local development support configuration where practical
- Supabase PostgreSQL connection
- Drizzle configuration and migration workflow
- Redis and BullMQ connection abstraction
- Tigris S3-compatible storage abstraction
- Pino logging
- Correlation/request IDs
- Global NestJS validation
- Standard API error envelope
- OpenAPI setup
- Health, readiness and liveness endpoints
- Sentry-ready error boundaries/interfaces
- Root scripts for install, dev, lint, type-check, test and build
- CI pipeline for lint, type-check, tests and builds

Set up shadcn/ui for the web application.

Create shared design tokens for:

- Colour
- Typography
- Radius
- Spacing
- Shadows
- Semantic statuses

Mobile must consume equivalent token values without importing web components.

## Initial database foundation

Create only platform-level structures required by later phases:

- Migration metadata
- Outbox events
- Webhook-event base structure
- Audit-event base structure
- Application settings only when genuinely required

Do not implement complete users, leads, bookings, inventory or other dealership workflows.

## Required outputs

- Working local setup
- Environment example files
- Repository architecture documentation
- Database migration workflow
- Basic web shell
- Basic API health endpoints
- Basic mobile shell
- Verified root commands
- The four implementation tracking documents

## Acceptance criteria

- A fresh clone can be installed using documented root commands.
- Web, API and mobile applications start independently.
- API health/readiness reports database and Redis state accurately.
- API uses a consistent error format.
- OpenAPI documentation loads.
- Web uses shadcn/ui and no competing UI framework.
- Root lint, type-check, test and affected production build commands pass.
- No dealership workflow is prematurely implemented.
- `NEXT_PHASE_HANDOFF.md` contains actual Phase 0 details and Phase 1 prerequisites.
