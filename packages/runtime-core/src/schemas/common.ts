import { z } from 'zod';

/** kebab-case identifier used for manifest ids and filenames. */
export const idSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, 'id must be kebab-case (a-z, 0-9, hyphen)');

/** Loose semantic version. */
export const versionSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'version must be semver, e.g. 1.0.0');

/**
 * Reference to a secret value stored in the secrets provider — never the value
 * itself. Format: "<namespace>.<key>", e.g. "gemini.apiKey".
 */
export const secretRefSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*\.[a-zA-Z][a-zA-Z0-9_]*$/, 'secretRef must look like "namespace.key"');

/** Free-form configuration bag — validated per-item by the owning module. */
export const configSchema = z.record(z.string(), z.unknown());

/** A docker service contributed by a module, consumed by the compose generator. */
export const serviceSpecSchema = z.object({
  name: idSchema,
  image: z.string().min(1),
  command: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  ports: z.array(z.string()).optional(),
  volumes: z.array(z.string()).optional(),
  dependsOn: z.array(z.string()).optional(),
  healthcheck: z
    .object({
      test: z.union([z.string(), z.array(z.string())]),
      interval: z.string().optional(),
      timeout: z.string().optional(),
      retries: z.number().int().positive().optional(),
    })
    .optional(),
  restart: z
    .enum(['no', 'always', 'on-failure', 'unless-stopped'])
    .default('unless-stopped'),
});

export const healthCheckSpecSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['http', 'tcp', 'command']),
  target: z.string().min(1),
  intervalSeconds: z.number().int().positive().default(30),
});

export type Id = z.infer<typeof idSchema>;
export type ServiceSpec = z.infer<typeof serviceSpecSchema>;
export type HealthCheckSpec = z.infer<typeof healthCheckSpecSchema>;
