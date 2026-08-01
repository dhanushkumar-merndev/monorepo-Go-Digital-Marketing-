# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@11.18.0 --activate

WORKDIR /workspace

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @gdm/api... build
# The full workspace install above remains strict. Legacy deploy re-evaluates
# optional peers from unrelated workspaces while pruning, so only that packaging
# step downgrades peer findings to warnings.
RUN pnpm --config.strict-peer-dependencies=false \
  --filter @gdm/api deploy --prod --legacy /runtime

FROM node:24-alpine AS runtime

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
