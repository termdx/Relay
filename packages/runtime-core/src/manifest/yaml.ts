import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parse, stringify } from 'yaml';
import type { z } from 'zod';
import { ManifestValidationError } from '../errors';

/** A schema producing `T`, regardless of its (default-driven) input type. */
type OutputSchema<T> = z.ZodType<T, z.ZodTypeDef, unknown>;

/** Parse + validate a YAML file against a schema, returning typed data. */
export async function loadYaml<T>(
  file: string,
  schema: OutputSchema<T>,
): Promise<T> {
  const raw = await readFile(file, 'utf8');
  const parsed: unknown = parse(raw) ?? {};
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new ManifestValidationError(
      file,
      result.error.issues.map(
        (issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`,
      ),
    );
  }
  return result.data;
}

/**
 * Validate then atomically write data as YAML (temp file + rename), so a
 * crashed write never leaves a half-written manifest.
 */
export async function dumpYaml<T>(
  file: string,
  schema: OutputSchema<T>,
  data: T,
): Promise<void> {
  const validated = schema.parse(data);
  const yaml = stringify(validated, { sortMapEntries: false });
  const tmp = join(dirname(file), `.${Date.now()}.tmp`);
  await writeFile(tmp, yaml, 'utf8');
  await rename(tmp, file);
}
