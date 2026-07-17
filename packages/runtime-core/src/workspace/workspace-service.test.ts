import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceExistsError, WorkspaceNotFoundError } from '../errors';
import { WorkspaceService } from './workspace-service';

describe('WorkspaceService', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'relay-ws-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('initializes a workspace and loads its config', async () => {
    const root = await WorkspaceService.init(dir, { organization: 'Acme' });
    const config = await WorkspaceService.loadConfig(root);
    expect(config.organization.name).toBe('Acme');
    expect(config.runtime.mode).toBe('local');
  });

  it('locates the workspace from a nested subdirectory', async () => {
    await WorkspaceService.init(dir, { organization: 'Acme' });
    const nested = join(dir, 'modules');
    expect(await WorkspaceService.locate(nested)).toBe(dir);
  });

  it('rejects re-initializing an existing workspace', async () => {
    await WorkspaceService.init(dir, { organization: 'Acme' });
    await expect(
      WorkspaceService.init(dir, { organization: 'Acme' }),
    ).rejects.toBeInstanceOf(WorkspaceExistsError);
  });

  it('throws when no workspace exists up the tree', async () => {
    await expect(WorkspaceService.locate(dir)).rejects.toBeInstanceOf(
      WorkspaceNotFoundError,
    );
  });
});
