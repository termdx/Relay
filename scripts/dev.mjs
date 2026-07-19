#!/usr/bin/env node
/**
 * `pnpm dev` — boot the whole local stack with one command.
 *
 * Default (runtime-owned): the RUNTIME owns Postgres + backend.
 *   1. ensure the backend image exists
 *   2. start the Runtime daemon (auto-creates ~/.relay/workspaces/default)
 *   3. ensure the default workspace has the backend module, then `relay up`
 *      (generates compose + starts pgvector Postgres + backend containers)
 *   4. start the desktop
 *
 * `pnpm dev:local` (RELAY_DEV=local) — fast backend iteration: a standalone
 *   Postgres container + `nest start` (no rebuild), plus the daemon + desktop.
 *
 * `pnpm dev:web` (RELAY_DESKTOP=web) — desktop in the browser, no Rust build.
 *
 * Ctrl-C stops what this script started. Env passthrough:
 *   AI_PROVIDER=gemini GEMINI_API_KEY=... pnpm dev:local
 */
import { execSync, spawn } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI_TSX = join(ROOT, "apps/cli/node_modules/.bin/tsx");
const CLI = join(ROOT, "apps/cli/src/cli.ts");
const DEFAULT_WS = join(homedir(), ".relay", "workspaces", "default");
const BACKEND_PORT = 3000;
const BACKEND_IMAGE = "relay-backend:local";
const LOCAL_MODE = process.env.RELAY_DEV === "local";
const WEB_MODE = process.env.RELAY_DESKTOP === "web";
const NO_DESKTOP = process.env.RELAY_NO_DESKTOP === "1";

const LOCAL_PG = {
  container: "relay-postgres",
  volume: "relay_val",
  image: "pgvector/pgvector:pg16",
  port: 5432,
};
const LOCAL_DB_URL = `postgresql://relay:relay@localhost:${LOCAL_PG.port}/relay`;

const C = {
  db: "\x1b[36m", be: "\x1b[35m", rt: "\x1b[34m", ui: "\x1b[32m",
  warn: "\x1b[33m", err: "\x1b[31m", dim: "\x1b[2m", reset: "\x1b[0m",
};
const log = (color, tag, msg) => console.log(`${color}[${tag}]${C.reset} ${msg}`);
const silent = (cmd) => { try { execSync(cmd, { stdio: "ignore" }); return true; } catch { return false; } };
const silentOut = (cmd) => { try { return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return ""; } };
const loud = (cmd, env) =>
  execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });

const children = [];
function spawnBg(color, tag, cmd, args, env) {
  const child = spawn(cmd, args, {
    env: { ...process.env, ...env }, detached: true, stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  const prefix = `${color}[${tag}]${C.reset} `;
  const fwd = (b) => {
    const lines = b.toString().split("\n");
    for (let i = 0; i < lines.length - 1; i++) process.stdout.write(prefix + lines[i] + "\n");
  };
  child.stdout.on("data", fwd);
  child.stderr.on("data", fwd);
  child.on("exit", (code) => { log(C.err, tag, `exited (${code ?? 0})`); shutdown(); });
  return child;
}

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  log(C.dim, "dev", "stopping…");
  if (!LOCAL_MODE) {
    // Tear down the runtime-owned stack; leave the local pg container alone.
    silent(`${CLI_TSX} ${CLI} -C ${DEFAULT_WS} down`);
  }
  for (const child of children) {
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* gone */ }
  }
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function ensureDocker() {
  if (!silent("docker info")) {
    log(C.err, "dev", "Docker isn't running — start Docker Desktop and retry.");
    process.exit(1);
  }
}

async function waitForHealth(label, color) {
  process.stdout.write(`${color}[${label}]${C.reset} waiting for /health`);
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`http://localhost:${BACKEND_PORT}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok) { process.stdout.write(" up\n"); return true; }
    } catch { /* not yet */ }
    process.stdout.write(".");
    await sleep(1000);
  }
  process.stdout.write("\n");
  return false;
}

function startDaemon() {
  // The installed Relay.app runs a bundled sidecar daemon on the same port —
  // its GUI-launched env has no working docker, so everything downstream
  // fails with confusing compose errors. Refuse to share the port.
  const squatter = silentOut("lsof -tiTCP:51720 -sTCP:LISTEN");
  if (squatter) {
    const cmd = silentOut(`ps -o comm= -p ${squatter.split("\n")[0]}`);
    log(C.err, "runtime", `port 51720 is already in use by: ${cmd || "unknown process"}`);
    log(C.err, "runtime", "quit the installed Relay app (or that process) and re-run pnpm dev.");
    process.exit(1);
  }
  log(C.rt, "runtime", "starting daemon (:51720)…");
  spawnBg(C.rt, "runtime", CLI_TSX, [CLI, "daemon", "start"], {});
}

async function waitForDaemon() {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch("http://127.0.0.1:51720/health", {
        signal: AbortSignal.timeout(800),
      });
      if (res.ok) return true;
    } catch { /* not yet */ }
    await sleep(500);
  }
  return false;
}

async function runtimeOwned() {
  ensureDocker();

  // Always build: Docker's layer cache makes an unchanged build ~1s, and a
  // stale image silently serves yesterday's backend (404s on new routes).
  log(C.be, "backend", `building ${BACKEND_IMAGE} (cached when unchanged)…`);
  loud(`docker build -t ${BACKEND_IMAGE} services/backend`);

  startDaemon();
  if (!(await waitForDaemon())) {
    log(C.err, "runtime", "daemon didn't come up"); process.exit(1);
  }

  // Only one Relay Postgres runs at a time — stop a lingering dev:local one so
  // it doesn't sit idle alongside the runtime-owned stack.
  silent(`docker rm -f ${LOCAL_PG.container}`);

  // Ensure the default workspace can produce a backend, then let the runtime
  // bring the stack up. Both are idempotent.
  log(C.rt, "runtime", "ensuring backend module + starting stack…");
  silent(`${CLI_TSX} ${CLI} -C ${DEFAULT_WS} module add meeting -y`);
  loud(`${CLI_TSX} ${CLI} -C ${DEFAULT_WS} up`);

  if (!(await waitForHealth("backend", C.be))) {
    log(C.warn, "backend", "health timed out — continuing");
  }
}

async function localMode() {
  ensureDocker();
  // Stop the runtime-owned stack first so only one Relay Postgres runs.
  silent(`${CLI_TSX} ${CLI} -C ${DEFAULT_WS} down`);
  // standalone pg container (fast backend iteration path)
  const state = (() => {
    try { return execSync(`docker inspect -f '{{.State.Status}}' ${LOCAL_PG.container}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); }
    catch { return null; }
  })();
  if (state === null) {
    log(C.db, "db", `creating ${LOCAL_PG.container}…`);
    silent(`docker volume create ${LOCAL_PG.volume}`);
    silent(`docker run -d --name ${LOCAL_PG.container} --restart unless-stopped -p ${LOCAL_PG.port}:${LOCAL_PG.port} -e POSTGRES_USER=relay -e POSTGRES_PASSWORD=relay -e POSTGRES_DB=relay -v ${LOCAL_PG.volume}:/var/lib/postgresql/data ${LOCAL_PG.image}`);
  } else if (state !== "running") {
    silent(`docker start ${LOCAL_PG.container}`);
  }
  process.stdout.write(`${C.db}[db]${C.reset} waiting for postgres`);
  for (let i = 0; i < 60; i++) {
    if (silent(`docker exec ${LOCAL_PG.container} pg_isready -U relay`)) { process.stdout.write(" ready\n"); break; }
    process.stdout.write("."); await sleep(1000);
  }

  startDaemon();
  spawnBg(C.be, "backend", "pnpm", ["--filter", "@relay/backend", "start"], {
    DATABASE_URL: LOCAL_DB_URL,
    JWT_SECRET: process.env.JWT_SECRET ?? "dev-secret-change-me",
    AI_PROVIDER: process.env.AI_PROVIDER ?? "stub",
    PUBLIC_BASE_URL: `http://localhost:${BACKEND_PORT}`,
  });
  if (!(await waitForHealth("backend", C.be))) {
    log(C.warn, "backend", "health timed out — starting desktop anyway");
  }
}

async function main() {
  if (LOCAL_MODE) await localMode();
  else await runtimeOwned();

  if (NO_DESKTOP) {
    log(C.dim, "dev", "RELAY_NO_DESKTOP=1 — stack up, desktop skipped. Ctrl-C to stop.");
    return;
  }

  const desktopArgs = WEB_MODE
    ? ["--filter", "@relay/desktop", "dev"]
    : ["--filter", "@relay/desktop", "tauri", "dev"];
  spawnBg(C.ui, "desktop", "pnpm", desktopArgs, {});

  log(
    C.dim, "dev",
    `stack up (${LOCAL_MODE ? "local backend" : "runtime-owned"}), daemon + desktop running. Ctrl-C to stop.`,
  );
}

main().catch((e) => { console.error(e); shutdown(); });
