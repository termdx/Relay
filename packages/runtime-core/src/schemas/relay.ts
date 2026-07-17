import { z } from 'zod';
import { idSchema, versionSchema } from './common';

/** Schema version of the workspace manifest format itself. */
export const MANIFEST_SCHEMA_VERSION = '1';

/**
 * relay.yaml — global runtime configuration. Adding a module, integration, or
 * provider must NEVER require editing this file.
 */
export const relayConfigSchema = z.object({
  schemaVersion: z.literal(MANIFEST_SCHEMA_VERSION).default(MANIFEST_SCHEMA_VERSION),
  runtime: z
    .object({
      mode: z.enum(['local', 'server']).default('local'),
      version: versionSchema.default('0.1.0'),
    })
    .default({ mode: 'local', version: '0.1.0' }),
  organization: z.object({
    name: z.string().min(1),
    slug: idSchema.optional(),
  }),
  network: z
    .object({
      name: idSchema.default('relay'),
      apiPort: z.number().int().positive().default(51720),
    })
    .default({ name: 'relay', apiPort: 51720 }),
  storage: z
    .object({
      path: z.string().default('./data'),
    })
    .default({ path: './data' }),
  desktop: z
    .object({ enabled: z.boolean().default(true) })
    .default({ enabled: true }),
  telemetry: z
    .object({ enabled: z.boolean().default(false) })
    .default({ enabled: false }),
});

export type RelayConfig = z.infer<typeof relayConfigSchema>;
