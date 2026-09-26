# syntax=docker/dockerfile:1.7
# Reproducible multi-stage build of the Valkyria web application (Next.js standalone).
# Build context: repository root. No secrets are accepted as build arguments; runtime
# configuration is supplied through the operator's protected env file.
#
# The base image is pinned by digest (node:24-bookworm-slim, Node 24.21.0). Registries
# that mirror Docker Hub (e.g. mirror.gcr.io/library/node) serve the same digest and
# can be selected with --build-arg NODE_IMAGE=... without changing the content.
ARG NODE_IMAGE=docker.io/library/node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
# Optional: behind a TLS-intercepting egress proxy, supply its CA bundle as a BuildKit
# secret (`--secret id=build_ca,src=/path/ca.pem`). Secret mounts are not stored in layers.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    --mount=type=secret,id=build_ca,required=false \
    if [ -s /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    pnpm install --frozen-lockfile

FROM deps AS build
COPY apps/web apps/web
COPY packages/db packages/db
COPY assets/brand assets/brand
RUN --mount=type=secret,id=build_ca,required=false \
    if [ -s /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    pnpm --filter @valkyria/web build

FROM ${NODE_IMAGE} AS runtime
ARG SOURCE_REVISION=unknown
LABEL org.opencontainers.image.title="valkyria-web" \
      org.opencontainers.image.source="https://github.com/ValkyriaWDG/www" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      org.opencontainers.image.licenses="Apache-2.0"
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1 \
    EDITORIAL_MEDIA_ROOT=/app/storage/editorial \
    MIGRATIONS_DIR=/app/migrations
WORKDIR /app
# The runtime only executes `node`; drop the base image's package managers (and their
# bundled dependencies) so they are neither an attack surface nor scan findings.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
 && groupadd --system --gid 10001 valkyria \
 && useradd --system --uid 10001 --gid valkyria --home-dir /app --shell /usr/sbin/nologin valkyria
# Application files are owned by root and read-only for the runtime user.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
COPY --from=build /repo/apps/web/dist/cli ./scripts
COPY --from=build /repo/apps/web/dist/migrations ./migrations
# Only the media volume and Next.js cache are writable by the non-root user.
RUN mkdir -p /app/storage/editorial /app/apps/web/.next/cache \
 && chown -R valkyria:valkyria /app/storage /app/apps/web/.next/cache \
 && chmod 0750 /app/storage/editorial
USER valkyria:valkyria
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]
