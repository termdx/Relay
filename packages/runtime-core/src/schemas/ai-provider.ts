import { z } from 'zod';
import { idSchema, secretRefSchema, versionSchema } from './common';

export const AI_PROVIDER_KINDS = [
  'gemini',
  'openai',
  'anthropic',
  'ollama',
  'litellm',
  'openrouter',
] as const;

/** ai/<id>.yaml — an installed AI provider. */
export const aiProviderManifestSchema = z.object({
  kind: z.literal('ai-provider').default('ai-provider'),
  id: idSchema,
  version: versionSchema,
  provider: z.enum(AI_PROVIDER_KINDS),
  endpoint: z.string().url().optional(),
  /** API key stored as a secret reference (absent for local providers). */
  apiKeyRef: secretRefSchema.optional(),
  models: z.array(z.string()).default([]),
  defaultModel: z.string().optional(),
  /** Capabilities this provider satisfies, e.g. "draft", "chat", "embeddings". */
  capabilities: z.array(z.string()).default(['draft']),
  routing: z
    .object({
      priority: z.number().int().default(0),
      fallback: idSchema.optional(),
    })
    .default({ priority: 0 }),
  rateLimits: z
    .object({
      requestsPerMinute: z.number().int().positive().optional(),
      tokensPerMinute: z.number().int().positive().optional(),
    })
    .optional(),
});

export type AiProviderManifest = z.infer<typeof aiProviderManifestSchema>;
