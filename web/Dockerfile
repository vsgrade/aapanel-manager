FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=$PNPM_HOME:$PATH
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# ── deps: install all dependencies (incl. devDeps for prisma CLI + tsx) ──────
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ── builder: generate Prisma client + build Next.js standalone output ─────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm prisma generate && pnpm build

# ── runner: minimal Next.js standalone web image ─────────────────────────────
# This stage uses Next.js `output: 'standalone'` so it only contains the
# pre-bundled server.js and static assets.  It does NOT include src/ or tsx,
# so the worker CANNOT run from this image.
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
# Version metadata (passed by the release workflow) — surfaced by getCurrentVersion().
ARG APP_VERSION=""
ARG APP_COMMIT=""
ARG APP_BUILD_TIME=""
ENV APP_VERSION=$APP_VERSION APP_COMMIT=$APP_COMMIT APP_BUILD_TIME=$APP_BUILD_TIME
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
EXPOSE 3000
CMD ["node", "server.js"]

# ── worker: full-source runtime for `pnpm worker` (tsx + src/) ───────────────
# The worker is executed via `tsx` which transpiles TypeScript at runtime, so
# it needs the complete source tree, all node_modules (incl. tsx + prisma CLI),
# and the tsconfig files.  Prisma migrations also run from this stage via
# `pnpm prisma migrate deploy`.
#
# Why a separate stage (not a single image):
#   - The standalone runner image is ~3× smaller and has no build-time tools.
#   - Keeping the worker stage separate means neither image is a compromise.
#   - Both use the same builder output so Prisma client is generated once.
FROM base AS worker
WORKDIR /app
ENV NODE_ENV=production
# Copy everything the worker needs: source, config, node_modules, prisma.
# node_modules comes from `deps` (pre-build), so overlay the Prisma client that
# `prisma generate` produced in `builder` (node_modules/.prisma) — otherwise
# PrismaClient has no generated engine/client and the worker crashes at startup.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/src ./src
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/tsconfig.worker.json ./tsconfig.worker.json
# Default entrypoint: run the background polling worker.
# For the `migrate` service override this with: pnpm prisma migrate deploy
CMD ["pnpm", "worker"]
