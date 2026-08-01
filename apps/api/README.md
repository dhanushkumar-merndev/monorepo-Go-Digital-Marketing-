# API application

NestJS modular-monolith foundation for the Go Digital Automobile CRM. Phase 0
contains platform infrastructure only; it intentionally has no authentication,
tenancy or dealership workflow endpoints.

## Routes

- `GET /v1/health` checks PostgreSQL and Redis and returns `503` when either is unavailable.
- `GET /v1/health/live` reports process liveness without checking dependencies.
- `GET /v1/health/ready` checks PostgreSQL and Redis readiness.
- `/docs` serves Swagger UI and `/docs-json` serves the OpenAPI document.

Run from the repository root:

```sh
pnpm install
pnpm services:up
pnpm --filter @gdm/api dev
```

The API validates its environment through `@gdm/config`. PostgreSQL access is
created through `@gdm/database`; Redis/BullMQ and private S3-compatible storage
remain behind injectable ports. The Tigris adapter uses the standard AWS SDK S3
interface so a later S3 migration does not change application contracts.

The Dockerfile uses the repository root as its build context:

```sh
docker build -f apps/api/Dockerfile -t gdm-api .
```
