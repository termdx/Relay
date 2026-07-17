import { HttpClient, InProcessClient } from '@relay/runtime-client';
import type { RuntimeApi } from '@relay/runtime-client';
import { RuntimeError } from '@relay/runtime-core';
import * as p from '@clack/prompts';

/**
 * Resolve the Runtime API client. If a daemon was detected (RELAY_RUNTIME_URL
 * set by the preAction probe), talk to it over HTTP; otherwise run in-process.
 * Either way the CLI is a thin client over the same RuntimeApi.
 */
export function getClient(): RuntimeApi {
  const url = process.env.RELAY_RUNTIME_URL;
  return url ? new HttpClient(url) : new InProcessClient();
}

/** Wrap a command action so typed runtime errors print cleanly, not as stacks. */
export function run(action: () => Promise<void>): void {
  action().catch((error: unknown) => {
    if (error instanceof RuntimeError) {
      p.log.error(error.message);
    } else {
      p.log.error(error instanceof Error ? error.message : String(error));
    }
    process.exitCode = 1;
  });
}

/** Exit cleanly if the user cancels an interactive prompt. */
export function ensure<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }
  return value;
}
