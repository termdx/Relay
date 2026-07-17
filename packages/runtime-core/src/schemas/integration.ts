import { z } from 'zod';
import {
  configSchema,
  healthCheckSpecSchema,
  idSchema,
  secretRefSchema,
  versionSchema,
} from './common';

/** integrations/<id>.yaml — an external service connection (GitHub, Slack, …). */
export const integrationManifestSchema = z.object({
  kind: z.literal('integration').default('integration'),
  id: idSchema,
  version: versionSchema,
  displayName: z.string().optional(),
  description: z.string().optional(),
  /** Credential fields, stored as secret references — never values. */
  credentials: z
    .array(
      z.object({
        name: z.string().min(1),
        secretRef: secretRefSchema,
        required: z.boolean().default(true),
      }),
    )
    .default([]),
  config: configSchema.default({}),
  permissions: z.array(z.string()).default([]),
  webhooks: z
    .array(z.object({ event: z.string(), path: z.string() }))
    .default([]),
  requiredModules: z.array(idSchema).default([]),
  healthChecks: z.array(healthCheckSpecSchema).default([]),
});

export type IntegrationManifest = z.infer<typeof integrationManifestSchema>;
