# syntax=docker/dockerfile:1.7

FROM node:24.18.1-alpine3.23@sha256:c2cc26d8f991c2db236ad51a61efee843c482372d6d22570787309d511694110 AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@11.18.0 --activate

WORKDIR /workspace

COPY . .

# Install only the API and its transitive workspace dependencies. Installing
# every workspace also runs web-only postinstall scripts (notably rclone.js),
# which are irrelevant to this image and require an external binary download.
# Lifecycle scripts are skipped here because the root postinstall intentionally
# builds web/mobile shared packages outside this filtered install. The next
# command performs the required API dependency builds explicitly.
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @gdm/api...
RUN pnpm --filter @gdm/api... build
# The filtered workspace install above remains strict. Legacy deploy re-evaluates
# optional peers while pruning, so only that packaging step downgrades peer
# findings to warnings.
RUN pnpm --config.strict-peer-dependencies=false \
  --filter @gdm/api deploy --prod --legacy /runtime
# pnpm's workspace audit sees image-size only through Drizzle's optional Expo
# peer graph. The two release-audit exceptions are valid only while the pruned
# API artifact excludes that graph; fail the image build if it ever appears.
RUN if find /runtime/node_modules -type d -name image-size -print -quit | grep -q .; then \
      echo 'image-size unexpectedly entered the pruned API runtime' >&2; \
      exit 1; \
    fi

FROM node:24.18.1-alpine3.23@sha256:c2cc26d8f991c2db236ad51a61efee843c482372d6d22570787309d511694110 AS runtime

ARG BUILD_VERSION=unversioned
ARG VCS_REF=unknown

LABEL org.opencontainers.image.title="Go Digital Automobile CRM API and worker" \
  org.opencontainers.image.source="https://github.com/dhanushkumar-merndev/monorepo-Go-Digital-Marketing-" \
  org.opencontainers.image.version="${BUILD_VERSION}" \
  org.opencontainers.image.revision="${VCS_REF}"

ENV NODE_ENV=production

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs api

COPY --from=build --chown=api:nodejs /runtime/ ./

USER api

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --quiet --output-document=- "http://127.0.0.1:${API_PORT:-${PORT:-4000}}/v1/health/live" >/dev/null || exit 1

CMD ["node", "dist/main.js"]
