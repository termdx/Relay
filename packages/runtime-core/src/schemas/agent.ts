import { z } from 'zod';
import { configSchema, idSchema, versionSchema } from './common';

/** agents/<id>.yaml — a LangGraph agent definition (scaffolded by the runtime). */
export const agentManifestSchema = z.object({
  kind: z.literal('agent').default('agent'),
  id: idSchema,
  version: versionSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  /** Provider-qualified model, e.g. "gemini/gemini-2.5-flash". */
  model: z.string().min(1),
  tools: z.array(z.string()).default([]),
  memory: z
    .object({
      enabled: z.boolean().default(false),
      kind: z.enum(['none', 'buffer', 'vector']).default('none'),
    })
    .default({ enabled: false, kind: 'none' }),
  workflow: idSchema.optional(),
  config: configSchema.default({}),
});

export type AgentManifest = z.infer<typeof agentManifestSchema>;
