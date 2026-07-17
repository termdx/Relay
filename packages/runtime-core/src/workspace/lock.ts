import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { hostname } from 'node:os';
import { WorkspaceLockedError } from '../errors';

interface LockInfo {
  pid: number;
  host: string;
  acquiredAt: string;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Advisory single-writer lock over the workspace. Enforces the "runtime is the
 * only writer of workspace state" invariant for a single host. A lock held by a
 * dead process is treated as stale and reclaimed.
 */
export async function acquireLock(
  lockFile: string,
  now: Date = new Date(),
): Promise<void> {
  try {
    const existing = JSON.parse(await readFile(lockFile, 'utf8')) as LockInfo;
    if (existing.pid !== process.pid && isProcessAlive(existing.pid)) {
      throw new WorkspaceLockedError(existing.pid);
    }
  } catch (error) {
    if (error instanceof WorkspaceLockedError) throw error;
    // No lock file (or unreadable) — safe to acquire.
  }

  const info: LockInfo = {
    pid: process.pid,
    host: hostname(),
    acquiredAt: now.toISOString(),
  };
  await mkdir(dirname(lockFile), { recursive: true });
  await writeFile(lockFile, JSON.stringify(info, null, 2), 'utf8');
}

export async function releaseLock(lockFile: string): Promise<void> {
  await rm(lockFile, { force: true });
}

/** Run a mutation while holding the workspace lock. */
export async function withLock<T>(
  lockFile: string,
  fn: () => Promise<T>,
): Promise<T> {
  await acquireLock(lockFile);
  try {
    return await fn();
  } finally {
    await releaseLock(lockFile);
  }
}
