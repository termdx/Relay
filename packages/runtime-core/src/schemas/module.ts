import { z } from 'zod';
import {
  configSchema,
  idSchema,
  serviceSpecSchema,
  versionSchema,
} from './common';

/** modules/<id>.yaml — a self-describing installable module. */
export const moduleManifestSchema = z.object({
  kind: z.literal('module').default('module'),
  id: idSchema,
  version: versionSchema,
  displayName: z.string().optional(),
  description: z.string().optional(),
  author: z.string().optional(),
  /** Other module ids this module depends on. */
  dependencies: z.array(idSchema).default([]),
  permissions: z.array(z.string()).default([]),
  /** Docker services this module contributes to the generated compose. */
  services: z.array(serviceSpecSchema).default([]),
  events: z
    .object({
      emits: z.array(z.string()).default([]),
      consumes: z.array(z.string()).default([]),
    })
    .default({ emits: [], consumes: [] }),
  requiredIntegrations: z.array(idSchema).default([]),
  requiredAiCapabilities: z.array(z.string()).default([]),
  capabilities: z
    .object({
      ui: z.boolean().default(false),
      apiRoutes: z.boolean().default(false),
      storage: z.boolean().default(false),
      ai: z.boolean().default(false),
    })
    .default({ ui: false, apiRoutes: false, storage: false, ai: false }),
  config: configSchema.default({}),
});

export type ModuleManifest = z.infer<typeof moduleManifestSchema>;
