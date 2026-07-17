# syntax=docker/dockerfile:1
#
# Relay backend image. Self-contained: build from services/backend as context.
#   docker build -t relay-backend:local services/backend
#
# The runtime catalog references this as `relay-backend:local`. v0.1 runs on
# SQLite (better-sqlite3); wiring it to the compose Postgres is a follow-up.

# --- Build stage: install all deps, compile the native driver, build TS ---
FROM node:22-slim AS build
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
# Toolchain in case better-sqlite3 has no prebuilt binary for this platform.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.13.1 --activate
WORKDIR /app

# Install dependencies (no workspace lockfile in this context — resolved fresh).
COPY package.json ./
# pnpm 11 hard-fails on unapproved build scripts and reads the approval list from
# pnpm-workspace.yaml. Generated here rather than committed, so services/backend
# never becomes a nested workspace root in the repo.
RUN printf 'allowBuilds:\n  better-sqlite3: true\n  "@google/genai": true\n  protobufjs: true\n  unrs-resolver: true\n' > pnpm-workspace.yaml
RUN pnpm install

# Compile TypeScript, then drop dev dependencies from node_modules.
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN pnpm run build && pnpm prune --prod

# --- Runtime stage: minimal image with prod deps + built output ---
FROM node:22-slim AS runtime
ENV NODE_ENV=production
# SQLite lives here; mount a volume at /app/data to persist it.
ENV DATABASE_PATH=/app/data/relay.sqlite
WORKDIR /app

# Set ownership during COPY: a later `chown -R` would rewrite every file and
# duplicate node_modules into a second ~170MB layer.
COPY package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist

RUN mkdir -p /app/data && chown node:node /app/data
USER node

EXPOSE 3000
CMD ["node", "dist/main.js"]
