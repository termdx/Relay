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
RUN corepack enable && corepack prepare pnpm@11.13.1 --activate
WORKDIR /app

# Install dependencies (no workspace lockfile in this context — resolved fresh).
COPY package.json ./
RUN pnpm install
# pnpm blocks build scripts by default; explicitly build the native driver.
RUN pnpm rebuild better-sqlite3

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

COPY package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3000
CMD ["node", "dist/main.js"]
