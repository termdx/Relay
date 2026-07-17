#!/usr/bin/env node
/**
 * Compile the Relay Runtime daemon into a standalone binary and place it where
 * Tauri expects a sidecar: src-tauri/binaries/relay-runtime-<target-triple>.
 *
 * Tauri appends the host target triple to `externalBin` names, so the file on
 * disk must carry it. Uses bun (`bun build --compile`) — no Node needed at run
 * time, which is the whole point of a sidecar.
 *
 *   node scripts/build-sidecar.mjs
 */
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = join(ROOT, "services/runtime/src/main.ts");
const OUT_DIR = join(ROOT, "apps/desktop/src-tauri/binaries");
const BIN = "relay-runtime";

function targetTriple() {
  // e.g. "aarch64-apple-darwin". Tauri matches this exact suffix.
  const host = execSync("rustc -vV", { encoding: "utf8" })
    .split("\n")
    .find((l) => l.startsWith("host:"));
  if (!host) throw new Error("could not read rustc host triple — is Rust installed?");
  return host.replace("host:", "").trim();
}

function main() {
  const triple = targetTriple();
  mkdirSync(OUT_DIR, { recursive: true });
  const outfile = join(OUT_DIR, `${BIN}-${triple}`);
  console.log(`Compiling daemon -> ${outfile}`);
  execSync(`bun build ${ENTRY} --compile --outfile ${outfile}`, {
    stdio: "inherit",
    cwd: ROOT,
  });
  console.log("Sidecar built.");
}

main();
