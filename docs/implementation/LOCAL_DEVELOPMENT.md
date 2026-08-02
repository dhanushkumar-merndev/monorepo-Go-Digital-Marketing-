# Local Development

## Prerequisites

- Node.js 24 LTS (`.nvmrc` is provided). Node 26 is accepted for local compatibility checks but is
  not the deployment baseline.
- pnpm 11.18.0 through Corepack or a direct pnpm installation.
- Docker Engine/Desktop with Compose for PostgreSQL, Redis and MinIO.
- Android Studio/emulator or a physical Android device for the Expo development client.

## First setup

Run every command from the repository root:

```bash
corepack enable
corepack prepare pnpm@11.18.0 --activate
cp .env.example .env
pnpm install
pnpm services:up
pnpm db:migrate
```

`pnpm services:up` starts:

| Service       | Local address     | Purpose                                     |
| ------------- | ----------------- | ------------------------------------------- |
| PostgreSQL    | `localhost:54322` | Supabase-compatible local database behavior |
| Redis         | `localhost:6379`  | Upstash-compatible cache/queue behavior     |
| MinIO S3 API  | `localhost:9000`  | Tigris-compatible object API                |
| MinIO console | `localhost:9001`  | Local-only bucket inspection                |

The compose credentials are development-only defaults. Hosted environments must inject managed
secrets, require TLS in the provider-supplied PostgreSQL connection settings, and use `rediss://`
and HTTPS object-storage endpoints.

The workspace keeps one root lockfile and one pnpm virtual store. Install only from the repository
root. Lifecycle scripts are explicitly approved or denied through `allowBuilds` in
`pnpm-workspace.yaml`; review that policy when introducing a dependency with an install script.

## Start applications independently

```bash
pnpm dev:web       # http://localhost:3000
pnpm dev:api       # http://localhost:4000
pnpm dev:mobile    # Expo development server
```

`WORKER_MODE` defaults to `disabled`. To run a dedicated processor in another terminal:

```bash
pnpm dev:worker
```

The worker command forces `WORKER_MODE=standalone`. For a single-process local pilot, set
`WORKER_MODE=embedded` and run only `pnpm dev:api`.

The web shell reads `NEXT_PUBLIC_API_URL`; the mobile shell reads `EXPO_PUBLIC_API_URL`. Neither
variable may contain a credential. An Android emulator reaches the host through `10.0.2.2`, so a
typical emulator override is:

```dotenv
EXPO_PUBLIC_API_URL=http://10.0.2.2:4000/v1
```

Use a LAN address for a physical device and allow that origin/network only in local development.

The mobile project owns its native configuration through Expo prebuild:

```bash
pnpm --filter @gdm/mobile prebuild -- --no-install
pnpm --filter @gdm/mobile android
```

Generated `android/` and `ios/` folders are local build output in Phase 0. The committed Expo
configuration requests notifications only; it does not request call logs, SMS, contacts,
accessibility or background/active location permissions.

## API endpoints

```text
GET /v1/health
GET /v1/health/live
GET /v1/health/ready
GET /docs
GET /docs-json
```

Readiness is expected to fail when PostgreSQL or Redis is stopped; that is accurate behavior, not
a fixture. Both `/v1/health` and `/v1/health/ready` are dependency-aware. Liveness remains
successful while the API process can handle requests.

## Environment rules

The root `.env.example` is the canonical list. `@gdm/config` validates all API values before the
server listens. Important rules:

- `DATABASE_URL` must use `postgres://` or `postgresql://`.
- `DIRECT_DATABASE_URL` is preferred for Drizzle migration/DDL commands and falls back to
  `DATABASE_URL` when omitted.
- `REDIS_URL` must use `redis://` or `rediss://`.
- `WORKER_MODE` must be `disabled`, `embedded` or `standalone`.
- S3 access-key ID and secret must either both be supplied or both be omitted for the SDK default
  credential chain.
- A complete `TIGRIS_*` set maps to the S3 adapter. It cannot be mixed with generic `S3_*`
  endpoint, bucket or credentials.
- CORS origins are an explicit comma-separated allowlist.
- Empty `SENTRY_DSN` selects the no-op error reporter.

Do not put real provider secrets in an `EXPO_PUBLIC_*` or `NEXT_PUBLIC_*` variable, logs, fixtures,
or committed files.

## Stop services

```bash
pnpm services:down
```

This stops containers but preserves named volumes. Removing volumes is destructive and is not part
of the normal project scripts.
