#!/usr/bin/env node
/**
 * `pnpm dev` — boot the whole local stack with one command:
 *   1. Postgres (pgvector) in Docker, on the persistent `relay_val` volume
 *   2. the backend API (migrations run on boot)
 *   3. the desktop app
 *
 * Ctrl-C stops the backend + desktop. Postgres is left running (it's a
 * persistent container); stop it with `docker stop relay-postgres`.
 *
 * Env overrides: AI_PROVIDER=gemini GEMINI_API_KEY=... pnpm dev
 * Web (no Rust build): pnpm dev:web
 */
import { execSync, spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PG = {
  container: "relay-postgres",
  volume: "relay_val",
  image: "pgvector/pgvector:pg16",
  user: "relay",
  password: "relay",
  db: "relay",
  port: 5432,
};
const BACKEND_PORT = 3000;
const DATABASE_URL = `postgresql://${PG.user}:${PG.password}@localhost:${PG.port}/${PG.db}`;
const WEB_MODE = process.env.RELAY_DESKTOP === "web";

const C = {
  db: "\x1b[36m",
  be: "\x1b[35m",
  ui: "\x1b[32m",
  warn: "\x1b[33m",
  err: "\x1b[31m",
  dim: "\x1b[2m",
  reset: "\x1b[0m",
};
const log = (color, tag, msg) =>
  console.log(`${color}[${tag}]${C.reset} ${msg}`);

const silent = (cmd) => {
  try {
    execSync(cmd, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
const capture = (cmd) => execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();

function containerState(name) {
  try {
    return capture(`docker inspect -f '{{.State.Status}}' ${name}`);
  } catch {
    return null;
  }
}

async function ensureDb() {
  if (!silent("docker info")) {
    log(C.err, "db", "Docker isn't running — start Docker Desktop and retry.");
    process.exit(1);
  }
  const state = containerState(PG.container);
  if (state === null) {
    log(C.db, "db", `creating ${PG.container} (volume ${PG.volume})…`);
    silent(`docker volume create ${PG.volume}`);
    execSync(
      `docker run -d --name ${PG.container} --restart unless-stopped ` +
        `-p ${PG.port}:${PG.port} -e POSTGRES_USER=${PG.user} ` +
        `-e POSTGRES_PASSWORD=${PG.password} -e POSTGRES_DB=${PG.db} ` +
        `-v ${PG.volume}:/var/lib/postgresql/data ${PG.image}`,
      { stdio: "ignore" },
    );
  } else if (state !== "running") {
    log(C.db, "db", `starting ${PG.container}…`);
    execSync(`docker start ${PG.container}`, { stdio: "ignore" });
  } else {
    log(C.db, "db", `${PG.container} already running`);
  }

  process.stdout.write(`${C.db}[db]${C.reset} waiting for postgres`);
  for (let i = 0; i < 60; i++) {
    if (silent(`docker exec ${PG.container} pg_isready -U ${PG.user}`)) {
      process.stdout.write(" ready\n");
      return;
    }
    process.stdout.write(".");
    await sleep(1000);
  }
  process.stdout.write("\n");
  log(C.err, "db", "postgres did not become ready");
  process.exit(1);
}

const children = [];
function run(color, tag, args, env) {
  const child = spawn("pnpm", args, {
    env: { ...process.env, ...env },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  const prefix = `${color}[${tag}]${C.reset} `;
  const forward = (buf) => {
    const lines = buf.toString().split("\n");
    for (let i = 0; i < lines.length - 1; i++) process.stdout.write(prefix + lines[i] + "\n");
  };
  child.stdout.on("data", forward);
  child.stderr.on("data", forward);
  child.on("exit", (code) => {
    log(C.err, tag, `exited (code ${code ?? 0})`);
    shutdown();
  });
  return child;
}

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  log(C.dim, "dev", "stopping backend + desktop (postgres left running)…");
  for (const child of children) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function waitForBackend() {
  process.stdout.write(`${C.be}[backend]${C.reset} waiting for /health`);
  for (let i = 0; i < 90; i++) {
    try {
      const res = await fetch(`http://localhost:${BACKEND_PORT}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok) {
        process.stdout.write(" up\n");
        return true;
      }
    } catch {
      /* not up yet */
    }
    process.stdout.write(".");
    await sleep(1000);
  }
  process.stdout.write("\n");
  return false;
}

async function main() {
  await ensureDb();

  run(C.be, "backend", ["--filter", "@relay/backend", "start"], {
    DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET ?? "dev-secret-change-me",
    AI_PROVIDER: process.env.AI_PROVIDER ?? "stub",
    PUBLIC_BASE_URL: `http://localhost:${BACKEND_PORT}`,
  });

  if (!(await waitForBackend())) {
    log(C.warn, "backend", "health timed out — starting desktop anyway");
  }

  const desktopArgs = WEB_MODE
    ? ["--filter", "@relay/desktop", "dev"]
    : ["--filter", "@relay/desktop", "tauri", "dev"];
  run(C.ui, "desktop", desktopArgs, {});

  log(
    C.dim,
    "dev",
    `stack up — backend :${BACKEND_PORT}${WEB_MODE ? ", web :1420" : ", desktop window"}. Ctrl-C to stop.`,
  );
}

main();
