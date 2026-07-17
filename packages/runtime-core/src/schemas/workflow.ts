import { z } from 'zod';
import { configSchema, idSchema, versionSchema } from './common';

/** workflows/<id>.yaml — a declarative workflow definition (loaded by the runtime). */
export const workflowManifestSchema = z.object({
  kind: z.literal('workflow').default('workflow'),
  id: idSchema,
  version: versionSchema,
  displayName: z.string().optional(),
  description: z.string().optional(),
  /** Owning module, if any. */
  module: idSchema.optional(),
  triggers: z
    .array(z.object({ event: z.string(), config: configSchema.default({}) }))
    .default([]),
  /** Opaque definition consumed by the workflow engine (Temporal, later). */
  definition: configSchema.default({}),
});

export type WorkflowManifest = z.infer<typeof workflowManifestSchema>;
