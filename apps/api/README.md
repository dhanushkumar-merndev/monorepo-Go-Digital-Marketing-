# API application

NestJS modular-monolith API for the Go Digital Automobile CRM. It owns authentication, tenancy,
authorization and the implemented dealership workflows through Phase 10.

## Routes

- `GET /v1/health` checks PostgreSQL and Redis and returns `503` when either is unavailable.
- `GET /v1/health/live` reports process liveness without checking dependencies.
- `GET /v1/health/ready` checks PostgreSQL and Redis readiness.
- `/docs` serves Swagger UI and `/docs-json` serves the OpenAPI document.
- `/v1/commercial` owns Phase 8 quotation, booking, payment, document and readiness authority.
- `/v1/delivery` owns Phase 9 preparation, scheduling, active location, proof and completion. It
  requires `DELIVERY_RC`, tenant/object scope and explicit `delivery.*` permissions.
- `/v1/registration-cases` owns Phase 10 registration/RTO/RC lifecycle, aging, private RC material,
  correction, closure and reopening authority.
- `/v1/customer-vehicles` owns canonical delivered-sale and explicitly external customer vehicles.
  Both Phase 10 route groups require `DELIVERY_RC`, tenant/object scope and explicit permissions.

Run from the repository root:

```sh
pnpm install
pnpm services:up
pnpm dev:api
```

Hosted Phase 9 environments must set an independent 32+ character `DELIVERY_OTP_PEPPER`. Delivery
photo/signature verification and OTP requests remain fail-closed until reviewed scanner/sender
adapters are bound; private proof storage uses the existing S3/Tigris settings.

Phase 10 introduces no new environment secret. RC files reuse private S3/Tigris storage and the
default RC scanner fails closed until a reviewed adapter is bound; no government/RTO automation is
claimed or attempted.

`WORKER_MODE=disabled` starts no consumers, `embedded` starts one BullMQ worker in the API, and
`standalone` keeps the API producer-only while `pnpm dev:worker` or `pnpm start:worker` runs the
consumer entry point. All health responses expose the configured processing mode and location.

The API validates its environment through `@gdm/config`. PostgreSQL access is
created through `@gdm/database`; Redis/BullMQ and private S3-compatible storage
remain behind injectable ports. The Tigris adapter uses the standard AWS SDK S3
interface so a later S3 migration does not change application contracts.

The Dockerfile uses the repository root as its build context:

```sh
docker build -f apps/api/Dockerfile -t gdm-api .
```

The same image serves both Render process types: `node dist/main.js` for the web service and
`node dist/worker.js` for the background worker. See
`docs/implementation/DEPLOYMENT.md` for the Render, Supabase, Upstash and Tigris/R2 setup.
