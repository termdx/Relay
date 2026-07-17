import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { z } from 'zod';
import { AlreadyExistsError, NotFoundError } from '../errors';
import { dumpYaml, loadYaml } from './yaml';

/**
 * A directory of `<id>.yaml` manifests of one kind, validated against a schema.
 * The single writer of that directory: every mutation goes through here, and
 * writes are atomic (see dumpYaml).
 */
export class ManifestStore<T extends { id: string }> {
  constructor(
    private readonly dir: string,
    private readonly schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    private readonly kind: string,
  ) {}

  private file(id: string): string {
    return join(this.dir, `${id}.yaml`);
  }

  async list(): Promise<string[]> {
    let entries: string[];
    try {
      entries = await readdir(this.dir);
    } catch {
      return [];
    }
    return entries
      .filter((name) => name.endsWith('.yaml'))
      .map((name) => name.slice(0, -'.yaml'.length))
      .sort();
  }

  async exists(id: string): Promise<boolean> {
    return (await this.list()).includes(id);
  }

  async read(id: string): Promise<T> {
    if (!(await this.exists(id))) {
      throw new NotFoundError(this.kind, id);
    }
    return loadYaml(this.file(id), this.schema);
  }

  async readAll(): Promise<T[]> {
    const ids = await this.list();
    return Promise.all(ids.map((id) => this.read(id)));
  }

  /** Create a new manifest; fails if one with the same id already exists. */
  async create(value: T): Promise<void> {
    if (await this.exists(value.id)) {
      throw new AlreadyExistsError(this.kind, value.id);
    }
    await mkdir(this.dir, { recursive: true });
    await dumpYaml(this.file(value.id), this.schema, value);
  }

  /** Create or replace a manifest. */
  async write(value: T): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await dumpYaml(this.file(value.id), this.schema, value);
  }

  async remove(id: string): Promise<void> {
    if (!(await this.exists(id))) {
      throw new NotFoundError(this.kind, id);
    }
    await rm(this.file(id));
  }
}
