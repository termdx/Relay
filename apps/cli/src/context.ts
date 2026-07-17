import { InProcessClient } from '@relay/runtime-client';
import type { RuntimeApi } from '@relay/runtime-client';
import { RuntimeError } from '@relay/runtime-core';
import * as p from '@clack/prompts';

/**
 * Resolve the Runtime API client. Today this is always in-process; in P6 it
 * will prefer a running daemon (HTTP) and fall back to in-process.
 */
export function getClient(): RuntimeApi {
  return new InProcessClient();
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
